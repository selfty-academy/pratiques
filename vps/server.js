// Selfty · agenda perso fusionné (29/09/2026). Tourne sur le VPS de secours (systemd selfty-agenda, port 8711, derrière nginx).
// GET /agenda.ics?email=…&t=…  → flux .ics = pratiques de l'élève (lues sur le pont Apps Script, jeton vérifié par le pont)
//                                + tous les rendez-vous de l'école (flux public de selfty-agenda), fusionnés en un seul calendrier.
// Pourquoi ici et pas dans le pont : Google refuse pour l'instant d'autoriser le scope UrlFetchApp au pont, et son URL /exec
// renvoie parfois une page d'erreur ; ici on réessaie et on garde la dernière bonne copie par élève.
const http = require('http');
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf8'));
const cache = new Map();
let ecoleCache = { t: 0, txt: '' };

async function getText(url, tries) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { redirect: 'follow' });
      const t = await r.text();
      if (r.ok && t.startsWith('BEGIN:VCALENDAR')) return t;
      if (t.includes('Lien invalide')) return null;
    } catch (e) { }
    await new Promise(r => setTimeout(r, 2000 * (i + 1)));
  }
  return undefined;
}
async function ecole() {
  if (ecoleCache.txt && Date.now() - ecoleCache.t < 6 * 3600e3) return ecoleCache.txt;
  const t = await getText(cfg.ecole_ics, 2);
  if (t) ecoleCache = { t: Date.now(), txt: t };
  return ecoleCache.txt;
}
function merge(perso, school) {
  const evs = school ? (school.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || []) : [];
  const uids = new Set(perso.match(/UID:[^\r\n]+/g) || []);
  const extra = evs.filter(e => { const m = e.match(/UID:[^\r\n]+/); return !m || !uids.has(m[0]); });
  const i = perso.lastIndexOf('END:VCALENDAR');
  return perso.slice(0, i) + extra.map(e => e.replace(/\r?\n/g, '\r\n')).join('\r\n') + (extra.length ? '\r\n' : '') + 'END:VCALENDAR\r\n';
}
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname !== '/agenda.ics') { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
  const email = (u.searchParams.get('email') || '').trim().toLowerCase(), t = (u.searchParams.get('t') || '').trim();
  if (!email || !t) { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('email et t requis'); }
  const ck = email + '|' + t;
  const pontUrl = cfg.pont + '?key=' + encodeURIComponent(cfg.key) + '&what=ics&email=' + encodeURIComponent(email) + '&t=' + encodeURIComponent(t);
  let perso = await getText(pontUrl, 3);
  if (perso === null) { res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Lien invalide. Rouvre la page Pratiques et clique sur Connecter mon agenda.'); }
  if (perso === undefined) {
    const c = cache.get(ck);
    if (!c) { res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Le pont ne répond pas, réessaie dans quelques minutes.'); }
    perso = c.txt;
  } else cache.set(ck, { t: Date.now(), txt: perso });
  const out = merge(perso, await ecole());
  res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'max-age=300', 'Content-Disposition': 'inline; filename="selfty-pratiques.ics"' });
  res.end(out);
}).listen(8711, '127.0.0.1', () => console.log('selfty-agenda sur 127.0.0.1:8711'));
