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
  ScriptApp.getProjectTriggers();
  MailApp.getRemainingDailyQuota();
  Logger.log('OK ' + ss.getUrl());
}

const KEY = 'pratiques-b65312ad3c23ea1fcf07fc92';
const P = PropertiesService.getScriptProperties();
const TZ = 'Europe/Paris';
const PAGE_URL = 'https://selfty-academy.github.io/pratiques/';
const MAIL_NAME = 'Selfty Academy · Pratiques';
const SHEET_NAME = 'Pratiques Selfty';
const RAPPEL_HEURE = 18;                 // rappel de la veille, vers 18h (heure de Paris)

const CR_TAB = 'Creneaux';
const CR_HDR = ['ID', 'Créé le', 'Date', 'Heure', 'Durée (min)', 'Prénom', 'E-mail', 'Rôle', 'Thème', 'Lien visio', 'Note', 'Statut',
  'Prénom inscrite', 'E-mail inscrite', 'Rôle inscrite', 'Inscrite le', 'Rappel envoyé', 'MAJ'];
const CR_KEYS = ['id', 'created', 'date', 'heure', 'duree', 'prenom', 'email', 'role', 'theme', 'visio', 'note', 'statut',
  'b_prenom', 'b_email', 'b_role', 'b_at', 'rappel', 'updated'];
const IN_TAB = 'Inscriptions';
const IN_HDR = ['ID', 'Créneau', 'Date', 'Heure', 'Proposé par', 'Inscrite', 'E-mail inscrite', 'Rôle inscrite', 'Inscrite le', 'Désinscrite le'];

const ROLES = ['coach', 'coachee', 'choix'];
const DUREES = [30, 45, 60];

// ---------- entrées ----------
function doGet(e) {
  const q = (e && e.parameter) || {};
  if (q.key !== KEY) return out({ ok: true, pong: true, v: 1 });
  try {
    if (q.what === 'setup') return out(setup());
    if (q.what === 'list') return out(list({}));
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
    if (p.what === 'remind') return out({ ok: true, sent: rappelVeille() });
    if (p.what === 'mail_test') {
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
  const def = ss.getSheetByName('Feuille 1') || ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
  installTriggers();
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
    prenom: c.prenom, role: c.role, theme: c.theme || '', note: c.note || '', statut: c.statut,
    b_prenom: c.b_prenom || '', b_role: c.b_role || '', has_visio: !!c.visio, mine: mine, booked_by_me: booked_by_me,
  };
  if (mine || booked_by_me) o.visio = c.visio || '';
  return o;
}

function list(p) {
  const email = cleanEmail(p.email);
  const all = rows(tab(book(), CR_TAB, CR_HDR), CR_KEYS);
  const lim = addDays(today(), -30);
  return {
    ok: true,
    now: stamp(),
    creneaux: all.filter(c => c.statut !== 'annulé' && String(c.date).slice(0, 10) >= lim).map(c => pub(c, email)),
  };
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
  const duree = DUREES.includes(Number(p.duree)) ? Number(p.duree) : 60;
  const role = ROLES.includes(p.role) ? p.role : 'choix';
  const visio = String(p.visio || '').trim().slice(0, 300);
  if (visio && !/^https?:\/\//i.test(visio)) return { ok: false, error: 'le lien visio doit commencer par http' };
  return withLock(() => {
    const sh = tab(book(), CR_TAB, CR_HDR);
    const dup = rows(sh, CR_KEYS).some(c => c.email === email && c.statut !== 'annulé' && String(c.date).slice(0, 10) === date && String(c.heure).slice(0, 5) === heure);
    if (dup) return { ok: false, error: 'tu as déjà proposé ce créneau' };
    const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const now = stamp();
    const row = [id, now, date, heure, duree, prenom, email, role, String(p.theme || '').trim().slice(0, 120), visio,
      String(p.note || '').trim().slice(0, 500), 'ouvert', '', '', '', '', '', now];
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
    let b_role = '';
    if (c.role === 'coach') b_role = 'coachee';
    else if (c.role === 'coachee') b_role = 'coach';
    else if (p.role === 'coach' || p.role === 'coachee') b_role = p.role;
    else return { ok: false, error: 'choisis ton rôle (je coache / je suis coachée)' };
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
  // qui coache, qui est coachée
  const pRole = c.b_role === 'coach' ? 'coachee' : (c.b_role === 'coachee' ? 'coach' : c.role);
  if (pRole === 'coach') return c.prenom + ' coache, ' + c.b_prenom + ' est coachée.';
  if (pRole === 'coachee') return c.b_prenom + ' coache, ' + c.prenom + ' est coachée.';
  return 'Rôles au choix : décidez ensemble qui coache.';
}
function visioTxt(c) {
  if (c.visio) return 'Lien visio : ' + c.visio;
  return 'Pas de lien visio renseigné : mettez-vous d\'accord entre vous, ou créez-en un ici : https://meet.google.com/new';
}
function quand(c) { return dateFr(c.date) + ' à ' + heureFr(c.heure) + ' (' + (Number(c.duree) || 60) + ' min)'; }
function signature() { return '\n\nSelfty Academy\n' + PAGE_URL + '\n\n(message automatique de l\'agenda des pratiques ; réponds à ce mail pour écrire à ton binôme)'; }

function mailConfirm(c) {
  const subject = 'Pratique confirmée : ' + dateFr(c.date) + ' à ' + heureFr(c.heure);
  const body = 'Hello ' + c.prenom + ' et ' + c.b_prenom + ',\n\n'
    + 'Votre séance de pratique est confirmée !\n\n'
    + '📅 ' + quand(c) + '\n'
    + '👥 ' + rolesTxt(c) + '\n'
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
    + '👥 ' + rolesTxt(c) + '\n'
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
