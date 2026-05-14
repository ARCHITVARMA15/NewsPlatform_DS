// ── Datastraw Sidebar Content Script ─────────────────────────────────────
// Injected on every page. Listens for OPEN_SIDEBAR messages from popup.

(function () {
  'use strict';

  let sidebar = null;

  // ── Message listener ──────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'OPEN_SIDEBAR') {
      openSidebar(msg.url, msg.apiUrl);
      sendResponse({ ok: true });
    }
  });

  // ── Open / show sidebar ───────────────────────────────────────────────
  async function openSidebar(url, apiUrl) {
    if (!sidebar) {
      sidebar = createSidebarElement(url);
      document.body.appendChild(sidebar);
    } else {
      // Update URL label for new analysis
      const urlEl = sidebar.querySelector('.ds-header-url');
      if (urlEl) urlEl.textContent = truncateUrl(url);
      showLoading();
    }

    // Slide in
    requestAnimationFrame(() => sidebar.classList.add('ds-open'));

    // Fetch analysis
    await fetchAndRender(url, apiUrl);
  }

  // ── Create sidebar DOM ────────────────────────────────────────────────
  function createSidebarElement(url) {
    const el = document.createElement('div');
    el.id = 'datastraw-sidebar';

    el.innerHTML = `
      <div class="ds-header">
        <div class="ds-logo">⚡</div>
        <div class="ds-header-text">
          <h2>Datastraw · AI Analysis</h2>
          <div class="ds-header-url">${truncateUrl(url)}</div>
        </div>
        <button class="ds-close-btn" id="ds-close" title="Close">✕</button>
      </div>
      <div class="ds-content" id="ds-content">
        ${loadingHTML()}
      </div>
    `;

    el.querySelector('#ds-close').addEventListener('click', () => {
      sidebar.classList.remove('ds-open');
    });

    return el;
  }

  // ── Loading HTML ──────────────────────────────────────────────────────
  function loadingHTML() {
    return `
      <div class="ds-loading">
        <div class="ds-loading-text">✨ Analyzing article with Groq LLaMA…</div>
        <div class="ds-skeleton ds-skel-block"></div>
        <div class="ds-skeleton ds-skel-line" style="width:70%"></div>
        <div class="ds-skeleton ds-skel-line" style="width:90%"></div>
        <div class="ds-skeleton ds-skel-block" style="height:40px"></div>
        <div class="ds-skeleton ds-skel-line" style="width:55%"></div>
        <div class="ds-skeleton ds-skel-line" style="width:80%"></div>
        <div class="ds-skeleton ds-skel-line" style="width:65%"></div>
        <div class="ds-skeleton ds-skel-block" style="height:32px"></div>
      </div>
    `;
  }

  function showLoading() {
    const content = document.getElementById('ds-content');
    if (content) content.innerHTML = loadingHTML();
  }

  // ── Fetch analysis via background service worker ─────────────────────
  // (avoids mixed-content blocking on HTTPS pages fetching HTTP localhost)
  async function fetchAndRender(url, apiUrl) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'FETCH_ANALYZE', url, apiUrl },
        (response) => {
          if (chrome.runtime.lastError) {
            renderError('Extension error: ' + chrome.runtime.lastError.message);
          } else if (!response || !response.ok) {
            renderError(response?.error || 'Analysis failed');
          } else {
            renderResults(response.data);
          }
          resolve();
        }
      );
    });
  }

  // ── Render results ────────────────────────────────────────────────────
  function renderResults(data) {
    const content = document.getElementById('ds-content');
    if (!content) return;

    const sentiment     = (data.sentiment || 'neutral').toLowerCase();
    const sentimentEmoji = sentiment === 'positive' ? '😊'
                        : sentiment === 'negative'  ? '😟' : '😐';
    const scoreRaw      = parseFloat(data.sentiment_score) || 0;
    const scoreAbs      = Math.abs(scoreRaw);
    const scorePct      = Math.round(scoreAbs * 100);

    const insights = Array.isArray(data.insights) ? data.insights : [];
    const entities  = Array.isArray(data.key_entities) ? data.key_entities : [];

    const insightItems = insights.map((ins, i) => `
      <li class="ds-insight-item">
        <span class="ds-insight-num">${String(i + 1).padStart(2, '0')}</span>
        <span>${escHtml(ins)}</span>
      </li>
    `).join('');

    const entityPills = entities.map(e =>
      `<span class="ds-entity-pill">${escHtml(e)}</span>`
    ).join('');

    const biasSection = (data.bias_score !== null && data.bias_score !== undefined)
      ? buildBiasSection(data.bias_score, data.bias_label)
      : '';

    content.innerHTML = `
      <!-- Summary -->
      <div class="ds-section">
        <div class="ds-section-label">Summary</div>
        <div class="ds-summary-box">${escHtml(data.summary || 'No summary available.')}</div>
      </div>

      <!-- Sentiment -->
      <div class="ds-section">
        <div class="ds-section-label">Sentiment</div>
        <div class="ds-sentiment-row">
          <div class="ds-sentiment-emoji">${sentimentEmoji}</div>
          <div class="ds-sentiment-info">
            <div class="ds-sentiment-label ${sentiment}">${capitalize(sentiment)}</div>
            <div class="ds-score-track">
              <div class="ds-score-fill ${sentiment}" style="width:${scorePct}%"></div>
            </div>
            <div class="ds-score-num">Score: ${scoreRaw.toFixed(2)}</div>
          </div>
        </div>
      </div>

      <!-- Category -->
      <div class="ds-section">
        <div class="ds-section-label">Category</div>
        <span class="ds-category-badge">${escHtml(data.category || 'OTHER')}</span>
      </div>

      <!-- Key Insights -->
      ${insights.length > 0 ? `
      <div class="ds-section">
        <div class="ds-section-label">Key Insights</div>
        <ul class="ds-insight-list">${insightItems}</ul>
      </div>` : ''}

      <!-- Bias meter -->
      ${biasSection}

      <!-- Entities -->
      ${entities.length > 0 ? `
      <div class="ds-section">
        <div class="ds-section-label">Key Entities</div>
        <div class="ds-entity-pills">${entityPills}</div>
      </div>` : ''}

      <!-- Open in Datastraw CTA -->
      <div class="ds-section">
        <button class="ds-cta" id="ds-open-app">
          🚀 Open in Datastraw Dashboard
        </button>
      </div>
    `;

    document.getElementById('ds-open-app').addEventListener('click', () => {
      const encoded = encodeURIComponent(data.url || '');
      window.open(`http://localhost:3000/dashboard?article=${encoded}`, '_blank');
    });
  }

  // ── Bias section builder ──────────────────────────────────────────────
  function buildBiasSection(score, label) {
    // score: -1.0 (far left) → 1.0 (far right)
    // map to 0–100% for CSS left position
    const pct = Math.round(((parseFloat(score) + 1) / 2) * 100);
    return `
      <div class="ds-section">
        <div class="ds-section-label">Political Bias</div>
        <div class="ds-bias-track">
          <div class="ds-bias-dot" style="left:${pct}%"></div>
        </div>
        <div class="ds-bias-labels">
          <span>Left</span>
          <span>Center</span>
          <span>Right</span>
        </div>
        ${label ? `<div class="ds-bias-label-center">${escHtml(label)}</div>` : ''}
      </div>
    `;
  }

  // ── Error state ───────────────────────────────────────────────────────
  function renderError(message) {
    const content = document.getElementById('ds-content');
    if (!content) return;
    content.innerHTML = `
      <div class="ds-error">
        <strong>⚠ Analysis Failed</strong>
        <p>${escHtml(message)}</p>
        <p style="margin-top:10px;font-size:11px">
          Make sure the Datastraw backend is running at the configured API URL.
        </p>
      </div>
    `;
  }

  // ── Utility ───────────────────────────────────────────────────────────
  function truncateUrl(url) {
    try {
      const parsed = new URL(url);
      const display = parsed.hostname + parsed.pathname;
      return display.length > 50 ? display.substring(0, 50) + '…' : display;
    } catch {
      return url.length > 50 ? url.substring(0, 50) + '…' : url;
    }
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
})();
