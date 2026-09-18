'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { WebSocketServer } = require('ws');
const url = require('url');

const config = require('./config');
const media = require('./media');
const stream = require('./stream');
const twitchOauth = require('./twitch-oauth');
const youtubeOauth = require('./youtube-oauth');
const favorites = require('./favorites');
const subscriptions = require('./subscriptions');
const history = require('./history');
const { run } = require('./proc');

if (!fs.existsSync(config.PUBLIC_DIR)) fs.mkdirSync(config.PUBLIC_DIR, { recursive: true });
if (!fs.existsSync(config.DATA_DIR)) fs.mkdirSync(config.DATA_DIR, { recursive: true });

fs.writeFileSync(
  path.join(config.PUBLIC_DIR, 'config.js'),
  'window.APP_BASE=' + JSON.stringify(config.PUBLIC_BASE) + ';\n'
);

const sessions = new Map();
const SESSION_TTL = 30 * 24 * 3600 * 1000;
const SESSION_FILE = path.join(config.DATA_DIR, 'sessions.json');
const healthCache = { ts: 0, value: null, pending: null };
const HEALTH_TTL = 30000;

function loadSessions() {
  try {
    const raw = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    Object.keys(raw || {}).forEach(function (k) {
      if (raw[k]) sessions.set(k, raw[k]);
    });
  } catch (e) {}
}
function saveSessions() {
  const obj = {};
  sessions.forEach(function (v, k) { obj[k] = v; });
  try {
    fs.mkdirSync(config.DATA_DIR, { recursive: true });
    fs.writeFileSync(SESSION_FILE, JSON.stringify(obj));
  } catch (e) {}
}
loadSessions();

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach(function (part) {
    const i = part.indexOf('=');
    if (i === -1) return;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function queryToken(req) {
  if (req.query && req.query.token) return req.query.token;
  try {
    const parsed = url.parse(req.url, true);
    return (parsed.query && parsed.query.token) || '';
  } catch (e) {
    return '';
  }
}

function sessionOf(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.tv_session || cookies.tv_token || queryToken(req) || req.headers['x-tv-token'];
  if (!token) return null;
  const rec = sessions.get(token);
  if (!rec) return null;
  const ts = typeof rec === 'number' ? rec : rec.ts;
  if (Date.now() - ts > SESSION_TTL) {
    sessions.delete(token);
    return null;
  }
  if (typeof rec !== 'number' && rec.pin && !favorites.validPin(rec.pin)) {
    sessions.delete(token);
    return null;
  }
  return typeof rec === 'number' ? { pin: '', ts: rec } : rec;
}

function isAuthed(req) {
  return !!sessionOf(req);
}

function sessionPin(req) {
  const rec = sessionOf(req);
  return rec && rec.pin ? rec.pin : '';
}

function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  return res.status(401).json({ ok: false, error: 'PIN required' });
}

function isPublicApi(p) {
  return p === '/api/health'
    || p === '/api/auth/status'
    || p === '/api/auth/login'
    || p === '/api/youtube/login'
    || p === '/api/youtube/callback'
    || p === '/api/twitch/login'
    || p === '/api/twitch/callback';
}

const loginHits = new Map();
function loginAllowed(ip) {
  const now = Date.now();
  const rec = loginHits.get(ip) || { n: 0, ts: now };
  if (now - rec.ts > 10 * 60 * 1000) {
    rec.n = 0;
    rec.ts = now;
  }
  rec.n += 1;
  loginHits.set(ip, rec);
  return rec.n <= 20;
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.use(function (req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

app.use(function (req, res, next) {
  if (req.path.indexOf('/api/') !== 0 || isPublicApi(req.path)) return next();
  return requireAuth(req, res, next);
});

app.get('/config.js', function (req, res) {
  res.type('application/javascript').send('window.APP_BASE=' + JSON.stringify(config.PUBLIC_BASE) + ';\n');
});

app.get('/api/health', async function (req, res) {
  if (healthCache.value && Date.now() - healthCache.ts < HEALTH_TTL) {
    return res.json(Object.assign({}, healthCache.value, {
      streams: stream.activeCount(),
      maxStreams: config.MAX_STREAMS,
    }));
  }
  if (healthCache.pending) {
    const value = await healthCache.pending;
    return res.json(Object.assign({}, value, {
      streams: stream.activeCount(),
      maxStreams: config.MAX_STREAMS,
    }));
  }
  healthCache.pending = (async function () {
  let ffmpegOk = false;
  let ytdlpOk = false;
  try {
    await run(config.FFMPEG, ['-version'], { timeout: 5000 });
    ffmpegOk = true;
  } catch (e) {}
  try {
    await run(config.YT_DLP, ['--version'], { timeout: 5000 });
    ytdlpOk = true;
  } catch (e) {}
  return {
    ok: ffmpegOk && ytdlpOk,
    ffmpeg: ffmpegOk,
    ytdlp: ytdlpOk,
    pin: true,
    base: config.PUBLIC_BASE || '/',
    youtubeOauth: !!(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET),
    youtubeApi: !!config.GOOGLE_API_KEY,
    cookies: !!config.getCookiesFile(),
  };
  })();
  try {
    const value = await healthCache.pending;
    healthCache.ts = Date.now();
    healthCache.value = value;
    res.json(Object.assign({}, value, {
      streams: stream.activeCount(),
      maxStreams: config.MAX_STREAMS,
    }));
  } finally {
    healthCache.pending = null;
  }
});

app.get('/api/auth/status', function (req, res) {
  const rec = sessionOf(req);
  res.json({ ok: true, required: true, authed: !!rec, pin: rec && rec.pin ? rec.pin : '' });
});

app.post('/api/auth/login', function (req, res) {
  const ip = String(req.ip || req.connection && req.connection.remoteAddress || 'x');
  if (!loginAllowed(ip)) {
    return res.status(429).json({ ok: false, error: '잠시 후 다시 시도하세요' });
  }
  const pin = String((req.body && req.body.pin) || '');
  if (!favorites.validPin(pin)) {
    return res.status(401).json({ ok: false, error: '허용된 PIN이 아닙니다' });
  }
  const token = crypto.randomBytes(18).toString('hex');
  sessions.set(token, { pin: pin, ts: Date.now() });
  saveSessions();
  res.setHeader('Set-Cookie', [
    'tv_session=' + token + '; Path=/; Max-Age=2592000; SameSite=Lax',
    'tv_token=' + token + '; Path=/; Max-Age=2592000; SameSite=Lax'
  ]);
  res.json({ ok: true, token: token, pin: pin });
});

app.post('/api/auth/logout', function (req, res) {
  const token = parseCookies(req.headers.cookie).tv_session || queryToken(req) || req.headers['x-tv-token'];
  if (token) sessions.delete(token);
  saveSessions();
  res.setHeader('Set-Cookie', [
    'tv_session=; Path=/; Max-Age=0; SameSite=Lax',
    'tv_token=; Path=/; Max-Age=0; SameSite=Lax'
  ]);
  res.json({ ok: true });
});

app.post('/api/probe-report', function (req, res) {
  const reportsDir = path.join(config.DATA_DIR, 'probe-reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = path.join(reportsDir, 'probe-' + timestamp + '.json');
  fs.writeFileSync(filename, JSON.stringify(req.body || {}, null, 2));
  res.json({ ok: true });
});

app.get('/api/twitch/login', function (req, res) {
  if (!config.TWITCH_CLIENT_ID) {
    return res.type('html').send(
      '<html><body style="background:#111;color:#eee;font-family:sans-serif;padding:24px">'
      + '<h1>Twitch 로그인</h1><p>.env 에 TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET 을 넣으세요.</p>'
      + '<p>Redirect URI: <b>' + config.TWITCH_REDIRECT_URI + '</b></p></body></html>'
    );
  }
  res.redirect(twitchOauth.loginUrl());
});

app.get('/api/youtube/login', function (req, res) {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
    return res.redirect((config.PUBLIC_BASE || '') + '/player/?need_google=1');
  }
  res.redirect(youtubeOauth.loginUrl());
});

app.get('/api/youtube/callback', async function (req, res) {
  const code = req.query.code;
  if (!code) return res.status(400).send('Missing code');
  try {
    const token = await youtubeOauth.exchangeCode(code);
    if (!token.access_token) return res.send('OAuth error: ' + JSON.stringify(token));
    youtubeOauth.saveTokens(token);
    res.redirect((config.PUBLIC_BASE || '') + '/player/?login=yt');
  } catch (e) {
    res.status(500).send(String(e.message));
  }
});

app.get('/api/twitch/callback', async function (req, res) {
  const code = req.query.code;
  if (!code) return res.status(400).send('Missing code');
  try {
    const token = await twitchOauth.exchangeCode(code);
    if (!token.access_token) return res.send('OAuth error: ' + JSON.stringify(token));
    res.redirect((config.PUBLIC_BASE || '') + '/twitch/?token=' + encodeURIComponent(token.access_token) + '&login=success');
  } catch (e) {
    res.status(500).send(String(e.message));
  }
});

app.use('/api', requireAuth);

app.get('/api/youtube/status', function (req, res) {
  res.json({
    ok: true,
    oauth: !!(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET),
    apiKey: !!config.GOOGLE_API_KEY,
    cookies: !!config.getCookiesFile(),
    saved: youtubeOauth.hasSavedLogin(),
  });
});

app.get('/api/favorites', function (req, res) {
  const pin = sessionPin(req);
  if (!pin) return res.status(401).json({ ok: false, error: 'PIN required' });
  res.json({ ok: true, pin: pin, items: favorites.read(pin) });
});

app.post('/api/favorites/toggle', function (req, res) {
  const pin = sessionPin(req);
  if (!pin) return res.status(401).json({ ok: false, error: 'PIN required' });
  const out = favorites.toggle(pin, req.body || {});
  if (!out.ok) return res.status(400).json(out);
  res.json(out);
});

app.get('/api/history', function (req, res) {
  const pin = sessionPin(req);
  if (!pin) return res.status(401).json({ ok: false, error: 'PIN required' });
  res.json({ ok: true, items: history.read(pin) });
});

app.post('/api/history/watch', function (req, res) {
  const pin = sessionPin(req);
  if (!pin) return res.status(401).json({ ok: false, error: 'PIN required' });
  const out = history.record(pin, req.body || {});
  if (!out.ok) return res.status(400).json(out);
  res.json(out);
});

app.get('/api/subscriptions', function (req, res) {
  const pin = sessionPin(req);
  if (!pin) return res.status(401).json({ ok: false, error: 'PIN required' });
  res.json({ ok: true, pin: pin, items: subscriptions.readDecorated(pin) });
});

app.post('/api/subscriptions/toggle', async function (req, res) {
  const pin = sessionPin(req);
  if (!pin) return res.status(401).json({ ok: false, error: 'PIN required' });
  const out = subscriptions.toggle(pin, req.body || {});
  if (!out.ok) return res.status(400).json(out);
  if (out.on && out.channel_id) {
    try {
      const meta = await media.channelMeta(out.channel_id, (req.body && (req.body.name || req.body.uploader || req.body.channel)) || '');
      if (meta) {
        subscriptions.patch(pin, out.channel_id, {
          name: meta.name,
          thumbnail: meta.avatar || meta.thumbnail || '',
        });
      }
    } catch (e) {}
  }
  out.items = subscriptions.readDecorated(pin);
  res.json(out);
});

app.get('/api/subscriptions/feed', async function (req, res) {
  const pin = sessionPin(req);
  if (!pin) return res.status(401).json({ ok: false, error: 'PIN required' });
  const channels = subscriptions.readDecorated(pin);
  if (!channels.length) {
    return res.json({ ok: true, items: [], channels: [] });
  }
  try {
    const items = await media.subscriptionFeed(channels, req.query.limit);
    res.json({ ok: true, items: items, channels: subscriptions.readDecorated(pin) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message.slice(0, 180), channels: channels, items: [] });
  }
});

app.post('/api/subscriptions/seen', function (req, res) {
  const pin = sessionPin(req);
  if (!pin) return res.status(401).json({ ok: false, error: 'PIN required' });
  const out = subscriptions.markSeen(pin, (req.body && (req.body.channel_id || req.body.id)) || '');
  if (!out.ok) return res.status(400).json(out);
  res.json(out);
});

app.get('/api/subscriptions/channel', async function (req, res) {
  const pin = sessionPin(req);
  if (!pin) return res.status(401).json({ ok: false, error: 'PIN required' });
  const id = String(req.query.id || req.query.channel_id || '');
  const channels = subscriptions.read(pin);
  const ch = channels.filter(function (x) { return x.channel_id === id; })[0];
  if (!ch) return res.status(404).json({ ok: false, error: '구독하지 않은 채널입니다' });
  try {
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const items = await media.youtubeChannelVideos(ch.channel_id, req.query.limit || 16, ch.name, offset, { stamp: false });
    if (!offset && items && items[0]) {
      subscriptions.patch(pin, ch.channel_id, {
        last_video_id: items[0].id,
        last_video_ts: items[0].ts || 0,
        name: ch.name || items[0].uploader,
        thumbnail: items[0].avatar || '',
      });
    }
    const updated = subscriptions.readDecorated(pin).filter(function (x) {
      return x.channel_id === ch.channel_id;
    })[0] || ch;
    res.json({ ok: true, channel: updated, items: items || [], more: !!(items && items.length >= 8) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message.slice(0, 180), items: [] });
  }
});

app.get('/api/subscriptions/check', async function (req, res) {
  const pin = sessionPin(req);
  if (!pin) return res.status(401).json({ ok: false, error: 'PIN required' });
  try {
    const channels = subscriptions.read(pin);
    const need = channels.filter(function (ch) {
      return ch && !subscriptions.looksLikeAvatar(ch.thumbnail);
    }).slice(0, 8);
    if (need.length) await media.fillChannelAvatars(need);
    need.forEach(function (ch) {
      if (!ch) return;
      subscriptions.patch(pin, ch.channel_id, {
        name: ch.name,
        thumbnail: ch.avatar || ch.thumbnail || '',
      });
    });
  } catch (e) {}
  res.json({ ok: true, items: subscriptions.readDecorated(pin) });
});

app.get('/api/youtube/home', async function (req, res) {
  try {
    const n = Math.min(Math.max(parseInt(req.query.limit, 10) || 24, 1), 40);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    if (offset > 0) {
      const extra = await media.youtubeHome(n, offset);
      return res.json({ ok: true, source: 'more', items: extra || [], more: !!(extra && extra.length >= n) });
    }
    const pin = sessionPin(req);
    const channels = pin ? subscriptions.readDecorated(pin) : [];
    let subItems = [];
    let extra = [];
    const tasks = [];
    tasks.push((async function () {
      try { extra = await youtubeOauth.mostPopular(n); } catch (e) { extra = null; }
      if (!extra || !extra.length) {
        try {
          extra = await Promise.race([
            media.youtubeHome(n),
            new Promise(function (_, rej) { setTimeout(function () { rej(new Error('home timeout')); }, 12000); }),
          ]);
        } catch (e2) { extra = []; }
      }
      extra = extra || [];
    })());
    if (channels.length) {
      tasks.push((async function () {
        try { subItems = await media.subscriptionFeed(channels, n); } catch (e) { subItems = []; }
      })());
    }
    await Promise.all(tasks);
    if (subItems && subItems.length) {
      const seen = {};
      const items = [];
      subItems.forEach(function (it) {
        if (!it || !it.id || seen[it.id]) return;
        seen[it.id] = true;
        items.push(it);
      });
      extra.forEach(function (it) {
        if (!it || !it.id || seen[it.id]) return;
        seen[it.id] = true;
        items.push(it);
      });
      return res.json({ ok: true, source: 'subs', items: items.slice(0, n), more: true });
    }
    const items = extra && extra.length ? extra : [];
    const source = items.length ? 'popular' : 'trending';
    if (!items.length) {
      const fallback = await media.youtubeHome(n);
      return res.json({ ok: true, source: 'trending', items: fallback || [], more: !!(fallback && fallback.length >= 8) });
    }
    res.json({ ok: true, source: source, items: items, more: !!(items && items.length >= 8) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message.slice(0, 180) });
  }
});

app.get('/api/youtube/search', async function (req, res) {
  try {
    const q = req.query.q || '';
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const wantChannels = offset === 0 && String(req.query.channels || '1') !== '0';
    const data = wantChannels
      ? await media.searchYoutubeWithChannels(q, req.query.limit, offset)
      : { items: await media.searchYoutube(q, req.query.limit, offset), channels: [] };
    const pin = sessionPin(req);
    let preferred = [];
    if (wantChannels && pin) {
      preferred = subscriptions.read(pin).filter(function (ch) {
        return media.channelScore(q, ch.name || '') >= 70;
      });
    }
    const seen = {};
    const channels = [];
    function addCh(ch) {
      if (!ch || !ch.channel_id || seen[ch.channel_id]) return;
      seen[ch.channel_id] = true;
      channels.push({
        type: 'channel',
        channel_id: ch.channel_id,
        name: ch.name || ch.uploader || ch.channel_id,
        thumbnail: ch.thumbnail || ch.avatar || '',
        avatar: ch.avatar || ch.thumbnail || '',
      });
    }
    preferred.forEach(addCh);
    (data.channels || []).forEach(addCh);
    const found = data.items || [];
    res.json({ ok: true, items: found, channels: channels, more: found.length >= Math.min(parseInt(req.query.limit, 10) || 16, 16) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message.slice(0, 180) });
  }
});

app.get('/api/youtube/avatars', async function (req, res) {
  try {
    const ids = String(req.query.ids || '').split(',').map(function (s) {
      return String(s || '').replace(/[^a-zA-Z0-9_@-]/g, '').slice(0, 64);
    }).filter(Boolean).slice(0, 12);
    const chans = ids.map(function (id) {
      return { channel_id: id, name: '', avatar: '', thumbnail: '' };
    });
    await media.fillChannelAvatars(chans);
    const avatars = {};
    chans.forEach(function (ch) {
      if (ch && ch.channel_id && (ch.avatar || ch.thumbnail)) {
        avatars[ch.channel_id] = { avatar: ch.avatar || ch.thumbnail, name: ch.name || '' };
      }
    });
    res.json({ ok: true, avatars: avatars });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message.slice(0, 180), avatars: {} });
  }
});

app.get('/api/youtube/channel', async function (req, res) {
  try {
    const id = String(req.query.id || req.query.channel_id || '');
    const name = String(req.query.name || '');
    if (!id && !name) return res.status(400).json({ ok: false, error: '채널 없음', items: [] });
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const limit = req.query.limit || 24;
    const items = await media.youtubeChannelVideos(id, limit, name, offset);
    res.json({ ok: true, items: items, more: !!(items && items.length >= Math.min(parseInt(limit, 10) || 16, 16)) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message.slice(0, 180), items: [] });
  }
});

app.get('/api/youtube/related', async function (req, res) {
  try {
    const items = await media.youtubeRelated(req.query.id || '', req.query.title || '', req.query.limit, {
      channel_id: req.query.channel_id || '',
      uploader: req.query.uploader || req.query.channel || '',
      offset: req.query.offset || 0,
      exclude: req.query.exclude || '',
    });
    const n = Math.min(Math.max(parseInt(req.query.limit, 10) || 8, 1), 24);
    res.json({ ok: true, items: items, more: !!(items && items.length >= Math.min(n, 8)) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message.slice(0, 180) });
  }
});

app.post('/api/youtube/device/start', async function (req, res) {
  try {
    const data = await youtubeOauth.deviceStart();
    res.json({
      ok: true,
      device_code: data.device_code,
      user_code: data.user_code,
      verification_url: data.verification_url || 'https://www.google.com/device',
      interval: data.interval || 5,
      expires_in: data.expires_in || 1800,
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message.slice(0, 200) });
  }
});

app.post('/api/youtube/device/poll', async function (req, res) {
  try {
    const data = await youtubeOauth.devicePoll(req.body && req.body.device_code);
    res.json(data);
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message.slice(0, 200) });
  }
});

app.post('/api/youtube/cookies', function (req, res) {
  const raw = String((req.body && req.body.cookies) || '').trim();
  if (raw.indexOf('youtube.com') === -1) {
    return res.status(400).json({ ok: false, error: 'youtube.com 쿠키가 없습니다. Netscape cookies.txt 형식으로 붙여 넣으세요.' });
  }
  const dest = path.join(config.DATA_DIR, 'youtube-cookies.txt');
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  fs.writeFileSync(dest, raw.charAt(raw.length - 1) === '\n' ? raw : raw + '\n');
  res.json({ ok: true, file: dest });
});

app.get('/api/youtube/subscriptions', async function (req, res) {
  const gtoken = req.query.gtoken || req.headers['x-google-token'] || (await youtubeOauth.refreshAccessToken());
  if (gtoken) {
    try {
      const data = await youtubeOauth.subscriptionVideos(gtoken, req.query.limit);
      return res.json({ ok: true, items: data.items, channels: data.channels, source: 'oauth' });
    } catch (e) {
      /* fall through to cookies */
    }
  }
  try {
    const items = await media.youtubeSubscriptions(req.query.limit);
    res.json({ ok: true, items: items, source: 'cookies' });
  } catch (e) {
    res.status(401).json({ ok: false, error: e.message.slice(0, 180) });
  }
});

app.get('/api/media/info', async function (req, res) {
  try {
    const info = await media.resolveSource(req.query.url || req.query.id || '', req.query.quality || 480);
    res.json({
      ok: true,
      type: info.type,
      id: info.id,
      title: info.title,
      duration: info.duration,
      isLive: info.isLive,
      uploader: info.uploader,
      channel: info.channel || info.uploader || '',
      channel_id: info.channel_id || '',
      avatar: info.avatar || '',
      thumbnail: info.thumbnail,
      pageUrl: info.pageUrl,
      width: info.width || 854,
      height: info.height || 480,
      aspect: info.aspect || (16 / 9),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message.slice(0, 180) });
  }
});

app.get('/api/audio', function (req, res) {
  const input = req.query.url || req.query.channel || req.query.id || '';
  const quality = req.query.quality || 480;
  const start = stream.parseStart(req.query.start);
  if (!input) return res.status(400).end();
  stream.attachAudioStream(req, res, input, quality, start);
});

app.get('/api/twitch/live', async function (req, res) {
  const st = await media.twitchStatus(req.query.channel || '');
  res.json({ channel: st.channel, live: !!st.live, error: st.error });
});

app.get('/api/twitch/status', async function (req, res) {
  const st = await media.twitchStatus(req.query.channel || '');
  res.json(st);
});

app.get('/api/twitch/follows', async function (req, res) {
  if (!req.query.token) return res.json({ error: 'Missing token' });
  try {
    const data = await twitchOauth.followedChannels(req.query.token);
    res.json(data);
  } catch (e) {
    res.json({ error: e.message.slice(0, 200) });
  }
});

app.use('/api', function (req, res) {
  res.status(404).json({ ok: false, error: 'not found' });
});

app.use(express.static(config.PUBLIC_DIR, {
  index: 'index.html',
  etag: false,
  lastModified: false,
  setHeaders: function (res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
  }
}));

app.get('*', function (req, res, next) {
  if (req.path.indexOf('/api/') === 0 || req.path.indexOf('/ws/') === 0) return next();
  res.sendFile(path.join(config.PUBLIC_DIR, 'index.html'));
});

const server = app.listen(config.PORT, config.BIND_HOST, function () {
  console.log('Tesla Video Drive  http://' + config.BIND_HOST + ':' + config.PORT);
  console.log('PUBLIC_BASE=' + (config.PUBLIC_BASE || '/'));
  console.log('PIN ' + (config.ACCESS_PIN ? 'enabled' : 'disabled'));
  if (config.COOKIES_FILE) console.log('cookies: ' + config.COOKIES_FILE);
  setTimeout(function () {
    media.youtubeHome(24).then(function (items) {
      console.log('home cache ready: ' + items.length);
    }).catch(function (e) {
      console.log('home cache skip: ' + (e.message || e));
    });
  }, 800);
});

const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });

server.on('upgrade', function (req, socket, head) {
  const parsed = url.parse(req.url, true);
  if (!/\/ws\/mpeg1\/?$/.test(parsed.pathname || '')) {
    socket.destroy();
    return;
  }
  if (!isAuthed(req)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, function (ws) {
    wss.emit('connection', ws, req, parsed);
  });
});

wss.on('connection', function (ws, req, parsed) {
  parsed = parsed || url.parse(req.url, true);
  const input = parsed.query.url || parsed.query.channel || parsed.query.id || '';
  const quality = parsed.query.quality || 480;
  const start = stream.parseStart(parsed.query.start);
  const fps = parseInt(parsed.query.fps, 10) === 30 ? 30 : 24;
  const low = parsed.query.vbr === 'low';
  const format = parsed.query.format || '';
  const refresh = parsed.query.refresh === '1';
  const legacySeek = parsed.query.legacy === '1';
  if (!input) {
    ws.send(JSON.stringify({ type: 'error', message: 'url/channel 이 필요합니다' }));
    ws.close();
    return;
  }
  stream.attachWsStream(ws, input, quality, start, { fps: fps, low: low, format: format, refresh: refresh, legacySeek: legacySeek });
});

function shutdown() {
  console.log('shutting down');
  server.close(function () { process.exit(0); });
  setTimeout(function () { process.exit(0); }, 3000);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
