// Split-screen / floating-window detection for phones and tablets.
//
// A browser cannot turn split-screen off, but it can see the page's window shrink.
// In split-screen (Android) or Split View / Slide Over (iPad) the layout viewport
// becomes a fraction of the physical screen, so we compare the two.
//
// The on-screen keyboard is NOT split-screen: modern mobile Chrome/Safari shrink only
// the visual viewport for it, and we also ignore shrinks while a text field is focused.

export const isTouchDevice = () =>
  typeof window !== 'undefined' &&
  (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) &&
  window.matchMedia?.('(pointer: coarse)').matches;

const typingNow = () => {
  const el = document.activeElement;
  if (!el) return false;
  return Boolean(el.closest?.('input, textarea, [contenteditable="true"], .monaco-editor'));
};

/** True when a touch device is running the page in a reduced window. */
export function isSplitScreen() {
  if (!isTouchDevice() || !window.screen) return false;
  if (typingNow()) return false;
  // screen.width/height don't rotate on every browser, so compare long side to long side.
  const sLong = Math.max(window.screen.width, window.screen.height);
  const sShort = Math.min(window.screen.width, window.screen.height);
  const portrait = window.innerHeight >= window.innerWidth;
  const screenW = portrait ? sShort : sLong;
  const screenH = portrait ? sLong : sShort;
  if (!screenW || !screenH) return false;
  const wRatio = window.innerWidth / screenW;
  const hRatio = window.innerHeight / screenH;
  // Browser toolbars + status bar take up to ~25% of the height on small phones,
  // so the height threshold is loose; split-screen usually halves one side.
  return wRatio < 0.8 || hRatio < 0.6;
}

/**
 * Calls onChange(boolean) whenever split-screen state flips. Returns stop().
 */
export function watchSplitScreen(onChange) {
  if (!isTouchDevice()) return () => {};
  let last = isSplitScreen();
  onChange(last);
  let raf = 0;
  const check = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const now = isSplitScreen();
      if (now !== last) {
        last = now;
        onChange(now);
      }
    });
  };
  window.addEventListener('resize', check);
  window.addEventListener('orientationchange', check);
  window.visualViewport?.addEventListener('resize', check);
  document.addEventListener('focusout', check);
  const poll = setInterval(check, 1500); // some Android builds skip resize on split entry
  return () => {
    cancelAnimationFrame(raf);
    clearInterval(poll);
    window.removeEventListener('resize', check);
    window.removeEventListener('orientationchange', check);
    window.visualViewport?.removeEventListener('resize', check);
    document.removeEventListener('focusout', check);
  };
}
