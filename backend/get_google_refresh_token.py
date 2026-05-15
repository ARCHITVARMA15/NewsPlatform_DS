"""
One-time script to obtain a Google OAuth2 refresh token for Drive access.

Run once:
    python get_google_refresh_token.py

It will open your browser for consent, then print the refresh token.
Add the token to your .env as GOOGLE_REFRESH_TOKEN=...

DELETE this file after you have saved the token.
"""
import os
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

from google_auth_oauthlib.flow import Flow

CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID", "")
CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")

if not CLIENT_ID or not CLIENT_SECRET:
    print("ERROR: Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET as env vars first:")
    print("  export GOOGLE_CLIENT_ID=your_client_id")
    print("  export GOOGLE_CLIENT_SECRET=your_client_secret")
    raise SystemExit(1)

SCOPES       = ["https://www.googleapis.com/auth/drive.readonly"]
REDIRECT_URI = "http://localhost:8080/"

client_config = {
    "web": {
        "client_id":     CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "auth_uri":      "https://accounts.google.com/o/oauth2/auth",
        "token_uri":     "https://oauth2.googleapis.com/token",
        "redirect_uris": [REDIRECT_URI],
    }
}

flow = Flow.from_client_config(client_config, scopes=SCOPES, redirect_uri=REDIRECT_URI)
auth_url, _ = flow.authorization_url(access_type="offline", prompt="consent")

print("\n── Step 1: Opening browser for Google consent ──────────────────")
print(f"If browser does not open, paste this URL manually:\n{auth_url}\n")
webbrowser.open(auth_url)

# ── Capture the redirect with a tiny local server ─────────────────────────
auth_code = None

class _Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        global auth_code
        params   = parse_qs(urlparse(self.path).query)
        auth_code = params.get("code", [None])[0]
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"<h2>Auth complete! You can close this tab.</h2>")

    def log_message(self, *args):
        pass  # silence request logs

print("── Step 2: Waiting for Google to redirect back …")
server = HTTPServer(("localhost", 8080), _Handler)
server.handle_request()  # handles exactly one request then exits

if not auth_code:
    print("ERROR: Did not receive auth code. Try again.")
    raise SystemExit(1)

# ── Exchange code for tokens ───────────────────────────────────────────────
flow.fetch_token(code=auth_code)
creds = flow.credentials

print("\n" + "="*60)
print("✅  SUCCESS — add this to your backend/.env:")
print("="*60)
print(f"\nGOOGLE_CLIENT_ID={CLIENT_ID}")
print(f"GOOGLE_CLIENT_SECRET={CLIENT_SECRET}")
print(f"GOOGLE_REFRESH_TOKEN={creds.refresh_token}")
print("\n" + "="*60)
print("Then DELETE this file (get_google_refresh_token.py).")
