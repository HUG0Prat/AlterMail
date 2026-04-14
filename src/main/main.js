'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Notification } = require('electron');
const path   = require('path');
const fs     = require('fs');
const Store  = require('electron-store');
const nodemailer = require('nodemailer');
const Imap   = require('imap');
const { simpleParser } = require('mailparser');
const PDFDocument = require('pdfkit');

// ─── Stores ──────────────────────────────────────────────────────────────────
const metaStore = new Store({ name: 'meta' });

function getProfileStore(id) { return new Store({ name: `profile_${id}` }); }
function getActiveStore()    { return getProfileStore(metaStore.get('activeProfile', 'default')); }
function getActiveId()       { return metaStore.get('activeProfile', 'default'); }

// ─── Paths ───────────────────────────────────────────────────────────────────
const uploadsBase = path.join(app.getPath('userData'), 'uploads');
if (!fs.existsSync(uploadsBase)) fs.mkdirSync(uploadsBase, { recursive: true });

function profileDir(id) {
  const d = path.join(uploadsBase, id || 'default');
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
}

// ─── Window ──────────────────────────────────────────────────────────────────
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360, height: 860, minWidth: 980, minHeight: 660,
    frame: false, titleBarStyle: 'hidden', backgroundColor: '#0a0a0f',
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ─── Window controls ─────────────────────────────────────────────────────────
ipcMain.on('win-min', () => mainWindow?.minimize());
ipcMain.on('win-max', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('win-close', () => mainWindow?.close());

// ─── Shell ───────────────────────────────────────────────────────────────────
ipcMain.handle('open-data-folder', () => shell.openPath(app.getPath('userData')));
ipcMain.handle('open-url',         (_, url) => shell.openExternal(url));

// ─── Profiles ────────────────────────────────────────────────────────────────
ipcMain.handle('get-profiles', () => ({
  profiles: metaStore.get('profiles', [{ id: 'default', name: 'Profil principal' }]),
  active:   getActiveId()
}));

ipcMain.handle('create-profile', (_, name) => {
  const id = Date.now().toString(36);
  const list = metaStore.get('profiles', [{ id: 'default', name: 'Profil principal' }]);
  list.push({ id, name });
  metaStore.set('profiles', list);
  return id;
});

ipcMain.handle('delete-profile', (_, id) => {
  if (id === 'default') return false;
  metaStore.set('profiles', metaStore.get('profiles', []).filter(p => p.id !== id));
  if (getActiveId() === id) metaStore.set('activeProfile', 'default');
  return true;
});

ipcMain.handle('rename-profile', (_, { id, name }) => {
  const list = metaStore.get('profiles', []);
  const p = list.find(x => x.id === id);
  if (p) { p.name = name; metaStore.set('profiles', list); }
  return true;
});

ipcMain.handle('switch-profile', (_, id) => { metaStore.set('activeProfile', id); return true; });

// ─── CV ──────────────────────────────────────────────────────────────────────
ipcMain.handle('upload-cv', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Sélectionner votre CV', filters: [{ name: 'PDF', extensions: ['pdf'] }], properties: ['openFile']
  });
  if (r.canceled) return null;
  const store = getActiveStore();
  const dest  = path.join(profileDir(getActiveId()), 'cv.pdf');
  fs.copyFileSync(r.filePaths[0], dest);
  const info = { path: dest, name: path.basename(r.filePaths[0]) };
  store.set('cv', info);
  return info;
});

ipcMain.handle('get-cv-info', () => {
  const cv = getActiveStore().get('cv', null);
  return (cv && fs.existsSync(cv.path)) ? cv : null;
});

ipcMain.handle('remove-cv', () => {
  const store = getActiveStore();
  const cv    = store.get('cv', null);
  if (cv?.path && fs.existsSync(cv.path)) try { fs.unlinkSync(cv.path); } catch(_) {}
  store.delete('cv');
  return true;
});

// ─── Cover letter ─────────────────────────────────────────────────────────────
ipcMain.handle('save-cover-letter', (_, t) => { getActiveStore().set('coverLetter', t); return true; });
ipcMain.handle('get-cover-letter',  ()    => getActiveStore().get('coverLetter', ''));

// ─── Templates (multi) ────────────────────────────────────────────────────────
const DEFAULT_TEMPLATES = () => [
  { id: 'main',    name: 'Principal', subject: 'Candidature alternance — {poste} chez {entreprise_name}', body: 'Madame, Monsieur,\n\nVeuillez trouver en pièce jointe mon CV et ma lettre de motivation pour le poste de {poste} au sein de {entreprise_name}.\n\nCordialement,\n{prenom} {nom}' },
  { id: 'relance', name: 'Relance',   subject: 'Relance candidature — {poste} chez {entreprise_name}',    body: 'Madame, Monsieur,\n\nJe me permets de revenir vers vous suite à ma candidature du {date_envoi} pour le poste de {poste}.\n\nRestant disponible pour tout entretien,\n{prenom} {nom}' },
];

ipcMain.handle('get-templates', () => {
  const store = getActiveStore();
  let tpls = store.get('templates', null);
  if (!tpls) {
    // Migrate old single template
    const old = store.get('template', null);
    tpls = DEFAULT_TEMPLATES();
    if (old) { tpls[0].subject = old.subject || tpls[0].subject; tpls[0].body = old.body || tpls[0].body; }
    store.set('templates', tpls);
  }
  return tpls;
});

ipcMain.handle('save-templates', (_, tpls) => { getActiveStore().set('templates', tpls); return true; });

// ─── Mail config ──────────────────────────────────────────────────────────────
ipcMain.handle('save-mail-config', (_, c) => { getActiveStore().set('mailConfig', c); return true; });
ipcMain.handle('get-mail-config',  ()     => getActiveStore().get('mailConfig', null));

ipcMain.handle('test-connection', async (_, config) => {
  const res = { smtp: false, imap: false, smtpError: null, imapError: null };
  try { const t = createTransporter(config); await t.verify(); res.smtp = true; } catch(e) { res.smtpError = e.message; }
  if (config.mode === 'read' && config.imap) {
    try { await testImapConn(config); res.imap = true; } catch(e) { res.imapError = e.message; }
  }
  return res;
});

function testImapConn(config) {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: config.email,
      password: config.imapPassword || config.password || config.appPassword,
      host: config.imap.host, port: config.imap.port || 993,
      tls: true, tlsOptions: { rejectUnauthorized: false }, connTimeout: 8000, authTimeout: 6000
    });
    imap.once('ready', () => { imap.end(); resolve(); });
    imap.once('error', reject);
    imap.connect();
  });
}

// ─── PDF generation ───────────────────────────────────────────────────────────
function generateCoverLetterPDF(text, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 65, size: 'A4' });
      const ws  = fs.createWriteStream(outputPath);
      doc.pipe(ws);
      doc.font('Helvetica-Bold').fontSize(11).text('Lettre de motivation', { align: 'right' });
      doc.moveDown(0.4);
      doc.moveTo(65, doc.y).lineTo(doc.page.width - 65, doc.y).strokeColor('#cccccc').stroke();
      doc.moveDown(1.2);
      doc.font('Helvetica').fontSize(11).lineGap(3).text(text, { align: 'justify' });
      doc.end();
      ws.on('finish', resolve);
      ws.on('error', reject);
    } catch(e) { reject(e); }
  });
}

// ─── Send mail ────────────────────────────────────────────────────────────────
ipcMain.handle('send-mail', async (_, { to, subject, body, coverLetter, variables }) => {
  const store  = getActiveStore();
  const config = store.get('mailConfig', null);
  if (!config) return { success: false, error: 'Aucune configuration mail.' };

  const dir    = profileDir(getActiveId());
  const cvInfo = store.get('cv', null);
  const rv     = (t) => (t || '').replace(/\{([^}]+)\}/g, (_, k) => variables[k] ?? `{${k}}`);

  const rSubject = rv(subject);
  const rBody    = rv(body);
  const rCL      = rv(coverLetter || '');

  // Generate LM PDF
  const clPath = path.join(dir, `cl_${Date.now()}.pdf`);
  let clOk = false;
  if (rCL.trim()) {
    try { await generateCoverLetterPDF(rCL, clPath); clOk = true; } catch(e) { console.error('PDF:', e.message); }
  }

  const attachments = [];
  if (cvInfo?.path && fs.existsSync(cvInfo.path)) attachments.push({ filename: cvInfo.name || 'CV.pdf', path: cvInfo.path });
  if (clOk && fs.existsSync(clPath)) attachments.push({ filename: 'Lettre_de_motivation.pdf', path: clPath });

  try {
    await createTransporter(config).sendMail({
      from: config.email, to, subject: rSubject,
      html: `<div style="font-family:Georgia,serif;font-size:14px;line-height:1.75;color:#1a1a1a;max-width:580px">${rBody.replace(/\n/g,'<br>')}</div>`,
      attachments, headers: { 'X-AlterMail': 'true' }
    });

    if (clOk && fs.existsSync(clPath)) try { fs.unlinkSync(clPath); } catch(_) {}

    // Build mail record
    const mailId    = Date.now().toString(36) + Math.random().toString(36).slice(2,5);
    const sentMails = store.get('sentMails', []);
    sentMails.unshift({ id: mailId, to, toDomain: '@'+(to.split('@')[1]||''), subject: rSubject, body: rBody, coverLetter: rCL, variables, sentAt: new Date().toISOString(), replies: [] });
    store.set('sentMails', sentMails.slice(0, 500));

    // Auto-add tracker row
    const domain     = (to.split('@')[1] || '').split('.');
    const enterprise = domain.slice(0, -1).join('.') || domain[0] || to;
    const tracker    = store.get('tracker', []);
    tracker.unshift({
      id: 'tr_' + mailId,
      enterprise: enterprise.charAt(0).toUpperCase() + enterprise.slice(1),
      department: '',
      contactType: 'mail',
      date: new Date().toISOString().split('T')[0],
      response: 'Candidature envoyée',
      comment: '',
      mailId,
      relances: []
    });
    store.set('tracker', tracker);

    return { success: true, mailId };
  } catch(e) {
    if (clOk && fs.existsSync(clPath)) try { fs.unlinkSync(clPath); } catch(_) {}
    return { success: false, error: e.message };
  }
});

// ─── Sent mails ───────────────────────────────────────────────────────────────
ipcMain.handle('get-sent-mails',   ()      => getActiveStore().get('sentMails', []));
ipcMain.handle('delete-sent-mail', (_, id) => {
  const s = getActiveStore();
  s.set('sentMails', s.get('sentMails', []).filter(m => m.id !== id));
  return true;
});

// ─── Fetch replies ────────────────────────────────────────────────────────────
ipcMain.handle('fetch-replies', async () => {
  const store  = getActiveStore();
  const config = store.get('mailConfig', null);
  if (!config)      return { success: false, error: 'Pas de configuration mail.' };
  if (!config.imap) return { success: false, error: 'IMAP non configuré. Activez "Envoi + Lecture" dans Paramètres.' };

  const sentMails = store.get('sentMails', []);

  return new Promise((resolve) => {
    const imap = new Imap({
      user: config.email,
      password: config.imapPassword || config.password || config.appPassword,
      host: config.imap.host, port: config.imap.port || 993,
      tls: true, tlsOptions: { rejectUnauthorized: false }, connTimeout: 15000, authTimeout: 10000
    });

    imap.once('error', (e) => resolve({ success: false, error: e.message }));
    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err) => {
        if (err) { imap.end(); return resolve({ success: false, error: err.message }); }

        const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        imap.search([['SINCE', since]], (err, uids) => {
          if (err || !uids.length) { imap.end(); return resolve({ success: true, newReplies: 0, sentMails }); }

          const fetch  = imap.fetch(uids.slice(-150), { bodies: '' });
          const parsed = [];
          let pending  = 0;

          fetch.on('message', (msg) => {
            pending++;
            msg.on('body', (stream) => {
              simpleParser(stream, (e, mail) => { if (!e) parsed.push(mail); pending--; });
            });
          });

          fetch.once('end', () => {
            const wait = () => {
              if (pending > 0) { setTimeout(wait, 80); return; }
              imap.end();
              let newReplies = 0;

              parsed.forEach(mail => {
                const fromAddr   = (mail.from?.value?.[0]?.address || '').toLowerCase();
                const fromDomain = '@' + (fromAddr.split('@')[1] || '');
                const replyId    = mail.messageId || (fromAddr + (mail.date?.toISOString() || ''));
                const idx = sentMails.findIndex(m => m.to.toLowerCase() === fromAddr || m.toDomain === fromDomain);
                if (idx === -1) return;
                if (!Array.isArray(sentMails[idx].replies)) sentMails[idx].replies = [];
                if (sentMails[idx].replies.some(r => r.id === replyId)) return;

                sentMails[idx].replies.push({
                  id: replyId, fromDomain,
                  subject: mail.subject || '(sans objet)',
                  date: mail.date?.toISOString() || new Date().toISOString(),
                  preview: (mail.text || '').slice(0, 300).trim(),
                  read: false
                });
                newReplies++;
              });

              store.set('sentMails', sentMails);

              if (newReplies > 0 && Notification.isSupported()) {
                new Notification({ title: 'AlterMail — Nouvelles réponses', body: `${newReplies} nouvelle${newReplies>1?'s':''} réponse${newReplies>1?'s':''}.` }).show();
              }

              resolve({ success: true, newReplies, sentMails });
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
  const store = getActiveStore();
  const mails = store.get('sentMails', []);
  const mail  = mails.find(m => m.id === mailId);
  if (mail) {
    const r = (mail.replies||[]).find(r => r.id === replyId);
    if (r) { r.read = true; store.set('sentMails', mails); }
  }
  return true;
});

// ─── Tracker ──────────────────────────────────────────────────────────────────
ipcMain.handle('get-tracker',  ()       => getActiveStore().get('tracker', []));
ipcMain.handle('save-tracker', (_, rows) => { getActiveStore().set('tracker', rows); return true; });

ipcMain.handle('get-tracker-settings', () =>
  getActiveStore().get('trackerSettings', {
    relanceDays: 14,
    maxRelances: 3,
    customContactTypes: ['mail', 'téléphone', 'LinkedIn', 'en personne', 'forum'],
    customResponses: ['Candidature envoyée', 'Aucune réponse', 'Réponse positive', 'Refus entreprise', 'Refus personnel', 'Candidature fermée']
  })
);
ipcMain.handle('save-tracker-settings', (_, s) => { getActiveStore().set('trackerSettings', s); return true; });

// ─── Reply polling ────────────────────────────────────────────────────────────
let _pollTimer = null;
ipcMain.on('start-reply-polling', () => {
  if (_pollTimer) return;
  _pollTimer = setInterval(() => {
    const store = getActiveStore();
    const cfg   = store.get('mailConfig', null);
    if (cfg?.imap && cfg.mode === 'read') {
      // fire and forget background fetch
      ipcMain.listeners('fetch-replies')[0]?.({ reply: () => {} }, null);
    }
  }, 5 * 60 * 1000);
});
ipcMain.on('stop-reply-polling', () => { if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; } });

// ─── Helpers ─────────────────────────────────────────────────────────────────
function createTransporter(config) {
  if (config.provider === 'gmail')
    return nodemailer.createTransport({ service: 'gmail', auth: { user: config.email, pass: config.appPassword } });
  if (config.provider === 'outlook')
    return nodemailer.createTransport({ host: 'smtp.office365.com', port: 587, secure: false, auth: { user: config.email, pass: config.password } });
  return nodemailer.createTransport({
    host: config.smtp?.host || '', port: config.smtp?.port || 587,
    secure: config.smtp?.port === 465, auth: { user: config.email, pass: config.password }
  });
}
