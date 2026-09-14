package com.quicknote.pro;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.graphics.Rect;
import android.view.ViewTreeObserver;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.util.AttributeSet;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.ActionMode;
import android.view.Menu;
import android.view.MenuItem;
import android.widget.Toast;

public class MainActivity extends Activity {

    private WebView webView;
    private ValueCallback<Uri[]> uploadMessage;
    private static final int REQ_CHOOSE_FILE = 1001;
    // H5 控制的原生菜单开关：粘贴助手弹窗打开时放行系统 ActionMode 菜单（文本框长按可粘贴），
    // 弹窗关闭时恢复清空（正文选区继续由 H5 自建浮层接管）
    private static volatile boolean nativeMenuAllowed = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        // 沉浸式：状态栏 / 导航栏透明，内容延伸到其下
        window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);
        } else {
            int ui = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
            window.getDecorView().setSystemUiVisibility(ui);
        }

        webView = new QWebView(this);
        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);          // localStorage / IndexedDB
        ws.setDatabaseEnabled(true);
        ws.setAllowFileAccess(true);
        ws.setAllowContentAccess(true);
        ws.setUseWideViewPort(true);
        ws.setLoadWithOverviewMode(true);
        ws.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        ws.setCacheMode(WebSettings.LOAD_NO_CACHE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ws.setAlgorithmicDarkeningAllowed(true);
        }
        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                injectSafeAreaVars();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return false;   // 离线应用，所有链接均在 WebView 内打开
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            // 让 <input type="file"> 在 WebView 内能调起系统文件选择器（图片/视频/附件）
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (uploadMessage != null) {
                    uploadMessage.onReceiveValue(null);
                    uploadMessage = null;
                }
                uploadMessage = filePathCallback;
                Intent intent = fileChooserParams.createIntent();
                try {
                    startActivityForResult(intent, REQ_CHOOSE_FILE);
                } catch (ActivityNotFoundException e) {
                    uploadMessage = null;
                    Toast.makeText(MainActivity.this, "无法打开文件选择器", Toast.LENGTH_SHORT).show();
                    return false;
                }
                return true;
            }
        });

        setContentView(webView);
        injectSafeAreaVars();
        attachKeyboardListener();
        webView.loadUrl("file:///android_asset/index.html");
    }

    // JS 桥：H5 切换主题时通知原生同步状态栏 / 导航栏图标深浅
    private class AndroidBridge {
        @JavascriptInterface
        public void setStatusBarLight(boolean lightBackground) {
            runOnUiThread(() -> applyBarAppearance(lightBackground));
        }

        @JavascriptInterface
        public double getStatusBarHeight() {
            return getTopInsetCss();
        }

        // JS 读取系统剪贴板文本：WebView file:// 下 navigator.clipboard 不可用（非安全上下文），
        // 用原生 ClipboardManager 静默读取（无权限弹窗），供粘贴助手「一键粘贴」使用
        @JavascriptInterface
        public String readClipboard() {
            try {
                android.content.ClipboardManager cm =
                        (android.content.ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm != null && cm.hasPrimaryClip() && cm.getPrimaryClip().getItemCount() > 0) {
                    CharSequence cs = cm.getPrimaryClip().getItemAt(0).coerceToText(getApplicationContext());
                    return cs != null ? cs.toString() : "";
                }
            } catch (Exception ignored) { }
            return "";
        }

        // H5 开关原生 ActionMode 菜单：粘贴助手弹窗打开期间放行，
        // 让弹窗内文本框长按能弹出系统粘贴菜单（否则被 menu.clear() 清空）
        @JavascriptInterface
        public void setNativeMenuEnabled(boolean enabled) {
            nativeMenuAllowed = enabled;
        }

        // JS 主动收起输入法：展开工具栏面板时调用，避免输入法收起动画过程中
        // --kbh 连续变化把面板拖得上下弹（面板开在终态位置，观感稳定）
        @JavascriptInterface
        public void hideKeyboard() {
            runOnUiThread(() -> {
                try {
                    android.view.inputmethod.InputMethodManager imm =
                            (android.view.inputmethod.InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
                    if (imm != null) {
                        View v = getCurrentFocus();
                        android.os.IBinder token = (v != null) ? v.getWindowToken() : webView.getWindowToken();
                        if (token != null) imm.hideSoftInputFromWindow(token, 0);
                    }
                } catch (Exception ignored) { }
            });
        }
    }

    // 返回状态栏高度的「设备像素」值（systemBars 顶部 inset 或 status_bar_height 资源）
    private int getTopInsetPx() {
        int px = 0;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsets insets = webView.getRootWindowInsets();
            if (insets != null) {
                px = insets.getInsets(WindowInsets.Type.systemBars()).top;
            }
        }
        if (px == 0) {
            int resId = getResources().getIdentifier("status_bar_height", "dimen", "android");
            if (resId > 0) px = getResources().getDimensionPixelSize(resId);
        }
        if (px == 0) px = Math.round(24f * getResources().getDisplayMetrics().density);
        return px;
    }

    // WebView 中 1 CSS px = density 设备像素；注入前必须换算，否则顶部留白被放大约 density 倍
    private double getTopInsetCss() {
        float density = getResources().getDisplayMetrics().density;
        if (density <= 0) density = 1f;
        int px = getTopInsetPx();
        double css = px / density;
        android.util.Log.d("QuickNote", "density=" + density + " rawInsetPx=" + px + " sbhCss=" + css);
        return css;
    }

    private void injectSafeAreaVars() {
        double top = getTopInsetCss();
        if (top > 0) {
            webView.evaluateJavascript(
                "document.documentElement.style.setProperty('--sbh','" + top + "px');",
                null
            );
        }
    }

    // 监听软键盘高度，把 CSS px 高度传给 H5，避免 WebView visualViewport 在沉浸式下失效
    private void attachKeyboardListener() {
        final View root = webView.getRootView();
        final float density = getResources().getDisplayMetrics().density;
        final float safeDensity = density > 0 ? density : 1f;
        root.getViewTreeObserver().addOnGlobalLayoutListener(new ViewTreeObserver.OnGlobalLayoutListener() {
            private int lastKbCss = -1;
            @Override
            public void onGlobalLayout() {
                Rect r = new Rect();
                root.getWindowVisibleDisplayFrame(r);
                int screenHeight = root.getHeight();
                int kbPx = Math.max(0, screenHeight - r.bottom);
                int kbCss = Math.round(kbPx / safeDensity);
                if (kbCss != lastKbCss) {
                    lastKbCss = kbCss;
                    android.util.Log.d("QuickNote", "keyboard px=" + kbPx + " css=" + kbCss);
                    webView.evaluateJavascript("window.onAndroidKeyboard(" + kbCss + ")", null);
                }
            }
        });
    }

    private void applyBarAppearance(boolean lightBackground) {
        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                        | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                int appearance = lightBackground ? 0 : mask;
                controller.setSystemBarsAppearance(appearance, mask);
            }
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            int flags = window.getDecorView().getSystemUiVisibility();
            if (lightBackground) {
                flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                }
            } else {
                flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                }
            }
            window.getDecorView().setSystemUiVisibility(flags);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) injectSafeAreaVars();
    }

    // 文件选择器返回结果，回调给 WebView 的 <input type="file">
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_CHOOSE_FILE) {
            if (uploadMessage == null) return;
            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK && data != null) {
                String dataString = data.getDataString();
                ClipData clipData = data.getClipData();
                if (clipData != null) {
                    results = new Uri[clipData.getItemCount()];
                    for (int i = 0; i < clipData.getItemCount(); i++) {
                        results[i] = clipData.getItemAt(i).getUri();
                    }
                } else if (dataString != null) {
                    results = new Uri[]{ Uri.parse(dataString) };
                }
            }
            uploadMessage.onReceiveValue(results);
            uploadMessage = null;
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    // 抑制系统文本选择 ActionMode 的原生菜单（复制/剪切/粘贴条），改由 H5 自建选区浮层接管；
    // 保留 ActionMode 活跃态以维持选区手柄，仅清空菜单项让原生条不可见（背景已在主题中设为透明兜底）。
    private static class QWebView extends WebView {
        public QWebView(Context context) { super(context); }
        public QWebView(Context context, AttributeSet attrs) { super(context, attrs); }
        @Override
        public ActionMode startActionMode(ActionMode.Callback callback, int type) {
            // nativeMenuAllowed=true（粘贴助手弹窗打开中）时不过滤，原生长按菜单正常弹出
            if (type == ActionMode.TYPE_FLOATING && !nativeMenuAllowed) {
                final ActionMode.Callback wrapped = callback;
                return super.startActionMode(new ActionMode.Callback2() {
                    @Override
                    public boolean onCreateActionMode(ActionMode mode, Menu menu) {
                        boolean r = wrapped.onCreateActionMode(mode, menu);
                        menu.clear();
                        return r;
                    }
                    @Override
                    public boolean onPrepareActionMode(ActionMode mode, Menu menu) {
                        boolean r = wrapped.onPrepareActionMode(mode, menu);
                        menu.clear();
                        return r;
                    }
                    @Override
                    public boolean onActionItemClicked(ActionMode mode, MenuItem item) {
                        return wrapped.onActionItemClicked(mode, item);
                    }
                    @Override
                    public void onDestroyActionMode(ActionMode mode) {
                        wrapped.onDestroyActionMode(mode);
                    }
                    @Override
                    public void onGetContentRect(ActionMode mode, View view, Rect outRect) {
                        if (wrapped instanceof ActionMode.Callback2) {
                            ((ActionMode.Callback2) wrapped).onGetContentRect(mode, view, outRect);
                        } else {
                            super.onGetContentRect(mode, view, outRect);
                        }
                    }
                }, type);
            }
            return super.startActionMode(callback, type);
        }
    }
}
