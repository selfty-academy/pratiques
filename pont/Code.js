// Pont « Pratiques Selfty » : agenda des séances de pratique entre élèves (coaching entre pairs, en visio).
// Exécuté par le compte selfty.academy (les mails partent de cette adresse). Données dans le Google Sheet
// « Pratiques Selfty » (onglets Creneaux + Inscriptions) créé par what=setup. Aucune donnée dans ce code.
//
// doGet  ?key=…&what=setup     crée le Sheet + installe le rappel de la veille (à ouvrir UNE fois dans un navigateur
//                              connecté à selfty.academy@gmail.com : c'est là que l'autorisation OAuth se fait)
// doGet  ?key=…&what=list      liste des créneaux (sans e-mails)
// doPost { key, what, … } :
//   list      { email? }                                        créneaux + flags mine / booked_by_me pour cet e-mail
//   propose   { prenom, email, date, heure, duree, role, theme, visio, note }
//   book      { id, prenom, email, role? }                      role obligatoire quand le créneau est « au choix »
//   unbook    { id, email }                                     l'inscrite se désinscrit (mail à la proposante)
//   cancel    { id, email }                                     la proposante annule (mail à l'inscrite s'il y en a une)
//   remind    {}                                                lance le rappel de la veille à la main (test)
//   mail_test { to }                                            mail de test
//   setup     {}
//
// Déploiement : clasp --user selfty (compte selfty.academy), voir README. Rappel : jamais `clasp deploy` après le
// premier (nouvelle URL) : `clasp redeploy <deploymentId> --user selfty`.

// À exécuter une fois dans l'éditeur si l'autorisation par l'URL /exec ne passe pas (Sheets, Drive, mail, déclencheurs)
function autoriser() {
  const ss = book();
  tab(ss, CR_TAB, CR_HDR);
  tab(ss, IN_TAB, IN_HDR);
  tab(ss, EL_TAB, EL_HDR);
  ScriptApp.getProjectTriggers();
  MailApp.getRemainingDailyQuota();
  UrlFetchApp.fetch(AGENDA_ICS_URL, { muteHttpExceptions: true });   // scope external_request (agenda de l'école)
  Logger.log('OK ' + ss.getUrl());
}

const KEY = 'pratiques-b65312ad3c23ea1fcf07fc92';
const P = PropertiesService.getScriptProperties();
const TZ = 'Europe/Paris';
const PAGE_URL = 'https://selftyacademy.schoolmaker.co/products?pratiques=1';   // le tableau vit dans l'école (menu « Les pratiques »)
const MAIL_NAME = 'Selfty Academy · Pratiques';
const SHEET_NAME = 'Pratiques Selfty';
const RAPPEL_HEURE = 18;                 // rappel de la veille, vers 18h (heure de Paris)

const CR_TAB = 'Creneaux';
const CR_HDR = ['ID', 'Créé le', 'Date', 'Heure', 'Durée (min)', 'Prénom', 'E-mail', 'Rôle', 'Thème', 'Lien visio', 'Note', 'Statut',
  'Prénom inscrite', 'E-mail inscrite', 'Rôle inscrite', 'Inscrite le', 'Rappel envoyé', 'MAJ', 'Outil'];
const CR_KEYS = ['id', 'created', 'date', 'heure', 'duree', 'prenom', 'email', 'role', 'theme', 'visio', 'note', 'statut',
  'b_prenom', 'b_email', 'b_role', 'b_at', 'rappel', 'updated', 'outil'];
// Fiche élève : le lien visio perso, collé une seule fois (demande Alex du 23/09)
const EL_TAB = 'Eleves';
const EL_HDR = ['E-mail', 'Prénom', 'Lien visio', 'MAJ'];
const EL_KEYS = ['email', 'prenom', 'visio', 'updated'];

const IN_TAB = 'Inscriptions';
const IN_HDR = ['ID', 'Créneau', 'Date', 'Heure', 'Proposé par', 'Inscrite', 'E-mail inscrite', 'Rôle inscrite', 'Inscrite le', 'Désinscrite le'];

const ROLES = ['coach', 'coachee', 'choix'];
const DUREES = [45, 90];   // 1h30 = 45 min coachée + 45 min coach ; 45 min = une seule séance

// ---------- entrées ----------
function doGet(e) {
  const q = (e && e.parameter) || {};
  if (q.key !== KEY) return out({ ok: true, pong: true, v: 1 });
  try {
    if (q.what === 'setup') return out(setup());
    if (q.what === 'list') return out(list({}));
    if (q.what === 'ics') return icsFeed(q);
    if (q.what === 'timing') {
      const t = {}, t0 = Date.now(); let last = t0; const lap = k => { const n = Date.now(); t[k] = n - last; last = n; };
      const ss = book(); lap('book');
      const all = rows(tab(ss, CR_TAB, CR_HDR), CR_KEYS); lap('rows_creneaux');
      rows(tab(ss, EL_TAB, EL_HDR), EL_KEYS); lap('rows_eleves');
      stats(all, 'x@x.fr'); lap('stats');
      ecoleEvents(); lap('ecole');
      icsToken('x@x.fr'); lap('token');
      ScriptApp.getService().getUrl(); lap('geturl');
      t.total = Date.now() - t0;
      return out({ ok: true, ms: t, n: all.length });
    }
    if (q.what === 'ecole_debug') { try { const r = UrlFetchApp.fetch(AGENDA_ICS_URL, { muteHttpExceptions: true }); return out({ ok: true, code: r.getResponseCode(), len: r.getContentText().length, n: ecoleEvents().length }); } catch (err) { return out({ ok: false, err: String(err) }); } }
    if (q.what === 'remind') return out({ ok: true, sent: rappelVeille() });
  } catch (err) {
    return out({ ok: false, error: String(err && err.message || err) });
  }
  return out({ ok: true, pong: true, v: 1 });
}

function doPost(e) {
  let p = {};
  try { p = JSON.parse(e.postData.contents); } catch (err) { return out({ ok: false, error: 'bad json' }); }
  if (p.key !== KEY) return out({ ok: false, error: 'bad key' });
  try {
    if (p.what === 'setup') return out(setup());
    if (p.what === 'list') return out(list(p));
    if (p.what === 'propose') return out(propose(p));
    if (p.what === 'book') return out(bookSlot(p));
    if (p.what === 'unbook') return out(unbook(p));
    if (p.what === 'cancel') return out(cancel(p));
    if (p.what === 'profil_set') return out(profilSet(p));
    if (p.what === 'remind') return out({ ok: true, sent: rappelVeille() });
    if (p.what === 'mail_test') {
      // la clé KEY est publique (dans la page) : le test de mail exige en plus la propriété de script ADMIN_KEY (p.akey),
      // sinon n'importe qui pourrait envoyer des mails depuis selfty.academy et vider le quota Gmail
      const ak = P.getProperty('ADMIN_KEY');
      if (!ak || String(p.akey || '') !== ak) return out({ ok: false, error: 'bad akey (propriété de script ADMIN_KEY)' });
      const to = cleanEmail(p.to);
      if (!to) return out({ ok: false, error: 'e-mail manquant' });
      MailApp.sendEmail({ to: to, name: MAIL_NAME, subject: 'Test : Pratiques Selfty', body: 'Le pont des pratiques fonctionne.\n' + PAGE_URL });
      return out({ ok: true, quota: MailApp.getRemainingDailyQuota() });
    }
    return out({ ok: false, error: 'unknown what' });
  } catch (err) {
    return out({ ok: false, error: String(err && err.message || err) });
  }
}

// ---------- setup ----------
function setup() {
  const ss = book();
  tab(ss, CR_TAB, CR_HDR);
  tab(ss, IN_TAB, IN_HDR);
  tab(ss, EL_TAB, EL_HDR);
  const def = ss.getSheetByName('Feuille 1') || ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
  installTriggers();
  if (!P.getProperty('ICS_SECRET')) P.setProperty('ICS_SECRET', Utilities.getUuid() + Utilities.getUuid());
  return {
    ok: true, sheet_url: ss.getUrl(), sheet_id: ss.getId(),
    triggers: ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction()),
    mail_quota: MailApp.getRemainingDailyQuota(),
  };
}

function book() {
  let id = P.getProperty('SHEET_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) { /* recréé ci-dessous */ } }
  const ss = SpreadsheetApp.create(SHEET_NAME);
  P.setProperty('SHEET_ID', ss.getId());
  return ss;
}

function tab(ss, name, hdr) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, hdr.length).setValues([hdr]).setFontWeight('bold');
    sh.setFrozenRows(1);
  } else if (sh.getLastColumn() < hdr.length) {
    sh.getRange(1, 1, 1, hdr.length).setValues([hdr]).setFontWeight('bold');
  }
  return sh;
}

// Déclencheur quotidien : rappel de la veille vers 18h (les anciens déclencheurs sont supprimés d'abord)
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('rappelVeille').timeBased().everyDays(1).atHour(RAPPEL_HEURE).nearMinute(0).inTimezone(TZ).create();
}

// ---------- lecture ----------
function rows(sh, keys) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  const v = sh.getRange(2, 1, last - 1, keys.length).getValues();
  return v.filter(r => r[0] !== '').map((r, i) => {
    const o = { _row: i + 2 };
    keys.forEach((k, j) => { o[k] = cell(r[j]); });
    return o;
  });
}
function cell(x) {
  if (x instanceof Date) return Utilities.formatDate(x, TZ, "yyyy-MM-dd'T'HH:mm:ss");
  return x;
}
function stamp() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss"); }
function today() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function nowHM() { return Utilities.formatDate(new Date(), TZ, 'HH:mm'); }
function cleanEmail(s) { s = String(s || '').trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : ''; }
function cleanName(s) { return String(s || '').trim().replace(/\s+/g, ' ').slice(0, 40); }

// Vue publique d'un créneau : jamais les e-mails ; le lien visio seulement pour les deux concernées
function pub(c, email) {
  const mine = !!email && c.email === email;
  const booked_by_me = !!email && !!c.b_email && c.b_email === email;
  const o = {
    id: c.id, date: String(c.date).slice(0, 10), heure: String(c.heure).slice(0, 5), duree: Number(c.duree) || 60,
    prenom: c.prenom, role: c.role, theme: c.theme || '', outil: c.outil || '', note: c.note || '', statut: c.statut,
    b_prenom: c.b_prenom || '', b_role: c.b_role || '', has_visio: !!c.visio, mine: mine, booked_by_me: booked_by_me,
  };
  if (mine || booked_by_me) o.visio = c.visio || '';
  return o;
}

function list(p) {
  const email = cleanEmail(p.email);
  const ss = book();
  const all = rows(tab(ss, CR_TAB, CR_HDR), CR_KEYS);
  const lim = addDays(today(), -30);
  const el = email ? rows(tab(ss, EL_TAB, EL_HDR), EL_KEYS).find(x => cleanEmail(x.email) === email) : null;
  return {
    ok: true,
    now: stamp(),
    creneaux: all.filter(c => c.statut !== 'annulé' && String(c.date).slice(0, 10) >= lim).map(c => pub(c, email)),
    moi: { visio: (el && el.visio) || '', ics_url: email ? icsUrl(email) : '' },
    ecole: ecoleEvents().filter(ev => ev.date >= today()).slice(0, 8),
    stats: stats(all, email),
  };
}

// Combien de pratiques faites, et quels outils ont été le plus pratiqués (demande Alex du 23/09).
// Une pratique « faite » = un créneau complet (deux personnes) dont l'heure est passée.
function stats(all, email) {
  const faites = all.filter(c => c.statut === 'complet' && isPast(c));
  const outils = {};
  let moiN = 0, moiMin = 0;
  const mesOutils = {};
  faites.forEach(c => {
    const o = String(c.outil || '').trim();
    if (o) outils[o] = (outils[o] || 0) + 1;
    const mine = email && (cleanEmail(c.email) === email || cleanEmail(c.b_email) === email);
    if (mine) {
      moiN++; moiMin += Number(c.duree) || 60;
      if (o) mesOutils[o] = (mesOutils[o] || 0) + 1;
    }
  });
  const tri = obj => Object.keys(obj).map(k => ({ outil: k, n: obj[k] })).sort((a, b) => b.n - a.n);
  // classement par nombre de pratiques (gamification, demande d'Anaïs du 29/09) : prénoms seulement, jamais d'e-mail
  const parEleve = {};
  faites.forEach(c => { [[c.email, c.prenom], [c.b_email, c.b_prenom]].forEach(([e, pr]) => { e = cleanEmail(e); if (!e) return; if (!parEleve[e]) parEleve[e] = { prenom: cleanName(pr) || '?', n: 0 }; parEleve[e].n++; }); });
  const classement = Object.keys(parEleve).map(e => ({ prenom: parEleve[e].prenom, n: parEleve[e].n, moi: !!email && e === email })).sort((a, b) => b.n - a.n || a.prenom.localeCompare(b.prenom));
  const rang = (email && parEleve[email]) ? classement.filter(x => x.n > parEleve[email].n).length + 1 : 0;
  return {
    promo: { faites: faites.length, eleves: classement.length },
    outils: tri(outils),
    moi: { faites: moiN, minutes: moiMin, outils: tri(mesOutils) },
    classement: classement.slice(0, 20), rang: rang, total: classement.length,
  };
}

// Enregistre le lien visio perso de l'élève (une fois pour toutes)
function profilSet(p) {
  const email = cleanEmail(p.email), prenom = cleanName(p.prenom);
  if (!email) return { ok: false, error: 'e-mail manquant' };
  const visio = String(p.visio || '').trim().slice(0, 300);
  if (visio && !/^https?:\/\//i.test(visio)) return { ok: false, error: 'le lien visio doit commencer par http' };
  return withLock(() => {
    const sh = tab(book(), EL_TAB, EL_HDR);
    const e = rows(sh, EL_KEYS).find(x => cleanEmail(x.email) === email);
    if (e) sh.getRange(e._row, 1, 1, EL_HDR.length).setNumberFormat('@').setValues([[email, prenom || e.prenom, visio, stamp()]]);
    else { sh.appendRow([email, prenom, visio, stamp()]); sh.getRange(sh.getLastRow(), 1, 1, EL_HDR.length).setNumberFormat('@'); }
    return { ok: true, visio: visio };
  });
}

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function findSlot(sh, id) {
  const all = rows(sh, CR_KEYS);
  return all.find(c => String(c.id) === String(id)) || null;
}
function setCells(sh, row, obj) {
  Object.keys(obj).forEach(k => {
    const i = CR_KEYS.indexOf(k);
    if (i >= 0) sh.getRange(row, i + 1).setNumberFormat('@').setValue(obj[k]);
  });
  sh.getRange(row, CR_KEYS.indexOf('updated') + 1).setNumberFormat('@').setValue(stamp());
}
function isPast(c) {
  const d = String(c.date).slice(0, 10), h = String(c.heure).slice(0, 5);
  return d < today() || (d === today() && h <= nowHM());
}

// ---------- écriture ----------
function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function propose(p) {
  const prenom = cleanName(p.prenom), email = cleanEmail(p.email);
  if (!prenom || !email) return { ok: false, error: 'prénom ou e-mail manquant' };
  const date = String(p.date || '').slice(0, 10), heure = String(p.heure || '').slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(heure)) return { ok: false, error: 'date ou heure invalide' };
  if (date < today() || (date === today() && heure <= nowHM())) return { ok: false, error: 'ce créneau est déjà passé' };
  const duree = DUREES.includes(Number(p.duree)) ? Number(p.duree) : 90;
  const role = 'duo';   // plus de rôles depuis le 29/09/2026 : les deux coachent à tour de rôle
  const visio = String(p.visio || '').trim().slice(0, 300);
  if (visio && !/^https?:\/\//i.test(visio)) return { ok: false, error: 'le lien visio doit commencer par http' };
  return withLock(() => {
    const sh = tab(book(), CR_TAB, CR_HDR);
    const dup = rows(sh, CR_KEYS).some(c => c.email === email && c.statut !== 'annulé' && String(c.date).slice(0, 10) === date && String(c.heure).slice(0, 5) === heure);
    if (dup) return { ok: false, error: 'tu as déjà proposé ce créneau' };
    const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const now = stamp();
    const row = [id, now, date, heure, duree, prenom, email, role, '', visio,
      String(p.note || '').trim().slice(0, 500), 'ouvert', '', '', '', '', '', now, String(p.outil || '').trim().slice(0, 120)];
    sh.appendRow(row);
    sh.getRange(sh.getLastRow(), 1, 1, row.length).setNumberFormat('@');
    return { ok: true, id: id };
  });
}

function bookSlot(p) {
  const prenom = cleanName(p.prenom), email = cleanEmail(p.email);
  if (!prenom || !email) return { ok: false, error: 'prénom ou e-mail manquant' };
  return withLock(() => {
    const ss = book();
    const sh = tab(ss, CR_TAB, CR_HDR);
    const c = findSlot(sh, p.id);
    if (!c) return { ok: false, error: 'créneau introuvable' };
    if (c.statut === 'annulé') return { ok: false, error: 'ce créneau a été annulé' };
    if (c.statut === 'complet') return { ok: false, error: 'ce créneau vient d\'être pris' };
    if (isPast(c)) return { ok: false, error: 'ce créneau est déjà passé' };
    if (c.email === email) return { ok: false, error: 'c\'est ton propre créneau' };
    const b_role = 'duo';
    const now = stamp();
    setCells(sh, c._row, { statut: 'complet', b_prenom: prenom, b_email: email, b_role: b_role, b_at: now });
    const ins = tab(ss, IN_TAB, IN_HDR);
    const iid = 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    ins.appendRow([iid, c.id, String(c.date).slice(0, 10), String(c.heure).slice(0, 5), c.prenom, prenom, email, b_role, now, '']);
    ins.getRange(ins.getLastRow(), 1, 1, IN_HDR.length).setNumberFormat('@');
    const slot = Object.assign({}, c, { statut: 'complet', b_prenom: prenom, b_email: email, b_role: b_role });
    let mail = true;
    try { mailConfirm(slot); } catch (e) { mail = false; Logger.log('mail confirm : ' + e); }
    return { ok: true, mail: mail };
  });
}

function unbook(p) {
  const email = cleanEmail(p.email);
  return withLock(() => {
    const ss = book();
    const sh = tab(ss, CR_TAB, CR_HDR);
    const c = findSlot(sh, p.id);
    if (!c) return { ok: false, error: 'créneau introuvable' };
    if (c.statut !== 'complet' || c.b_email !== email) return { ok: false, error: 'tu n\'es pas inscrite sur ce créneau' };
    setCells(sh, c._row, { statut: 'ouvert', b_prenom: '', b_email: '', b_role: '', b_at: '', rappel: '' });
    const ins = tab(ss, IN_TAB, IN_HDR);
    const all = rows(ins, ['id', 'slot', 'date', 'heure', 'by', 'prenom', 'email', 'role', 'at', 'off']);
    const r = all.filter(x => x.slot === c.id && x.email === email && !x.off).pop();
    if (r) ins.getRange(r._row, 10).setNumberFormat('@').setValue(stamp());
    try { mailUnbook(c); } catch (e) { Logger.log('mail unbook : ' + e); }
    return { ok: true };
  });
}

function cancel(p) {
  const email = cleanEmail(p.email);
  return withLock(() => {
    const sh = tab(book(), CR_TAB, CR_HDR);
    const c = findSlot(sh, p.id);
    if (!c) return { ok: false, error: 'créneau introuvable' };
    if (c.email !== email) return { ok: false, error: 'seule la personne qui a proposé le créneau peut l\'annuler' };
    if (c.statut === 'annulé') return { ok: true };
    setCells(sh, c._row, { statut: 'annulé' });
    if (c.b_email) { try { mailCancel(c); } catch (e) { Logger.log('mail cancel : ' + e); } }
    return { ok: true };
  });
}

// ---------- rappel de la veille (déclencheur quotidien vers 18h) ----------
function rappelVeille() {
  const sh = tab(book(), CR_TAB, CR_HDR);
  const tomorrow = addDays(today(), 1);
  let n = 0;
  rows(sh, CR_KEYS).forEach(c => {
    if (String(c.date).slice(0, 10) !== tomorrow || c.statut === 'annulé' || c.rappel) return;
    try {
      if (c.statut === 'complet' && c.b_email) mailRappel(c);
      else if (c.statut === 'ouvert') mailRappelSeule(c);
      else return;
      setCells(sh, c._row, { rappel: stamp() });
      n++;
    } catch (e) { Logger.log('rappel ' + c.id + ' : ' + e); }
  });
  return n;
}

// ---------- mails ----------
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function dateFr(iso) {
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  return JOURS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MOIS[d.getUTCMonth()];
}
function heureFr(h) { return String(h).slice(0, 5).replace(':', 'h'); }
function rolesTxt(c) {
  // plus de rôles fixés : en 1h30, chacune coache 45 min
  if (Number(c.duree) === 45) return '45 min : une seule séance, décidez ensemble qui coache (et inversez la prochaine fois).';
  return '1h30 : 45 min où l\'une coache, puis vous échangez les rôles.';
}
function visioTxt(c) {
  if (c.visio) return 'Lien visio : ' + c.visio;
  return 'Pas de lien visio renseigné : mettez-vous d\'accord entre vous, ou créez-en un ici : https://meet.google.com/new';
}
function durFr(n) { n = Number(n) || 60; return n >= 60 ? Math.floor(n / 60) + 'h' + (n % 60 ? String(n % 60).padStart(2, '0') : '') : n + ' min'; }
function quand(c) { return dateFr(c.date) + ' à ' + heureFr(c.heure) + ' (' + durFr(c.duree) + ')'; }
function signature() { return '\n\nSelfty Academy\n' + PAGE_URL + '\n\n(message automatique de l\'agenda des pratiques ; réponds à ce mail pour écrire à ton binôme)'; }

function mailConfirm(c) {
  const subject = 'Pratique confirmée : ' + dateFr(c.date) + ' à ' + heureFr(c.heure);
  const body = 'Hello ' + c.prenom + ' et ' + c.b_prenom + ',\n\n'
    + 'Votre séance de pratique est confirmée !\n\n'
    + '📅 ' + quand(c) + '\n'
    + '🔁 ' + rolesTxt(c) + '\n'
    + (c.theme ? '🎯 Thème : ' + c.theme + '\n' : '')
    + '🎥 ' + visioTxt(c) + '\n'
    + (c.note ? '\nNote de ' + c.prenom + ' : ' + c.note + '\n' : '')
    + '\nVous recevrez un rappel la veille vers 18h. Pour te désinscrire ou annuler : ' + PAGE_URL
    + signature();
  MailApp.sendEmail({ to: c.email + ',' + c.b_email, name: MAIL_NAME, subject: subject, body: body });
}

function mailUnbook(c) {
  const subject = c.b_prenom + ' s\'est désinscrite : ' + dateFr(c.date) + ' à ' + heureFr(c.heure);
  const body = 'Hello ' + c.prenom + ',\n\n'
    + c.b_prenom + ' s\'est désinscrite de ta pratique du ' + quand(c) + '.\n\n'
    + 'Ton créneau est de nouveau ouvert : une autre élève peut s\'y inscrire. Tu peux aussi l\'annuler ici : ' + PAGE_URL
    + signature();
  MailApp.sendEmail({ to: c.email, name: MAIL_NAME, subject: subject, body: body });
}

function mailCancel(c) {
  const subject = 'Pratique annulée : ' + dateFr(c.date) + ' à ' + heureFr(c.heure);
  const body = 'Hello ' + c.b_prenom + ',\n\n'
    + c.prenom + ' a annulé la pratique du ' + quand(c) + '.\n\n'
    + 'Tu peux choisir un autre créneau ou en proposer un ici : ' + PAGE_URL
    + signature();
  MailApp.sendEmail({ to: c.b_email, name: MAIL_NAME, subject: subject, body: body });
}

function mailRappel(c) {
  const subject = 'Rappel : ta pratique demain à ' + heureFr(c.heure);
  const body = 'Hello ' + c.prenom + ' et ' + c.b_prenom + ',\n\n'
    + 'Petit rappel : votre séance de pratique a lieu demain.\n\n'
    + '📅 ' + quand(c) + '\n'
    + '🔁 ' + rolesTxt(c) + '\n'
    + (c.theme ? '🎯 Thème : ' + c.theme + '\n' : '')
    + '🎥 ' + visioTxt(c) + '\n'
    + '\nBonne pratique !'
    + signature();
  MailApp.sendEmail({ to: c.email + ',' + c.b_email, name: MAIL_NAME, subject: subject, body: body });
}

function mailRappelSeule(c) {
  const subject = 'Ta pratique de demain n\'a pas encore de binôme';
  const body = 'Hello ' + c.prenom + ',\n\n'
    + 'Personne ne s\'est encore inscrit sur ton créneau de demain (' + quand(c) + ').\n\n'
    + 'Tu peux partager l\'agenda dans le groupe pour trouver un binôme, ou annuler le créneau : ' + PAGE_URL
    + signature();
  MailApp.sendEmail({ to: c.email, name: MAIL_NAME, subject: subject, body: body });
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}


// ---------- agenda perso abonnable (29/09/2026) ----------
// Chaque élève a un flux .ics à elle : ses pratiques (proposées ou réservées) + les rendez-vous de l'école
// (Selfty Calls, pratiques du lundi, jalons) repris du flux public de selfty-agenda. Le lien est signé
// (jeton HMAC sur l'e-mail) : personne ne peut deviner le flux d'une autre élève.
const AGENDA_ICS_URL = 'https://selfty-academy.github.io/agenda/calls-selfty.ics';

function icsSecret() {
  let sct = P.getProperty('ICS_SECRET');
  if (!sct) { sct = Utilities.getUuid() + Utilities.getUuid(); P.setProperty('ICS_SECRET', sct); }
  return sct;
}
function icsToken(email) {
  const sig = Utilities.computeHmacSha256Signature(email, icsSecret());
  return Utilities.base64EncodeWebSafe(sig).replace(/=+$/, '').slice(0, 22);
}
// Le lien donné aux élèves passe par le VPS (vps/server.js), qui lit ce flux ici (what=ics) et y fusionne les rendez-vous de l'école.
const FEED_BASE = 'https://187-77-169-11.sslip.io/pratiques/agenda.ics';
function icsUrl(email) {
  return FEED_BASE + '?email=' + encodeURIComponent(email) + '&t=' + icsToken(email);
}

// Flux public de l'école, en cache 6 h
function ecoleIcs() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('ecole_ics');
  if (hit) return hit;
  // Tant que le scope external_request n'est pas autorisé, UrlFetchApp met ~35 s à refuser : on n'essaie qu'une fois par quart d'heure.
  if (cache.get('ecole_fail')) return '';
  try {
    const r = UrlFetchApp.fetch(AGENDA_ICS_URL, { muteHttpExceptions: true });
    if (r.getResponseCode() === 200) { const t = r.getContentText(); cache.put('ecole_ics', t, 21600); return t; }
  } catch (_) { }
  cache.put('ecole_fail', '1', 900);
  return '';
}
// Événements de l'école en JSON (titre, date, heure, fin, journee)
function ecoleEvents() {
  const txt = ecoleIcs(); if (!txt) return [];
  const evs = [];
  const blocks = txt.replace(/\r\n[ \t]/g, '').split('BEGIN:VEVENT').slice(1);
  blocks.forEach(b => {
    const g = re => { const m = b.match(re); return m ? m[1].trim() : ''; };
    const ds = g(/DTSTART[^:]*:(\S+)/), de = g(/DTEND[^:]*:(\S+)/), sum = g(/SUMMARY:(.*)/);
    if (!ds || !sum) return;
    const journee = /^\d{8}$/.test(ds);
    const date = ds.slice(0, 4) + '-' + ds.slice(4, 6) + '-' + ds.slice(6, 8);
    const hm = x => x && x.length >= 13 ? x.slice(9, 11) + ':' + x.slice(11, 13) : '';
    evs.push({ titre: sum.replace(/\\,/g, ',').replace(/\;/g, ';'), date, heure: journee ? '' : hm(ds), fin: journee ? '' : hm(de), journee, statut: /STATUS:CANCELLED/.test(b) ? 'annulé' : '' });
  });
  return evs.filter(e => e.statut !== 'annulé').sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure));
}

function icsFeed(q) {
  const email = cleanEmail(q.email);
  const bad = msg => ContentService.createTextOutput(msg).setMimeType(ContentService.MimeType.TEXT);
  if (!email || String(q.t || '') !== icsToken(email)) return bad('Lien invalide. Rouvre la page Pratiques et clique sur « Connecter mon agenda ».');
  const ss = book();
  const all = rows(tab(ss, CR_TAB, CR_HDR), CR_KEYS).filter(c => c.statut !== 'annulé' && (cleanEmail(c.email) === email || cleanEmail(c.b_email) === email));
  const e = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const st = (d, h, plusMin) => { const dt = new Date(String(d).slice(0, 10) + 'T' + String(h).slice(0, 5) + ':00'); if (plusMin) dt.setMinutes(dt.getMinutes() + plusMin); return Utilities.formatDate(dt, TZ, "yyyyMMdd'T'HHmmss"); };
  const now = Utilities.formatDate(new Date(), 'UTC', "yyyyMMdd'T'HHmmss'Z'");
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Selfty Academy//Pratiques perso//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Selfty Academy · mes pratiques et mes calls', 'X-WR-TIMEZONE:Europe/Paris', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
    'BEGIN:VTIMEZONE', 'TZID:Europe/Paris', 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD', 'END:VTIMEZONE'];
  all.forEach(c => {
    const mine = cleanEmail(c.email) === email, full = c.statut === 'complet';
    const partner = mine ? c.b_prenom : c.prenom;
    const title = full ? 'Pratique Selfty avec ' + partner : 'Pratique Selfty (en attente d\'un binôme)';
    const desc = [rolesTxt(c), c.outil ? 'Outil : ' + c.outil : '', c.visio ? 'Visio : ' + c.visio : '', PAGE_URL].filter(Boolean).join('\n');
    L.push('BEGIN:VEVENT', 'UID:' + c.id + '@selfty-academy.github.io', 'DTSTAMP:' + now,
      'DTSTART;TZID=Europe/Paris:' + st(c.date, c.heure), 'DTEND;TZID=Europe/Paris:' + st(c.date, c.heure, Number(c.duree) || 60),
      'SUMMARY:' + e(title), 'DESCRIPTION:' + e(desc), 'URL:' + PAGE_URL);
    if (c.visio) L.push('LOCATION:' + e(c.visio));
    if (full) L.push('BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:' + e(title), 'END:VALARM');
    L.push('END:VEVENT');
  });
  // les rendez-vous de l'école, recopiés tels quels depuis le flux public
  const pubIcs = ecoleIcs();
  if (pubIcs) {
    const m = pubIcs.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
    m.forEach(b => L.push(b.replace(/\r?\n/g, '\r\n')));
  }
  L.push('END:VCALENDAR');
  return ContentService.createTextOutput(L.join('\r\n')).setMimeType(ContentService.MimeType.ICAL);
}
