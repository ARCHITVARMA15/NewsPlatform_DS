document.addEventListener('DOMContentLoaded', async () => {
  // ── Load saved settings ────────────────────────────────────────────────
  const { apiUrl } = await chrome.storage.local.get({ apiUrl: 'http://localhost:8000' });
  document.getElementById('api-url').value = apiUrl;

  // ── Show current tab URL ───────────────────────────────────────────────
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const urlDisplay = document.getElementById('current-url');
  if (tab && tab.url) {
    urlDisplay.textContent = tab.url.length > 80
      ? tab.url.substring(0, 80) + '…'
      : tab.url;
  } else {
    urlDisplay.textContent = 'No URL detected';
  }

  // ── Connection check ───────────────────────────────────────────────────
  checkConnection(apiUrl);

  // ── Settings accordion ─────────────────────────────────────────────────
  const toggle = document.getElementById('settings-toggle');
  const panel  = document.getElementById('settings-panel');
  toggle.addEventListener('click', () => {
    const isOpen = panel.classList.toggle('visible');
    toggle.classList.toggle('open', isOpen);
  });

  // ── Save settings ──────────────────────────────────────────────────────
  document.getElementById('save-settings').addEventListener('click', async () => {
    const newUrl = document.getElementById('api-url').value.trim();
    if (!newUrl) { showStatus('Enter a valid URL', 'error'); return; }
    await chrome.storage.local.set({ apiUrl: newUrl });
    showStatus('Settings saved!', 'success');
    checkConnection(newUrl);
  });

  // ── Analyze button ─────────────────────────────────────────────────────
  document.getElementById('analyze-btn').addEventListener('click', async () => {
    if (!tab || !tab.id) { showStatus('No active tab found', 'error'); return; }
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      showStatus('Cannot analyze browser pages', 'error');
      return;
    }

    const btn = document.getElementById('analyze-btn');
    btn.textContent = '⏳ Analyzing…';
    btn.disabled = true;

    const currentApiUrl = document.getElementById('api-url').value.trim() || apiUrl;

    try {
      await chrome.tabs.sendMessage(tab.id, {
        action: 'OPEN_SIDEBAR',
        url: tab.url,
        apiUrl: currentApiUrl,
      });
      window.close();
    } catch (err) {
      // Content script may not be injected yet on some pages — inject it first
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js'],
        });
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['sidebar.css'],
        });
        // Small delay then retry
        await new Promise(r => setTimeout(r, 300));
        await chrome.tabs.sendMessage(tab.id, {
          action: 'OPEN_SIDEBAR',
          url: tab.url,
          apiUrl: currentApiUrl,
        });
        window.close();
      } catch (e) {
        btn.textContent = '⚡ Analyze This Article';
        btn.disabled = false;
        showStatus('Failed to inject. Try reloading the page.', 'error');
      }
    }
  });
});

// ── Helpers ─────────────────────────────────────────────────────────────────
async function checkConnection(apiUrl) {
  const dot   = document.getElementById('conn-dot');
  const label = document.getElementById('conn-label');
  try {
    const res = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      dot.classList.add('connected');
      label.textContent = 'connected';
    } else {
      throw new Error();
    }
  } catch {
    dot.classList.remove('connected');
    label.textContent = 'offline';
  }
}

function showStatus(msg, type) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = type;
  setTimeout(() => { el.textContent = ''; el.className = ''; }, 2500);
}
