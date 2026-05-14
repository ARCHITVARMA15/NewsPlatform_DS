// Service worker — handles fetch proxying for content scripts
// (content scripts on HTTPS pages cannot fetch HTTP localhost directly)

chrome.runtime.onInstalled.addListener(() => {
  console.log('Datastraw Analyzer installed');
  chrome.storage.local.set({ apiUrl: 'http://localhost:8000' });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'FETCH_ANALYZE') {
    (async () => {
      try {
        const res = await fetch(`${msg.apiUrl}/api/pipeline/analyze-url`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ url: msg.url, include_bias: true }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
          sendResponse({ ok: false, error: err.detail || `Server error ${res.status}` });
        } else {
          const data = await res.json();
          sendResponse({ ok: true, data });
        }
      } catch (e) {
        sendResponse({ ok: false, error: e.message || 'Fetch failed' });
      }
    })();
    return true; // keep message channel open for async response
  }

  if (msg.action === 'CHECK_HEALTH') {
    (async () => {
      try {
        const res = await fetch(`${msg.apiUrl}/health`, { signal: AbortSignal.timeout(3000) });
        sendResponse({ ok: res.ok });
      } catch {
        sendResponse({ ok: false });
      }
    })();
    return true;
  }
});
