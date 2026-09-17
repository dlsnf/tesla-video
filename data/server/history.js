'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');
const favorites = require('./favorites');

const DIR = path.join(config.DATA_DIR, 'history');
const SIX_MONTHS = 183 * 24 * 3600 * 1000;
const MAX = 800;

function fileFor(pin) {
  return path.join(DIR, String(pin) + '.json');
}

function read(pin) {
  if (!favorites.validPin(pin)) return [];
  try {
    const raw = fs.readFileSync(fileFor(pin), 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function write(pin, items) {
  if (!favorites.validPin(pin)) return;
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(fileFor(pin), JSON.stringify(items.slice(0, MAX), null, 2));
}

function record(pin, body) {
  if (!favorites.validPin(pin)) return { ok: false, error: 'PIN 없음' };
  const id = String((body && body.id) || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  const channel_id = String((body && (body.channel_id || body.channelId)) || '').replace(/[^a-zA-Z0-9_@-]/g, '').slice(0, 64);
  if (!id && !channel_id) return { ok: false, error: '기록 없음' };
  const list = read(pin);
  list.unshift({
    id: id,
    channel_id: channel_id,
    ts: Date.now(),
  });
  write(pin, list);
  return { ok: true };
}

function countsByChannel(pin, sinceMs) {
  const since = sinceMs || (Date.now() - SIX_MONTHS);
  const counts = {};
  read(pin).forEach(function (it) {
    if (!it || !it.channel_id) return;
    if ((it.ts || 0) < since) return;
    counts[it.channel_id] = (counts[it.channel_id] || 0) + 1;
  });
  return counts;
}

module.exports = { read, write, record, countsByChannel, SIX_MONTHS };
