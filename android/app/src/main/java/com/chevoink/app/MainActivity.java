package com.chevoink.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebView;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

/**
 * 主 Activity：Capacitor 远程壳 + 番茄式断网兜底。
 * - WebView 主文档加载失败（飞行模式/断网）时盖一层原生离线页（插画+重试），不再露出系统错误页；
 * - 注册网络回调：恢复联网后自动重载站点，无需用户手动点；
 * - 离线页上的「重试」按钮手动触发一次重载。
 */
public class MainActivity extends BridgeActivity {
    private View offlineOverlay;
    /** 是否处于离线兜底态（避免联网瞬间重复 reload） */
    private boolean offlineShown = false;
    private ConnectivityManager.NetworkCallback networkCallback;
    private BroadcastReceiver legacyNetworkReceiver;

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

        setupOfflineFallback();
    }

    /** 断网兜底：接管 WebView 加载失败 + 联网自动恢复 */
    private void setupOfflineFallback() {
        final WebView webView = getBridge().getWebView();
        if (webView == null) return;

        // 离线覆盖层挂在 WebView 的父布局上（activity_main 的根是 CoordinatorLayout）
        android.view.ViewGroup parent = (android.view.ViewGroup) webView.getParent();
        offlineOverlay = getLayoutInflater().inflate(R.layout.layout_offline, parent, false);
        parent.addView(offlineOverlay);
        offlineOverlay.setVisibility(View.GONE);
        offlineOverlay.findViewById(R.id.offlineRetry).setOnClickListener(v -> reloadSite());

        // 加载失败接管：主文档失败才出离线页（子资源失败不打断已加载内容）
        webView.setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                String currentUrl = view.getUrl();
                boolean mainDocument = failingUrl != null && failingUrl.equals(currentUrl);
                if (mainDocument) {
                    showOffline();
                    return;
                }
                super.onReceivedError(view, errorCode, description, failingUrl);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // 站点成功加载：收起离线页（含联网自动重载后的恢复）
                hideOffline();
            }
        });

        registerNetworkRecovery();
    }

    /** 联网恢复监听：断网态下网络一恢复就自动重载站点 */
    private void registerNetworkRecovery() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            networkCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    runOnUiThread(() -> {
                        if (offlineShown) reloadSite();
                    });
                }
            };
            cm.registerNetworkCallback(
                    new NetworkRequest.Builder()
                            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                            .build(),
                    networkCallback);
        } else {
            // Android 6 以下：走老式广播
            legacyNetworkReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    if (isOnline() && offlineShown) reloadSite();
                }
            };
            registerReceiver(legacyNetworkReceiver,
                    new IntentFilter(ConnectivityManager.CONNECTIVITY_ACTION));
        }
    }

    private boolean isOnline() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            NetworkCapabilities caps = cm.getNetworkCapabilities(cm.getActiveNetwork());
            return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        }
        android.net.NetworkInfo info = cm.getActiveNetworkInfo();
        return info != null && info.isConnected();
    }

    private void showOffline() {
        offlineShown = true;
        if (offlineOverlay != null) offlineOverlay.setVisibility(View.VISIBLE);
    }

    private void hideOffline() {
        offlineShown = false;
        if (offlineOverlay != null) offlineOverlay.setVisibility(View.GONE);
    }

    /** 手动/自动重试：有网则重载站点，无网保持离线页 */
    private void reloadSite() {
        if (!isOnline()) {
            showOffline();
            return;
        }
        WebView webView = getBridge().getWebView();
        if (webView != null) webView.reload();
    }

    @Override
    public void onPause() {
        super.onPause();
        // WebView CookieManager 懒刷盘：退到后台立即落盘，防止杀进程丢登录会话 cookie
        CookieManager.getInstance().flush();
    }

    @Override
    public void onDestroy() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm != null && networkCallback != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            cm.unregisterNetworkCallback(networkCallback);
        }
        if (legacyNetworkReceiver != null) {
            unregisterReceiver(legacyNetworkReceiver);
        }
        super.onDestroy();
    }
}