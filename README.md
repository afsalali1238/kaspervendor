# Kasper Vendor Registration (Logistics)

Hosted on Vercel (static site, no build step).

- `index.html` — the form, served by Vercel. Submissions are POSTed to the Apps Script web app set in `ENDPOINT`.
- `apps-script/Code.gs` — Google Sheets backend (writes rows, saves uploads to Drive).
- `apps-script/Index.html` — same form, for serving directly from Apps Script (optional).

## Connect to Google Sheets
1. New Google Sheet → Extensions → Apps Script → paste `apps-script/Code.gs`.
2. Run `setup()` once and approve permissions.
3. Deploy → New deployment → Web app → Execute as **Me**, access **Anyone** → copy the `/exec` URL.
4. In `index.html`, set `var ENDPOINT = '<your /exec URL>';` and commit.

When you change `Code.gs`, use Deploy → Manage deployments → Edit → New version (keeps the same URL).

## Deploy on Vercel
1. vercel.com → Add New → Project → import `afsalali1238/kaspervendor`.
2. Framework preset: **Other**. Leave build command and output directory empty. Deploy.
3. Every push to `main` redeploys automatically.
4. Optional: Project → Settings → Domains → add e.g. `vendors.yourdomain.com`.
