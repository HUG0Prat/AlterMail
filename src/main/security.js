'use strict';
/**
 * AlterMail Security Module
 * Criticité 0: clair | 1: obfusqué | 2: chiffré AES-256-GCM | 3: obfusqué + chiffré
 */
const crypto = require('crypto');
const os     = require('os');

const SALT = Buffer.from('416c7465724d61696c53616c7432303234', 'hex');

function getMachineKey() {
  const ifaces = os.networkInterfaces();
  let mac = 'fallback-mac';
  outer: for (const name of Object.keys(ifaces)) {
    for (const iface of (ifaces[name] || [])) {
      if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
        mac = iface.mac;
        break outer;
      }
    }
  }
  const seed = `${os.hostname()}::${mac}::${process.platform}`;
  return crypto.scryptSync(seed, SALT, 32, { N: 1024 });
}

let _machineKey = null;
function getMK() {
  if (!_machineKey) _machineKey = getMachineKey();
  return _machineKey;
}

const OBF_KEY = Buffer.from('AMObfKey2024xz', 'utf8');

function obfuscate(str) {
  const buf = Buffer.from(String(str), 'utf8');
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ OBF_KEY[i % OBF_KEY.length];
  return 'OBF1:' + out.toString('base64');
}

function deobfuscate(str) {
  if (typeof str !== 'string' || !str.startsWith('OBF1:')) return str;
  try {
    const buf = Buffer.from(str.slice(5), 'base64');
    const out = Buffer.alloc(buf.length);
    for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ OBF_KEY[i % OBF_KEY.length];
    return out.toString('utf8');
  } catch(_) { return str; }
}

function encrypt(str) {
  try {
    const iv     = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getMK(), iv);
    const enc    = Buffer.concat([cipher.update(String(str), 'utf8'), cipher.final()]);
    const tag    = cipher.getAuthTag();
    return 'ENC1:' + Buffer.concat([iv, tag, enc]).toString('base64');
  } catch(e) { return String(str); }
}

function decrypt(str) {
  if (typeof str !== 'string' || !str.startsWith('ENC1:')) return str;
  try {
    const buf    = Buffer.from(str.slice(5), 'base64');
    const iv     = buf.slice(0, 12);
    const tag    = buf.slice(12, 28);
    const data   = buf.slice(28);
    const dc     = crypto.createDecipheriv('aes-256-gcm', getMK(), iv);
    dc.setAuthTag(tag);
    return Buffer.concat([dc.update(data), dc.final()]).toString('utf8');
  } catch(_) { return '[ERREUR DÉCHIFFREMENT]'; }
}

function protect(value, level) {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  if (level === 1) return obfuscate(s);
  if (level === 2) return encrypt(s);
  if (level === 3) return encrypt(obfuscate(s));
  return s;
}

function reveal(stored, level) {
  if (typeof stored !== 'string') return stored;
  if (level === 1) return deobfuscate(stored);
  if (level === 2) return decrypt(stored);
  if (level === 3) return deobfuscate(decrypt(stored));
  return stored;
}

function reprotect(stored, oldLevel, newLevel) {
  return protect(reveal(stored, oldLevel), newLevel);
}

module.exports = { protect, reveal, reprotect };
