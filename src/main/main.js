'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Notification, Menu, globalShortcut } = require('electron');
const path = require('path');
const fs   = require('fs');
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx');
const S    = require('./stores');
const C    = require('./crypto');

// ─── Spellcheck (ESM dictionary-fr) ──────────────────────────────────────────
let spell = null;
async function initSpell() {
  try {
    const nspell = require('nspell');
    const { default: dic } = await import('dictionary-fr');
    if (dic?.aff && dic?.dic) spell = nspell(dic);
    else if (typeof dic === 'function') await new Promise(r => dic((e,d) => { if(!e) spell=nspell(d); r(); }));
    console.log('Spellcheck ready');
  } catch(e) { console.warn('Spellcheck N/A:', e.message); }
}

// ─── Helpers: protect / reveal using user-chosen criticality per key ──────────

/**
 * Persist a value into a store under `key`, protected at the user-chosen
 * criticality level for that key.
 *
 * @param {Store}  store    - electron-store instance (data or credentials)
 * @param {string} dataKey  - logical name used to look up criticality (e.g. 'sentMails')
 * @param {any}    value    - the raw value to protect and store
 */
function secureSet(store, dataKey, value) {
  const level     = S.getCriticality(dataKey);
  const protected_ = C.protect(value, level);
  store.set(dataKey, protected_);
}

/**
 * Read and reveal a value from a store, auto-detecting its protection level.
 * Falls back gracefully: if the stored value is not a { level, value } envelope
 * (e.g. legacy plain data), it is returned as-is.
 *
 * @param {Store}  store    - electron-store instance
 * @param {string} dataKey  - key to read
 * @param {any}    fallback - returned when key is absent
 * @returns {any} revealed value
 */
function secureGet(store, dataKey, fallback = null) {
  const raw = store.get(dataKey, undefined);
  if (raw === undefined) return fallback;
  // Detect envelope format { level: number, value: any }
  if (raw !== null && typeof raw === 'object' && 'level' in raw && 'value' in raw) {
    return C.reveal(raw) ?? fallback;
  }
  // Legacy / plain value — return directly
  return raw ?? fallback;
}

/**
 * Re-protect all keys in a store at their new criticality levels.
 * Called when the user changes criticality settings.
 * Returns a summary { upgraded, downgraded, unchanged }.
 */
function reprotectStore(store, keyList) {
  const summary = { upgraded: 0, downgraded: 0, unchanged: 0 };
  for (const key of keyList) {
    const raw     = store.get(key, undefined);
    if (raw === undefined) continue;

    // Get current stored level
    const storedLevel = (raw !== null && typeof raw === 'object' && 'level' in raw)
      ? raw.level : -1; // -1 means legacy plain

    const targetLevel = S.getCriticality(key);

    if (storedLevel === targetLevel) { summary.unchanged++; continue; }

    // Reveal the current value
    const revealed = storedLevel === -1 ? raw : (C.reveal(raw) ?? raw);

    // Re-protect at new level
    store.set(key, C.protect(revealed, targetLevel));

    if (targetLevel > storedLevel) summary.upgraded++;
    else summary.downgraded++;
  }
  return summary;
}

// ─── Upload paths ─────────────────────────────────────────────────────────────
const uploadsBase = path.join(app.getPath('userData'), 'uploads');
if (!fs.existsSync(uploadsBase)) fs.mkdirSync(uploadsBase, { recursive: true });
function profileDir(id) {
  const d = path.join(uploadsBase, id || 'default');
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
}

// ─── Window ───────────────────────────────────────────────────────────────────
let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380, height: 880, minWidth: 1000, minHeight: 680,
    frame: false, titleBarStyle: 'hidden', backgroundColor: '#0a0a0f',
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(async () => { createWindow(); await initSpell(); registerGlobalShortcut(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate',          () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('will-quit',         () => globalShortcut.unregisterAll());

function registerGlobalShortcut() {
  try {
    globalShortcut.register('CmdOrCtrl+Shift+A', () => {
      if (mainWindow) mainWindow.isFocused() ? mainWindow.blur() : mainWindow.focus();
    });
  } catch(_) {}
}

// ─── Window controls ──────────────────────────────────────────────────────────
ipcMain.on('win-min',   () => mainWindow?.minimize());
ipcMain.on('win-max',   () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('win-close', () => mainWindow?.close());
ipcMain.handle('open-data-folder', () => shell.openPath(app.getPath('userData')));
ipcMain.handle('open-url',         (_, url) => shell.openExternal(url));

// ─── Profiles ────────────────────────────────────────────────────────────────
ipcMain.handle('get-profiles',    ()                => ({ profiles: S.getProfiles(), active: S.activeId() }));
ipcMain.handle('switch-profile',  (_, id)           => { S.switchProfile(id); return true; });
ipcMain.handle('create-profile',  (_, name)         => {
  const id = Date.now().toString(36);
  const list = S.getProfiles(); list.push({ id, name }); S.setProfiles(list); return id;
});
ipcMain.handle('delete-profile',  (_, id) => {
  if (id === 'default') return false;
  S.setProfiles(S.getProfiles().filter(p => p.id !== id));
  if (S.activeId() === id) S.switchProfile('default');
  S.invalidateProfile(id);
  return true;
});
ipcMain.handle('rename-profile',  (_, { id, name }) => {
  const list = S.getProfiles(); const p = list.find(x => x.id === id);
  if (p) { p.name = name; S.setProfiles(list); } return true;
});

// ─── Settings store (plain, no criticality) ──────────────────────────────────
const DEFAULT_UI = () => ({
  theme: 'Sombre (défaut)',
  tabOrder: ['compose','documents','templates','thread','tracker','calendar','stats'],
  shortcuts: {},
  tutorialDone: false
});

ipcMain.handle('get-settings', () => S.activeSettings().get('ui', DEFAULT_UI()));
ipcMain.handle('save-settings', (_, ui) => { S.activeSettings().set('ui', ui); return true; });
ipcMain.handle('get-themes',    ()           => S.activeSettings().get('themes', {}));
ipcMain.handle('save-theme',    (_, { name, tokens }) => {
  const t = S.activeSettings().get('themes', {}); t[name] = tokens; S.activeSettings().set('themes', t); return true;
});
ipcMain.handle('delete-theme',  (_, name) => {
  const t = S.activeSettings().get('themes', {}); delete t[name]; S.activeSettings().set('themes', t); return true;
});
ipcMain.handle('export-theme', async (_, { name, tokens }) => {
  const r = await dialog.showSaveDialog(mainWindow, { title:'Exporter le thème', defaultPath:`theme_${name.replace(/\s+/g,'_')}.json`, filters:[{name:'Thème AlterMail',extensions:['json']}] });
  if (r.canceled) return false;
  fs.writeFileSync(r.filePath, JSON.stringify({ name, tokens, version:1 }, null, 2), 'utf8');
  return true;
});
ipcMain.handle('import-theme', async () => {
  const r = await dialog.showOpenDialog(mainWindow, { title:'Importer un thème', filters:[{name:'Thème AlterMail',extensions:['json']}], properties:['openFile'] });
  if (r.canceled) return null;
  try {
    const d = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
    if (!d.name || !d.tokens) return null;
    const t = S.activeSettings().get('themes', {}); t[d.name] = d.tokens; S.activeSettings().set('themes', t);
    return { name: d.name, tokens: d.tokens };
  } catch(e) { return null; }
});

// ─── Security config store (plain — only stores integers 0-3) ────────────────

/**
 * Returns the full criticality map for the active profile,
 * merged with defaults. Shape: { mailConfig: 2, sentMails: 1, ... }
 */
ipcMain.handle('get-criticality', () => S.getAllCriticality());

/**
 * Update criticality levels. After saving, re-protect all affected data
 * so existing records are immediately migrated to the new level.
 * Returns a summary of what was changed.
 */
ipcMain.handle('save-criticality', async (_, newLevels) => {
  // Snapshot old levels before writing
  const oldLevels = S.getAllCriticality();
  S.setAllCriticality(newLevels);

  // Re-protect DATA store keys that changed
  const dataKeys  = ['coverLetter','templates','sentMails','tracker','trackerSettings','cv'];
  const credKeys  = ['mailConfig'];
  const summary   = { data: {}, credentials: {} };

  for (const key of dataKeys) {
    if (oldLevels[key] !== newLevels[key]) {
      summary.data[key] = reprotectStore(S.activeData(), [key]);
    }
  }
  for (const key of credKeys) {
    if (oldLevels[key] !== newLevels[key]) {
      summary.credentials[key] = reprotectStore(S.activeCredentials(), [key]);
    }
  }

  return { success: true, summary };
});

// ─── CV (data store) ──────────────────────────────────────────────────────────
ipcMain.handle('upload-cv', async () => {
  const r = await dialog.showOpenDialog(mainWindow, { title:'Sélectionner votre CV', filters:[{name:'PDF',extensions:['pdf']}], properties:['openFile'] });
  if (r.canceled) return null;
  const dest = path.join(profileDir(S.activeId()), 'cv.pdf');
  fs.copyFileSync(r.filePaths[0], dest);
  const info = { path: dest, name: path.basename(r.filePaths[0]) };
  secureSet(S.activeData(), 'cv', info);
  return info;
});
ipcMain.handle('get-cv-info', () => {
  const cv = secureGet(S.activeData(), 'cv', null);
  return (cv && fs.existsSync(cv.path)) ? cv : null;
});
ipcMain.handle('remove-cv', () => {
  const cv = secureGet(S.activeData(), 'cv', null);
  if (cv?.path && fs.existsSync(cv.path)) try { fs.unlinkSync(cv.path); } catch(_) {}
  S.activeData().delete('cv');
  return true;
});

// ─── Cover letter (data store) ────────────────────────────────────────────────
ipcMain.handle('save-cover-letter', (_, t) => { secureSet(S.activeData(), 'coverLetter', t); return true; });
ipcMain.handle('get-cover-letter',  ()    => secureGet(S.activeData(), 'coverLetter', ''));

// ─── Templates (data store) ───────────────────────────────────────────────────
const DEFAULT_TEMPLATES = () => [
  { id:'main',    name:'Principal', subject:'Candidature alternance — {poste} chez {entreprise_name}', body:'Madame, Monsieur,\n\nVeuillez trouver en pièce jointe mon CV et ma lettre de motivation pour le poste de {poste} au sein de {entreprise_name}.\n\nCordialement,\n{prenom} {nom}' },
  { id:'relance', name:'Relance',   subject:'Relance candidature — {poste} chez {entreprise_name}',    body:'Madame, Monsieur,\n\nJe me permets de revenir vers vous suite à ma candidature du {date_envoi} pour le poste de {poste}.\n\nRestant disponible pour tout entretien,\n{prenom} {nom}' },
];
ipcMain.handle('get-templates', () => {
  const t = secureGet(S.activeData(), 'templates', null);
  if (!t) { const d = DEFAULT_TEMPLATES(); secureSet(S.activeData(), 'templates', d); return d; }
  return t;
});
ipcMain.handle('save-templates', (_, t) => { secureSet(S.activeData(), 'templates', t); return true; });

// ─── Mail config (credentials store) ─────────────────────────────────────────
ipcMain.handle('save-mail-config', (_, cfg) => {
  secureSet(S.activeCredentials(), 'mailConfig', cfg);
  return true;
});
ipcMain.handle('get-mail-config', () => {
  return secureGet(S.activeCredentials(), 'mailConfig', null);
});

ipcMain.handle('test-connection', async (_, config) => {
  const nodemailer = require('nodemailer');
  const Imap       = require('imap');
  const res = { smtp:false, imap:false, smtpError:null, imapError:null };
  try { await makeTransporter(config, nodemailer).verify(); res.smtp = true; } catch(e) { res.smtpError = e.message; }
  if (config.mode === 'read' && config.imap) {
    try { await testImapConn(config, Imap); res.imap = true; } catch(e) { res.imapError = e.message; }
  }
  return res;
});

// ─── PDF generation ───────────────────────────────────────────────────────────
function generateCoverLetterPDF(text, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin:65, size:'A4' });
      const ws  = fs.createWriteStream(outputPath);
      doc.pipe(ws);
      doc.font('Helvetica-Bold').fontSize(11).text('Lettre de motivation', { align:'right' });
      doc.moveDown(0.4);
      doc.moveTo(65, doc.y).lineTo(doc.page.width - 65, doc.y).strokeColor('#cccccc').stroke();
      doc.moveDown(1.2);
      doc.font('Helvetica').fontSize(11).lineGap(3).text(text, { align:'justify' });
      doc.end(); ws.on('finish', resolve); ws.on('error', reject);
    } catch(e) { reject(e); }
  });
}

// ─── Send mail ────────────────────────────────────────────────────────────────
ipcMain.handle('send-mail', async (_, { to, subject, body, coverLetter, variables }) => {
  const nodemailer = require('nodemailer');
  const rawConfig  = secureGet(S.activeCredentials(), 'mailConfig', null);
  if (!rawConfig) return { success:false, error:'Aucune configuration mail.' };

  const dir    = profileDir(S.activeId());
  const cvInfo = secureGet(S.activeData(), 'cv', null);
  const rv     = (t) => (t||'').replace(/\{([^}]+)\}/g, (_,k) => variables[k] ?? `{${k}}`);
  const rS = rv(subject), rB = rv(body), rCL = rv(coverLetter||'');

  const clPath = path.join(dir, `cl_${Date.now()}.pdf`);
  let clOk = false;
  if (rCL.trim()) { try { await generateCoverLetterPDF(rCL, clPath); clOk = true; } catch(e) { console.error('PDF:', e.message); } }

  const attachments = [];
  if (cvInfo?.path && fs.existsSync(cvInfo.path)) attachments.push({ filename:cvInfo.name||'CV.pdf', path:cvInfo.path });
  if (clOk && fs.existsSync(clPath)) attachments.push({ filename:'Lettre_de_motivation.pdf', path:clPath });

  try {
    await makeTransporter(rawConfig, nodemailer).sendMail({
      from: rawConfig.email, to, subject: rS,
      html: `<div style="font-family:Georgia,serif;font-size:14px;line-height:1.75;color:#1a1a1a;max-width:580px">${rB.replace(/\n/g,'<br>')}</div>`,
      attachments, headers: { 'X-AlterMail':'true' }
    });
    if (clOk && fs.existsSync(clPath)) try { fs.unlinkSync(clPath); } catch(_) {}

    const mailId    = Date.now().toString(36) + Math.random().toString(36).slice(2,5);
    const sentMails = secureGet(S.activeData(), 'sentMails', []);
    sentMails.unshift({ id:mailId, to, subject:rS, body:rB, coverLetter:rCL, variables, sentAt:new Date().toISOString(), replies:[] });
    secureSet(S.activeData(), 'sentMails', sentMails.slice(0, 500));

    const domain     = (to.split('@')[1]||'').split('.');
    const enterprise = domain.slice(0,-1).join('.')||domain[0]||to;
    const tracker    = secureGet(S.activeData(), 'tracker', []);
    tracker.unshift({ id:'tr_'+mailId, enterprise:enterprise.charAt(0).toUpperCase()+enterprise.slice(1), department:'', contactType:'mail', date:new Date().toISOString().split('T')[0], response:'Candidature envoyée', comment:'', mailId, relances:[] });
    secureSet(S.activeData(), 'tracker', tracker);

    return { success:true, mailId };
  } catch(e) {
    if (clOk && fs.existsSync(clPath)) try { fs.unlinkSync(clPath); } catch(_) {}
    return { success:false, error:e.message };
  }
});

// ─── Sent mails (data store) ──────────────────────────────────────────────────
ipcMain.handle('get-sent-mails',   ()      => secureGet(S.activeData(), 'sentMails', []));
ipcMain.handle('delete-sent-mail', (_, id) => {
  const mails = secureGet(S.activeData(), 'sentMails', []).filter(m => m.id !== id);
  secureSet(S.activeData(), 'sentMails', mails);
  return true;
});

// ─── Fetch replies (IMAP) ─────────────────────────────────────────────────────
ipcMain.handle('fetch-replies', async () => {
  const Imap = require('imap');
  const { simpleParser } = require('mailparser');
  const config    = secureGet(S.activeCredentials(), 'mailConfig', null);
  if (!config)      return { success:false, error:'Pas de configuration mail.' };
  if (!config.imap) return { success:false, error:'IMAP non configuré. Activez "Envoi + Lecture" dans Paramètres.' };

  const sentMails = secureGet(S.activeData(), 'sentMails', []);
  const sentAddrs = new Set(sentMails.map(m => m.to.toLowerCase()));

  return new Promise((resolve) => {
    const imap = new Imap({ user:config.email, password:config.imapPassword||config.password||config.appPassword, host:config.imap.host, port:config.imap.port||993, tls:true, tlsOptions:{ rejectUnauthorized:false }, connTimeout:15000, authTimeout:10000 });
    imap.once('error', (e) => resolve({ success:false, error:e.message }));
    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err) => {
        if (err) { imap.end(); return resolve({ success:false, error:err.message }); }
        const since = new Date(Date.now() - 90*24*60*60*1000);
        imap.search([['SINCE', since]], (err, uids) => {
          if (err || !uids.length) { imap.end(); return resolve({ success:true, newReplies:0, sentMails }); }
          const fetch = imap.fetch(uids.slice(-150), { bodies:'' });
          const parsed = []; let pending = 0;
          fetch.on('message', (msg) => { pending++; msg.on('body', (stream) => { simpleParser(stream, (e,mail) => { if(!e) parsed.push(mail); pending--; }); }); });
          fetch.once('end', () => {
            const wait = () => {
              if (pending > 0) { setTimeout(wait, 80); return; }
              imap.end();
              let newReplies = 0;
              parsed.forEach(mail => {
                const fromAddr = (mail.from?.value?.[0]?.address||'').toLowerCase();
                if (!sentAddrs.has(fromAddr)) return;
                const replyId = mail.messageId || (fromAddr + (mail.date?.toISOString()||''));
                sentMails.forEach(sm => {
                  if (sm.to.toLowerCase() !== fromAddr) return;
                  if (!Array.isArray(sm.replies)) sm.replies = [];
                  if (sm.replies.some(r => r.id === replyId)) return;
                  sm.replies.push({ id:replyId, from:fromAddr, subject:mail.subject||'(sans objet)', date:mail.date?.toISOString()||new Date().toISOString(), preview:(mail.text||'').slice(0,400).trim(), read:false });
                  newReplies++;
                });
              });
              secureSet(S.activeData(), 'sentMails', sentMails);
              if (newReplies > 0 && Notification.isSupported()) {
                new Notification({ title:'AlterMail — Nouvelles réponses', body:`${newReplies} réponse${newReplies>1?'s':''}.` }).show();
              }
              resolve({ success:true, newReplies, sentMails });
            };
            wait();
          });
        });
      });
    });
    imap.connect();
  });
});

ipcMain.handle('mark-reply-read', (_, { mailId, replyId }) => {
  const mails = secureGet(S.activeData(), 'sentMails', []);
  const mail  = mails.find(m => m.id === mailId);
  if (mail) {
    const r = (mail.replies||[]).find(r => r.id === replyId);
    if (r) { r.read = true; secureSet(S.activeData(), 'sentMails', mails); }
  }
  return true;
});

// ─── Tracker (data store) ─────────────────────────────────────────────────────
ipcMain.handle('get-tracker',  ()       => secureGet(S.activeData(), 'tracker', []));
ipcMain.handle('save-tracker', (_, rows) => { secureSet(S.activeData(), 'tracker', rows); return true; });

ipcMain.handle('get-tracker-settings', () =>
  secureGet(S.activeData(), 'trackerSettings', {
    relanceDays:14, maxRelances:3,
    customContactTypes:['mail','téléphone','LinkedIn','en personne','forum'],
    customResponses:['Candidature envoyée','Aucune réponse','Réponse positive','Refus entreprise','Refus personnel','Candidature fermée']
  })
);
ipcMain.handle('save-tracker-settings', (_, s) => { secureSet(S.activeData(), 'trackerSettings', s); return true; });

ipcMain.handle('export-tracker', async (_, { format, rows }) => {
  const filt = { xlsx:[{name:'Excel',extensions:['xlsx']}], ods:[{name:'LibreOffice Calc',extensions:['ods']}], csv:[{name:'CSV',extensions:['csv']}] };
  const r = await dialog.showSaveDialog(mainWindow, { title:'Exporter', defaultPath:`AlterMail_suivi_${new Date().toISOString().split('T')[0]}`, filters:filt[format]||filt.csv });
  if (r.canceled) return false;
  try {
    const header = ['Entreprise','Département','Type','Date','Réponse','Commentaire','Relances'];
    const dRows  = [header, ...rows.map(row => [row.enterprise||'',row.department||'',row.contactType||'',row.date||'',row.response||'',row.comment||'',(row.relances||[]).map(x=>x.date+(x.result?` (${x.result})`:'')).join(' | ')])];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(dRows);
    ws['!cols'] = [16,14,12,10,16,20,22].map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb, ws, 'Suivi');
    if (format === 'csv') fs.writeFileSync(r.filePath, '\ufeff' + XLSX.utils.sheet_to_csv(ws), 'utf8');
    else XLSX.writeFile(wb, r.filePath);
    return true;
  } catch(e) { return false; }
});

// ─── Stats ────────────────────────────────────────────────────────────────────
ipcMain.handle('get-stats', () => {
  const sentMails = secureGet(S.activeData(), 'sentMails', []);
  const tracker   = secureGet(S.activeData(), 'tracker',   []);
  const total        = sentMails.length;
  const withReplies  = sentMails.filter(m => (m.replies||[]).length > 0).length;
  const totalReplies = sentMails.reduce((a,m) => a+(m.replies||[]).length, 0);
  const replyRate    = total > 0 ? Math.round((withReplies/total)*100) : 0;
  const byResponse   = {}; tracker.forEach(r => { byResponse[r.response] = (byResponse[r.response]||0)+1; });
  const byMonth      = {}; sentMails.forEach(m => { const k=m.sentAt?.slice(0,7)||''; if(k) byMonth[k]=(byMonth[k]||0)+1; });
  const positive     = tracker.filter(r => r.response==='Réponse positive').length;
  const refused      = tracker.filter(r => ['Refus entreprise','Refus personnel'].includes(r.response)).length;
  return { total, withReplies, totalReplies, replyRate, byResponse, byMonth, positive, refused };
});

// ─── Spellcheck ───────────────────────────────────────────────────────────────
ipcMain.handle('spellcheck', (_, text) => {
  if (!spell) return [];
  const errors = []; const seen = new Set();
  (text.match(/[a-zA-ZÀ-ÿ'-]+/g)||[]).forEach(w => {
    if (w.length < 3 || seen.has(w.toLowerCase())) return;
    seen.add(w.toLowerCase());
    if (!spell.correct(w)) errors.push({ word:w, suggestions:spell.suggest(w).slice(0,5) });
  });
  return errors;
});

// ─── Context menu ─────────────────────────────────────────────────────────────
ipcMain.on('show-context-menu', (event, params) => {
  const items = [];
  if (params.type === 'editable') {
    if (params.misspelledWord) {
      (params.suggestions||[]).slice(0,5).forEach(s => items.push({ label:s, click:()=>event.sender.replaceMisspelling(s) }));
      if (items.length) items.push({ type:'separator' });
    }
    items.push({ label:'Couper', role:'cut', enabled:params.hasSelection });
    items.push({ label:'Copier', role:'copy', enabled:params.hasSelection });
    items.push({ label:'Coller', role:'paste' });
    items.push({ type:'separator' });
    items.push({ label:'Tout sélectionner', role:'selectAll' });
  } else {
    if (params.hasSelection) { items.push({ label:'Copier', role:'copy' }); items.push({ type:'separator' }); }
    if (params.type === 'link') {
      items.push({ label:'Ouvrir le lien', click:()=>shell.openExternal(params.href) });
      items.push({ label:'Copier le lien', click:()=>require('electron').clipboard.writeText(params.href) });
    }
  }
  if (items.length) Menu.buildFromTemplate(items).popup({ window:mainWindow });
});

// ─── Reply polling ────────────────────────────────────────────────────────────
let _pt = null;
ipcMain.on('start-reply-polling', () => {
  if (_pt) return;
  _pt = setInterval(() => {
    const cfg = secureGet(S.activeCredentials(), 'mailConfig', null);
    if (cfg?.imap && cfg.mode === 'read') { /* renderer handles actual fetch */ }
  }, 5*60*1000);
});
ipcMain.on('stop-reply-polling', () => { if (_pt) { clearInterval(_pt); _pt = null; } });

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeTransporter(config, nodemailer) {
  if (config.provider === 'gmail')
    return nodemailer.createTransport({ service:'gmail', auth:{ user:config.email, pass:config.appPassword } });
  if (config.provider === 'outlook')
    return nodemailer.createTransport({ host:'smtp.office365.com', port:587, secure:false, auth:{ user:config.email, pass:config.password } });
  return nodemailer.createTransport({ host:config.smtp?.host||'', port:config.smtp?.port||587, secure:config.smtp?.port===465, auth:{ user:config.email, pass:config.password } });
}

function testImapConn(config, Imap) {
  return new Promise((resolve, reject) => {
    const imap = new Imap({ user:config.email, password:config.imapPassword||config.password||config.appPassword, host:config.imap.host, port:config.imap.port||993, tls:true, tlsOptions:{ rejectUnauthorized:false }, connTimeout:8000, authTimeout:6000 });
    imap.once('ready', () => { imap.end(); resolve(); });
    imap.once('error', reject);
    imap.connect();
  });
}
