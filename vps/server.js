// Selfty · service « pratiques » sur le VPS de secours (29/09/2026). systemd selfty-agenda, port 8711, derrière nginx.
//
//  GET  /agenda.ics?email=…&t=…   flux agenda perso : pratiques de l'élève (lues sur le pont Apps Script, jeton vérifié
//                                 par le pont) + tous les rendez-vous de l'école (flux public de selfty-agenda), fusionnés.
//  POST /api  {what, …}           l'API que lit la page :
//        list                     servi depuis la copie locale (quelques ms). La copie est relue sur le pont
//                                 (what=list_full, clé VPS_SECRET) toutes les 60 s et après chaque écriture.
//        propose/book/unbook/     validés et appliqués ici tout de suite (réponse en quelques ms), puis poussés vers le
//        cancel/profil_set        pont par une file d'attente persistante (queue.json) : le pont écrit dans le Sheet et
//                                 envoie les mails quelques secondes plus tard.
//
// Pourquoi : Google Apps Script répond en 3 à 15 s (parfois une page d'erreur). Ici la page lit en instantané.
const http = require('http');
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf8'));
const FEED_BASE = 'https://187-77-169-11.sslip.io/pratiques/agenda.ics';
const DUREES = [45, 90];

// ---------- heure de Paris ----------
function parisParts() {
  const f = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const o = {}; f.formatToParts(new Date()).forEach(p => { o[p.type] = p.value; });
  return { date: o.year + '-' + o.month + '-' + o.day, hm: (o.hour === '24' ? '00' : o.hour) + ':' + o.minute };
}
const today = () => parisParts().date;
const nowHM = () => parisParts().hm;
const stamp = () => { const p = parisParts(); return p.date + 'T' + p.hm + ':00'; };
function addDays(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const cleanEmail = s => { s = String(s || '').trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : ''; };
const cleanName = s => String(s || '').trim().replace(/\s+/g, ' ').slice(0, 40);
function isPast(c) { const t = today(); return c.date < t || (c.date === t && c.heure <= nowHM()); }

// ---------- copie locale du Sheet ----------
const state = { creneaux: [], eleves: [], fetchedAt: 0, refreshing: null, lastError: '' };
// La copie est aussi sur disque : un redémarrage (ou Google en panne) ne vide jamais le tableau.
const STATE_FILE = __dirname + '/state.json';
try { const st = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); state.creneaux = st.creneaux || []; state.eleves = st.eleves || []; state.fetchedAt = st.fetchedAt || 0; } catch (_) { }
function saveState() { try { fs.writeFileSync(STATE_FILE, JSON.stringify({ creneaux: state.creneaux, eleves: state.eleves, fetchedAt: state.fetchedAt })); } catch (e) { console.error('state.json :', e.message); } }
async function pontPost(body, tries) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(cfg.pont, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ key: cfg.key }, body)) });
      const txt = await r.text();
      if (txt.trim().startsWith('{')) {
        const j = JSON.parse(txt);
        // Google perd parfois le corps du POST dans sa redirection : le pont répond alors son « pong » par défaut.
        if (j && j.pong) { last = new Error('pont : pong (corps de requête perdu)'); }
        else return j;
      } else last = new Error('pont : réponse non JSON (' + r.status + ')');
    } catch (e) { last = e; }
    if (i < tries - 1) await new Promise(r => setTimeout(r, 2000 * (i + 1)));
  }
  throw last || new Error('pont injoignable');
}
function refresh() {
  if (state.refreshing) return state.refreshing;
  state.refreshing = (async () => {
    try {
      const j = await pontPost({ what: 'list_full', vkey: cfg.vkey }, 3);
      if (!j.ok) throw new Error(j.error || 'list_full');
      if (!j.today || !Array.isArray(j.creneaux)) throw new Error('list_full : réponse incomplète');
      const fresh = (j.creneaux || []).map(c => Object.assign(c, { date: String(c.date).slice(0, 10), heure: String(c.heure).slice(0, 5), duree: Number(c.duree) || 90 }));
      if (fresh.length < state.creneaux.length - 2) console.warn('refresh : le pont renvoie ' + fresh.length + ' lignes, on en avait ' + state.creneaux.length);
      state.creneaux = fresh;
      state.eleves = j.eleves || [];
      queue.forEach(job => applyPatch(job.p, job.resp));   // les écritures pas encore arrivées dans le Sheet restent visibles
      state.fetchedAt = Date.now(); state.lastError = '';
      saveState();
    } catch (e) { state.lastError = String(e.message || e); console.error('refresh :', state.lastError); setTimeout(refresh, 15000); }
    finally { state.refreshing = null; }
  })();
  return state.refreshing;
}

// ---------- ce que la page voit ----------
function pub(c, email) {
  const mine = !!email && c.email === email;
  const booked_by_me = !!email && !!c.b_email && c.b_email === email;
  const o = { id: c.id, date: c.date, heure: c.heure, duree: c.duree, prenom: c.prenom, role: c.role, theme: c.theme || '', outil: c.outil || '', note: c.note || '', statut: c.statut, b_prenom: c.b_prenom || '', b_role: c.b_role || '', has_visio: !!c.visio, mine, booked_by_me };
  if (mine || booked_by_me) o.visio = c.visio || '';
  return o;
}
function stats(all, email) {
  const faites = all.filter(c => c.statut === 'complet' && isPast(c));
  const outils = {}, mesOutils = {}, parEleve = {};
  let moiN = 0, moiMin = 0;
  faites.forEach(c => {
    const o = String(c.outil || '').trim();
    if (o) outils[o] = (outils[o] || 0) + 1;
    const mine = email && (c.email === email || c.b_email === email);
    if (mine) { moiN++; moiMin += c.duree; if (o) mesOutils[o] = (mesOutils[o] || 0) + 1; }
    [[c.email, c.prenom], [c.b_email, c.b_prenom]].forEach(([e, pr]) => { if (!e) return; if (!parEleve[e]) parEleve[e] = { prenom: cleanName(pr) || '?', n: 0 }; parEleve[e].n++; });
  });
  const tri = obj => Object.keys(obj).map(k => ({ outil: k, n: obj[k] })).sort((a, b) => b.n - a.n);
  const classement = Object.keys(parEleve).map(e => ({ prenom: parEleve[e].prenom, n: parEleve[e].n, moi: !!email && e === email })).sort((a, b) => b.n - a.n || a.prenom.localeCompare(b.prenom));
  const rang = (email && parEleve[email]) ? classement.filter(x => x.n > parEleve[email].n).length + 1 : 0;
  return { promo: { faites: faites.length, eleves: classement.length }, outils: tri(outils), moi: { faites: moiN, minutes: moiMin, outils: tri(mesOutils) }, classement: classement.slice(0, 20), rang, total: classement.length };
}
function icsUrlFor(email) { const e = state.eleves.find(x => x.email === email); return e && e.token ? FEED_BASE + '?email=' + encodeURIComponent(email) + '&t=' + e.token : ''; }
function listFor(email) {
  const lim = addDays(today(), -30);
  const all = state.creneaux;
  const el = email ? state.eleves.find(x => x.email === email) : null;
  return {
    ok: true, now: stamp(), source: 'vps', age: Math.round((Date.now() - state.fetchedAt) / 1000),
    creneaux: all.filter(c => c.statut !== 'annulé' && c.date >= lim).map(c => pub(c, email)),
    moi: { visio: (el && el.visio) || '', ics_url: email ? icsUrlFor(email) : '' },
    ecole: ecoleEvents(),   // tous les rendez-vous de l'école à venir : le calendrier du mois les affiche
    stats: stats(all, email),
  };
}

// ---------- écritures : instantanées ici, puis poussées vers le pont (Sheet + mails) par une file d'attente ----------
// Le VPS valide contre sa copie (créneau libre ? déjà passé ? à moi ?), met à jour la copie, répond en quelques ms,
// et un ouvrier pousse le même ordre vers le pont Google avec réessais. Les ids sont choisis ici, le pont les garde.
const QUEUE_FILE = __dirname + '/queue.json';
let queue = [];
try { queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')); } catch (_) { queue = []; }
function saveQueue() { try { fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue)); } catch (e) { console.error('queue.json :', e.message); } }
const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function applyPatch(p, resp) {
  const what = p.what, email = cleanEmail(p.email), now = stamp();
  if (what === 'propose') {
    if (state.creneaux.some(c => c.id === p.id)) return;
    state.creneaux.push({ id: p.id, created: now, date: String(p.date).slice(0, 10), heure: String(p.heure).slice(0, 5), duree: DUREES.includes(Number(p.duree)) ? Number(p.duree) : 90, prenom: cleanName(p.prenom), email, role: 'duo', theme: '', visio: String(p.visio || '').trim().slice(0, 300), note: String(p.note || '').trim().slice(0, 500), statut: 'ouvert', b_prenom: '', b_email: '', b_role: '', b_at: '', rappel: '', updated: now, outil: String(p.outil || '').trim().slice(0, 120) });
  } else if (what === 'book') {
    const c = state.creneaux.find(x => x.id === p.id); if (c && c.statut !== 'annulé') Object.assign(c, { statut: 'complet', b_prenom: cleanName(p.prenom), b_email: email, b_role: 'duo', b_at: now });
  } else if (what === 'unbook') {
    const c = state.creneaux.find(x => x.id === p.id); if (c && c.statut === 'complet' && c.b_email === email) Object.assign(c, { statut: 'ouvert', b_prenom: '', b_email: '', b_role: '', b_at: '', rappel: '' });
  } else if (what === 'cancel') {
    const c = state.creneaux.find(x => x.id === p.id); if (c && c.email === email) c.statut = 'annulé';
  } else if (what === 'profil_set') {
    const e = state.eleves.find(x => x.email === email);
    const v = { email, prenom: cleanName(p.prenom), visio: String(p.visio || '').trim().slice(0, 300), token: (resp && resp.token) || (e && e.token) || '' };
    if (e) Object.assign(e, v); else state.eleves.push(v);
  }
}
function validate(p) {
  const what = p.what, email = cleanEmail(p.email);
  if (!email) return 'e-mail manquant';
  if (what === 'propose') {
    const prenom = cleanName(p.prenom), date = String(p.date || '').slice(0, 10), heure = String(p.heure || '').slice(0, 5);
    if (!prenom) return 'prénom manquant';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(heure)) return 'date ou heure invalide';
    if (date < today() || (date === today() && heure <= nowHM())) return 'ce créneau est déjà passé';
    const visio = String(p.visio || '').trim();
    if (visio && !/^https?:\/\//i.test(visio)) return 'le lien visio doit commencer par http';
    if (state.creneaux.some(c => c.email === email && c.statut !== 'annulé' && c.date === date && c.heure === heure)) return 'tu as déjà proposé ce créneau';
    return '';
  }
  if (what === 'book') {
    if (!cleanName(p.prenom)) return 'prénom manquant';
    const c = state.creneaux.find(x => x.id === p.id);
    if (!c) return 'créneau introuvable';
    if (c.statut === 'annulé') return 'ce créneau a été annulé';
    if (c.statut === 'complet') return c.b_email === email ? '' : 'ce créneau vient d\'être pris';
    if (isPast(c)) return 'ce créneau est déjà passé';
    if (c.email === email) return 'c\'est ton propre créneau';
    return '';
  }
  if (what === 'unbook') {
    const c = state.creneaux.find(x => x.id === p.id);
    if (!c) return 'créneau introuvable';
    if (c.statut === 'complet' && c.b_email !== email) return 'tu n\'es pas inscrite sur ce créneau';
    return '';
  }
  if (what === 'cancel') {
    const c = state.creneaux.find(x => x.id === p.id);
    if (!c) return 'créneau introuvable';
    if (c.email !== email) return 'seule la personne qui a proposé le créneau peut l\'annuler';
    return '';
  }
  if (what === 'profil_set') {
    const visio = String(p.visio || '').trim();
    if (visio && !/^https?:\/\//i.test(visio)) return 'le lien visio doit commencer par http';
    return '';
  }
  return 'unknown what';
}
async function write(p) {
  p = Object.assign({}, p, { email: cleanEmail(p.email) });
  if (p.what === 'propose') p.id = /^p[a-z0-9]{6,24}$/.test(String(p.id || '')) ? String(p.id) : newId();
  const err = validate(p);
  if (err) return { ok: false, error: err };
  const job = { at: Date.now(), tries: 0, p };
  applyPatch(p); saveState();
  queue.push(job); saveQueue();
  setImmediate(pump);
  const resp = { ok: true, id: p.id, queued: true };
  if (p.what === 'profil_set') resp.ics_url = icsUrlFor(p.email);
  return resp;
}
let pumping = false;
const DEJA = /déjà|vient d'être pris|n'es pas inscrite|propre créneau|introuvable|a été annulé|déjà passé/;
async function pump() {
  if (pumping) return; pumping = true;
  try {
    while (queue.length) {
      const job = queue[0];
      let j;
      try { j = await pontPost(job.p, 3); }
      catch (e) {
        job.tries++; saveQueue();
        if (job.tries >= 8) { console.error('abandon après 8 essais :', JSON.stringify(job.p).slice(0, 200)); queue.shift(); saveQueue(); continue; }
        await new Promise(r => setTimeout(r, Math.min(60000, 5000 * job.tries)));
        continue;
      }
      if (!j.ok && !DEJA.test(j.error || '')) console.error('refusé par le pont :', j.error, JSON.stringify(job.p).slice(0, 160));
      if (j.ok && job.p.what === 'profil_set') applyPatch(job.p, j);
      queue.shift(); saveQueue();
    }
  } finally { pumping = false; }
  setTimeout(refresh, 500);   // le Sheet est à jour : on relit
}
refresh();
setInterval(refresh, 60 * 1000);
setTimeout(pump, 3000);

// ---------- agenda de l'école (flux public) ----------
let ecoleCache = { t: 0, txt: '', events: [] };
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
function parseEcole(txt) {
  const evs = [];
  txt.replace(/\r\n[ \t]/g, '').split('BEGIN:VEVENT').slice(1).forEach(b => {
    const g = re => { const m = b.match(re); return m ? m[1].trim() : ''; };
    const ds = g(/DTSTART[^:]*:(\S+)/), de = g(/DTEND[^:]*:(\S+)/), sum = g(/SUMMARY:(.*)/);
    if (!ds || !sum || /STATUS:CANCELLED/.test(b)) return;
    const journee = /^\d{8}$/.test(ds), date = ds.slice(0, 4) + '-' + ds.slice(4, 6) + '-' + ds.slice(6, 8);
    const hm = x => x && x.length >= 13 ? x.slice(9, 11) + ':' + x.slice(11, 13) : '';
    evs.push({ titre: sum.replace(/\\,/g, ',').replace(/\\;/g, ';'), date, heure: journee ? '' : hm(ds), fin: journee ? '' : hm(de), journee });
  });
  return evs.sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure));
}
async function ecole() {
  if (ecoleCache.txt && Date.now() - ecoleCache.t < 6 * 3600e3) return ecoleCache.txt;
  const t = await getText(cfg.ecole_ics, 2);
  if (t) ecoleCache = { t: Date.now(), txt: t, events: parseEcole(t) };
  return ecoleCache.txt;
}
function ecoleEvents() { const t = today(); return ecoleCache.events.filter(e => e.date >= t); }
ecole(); setInterval(ecole, 3600 * 1000);

const feedCache = new Map();
function merge(perso, school) {
  const evs = school ? (school.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || []) : [];
  const uids = new Set(perso.match(/UID:[^\r\n]+/g) || []);
  const extra = evs.filter(e => { const m = e.match(/UID:[^\r\n]+/); return !m || !uids.has(m[0]); });
  const i = perso.lastIndexOf('END:VCALENDAR');
  return perso.slice(0, i) + extra.map(e => e.replace(/\r?\n/g, '\r\n')).join('\r\n') + (extra.length ? '\r\n' : '') + 'END:VCALENDAR\r\n';
}

// ---------- serveur ----------
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const json = (res, code, o) => { res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, CORS)); res.end(JSON.stringify(o)); };
function readBody(req) { return new Promise(r => { let b = ''; req.on('data', c => { b += c; if (b.length > 1e5) req.destroy(); }); req.on('end', () => r(b)); }); }

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

  if (u.pathname === '/api') {
    let p = {};
    try { p = req.method === 'POST' ? JSON.parse((await readBody(req)) || '{}') : Object.fromEntries(u.searchParams); } catch (_) { return json(res, 400, { ok: false, error: 'JSON invalide' }); }
    const what = String(p.what || '');
    try {
      if (what === 'ping') return json(res, 200, { ok: true, pong: true, age: Math.round((Date.now() - state.fetchedAt) / 1000), n: state.creneaux.length, queue: queue.length, lastError: state.lastError });
      if (what === 'debug') return json(res, 200, { ok: true, fetchedAt: state.fetchedAt, lastError: state.lastError, queue: queue.map(q => q.p.what + ':' + (q.p.id || '') + ':' + q.tries), creneaux: state.creneaux.map(c => [c.id, c.date, c.heure, c.statut, c.prenom, c.b_prenom]), eleves: state.eleves.length });
      if (what === 'refresh') { await refresh(); return json(res, 200, { ok: true, n: state.creneaux.length, lastError: state.lastError }); }
      if (what === 'list') {
        if (!state.fetchedAt) { await refresh(); }
        if (!state.fetchedAt) { const j = await pontPost({ what: 'list', email: p.email }, 2); j.source = 'pont'; return json(res, 200, j); }
        return json(res, 200, listFor(cleanEmail(p.email)));
      }
      if (['propose', 'book', 'unbook', 'cancel', 'profil_set'].includes(what)) return json(res, 200, await write(p));
      return json(res, 400, { ok: false, error: 'unknown what' });
    } catch (e) { return json(res, 502, { ok: false, error: 'Le pont ne répond pas. Réessaie dans un instant.' }); }
  }

  if (u.pathname === '/agenda.ics') {
    const email = cleanEmail(u.searchParams.get('email')), t = (u.searchParams.get('t') || '').trim();
    if (!email || !t) { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('email et t requis'); }
    const ck = email + '|' + t;
    const pontUrl = cfg.pont + '?key=' + encodeURIComponent(cfg.key) + '&what=ics&email=' + encodeURIComponent(email) + '&t=' + encodeURIComponent(t);
    let perso = await getText(pontUrl, 3);
    if (perso === null) { res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Lien invalide. Rouvre la page Pratiques et clique sur Connecter mon agenda.'); }
    if (perso === undefined) {
      const c = feedCache.get(ck);
      if (!c) { res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Le pont ne répond pas, réessaie dans quelques minutes.'); }
      perso = c.txt;
    } else feedCache.set(ck, { t: Date.now(), txt: perso });
    // 30/09 (Anaïs) : le flux perso ne contient QUE les pratiques de l'élève ; les Selfty Calls sont déjà dans l'agenda Selfty du mail de bienvenue
    const out = perso;
    res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'max-age=300', 'Content-Disposition': 'inline; filename="selfty-pratiques.ics"' });
    return res.end(out);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found');
}).listen(8711, '127.0.0.1', () => console.log('selfty-agenda sur 127.0.0.1:8711'));
