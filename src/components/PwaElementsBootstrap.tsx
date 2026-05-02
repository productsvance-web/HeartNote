'use client';

import { useEffect } from 'react';

// Registers Ionic's PWA web components on the client. @capacitor/camera's
// web shim delegates to <ion-action-sheet> / <ion-alert> so it can offer
// "Camera vs Photos" prompts and crop affordances even outside a
// Capacitor WebView. Without this registration, the plugin silently
// degrades to a bare file input and ignores CameraSource.Camera.
//
// Renders nothing — its only effect is the side-effect of the dynamic
// import on first paint.

export function PwaElementsBootstrap() {
  useEffect(() => {
    let cancelled = false;
    void import('@ionic/pwa-elements/loader').then(({ defineCustomElements }) => {
      if (cancelled) return;
      defineCustomElements(window);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
