/* AlterMail v3 — Renderer */
'use strict';
const api = window.am;

// ─── State ──────────────────────────────────────────────────────────────────
const S = {
  page: 'compose',
  profiles: [], activeProfile: 'default',
  cv: null, coverLetter: '',
  templates: [],
  mailConfig: null,
  sentMails: [],
  tracker: [],
  trackerSettings: {}
};

// ─── Boot ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setupWindow();
  setupNav();
  setupProfileSwitcher();
  await loadAll();
  renderPage('compose');
  api.startReplyPolling();
  checkRelanceReminders();
  // Check reminders every hour
  setInterval(checkRelanceReminders, 60 * 60 * 1000);
});

async function loadAll() {
  const [pf, cv, cl, tpls, cfg, mails, trk, trks] = await Promise.all([
    api.getProfiles(), api.getCVInfo(), api.getCoverLetter(),
    api.getTemplates(), api.getMailConfig(), api.getSentMails(),
    api.getTracker(), api.getTrackerSettings()
  ]);
  S.profiles        = pf.profiles;
  S.activeProfile   = pf.active;
  S.cv              = cv;
  S.coverLetter     = cl;
  S.templates       = tpls;
  S.mailConfig      = cfg;
  S.sentMails       = mails;
  S.tracker         = trk;
  S.trackerSettings = trks;
  updateBadges();
  updateProfileDisplay();
}

// ─── Window ──────────────────────────────────────────────────────────────────
function setupWindow() {
  document.getElementById('tc-min').onclick  = () => api.minimize();
  document.getElementById('tc-max').onclick  = () => api.maximize();
  document.getElementById('tc-cls').onclick  = () => api.close();
  document.getElementById('ni-data').onclick = () => api.openDataFolder();
}

// ─── Nav ─────────────────────────────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll('.ni[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ni').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderPage(btn.dataset.page);
    });
  });
}

function navigateTo(page) {
  document.querySelectorAll('.ni').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  renderPage(page);
}

function renderPage(page) {
  S.page = page;
  const c   = document.getElementById('content');
  c.innerHTML = '';
  const map = { compose, documents, templates, thread, tracker, settings };
  map[page]?.(c);
}

function updateBadges() {
  const unread = S.sentMails.reduce((a, m) => a + (m.replies||[]).filter(r=>!r.read).length, 0);
  setBdg('bdg-thread', unread);
  const reminders = getRelancesToday().length;
  setBdg('bdg-tracker', reminders);
}

function setBdg(id, n) {
  const el = document.getElementById(id);
  if (!el) return;
  if (n > 0) { el.textContent = n; el.classList.remove('hidden'); }
  else el.classList.add('hidden');
}

// ─── Profile switcher ─────────────────────────────────────────────────────────
function setupProfileSwitcher() {
  const btn = document.getElementById('psw-btn');
  const dd  = document.getElementById('psw-dd');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dd.classList.toggle('hidden');
  });
  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!document.getElementById('psw')?.contains(e.target)) {
      dd.classList.add('hidden');
    }
  });
}

function updateProfileDisplay() {
  const active = S.profiles.find(p => p.id === S.activeProfile);
  document.getElementById('psw-name').textContent = active?.name || 'Profil';
  renderProfileDropdown();
}

function renderProfileDropdown() {
  const dd = document.getElementById('psw-dd');
  if (!dd) return;
  dd.innerHTML = `
    ${S.profiles.map(p => `
      <div class="pi ${p.id === S.activeProfile ? 'active' : ''}" data-pid="${p.id}">
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><circle cx="5.5" cy="3.5" r="2.2" stroke="currentColor" stroke-width="1.1"/><path d="M1 9.5c0-2 2-3.5 4.5-3.5S10 7.5 10 9.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>
        <span>${esc(p.name)}</span>
        ${p.id !== 'default' ? `<div class="pi-acts">
          <button class="pi-ren" data-pid="${p.id}" title="Renommer">✎</button>
          <button class="pi-del" data-pid="${p.id}" title="Supprimer">✕</button>
        </div>` : ''}
      </div>
    `).join('')}
    <div class="divider" style="margin:5px 0"></div>
    <div class="pi" id="pi-new">
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
      <span>Nouveau profil</span>
    </div>
  `;

  dd.querySelectorAll('.pi[data-pid]').forEach(item => {
    item.addEventListener('click', async (e) => {
      if (e.target.closest('.pi-acts')) return;
      const pid = item.dataset.pid;
      if (pid === S.activeProfile) { dd.classList.add('hidden'); return; }
      await api.switchProfile(pid);
      dd.classList.add('hidden');
      await loadAll();
      renderPage(S.page);
    });
  });

  dd.querySelectorAll('.pi-ren').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const pid = btn.dataset.pid;
      const p   = S.profiles.find(x => x.id === pid);
      promptModal('Renommer le profil', p?.name || '', async name => {
        if (!name.trim()) return;
        await api.renameProfile(pid, name.trim());
        S.profiles = S.profiles.map(x => x.id === pid ? { ...x, name: name.trim() } : x);
        updateProfileDisplay();
      });
    };
  });

  dd.querySelectorAll('.pi-del').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm('Supprimer ce profil et toutes ses données ?')) return;
      await api.deleteProfile(btn.dataset.pid);
      S.profiles = S.profiles.filter(p => p.id !== btn.dataset.pid);
      if (S.activeProfile === btn.dataset.pid) {
        S.activeProfile = 'default';
        await api.switchProfile('default');
        await loadAll();
        renderPage(S.page);
      } else updateProfileDisplay();
    };
  });

  document.getElementById('pi-new')?.addEventListener('click', () => {
    promptModal('Nouveau profil', '', async name => {
      if (!name.trim()) return;
      const id = await api.createProfile(name.trim());
      S.profiles.push({ id, name: name.trim() });
      await api.switchProfile(id);
      dd.classList.add('hidden');
      await loadAll();
      renderPage(S.page);
    });
  });
}

// ════════════════════════════════════════════════════════════════════════════
// PAGE: COMPOSE
// ════════════════════════════════════════════════════════════════════════════
function compose(c) {
  const tpl     = S.templates[0] || { subject: '', body: '' };
  const allVars = extractVars((tpl.subject||'') + '\n' + (tpl.body||'') + '\n' + S.coverLetter);

  c.innerHTML = `<div class="page">
    <div class="ph"><div class="ph-left">
      <h1 class="pt">Composer un mail</h1>
      <p class="ps">Envoi de candidature avec CV et lettre de motivation en PDF.</p>
    </div></div>

    ${!S.mailConfig ? `<div class="ib mb8"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M6.5 6v3.5M6.5 5v.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg><span>Aucune boîte mail. <strong style="color:var(--accent);cursor:pointer" onclick="navigateTo('settings')">Configurer →</strong></span></div>` : ''}

    <div class="card">
      <div class="ct">Destinataire</div>
      <div class="g2">
        <div class="ig" style="margin:0">
          <label class="lbl">Email de l'entreprise</label>
          <input type="email" class="inp" id="to-email" placeholder="rh@entreprise.fr">
        </div>
        <div class="ig" style="margin:0">
          <label class="lbl">Modèle à utiliser</label>
          <select class="inp" id="tpl-select">
            ${S.templates.map((t, i) => `<option value="${i}">${esc(t.name)}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>

    ${allVars.length ? `
      <div class="card">
        <div class="ct">Variables du modèle</div>
        <div class="ib mb8"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M4 3l-2.5 3.5L4 10M9 3l2.5 3.5L9 10M7.5 2l-2 9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Ces champs remplacent les <span class="vc">{variables}</span> dans l'objet, le corps et la lettre de motivation.</span></div>
        <div class="g2" id="var-form">
          ${allVars.map(v => `<div class="ig" style="margin:0"><label class="lbl"><span class="vc">{${esc(v)}}</span></label><input type="text" class="inp" data-var="${esc(v)}" placeholder="${varPh(v)}"></div>`).join('')}
        </div>
      </div>
    ` : `<div class="card"><div class="ct">Variables</div><div class="empty" style="padding:18px"><svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M4 5l5 5-5 5M12 17h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg><p>Aucune variable. Ajoutez <span class="vc">{entreprise_name}</span> dans vos modèles.</p></div></div>`}

    <div class="card">
      <div class="ct">Récapitulatif</div>
      <div class="rc mb8"><span class="lbl" style="margin:0;min-width:55px">Objet :</span><span id="prev-subj" style="font-size:12.5px;color:var(--t2)">${esc(tpl.subject||'(aucun)')}</span></div>
      <div class="rc mb8"><span class="lbl" style="margin:0;min-width:55px">CV :</span>${S.cv ? `<span class="tag tok">✓ ${esc(S.cv.name)}</span>` : `<span class="tag terr">Non uploadé</span>`}</div>
      <div class="rc"><span class="lbl" style="margin:0;min-width:55px">LM :</span>${S.coverLetter.trim() ? `<span class="tag tok">✓ Jointe en PDF</span>` : `<span class="tag twarn">Non rédigée</span>`}</div>
    </div>

    <div class="row">
      <button class="btn bp" id="btn-prev" ${!S.mailConfig?'disabled':''}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M11 1L5 7M11 1l-3.5 9.5L5 7.5 1.5 5.5 11 1z" stroke="white" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Aperçu et envoi
      </button>
      <button class="btn bs" onclick="navigateTo('templates')">Modifier les modèles</button>
    </div>
  </div>`;

  const getActiveTpl = () => S.templates[parseInt(document.getElementById('tpl-select')?.value||'0')] || S.templates[0] || { subject:'', body:'' };

  const updatePrev = () => {
    const t    = getActiveTpl();
    const vars = gatherVars();
    document.getElementById('prev-subj').textContent = resolveVars(t.subject||'', vars) || '(aucun)';
    // Update var form if template changed
  };

  document.getElementById('tpl-select')?.addEventListener('change', () => {
    const t       = getActiveTpl();
    const newVars = extractVars((t.subject||'') + '\n' + (t.body||'') + '\n' + S.coverLetter);
    const form    = document.getElementById('var-form');
    if (form) {
      form.innerHTML = newVars.map(v => `<div class="ig" style="margin:0"><label class="lbl"><span class="vc">{${esc(v)}}</span></label><input type="text" class="inp" data-var="${esc(v)}" placeholder="${varPh(v)}"></div>`).join('');
      document.querySelectorAll('[data-var]').forEach(i => i.addEventListener('input', updatePrev));
    }
    updatePrev();
  });

  document.querySelectorAll('[data-var]').forEach(i => i.addEventListener('input', updatePrev));

  document.getElementById('btn-prev').onclick = () => {
    const to = document.getElementById('to-email').value.trim();
    if (!to || !to.includes('@')) { toast('Adresse email invalide.', 'err'); return; }
    const t    = getActiveTpl();
    const vars = gatherVars();
    openSendModal(to, t, vars);
  };

  function gatherVars() {
    const v = {};
    document.querySelectorAll('[data-var]').forEach(i => { v[i.dataset.var] = i.value.trim(); });
    return v;
  }
}

// ─── Send preview modal ───────────────────────────────────────────────────────
function openSendModal(to, tpl, vars) {
  const rSubj = resolveVars(tpl.subject||'', vars);
  const rBody = resolveVars(tpl.body||'', vars);
  const rCL   = resolveVars(S.coverLetter||'', vars);

  const ov   = document.getElementById('send-modal');
  const body = document.getElementById('send-modal-body');
  const foot = document.getElementById('send-modal-foot');

  ov.classList.remove('hidden');
  document.getElementById('send-modal-x').onclick = () => ov.classList.add('hidden');
  ov.onclick = (e) => { if (e.target === ov) ov.classList.add('hidden'); };

  body.innerHTML = `
    <div class="ib mb12"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M6.5 6v3.5M6.5 5v.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg><span>Vous pouvez modifier exceptionnellement ces champs avant l'envoi.</span></div>
    <div class="ig"><label class="lbl">Destinataire</label><input class="inp" id="sm-to" type="email" value="${esc(to)}"></div>
    <div class="ig"><label class="lbl">Objet</label><input class="inp" id="sm-subj" type="text" value="${esc(rSubj)}"></div>
    <div class="ig"><label class="lbl">Corps du mail</label><textarea class="inp" id="sm-body" rows="5">${esc(rBody)}</textarea></div>
    <div class="ig"><label class="lbl">Lettre de motivation <span class="tag tacc" style="font-size:10px;margin-left:5px">→ PDF joint</span></label><textarea class="inp" id="sm-cl" rows="7">${esc(rCL)}</textarea></div>
    <div class="rc mt8"><span class="lbl" style="margin:0;min-width:50px">CV :</span>${S.cv ? `<span class="tag tok">✓ ${esc(S.cv.name)}</span>` : `<span class="tag terr">Non uploadé</span>`}</div>
  `;

  foot.innerHTML = `
    <button class="btn bg" onclick="document.getElementById('send-modal').classList.add('hidden')">Annuler</button>
    <button class="btn bp" id="sm-send"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M11 1L5 7M11 1l-3.5 9.5L5 7.5 1.5 5.5 11 1z" stroke="white" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>Envoyer</button>
  `;

  document.getElementById('sm-send').onclick = async () => {
    const finalTo   = document.getElementById('sm-to').value.trim();
    const finalSubj = document.getElementById('sm-subj').value.trim();
    const finalBody = document.getElementById('sm-body').value.trim();
    const finalCL   = document.getElementById('sm-cl').value.trim();
    if (!finalTo || !finalTo.includes('@')) { toast('Email invalide.', 'err'); return; }
    const btn = document.getElementById('sm-send');
    btn.disabled = true; btn.innerHTML = `<span class="sp"></span> Envoi…`;

    const r = await api.sendMail({ to: finalTo, subject: finalSubj, body: finalBody, coverLetter: finalCL, variables: {} });
    btn.disabled = false; btn.innerHTML = 'Envoyer';

    if (r.success) {
      ov.classList.add('hidden');
      toast('Candidature envoyée !', 'ok');
      S.sentMails = await api.getSentMails();
      S.tracker   = await api.getTracker();
      updateBadges();
    } else toast('Erreur : ' + r.error, 'err');
  };
}

// ════════════════════════════════════════════════════════════════════════════
// PAGE: DOCUMENTS
// ════════════════════════════════════════════════════════════════════════════
function documents(c) {
  c.innerHTML = `<div class="page">
    <div class="ph"><div class="ph-left"><h1 class="pt">Documents</h1><p class="ps">CV (PDF) et lettre de motivation. Stockage local uniquement.</p></div></div>

    <div class="card">
      <div class="ct">Curriculum Vitæ — PDF</div>
      <div id="cv-zone">${S.cv ? cvChip() : cvDz()}</div>
    </div>

    <div class="card">
      <div class="ct">Lettre de motivation</div>
      <div class="ib mb8"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M4 3l-2.5 3.5L4 10M9 3l2.5 3.5L9 10M7.5 2l-2 9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Utilisez <span class="vc">{variable}</span> pour personnaliser. Elle sera convertie en PDF et jointe automatiquement.</span></div>
      <div class="ig"><textarea class="inp" id="cl-txt" rows="15" placeholder="Madame, Monsieur,&#10;&#10;Je me permets de vous contacter afin de postuler au sein de {entreprise_name}...">${esc(S.coverLetter)}</textarea></div>
      <div class="vrow" id="cl-vars">${renderVCs(extractVars(S.coverLetter))}</div>
      <div class="row mt12">
        <button class="btn bp" id="btn-save-cl">Enregistrer</button>
        <span id="cl-ok" style="font-size:12px;color:var(--a3);line-height:2.2"></span>
      </div>
    </div>
  </div>`;

  initCVZone();

  const txt = document.getElementById('cl-txt');
  txt.addEventListener('input', () => { document.getElementById('cl-vars').innerHTML = renderVCs(extractVars(txt.value)); });
  document.getElementById('btn-save-cl').onclick = async () => {
    await api.saveCoverLetter(txt.value);
    S.coverLetter = txt.value;
    const el = document.getElementById('cl-ok');
    el.textContent = '✓ Enregistrée';
    toast('Lettre de motivation enregistrée.', 'ok');
    setTimeout(() => { if (el) el.textContent = ''; }, 2000);
  };
}

function cvDz() { return `<div class="dz" id="cv-dz"><div class="dz-ic"><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 13V4M6 8l4-4 4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 17h14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></div><div class="dz-tx"><strong>Cliquer pour uploader</strong> ou glisser</div><div class="dz-hi">PDF uniquement</div></div>`; }
function cvChip() { return `<div class="fc"><div class="fc-ic"><svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="2" y="1" width="9" height="13" rx="2" stroke="currentColor" stroke-width="1.3"/><path d="M4.5 5.5h5M4.5 8h3.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg></div><span class="fc-nm">${esc(S.cv?.name||'')}</span><button class="fc-rm" id="btn-rm-cv"><svg width="12" height="12" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></button></div>`; }

function initCVZone() {
  const zone = document.getElementById('cv-zone');
  if (!zone) return;
  const dz = document.getElementById('cv-dz');
  if (dz) {
    dz.onclick = doUploadCV;
    dz.ondragover  = (e) => { e.preventDefault(); dz.classList.add('ov'); };
    dz.ondragleave = () => dz.classList.remove('ov');
    dz.ondrop      = (e) => { e.preventDefault(); dz.classList.remove('ov'); doUploadCV(); };
  }
  document.getElementById('btn-rm-cv')?.addEventListener('click', async () => {
    await api.removeCV(); S.cv = null;
    zone.innerHTML = cvDz(); initCVZone();
    toast('CV supprimé.', 'info');
  });
  async function doUploadCV() {
    const r = await api.uploadCV();
    if (r) { S.cv = r; zone.innerHTML = cvChip(); initCVZone(); toast('CV uploadé.', 'ok'); }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PAGE: TEMPLATES (multi)
// ════════════════════════════════════════════════════════════════════════════
function templates(c) {
  let activeIdx = 0;
  const renderTabs = () => S.templates.map((t, i) =>
    `<button class="tpl-tab ${i === activeIdx ? 'active' : ''}" data-tidx="${i}">${esc(t.name)}</button>`
  ).join('');

  const renderEditor = () => {
    const t = S.templates[activeIdx] || {};
    return `
      <div class="card">
        <div class="ct">Nom du modèle</div>
        <input type="text" class="inp" id="tpl-name" value="${esc(t.name||'')}">
      </div>
      <div class="card">
        <div class="ct">Objet</div>
        <input type="text" class="inp" id="tpl-subj" value="${esc(t.subject||'')}" placeholder="Candidature {poste} chez {entreprise_name}">
        <div class="vrow mt8" id="tpl-svars">${renderVCs(extractVars(t.subject||''))}</div>
      </div>
      <div class="card">
        <div class="ct">Corps du mail</div>
        <div class="ib mb8"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M6.5 6v3.5M6.5 5v.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg><span>La LM est jointe en PDF automatiquement — ne la réécrivez pas ici.</span></div>
        <textarea class="inp" id="tpl-body" rows="9" placeholder="Madame, Monsieur,&#10;&#10;...">${esc(t.body||'')}</textarea>
        <div class="vrow mt8" id="tpl-bvars">${renderVCs(extractVars(t.body||''))}</div>
      </div>
      <div class="card">
        <div class="ct">Toutes les variables (modèle + LM)</div>
        <div class="vrow" id="tpl-allvars">${renderVCs(extractVars((t.subject||'') + '\n' + (t.body||'') + '\n' + S.coverLetter))}</div>
      </div>
      <div class="row">
        <button class="btn bp" id="btn-save-tpl">Enregistrer ce modèle</button>
        ${S.templates.length > 1 ? `<button class="btn bd" id="btn-del-tpl">Supprimer</button>` : ''}
      </div>
    `;
  };

  const mount = () => {
    c.innerHTML = `<div class="page">
      <div class="ph">
        <div class="ph-left"><h1 class="pt">Modèles de mail</h1><p class="ps">Gérez plusieurs modèles : candidature principale, relance, etc.</p></div>
      </div>
      <div style="display:flex;align-items:center;gap:4px;margin-bottom:14px;border-bottom:1px solid var(--bd);padding-bottom:0">
        ${renderTabs()}
        <button class="btn bs sm tpl-add" id="btn-add-tpl">+ Nouveau modèle</button>
      </div>
      <div id="tpl-editor">${renderEditor()}</div>
    </div>`;

    document.querySelectorAll('.tpl-tab').forEach(tab => {
      tab.onclick = () => { activeIdx = parseInt(tab.dataset.tidx); mount(); };
    });

    document.getElementById('btn-add-tpl').onclick = () => {
      S.templates.push({ id: Date.now().toString(36), name: `Modèle ${S.templates.length + 1}`, subject: '', body: '' });
      activeIdx = S.templates.length - 1;
      mount();
    };

    const sI = document.getElementById('tpl-subj');
    const bI = document.getElementById('tpl-body');
    const refreshVars = () => {
      document.getElementById('tpl-svars').innerHTML = renderVCs(extractVars(sI.value));
      document.getElementById('tpl-bvars').innerHTML = renderVCs(extractVars(bI.value));
      document.getElementById('tpl-allvars').innerHTML = renderVCs(extractVars(sI.value + '\n' + bI.value + '\n' + S.coverLetter));
    };
    sI?.addEventListener('input', refreshVars);
    bI?.addEventListener('input', refreshVars);

    document.getElementById('btn-save-tpl').onclick = async () => {
      const name = document.getElementById('tpl-name').value.trim();
      if (!name) { toast('Donnez un nom au modèle.', 'err'); return; }
      S.templates[activeIdx] = {
        ...S.templates[activeIdx],
        name,
        subject: document.getElementById('tpl-subj').value,
        body:    document.getElementById('tpl-body').value
      };
      await api.saveTemplates(S.templates);
      toast('Modèle enregistré.', 'ok');
      mount();
    };

    document.getElementById('btn-del-tpl')?.addEventListener('click', async () => {
      if (!confirm('Supprimer ce modèle ?')) return;
      S.templates.splice(activeIdx, 1);
      activeIdx = Math.max(0, activeIdx - 1);
      await api.saveTemplates(S.templates);
      mount();
    });
  };
  mount();
}

// ════════════════════════════════════════════════════════════════════════════
// PAGE: THREAD (conversations)
// ════════════════════════════════════════════════════════════════════════════
function thread(c) {
  c.innerHTML = `<div class="page">
    <div class="ph">
      <div class="ph-left"><h1 class="pt">Conversations</h1><p class="ps">${S.sentMails.length} candidature${S.sentMails.length!==1?'s':''} · cliquez pour dérouler.</p></div>
      <button class="btn bs" id="btn-refresh"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M11 6A5 5 0 1 1 6 1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M11 1v5H6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>Rafraîchir</button>
    </div>
    ${S.sentMails.length === 0 ? `<div class="empty"><svg width="34" height="34" viewBox="0 0 34 34" fill="none"><path d="M31 4L14 21M31 4l-9 25-5.5-5.5-5.5-3L31 4z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg><p>Aucune candidature envoyée.</p></div>`
    : `<div id="thread-list">${S.sentMails.map(m => threadItem(m)).join('')}</div>`}
  </div>`;

  document.querySelectorAll('.ti-hd').forEach(hd => {
    hd.onclick = async () => {
      const wrap = hd.closest('.ti-wrap');
      const body = wrap.querySelector('.ti-body');
      const chev = wrap.querySelector('.ti-chev');
      const mid  = wrap.dataset.mid;
      const isOpen = body.classList.contains('open');
      body.classList.toggle('open', !isOpen);
      chev.classList.toggle('open', !isOpen);
      if (!isOpen) {
        const m = S.sentMails.find(x => x.id === mid);
        if (m) for (const r of (m.replies||[]).filter(r=>!r.read)) { await api.markReplyRead(mid, r.id); r.read = true; }
        updateBadges();
      }
    };
  });

  document.querySelectorAll('.ti-del').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm('Supprimer cette conversation ?')) return;
      await api.deleteSentMail(btn.dataset.mid);
      S.sentMails = S.sentMails.filter(m => m.id !== btn.dataset.mid);
      updateBadges();
      renderPage('thread');
    };
  });

  document.getElementById('btn-refresh').onclick = async () => {
    if (!S.mailConfig)       { toast('Configurez votre boîte mail d\'abord.', 'err'); return; }
    if (!S.mailConfig?.imap) { toast('IMAP requis (activez "Envoi + Lecture" dans Paramètres).', 'err'); return; }
    const btn = document.getElementById('btn-refresh');
    btn.disabled = true; btn.innerHTML = `<span class="sp"></span> Chargement…`;
    const r = await api.fetchReplies();
    btn.disabled = false; btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M11 6A5 5 0 1 1 6 1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M11 1v5H6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>Rafraîchir`;
    if (!r.success) { toast('Erreur : ' + r.error, 'err'); return; }
    S.sentMails = r.sentMails;
    updateBadges();
    renderPage('thread');
    if (r.newReplies > 0) toast(`${r.newReplies} nouvelle${r.newReplies>1?'s':''} réponse${r.newReplies>1?'s':''} !`, 'ok');
    else toast('Aucune nouvelle réponse.', 'info');
  };
}

function threadItem(m) {
  const replies = m.replies || [];
  const unread  = replies.filter(r => !r.read).length;
  const sentDate = new Date(m.sentAt).toLocaleDateString('fr-FR', { day:'2-digit', month:'short' });
  return `<div class="ti-wrap" data-mid="${m.id}">
    <div class="ti-hd">
      <div class="ti-dot ${replies.length > 0 ? 'has-reply' : ''}"></div>
      <div class="ti-info">
        <div class="ti-to">${esc(m.to)}</div>
        <div class="ti-subj">${esc(m.subject)}</div>
      </div>
      <div class="ti-meta">
        <span class="ti-date">${sentDate}</span>
        ${unread > 0 ? `<span class="tag ta2">${unread} non lu${unread>1?'s':''}</span>` : ''}
        ${replies.length > 0 ? `<span class="tag tok">${replies.length} rép.</span>` : ''}
      </div>
      <svg class="ti-chev" width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M4.5 2.5l4 4-4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    <div class="ti-body">
      <div class="tl">
        <div class="tl-item">
          <div class="tl-icon tl-ic-sent"><svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M8.5 0.5L4 5M8.5 0.5l-2.5 8L4 5.5 1 4 8.5 0.5z" stroke="currentColor" stroke-width=".9" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
          <div class="tl-c">
            <div class="tl-lbl">Envoyé · ${new Date(m.sentAt).toLocaleString('fr-FR')}</div>
            <div class="tl-card"><div class="tl-subj">${esc(m.subject)}</div>${m.body ? `<div class="tl-prev">${esc(m.body.slice(0,180))}</div>` : ''}</div>
          </div>
        </div>
        ${replies.map(r => `
          <div class="tl-item ${r.read?'':'tl-unread'}">
            <div class="tl-icon tl-ic-reply"><svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M3.5 2L1 4.5l2.5 2.5M1 4.5h5a2 2 0 000-4H4" stroke="currentColor" stroke-width=".9" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
            <div class="tl-c">
              <div class="tl-lbl">Réponse · ${new Date(r.date).toLocaleString('fr-FR')}${!r.read?' · <span style="color:var(--a3)">Nouveau</span>':''}</div>
              <div class="tl-card"><div class="tl-from">${esc(r.fromDomain)}</div><div class="tl-subj">${esc(r.subject)}</div>${r.preview ? `<div class="tl-prev">${esc(r.preview)}</div>` : ''}</div>
            </div>
          </div>
        `).join('')}
        ${replies.length === 0 ? `<div class="tl-item"><div style="font-size:12px;color:var(--t3);padding-left:31px">Aucune réponse reçue.</div></div>` : ''}
      </div>
      <div class="row" style="padding:10px 14px;border-top:1px solid var(--bd)">
        <button class="btn bd xs ti-del" data-mid="${m.id}">Supprimer</button>
      </div>
    </div>
  </div>`;
}

// ════════════════════════════════════════════════════════════════════════════
// PAGE: TRACKER
// ════════════════════════════════════════════════════════════════════════════
function tracker(c) {
  const ts = S.trackerSettings;
  const reminders = getRelancesToday();

  c.innerHTML = `<div class="page" style="max-width:100%;padding-right:16px">
    <div class="ph">
      <div class="ph-left"><h1 class="pt">Suivi des candidatures</h1><p class="ps">${S.tracker.length} candidature${S.tracker.length!==1?'s':''} suivie${S.tracker.length!==1?'s':''}.</p></div>
      <div class="row">
        <button class="btn bs sm" id="btn-tracker-settings">⚙ Paramètres</button>
        <button class="btn bp sm" id="btn-add-row">+ Ajouter</button>
      </div>
    </div>

    ${reminders.length > 0 ? `
      <div class="reminder-row mb12">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.2"/><path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
        <span><strong>${reminders.length}</strong> relance${reminders.length>1?'s':''} à effectuer aujourd'hui : ${reminders.map(r => `<strong>${esc(r.enterprise)}</strong>`).join(', ')}</span>
      </div>
    ` : ''}

    <div class="tbl-filters">
      <input type="text" class="inp" id="tbl-search" placeholder="Rechercher…" style="width:200px">
      <select class="inp" id="tbl-filter-resp" style="width:180px">
        <option value="">Toutes les réponses</option>
        ${ts.customResponses?.map(r => `<option>${esc(r)}</option>`).join('')}
      </select>
      <span class="filter-count" id="tbl-count">${S.tracker.length} ligne${S.tracker.length!==1?'s':''}</span>
      <button class="btn bg xs mla" id="btn-export-csv">↓ CSV</button>
    </div>

    <div class="tracker-wrap">
      <table class="tracker-tbl">
        <thead>
          <tr>
            <th>Entreprise</th><th>Département</th><th>Type</th><th>Date</th>
            <th>Réponse</th><th>Commentaire</th><th>Relances</th><th>Actions</th>
          </tr>
        </thead>
        <tbody id="tbl-body"></tbody>
      </table>
    </div>
  </div>`;

  renderTrackerRows();

  document.getElementById('btn-add-row').onclick = () => {
    S.tracker.unshift({
      id: 'tr_' + Date.now().toString(36),
      enterprise: '', department: '', contactType: 'mail',
      date: today(), response: 'Candidature envoyée',
      comment: '', mailId: null, relances: []
    });
    renderTrackerRows();
    saveTracker();
  };

  document.getElementById('btn-tracker-settings').onclick = () => showTrackerSettings();

  document.getElementById('tbl-search').addEventListener('input', renderTrackerRows);
  document.getElementById('tbl-filter-resp').addEventListener('change', renderTrackerRows);

  document.getElementById('btn-export-csv').onclick = () => {
    const header = 'Entreprise,Département,Type,Date,Réponse,Commentaire,Relances';
    const rows   = S.tracker.map(r =>
      [r.enterprise, r.department, r.contactType, r.date, r.response, r.comment,
       (r.relances||[]).map(x => x.date + (x.result ? ':' + x.result : '')).join(' | ')
      ].map(v => `"${(v||'').replace(/"/g,'""')}"`).join(',')
    );
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: `AlterMail_suivi_${today()}.csv` });
    a.click(); URL.revokeObjectURL(url);
  };
}

function renderTrackerRows() {
  const tbody     = document.getElementById('tbl-body');
  if (!tbody) return;
  const search    = (document.getElementById('tbl-search')?.value || '').toLowerCase();
  const filterRsp = document.getElementById('tbl-filter-resp')?.value || '';
  const ts        = S.trackerSettings;
  const FINAL     = ['Refus entreprise', 'Refus personnel', 'Candidature fermée'];

  const filtered = S.tracker.filter(r => {
    if (search && !JSON.stringify(r).toLowerCase().includes(search)) return false;
    if (filterRsp && r.response !== filterRsp) return false;
    return true;
  });

  document.getElementById('tbl-count').textContent = `${filtered.length} ligne${filtered.length!==1?'s':''}`;

  tbody.innerHTML = filtered.map(row => {
    const isFinal    = FINAL.includes(row.response);
    const relancesDue = !isFinal && daysUntilRelance(row, ts) === 0;
    const relances    = (row.relances || []);

    return `<tr data-trid="${row.id}" ${relancesDue ? 'style="background:rgba(255,209,102,.03)"' : ''}>
      <td><input class="tbl-inp" data-f="enterprise" value="${esc(row.enterprise)}" placeholder="Entreprise"></td>
      <td><input class="tbl-inp" data-f="department" value="${esc(row.department)}" placeholder="—"></td>
      <td>
        <select class="tbl-inp" data-f="contactType">
          ${(ts.customContactTypes||[]).map(t => `<option ${row.contactType===t?'selected':''}>${esc(t)}</option>`).join('')}
        </select>
      </td>
      <td><input class="tbl-inp" type="date" data-f="date" value="${row.date||today()}" style="color:var(--t1)"></td>
      <td>
        <select class="tbl-inp" data-f="response" style="${responseColor(row.response)}">
          ${(ts.customResponses||[]).map(r => `<option ${row.response===r?'selected':''}>${esc(r)}</option>`).join('')}
        </select>
      </td>
      <td><input class="tbl-inp" data-f="comment" value="${esc(row.comment)}" placeholder="…" style="min-width:120px"></td>
      <td>
        <div class="relance-list">
          ${relances.map((rel, ri) => `
            <div class="relance-item">
              <span class="relance-date">${rel.date}</span>
              ${rel.result ? `<span class="relance-badge done">${esc(rel.result)}</span>` : `<span class="relance-badge">En attente</span>`}
              <button class="btn bg xs" style="padding:1px 5px" onclick="editRelance('${row.id}', ${ri})">✎</button>
              <button class="btn bd xs" style="padding:1px 5px" onclick="delRelance('${row.id}', ${ri})">✕</button>
            </div>
          `).join('')}
          ${!isFinal && relances.length < (ts.maxRelances||5) ? `<button class="btn bg xs mt4" onclick="addRelance('${row.id}')">+ Relance</button>` : ''}
        </div>
      </td>
      <td>
        <div class="action-btns">
          ${row.mailId && !isFinal ? `<button class="btn bs xs" onclick="doRelanceMail('${row.id}')" title="Relance par mail">✉ Relance</button>` : ''}
          <button class="btn bd xs" onclick="deleteTrackerRow('${row.id}')" title="Supprimer">✕</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  // Bind field changes
  tbody.querySelectorAll('.tbl-inp').forEach(inp => {
    inp.addEventListener('change', () => {
      const tr  = inp.closest('tr');
      const id  = tr?.dataset.trid;
      const row = S.tracker.find(r => r.id === id);
      if (!row) return;
      row[inp.dataset.f] = inp.value;
      if (inp.dataset.f === 'response') {
        inp.style.cssText = responseColor(inp.value);
      }
      saveTracker();
    });
  });
}

window.deleteTrackerRow = async (id) => {
  if (!confirm('Supprimer cette ligne ?')) return;
  S.tracker = S.tracker.filter(r => r.id !== id);
  await saveTracker();
  renderTrackerRows();
};

window.addRelance = async (id) => {
  const row = S.tracker.find(r => r.id === id);
  if (!row) return;
  const ts  = S.trackerSettings;
  if ((row.relances||[]).length >= (ts.maxRelances||5)) { toast(`Maximum ${ts.maxRelances} relances.`, 'err'); return; }
  if (!row.relances) row.relances = [];
  const suggestedDate = addDays(row.relances.length > 0 ? row.relances[row.relances.length-1].date : row.date, ts.relanceDays||14);
  row.relances.push({ date: suggestedDate, result: '' });
  await saveTracker();
  renderTrackerRows();
};

window.delRelance = async (id, idx) => {
  const row = S.tracker.find(r => r.id === id);
  if (!row) return;
  row.relances.splice(idx, 1);
  await saveTracker();
  renderTrackerRows();
};

window.editRelance = (id, idx) => {
  const row = S.tracker.find(r => r.id === id);
  if (!row) return;
  const rel = row.relances[idx];
  showModal('Modifier la relance', `
    <div class="ig"><label class="lbl">Date de relance</label><input type="date" class="inp" id="rel-date" value="${rel.date}"></div>
    <div class="ig"><label class="lbl">Résultat (laisser vide si en attente)</label><input type="text" class="inp" id="rel-result" value="${esc(rel.result||'')}" placeholder="ex: Entretien planifié"></div>
  `, async () => {
    rel.date   = document.getElementById('rel-date').value;
    rel.result = document.getElementById('rel-result').value;
    await saveTracker();
    renderTrackerRows();
  }, 'Enregistrer');
};

window.doRelanceMail = (id) => {
  const row = S.tracker.find(r => r.id === id);
  if (!row) return;
  // Pre-fill compose and open send modal
  showModal('Relance par mail', `
    <div class="ig"><label class="lbl">Email destinataire</label><input type="email" class="inp" id="rel-to" placeholder="rh@${esc(row.enterprise?.toLowerCase()||'entreprise')}.fr"></div>
    <div class="ig"><label class="lbl">Modèle à utiliser</label>
      <select class="inp" id="rel-tpl">${S.templates.map((t,i) => `<option value="${i}">${esc(t.name)}</option>`).join('')}</select>
    </div>
  `, () => {
    const to      = document.getElementById('rel-to').value.trim();
    if (!to || !to.includes('@')) { toast('Email invalide.', 'err'); return; }
    const tplIdx  = parseInt(document.getElementById('rel-tpl').value||'0');
    const tpl     = S.templates[tplIdx] || S.templates[0];
    closeModal();
    openSendModal(to, tpl, {
      entreprise_name: row.enterprise,
      date_envoi: row.date
    });
  }, 'Ouvrir l\'aperçu');
};

function showTrackerSettings() {
  const ts = S.trackerSettings;
  showModal('Paramètres du suivi', `
    <div class="ig"><label class="lbl">Délai avant relance (jours)</label><input type="number" class="inp" id="ts-days" value="${ts.relanceDays||14}" min="1" max="365"></div>
    <div class="ig"><label class="lbl">Nombre maximum de relances par candidature</label><input type="number" class="inp" id="ts-max" value="${ts.maxRelances||3}" min="1" max="10"></div>
    <div class="divider"></div>
    <div class="ig">
      <label class="lbl">Types de contact (un par ligne)</label>
      <textarea class="inp" id="ts-types" rows="5">${(ts.customContactTypes||[]).join('\n')}</textarea>
    </div>
    <div class="ig">
      <label class="lbl">Réponses possibles (une par ligne)</label>
      <textarea class="inp" id="ts-resps" rows="7">${(ts.customResponses||[]).join('\n')}</textarea>
    </div>
  `, async () => {
    const newTs = {
      relanceDays:        parseInt(document.getElementById('ts-days').value) || 14,
      maxRelances:        parseInt(document.getElementById('ts-max').value) || 3,
      customContactTypes: document.getElementById('ts-types').value.split('\n').map(s=>s.trim()).filter(Boolean),
      customResponses:    document.getElementById('ts-resps').value.split('\n').map(s=>s.trim()).filter(Boolean),
    };
    await api.saveTrackerSettings(newTs);
    S.trackerSettings = newTs;
    toast('Paramètres enregistrés.', 'ok');
    renderPage('tracker');
  }, 'Enregistrer');
}

async function saveTracker() {
  await api.saveTracker(S.tracker);
  updateBadges();
}

function getRelancesToday() {
  const FINAL = ['Refus entreprise', 'Refus personnel', 'Candidature fermée'];
  const ts    = S.trackerSettings;
  return S.tracker.filter(row => {
    if (FINAL.includes(row.response)) return false;
    return daysUntilRelance(row, ts) === 0;
  });
}

function daysUntilRelance(row, ts) {
  const FINAL = ['Refus entreprise', 'Refus personnel', 'Candidature fermée'];
  if (FINAL.includes(row.response)) return -1;
  const relances = (row.relances || []);
  const maxRel   = ts.maxRelances || 3;
  if (relances.length >= maxRel) return -1;
  const lastDate = relances.length > 0 ? relances[relances.length-1].date : row.date;
  const dueDate  = addDays(lastDate, ts.relanceDays || 14);
  const diff     = Math.floor((new Date(dueDate) - new Date(today())) / 86400000);
  return Math.max(0, diff);
}

function checkRelanceReminders() {
  const reminders = getRelancesToday();
  updateBadges();
  if (reminders.length > 0 && S.page === 'tracker') renderPage('tracker');
}

// ════════════════════════════════════════════════════════════════════════════
// PAGE: SETTINGS
// ════════════════════════════════════════════════════════════════════════════
function settings(c) {
  const cfg = S.mailConfig || {};
  c.innerHTML = `<div class="page">
    <div class="ph"><div class="ph-left"><h1 class="pt">Paramètres</h1><p class="ps">Configuration de la boîte mail pour ce profil.</p></div></div>

    <div class="card">
      <div class="ct">Fournisseur email</div>
      <div class="pg">
        ${['gmail','outlook','imap'].map(p => `<div class="pc ${cfg.provider===p?'sel':''}" data-prov="${p}"><div class="pc-i">${p==='gmail'?'📧':p==='outlook'?'📮':'🔒'}</div><div class="pc-n">${p==='gmail'?'Gmail':p==='outlook'?'Outlook':'IMAP / SMTP'}</div></div>`).join('')}
      </div>
    </div>

    <div id="pform"></div>

    <div class="card">
      <div class="ct">Mode</div>
      <div class="rg">
        <label class="ri ${cfg.mode!=='read'?'sel':''}"><input type="radio" name="mode" value="send" ${cfg.mode!=='read'?'checked':''}><div><div class="ri-tx">Envoi uniquement</div><div class="ri-ds">Envoyer sans lire la boîte de réception.</div></div></label>
        <label class="ri ${cfg.mode==='read'?'sel':''}"><input type="radio" name="mode" value="read" ${cfg.mode==='read'?'checked':''}><div><div class="ri-tx">Envoi + Lecture des réponses</div><div class="ri-ds">Seul le domaine (@entreprise.fr) est stocké — confidentialité maximale.</div></div></label>
      </div>
    </div>

    <div class="row">
      <button class="btn bs" id="btn-test">Tester la connexion</button>
      <button class="btn bp" id="btn-save-cfg">Enregistrer</button>
      <span id="test-res" style="line-height:2.2;font-size:12px;display:flex;gap:5px;align-items:center;flex-wrap:wrap"></span>
    </div>
  </div>`;

  let selProv = cfg.provider || 'gmail';
  renderPForm(selProv, cfg);

  document.querySelectorAll('.pc').forEach(card => {
    card.onclick = () => { document.querySelectorAll('.pc').forEach(x=>x.classList.remove('sel')); card.classList.add('sel'); selProv = card.dataset.prov; renderPForm(selProv, {}); };
  });
  document.querySelectorAll('[name=mode]').forEach(r => {
    r.onchange = () => { document.querySelectorAll('.ri').forEach(i=>i.classList.remove('sel')); r.closest('.ri').classList.add('sel'); };
  });

  document.getElementById('btn-test').onclick = async () => {
    const c   = gatherCfg();
    const btn = document.getElementById('btn-test');
    const res = document.getElementById('test-res');
    btn.disabled = true; btn.innerHTML = `<span class="sp"></span> Test…`; res.innerHTML = '';
    const r = await api.testConnection(c);
    btn.disabled = false; btn.textContent = 'Tester la connexion';
    res.innerHTML = (r.smtp ? `<span class="tag tok">✓ SMTP OK</span>` : `<span class="tag terr" title="${esc(r.smtpError||'')}">✗ SMTP: ${esc((r.smtpError||'err').slice(0,55))}</span>`)
      + (c.mode==='read'&&c.imap ? (r.imap ? `<span class="tag tok">✓ IMAP OK</span>` : `<span class="tag terr" title="${esc(r.imapError||'')}">✗ IMAP: ${esc((r.imapError||'err').slice(0,55))}</span>`) : '');
  };

  document.getElementById('btn-save-cfg').onclick = async () => {
    await api.saveMailConfig(gatherCfg());
    S.mailConfig = gatherCfg();
    toast('Paramètres enregistrés.', 'ok');
  };

  function gatherCfg() {
    const mode = document.querySelector('[name=mode]:checked')?.value || 'send';
    const c    = { provider: selProv, mode };
    const v    = id => document.getElementById(id)?.value.trim() || '';
    if (selProv === 'gmail')   { c.email = v('g-email'); c.appPassword = v('g-pass'); }
    else if (selProv === 'outlook') { c.email = v('o-email'); c.password = v('o-pass'); }
    else {
      c.email = v('i-email'); c.password = v('i-pass');
      c.smtp  = { host: v('s-host'), port: parseInt(v('s-port'))||587 };
      if (mode === 'read') { c.imap = { host: v('i-host'), port: parseInt(v('i-port'))||993 }; c.imapPassword = c.password; }
    }
    return c;
  }

  function renderPForm(prov, data) {
    const f  = document.getElementById('pform');
    const sm = data.smtp || {}; const im = data.imap || {};
    if (prov === 'gmail') {
      f.innerHTML = `<div class="card"><div class="ct">Gmail</div><div class="ib mb8"><svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M6.5 6v3.5M6.5 5v.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg><span>Utilisez un <strong>mot de passe d'application</strong> Google (Sécurité → Validation 2 étapes → Mots de passe des applications).</span></div>
        <div class="g2"><div class="ig"><label class="lbl">Adresse Gmail</label><input type="email" class="inp" id="g-email" value="${esc(data.email||'')}" placeholder="vous@gmail.com"></div>
        <div class="ig"><label class="lbl">Mot de passe d'app (16 car.)</label><input type="password" class="inp" id="g-pass" value="${esc(data.appPassword||'')}" placeholder="xxxx xxxx xxxx xxxx"></div></div></div>`;
    } else if (prov === 'outlook') {
      f.innerHTML = `<div class="card"><div class="ct">Outlook</div>
        <div class="g2"><div class="ig"><label class="lbl">Email</label><input type="email" class="inp" id="o-email" value="${esc(data.email||'')}" placeholder="vous@outlook.com"></div>
        <div class="ig"><label class="lbl">Mot de passe</label><input type="password" class="inp" id="o-pass" value="${esc(data.password||'')}"></div></div></div>`;
    } else {
      f.innerHTML = `<div class="card"><div class="ct">IMAP / SMTP</div>
        <div class="g2"><div class="ig"><label class="lbl">Email</label><input type="email" class="inp" id="i-email" value="${esc(data.email||'')}" placeholder="vous@domaine.fr"></div>
        <div class="ig"><label class="lbl">Mot de passe</label><input type="password" class="inp" id="i-pass" value="${esc(data.password||'')}"></div></div>
        <div class="g2 mt8"><div class="ig"><label class="lbl">SMTP</label><input type="text" class="inp" id="s-host" value="${esc(sm.host||'')}" placeholder="smtp.domaine.fr"></div>
        <div class="ig"><label class="lbl">Port SMTP</label><input type="number" class="inp" id="s-port" value="${sm.port||587}"></div></div>
        <div class="divider"></div><p class="mb8" style="font-size:12px;color:var(--t3)">IMAP (pour la lecture des réponses)</p>
        <div class="g2"><div class="ig"><label class="lbl">IMAP</label><input type="text" class="inp" id="i-host" value="${esc(im.host||'')}" placeholder="imap.domaine.fr"></div>
        <div class="ig"><label class="lbl">Port IMAP</label><input type="number" class="inp" id="i-port" value="${im.port||993}"></div></div></div>`;
    }
  }
}

// ─── Utils ────────────────────────────────────────────────────────────────────
function extractVars(text) {
  if (!text) return [];
  return [...new Set((text.match(/\{([^}]+)\}/g)||[]).map(x=>x.slice(1,-1)))];
}
function renderVCs(vars) {
  return vars.length ? vars.map(v=>`<span class="vc">{${esc(v)}}</span>`).join('') : `<span style="font-size:11.5px;color:var(--t3)">Aucune variable</span>`;
}
function resolveVars(text, vars) {
  return (text||'').replace(/\{([^}]+)\}/g, (_,k) => vars[k]!==undefined ? vars[k] : `{${k}}`);
}
function varPh(k) { return k.replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase()); }
function esc(s) {
  if (s==null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function today() { return new Date().toISOString().split('T')[0]; }
function addDays(dateStr, days) {
  const d = new Date(dateStr); d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
function responseColor(r) {
  const map = {
    'Réponse positive':    'color:var(--a3)',
    'Refus entreprise':    'color:var(--err)',
    'Refus personnel':     'color:var(--err)',
    'Candidature fermée':  'color:var(--t3)',
    'Aucune réponse':      'color:var(--warn)',
    'Candidature envoyée': 'color:var(--t2)',
  };
  return map[r] || 'color:var(--t2)';
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function showModal(title, bodyHtml, onConfirm, confirmLabel = 'Confirmer') {
  document.getElementById('gmodal-title').textContent = title;
  document.getElementById('gmodal-body').innerHTML   = bodyHtml;
  const foot = document.getElementById('gmodal-foot');
  if (onConfirm) {
    foot.classList.remove('hidden');
    foot.innerHTML = `<button class="btn bg" onclick="closeModal()">Annuler</button><button class="btn bp" id="gm-ok">${esc(confirmLabel)}</button>`;
    document.getElementById('gm-ok').onclick = () => { onConfirm(); closeModal(); };
  } else foot.classList.add('hidden');
  document.getElementById('gmodal').classList.remove('hidden');
  document.getElementById('gmodal-x').onclick = closeModal;
  document.getElementById('gmodal').onclick = (e) => { if (e.target.id === 'gmodal') closeModal(); };
}

function closeModal() { document.getElementById('gmodal').classList.add('hidden'); }

function promptModal(title, def, cb) {
  showModal(title, `<div class="ig"><input type="text" class="inp" id="pi-inp" value="${esc(def)}" placeholder="Nom…"></div>`, () => {
    cb(document.getElementById('pi-inp').value);
  });
  setTimeout(() => document.getElementById('pi-inp')?.focus(), 40);
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const icons = {
    ok:   `<svg class="ti" width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.2"/><path d="M3.5 6l2 2 3-3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    err:  `<svg class="ti" width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.2"/><path d="M4 4l4 4M8 4l-4 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
    info: `<svg class="ti" width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.2"/><path d="M6 5.5v3.5M6 4.5V5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  };
  const el = document.createElement('div');
  el.className = `toast ti-${type}`;
  el.innerHTML = `${icons[type]||icons.info}<span>${esc(msg)}</span>`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(()=>el.remove(), 200); }, 3800);
}
