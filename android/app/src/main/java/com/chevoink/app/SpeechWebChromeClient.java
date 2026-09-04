package com.chevoink.app;

import android.webkit.PermissionRequest;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

/** Keep Capacitor's runtime permission prompt, but never grant capture to arbitrary origins/resources. */
final class SpeechWebChromeClient extends BridgeWebChromeClient {
    private final Bridge bridge;

    SpeechWebChromeClient(Bridge bridge) { super(bridge); this.bridge = bridge; }

    @Override public void onPermissionRequest(PermissionRequest request) {
        if (!ChevoinkSpeechPlugin.trustedOrigin(request.getOrigin().toString())
                || !ChevoinkSpeechPlugin.trustedOrigin(bridge.getWebView().getUrl())) {
            request.deny();
            return;
        }
        String[] resources = request.getResources();
        if (resources.length != 1 || !PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resources[0])) {
            request.deny();
            return;
        }
        super.onPermissionRequest(request);
    }
}
