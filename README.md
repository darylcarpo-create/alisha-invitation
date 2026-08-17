# RSVP relay — setup (about 5 minutes)

Guests press **Send my RSVP** and it lands in your GitHub repo. They need no
account, no app, nothing installed.

## Why this exists

GitHub Pages is a static host. It serves files; it cannot receive a form
submission. And a GitHub token can't live in `index.html` — the page is public,
and GitHub's secret scanning would revoke a leaked token within minutes anyway.

So a small free relay sits in between and holds the token server-side.
Cloudflare's free tier covers 100,000 requests a day; an invitation will use a
few dozen. No card required.

## 1. Make a GitHub token

<https://github.com/settings/personal-access-tokens/new>

- **Token name:** `alisha-rsvp`
- **Expiration:** a month past the party
- **Repository access:** Only select repositories → `alisha-invitation`
- **Permissions → Repository permissions:**
  - Contents → **Read and write**
  - Issues → **Read and write**

Generate it and copy the token. You only see it once.

## 2. Deploy the Worker

Two ways — pick either. **A** needs nothing installed and happens entirely in a
browser. **B** is faster if you already live in a terminal.

### A. In the browser (no install)

1. Sign up / log in at <https://dash.cloudflare.com> (free, no card).
2. Left sidebar → **Workers & Pages** → **Create** → **Start with Hello World!**
   → name it `alisha-rsvp` → **Deploy**.
3. Click **Edit code**. Delete everything in the editor, paste the entire
   contents of `worker.js` from this folder, then **Deploy**.
4. Back on the Worker page → **Settings** → **Variables and Secrets**:
   - **Add variable** → `REPO` = `darylcarpo-create/alisha-invitation`
   - **Add variable** → `ALLOW_ORIGIN` = `https://darylcarpo-create.github.io`
   - **Add secret** → `GITHUB_TOKEN` = the token from step 1
   - **Deploy** to save.
5. The URL is on the Worker's overview page, like
   `https://alisha-rsvp.yourname.workers.dev`.

Note: with this route the values from `wrangler.toml` are typed into the
dashboard instead — the file is only used by route B.

### B. From a terminal

Run these on your **laptop** (not on the server, not in the GitHub web UI), in
the folder where you unzipped these files — the same folder holding
`worker.js` and `wrangler.toml`. Requires Node.js 18+; check with `node -v`,
and install from <https://nodejs.org> if that errors.

```bash
cd ~/alisha-invitation/rsvp-worker    # wherever worker.js lives
npm install -g wrangler
wrangler login                        # opens a browser to authorise
```

Check `wrangler.toml` — `REPO` and `ALLOW_ORIGIN` should already match your
setup. `ALLOW_ORIGIN` must be the exact origin the invitation is served from,
with no trailing slash.

```bash
wrangler secret put GITHUB_TOKEN      # paste the token from step 1
wrangler deploy
```

It prints your URL, something like:

```
https://alisha-rsvp.yourname.workers.dev
```

## 3. Point the invitation at it

In `index.html`, in the CONFIG block near the top:

```js
rsvpEndpoint : "https://alisha-rsvp.yourname.workers.dev",
```

Then:

```bash
git add -A && git commit -m "connect rsvp relay" && git push
```

## 4. Test it

Open the live invitation, send yourself an RSVP, and check:

- **Issues tab** → a new issue labelled `rsvp`
- **`rsvps.csv`** in the repo root → a new row

Every reply is written both ways: issues are easy to read and tick off one by
one, the CSV opens in Excel or Sheets when you want the whole list at once.

## If something goes wrong

| Symptom | Cause |
|---|---|
| "That didn't go through" | `rsvpEndpoint` empty or misspelled |
| Works on desktop, fails on the live site | `ALLOW_ORIGIN` doesn't match exactly — check https vs http, no trailing slash |
| Worker returns 502 | Token expired, or missing Contents/Issues write permission |

Watch the Worker live while you test — in the dashboard, open the Worker and
click **Logs** → **Begin log stream**. From a terminal:

```bash
wrangler tail
```

## Afterwards

Once the party is over, revoke the token at
<https://github.com/settings/personal-access-tokens> and optionally
`wrangler delete` the Worker.
