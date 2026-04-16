/* AlterMail v5 — Renderer */
'use strict';
const api = window.am;

// ════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════
const S = {
  page: 'compose', profiles: [], activeProfile: 'default',
  cv: null, coverLetter: '', templates: [],
  mailConfig: null, sentMails: [], tracker: [], trackerSettings: {},
  stats: {},
  criticality: {},
  // UI settings
  ui: {
    theme: 'Sombre (défaut)',
    tabOrder: ['compose','documents','templates','thread','tracker','calendar','stats'],
    shortcuts: {},
    tutorialDone: false
  },
  customThemes: {}
};

// ── Default shortcuts ──────────────────────────────────────────────────────────
const DEFAULT_SHORTCUTS = {
  compose:   { keys: ['Alt','1'], label: 'Aller à Composer' },
  documents: { keys: ['Alt','2'], label: 'Aller à Documents' },
  templates: { keys: ['Alt','3'], label: 'Aller à Modèles' },
  thread:    { keys: ['Alt','4'], label: 'Aller à Conversations' },
  tracker:   { keys: ['Alt','5'], label: 'Aller à Suivi' },
  calendar:  { keys: ['Alt','6'], label: 'Aller à Calendrier' },
  stats:     { keys: ['Alt','7'], label: 'Aller à Statistiques' },
  settings:  { keys: ['Alt','8'], label: 'Paramètres' },
  send:      { keys: ['Ctrl','Enter'], label: 'Envoyer le mail' },
  save:      { keys: ['Ctrl','S'], label: 'Enregistrer' },
  spell:     { keys: ['F7'], label: 'Vérifier l\'orthographe' },
  theme:     { keys: ['T'], label: 'Basculer le thème' },
  help:      { keys: ['?'], label: 'Afficher les raccourcis' },
};

// ── Built-in themes ────────────────────────────────────────────────────────────
const BUILTIN_THEMES = {
  'Sombre (défaut)': 'dark',
  'Clair':           'light',
  'Minuit':          'midnight',
  'Forêt':           'forest',
  'Océan':           'ocean',
};

// ════════════════════════════════════════════════════
// BOOT
// ════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  await loadAll();
  setupWindow();
  setupContextMenu();
  setupKeyboardShortcuts();
  renderSidebar();
  setupNav();
  renderPage(S.page);
  api.startReplyPolling();
  checkRelanceReminders();
  setInterval(checkRelanceReminders, 60 * 60 * 1000);
  if (!S.ui.tutorialDone) setTimeout(startTutorial, 600);
});

async function loadAll() {
  const [pf, cv, cl, tpls, cfg, mails, trk, trks, stats, ui, themes, crit] = await Promise.all([
    api.getProfiles(), api.getCVInfo(), api.getCoverLetter(),
    api.getTemplates(), api.getMailConfig(), api.getSentMails(),
    api.getTracker(), api.getTrackerSettings(), api.getStats(),
    api.getSettings(), api.getThemes(), api.getCriticality()
  ]);
  S.profiles = pf.profiles; S.activeProfile = pf.active;
  S.cv = cv; S.coverLetter = cl; S.templates = tpls; S.mailConfig = cfg;
  S.sentMails = mails; S.tracker = trk; S.trackerSettings = trks; S.stats = stats;
  S.ui = { ...S.ui, ...ui };
  S.customThemes = themes || {};
  S.criticality  = crit  || {};
  applyTheme(S.ui.theme);
  updateBadges();
  updateProfileDisplay();
}

// ════════════════════════════════════════════════════
// THEME
// ════════════════════════════════════════════════════
function applyTheme(theme) {
  const root = document.documentElement;
  // Custom theme: apply CSS vars directly
  if (S.customThemes?.[theme]) {
    root.setAttribute('data-theme', 'dark'); // base fallback
    const tokens = S.customThemes[theme];
    Object.entries(tokens).forEach(([k, v]) => root.style.setProperty(k, v));
  } else {
    // Remove any custom vars
    const known = ['--bg0','--bg1','--bg2','--bg3','--bg4','--bd','--bd2','--t1','--t2','--t3','--accent','--aH','--a2','--a3','--warn','--err','--glow','--shadow'];
    known.forEach(k => root.style.removeProperty(k));
    root.setAttribute('data-theme', BUILTIN_THEMES[theme] || theme);
  }
  S.ui.theme = theme;
  updateThemeIcon();
}

function updateThemeIcon() {
  const icon = document.getElementById('theme-icon');
  if (!icon) return;
  const isDark = ['dark','midnight','forest','ocean'].includes(S.ui.theme) ||
    !!S.customThemes?.[S.ui.theme];
  icon.innerHTML = isDark
    ? `<path d="M11 6.5a4.5 4.5 0 01-4.5 4.5A4.5 4.5 0 012 6.5 4.5 4.5 0 016.5 2c-.5 1-.8 2.2-.8 3.5 0 3.3 2.7 6 6 6 .5 0 1-.06 1.5-.18A4.47 4.47 0 0111 6.5z" fill="currentColor"/>`
    : `<circle cx="6.5" cy="6.5" r="3" stroke="currentColor" stroke-width="1.2"/><path d="M6.5 1v1.5M6.5 10v1.5M1 6.5h1.5M10 6.5h1.5M2.7 2.7l1 1M9.3 9.3l1 1M2.7 10.3l1-1M9.3 3.7l1-1" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>`;
}

async function cycleTheme() {
  const all = [...Object.keys(BUILTIN_THEMES), ...Object.keys(S.customThemes)];
  const idx = all.indexOf(S.ui.theme);
  S.ui.theme = all[(idx + 1) % all.length] || 'Sombre (défaut)';
  applyTheme(S.ui.theme);
  await saveSettings();
}

// ════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ════════════════════════════════════════════════════
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    const isTyping = ['INPUT','TEXTAREA','SELECT'].includes(tag) || document.activeElement?.isContentEditable;

    const key  = e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    const alt  = e.altKey;
    const shift= e.shiftKey;

    // Always available
    if (key === '?' && !isTyping && !ctrl && !alt) { e.preventDefault(); showShortcutsOverlay(); return; }
    if (key === 'T'  && !isTyping && !ctrl && !alt) { e.preventDefault(); cycleTheme(); return; }
    if (key === 'Escape') { closeAllModals(); return; }

    // Ctrl shortcuts (work anywhere except sending from inside textarea conflict)
    if (ctrl && key === 's') { e.preventDefault(); handleSaveShortcut(); return; }
    if (ctrl && key === 'Enter' && isTyping) { e.preventDefault(); triggerSend(); return; }
    if (key === 'F7') { e.preventDefault(); handleSpellShortcut(); return; }

    // Alt + number: navigate tabs
    if (alt && !ctrl && !shift) {
      const num = parseInt(key);
      if (num >= 1 && num <= 9) {
        e.preventDefault();
        const page = S.ui.tabOrder[num - 1];
        if (page) navigateTo(page);
      }
    }
  });
}

function handleSaveShortcut() {
  // Find and click first save button on page
  const btn = document.querySelector('#btn-save-tpl, #btn-save-cl, #btn-save-cfg');
  btn?.click();
}

function triggerSend() {
  const btn = document.querySelector('#btn-open-send, #sm-send');
  btn?.click();
}

function handleSpellShortcut() {
  const ta = document.querySelector('textarea:focus, textarea.inp');
  if (ta) doSpellcheck(ta);
}

function showShortcutsOverlay() {
  const ov   = document.getElementById('shortcuts-overlay');
  const body = document.getElementById('shortcuts-body');
  const shortcuts = { ...DEFAULT_SHORTCUTS, ...(S.ui.shortcuts||{}) };

  const navItems = S.ui.tabOrder.map((page, i) => {
    const s = shortcuts[page] || { keys: [`Alt+${i+1}`], label: `Aller à ${page}` };
    return s;
  });

  body.innerHTML = `
    <div class="shortcut-section">
      <div class="shortcut-section-title">Navigation</div>
      ${S.ui.tabOrder.map((page, i) => {
        const s = shortcuts[page] || DEFAULT_SHORTCUTS[page];
        if (!s) return '';
        return `<div class="shortcut-row"><span class="shortcut-desc">${esc(s.label)}</span><div class="shortcut-keys">${(s.keys||[]).map(k=>`<span class="kbd">${esc(k)}</span>`).join('<span style="color:var(--t3);font-size:11px">+</span>')}</div></div>`;
      }).join('')}
    </div>
    <div class="shortcut-section">
      <div class="shortcut-section-title">Actions</div>
      ${['send','save','spell','theme','help'].map(id => {
        const s = shortcuts[id] || DEFAULT_SHORTCUTS[id];
        if (!s) return '';
        return `<div class="shortcut-row"><span class="shortcut-desc">${esc(s.label)}</span><div class="shortcut-keys">${(s.keys||[]).map(k=>`<span class="kbd">${esc(k)}</span>`).join('<span style="color:var(--t3);font-size:11px">+</span>')}</div></div>`;
      }).join('')}
    </div>
    <div class="ib mt8"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M6.5 6v3.5M6.5 5v.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg><span>Les raccourcis de navigation peuvent être changés dans <strong>Paramètres → Raccourcis</strong>.</span></div>
  `;
  ov.classList.remove('hidden');
  document.getElementById('shortcuts-close').onclick = () => ov.classList.add('hidden');
  ov.onclick = (e) => { if (e.target === ov) ov.classList.add('hidden'); };
}

// ════════════════════════════════════════════════════
// SIDEBAR (draggable tab order)
// ════════════════════════════════════════════════════
const TAB_DEFS = {
  compose:   { label: 'Composer',       icon: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>` },
  documents: { label: 'Documents',      icon: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="1" width="8" height="11" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M4.5 4.5h5M4.5 7h3" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><circle cx="11" cy="11" r="2.5" fill="var(--bg0)" stroke="var(--a2)" stroke-width="1.1"/><path d="M10 11h2M11 10v2" stroke="var(--a2)" stroke-width=".9" stroke-linecap="round"/></svg>` },
  templates: { label: 'Modèles',        icon: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M3.5 13h7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M7 10v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M4 4.5h6M4 6.5h4" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>` },
  thread:    { label: 'Conversations',  icon: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M13 1L6 8M13 1l-3.5 10.5L7 8.5 3.5 6.5 13 1z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`, badge: 'bdg-thread' },
  tracker:   { label: 'Suivi',          icon: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M1 5h12M5 5v8" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>`, badge: 'bdg-tracker' },
  calendar:  { label: 'Calendrier',     icon: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="11" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M1 6h12M4.5 1v2.5M9.5 1v2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="4.5" cy="9" r="1" fill="currentColor"/><circle cx="7" cy="9" r="1" fill="currentColor"/></svg>` },
  stats:     { label: 'Statistiques',   icon: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 12h12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M2.5 12V8.5M5.5 12V6M8.5 12V9M11.5 12V4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>` },
};

function renderSidebar() {
  const container = document.getElementById('nav-items');
  if (!container) return;
  container.innerHTML = S.ui.tabOrder.map((page, idx) => {
    const def     = TAB_DEFS[page];
    if (!def) return '';
    const shortNum = idx + 1;
    return `
      <button class="ni ${S.page === page ? 'active' : ''}" data-page="${page}" draggable="true" data-idx="${idx}">
        ${def.icon}
        ${def.label}
        ${def.badge ? `<span class="bdg hidden" id="${def.badge}">0</span>` : ''}
        <span class="ni-shortcut-badge">Alt+${shortNum}</span>
        <span class="ni-drag" title="Réordonner">⠿</span>
      </button>`;
  }).join('');

  setupDragSort();
  updateBadges();
}

function setupDragSort() {
  const items = document.querySelectorAll('.ni[data-page][draggable]');
  let dragSrc = null;

  items.forEach(item => {
    item.addEventListener('dragstart', (e) => {
      dragSrc = item;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      document.querySelectorAll('.ni.drag-over').forEach(el => el.classList.remove('drag-over'));
    });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (item !== dragSrc) {
        document.querySelectorAll('.ni.drag-over').forEach(el => el.classList.remove('drag-over'));
        item.classList.add('drag-over');
      }
    });
    item.addEventListener('drop', async (e) => {
      e.preventDefault();
      if (!dragSrc || dragSrc === item) return;
      const srcPage  = dragSrc.dataset.page;
      const destPage = item.dataset.page;
      const srcIdx   = S.ui.tabOrder.indexOf(srcPage);
      const destIdx  = S.ui.tabOrder.indexOf(destPage);
      if (srcIdx < 0 || destIdx < 0) return;
      S.ui.tabOrder.splice(srcIdx, 1);
      S.ui.tabOrder.splice(destIdx, 0, srcPage);
      await saveSettings();
      renderSidebar();
      setupNav();
    });
  });
}

function setupNav() {
  document.querySelectorAll('.ni[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      navigateTo(btn.dataset.page);
    });
  });
  document.getElementById('ni-data')?.addEventListener('click', () => api.openDataFolder());
  document.getElementById('ni-shortcuts')?.addEventListener('click', showShortcutsOverlay);
  document.getElementById('tc-theme')?.addEventListener('click', cycleTheme);
}

function navigateTo(page) {
  S.page = page;
  document.querySelectorAll('.ni[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  renderPage(page);
}

function renderPage(page) {
  S.page = page;
  document.getElementById('content').innerHTML = '';
  const map = { compose, documents, templates, thread, tracker, calendar, stats, settings };
  map[page]?.(document.getElementById('content'));
}

function updateBadges() {
  const unread = S.sentMails.reduce((a,m) => a+(m.replies||[]).filter(r=>!r.read).length, 0);
  setBdg('bdg-thread', unread);
  setBdg('bdg-tracker', getRelancesToday().length);
}
function setBdg(id, n) {
  const el = document.getElementById(id);
  if (!el) return;
  n > 0 ? (el.textContent = n, el.classList.remove('hidden')) : el.classList.add('hidden');
}

async function saveSettings() {
  await api.saveSettings(S.ui);
}

// ════════════════════════════════════════════════════
// WINDOW
// ════════════════════════════════════════════════════
function setupWindow() {
  document.getElementById('tc-min').onclick = () => api.minimize();
  document.getElementById('tc-max').onclick = () => api.maximize();
  document.getElementById('tc-cls').onclick = () => api.close();
}

// ════════════════════════════════════════════════════
// TUTORIAL
// ════════════════════════════════════════════════════
const TUTORIAL_STEPS = [
  {
    icon: '✉️', iconBg: 'rgba(108,99,255,.15)',
    title: 'Bienvenue sur AlterMail',
    desc: 'L\'application qui simplifie l\'envoi de candidatures en alternance. Ce tutoriel rapide vous guidera à travers les fonctionnalités principales.',
    features: []
  },
  {
    icon: '📎', iconBg: 'rgba(61,220,151,.12)',
    title: 'Vos documents',
    desc: 'Uploadez votre <strong>CV en PDF</strong> et rédigez votre <strong>lettre de motivation</strong> une seule fois. Utilisez <code style="font-family:\'DM Mono\';background:var(--bg3);padding:1px 5px;border-radius:3px">{variable}</code> pour personnaliser chaque envoi.',
    features: [
      { icon: '📄', text: 'CV uploadé localement — jamais envoyé à des tiers' },
      { icon: '✍️', text: 'Lettre de motivation convertie en PDF automatiquement' },
    ]
  },
  {
    icon: '🚀', iconBg: 'rgba(108,99,255,.15)',
    title: 'Composer et envoyer',
    desc: 'Saisissez l\'email de l\'entreprise, remplissez les <strong>variables</strong> détectées, et voyez un <strong>aperçu en temps réel</strong> avant d\'envoyer.',
    features: [
      { icon: '⚡', text: 'Variables remplies automatiquement dans l\'objet, corps et LM' },
      { icon: '👁', text: 'Aperçu live avant chaque envoi + édition exceptionnelle' },
    ]
  },
  {
    icon: '📊', iconBg: 'rgba(255,209,102,.12)',
    title: 'Suivi des candidatures',
    desc: 'Chaque envoi est <strong>ajouté automatiquement</strong> au tableau de suivi. Suivez les statuts, ajoutez des relances et exportez vers Excel.',
    features: [
      { icon: '🔔', text: 'Rappels automatiques pour les relances' },
      { icon: '📅', text: 'Calendrier de relances et d\'événements' },
    ]
  },
  {
    icon: '⚙️', iconBg: 'rgba(255,107,157,.12)',
    title: 'Personnalisation',
    desc: 'Réorganisez la <strong>barre latérale</strong> par glisser-déposer, choisissez votre <strong>thème</strong> ou créez le vôtre, et configurez vos <strong>raccourcis clavier</strong>.',
    features: [
      { icon: '🎨', text: 'Thèmes intégrés + éditeur de thème personnalisé' },
      { icon: '🔐', text: 'Identifiants mail chiffrés AES-256-GCM' },
    ]
  },
];

let tutStep = 0;

function startTutorial() {
  tutStep = 0;
  document.getElementById('tutorial').classList.remove('hidden');
  renderTutorialStep();
}

function renderTutorialStep() {
  const step = TUTORIAL_STEPS[tutStep];
  const total = TUTORIAL_STEPS.length;
  const box   = document.getElementById('tutorial-box');

  box.innerHTML = `
    <div class="tutorial-step">
      <div class="tutorial-step-num">ÉTAPE ${tutStep + 1} / ${total}</div>
      <div class="tutorial-icon" style="background:${step.iconBg}">${step.icon}</div>
      <div class="tutorial-title">${step.title}</div>
      <div class="tutorial-desc">${step.desc}</div>
      ${step.features.length ? `<div class="tutorial-feat-list">${step.features.map(f => `<div class="tutorial-feat"><span class="tutorial-feat-icon">${f.icon}</span><span>${f.text}</span></div>`).join('')}</div>` : ''}
    </div>
    <div class="tutorial-footer">
      <div class="tutorial-dots">
        ${TUTORIAL_STEPS.map((_, i) => `<div class="tutorial-dot ${i === tutStep ? 'active' : ''}"></div>`).join('')}
      </div>
      <div class="row" style="gap:8px">
        ${tutStep > 0 ? `<button class="btn bg sm" id="tut-prev">← Précédent</button>` : ''}
        ${tutStep < total - 1
          ? `<button class="btn bp sm" id="tut-next">Suivant →</button>`
          : `<button class="btn bp sm" id="tut-done">Commencer !</button>`}
        <button class="btn bg sm" id="tut-skip" style="color:var(--t3)">Passer</button>
      </div>
    </div>
  `;

  document.getElementById('tut-next')?.addEventListener('click', () => { tutStep++; renderTutorialStep(); });
  document.getElementById('tut-prev')?.addEventListener('click', () => { tutStep--; renderTutorialStep(); });
  document.getElementById('tut-done')?.addEventListener('click', finishTutorial);
  document.getElementById('tut-skip')?.addEventListener('click', finishTutorial);
}

async function finishTutorial() {
  document.getElementById('tutorial').classList.add('hidden');
  S.ui.tutorialDone = true;
  await saveSettings();
}

// ════════════════════════════════════════════════════
// CONTEXT MENU
// ════════════════════════════════════════════════════
function setupContextMenu() {
  const menu = document.getElementById('ctx-menu');
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const target     = e.target;
    const isEditable = target.matches('input,textarea') || target.isContentEditable;
    const hasSel     = window.getSelection().toString().length > 0;
    const link       = target.closest('a');
    const items      = [];

    if (link) {
      items.push({ label: '🔗 Ouvrir', action: () => api.openUrl(link.href) });
      items.push({ label: '📋 Copier le lien', action: () => navigator.clipboard.writeText(link.href) });
      items.push('sep');
    }
    if (hasSel) items.push({ label: '📋 Copier', action: () => document.execCommand('copy') });
    if (isEditable) {
      if (hasSel) items.push({ label: '✂️ Couper', action: () => document.execCommand('cut') });
      items.push({ label: '📄 Coller', action: () => document.execCommand('paste') });
      items.push('sep');
      items.push({ label: '↩ Tout sélectionner', action: () => { target.select?.(); document.execCommand('selectAll'); } });
      items.push('sep');
      items.push({ label: '🔤 Vérifier l\'orthographe', action: () => doSpellcheck(target) });
    }
    if (!items.length) items.push({ label: '↩ Tout sélectionner', action: () => document.execCommand('selectAll') });

    menu.innerHTML = items.map((item, i) => {
      if (item === 'sep') return `<div class="ctx-sep"></div>`;
      return `<div class="ctx-item" data-idx="${i}">${item.label}</div>`;
    }).join('');

    const nonSep = items.filter(x => x !== 'sep');
    menu.style.left = Math.min(e.clientX, window.innerWidth  - 180) + 'px';
    menu.style.top  = Math.min(e.clientY, window.innerHeight - (nonSep.length * 34 + 20)) + 'px';
    menu.classList.remove('hidden');

    menu.querySelectorAll('.ctx-item').forEach(el => {
      el.onclick = () => {
        const realItems = items.filter(x => x !== 'sep');
        realItems[parseInt(el.dataset.idx)]?.action?.();
        menu.classList.add('hidden');
      };
    });
  });
  document.addEventListener('click', () => menu.classList.add('hidden'));
}

// ════════════════════════════════════════════════════
// PROFILE SWITCHER
// ════════════════════════════════════════════════════
const pswBtn = () => document.getElementById('psw-btn');
const pswDd  = () => document.getElementById('psw-dd');

function updateProfileDisplay() {
  const active = S.profiles.find(p => p.id === S.activeProfile);
  const el = document.getElementById('psw-name');
  if (el) el.textContent = active?.name || 'Profil';
  pswBtn()?.addEventListener('click', (e) => { e.stopPropagation(); pswDd()?.classList.toggle('hidden'); });
  document.addEventListener('click', (e) => {
    if (!document.getElementById('psw')?.contains(e.target)) pswDd()?.classList.add('hidden');
  }, { once: false });
  renderProfileDropdown();
}

function renderProfileDropdown() {
  const dd = pswDd(); if (!dd) return;
  dd.innerHTML = `
    ${S.profiles.map(p => `
      <div class="pi ${p.id === S.activeProfile ? 'active' : ''}" data-pid="${p.id}">
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><circle cx="5.5" cy="3.5" r="2.2" stroke="currentColor" stroke-width="1.1"/><path d="M1 9.5c0-2 2-3.5 4.5-3.5S10 7.5 10 9.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>
        <span>${esc(p.name)}</span>
        ${p.id !== 'default' ? `<div class="pi-acts"><button class="pi-ren" data-pid="${p.id}">✎</button><button class="pi-del" data-pid="${p.id}">✕</button></div>` : ''}
      </div>`).join('')}
    <div class="divider" style="margin:5px 0"></div>
    <div class="pi" id="pi-new"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg><span>Nouveau profil</span></div>`;

  dd.querySelectorAll('.pi[data-pid]').forEach(item => {
    item.addEventListener('click', async (e) => {
      if (e.target.closest('.pi-acts')) return;
      if (item.dataset.pid === S.activeProfile) { dd.classList.add('hidden'); return; }
      await api.switchProfile(item.dataset.pid); dd.classList.add('hidden');
      await loadAll(); renderSidebar(); setupNav(); renderPage(S.page);
    });
  });
  dd.querySelectorAll('.pi-ren').forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); const p = S.profiles.find(x => x.id === btn.dataset.pid);
      promptModal('Renommer', p?.name || '', async name => { if (!name.trim()) return; await api.renameProfile(btn.dataset.pid, name.trim()); S.profiles = S.profiles.map(x => x.id === btn.dataset.pid ? { ...x, name: name.trim() } : x); renderProfileDropdown(); document.getElementById('psw-name').textContent = name.trim(); }); };
  });
  dd.querySelectorAll('.pi-del').forEach(btn => {
    btn.onclick = async (e) => { e.stopPropagation(); if (!confirm('Supprimer ce profil ?')) return; await api.deleteProfile(btn.dataset.pid); S.profiles = S.profiles.filter(p => p.id !== btn.dataset.pid); if (S.activeProfile === btn.dataset.pid) { await api.switchProfile('default'); await loadAll(); renderSidebar(); setupNav(); renderPage(S.page); } else renderProfileDropdown(); };
  });
  document.getElementById('pi-new')?.addEventListener('click', () => {
    promptModal('Nouveau profil', '', async name => { if (!name.trim()) return; const id = await api.createProfile(name.trim()); S.profiles.push({ id, name: name.trim() }); await api.switchProfile(id); dd.classList.add('hidden'); await loadAll(); renderSidebar(); setupNav(); renderPage(S.page); });
  });
}

// ════════════════════════════════════════════════════
// PAGE: COMPOSE
// ════════════════════════════════════════════════════
function compose(c) {
  const tpl = S.templates[0] || { subject: '', body: '' };
  const allVars = extractVars((tpl.subject||'') + (tpl.body||'') + S.coverLetter);

  c.innerHTML = `<div class="page">
    <div class="ph"><div>
      <h1 class="pt">Composer un mail</h1>
      <p class="ps">Envoi avec CV et lettre de motivation en PDF.</p>
    </div></div>
    ${!S.mailConfig ? `<div class="ib mb8"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M6.5 6v3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg><span>Aucune boîte mail. <strong style="color:var(--accent);cursor:pointer" onclick="navigateTo('settings')">Configurer →</strong></span></div>` : ''}
    <div class="card">
      <div class="ct">Destinataire &amp; Modèle</div>
      <div class="g2">
        <div class="ig" style="margin:0"><label class="lbl">Email de l'entreprise</label><input type="email" class="inp" id="to-email" placeholder="rh@entreprise.fr"></div>
        <div class="ig" style="margin:0"><label class="lbl">Modèle</label>
          <select class="inp" id="tpl-select">${S.templates.map((t,i)=>`<option value="${i}">${esc(t.name)}</option>`).join('')}</select>
        </div>
      </div>
    </div>
    ${allVars.length ? `<div class="card"><div class="ct">Champs personnalisés</div><div class="g2" id="var-form">${allVars.map(v=>`<div class="ig" style="margin:0"><label class="lbl"><span class="vc">{${esc(v)}}</span></label><input type="text" class="inp" data-var="${esc(v)}" placeholder="${varPh(v)}"></div>`).join('')}</div></div>` : ''}
    <div class="live-preview">
      <div class="live-preview-label">Aperçu en temps réel <kbd class="kbd" style="font-size:9px;margin-left:4px">Ctrl+Enter pour envoyer</kbd></div>
      <div class="lp-subject" id="lp-subj">${esc(tpl.subject || '(objet vide)')}</div>
      <div class="lp-body"    id="lp-body">${esc(tpl.body   || '(corps vide)')}</div>
      ${S.coverLetter ? `<div class="lp-cl" id="lp-cl">📎 ${esc(S.coverLetter.slice(0,100))}…</div>` : ''}
    </div>
    <div class="card mt12">
      <div class="ct">Pièces jointes</div>
      <div class="rc mb8"><span class="lbl" style="margin:0;min-width:50px">CV :</span>${S.cv ? `<span class="tag tok">✓ ${esc(S.cv.name)}</span>` : `<span class="tag terr">Non uploadé</span><button class="btn bs xs" onclick="navigateTo('documents')">Uploader</button>`}</div>
      <div class="rc"><span class="lbl" style="margin:0;min-width:50px">LM :</span>${S.coverLetter.trim() ? `<span class="tag tok">✓ Jointe en PDF</span>` : `<span class="tag twarn">Non rédigée</span><button class="btn bs xs" onclick="navigateTo('documents')">Rédiger</button>`}</div>
    </div>
    <div class="row mt12">
      <button class="btn bp" id="btn-open-send" ${!S.mailConfig?'disabled':''}><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M11 1L5 7M11 1l-3.5 9.5L5 7.5 1.5 5.5 11 1z" stroke="white" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>Aperçu et envoi</button>
      <button class="btn bs" onclick="navigateTo('templates')">Modifier les modèles</button>
    </div>
  </div>`;

  const getT    = () => S.templates[parseInt(document.getElementById('tpl-select')?.value||'0')] || S.templates[0] || { subject:'',body:'' };
  const getVars = () => { const v={}; document.querySelectorAll('[data-var]').forEach(i=>v[i.dataset.var]=i.value.trim()); return v; };

  const refreshPreview = () => {
    const t=getT(), vars=getVars();
    const sEl=document.getElementById('lp-subj'), bEl=document.getElementById('lp-body'), cEl=document.getElementById('lp-cl');
    if(sEl) sEl.textContent = resolveVars(t.subject||'',vars) || '(objet vide)';
    if(bEl) bEl.textContent = resolveVars(t.body||'',vars) || '(corps vide)';
    if(cEl) cEl.textContent = resolveVars(S.coverLetter||'',vars).slice(0,100) + '…';
  };

  document.getElementById('tpl-select')?.addEventListener('change', () => {
    const newVars = extractVars((getT().subject||'')+(getT().body||'')+S.coverLetter);
    const form=document.getElementById('var-form');
    if(form){form.innerHTML=newVars.map(v=>`<div class="ig" style="margin:0"><label class="lbl"><span class="vc">{${esc(v)}}</span></label><input type="text" class="inp" data-var="${esc(v)}" placeholder="${varPh(v)}"></div>`).join('');document.querySelectorAll('[data-var]').forEach(i=>i.addEventListener('input',refreshPreview));}
    refreshPreview();
  });
  document.querySelectorAll('[data-var]').forEach(i => i.addEventListener('input', refreshPreview));

  document.getElementById('btn-open-send').onclick = () => {
    const to = document.getElementById('to-email')?.value.trim();
    if (!to || !to.includes('@')) { toast('Adresse email invalide.', 'err'); return; }
    openSendModal(to, getT(), getVars());
  };
}

function openSendModal(to, tpl, vars) {
  const rS=resolveVars(tpl.subject||'',vars), rB=resolveVars(tpl.body||'',vars), rCL=resolveVars(S.coverLetter||'',vars);
  const ov=document.getElementById('send-modal');
  ov.classList.remove('hidden');
  document.getElementById('send-modal-x').onclick = () => ov.classList.add('hidden');
  ov.onclick = (e) => { if(e.target===ov) ov.classList.add('hidden'); };

  document.getElementById('send-modal-body').innerHTML = `
    <div class="ib mb12"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M6.5 6v3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg><span>Modifiez exceptionnellement ces champs. <kbd class="kbd">Ctrl+Enter</kbd> pour envoyer.</span></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div>
        <div class="ig"><label class="lbl">Destinataire</label><input class="inp" id="sm-to" type="email" value="${esc(to)}"></div>
        <div class="ig"><label class="lbl">Objet</label><input class="inp" id="sm-subj" type="text" value="${esc(rS)}"></div>
        <div class="ig"><label class="lbl">Corps du mail</label><textarea class="inp" id="sm-body" rows="7">${esc(rB)}</textarea></div>
        <div class="rc mt8"><span class="lbl" style="margin:0;min-width:45px">CV :</span>${S.cv?`<span class="tag tok">✓ ${esc(S.cv.name)}</span>`:`<span class="tag terr">Non uploadé</span>`}</div>
      </div>
      <div>
        <div class="ig"><label class="lbl">Lettre de motivation <span class="tag tacc" style="font-size:10px">→ PDF joint</span></label><textarea class="inp" id="sm-cl" rows="12">${esc(rCL)}</textarea></div>
        <div class="row mt8">
          <button class="btn bg xs" id="sm-spell-cl">🔤 LM</button>
          <button class="btn bg xs" id="sm-spell-bd">🔤 Corps</button>
        </div>
      </div>
    </div>`;

  document.getElementById('send-modal-foot').innerHTML = `
    <button class="btn bg" id="sm-cancel">Annuler</button>
    <button class="btn bp" id="sm-send"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M11 1L5 7M11 1l-3.5 9.5L5 7.5 1.5 5.5 11 1z" stroke="white" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>Envoyer</button>`;

  document.getElementById('sm-cancel').onclick  = () => ov.classList.add('hidden');
  document.getElementById('sm-spell-cl').onclick = () => doSpellcheck(document.getElementById('sm-cl'));
  document.getElementById('sm-spell-bd').onclick  = () => doSpellcheck(document.getElementById('sm-body'));

  const doSend = async () => {
    const finalTo=document.getElementById('sm-to').value.trim();
    if (!finalTo||!finalTo.includes('@')) { toast('Email invalide.','err'); return; }
    const btn=document.getElementById('sm-send');
    btn.disabled=true; btn.innerHTML='<span class="sp"></span> Envoi…';
    const r = await api.sendMail({ to:finalTo, subject:document.getElementById('sm-subj').value.trim(), body:document.getElementById('sm-body').value.trim(), coverLetter:document.getElementById('sm-cl').value.trim(), variables:{} });
    btn.disabled=false; btn.innerHTML='Envoyer';
    if (r.success) { ov.classList.add('hidden'); toast('Candidature envoyée !','ok'); S.sentMails=await api.getSentMails(); S.tracker=await api.getTracker(); S.stats=await api.getStats(); updateBadges(); }
    else toast('Erreur : '+r.error,'err');
  };

  document.getElementById('sm-send').onclick = doSend;
  // Ctrl+Enter in modal
  document.getElementById('send-modal').addEventListener('keydown', (e) => { if ((e.ctrlKey||e.metaKey) && e.key==='Enter') { e.preventDefault(); doSend(); } });
}

// ════════════════════════════════════════════════════
// PAGE: DOCUMENTS
// ════════════════════════════════════════════════════
function documents(c) {
  c.innerHTML = `<div class="page">
    <div class="ph"><div><h1 class="pt">Documents</h1><p class="ps">CV et lettre de motivation. Stockage local uniquement.</p></div></div>
    <div class="card">
      <div class="ct">Curriculum Vitæ — PDF</div>
      <div id="cv-zone">${S.cv ? cvChip() : cvDz()}</div>
    </div>
    <div class="card">
      <div class="ct">Lettre de motivation</div>
      <div class="ib mb8"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M4 3l-2.5 3.5L4 10M9 3l2.5 3.5L9 10M7.5 2l-2 9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Utilisez <span class="vc">{variable}</span> pour personnaliser. Convertie en PDF et jointe automatiquement.</span></div>
      <div class="ig"><textarea class="inp" id="cl-txt" rows="14" placeholder="Madame, Monsieur,&#10;&#10;Je me permets de vous contacter afin de postuler au sein de {entreprise_name}...">${esc(S.coverLetter)}</textarea></div>
      <div class="vrow" id="cl-vars">${renderVCs(extractVars(S.coverLetter))}</div>
      <div class="row mt12">
        <button class="btn bp" id="btn-save-cl">Enregistrer <kbd class="kbd" style="font-size:9px">Ctrl+S</kbd></button>
        <button class="btn bg" id="btn-spell-cl">🔤 Orthographe <kbd class="kbd" style="font-size:9px">F7</kbd></button>
        <span id="cl-ok" style="font-size:12px;color:var(--a3);line-height:2.2"></span>
      </div>
    </div>
  </div>`;

  initCVZone();
  const txt = document.getElementById('cl-txt');
  txt.addEventListener('input', () => { document.getElementById('cl-vars').innerHTML = renderVCs(extractVars(txt.value)); });
  document.getElementById('btn-save-cl').onclick = async () => {
    await api.saveCoverLetter(txt.value); S.coverLetter = txt.value;
    const el=document.getElementById('cl-ok'); el.textContent='✓ Enregistrée';
    toast('Lettre enregistrée.','ok'); setTimeout(()=>{if(el)el.textContent='';},2000);
  };
  document.getElementById('btn-spell-cl').onclick = () => doSpellcheck(txt);
}
function cvDz() { return `<div class="dz" id="cv-dz"><div class="dz-ic"><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 13V4M6 8l4-4 4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 17h14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></div><div class="dz-tx"><strong>Cliquer pour uploader</strong> ou glisser</div><div class="dz-hi">PDF uniquement</div></div>`; }
function cvChip() { return `<div class="fc"><div class="fc-ic"><svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="2" y="1" width="9" height="13" rx="2" stroke="currentColor" stroke-width="1.3"/><path d="M4.5 5.5h5M4.5 8h3.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg></div><span class="fc-nm">${esc(S.cv?.name||'')}</span><button class="fc-rm" id="btn-rm-cv"><svg width="12" height="12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></button></div>`; }
function initCVZone() {
  const zone=document.getElementById('cv-zone'); if(!zone)return;
  const dz=document.getElementById('cv-dz');
  const up=async()=>{const r=await api.uploadCV();if(r){S.cv=r;zone.innerHTML=cvChip();initCVZone();toast('CV uploadé.','ok');}};
  if(dz){dz.onclick=up;dz.ondragover=(e)=>{e.preventDefault();dz.classList.add('ov');};dz.ondragleave=()=>dz.classList.remove('ov');dz.ondrop=(e)=>{e.preventDefault();dz.classList.remove('ov');up();};}
  document.getElementById('btn-rm-cv')?.addEventListener('click',async()=>{await api.removeCV();S.cv=null;zone.innerHTML=cvDz();initCVZone();toast('CV supprimé.','info');});
}

// ════════════════════════════════════════════════════
// PAGE: TEMPLATES
// ════════════════════════════════════════════════════
function templates(c) {
  let ai = 0;
  const mount = () => {
    c.innerHTML = `<div class="page"><div class="ph"><div><h1 class="pt">Modèles de mail</h1><p class="ps">Candidature, relance, etc.</p></div></div>
      <div class="tpl-tabs">
        ${S.templates.map((t,i)=>`<button class="tpl-tab ${i===ai?'active':''}" data-tidx="${i}">${esc(t.name)}</button>`).join('')}
        <button class="btn bs sm tpl-add" id="btn-add-tpl">+ Nouveau</button>
      </div>
      <div id="tpl-ed">${renderTplEd()}</div>
    </div>`;
    document.querySelectorAll('.tpl-tab').forEach(t=>{ t.onclick=()=>{ai=parseInt(t.dataset.tidx);mount();}; });
    document.getElementById('btn-add-tpl').onclick=()=>{S.templates.push({id:Date.now().toString(36),name:`Modèle ${S.templates.length+1}`,subject:'',body:''});ai=S.templates.length-1;mount();};
    const sI=document.getElementById('tpl-subj'),bI=document.getElementById('tpl-body');
    const rv=()=>{document.getElementById('svars').innerHTML=renderVCs(extractVars(sI.value));document.getElementById('bvars').innerHTML=renderVCs(extractVars(bI.value));document.getElementById('avars').innerHTML=renderVCs(extractVars(sI.value+'\n'+bI.value+'\n'+S.coverLetter));};
    sI?.addEventListener('input',rv); bI?.addEventListener('input',rv);
    document.getElementById('btn-spell-tpl').onclick=()=>doSpellcheck(bI);
    document.getElementById('btn-save-tpl').onclick=async()=>{const n=document.getElementById('tpl-name').value.trim();if(!n){toast('Nommez ce modèle.','err');return;}S.templates[ai]={...S.templates[ai],name:n,subject:sI.value,body:bI.value};await api.saveTemplates(S.templates);toast('Modèle enregistré.','ok');mount();};
    document.getElementById('btn-del-tpl')?.addEventListener('click',async()=>{if(!confirm('Supprimer ?'))return;S.templates.splice(ai,1);ai=Math.max(0,ai-1);await api.saveTemplates(S.templates);mount();});
  };
  const renderTplEd=()=>{const t=S.templates[ai]||{};return`
    <div class="card"><div class="ct">Nom</div><input type="text" class="inp" id="tpl-name" value="${esc(t.name||'')}"></div>
    <div class="card"><div class="ct">Objet</div><input type="text" class="inp" id="tpl-subj" value="${esc(t.subject||'')}" placeholder="Candidature {poste} chez {entreprise_name}"><div class="vrow mt8" id="svars">${renderVCs(extractVars(t.subject||''))}</div></div>
    <div class="card"><div class="ct">Corps du mail</div><div class="ib mb8"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M6.5 6v3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg><span>La LM est jointe en PDF automatiquement.</span></div><textarea class="inp" id="tpl-body" rows="8">${esc(t.body||'')}</textarea><div class="vrow mt8" id="bvars">${renderVCs(extractVars(t.body||''))}</div></div>
    <div class="card"><div class="ct">Variables totales (modèle + LM)</div><div class="vrow" id="avars">${renderVCs(extractVars((t.subject||'')+(t.body||'')+S.coverLetter))}</div></div>
    <div class="row"><button class="btn bp" id="btn-save-tpl">Enregistrer <kbd class="kbd" style="font-size:9px">Ctrl+S</kbd></button><button class="btn bg" id="btn-spell-tpl">🔤 Orthographe <kbd class="kbd" style="font-size:9px">F7</kbd></button>${S.templates.length>1?`<button class="btn bd" id="btn-del-tpl">Supprimer</button>`:''}</div>`;};
  mount();
}

// ════════════════════════════════════════════════════
// PAGE: THREAD
// ════════════════════════════════════════════════════
function thread(c) {
  c.innerHTML=`<div class="page"><div class="ph"><div><h1 class="pt">Conversations</h1><p class="ps">${S.sentMails.length} candidature${S.sentMails.length!==1?'s':''}.</p></div>
    <button class="btn bs" id="btn-refresh"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M11 6A5 5 0 1 1 6 1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M11 1v5H6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>Rafraîchir</button>
  </div>
  ${S.sentMails.length===0?`<div class="empty"><svg width="34" height="34" viewBox="0 0 34 34" fill="none"><path d="M31 4L14 21M31 4l-9 25-5.5-5.5-5.5-3L31 4z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg><p>Aucune candidature envoyée.</p></div>`:`<div id="thread-list">${S.sentMails.map(m=>threadItem(m)).join('')}</div>`}
  </div>`;
  document.querySelectorAll('.ti-hd').forEach(hd=>{hd.onclick=async()=>{const wrap=hd.closest('.ti-wrap'),body=wrap.querySelector('.ti-body'),chev=wrap.querySelector('.ti-chev'),mid=wrap.dataset.mid;body.classList.toggle('open');chev.classList.toggle('open',body.classList.contains('open'));if(body.classList.contains('open')){const m=S.sentMails.find(x=>x.id===mid);if(m)for(const r of(m.replies||[]).filter(r=>!r.read)){await api.markReplyRead(mid,r.id);r.read=true;}updateBadges();}};});
  document.querySelectorAll('.ti-del').forEach(btn=>{btn.onclick=async(e)=>{e.stopPropagation();if(!confirm('Supprimer ?'))return;await api.deleteSentMail(btn.dataset.mid);S.sentMails=S.sentMails.filter(m=>m.id!==btn.dataset.mid);updateBadges();renderPage('thread');};});
  document.getElementById('btn-refresh').onclick=async()=>{
    if(!S.mailConfig){toast('Configurez votre boîte mail.','err');return;}
    if(!S.mailConfig?.imap){toast('IMAP requis (mode "Envoi + Lecture").','err');return;}
    const btn=document.getElementById('btn-refresh');btn.disabled=true;btn.innerHTML='<span class="sp"></span>';
    const r=await api.fetchReplies();btn.disabled=false;btn.innerHTML='<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M11 6A5 5 0 1 1 6 1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M11 1v5H6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>Rafraîchir';
    if(!r.success){toast('Erreur : '+r.error,'err');return;}
    S.sentMails=r.sentMails;updateBadges();renderPage('thread');
    if(r.newReplies>0)toast(`${r.newReplies} nouvelle${r.newReplies>1?'s':''} réponse${r.newReplies>1?'s':''} !`,'ok');
    else toast('Aucune nouvelle réponse.','info');
  };
}
function threadItem(m) {
  const replies=m.replies||[],unread=replies.filter(r=>!r.read).length;
  const sd=new Date(m.sentAt).toLocaleDateString('fr-FR',{day:'2-digit',month:'short'});
  return `<div class="ti-wrap" data-mid="${m.id}"><div class="ti-hd"><div class="ti-dot ${replies.length>0?'has-reply':''}"></div><div class="ti-info"><div class="ti-to">${esc(m.to)}</div><div class="ti-subj">${esc(m.subject)}</div></div><div class="ti-meta"><span class="ti-date">${sd}</span>${unread>0?`<span class="tag ta2">${unread} non lu${unread>1?'s':''}</span>`:''} ${replies.length>0?`<span class="tag tok">${replies.length} rép.</span>`:''}</div><svg class="ti-chev" width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M4.5 2.5l4 4-4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
  <div class="ti-body"><div class="tl"><div class="tl-item"><div class="tl-icon tl-ic-sent"><svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M8.5 0.5L4 5M8.5 0.5l-2.5 8L4 5.5 1 4 8.5 0.5z" stroke="currentColor" stroke-width=".9" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="tl-c"><div class="tl-lbl">Envoyé · ${new Date(m.sentAt).toLocaleString('fr-FR')}</div><div class="tl-card"><div class="tl-subj">${esc(m.subject)}</div>${m.body?`<div class="tl-prev">${esc(m.body.slice(0,160))}</div>`:''}</div></div></div>
  ${replies.map(r=>`<div class="tl-item ${r.read?'':'tl-unread'}"><div class="tl-icon tl-ic-reply"><svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M3.5 2L1 4.5l2.5 2.5M1 4.5h5a2 2 0 000-4H4" stroke="currentColor" stroke-width=".9" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="tl-c"><div class="tl-lbl">Réponse · ${new Date(r.date).toLocaleString('fr-FR')}${!r.read?' · <span style="color:var(--a3)">Nouveau</span>':''}</div><div class="tl-card"><div class="tl-from">${esc(r.from)}</div><div class="tl-subj">${esc(r.subject)}</div>${r.preview?`<div class="tl-prev">${esc(r.preview)}</div>`:''}</div></div></div>`).join('')}
  ${replies.length===0?`<div class="tl-item"><div style="font-size:12px;color:var(--t3);padding-left:31px">Aucune réponse reçue.</div></div>`:''}
  </div><div class="row" style="padding:10px 14px;border-top:1px solid var(--bd)"><button class="btn bd xs ti-del" data-mid="${m.id}">Supprimer</button></div></div></div>`;
}

// ════════════════════════════════════════════════════
// PAGE: TRACKER (same as v4 — unchanged)
// ════════════════════════════════════════════════════
function tracker(c) {
  const ts=S.trackerSettings,rem=getRelancesToday();
  c.innerHTML=`<div class="page page-wide"><div class="ph"><div><h1 class="pt">Suivi des candidatures</h1><p class="ps">${S.tracker.length} candidature${S.tracker.length!==1?'s':''}.</p></div>
    <div class="row"><button class="btn bg sm" id="btn-tset">⚙ Paramètres</button>
    <div class="row" style="gap:4px"><button class="btn bg sm" onclick="exportFmt('xlsx')">📊 Excel</button><button class="btn bg sm" onclick="exportFmt('ods')">📊 Calc</button><button class="btn bg sm" onclick="exportFmt('csv')">📄 CSV</button></div>
    <button class="btn bp sm" id="btn-add-row">+ Ajouter</button></div></div>
    ${rem.length?`<div class="reminder-row"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.2"/><path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg><span><strong>${rem.length}</strong> relance${rem.length>1?'s':''} : ${rem.map(r=>`<strong>${esc(r.enterprise)}</strong>`).join(', ')}</span></div>`:''}
    <div class="tbl-filters"><input type="text" class="inp" id="tbl-srch" placeholder="Rechercher…" style="width:170px"><select class="inp" id="tbl-resp" style="width:160px"><option value="">Toutes</option>${(ts.customResponses||[]).map(r=>`<option>${esc(r)}</option>`).join('')}</select><span class="filter-count" id="tbl-cnt"></span></div>
    <div class="tracker-wrap"><table class="tracker-tbl"><thead><tr><th>Entreprise</th><th>Département</th><th>Type</th><th>Date</th><th>Réponse</th><th>Commentaire</th><th>Relances</th><th>Actions</th></tr></thead><tbody id="tbl-body"></tbody></table></div>
  </div>`;
  renderTblRows();
  document.getElementById('btn-add-row').onclick=()=>{S.tracker.unshift({id:'tr_'+Date.now().toString(36),enterprise:'',department:'',contactType:'mail',date:today(),response:'Candidature envoyée',comment:'',mailId:null,relances:[]});renderTblRows();saveTracker();};
  document.getElementById('btn-tset').onclick=showTrackerSettings;
  document.getElementById('tbl-srch').addEventListener('input',renderTblRows);
  document.getElementById('tbl-resp').addEventListener('change',renderTblRows);
}
window.exportFmt=async(fmt)=>{const ok=await api.exportTracker({format:fmt,rows:S.tracker});if(ok)toast(`Export ${fmt.toUpperCase()} réussi.`,'ok');};
function renderTblRows() {
  const tbody=document.getElementById('tbl-body');if(!tbody)return;
  const srch=(document.getElementById('tbl-srch')?.value||'').toLowerCase(),resp=document.getElementById('tbl-resp')?.value||'',ts=S.trackerSettings;
  const FINAL=['Refus entreprise','Refus personnel','Candidature fermée'];
  const filtered=S.tracker.filter(r=>{if(srch&&!JSON.stringify(r).toLowerCase().includes(srch))return false;if(resp&&r.response!==resp)return false;return true;});
  document.getElementById('tbl-cnt').textContent=`${filtered.length} ligne${filtered.length!==1?'s':''}`;
  tbody.innerHTML=filtered.map(row=>{const isFinal=FINAL.includes(row.response),due=!isFinal&&daysUntilRelance(row,ts)===0,rels=row.relances||[];
    return `<tr data-trid="${row.id}" ${due?'style="background:rgba(255,209,102,.03)"':''}><td><input class="tbl-inp" data-f="enterprise" value="${esc(row.enterprise)}" placeholder="Entreprise"></td><td><input class="tbl-inp" data-f="department" value="${esc(row.department)}" placeholder="—"></td><td><select class="tbl-inp" data-f="contactType">${(ts.customContactTypes||[]).map(t=>`<option ${row.contactType===t?'selected':''}>${esc(t)}</option>`).join('')}</select></td><td><input class="tbl-inp" type="date" data-f="date" value="${row.date||today()}" style="color:var(--t1)"></td><td><select class="tbl-inp" data-f="response" style="${responseColor(row.response)}">${(ts.customResponses||[]).map(r=>`<option ${row.response===r?'selected':''}>${esc(r)}</option>`).join('')}</select></td><td><input class="tbl-inp" data-f="comment" value="${esc(row.comment)}" placeholder="…" style="min-width:100px"></td><td><div class="relance-list">${rels.map((rel,ri)=>`<div class="relance-item"><span class="relance-date">${rel.date}</span>${rel.result?`<span class="relance-badge done">${esc(rel.result)}</span>`:`<span class="relance-badge">En attente</span>`}<button class="btn bg xs" style="padding:1px 5px" onclick="editRelance('${row.id}',${ri})">✎</button><button class="btn bd xs" style="padding:1px 5px" onclick="delRelance('${row.id}',${ri})">✕</button></div>`).join('')}${!isFinal&&rels.length<(ts.maxRelances||5)?`<button class="btn bg xs mt4" onclick="addRelance('${row.id}')">+ Relance</button>`:''}</div></td><td><div class="action-btns">${row.mailId&&!isFinal?`<button class="btn bs xs" onclick="doRelanceMail('${row.id}')">✉</button>`:''}<button class="btn bd xs" onclick="delTblRow('${row.id}')">✕</button></div></td></tr>`;
  }).join('');
  tbody.querySelectorAll('.tbl-inp').forEach(inp=>{inp.addEventListener('change',()=>{const tr=inp.closest('tr'),row=S.tracker.find(r=>r.id===tr?.dataset.trid);if(!row)return;row[inp.dataset.f]=inp.value;if(inp.dataset.f==='response')inp.style.cssText=responseColor(inp.value);saveTracker();});});
}
window.delTblRow=async(id)=>{if(!confirm('Supprimer ?'))return;S.tracker=S.tracker.filter(r=>r.id!==id);await saveTracker();renderTblRows();};
window.addRelance=async(id)=>{const row=S.tracker.find(r=>r.id===id);if(!row)return;const ts=S.trackerSettings;if((row.relances||[]).length>=(ts.maxRelances||5)){toast(`Max ${ts.maxRelances} relances.`,'err');return;}if(!row.relances)row.relances=[];const last=row.relances.length>0?row.relances[row.relances.length-1].date:row.date;row.relances.push({date:addDays(last,ts.relanceDays||14),result:''});await saveTracker();renderTblRows();};
window.delRelance=async(id,idx)=>{const row=S.tracker.find(r=>r.id===id);if(!row)return;row.relances.splice(idx,1);await saveTracker();renderTblRows();};
window.editRelance=(id,idx)=>{const row=S.tracker.find(r=>r.id===id);if(!row)return;const rel=row.relances[idx];showModal('Modifier la relance',`<div class="ig"><label class="lbl">Date</label><input type="date" class="inp" id="rl-dt" value="${rel.date}"></div><div class="ig"><label class="lbl">Résultat</label><input type="text" class="inp" id="rl-rs" value="${esc(rel.result||'')}" placeholder="Entretien planifié…"></div>`,async()=>{rel.date=document.getElementById('rl-dt').value;rel.result=document.getElementById('rl-rs').value;await saveTracker();renderTblRows();},'Enregistrer');};
window.doRelanceMail=(id)=>{const row=S.tracker.find(r=>r.id===id);if(!row)return;showModal('Relance par mail',`<div class="ig"><label class="lbl">Email</label><input type="email" class="inp" id="rl-to" placeholder="rh@${esc((row.enterprise||'').toLowerCase())}.fr"></div><div class="ig"><label class="lbl">Modèle</label><select class="inp" id="rl-tpl">${S.templates.map((t,i)=>`<option value="${i}">${esc(t.name)}</option>`).join('')}</select></div>`,()=>{const to=document.getElementById('rl-to').value.trim();if(!to||!to.includes('@')){toast('Email invalide.','err');return;}const tpl=S.templates[parseInt(document.getElementById('rl-tpl').value)||0]||S.templates[0];closeModal();openSendModal(to,tpl,{entreprise_name:row.enterprise,date_envoi:row.date});},'Ouvrir');};
function showTrackerSettings(){const ts=S.trackerSettings;showModal('Paramètres du suivi',`<div class="ig"><label class="lbl">Délai avant relance (jours)</label><input type="number" class="inp" id="ts-d" value="${ts.relanceDays||14}" min="1"></div><div class="ig"><label class="lbl">Nombre max de relances</label><input type="number" class="inp" id="ts-m" value="${ts.maxRelances||3}" min="1" max="10"></div><div class="divider"></div><div class="ig"><label class="lbl">Types de contact (un par ligne)</label><textarea class="inp" id="ts-ct" rows="4">${(ts.customContactTypes||[]).join('\n')}</textarea></div><div class="ig"><label class="lbl">Réponses (une par ligne)</label><textarea class="inp" id="ts-rs" rows="6">${(ts.customResponses||[]).join('\n')}</textarea></div>`,async()=>{const nts={relanceDays:parseInt(document.getElementById('ts-d').value)||14,maxRelances:parseInt(document.getElementById('ts-m').value)||3,customContactTypes:document.getElementById('ts-ct').value.split('\n').map(s=>s.trim()).filter(Boolean),customResponses:document.getElementById('ts-rs').value.split('\n').map(s=>s.trim()).filter(Boolean)};await api.saveTrackerSettings(nts);S.trackerSettings=nts;toast('Paramètres enregistrés.','ok');renderPage('tracker');},'Enregistrer');}
async function saveTracker(){await api.saveTracker(S.tracker);updateBadges();}

// ════════════════════════════════════════════════════
// PAGE: CALENDAR (unchanged from v4)
// ════════════════════════════════════════════════════
function calendar(c) {
  let calDate = new Date();
  const mount = () => {
    const y=calDate.getFullYear(),m=calDate.getMonth();
    const MN=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    const DN=['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
    const firstDay=new Date(y,m,1),lastDay=new Date(y,m+1,0);
    let startDow=(firstDay.getDay()+6)%7;
    const sentByDate={},relByDate={};
    S.sentMails.forEach(mail=>{const d=mail.sentAt?.split('T')[0];if(d){if(!sentByDate[d])sentByDate[d]=[];sentByDate[d].push(mail);}(mail.replies||[]).forEach(r=>{const rd=r.date?.split('T')[0];if(rd){if(!sentByDate[rd])sentByDate[rd]=[];sentByDate[rd].push({...r,isReply:true});}});});
    S.tracker.forEach(row=>{(row.relances||[]).forEach(rel=>{if(rel.date){if(!relByDate[rel.date])relByDate[rel.date]=[];relByDate[rel.date].push({...rel,enterprise:row.enterprise});}});const due=addDays(row.relances?.length>0?row.relances[row.relances.length-1].date:row.date,S.trackerSettings.relanceDays||14);if(!relByDate[due])relByDate[due]=[];relByDate[due].push({date:due,enterprise:row.enterprise,isDue:true});});
    const days=[];for(let i=0;i<startDow;i++){const d=new Date(y,m,1-startDow+i);days.push({date:d,other:true});}for(let d=1;d<=lastDay.getDate();d++)days.push({date:new Date(y,m,d),other:false});const rem=7-days.length%7;if(rem<7)for(let i=1;i<=rem;i++)days.push({date:new Date(y,m+1,i),other:true});
    const todStr=today();let selDate=todStr;
    const evHtml=(ds)=>{const ev=sentByDate[ds]||[],re=relByDate[ds]||[];if(!ev.length&&!re.length)return`<p style="font-size:12.5px;color:var(--t3)">Aucun événement.</p>`;return[...ev.map(e=>e.isReply?`<div class="cal-event-item"><div class="cal-event-type" style="background:var(--a3)"></div><div><div style="font-size:12.5px;font-weight:500">Réponse reçue</div><div style="font-size:12px;color:var(--t2)">${esc(e.from||'')} · ${esc(e.subject||'')}</div></div></div>`:`<div class="cal-event-item"><div class="cal-event-type" style="background:var(--accent)"></div><div><div style="font-size:12.5px;font-weight:500">Mail envoyé</div><div style="font-size:12px;color:var(--t2)">${esc(e.to)} · ${esc(e.subject||'')}</div></div></div>`),...re.map(r=>`<div class="cal-event-item"><div class="cal-event-type" style="background:var(--warn)"></div><div><div style="font-size:12.5px;font-weight:500">${r.isDue?'Relance recommandée':'Relance prévue'}</div><div style="font-size:12px;color:var(--t2)">${esc(r.enterprise||'')}${r.result?` · ${esc(r.result)}`:''}</div></div></div>`)].join('');};
    c.innerHTML=`<div class="page"><div class="ph"><div><h1 class="pt">Calendrier</h1><p class="ps">Envois, réponses et relances.</p></div></div>
      <div style="display:grid;grid-template-columns:1fr 280px;gap:16px">
        <div><div class="cal-header"><div class="cal-month">${MN[m]} ${y}</div><div class="cal-nav"><button id="cal-prev">‹</button><button id="cal-tod">Auj.</button><button id="cal-next">›</button></div></div>
        <div class="cal-legend"><div class="cal-legend-item"><div class="cal-dot cal-dot-sent"></div>Envoi</div><div class="cal-legend-item"><div class="cal-dot cal-dot-reply"></div>Réponse</div><div class="cal-legend-item"><div class="cal-dot cal-dot-relance"></div>Relance</div></div>
        <div class="cal-grid">${DN.map(d=>`<div class="cal-dow">${d}</div>`).join('')}${days.map(({date,other})=>{const ds=date.toISOString().split('T')[0],hasSent=!!(sentByDate[ds]?.length),hasRel=!!(relByDate[ds]?.length),isToday=ds===todStr,dots=[(hasSent?`<div class="cal-dot cal-dot-sent"></div>`:''),(hasRel?`<div class="cal-dot cal-dot-relance"></div>`:''),(sentByDate[ds]?.some(e=>e.isReply)?`<div class="cal-dot cal-dot-reply"></div>`:'')].join('');return`<div class="cal-day ${other?'other-month':''} ${isToday?'today':''} ${hasSent&&hasRel?'has-both':hasSent?'has-event':hasRel?'has-relance':''}" data-ds="${ds}"><span>${date.getDate()}</span>${dots?`<div class="cal-dot-row">${dots}</div>`:''}</div>`;}).join('')}</div></div>
        <div><div class="card"><div class="ct" id="cal-sel-dt">${selDate}</div><div id="cal-evs">${evHtml(selDate)}</div></div></div>
      </div></div>`;
    document.getElementById('cal-prev').onclick=()=>{calDate=new Date(y,m-1,1);mount();};
    document.getElementById('cal-next').onclick=()=>{calDate=new Date(y,m+1,1);mount();};
    document.getElementById('cal-tod').onclick=()=>{calDate=new Date();mount();};
    document.querySelectorAll('.cal-day').forEach(el=>{el.onclick=()=>{selDate=el.dataset.ds;document.getElementById('cal-sel-dt').textContent=selDate;document.getElementById('cal-evs').innerHTML=evHtml(selDate);document.querySelectorAll('.cal-day').forEach(d=>d.style.outline='');el.style.outline='2px solid var(--accent)';};});
  };
  mount();
}

// ════════════════════════════════════════════════════
// PAGE: STATS (unchanged from v4)
// ════════════════════════════════════════════════════
async function stats(c) {
  S.stats = await api.getStats();
  const st=S.stats,months=Object.keys(st.byMonth||{}).sort().slice(-6),maxM=Math.max(...months.map(m=>st.byMonth[m]),1),respKeys=Object.keys(st.byResponse||{}),maxR=Math.max(...respKeys.map(k=>st.byResponse[k]),1);
  const rc=st.replyRate>30?'var(--a3)':st.replyRate>15?'var(--warn)':'var(--err)';
  c.innerHTML=`<div class="page"><div class="ph"><div><h1 class="pt">Statistiques</h1><p class="ps">Vue d'ensemble de vos candidatures.</p></div></div>
    <div class="stat-grid"><div class="stat-card"><div class="stat-val stat-accent">${st.total}</div><div class="stat-lbl">Candidatures envoyées</div></div><div class="stat-card"><div class="stat-val stat-ok">${st.withReplies}</div><div class="stat-lbl">Avec réponses</div><div class="stat-sub">${st.totalReplies} au total</div></div><div class="stat-card"><div class="stat-val" style="color:${rc}">${st.replyRate}%</div><div class="stat-lbl">Taux de réponse</div></div><div class="stat-card"><div class="stat-val stat-ok">${st.positive}</div><div class="stat-lbl">Réponses positives</div></div><div class="stat-card"><div class="stat-val stat-err">${st.refused}</div><div class="stat-lbl">Refus reçus</div></div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div class="card"><div class="ct">Envois par mois</div>${months.length?`<div class="month-chart">${months.map(m=>{const v=st.byMonth[m],h=Math.max(4,Math.round((v/maxM)*70));return`<div class="month-bar-col"><div class="month-bar-fill" style="height:${h}px" title="${v}"></div><div class="month-bar-lbl">${m.slice(5)}</div></div>`;}).join('')}</div>`:`<p style="font-size:12.5px;color:var(--t3);padding:12px 0">Aucune donnée.</p>`}</div>
      <div class="card"><div class="ct">Réponses par type</div><div class="chart-bar-wrap">${respKeys.length?respKeys.map(k=>{const v=st.byResponse[k],w=Math.round((v/maxR)*100);return`<div class="chart-bar-row"><span class="chart-bar-lbl">${esc(k)}</span><div class="chart-bar-bg"><div class="chart-bar-fill" style="width:${w}%;background:${respBarColor(k)}"></div></div><span class="chart-bar-val">${v}</span></div>`;}).join(''):`<p style="font-size:12.5px;color:var(--t3)">Aucune donnée.</p>`}</div></div>
    </div></div>`;
}

// ════════════════════════════════════════════════════
// PAGE: SETTINGS — mail config, themes, shortcuts, security
// ════════════════════════════════════════════════════
function settings(c) {
  const cfg = S.mailConfig || {};
  c.innerHTML = `<div class="page">
    <div class="ph"><div><h1 class="pt">Paramètres</h1><p class="ps">Configuration mail, sécurité, thèmes et raccourcis.</p></div></div>

    <!-- Mail config -->
    <div class="card"><div class="ct">Fournisseur email</div>
      <div class="pg">${['gmail','outlook','imap'].map(p=>`<div class="pc ${cfg.provider===p?'sel':''}" data-prov="${p}"><div class="pc-i">${p==='gmail'?'📧':p==='outlook'?'📮':'🔒'}</div><div class="pc-n">${p==='gmail'?'Gmail':p==='outlook'?'Outlook':'IMAP/SMTP'}</div></div>`).join('')}</div>
    </div>
    <div id="pform"></div>
    <div class="card"><div class="ct">Mode</div><div class="rg">
      <label class="ri ${cfg.mode!=='read'?'sel':''}"><input type="radio" name="mode" value="send" ${cfg.mode!=='read'?'checked':''}><div><div class="ri-tx">Envoi uniquement</div><div class="ri-ds">Envoyer sans accéder à votre boîte de réception.</div></div></label>
      <label class="ri ${cfg.mode==='read'?'sel':''}"><input type="radio" name="mode" value="read" ${cfg.mode==='read'?'checked':''}><div><div class="ri-tx">Envoi + Lecture des réponses</div><div class="ri-ds">Seul l'email exact des réponses est stocké.</div></div></label>
    </div></div>
    <div class="row mb12">
      <button class="btn bs" id="btn-test">Tester la connexion</button>
      <button class="btn bp" id="btn-save-cfg">Enregistrer <kbd class="kbd" style="font-size:9px">Ctrl+S</kbd></button>
      <span id="test-res" style="line-height:2.2;font-size:12px;display:flex;gap:5px;align-items:center;flex-wrap:wrap"></span>
    </div>

    <div class="divider"></div>

    <!-- Security / criticality -->
    <div class="card" id="security-card">
      <div class="ct">🔐 Niveaux de sécurité des données</div>
      ${renderCriticalityEditor()}
    </div>

    <div class="divider"></div>

    <!-- Theme editor -->
    <div class="card"><div class="ct">Thème</div>
      <div class="theme-swatch-grid" id="theme-swatches">${renderThemeSwatches()}</div>
      <div class="row mb12">
        <button class="btn bs sm" id="btn-import-theme">↑ Importer</button>
        <button class="btn bs sm" id="btn-create-theme">+ Créer un thème</button>
        <button class="btn bg sm" id="btn-replay-tutorial">▶ Revoir le tutoriel</button>
      </div>
    </div>

    <!-- Shortcuts editor -->
    <div class="card"><div class="ct">Raccourcis clavier</div>
      <div id="shortcuts-editor">${renderShortcutsEditor()}</div>
    </div>

    <!-- Tab order hint -->
    <div class="ib"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M6.5 6v3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg><span>L'ordre des onglets peut être modifié par <strong>glisser-déposer</strong> dans la barre latérale.</span></div>
  </div>`;

  let selProv = cfg.provider || 'gmail';
  renderPForm(selProv, cfg);

  document.querySelectorAll('.pc').forEach(card => { card.onclick=()=>{document.querySelectorAll('.pc').forEach(x=>x.classList.remove('sel'));card.classList.add('sel');selProv=card.dataset.prov;renderPForm(selProv,{});}; });
  document.querySelectorAll('[name=mode]').forEach(r => { r.onchange=()=>{document.querySelectorAll('.ri').forEach(i=>i.classList.remove('sel'));r.closest('.ri').classList.add('sel');}; });

  document.getElementById('btn-test').onclick = async () => {
    const c_=gatherCfg(),btn=document.getElementById('btn-test'),res=document.getElementById('test-res');
    btn.disabled=true;btn.innerHTML='<span class="sp"></span> Test…';res.innerHTML='';
    const r=await api.testConnection(c_);btn.disabled=false;btn.textContent='Tester la connexion';
    res.innerHTML=(r.smtp?`<span class="tag tok">✓ SMTP OK</span>`:`<span class="tag terr" title="${esc(r.smtpError||'')}">✗ SMTP: ${esc((r.smtpError||'err').slice(0,50))}</span>`)+(c_.mode==='read'&&c_.imap?(r.imap?`<span class="tag tok">✓ IMAP OK</span>`:`<span class="tag terr" title="${esc(r.imapError||'')}">✗ IMAP: ${esc((r.imapError||'err').slice(0,50))}</span>`):'');
  };
  document.getElementById('btn-save-cfg').onclick = async () => { await api.saveMailConfig(gatherCfg()); S.mailConfig=gatherCfg(); toast('Paramètres enregistrés.','ok'); };

  // Security wiring
  bindCriticalityEditor();

  // Theme buttons
  document.getElementById('btn-import-theme').onclick = async () => {
    const r = await api.importTheme();
    if (r) { S.customThemes[r.name]=r.tokens; applyTheme(r.name); await saveSettings(); document.getElementById('theme-swatches').innerHTML=renderThemeSwatches(); bindThemeSwatches(); toast(`Thème "${r.name}" importé.`,'ok'); }
    else toast('Import annulé ou fichier invalide.','err');
  };
  document.getElementById('btn-create-theme').onclick = () => openThemeEditor();
  document.getElementById('btn-replay-tutorial').onclick = () => { tutStep=0; startTutorial(); };
  bindThemeSwatches();

  function gatherCfg() { const mode=document.querySelector('[name=mode]:checked')?.value||'send'; const c={provider:selProv,mode}; const v=id=>document.getElementById(id)?.value.trim()||''; if(selProv==='gmail'){c.email=v('g-em');c.appPassword=v('g-pw');}else if(selProv==='outlook'){c.email=v('o-em');c.password=v('o-pw');}else{c.email=v('i-em');c.password=v('i-pw');c.smtp={host:v('s-h'),port:parseInt(v('s-p'))||587};if(mode==='read'){c.imap={host:v('i-h'),port:parseInt(v('i-p'))||993};c.imapPassword=c.password;}}return c; }
  function renderPForm(prov,data) { const f=document.getElementById('pform'),sm=data.smtp||{},im=data.imap||{};if(prov==='gmail')f.innerHTML=`<div class="card"><div class="ct">Gmail</div><div class="ib mb8"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M6.5 6v3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg><span>Mot de passe d'application requis (Sécurité → Validation 2 étapes → Mots de passe des applications).</span></div><div class="g2"><div class="ig"><label class="lbl">Adresse Gmail</label><input type="email" class="inp" id="g-em" value="${esc(data.email||'')}" placeholder="vous@gmail.com"></div><div class="ig"><label class="lbl">Mot de passe d'app</label><input type="password" class="inp" id="g-pw" value="${esc(data.appPassword||'')}"></div></div></div>`;else if(prov==='outlook')f.innerHTML=`<div class="card"><div class="ct">Outlook</div><div class="g2"><div class="ig"><label class="lbl">Email</label><input type="email" class="inp" id="o-em" value="${esc(data.email||'')}" placeholder="vous@outlook.com"></div><div class="ig"><label class="lbl">Mot de passe</label><input type="password" class="inp" id="o-pw" value="${esc(data.password||'')}"></div></div></div>`;else f.innerHTML=`<div class="card"><div class="ct">IMAP/SMTP</div><div class="g2"><div class="ig"><label class="lbl">Email</label><input type="email" class="inp" id="i-em" value="${esc(data.email||'')}" placeholder="vous@domaine.fr"></div><div class="ig"><label class="lbl">Mot de passe</label><input type="password" class="inp" id="i-pw" value="${esc(data.password||'')}"></div></div><div class="g2 mt8"><div class="ig"><label class="lbl">SMTP</label><input type="text" class="inp" id="s-h" value="${esc(sm.host||'')}" placeholder="smtp.domaine.fr"></div><div class="ig"><label class="lbl">Port</label><input type="number" class="inp" id="s-p" value="${sm.port||587}"></div></div><div class="divider"></div><p class="mb8" style="font-size:12px;color:var(--t3)">IMAP (pour la lecture des réponses)</p><div class="g2"><div class="ig"><label class="lbl">IMAP</label><input type="text" class="inp" id="i-h" value="${esc(im.host||'')}" placeholder="imap.domaine.fr"></div><div class="ig"><label class="lbl">Port</label><input type="number" class="inp" id="i-p" value="${im.port||993}"></div></div></div>`; }
}

function renderThemeSwatches() {
  const all = { ...BUILTIN_THEMES_PREVIEW(), ...Object.fromEntries(Object.keys(S.customThemes).map(n=>[n,S.customThemes[n]])) };
  return Object.entries(all).map(([name, val]) => {
    const isBuiltin = !!BUILTIN_THEMES[name];
    const bg = isBuiltin ? themePreviewColor(name) : (val['--bg0']||val['--bg1']||'#111');
    const ac = isBuiltin ? themeAccentColor(name)  : (val['--accent']||'#6c63ff');
    return `<div class="theme-swatch ${S.ui.theme===name?'active':''}" data-tname="${esc(name)}" style="background:${bg};border-color:${S.ui.theme===name?ac:'transparent'}" title="${esc(name)}">
      <div style="position:absolute;top:6px;left:6px;right:6px;bottom:16px;border-radius:5px;background:${ac};opacity:.5"></div>
      <div class="theme-swatch-label">${esc(name)}${!isBuiltin?` <span onclick="event.stopPropagation();deleteCustomTheme('${esc(name)}')" style="cursor:pointer;margin-left:3px">✕</span>`:''}</div>
    </div>`;
  }).join('');
}
function BUILTIN_THEMES_PREVIEW() { return Object.fromEntries(Object.keys(BUILTIN_THEMES).map(n=>[n,n])); }
function themePreviewColor(n) { return {'Sombre (défaut)':'#08080d','Clair':'#f4f4f8','Minuit':'#000005','Forêt':'#080f0a','Océan':'#050d15'}[n]||'#111'; }
function themeAccentColor(n) { return {'Sombre (défaut)':'#6c63ff','Clair':'#5a52e8','Minuit':'#8080ff','Forêt':'#5db85d','Océan':'#48a8e8'}[n]||'#6c63ff'; }

function bindThemeSwatches() {
  document.querySelectorAll('.theme-swatch').forEach(el => {
    el.onclick = async () => {
      const name = el.dataset.tname;
      applyTheme(name);
      await saveSettings();
      document.getElementById('theme-swatches').innerHTML = renderThemeSwatches();
      bindThemeSwatches();
    };
  });
}

window.deleteCustomTheme = async (name) => {
  if (!confirm(`Supprimer le thème "${name}" ?`)) return;
  await api.deleteTheme(name);
  delete S.customThemes[name];
  if (S.ui.theme === name) applyTheme('Sombre (défaut)');
  document.getElementById('theme-swatches').innerHTML = renderThemeSwatches();
  bindThemeSwatches();
};

function openThemeEditor() {
  const CSS_VARS = [
    ['--bg0','Fond principal'],['--bg1','Fond secondaire'],['--bg2','Fond tertiaire'],
    ['--t1','Texte principal'],['--t2','Texte secondaire'],['--t3','Texte discret'],
    ['--accent','Couleur principale'],['--a2','Couleur secondaire'],['--a3','Couleur succès'],
    ['--err','Erreur'],['--warn','Avertissement'],['--bd','Bordure'],
  ];
  // Start from current theme's values
  const getVar = (k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim() || '#000000';
  const tokens = {};
  CSS_VARS.forEach(([k]) => tokens[k] = getVar(k));

  const previewStyle = () => Object.entries(tokens).map(([k,v])=>`${k}:${v}`).join(';');

  showModal('Éditeur de thème', `
    <div class="ig"><label class="lbl">Nom du thème</label><input type="text" class="inp" id="theme-new-name" placeholder="Mon thème"></div>
    <div class="token-grid">
      ${CSS_VARS.map(([k,label]) => `
        <div class="token-row">
          <span class="token-key">${label}</span>
          <input type="color" class="token-swatch" data-var="${k}" value="${tokens[k]}" title="${k}">
          <input type="text"  class="token-val"    data-var="${k}" value="${tokens[k]}">
        </div>`).join('')}
    </div>
    <div class="mt12 mb8" style="font-size:12px;color:var(--t3)">Aperçu :</div>
    <div id="theme-preview-box" style="${previewStyle()};background:var(--bg0);border-radius:10px;padding:14px;border:1px solid var(--bd)">
      <div style="font-family:'Syne',sans-serif;font-weight:800;font-size:16px;color:var(--t1)">AlterMail</div>
      <div style="color:var(--t2);font-size:12px;margin-top:3px">Aperçu du thème</div>
      <div style="margin-top:8px;display:flex;gap:6px">
        <span style="background:var(--accent);color:#fff;padding:4px 12px;border-radius:6px;font-size:12px">Bouton</span>
        <span style="background:var(--a3);color:#fff;padding:4px 12px;border-radius:6px;font-size:12px">Succès</span>
        <span style="background:var(--err);color:#fff;padding:4px 12px;border-radius:6px;font-size:12px">Erreur</span>
      </div>
    </div>
  `, async () => {
    const name = document.getElementById('theme-new-name')?.value.trim();
    if (!name) { toast('Donnez un nom au thème.','err'); return; }
    await api.saveTheme(name, tokens);
    S.customThemes[name] = tokens;
    applyTheme(name);
    await saveSettings();
    document.getElementById('theme-swatches').innerHTML = renderThemeSwatches();
    bindThemeSwatches();
    toast(`Thème "${name}" créé.`,'ok');
  }, 'Enregistrer le thème');

  // Wire up inputs
  setTimeout(() => {
    document.querySelectorAll('.token-swatch,.token-val').forEach(inp => {
      inp.addEventListener('input', () => {
        const k = inp.dataset.var;
        tokens[k] = inp.value;
        // Sync the sibling
        document.querySelectorAll(`[data-var="${k}"]`).forEach(el => { if (el !== inp) el.value = inp.value; });
        // Update preview
        const box = document.getElementById('theme-preview-box');
        if (box) box.style.cssText = previewStyle() + ';border-radius:10px;padding:14px;border:1px solid var(--bd)';
      });
    });
    // Export button
    const foot = document.getElementById('gmodal-foot');
    if (foot) {
      const exportBtn = document.createElement('button');
      exportBtn.className = 'btn bg';
      exportBtn.textContent = '↓ Exporter';
      exportBtn.onclick = async (e) => {
        e.preventDefault();
        const name = document.getElementById('theme-new-name')?.value.trim() || 'MonTheme';
        await api.exportTheme(name, tokens);
      };
      foot.insertBefore(exportBtn, foot.firstChild);
    }
  }, 50);
}

// ════════════════════════════════════════════════════
// SECURITY — criticality editor
// ════════════════════════════════════════════════════

// Human-readable metadata for each data key
const CRIT_META = {
  // Credentials
  mailConfig:      { label:'Config. mail (identifiants, mots de passe)', store:'Identifiants', sensitive:true },
  // Data
  coverLetter:     { label:'Lettre de motivation', store:'Données', sensitive:false },
  templates:       { label:'Modèles de mail', store:'Données', sensitive:false },
  sentMails:       { label:'Mails envoyés (adresses, sujets, historique)', store:'Données', sensitive:true },
  tracker:         { label:'Tableau de suivi (entreprises, statuts)', store:'Données', sensitive:false },
  trackerSettings: { label:'Paramètres du suivi', store:'Données', sensitive:false },
  cv:              { label:'Chemin du CV', store:'Données', sensitive:false },
};

const CRIT_LABELS = [
  { level:0, icon:'👁',  label:'Clair',              desc:'Données lisibles directement dans les fichiers JSON.' },
  { level:1, icon:'🌀',  label:'Obfusqué',           desc:'XOR + base64 : invisible à l\'œil nu, pas de chiffrement.' },
  { level:2, icon:'🔒',  label:'Chiffré',            desc:'AES-256-GCM, clé dérivée de votre machine. Recommandé pour les mots de passe.' },
  { level:3, icon:'🛡️', label:'Obfusqué + Chiffré', desc:'Double protection : obfuscation puis chiffrement AES-256-GCM.' },
];

function renderCriticalityEditor() {
  const crit = S.criticality || {};
  const groups = {
    'Identifiants': Object.entries(CRIT_META).filter(([,m]) => m.store === 'Identifiants'),
    'Données':      Object.entries(CRIT_META).filter(([,m]) => m.store === 'Données'),
  };

  const levelBadge = (lvl) => {
    const c = CRIT_LABELS[lvl] || CRIT_LABELS[0];
    const colors = ['var(--t3)','var(--warn)','var(--accent)','var(--a3)'];
    return `<span style="font-size:11px;color:${colors[lvl]};font-family:'DM Mono',monospace">${c.icon} ${c.label}</span>`;
  };

  const levelSelect = (key, current) => `
    <select class="crit-sel inp" data-crit-key="${key}" style="width:100%;font-size:12px;padding:5px 8px">
      ${CRIT_LABELS.map(cl => `<option value="${cl.level}" ${current===cl.level?'selected':''}>${cl.icon} ${cl.level} — ${cl.label}</option>`).join('')}
    </select>`;

  let html = `
    <div class="ib mb12"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M6.5 6v3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
      <span>Choisissez comment chaque catégorie de données est stockée sur disque. La modification re-protège immédiatement les données existantes.</span>
    </div>

    <!-- Level legend -->
    <div class="crit-legend">
      ${CRIT_LABELS.map(cl => {
        const colors = ['var(--t3)','var(--warn)','var(--accent)','var(--a3)'];
        return `<div class="crit-legend-item">
          <span class="crit-badge" style="background:${colors[cl.level]}22;border:1px solid ${colors[cl.level]}44;color:${colors[cl.level]}">${cl.icon} ${cl.level}</span>
          <div>
            <div style="font-size:12.5px;font-weight:500;color:var(--t1)">${cl.label}</div>
            <div style="font-size:11.5px;color:var(--t2)">${cl.desc}</div>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div class="divider"></div>`;

  for (const [groupName, entries] of Object.entries(groups)) {
    html += `<div class="crit-group-label">${groupName}</div>
    <div class="crit-rows">
      ${entries.map(([key, meta]) => {
        const current = crit[key] ?? (key === 'mailConfig' ? 2 : key === 'sentMails' ? 1 : 0);
        return `<div class="crit-row" data-key="${key}">
          <div class="crit-row-info">
            <div class="crit-row-label">${meta.label}${meta.sensitive ? ' <span class="tag ta2" style="font-size:9px">sensible</span>' : ''}</div>
            <div class="crit-row-key">${key}</div>
          </div>
          <div class="crit-row-ctrl">${levelSelect(key, current)}</div>
        </div>`;
      }).join('')}
    </div>`;
  }

  html += `<div class="row mt12">
    <button class="btn bp sm" id="btn-save-crit">
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1.5 6l3 3 5-6" stroke="white" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Appliquer les niveaux
    </button>
    <span id="crit-status" style="font-size:12px;color:var(--a3);line-height:2.2"></span>
  </div>`;

  return html;
}

function bindCriticalityEditor() {
  document.getElementById('btn-save-crit')?.addEventListener('click', async () => {
    const newLevels = {};
    document.querySelectorAll('.crit-sel').forEach(sel => {
      newLevels[sel.dataset.critKey] = parseInt(sel.value);
    });

    const btn    = document.getElementById('btn-save-crit');
    const status = document.getElementById('crit-status');
    btn.disabled = true;
    btn.innerHTML = '<span class="sp"></span> Application…';

    const result = await api.saveCriticality(newLevels);

    btn.disabled = false;
    btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1.5 6l3 3 5-6" stroke="white" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg> Appliquer les niveaux`;

    if (result?.success) {
      S.criticality = newLevels;

      // Count what changed
      const allSummary = { ...result.summary.data, ...result.summary.credentials };
      const upgraded   = Object.values(allSummary).reduce((a,s) => a+(s?.upgraded||0), 0);
      const downgraded = Object.values(allSummary).reduce((a,s) => a+(s?.downgraded||0), 0);

      let msg = 'Niveaux appliqués.';
      if (upgraded > 0)   msg += ` ${upgraded} entrée${upgraded>1?'s':''} renforcée${upgraded>1?'s':''}.`;
      if (downgraded > 0) msg += ` ${downgraded} entrée${downgraded>1?'s':''} simplifiée${downgraded>1?'s':''}.`;

      status.textContent = '✓ ' + msg;
      toast(msg, 'ok');
      setTimeout(() => { if (status) status.textContent = ''; }, 4000);
    } else {
      toast('Erreur lors de l\'application des niveaux.', 'err');
    }
  });
}

function renderShortcutsEditor() {
  const shortcuts = { ...DEFAULT_SHORTCUTS, ...(S.ui.shortcuts||{}) };
  return `
    <div class="shortcut-section-title">Navigation (Alt + chiffre selon l'ordre des onglets)</div>
    ${S.ui.tabOrder.map((page, i) => {
      const def = TAB_DEFS[page]; if (!def) return '';
      return `<div class="shortcut-row"><span class="shortcut-desc">${def.label}</span><div class="shortcut-keys"><span class="kbd">Alt</span>+<span class="kbd">${i+1}</span></div></div>`;
    }).join('')}
    <div class="divider"></div>
    <div class="shortcut-section-title" style="margin-top:10px">Actions fixes</div>
    ${['send','save','spell','theme','help'].map(id => {
      const s = DEFAULT_SHORTCUTS[id]; if (!s) return '';
      return `<div class="shortcut-row"><span class="shortcut-desc">${esc(s.label)}</span><div class="shortcut-keys">${s.keys.map(k=>`<span class="kbd">${esc(k)}</span>`).join('+')}</div></div>`;
    }).join('')}
    <p class="mt8" style="font-size:12px;color:var(--t3)">Les raccourcis de navigation suivent automatiquement l'ordre des onglets (modifiable par glisser-déposer).</p>`;
}

// ════════════════════════════════════════════════════
// SPELLCHECK
// ════════════════════════════════════════════════════
async function doSpellcheck(target) {
  const text   = target?.value || '';
  const errors = await api.spellcheck(text);
  const panel  = document.getElementById('spell-panel');
  if (!errors.length) { toast('Aucune erreur détectée.','ok'); return; }
  let idx = 0;
  const showErr = () => {
    if (idx >= errors.length) { panel.classList.add('hidden'); toast('Vérification terminée.','ok'); return; }
    const e = errors[idx];
    panel.innerHTML = `<span style="color:var(--t2);font-size:11.5px">${idx+1}/${errors.length}</span><span class="spell-word">${esc(e.word)}</span><span style="color:var(--t3)">→</span><div style="display:flex;gap:5px;flex-wrap:wrap">${e.suggestions.slice(0,4).map(s=>`<span class="spell-sug" data-sug="${esc(s)}">${esc(s)}</span>`).join('')}</div><button class="btn bg xs" id="sp-skip">Ignorer</button><button class="btn bg xs" id="sp-close">✕</button>`;
    panel.classList.remove('hidden');
    panel.querySelectorAll('.spell-sug').forEach(el=>{el.onclick=()=>{if(target)target.value=target.value.replaceAll(e.word,el.dataset.sug);idx++;showErr();};});
    document.getElementById('sp-skip').onclick=()=>{idx++;showErr();};
    document.getElementById('sp-close').onclick=()=>panel.classList.add('hidden');
  };
  showErr();
}

// ════════════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════════════
function extractVars(t){if(!t)return[];return[...new Set((t.match(/\{([^}]+)\}/g)||[]).map(x=>x.slice(1,-1)))];}
function renderVCs(vars){return vars.length?vars.map(v=>`<span class="vc">{${esc(v)}}</span>`).join(''):`<span style="font-size:11.5px;color:var(--t3)">Aucune variable</span>`;}
function resolveVars(t,v){return(t||'').replace(/\{([^}]+)\}/g,(_,k)=>v[k]!==undefined?v[k]:`{${k}}`);}
function varPh(k){return k.replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase());}
function esc(s){if(s==null)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function today(){return new Date().toISOString().split('T')[0];}
function addDays(ds,d){const dt=new Date(ds);dt.setDate(dt.getDate()+d);return dt.toISOString().split('T')[0];}
function responseColor(r){const m={'Réponse positive':'color:var(--a3)','Refus entreprise':'color:var(--err)','Refus personnel':'color:var(--err)','Candidature fermée':'color:var(--t3)','Aucune réponse':'color:var(--warn)','Candidature envoyée':'color:var(--t2)'};return m[r]||'color:var(--t2)';}
function respBarColor(r){const m={'Réponse positive':'var(--a3)','Refus entreprise':'var(--err)','Refus personnel':'var(--err)','Candidature fermée':'var(--t3)','Aucune réponse':'var(--warn)','Candidature envoyée':'var(--accent)'};return m[r]||'var(--accent)';}
function getRelancesToday(){const FINAL=['Refus entreprise','Refus personnel','Candidature fermée'];return S.tracker.filter(row=>{if(FINAL.includes(row.response))return false;return daysUntilRelance(row,S.trackerSettings)===0;});}
function daysUntilRelance(row,ts){const FINAL=['Refus entreprise','Refus personnel','Candidature fermée'];if(FINAL.includes(row.response))return-1;const rel=(row.relances||[]);if(rel.length>=(ts.maxRelances||3))return-1;const last=rel.length>0?rel[rel.length-1].date:row.date;const due=addDays(last,ts.relanceDays||14);return Math.max(0,Math.floor((new Date(due)-new Date(today()))/86400000));}
function checkRelanceReminders(){updateBadges();}

function closeAllModals() {
  document.querySelectorAll('.moverlay').forEach(m => m.classList.add('hidden'));
  document.getElementById('spell-panel')?.classList.add('hidden');
  document.getElementById('ctx-menu')?.classList.add('hidden');
  document.getElementById('tutorial')?.classList.add('hidden');
}

function showModal(title,bodyHtml,onConfirm,confirmLabel='Confirmer'){
  document.getElementById('gmodal-title').textContent=title;
  document.getElementById('gmodal-body').innerHTML=bodyHtml;
  const foot=document.getElementById('gmodal-foot');
  if(onConfirm){foot.classList.remove('hidden');foot.innerHTML=`<button class="btn bg" onclick="closeModal()">Annuler</button><button class="btn bp" id="gm-ok">${esc(confirmLabel)}</button>`;document.getElementById('gm-ok').onclick=()=>{onConfirm();closeModal();};}
  else foot.classList.add('hidden');
  document.getElementById('gmodal').classList.remove('hidden');
  document.getElementById('gmodal-x').onclick=closeModal;
  document.getElementById('gmodal').onclick=(e)=>{if(e.target.id==='gmodal')closeModal();};
}
function closeModal(){document.getElementById('gmodal').classList.add('hidden');}
function promptModal(title,def,cb){showModal(title,`<div class="ig"><input type="text" class="inp" id="pi-inp" value="${esc(def)}" placeholder="Nom…"></div>`,()=>cb(document.getElementById('pi-inp').value));setTimeout(()=>document.getElementById('pi-inp')?.focus(),40);}

function toast(msg,type='info'){
  const icons={ok:`<svg class="ti" width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.2"/><path d="M3.5 6l2 2 3-3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,err:`<svg class="ti" width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.2"/><path d="M4 4l4 4M8 4l-4 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,info:`<svg class="ti" width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.2"/><path d="M6 5.5v3.5M6 4.5V5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`};
  const el=document.createElement('div');el.className=`toast ti-${type}`;el.innerHTML=`${icons[type]||icons.info}<span>${esc(msg)}</span>`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(()=>{el.classList.add('out');setTimeout(()=>el.remove(),200);},3800);
}
