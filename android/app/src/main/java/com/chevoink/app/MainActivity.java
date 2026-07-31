package com.chevoink.app;

import android.os.Bundle;
import android.webkit.CookieManager;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 阅读区全屏沉浸自定义插件（官方 StatusBar 的 overlay 在 Android 15+ 失效，见插件注释）；
        // 必须在 super.onCreate 之前注册，Bridge 初始化时才能收进插件表
        registerPlugin(ImmersiveModePlugin.class);
        super.onCreate(savedInstanceState);
        // 阅读区要全屏沉浸（StatusBar.hide()）。系统默认行为是「任意触摸即恢复系统栏」，
        // 翻页时的每一次点按都会把状态栏拽回来，而临时恢复出来的状态栏自带黑色蒙层且忽略
        // 一切颜色设置——这就是阅读页顶部出现黑带的原因。改成「上滑才临时显示」后隐藏才稳定。
        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    @Override
    public void onPause() {
        super.onPause();
        // WebView CookieManager 懒刷盘：退到后台立即落盘，防止杀进程丢登录会话 cookie
        CookieManager.getInstance().flush();
    }
}
