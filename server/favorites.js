'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');

const DIR = path.join(config.DATA_DIR, 'favorites');

function validPin(pin) {
  return config.ALLOWED_PINS.indexOf(String(pin || '')) !== -1;
}

function fileFor(pin) {
  return path.join(DIR, String(pin) + '.json');
}

function read(pin) {
  if (!validPin(pin)) return [];
  try {
    const raw = fs.readFileSync(fileFor(pin), 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function write(pin, items) {
  if (!validPin(pin)) return;
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(fileFor(pin), JSON.stringify(items.slice(0, 200), null, 2));
}

function normalize(body) {
  const id = String((body && body.id) || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  if (!id) return null;
  return {
    id: id,
    title: String((body && body.title) || id).slice(0, 200),
    url: String((body && body.url) || ('https://www.youtube.com/watch?v=' + id)).slice(0, 300),
    thumbnail: String((body && body.thumbnail) || ('https://i.ytimg.com/vi/' + id + '/mqdefault.jpg')).slice(0, 400),
    duration: parseInt((body && body.duration) || 0, 10) || 0,
    uploader: String((body && body.uploader) || body.channel || '').slice(0, 120),
    views: parseInt((body && body.views) || 0, 10) || 0,
    channel_id: String((body && body.channel_id) || '').replace(/[^a-zA-Z0-9_@-]/g, '').slice(0, 64),
    avatar: String((body && (body.avatar || body.channel_avatar)) || '').slice(0, 400),
    uploaded: parseInt((body && body.uploaded) || 0, 10) || 0,
    published: String((body && body.published) || '').slice(0, 40),
    ts: Date.now(),
  };
}

function toggle(pin, body) {
  const item = normalize(body);
  if (!item) return { ok: false, error: 'id 없음' };
  const list = read(pin);
  const idx = list.findIndex(function (x) { return x.id === item.id; });
  var on = false;
  if (idx >= 0) list.splice(idx, 1);
  else {
    list.unshift(item);
    on = true;
  }
  write(pin, list);
  return { ok: true, on: on, items: list };
}

module.exports = {
  validPin,
  get ALLOWED_PINS() { return config.ALLOWED_PINS; },
  read,
  write,
  toggle,
};
