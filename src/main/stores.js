'use strict';
/**
 * AlterMail — Store Architecture v6
 *
 * Stores per profile (all stored as separate JSON files in userData):
 *
 *  am_meta.json              → global: profile list, active profile (always plain)
 *
 *  am_settings_{id}.json     → UI prefs: themes, shortcuts, tab order, tutorial flag
 *                               (always plain — no sensitive data)
 *
 *  am_data_{id}.json         → logical data: cover letter, templates, sent mails,
 *                               tracker rows, tracker settings, CV path
 *                               (each key protected at user-chosen criticality)
 *
 *  am_credentials_{id}.json  → mail config, IMAP credentials
 *                               (each key protected at user-chosen criticality,
 *                                default level 2 = AES-256-GCM)
 *
 *  am_security_{id}.json     → criticality levels per data key (always plain —
 *                               contains no sensitive data, only integers 0-3)
 *
 * Security levels (user-configurable per data category):
 *   0 → Plain text  (stored as-is, human-readable)
 *   1 → Obfuscated  (XOR + base64 + shuffle — hides from casual inspection)
 *   2 → Encrypted   (AES-256-GCM, key from machine fingerprint — default for credentials)
 *   3 → Obfuscated + Encrypted (both layers)
 */

const Store = require('electron-store');

// ─── Default criticality levels per category ─────────────────────────────────
const DEFAULT_CRITICALITY = {
  // credentials store fields
  mailConfig:    2,   // AES-256-GCM by default

  // data store fields
  coverLetter:   0,   // plain by default
  templates:     0,
  sentMails:     1,   // obfuscated by default (contains email addresses)
  tracker:       0,
  trackerSettings: 0,
  cv:            0,
};

// ─── Meta store (global, always plain) ───────────────────────────────────────
let _meta = null;
function meta() {
  if (!_meta) _meta = new Store({ name: 'am_meta' });
  return _meta;
}

// ─── Per-profile store factories (cached) ─────────────────────────────────────
const _cache = {};
function _store(type, id) {
  const key = `${type}|${id}`;
  if (!_cache[key]) _cache[key] = new Store({ name: `am_${type}_${id}` });
  return _cache[key];
}

function settings(id)    { return _store('settings',    id || activeId()); }
function data(id)        { return _store('data',        id || activeId()); }
function credentials(id) { return _store('credentials', id || activeId()); }
function security(id)    { return _store('security',    id || activeId()); }

// ─── Active profile shortcuts ─────────────────────────────────────────────────
function activeId()          { return meta().get('activeProfile', 'default'); }
function activeSettings()    { return settings(activeId()); }
function activeData()        { return data(activeId()); }
function activeCredentials() { return credentials(activeId()); }
function activeSecurity()    { return security(activeId()); }

// ─── Criticality helpers ──────────────────────────────────────────────────────
/**
 * Returns the criticality level (0-3) for a given data key.
 * Falls back to DEFAULT_CRITICALITY, then 0.
 */
function getCriticality(dataKey) {
  const stored = activeSecurity().get('levels', {});
  if (dataKey in stored) return stored[dataKey];
  if (dataKey in DEFAULT_CRITICALITY) return DEFAULT_CRITICALITY[dataKey];
  return 0;
}

/**
 * Set a criticality level for a data key.
 */
function setCriticality(dataKey, level) {
  const levels = activeSecurity().get('levels', {});
  levels[dataKey] = level;
  activeSecurity().set('levels', levels);
}

/**
 * Returns all configured criticality levels merged with defaults.
 */
function getAllCriticality() {
  const stored = activeSecurity().get('levels', {});
  return { ...DEFAULT_CRITICALITY, ...stored };
}

/**
 * Bulk-set criticality levels (from UI).
 */
function setAllCriticality(levels) {
  activeSecurity().set('levels', levels);
}

// ─── Profile helpers ──────────────────────────────────────────────────────────
function getProfiles() {
  return meta().get('profiles', [{ id: 'default', name: 'Profil principal' }]);
}
function setProfiles(list) { meta().set('profiles', list); }
function switchProfile(id) { meta().set('activeProfile', id); }

// ─── Invalidate cache for a profile (e.g. after delete) ──────────────────────
function invalidateProfile(id) {
  ['settings','data','credentials','security'].forEach(type => {
    delete _cache[`${type}|${id}`];
  });
}

module.exports = {
  meta, settings, data, credentials, security,
  activeId, activeSettings, activeData, activeCredentials, activeSecurity,
  getCriticality, setCriticality, getAllCriticality, setAllCriticality,
  DEFAULT_CRITICALITY,
  getProfiles, setProfiles, switchProfile, invalidateProfile,
};
