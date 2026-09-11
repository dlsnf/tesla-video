'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');
const favorites = require('./favorites');
const history = require('./history');

const DIR = path.join(config.DATA_DIR, 'subscriptions');

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
  fs.writeFileSync(fileFor(pin), JSON.stringify(items.slice(0, 100), null, 2));
}

function looksLikeAvatar(url) {
  return /ggpht|googleusercontent|yt3\.|avatar/i.test(String(url || ''));
}

function normalize(body) {
  var id = String((body && (body.channel_id || body.id)) || '').replace(/[^a-zA-Z0-9_@-]/g, '').slice(0, 64);
  var name = String((body && (body.name || body.uploader || body.channel)) || '').slice(0, 120);
  if (!id && name) id = 'n-' + name.replace(/[^a-zA-Z0-9_@-]/g, '').slice(0, 40);
  if (!id) return null;
  var thumb = String((body && (body.avatar || body.thumbnail)) || '').slice(0, 400);
  if (thumb && !looksLikeAvatar(thumb)) thumb = '';
  return {
    channel_id: id,
    name: name || id,
    thumbnail: thumb,
    ts: Date.now(),
    last_seen: 0,
    last_video_id: '',
    last_video_ts: 0,
  };
}

function unreadOf(ch) {
  if (!ch || !ch.last_video_id) return false;
  var seen = parseInt(ch.last_seen, 10) || 0;
  var vts = parseInt(ch.last_video_ts, 10) || 0;
  if (!seen) return true;
  return vts > seen;
}

function decorate(list) {
  return (list || []).map(function (ch) {
    var o = {};
    Object.keys(ch || {}).forEach(function (k) { o[k] = ch[k]; });
    o.unread = unreadOf(ch);
    return o;
  });
}

function readDecorated(pin) {
  const list = decorate(read(pin));
  var counts = {};
  try { counts = history.countsByChannel(pin); } catch (e) { counts = {}; }
  list.forEach(function (ch) {
    ch.watch_count = counts[ch.channel_id] || 0;
  });
  list.sort(function (a, b) {
    var ac = a.watch_count || 0;
    var bc = b.watch_count || 0;
    if (bc !== ac) return bc - ac;
    if (ac === 0) return (a.ts || 0) - (b.ts || 0);
    return (b.ts || 0) - (a.ts || 0);
  });
  return list;
}

function markSeen(pin, channelId) {
  const list = read(pin);
  const id = String(channelId || '');
  for (var i = 0; i < list.length; i++) {
    if (list[i].channel_id === id) {
      list[i].last_seen = Date.now();
      write(pin, list);
      return { ok: true, item: decorate([list[i]])[0], items: decorate(list) };
    }
  }
  return { ok: false, error: '채널 없음' };
}

function patch(pin, channelId, fields) {
  const list = read(pin);
  const id = String(channelId || '');
  fields = fields || {};
  for (var i = 0; i < list.length; i++) {
    if (list[i].channel_id !== id) continue;
    if (fields.name) list[i].name = String(fields.name).slice(0, 120);
    if (fields.last_video_id) list[i].last_video_id = String(fields.last_video_id).slice(0, 32);
    if (fields.last_video_ts) {
      var vts = parseInt(fields.last_video_ts, 10) || 0;
      if (vts > 0 && vts < 1e12) vts *= 1000;
      list[i].last_video_ts = vts;
    }
    var thumb = fields.thumbnail || fields.avatar || '';
    if (thumb && looksLikeAvatar(thumb)) {
      list[i].thumbnail = String(thumb).slice(0, 400);
    }
    write(pin, list);
    return decorate([list[i]])[0];
  }
  return null;
}

function apply(pin, body, want) {
  const item = normalize(body);
  if (!item) return { ok: false, error: '채널 없음' };
  const list = read(pin);
  const idx = list.findIndex(function (x) { return x.channel_id === item.channel_id; });
  if (want) {
    if (idx < 0) list.push(item);
    else {
      if (item.name && item.name !== item.channel_id) list[idx].name = item.name;
      if (item.thumbnail) list[idx].thumbnail = item.thumbnail;
    }
  } else if (idx >= 0) {
    list.splice(idx, 1);
  }
  write(pin, list);
  return { ok: true, on: !!want, channel_id: item.channel_id, items: list };
}

function toggle(pin, body) {
  if (body && typeof body.on === 'boolean') return apply(pin, body, body.on);
  const item = normalize(body);
  if (!item) return { ok: false, error: '채널 없음' };
  const list = read(pin);
  const idx = list.findIndex(function (x) { return x.channel_id === item.channel_id; });
  return apply(pin, body, idx < 0);
}

function isOn(pin, channelId) {
  const id = String(channelId || '');
  if (!id) return false;
  return read(pin).some(function (x) { return x.channel_id === id; });
}

module.exports = {
  read, write, toggle, apply, isOn, normalize,
  unreadOf, decorate, readDecorated, markSeen, patch, looksLikeAvatar,
};
