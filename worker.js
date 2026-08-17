/**
 * Alisha RSVP relay
 *
 * The invitation is hosted on GitHub Pages, which is static and cannot
 * receive a form POST. This Worker sits in between: the page posts a
 * reply here, and this files it into your GitHub repo using a token that
 * only ever exists server-side. Guests need no account of any kind.
 *
 * Each RSVP is written two ways:
 *   1. as a GitHub Issue, labelled "rsvp"  — easy to read and tick off
 *   2. appended to rsvps.csv in the repo   — easy to open in a spreadsheet
 *
 * Secrets (set with `wrangler secret put`, never in this file):
 *   GITHUB_TOKEN  fine-grained PAT, repo-scoped, Contents + Issues: write
 *
 * Vars (set in wrangler.toml):
 *   REPO          "yourname/alisha-invitation"
 *   ALLOW_ORIGIN  "https://yourname.github.io"
 */

const CSV_PATH = 'rsvps.csv';

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST')
      return json({ error: 'POST only' }, 405, cors);

    let data;
    try {
      data = await request.json();
    } catch {
      return json({ error: 'bad json' }, 400, cors);
    }

    // ---- validate and clamp, so a bot can't write arbitrary junk ----
    const attending = data.attending === 'Yes' ? 'Yes' : 'No';
    const guests = String(data.guests ?? '0').slice(0, 4);
    const message = String(data.message ?? '').slice(0, 800);
    const event = String(data.event ?? '').slice(0, 200);
    const when = new Date().toISOString();

    if (message.length > 800) return json({ error: 'too long' }, 400, cors);

    const gh = (path, init = {}) =>
      fetch(`https://api.github.com/repos/${env.REPO}/${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'alisha-rsvp-worker',
          'Content-Type': 'application/json',
          ...(init.headers || {}),
        },
      });

    const results = { issue: false, csv: false };

    // ---- 1. an issue, one per reply ----
    try {
      const bodyLines = [
        `**Attending:** ${attending}`,
        attending === 'Yes' ? `**Guests:** ${guests}` : null,
        message ? `**Message:**\n\n> ${message.replace(/\n/g, '\n> ')}` : null,
        '',
        `_Received ${when}_`,
      ].filter(Boolean);

      const r = await gh('issues', {
        method: 'POST',
        body: JSON.stringify({
          title: `RSVP — ${attending}${attending === 'Yes' ? ` (${guests})` : ''}`,
          body: bodyLines.join('\n'),
          labels: ['rsvp'],
        }),
      });
      results.issue = r.ok;
    } catch { /* fall through to the csv */ }

    // ---- 2. append to a csv, so the whole list opens in a spreadsheet ----
    try {
      const cell = (v) => `"${String(v).replace(/"/g, '""')}"`;
      const row = [cell(when), cell(attending), cell(guests), cell(message), cell(event)].join(',') + '\n';

      const existing = await gh(`contents/${CSV_PATH}`);
      let sha, content;

      if (existing.ok) {
        const file = await existing.json();
        sha = file.sha;
        content = atob(file.content.replace(/\n/g, '')) + row;
      } else {
        content = 'received,attending,guests,message,event\n' + row;
      }

      const put = await gh(`contents/${CSV_PATH}`, {
        method: 'PUT',
        body: JSON.stringify({
          message: `RSVP: ${attending}${attending === 'Yes' ? ` (${guests})` : ''}`,
          content: btoa(unescape(encodeURIComponent(content))),
          ...(sha ? { sha } : {}),
        }),
      });
      results.csv = put.ok;
    } catch { /* the issue may still have gone through */ }

    if (!results.issue && !results.csv)
      return json({ error: 'could not file rsvp' }, 502, cors);

    return json({ ok: true, ...results }, 200, cors);
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}
