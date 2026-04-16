'use strict';
/**
 * AlterMail — Security Module
 * 
 * Criticality levels:
 *   0 → Plain text (no processing)
 *   1 → Obfuscated  (XOR + base64 + shuffle)
 *   2 → Encrypted   (AES-256-GCM via Node crypto)
 *   3 → Obfuscated + Encrypted (both layers)
 * 
 * The master key is derived from a machine-specific fingerprint
 * + an app-internal salt. No key is ever stored on disk.
 * Reverse-engineering requires both the binary AND the machine identity.
 */

const crypto = require('crypto');
const os     = require('os');

// ─── Machine fingerprint (non-stored, derived at runtime) ────────────────────
function getMachineFingerprint() {
  const parts = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.cpus()?.[0]?.model || '',
    os.networkInterfaces()
      ? Object.values(os.networkInterfaces())
          .flat()
          .filter(i => !i.internal && i.mac !== '00:00:00:00:00:00')
          .map(i => i.mac)
          .sort()
          .join(':')
      : ''
  ];
  return parts.join('|');
}

// ─── App-internal salt (baked into code — not stored) ────────────────────────
const APP_SALT = Buffer.from(
  '416c7465724d61696c2d53616c742d76352d446f4e6f74537461726554686973',
  'hex'
);

// ─── Derive AES-256 key from machine fingerprint ─────────────────────────────
let _cachedKey = null;
function getDerivedKey() {
  if (_cachedKey) return _cachedKey;
  const fingerprint = getMachineFingerprint();
  _cachedKey = crypto.pbkdf2Sync(fingerprint, APP_SALT, 100_000, 32, 'sha256');
  return _cachedKey;
}

// ─── Obfuscation (level 1) ───────────────────────────────────────────────────
const OBF_KEY = 0x5A; // XOR byte

function obfuscate(str) {
  const buf = Buffer.from(str, 'utf8');
  // XOR each byte
  for (let i = 0; i < buf.length; i++) buf[i] ^= OBF_KEY;
  // Reverse + base64
  return buf.reverse().toString('base64').split('').reverse().join('');
}

function deobfuscate(obfStr) {
  try {
    const b64 = obfStr.split('').reverse().join('');
    const buf  = Buffer.from(b64, 'base64').reverse();
    for (let i = 0; i < buf.length; i++) buf[i] ^= OBF_KEY;
    return buf.toString('utf8');
  } catch(e) { return obfStr; }
}

// ─── AES-256-GCM encryption (level 2) ────────────────────────────────────────
function encrypt(str) {
  const key  = getDerivedKey();
  const iv   = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc1 = cipher.update(str, 'utf8');
  const enc2 = cipher.final();
  const tag  = cipher.getAuthTag();
  // iv(16) + tag(16) + ciphertext → base64
  return Buffer.concat([iv, tag, enc1, enc2]).toString('base64');
}

function decrypt(b64) {
  try {
    const key = getDerivedKey();
    const buf  = Buffer.from(b64, 'base64');
    const iv   = buf.slice(0, 16);
    const tag  = buf.slice(16, 32);
    const data = buf.slice(32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data, null, 'utf8') + decipher.final('utf8');
  } catch(e) { return b64; } // returns raw if decryption fails (wrong machine)
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Protect a value with the given criticality level.
 * Returns { level, value } for storage.
 */
function protect(value, level = 0) {
  if (value === null || value === undefined) return { level, value };
  const str = typeof value === 'string' ? value : JSON.stringify(value);

  let processed = str;
  if (level === 1) processed = obfuscate(str);
  else if (level === 2) processed = encrypt(str);
  else if (level === 3) processed = encrypt(obfuscate(str));

  return { level, value: processed };
}

/**
 * Reveal a protected { level, value } object back to original.
 */
function reveal(protected_) {
  if (!protected_ || typeof protected_ !== 'object') return protected_;
  const { level, value } = protected_;
  if (value === null || value === undefined) return value;

  let processed = value;
  if (level === 1) processed = deobfuscate(value);
  else if (level === 2) processed = decrypt(value);
  else if (level === 3) processed = deobfuscate(decrypt(value));

  try { return JSON.parse(processed); } catch(_) { return processed; }
}

/**
 * Quick helpers for specific field protection
 */
function protectField(value, level) { return protect(value, level); }
function revealField(obj)            { return reveal(obj); }

/**
 * Protect an entire config object — each value individually
 */
function protectConfig(config, level) {
  if (!config) return null;
  const result = { _criticality: level };
  for (const [k, v] of Object.entries(config)) {
    result[k] = protect(typeof v === 'string' ? v : JSON.stringify(v), level);
  }
  return result;
}

function revealConfig(protectedConfig) {
  if (!protectedConfig) return null;
  const result = {};
  for (const [k, v] of Object.entries(protectedConfig)) {
    if (k === '_criticality') continue;
    result[k] = reveal(v);
  }
  return result;
}

module.exports = { protect, reveal, protectField, revealField, protectConfig, revealConfig, encrypt, decrypt, obfuscate, deobfuscate };
