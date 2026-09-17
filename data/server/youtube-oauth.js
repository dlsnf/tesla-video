'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const config = require('./config');

const TOKEN_FILE = path.join(config.DATA_DIR, 'youtube-oauth.json');

function httpsRequest(options, body) {
  return new Promise(function (resolve, reject) {
    const req = https.request(options, function (res) {
      let data = '';
      res.on('data', function (c) { data += c; });
      res.on('end', function () { resolve({ status: res.statusCode, body: data }); });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function loginUrl() {
  return 'https://accounts.google.com/o/oauth2/v2/auth'
    + '?client_id=' + encodeURIComponent(config.GOOGLE_CLIENT_ID)
    + '&redirect_uri=' + encodeURIComponent(config.GOOGLE_REDIRECT_URI)
    + '&response_type=code'
    + '&scope=' + encodeURIComponent('https://www.googleapis.com/auth/youtube.readonly')
    + '&access_type=offline'
    + '&include_granted_scopes=true'
    + '&prompt=select_account';
}

async function exchangeCode(code) {
  const body = 'client_id=' + encodeURIComponent(config.GOOGLE_CLIENT_ID)
    + '&client_secret=' + encodeURIComponent(config.GOOGLE_CLIENT_SECRET)
    + '&code=' + encodeURIComponent(code)
    + '&grant_type=authorization_code'
    + '&redirect_uri=' + encodeURIComponent(config.GOOGLE_REDIRECT_URI);
  const res = await httpsRequest({
    hostname: 'oauth2.googleapis.com',
    method: 'POST',
    path: '/token',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }, body);
  return JSON.parse(res.body);
}

function isoDuration(s) {
  const m = String(s || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] || '0', 10) * 3600)
    + (parseInt(m[2] || '0', 10) * 60)
    + parseInt(m[3] || '0', 10);
}

function mapVideo(v) {
  const sn = v.snippet || {};
  const th = sn.thumbnails || {};
  const img = (th.medium || th.high || th.default || {}).url
    || ('https://i.ytimg.com/vi/' + v.id + '/mqdefault.jpg');
  const uploaded = Date.parse(sn.publishedAt || '') || 0;
  return {
    id: v.id,
    title: sn.title || v.id,
    duration: isoDuration((v.contentDetails || {}).duration),
    uploader: sn.channelTitle || '',
    views: parseInt((v.statistics || {}).viewCount, 10) || 0,
    thumbnail: img,
    url: 'https://www.youtube.com/watch?v=' + v.id,
    channel_id: sn.channelId || '',
    uploaded: uploaded,
    ts: uploaded,
  };
}

async function localizeVideos(items) {
  items = items || [];
  if (!config.GOOGLE_API_KEY || !items.length) return items;
  const ids = [];
  const seen = {};
  items.forEach(function (it) {
    if (!it || !it.id || it.id.length !== 11 || seen[it.id]) return;
    seen[it.id] = true;
    ids.push(it.id);
  });
  if (!ids.length) return items;
  const map = {};
  for (var i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    try {
      const json = await apiGet(
        '/youtube/v3/videos?part=snippet,contentDetails,statistics'
        + '&hl=ko&regionCode=KR&id=' + chunk.join(',')
        + '&key=' + encodeURIComponent(config.GOOGLE_API_KEY)
      );
      (json.items || []).forEach(function (v) {
        map[v.id] = mapVideo(v);
      });
    } catch (e) {
      break;
    }
  }
  if (!Object.keys(map).length) return items;
  return items.map(function (it) {
    const loc = map[it.id];
    if (!loc) return it;
    const out = {};
    Object.keys(it).forEach(function (k) { out[k] = it[k]; });
    out.title = loc.title || out.title;
    out.uploader = loc.uploader || out.uploader;
    if (loc.views) out.views = loc.views;
    if (loc.duration) out.duration = loc.duration;
    if (loc.channel_id) out.channel_id = out.channel_id || loc.channel_id;
    if (loc.uploaded) {
      out.uploaded = loc.uploaded;
      if (!out.ts) out.ts = loc.uploaded;
    }
    return out;
  });
}

async function channelSnippets(ids) {
  const out = {};
  if (!config.GOOGLE_API_KEY) return out;
  const uniq = [];
  const seen = {};
  (ids || []).forEach(function (id) {
    const s = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!s || s.indexOf('UC') !== 0 || seen[s]) return;
    seen[s] = true;
    uniq.push(s);
  });
  for (var i = 0; i < uniq.length; i += 50) {
    const chunk = uniq.slice(i, i + 50);
    try {
      const json = await apiGet(
        '/youtube/v3/channels?part=snippet&hl=ko&id=' + chunk.join(',')
        + '&key=' + encodeURIComponent(config.GOOGLE_API_KEY)
      );
      (json.items || []).forEach(function (ch) {
        const sn = ch.snippet || {};
        const th = sn.thumbnails || {};
        out[ch.id] = {
          channel_id: ch.id,
          name: sn.title || ch.id,
          avatar: ((th.medium || th.high || th.default || {})).url || '',
          thumbnail: ((th.medium || th.high || th.default || {})).url || '',
        };
      });
    } catch (e) {
      break;
    }
  }
  return out;
}

async function apiGet(path, accessToken) {
  const headers = { Accept: 'application/json' };
  if (accessToken) headers.Authorization = 'Bearer ' + accessToken;
  const res = await httpsRequest({
    hostname: 'www.googleapis.com',
    method: 'GET',
    path: path,
    headers: headers,
  });
  const json = JSON.parse(res.body || '{}');
  if (json.error) {
    throw new Error((json.error.message || 'Google API error').slice(0, 180));
  }
  return json;
}

async function mostPopular(limit) {
  const n = Math.min(Math.max(parseInt(limit, 10) || 24, 1), 40);
  if (!config.GOOGLE_API_KEY) return null;
  const path = '/youtube/v3/videos?part=snippet,contentDetails,statistics'
    + '&chart=mostPopular&regionCode=KR&hl=ko&maxResults=' + n
    + '&key=' + encodeURIComponent(config.GOOGLE_API_KEY);
  const json = await apiGet(path);
  return (json.items || []).map(mapVideo);
}

async function subscriptionVideos(accessToken, limit) {
  const n = Math.min(Math.max(parseInt(limit, 10) || 24, 1), 40);
  const sub = await apiGet(
    '/youtube/v3/subscriptions?part=snippet&mine=true&maxResults=15',
    accessToken
  );
  const channels = (sub.items || []).map(function (it) {
    return (((it.snippet || {}).resourceId) || {}).channelId;
  }).filter(Boolean);

  const items = [];
  for (var i = 0; i < channels.length && items.length < n; i++) {
    const found = await apiGet(
      '/youtube/v3/search?part=snippet&type=video&order=date&maxResults=2&channelId='
        + encodeURIComponent(channels[i]),
      accessToken
    );
    (found.items || []).forEach(function (it) {
      const id = ((it.id || {}).videoId) || '';
      const sn = it.snippet || {};
      if (!id) return;
      items.push({
        id: id,
        title: sn.title || id,
        duration: 0,
        uploader: sn.channelTitle || '',
        views: 0,
        thumbnail: ((sn.thumbnails || {}).medium || (sn.thumbnails || {}).high || {}).url
          || ('https://i.ytimg.com/vi/' + id + '/mqdefault.jpg'),
        url: 'https://www.youtube.com/watch?v=' + id,
        channel_id: sn.channelId || channels[i] || '',
        uploaded: Date.parse(sn.publishedAt || '') || 0,
        ts: Date.parse(sn.publishedAt || '') || 0,
      });
    });
  }
  return { items: items, channels: channels.length };
}

function loadTokens() {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  } catch (e) {
    return null;
  }
}

function saveTokens(token) {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  const rec = {
    access_token: token.access_token,
    refresh_token: token.refresh_token || (loadTokens() && loadTokens().refresh_token) || '',
    expiry: Date.now() + ((token.expires_in || 3600) * 1000),
  };
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(rec, null, 2));
  return rec;
}

function hasSavedLogin() {
  const t = loadTokens();
  return !!(t && (t.refresh_token || t.access_token));
}

async function refreshAccessToken() {
  const t = loadTokens();
  if (!t) return null;
  if (t.access_token && t.expiry && Date.now() < t.expiry - 60000) return t.access_token;
  if (!t.refresh_token || !config.GOOGLE_CLIENT_ID) return t.access_token || null;
  const body = 'client_id=' + encodeURIComponent(config.GOOGLE_CLIENT_ID)
    + '&client_secret=' + encodeURIComponent(config.GOOGLE_CLIENT_SECRET)
    + '&refresh_token=' + encodeURIComponent(t.refresh_token)
    + '&grant_type=refresh_token';
  const res = await httpsRequest({
    hostname: 'oauth2.googleapis.com',
    method: 'POST',
    path: '/token',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }, body);
  const json = JSON.parse(res.body || '{}');
  if (!json.access_token) return null;
  saveTokens(json);
  return json.access_token;
}

async function deviceStart() {
  if (!config.GOOGLE_CLIENT_ID) throw new Error('GOOGLE_CLIENT_ID 가 없습니다');
  const body = 'client_id=' + encodeURIComponent(config.GOOGLE_CLIENT_ID)
    + '&scope=' + encodeURIComponent('https://www.googleapis.com/auth/youtube.readonly');
  const res = await httpsRequest({
    hostname: 'oauth2.googleapis.com',
    method: 'POST',
    path: '/device/code',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }, body);
  const json = JSON.parse(res.body || '{}');
  if (!json.device_code) throw new Error(json.error_description || json.error || '기기 코드를 만들지 못했습니다');
  return json;
}

async function devicePoll(deviceCode) {
  const body = 'client_id=' + encodeURIComponent(config.GOOGLE_CLIENT_ID)
    + '&client_secret=' + encodeURIComponent(config.GOOGLE_CLIENT_SECRET)
    + '&device_code=' + encodeURIComponent(deviceCode)
    + '&grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:device_code');
  const res = await httpsRequest({
    hostname: 'oauth2.googleapis.com',
    method: 'POST',
    path: '/token',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }, body);
  const json = JSON.parse(res.body || '{}');
  if (json.access_token) {
    saveTokens(json);
    return { ok: true, pending: false };
  }
  if (json.error === 'authorization_pending' || json.error === 'slow_down') {
    return { ok: true, pending: true, error: json.error };
  }
  return { ok: false, pending: false, error: json.error_description || json.error || '로그인 실패' };
}

module.exports = {
  loginUrl,
  exchangeCode,
  mostPopular,
  subscriptionVideos,
  localizeVideos,
  channelSnippets,
  saveTokens,
  hasSavedLogin,
  refreshAccessToken,
  deviceStart,
  devicePoll,
};
