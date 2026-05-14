# Datastraw News Analyzer — Chrome Extension

AI-powered news analysis on any webpage, powered by your local Datastraw backend.

---

## Loading in Chrome (Developer Mode)

1. Open `chrome://extensions/` in Chrome
2. Enable **Developer mode** (toggle — top right corner)
3. Click **Load unpacked**
4. Select the `/chrome-extension/` folder (this directory)
5. The ⚡ Datastraw icon appears in your Chrome toolbar

> If you don't see the icon, click the puzzle-piece icon in the toolbar and pin Datastraw.

---

## Usage

1. Navigate to any news article page
2. Click the ⚡ **Datastraw** icon in the toolbar
3. Verify the API URL is correct (default: `http://localhost:8000`)
4. Click **Analyze This Article**
5. A sidebar slides in from the right with:
   - 📝 **Summary** — 2-sentence AI summary
   - 😊 **Sentiment** — positive/negative/neutral with score bar
   - 🏷 **Category** — article topic category
   - 💡 **Key Insights** — 3–5 numbered analysis points
   - ⚖️ **Political Bias** — left/center/right spectrum meter
   - 🏷 **Key Entities** — people, orgs, locations mentioned
   - 🚀 **Open in Dashboard** — launch full Datastraw app

---

## Settings

In the popup, click **Settings** to change the backend API URL.  
Default: `http://localhost:8000`

For a deployed backend, enter your production URL (e.g. `https://api.yourdomain.com`).

---

## Icons

The `icons/` directory needs three PNG files:

| File           | Size     |
|----------------|----------|
| `icon16.png`   | 16×16 px |
| `icon48.png`   | 48×48 px |
| `icon128.png`  | 128×128 px |

Placeholder blue-square PNGs are included. Replace with actual Datastraw branding for production.

---

## Backend Requirement

The extension calls `POST /api/pipeline/analyze-url` on your Datastraw backend.  
Make sure the backend is running before clicking Analyze.

```bash
# Start backend
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

---

## Limitations

- Pages that heavily use JavaScript rendering (SPAs without SSR) may not extract well
- Some news sites block scraping — you'll see a "Could not extract article" error
- `chrome://` and `chrome-extension://` pages cannot be analyzed
