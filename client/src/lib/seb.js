// Safe Exam Browser helpers. SEB exposes window.SafeExamBrowser.security.configKey
// (= SHA256(pageUrl + ConfigKey)) in recent versions. We forward it to the API on every
// request so the server can verify the browser even for XHR calls.

let cached = { pageUrl: '', hash: '' };

export function isSebUserAgent() {
  return /\bSEB\b|SafeExamBrowser/i.test(navigator.userAgent || '');
}

export function refreshSebKeys() {
  return new Promise((resolve) => {
    const seb = window.SafeExamBrowser;
    if (!seb?.security) return resolve(cached);
    const read = () => {
      cached = { pageUrl: window.location.href.split('#')[0], hash: seb.security.configKey || '' };
      resolve(cached);
    };
    try {
      if (typeof seb.security.updateKeys === 'function') seb.security.updateKeys(read);
      else read();
    } catch {
      read();
    }
    setTimeout(read, 1500); // never hang if the callback is not fired
  });
}

export function sebHeaders() {
  const seb = window.SafeExamBrowser;
  if (!seb?.security) return {};
  const pageUrl = window.location.href.split('#')[0];
  // configKey is tied to the current page URL; after SPA navigation re-read it.
  if (cached.pageUrl !== pageUrl) {
    cached = { pageUrl, hash: seb.security.configKey || '' };
    refreshSebKeys();
  }
  return cached.hash ? { 'X-SEB-Page-Url': cached.pageUrl, 'X-SEB-Page-Hash': cached.hash } : {};
}
