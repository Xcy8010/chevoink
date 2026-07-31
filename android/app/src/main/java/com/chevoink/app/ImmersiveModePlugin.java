package com.chevoink.app;

import android.os.Build;
import android.view.Window;
import android.view.WindowManager;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 阅读区全屏沉浸（方案 20）。
 *
 * 为什么不用官方 @capacitor/status-bar 的 setOverlaysWebView：它的实现基于
 * SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN 这套 legacy systemUiVisibility flag，
 * Android 15（targetSdk 35）起被系统忽略——真机实测 overlay 静默失败、只有
 * hide() 生效，状态栏区域露出无人绘制的窗口黑底。
 *
 * 这里改用现代 API WindowCompat.setDecorFitsSystemWindows(false)，它是显式
 * 窗口级调用，优先级高于主题里的 windowOptOutEdgeToEdgeEnforcement 默认行为，
 * 因此 styles.xml 一行不用改，其余页面（optOut + adjustResize + 键盘避让）零影响。
 */
@CapacitorPlugin(name = "ImmersiveMode")
public class ImmersiveModePlugin extends Plugin {

    @PluginMethod
    public void enter(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                Window window = getActivity().getWindow();
                float density = getActivity().getResources().getDisplayMetrics().density;
                // 先读系统栏 + 挖孔的 insets 再隐藏（隐藏后 getInsets 归零），
                // 换算成 CSS px 交给网页注入 --safe-top/--safe-bottom
                int top = 0;
                int bottom = 0;
                WindowInsetsCompat insetsCompat = ViewCompat.getRootWindowInsets(window.getDecorView());
                if (insetsCompat != null) {
                    Insets bars = insetsCompat.getInsets(
                            WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
                    top = Math.round(bars.top / density);
                    bottom = Math.round(bars.bottom / density);
                }

                // 挖孔屏：状态栏隐藏后默认 cutout 模式会在挖孔行留黑条，允许内容铺进短边挖孔区
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    WindowManager.LayoutParams attrs = window.getAttributes();
                    attrs.layoutInDisplayCutoutMode =
                            WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                    window.setAttributes(attrs);
                }

                WindowCompat.setDecorFitsSystemWindows(window, false);
                WindowInsetsControllerCompat controller =
                        WindowCompat.getInsetsController(window, window.getDecorView());
                // 上滑短暂显示系统栏（MainActivity 已设过，这里重申保证幂等）
                controller.setSystemBarsBehavior(
                        WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                controller.hide(WindowInsetsCompat.Type.systemBars());

                JSObject ret = new JSObject();
                ret.put("top", top);
                ret.put("bottom", bottom);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("enter immersive failed: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void exit(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                Window window = getActivity().getWindow();
                WindowInsetsControllerCompat controller =
                        WindowCompat.getInsetsController(window, window.getDecorView());
                controller.show(WindowInsetsCompat.Type.systemBars());
                WindowCompat.setDecorFitsSystemWindows(window, true);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    WindowManager.LayoutParams attrs = window.getAttributes();
                    attrs.layoutInDisplayCutoutMode =
                            WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT;
                    window.setAttributes(attrs);
                }
                call.resolve();
            } catch (Exception e) {
                call.reject("exit immersive failed: " + e.getMessage());
            }
        });
    }
}
