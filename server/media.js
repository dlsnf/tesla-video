'use strict';

const https = require('https');
const http = require('http');
const config = require('./config');
const { run } = require('./proc');

const resolveCache = new Map();
const searchCache = new Map();
const commentCache = new Map();
const RESOLVE_TTL = 5 * 60 * 1000;
const SEARCH_TTL = 8 * 60 * 1000;
const inflight = new Map();

setInterval(function () {
  const now = Date.now();
  resolveCache.forEach(function (entry, key) {
    if (!entry || now - entry.ts > RESOLVE_TTL) resolveCache.delete(key);
  });
  searchCache.forEach(function (entry, key) {
    if (!entry || now - entry.ts > SEARCH_TTL) searchCache.delete(key);
  });
  commentCache.forEach(function (entry, key) {
    if (!entry || now - entry.ts > SEARCH_TTL) commentCache.delete(key);
  });
}, 60 * 1000).unref();

function isMembersOnly(dumpJson, err) {
  const availability = String((dumpJson && dumpJson.availability) || '');
  const msg = String((err && err.message) || '');
  return /subscriber_only|premium_only|needs_auth/i.test(availability)
    || /members[- ]only|channel'?s members|Join this channel|회원 전용/i.test(msg);
}

function isBotBlock(err) {
  return /봇이 아님|not a bot|Sign in to confirm|페이지를 새로고침해야|page needs to be reloaded|Requested format is not available|사용 가능한 형식|HTTP error 403 Forbidden|403 Forbidden/i.test(String((err && err.message) || err || ''));
}

function botHint() {
  return '유튜브가 재생을 막았습니다. 조치 방법 보기를 눌러 쿠키를 다시 넣어 주세요.';
}

function ytdlpArgs(extra, opts) {
  opts = opts || {};
  const client = opts.client || 'default';
  const args = [
    '--no-warnings',
    '--geo-bypass',
    '--force-ipv4',
    '--socket-timeout', '12',
    '--js-runtimes', 'node:' + process.execPath,
    '--add-header', 'Accept-Language:ko-KR,ko;q=0.9,en;q=0.3',
    '--extractor-args', 'youtube:player_client=' + client + ';lang=ko'
      + (opts.commentLimit ? ';comment_sort=' + (opts.commentSort === 'new' ? 'new' : 'top') + ';max_comments=' + String(opts.commentLimit) : ''),
  ];
  if (opts.ignoreErrors !== false) args.push('--ignore-errors');
  if (!opts.playlist) args.unshift('--no-playlist');
  if (opts.cookies !== false) {
    var cookiePath = config.getCookiesFile ? config.getCookiesFile() : config.COOKIES_FILE;
    if (cookiePath) args.push('--cookies', cookiePath);
  }
  return args.concat(extra);
}

async function ytdlpRun(extra, opts) {
  opts = opts || {};
  const timeout = Math.min(Math.max(opts.timeout || 20000, 5000), 60000);
  const playlist = !!opts.playlist;
  const explicitClients = !!opts.clients;
  const tries = opts.clients || [
    { client: 'default', cookies: false },
    { client: 'web_embedded', cookies: false },
  ];
  var last = null;
  for (var i = 0; i < tries.length; i++) {
    try {
      return await run(config.YT_DLP, ytdlpArgs(extra, {
        playlist: playlist,
        client: tries[i].client,
        cookies: tries[i].cookies,
        commentLimit: opts.commentLimit,
        commentSort: opts.commentSort,
      }), { timeout: timeout });
    } catch (e) {
      last = e;
      if (isMembersOnly(null, e)) throw e;
      // A listed playback client is a real fallback. Listing calls keep the
      // old rule and stop on the first error that is not a bot check.
      if (explicitClients || opts.cookies === true) continue;
      if (!isBotBlock(e)) throw e;
    }
  }
  if (explicitClients || opts.cookies === true) throw last || new Error('no stream url');
  throw Object.assign(new Error(botHint()), last || {});
}

function extractYoutubeId(input) {
  const s = String(input || '').trim();
  let m = s.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
  if (m) return m[1];
  m = s.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  return null;
}

function extractTwitchChannel(input) {
  const s = String(input || '').trim();
  let m = s.match(/twitch\.tv\/([a-zA-Z0-9_]{3,25})/i);
  if (m) return m[1].toLowerCase();
  if (/^[a-zA-Z0-9_]{3,25}$/.test(s)) return s.toLowerCase();
  return null;
}

function isTestSource(input) {
  const s = String(input || '').trim().toLowerCase();
  return s === 'testsrc' || s === 'test' || s === '__test__';
}

function testInfo(quality) {
  const q = parseInt(quality, 10) || 480;
  return {
    type: 'test',
    id: 'testsrc',
    title: 'Tesla Drive Mode 테스트 패턴',
    duration: 0,
    isLive: true,
    uploader: 'local',
    channel: 'local',
    channel_id: '',
    thumbnail: '',
    pageUrl: 'testsrc',
    videoUrl: 'testsrc',
    audioUrl: 'testsrc',
    quality: q,
    width: sizeForQuality(q, 16, 9).width,
    height: sizeForQuality(q, 16, 9).height,
    aspect: 16 / 9,
    scale: scaleForQuality(q),
    bitrate: bitrateForQuality(q),
  };
}

function classify(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (isTestSource(raw)) return { type: 'test', id: 'testsrc', pageUrl: 'testsrc' };

  const yt = extractYoutubeId(raw);
  if (yt && ( /youtu/i.test(raw) || /^[a-zA-Z0-9_-]{11}$/.test(raw) )) {
    return {
      type: 'youtube',
      id: yt,
      pageUrl: 'https://www.youtube.com/watch?v=' + yt,
    };
  }

  if (/twitch\.tv/i.test(raw)) {
    const ch = extractTwitchChannel(raw);
    if (!ch) return null;
    return { type: 'twitch', id: ch, pageUrl: 'https://www.twitch.tv/' + ch };
  }

  if (/^https?:\/\//i.test(raw)) {
    if (extractYoutubeId(raw)) {
      const id = extractYoutubeId(raw);
      return { type: 'youtube', id: id, pageUrl: 'https://www.youtube.com/watch?v=' + id };
    }
    return { type: 'direct', id: raw, pageUrl: raw };
  }

  return { type: 'twitch', id: extractTwitchChannel(raw) || raw.toLowerCase(), pageUrl: 'https://www.twitch.tv/' + (extractTwitchChannel(raw) || raw.toLowerCase()) };
}

function heightForQuality(quality) {
  const q = parseInt(quality, 10) || 360;
  if (q >= 720) return 720;
  if (q >= 480) return 480;
  return 360;
}

function parseJsonBlob(stdout) {
  var raw = String(stdout || '').trim();
  if (!raw) return null;
  if (raw.charAt(0) === '{') {
    try { return JSON.parse(raw); } catch (e) {}
  }
  var lines = raw.split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var t = lines[i].trim();
    if (t.charAt(0) !== '{') continue;
    try { return JSON.parse(t); } catch (e2) {}
  }
  return null;
}

function isBrokenItag(f) {
  var id = String((f && f.format_id) || '');
  return id === '17' || id === '18' || id === '22';
}

function stripBrokenFormats(data) {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data.formats)) {
    data.formats = data.formats.filter(function (f) { return f && !isBrokenItag(f); });
  }
  // Keep yt-dlp's selected format list until pickDumpUrls() reads it. Removing
  // it makes the first playback choose the first arbitrary entry in `formats`
  // (often a low-resolution adaptive stream) instead of the requested 480p.
  if (Array.isArray(data.requested_formats)) {
    data.requested_formats = data.requested_formats.filter(function (f) { return f && !isBrokenItag(f); });
  }
  if (Array.isArray(data.requested_downloads)) {
    data.requested_downloads = data.requested_downloads.filter(function (f) { return f && !isBrokenItag(f); });
  }
  delete data.format_id;
  delete data.url;
  return data;
}

function pickDumpUrls(data) {
  if (!data) return null;
  var v = null;
  var a = null;
  var withUrl = function (list) {
    return (list || []).filter(function (f) { return f && f.url; });
  };
  var req = withUrl(data.requested_formats);
  if (!req.length && Array.isArray(data.formats)) req = withUrl(data.formats);
  var progressive = req.filter(isBrokenItag);
  var adaptive = req.filter(function (f) { return !isBrokenItag(f); });
  // Format 18 is the combined 360p stream. Prefer separate tracks, and use 18
  // only when YouTube returned no other URL (SABR clients omit the rest).
  req = adaptive.length ? adaptive : progressive;
  if (Array.isArray(req)) {
    req.forEach(function (f) {
      if (!f || !f.url) return;
      if (f.vcodec && f.vcodec !== 'none' && !v) v = f;
      if (f.acodec && f.acodec !== 'none' && !a) a = f;
    });
    if (!v && req[0]) v = req[0];
    if (!a) a = req[1] || v;
  }
  if (!v && data.url) {
    v = { url: data.url, http_headers: data.http_headers, width: data.width, height: data.height };
    a = v;
  }
  if (!v || !v.url) return null;
  return { video: v, audio: a || v };
}

function formatForQuality(quality) {
  const h = heightForQuality(quality);
  return [
    'bestvideo[height<=' + h + ']+bestaudio',
    'bv*[height<=' + h + '][format_id!=18]+ba',
    'best[format_id!=18]',
    '134+140',
    '135+140',
    '160+139',
  ].join('/');
}

function youtubeFormatCandidatesForQuality(quality) {
  const h = heightForQuality(quality);
  return [
    'bestvideo[height<=' + h + ']+bestaudio',
    'bv*[height<=' + h + '][format_id!=18]+ba',
    'best[format_id!=18]',
    'bestvideo+bestaudio',
    '134+140',
    '135+140',
    '160+139',
    '18',
    'b',
  ];
}

var PLAYBACK_CLIENTS = [
  { client: 'tv,default', cookies: false },
  { client: 'default', cookies: false },
];

function even(n) {
  n = Math.max(2, Math.round(n));
  if (n % 2) n += 1;
  return n;
}

function sizeForQuality(quality, srcW, srcH) {
  const hMap = { 360: 360, 480: 480, 720: 720, 1080: 720 };
  let h = hMap[parseInt(quality, 10)] || heightForQuality(quality);
  let w;
  const sw = parseInt(srcW, 10) || 0;
  const sh = parseInt(srcH, 10) || 0;
  if (sw > 0 && sh > 0) w = h * (sw / sh);
  else w = h * (16 / 9);
  w = even(w);
  h = even(h);
  return {
    width: w,
    height: h,
    scale: w + ':' + h,
    aspect: w / h,
  };
}

function scaleForQuality(quality) {
  return sizeForQuality(quality, 16, 9).scale;
}

function bitrateForQuality(quality, low) {
  const q = parseInt(quality, 10) || 360;
  if (low) {
    if (q <= 360) return '400k';
    if (q <= 480) return '600k';
    return '1500k';
  }
  if (q <= 360) return '600k';
  if (q <= 480) return '1100k';
  return '2000k';
}

function cacheGet(map, key, ttl) {
  const hit = map.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > ttl) {
    map.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(map, key, value) {
  map.set(key, { ts: Date.now(), value: value });
}

function invalidateSource(id) {
  var needle = '|' + String(id || '') + '|';
  resolveCache.forEach(function (_v, k) {
    if (String(k).indexOf(needle) >= 0) resolveCache.delete(k);
  });
}

function once(key, fn) {
  if (inflight.has(key)) return inflight.get(key);
  const p = Promise.resolve().then(fn).then(function (v) {
    inflight.delete(key);
    return v;
  }, function (e) {
    inflight.delete(key);
    throw e;
  });
  inflight.set(key, p);
  return p;
}

async function resolveSource(input, quality) {
  const classified = classify(input);
  if (!classified) throw new Error('재생할 주소를 확인할 수 없습니다');
  if (classified.type === 'test') return testInfo(quality);

  const q = parseInt(quality, 10) || 480;
  const key = classified.type + '|' + classified.id + '|' + q;
  const cached = cacheGet(resolveCache, key, RESOLVE_TTL);
  // Older cache entries were created before the requested source height was
  // recorded and may pin a new playback to a 360p direct URL. Refresh once.
  // Entries from before comment counts were stored are refreshed the same way.
  if (cached && cached.sourceHeight != null && Object.prototype.hasOwnProperty.call(cached, 'comments')) return cached;
  if (cached) resolveCache.delete(key);

  const format = formatForQuality(q);
  const printFmt = '%(id)s|||%(title)s|||%(duration)s|||%(is_live)s|||%(uploader)s|||%(thumbnail)s|||%(width)s|||%(height)s|||%(channel_id)s|||%(channel)s|||%(uploader_avatar_url)s|||%(timestamp)s|||%(view_count)s|||%(upload_date)s|||%(comment_count)s';
  let dumpJson = null;
  let dump = null;
  const candidateFormats = youtubeFormatCandidatesForQuality(q);
  let lastMetaError = null;
  for (let i = 0; i < candidateFormats.length; i++) {
    try {
      const result = await ytdlpRun(
        ['-f', candidateFormats[i], '-J', classified.pageUrl],
        { timeout: 40000, clients: PLAYBACK_CLIENTS }
      );
      var parsed = parseJsonBlob(result.stdout);
      dump = pickDumpUrls(parsed);
      dumpJson = stripBrokenFormats(parsed);
      if (dump && dump.video && dump.video.url) break;
      lastMetaError = new Error('no stream url');
      if (isMembersOnly(dumpJson, null)) break;
    } catch (e) {
      lastMetaError = e;
      if (isMembersOnly(dumpJson, e)) break;
      if (!isBotBlock(e)) {
        if (i === candidateFormats.length - 1) break;
        continue;
      }
      if (i === candidateFormats.length - 1) break;
    }
  }
  if (!dump || !dump.video || !dump.video.url) {
    var membersHit = isMembersOnly(dumpJson, lastMetaError);
    if (!membersHit && classified.type === 'youtube') {
      try {
        var memberStat = await videoStat(classified.id);
        if (memberStat && memberStat.members) membersHit = true;
      } catch (e) {}
    }
    if (membersHit) throw new Error('회원전용 영상입니다');
    dump = null;
    if (lastMetaError && lastMetaError.message !== 'no stream url' && !isBotBlock(lastMetaError)) {
      throw lastMetaError;
    }
  }

  let info;
  if (dump && dump.video && dump.video.url) {
    const vf = dump.video;
    const af = dump.audio || dump.video;
    const sized = sizeForQuality(q, vf.width || dumpJson && dumpJson.width, vf.height || dumpJson && dumpJson.height);
    const d = dumpJson || {};
    info = {
      type: classified.type,
      id: d.id || classified.id,
      title: d.title || classified.id,
      duration: parseInt(d.duration, 10) || 0,
      isLive: !!d.is_live,
      uploader: d.uploader || d.channel || '',
      channel: d.channel || d.uploader || '',
      channel_id: d.channel_id || '',
      avatar: d.uploader_avatar_url || d.thumbnail || '',
      views: parseInt(d.view_count, 10) || 0,
      uploaded: asMs(d.timestamp) || parseUploadDate(d.upload_date),
      comments: countField(d.comment_count),
      thumbnail: d.thumbnail || (classified.type === 'youtube' ? ('https://i.ytimg.com/vi/' + classified.id + '/mqdefault.jpg') : ''),
      pageUrl: classified.pageUrl,
      videoUrl: vf.url,
      audioUrl: af.url || vf.url,
      videoHeaders: vf.http_headers || d.http_headers || null,
      audioHeaders: af.http_headers || vf.http_headers || d.http_headers || null,
      quality: q,
      sourceHeight: parseInt(vf.height, 10) || 0,
      width: sized.width,
      height: sized.height,
      aspect: sized.aspect,
      scale: sized.scale,
      bitrate: bitrateForQuality(q),
      dumpJson: dumpJson,
    };
  } else {
    let result;
    const grab = ['--print', printFmt, '-g', classified.pageUrl];
    const formatCandidates = [format].concat(youtubeFormatCandidatesForQuality(q));
    let lastErr = null;
    for (let i = 0; i < formatCandidates.length; i++) {
      const candidate = formatCandidates[i];
      try {
        result = await ytdlpRun(['-f', candidate].concat(grab), { timeout: 40000, clients: PLAYBACK_CLIENTS });
        break;
      } catch (e) {
        lastErr = e;
        if (!isBotBlock(e)) {
          if (i === formatCandidates.length - 1) throw e;
          continue;
        }
      }
    }
    if (!result) throw lastErr || new Error('스트림 URL이 없습니다 (비공개/지역제한/오프라인일 수 있음)');
    const lines = result.stdout.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    const metaLine = lines.find(function (l) { return l.indexOf('|||') !== -1; }) || '';
    const urls = lines.filter(function (l) { return /^https?:\/\//i.test(l); });
    if (!urls.length) throw new Error('스트림 URL이 없습니다 (비공개/지역제한/오프라인일 수 있음)');
    const parts = metaLine.split('|||');
    const sized = sizeForQuality(q, parts[6], parts[7]);
    info = {
      type: classified.type,
      id: parts[0] || classified.id,
      title: parts[1] || classified.id,
      duration: parseInt(parts[2], 10) || 0,
      isLive: String(parts[3] || '').toLowerCase() === 'true' || String(parts[3] || '') === '1',
      uploader: parts[4] || parts[9] || '',
      channel: parts[9] || parts[4] || '',
      channel_id: (parts[8] && parts[8] !== 'NA') ? parts[8] : '',
      avatar: (parts[10] && parts[10] !== 'NA') ? parts[10] : '',
      views: parseInt(parts[12], 10) || 0,
      uploaded: asMs(parts[11]) || parseUploadDate(parts[13]),
      comments: countField(parts[14]),
      thumbnail: parts[5] || (classified.type === 'youtube' ? ('https://i.ytimg.com/vi/' + classified.id + '/mqdefault.jpg') : ''),
      pageUrl: classified.pageUrl,
      videoUrl: urls[0],
      audioUrl: urls[1] || urls[0],
      videoHeaders: null,
      audioHeaders: null,
      quality: q,
      sourceHeight: parseInt(parts[7], 10) || 0,
      width: sized.width,
      height: sized.height,
      aspect: sized.aspect,
      scale: sized.scale,
      bitrate: bitrateForQuality(q),
    };
  }

  if (dumpJson) info.dumpJson = dumpJson;
  cacheSet(resolveCache, key, info);
  return info;
}

async function withKoTitles(items) {
  try {
    const youtubeOauth = require('./youtube-oauth');
    if (youtubeOauth.localizeVideos) return await youtubeOauth.localizeVideos(items);
  } catch (e) {}
  return items || [];
}

function cleanMeta(s) {
  s = String(s == null ? '' : s).trim();
  if (!s || s === 'NA' || s === 'NaN' || s === 'None' || s === 'null' || s === 'undefined') return '';
  return s;
}

function channelIdOf(raw, url) {
  var id = cleanMeta(raw);
  if (id.indexOf('UC') === 0) return id;
  var m = String(url || '').match(/channel\/(UC[a-zA-Z0-9_-]{20,})/);
  return m ? m[1] : id;
}

const ITEM_PRINT = '%(id)s|||%(title)s|||%(duration)s|||%(channel)s|||%(uploader)s|||%(view_count)s|||%(channel_id)s|||%(timestamp)s|||%(uploader_avatar_url)s|||%(channel_url)s|||%(upload_date)s';

function parseUploadDate(s) {
  const d = String(s || '').replace(/\D/g, '');
  if (d.length !== 8) return 0;
  const y = parseInt(d.slice(0, 4), 10);
  const m = parseInt(d.slice(4, 6), 10) - 1;
  const day = parseInt(d.slice(6, 8), 10);
  const t = Date.UTC(y, m, day, 12, 0, 0);
  return t > 0 ? t : 0;
}

function parsePublishedText(s) {
  const t = String(s || '').trim();
  if (!t) return 0;
  if (/방금|just now|seconds?/i.test(t) && !/\d/.test(t)) return Date.now() - 30000;
  const m = t.match(/(?:스트리밍 시간:\s*|최초 공개:\s*|premiered\s+|streamed\s+)?(\d+)\s*(주일|주|개월|달|월|시간|분|일|년|minutes?|hours?|days?|weeks?|months?|years?)/i);
  if (!m) return 0;
  const n = parseInt(m[1], 10) || 0;
  const u = m[2].toLowerCase();
  var ms = 0;
  if (u.indexOf('분') === 0 || u.indexOf('minute') === 0) ms = n * 60 * 1000;
  else if (u.indexOf('시간') === 0 || u.indexOf('hour') === 0) ms = n * 3600 * 1000;
  else if (u.indexOf('주일') === 0 || u.indexOf('주') === 0 || u.indexOf('week') === 0) ms = n * 7 * 86400 * 1000;
  else if (u.indexOf('일') === 0 || u.indexOf('day') === 0) ms = n * 86400 * 1000;
  else if (u.indexOf('개월') === 0 || u.indexOf('달') === 0 || u.indexOf('월') === 0 || u.indexOf('month') === 0) ms = n * 30 * 86400 * 1000;
  else if (u.indexOf('년') === 0 || u.indexOf('year') === 0) ms = n * 365 * 86400 * 1000;
  return ms ? (Date.now() - ms) : 0;
}

function asMs(v) {
  var n = parseInt(v, 10) || 0;
  if (n <= 0) return 0;
  if (n < 1e12) n *= 1000;
  return n;
}

function isCoarseTime(ms) {
  ms = asMs(ms);
  if (!(ms > 0)) return true;
  const d = new Date(ms);
  const midnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
  const noon = d.getUTCHours() === 12 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
  return midnight || noon;
}

function betterTime(current, next) {
  if (!(next > 0)) return current || 0;
  if (!(current > 0)) return next;
  if (isCoarseTime(current) && !isCoarseTime(next)) return next;
  if (!isCoarseTime(next)) return next;
  return current;
}

function countField(v) {
  if (v == null || v === '' || v === 'NA' || v === 'None') return null;
  const n = parseInt(v, 10);
  return isFinite(n) && n >= 0 ? n : null;
}

function parsePrintItems(stdout) {
  return String(stdout || '').split(/\r?\n/).map(function (line) {
    line = line.trim();
    if (!line || line.indexOf('|||') === -1) return null;
    const p = line.split('|||');
    const id = cleanMeta(p[0]);
    if (!id || id.length < 6) return null;
    var ts = asMs(p[7]) || parseUploadDate(p[10]);
    return {
      id: id,
      title: cleanMeta(p[1]) || id,
      duration: parseInt(p[2], 10) || 0,
      uploader: cleanMeta(p[3]) || cleanMeta(p[4]),
      views: parseInt(p[5], 10) || 0,
      channel_id: channelIdOf(p[6], p[9]),
      avatar: cleanMeta(p[8]),
      ts: ts,
      uploaded: ts,
      thumbnail: 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg',
      url: 'https://www.youtube.com/watch?v=' + id,
    };
  }).filter(Boolean);
}

function normName(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9\uac00-\ud7a3@]/g, '');
}

function channelScore(query, channelName) {
  const nq = normName(query);
  const nn = normName(channelName);
  if (!nq || !nn) return 0;
  if (nn === nq) return 100;
  if (nn.indexOf(nq) === 0 || nq.indexOf(nn) === 0) return 90;
  if (nn.indexOf(nq) >= 0 || nq.indexOf(nn) >= 0) return 70;
  const first = normName(String(query || '').split(/\s+/)[0] || '');
  if (first && first.length >= 2 && (nn === first || nn.indexOf(first) === 0 || first.indexOf(nn) === 0)) return 85;
  return 0;
}

function asChannel(ch) {
  if (!ch) return null;
  const id = String(ch.channel_id || '').replace(/[^a-zA-Z0-9_@-]/g, '').slice(0, 64);
  if (!id || id === 'NA') return null;
  return {
    type: 'channel',
    channel_id: id,
    name: (cleanMeta(ch.name || ch.uploader || ch.channel || '') || id).slice(0, 120),
    thumbnail: String(ch.thumbnail || ch.avatar || '').slice(0, 400),
    avatar: String(ch.avatar || ch.thumbnail || '').slice(0, 400),
    subscribers: parseKoViews(ch.subscribers || ch.subscriber_count || ch.channel_follower_count || ch.subscriberCountText || 0),
  };
}

function mergeChannels() {
  const seen = {};
  const out = [];
  for (var i = 0; i < arguments.length; i++) {
    (arguments[i] || []).forEach(function (raw) {
      const ch = asChannel(raw);
      if (!ch || seen[ch.channel_id]) return;
      seen[ch.channel_id] = true;
      out.push(ch);
    });
  }
  return out;
}

async function fetchChannelMeta(idOrHandle) {
  const raw = String(idOrHandle || '').trim();
  if (!raw) return null;
  const url = channelPageUrl(raw) || (
    raw.charAt(0) === '@'
      ? ('https://www.youtube.com/' + raw + '/videos')
      : ('https://www.youtube.com/@' + raw.replace(/\s+/g, '') + '/videos')
  );
  if (!url) return null;
  const key = 'chmeta|' + url;
  const cached = cacheGet(searchCache, key, 10 * 60 * 1000);
  if (cached) return cached;
  const result = await ytdlpRun([
    '--playlist-end', '1',
    '--print', '%(channel_id)s|||%(channel)s|||%(uploader)s|||%(uploader_avatar_url)s|||%(channel_follower_count)s',
    url,
  ], { timeout: 10000, playlist: true });
  const line = String(result.stdout || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean)[0] || '';
  const p = line.split('|||');
  const ch = asChannel({
    channel_id: p[0],
    name: p[1] || p[2],
    avatar: (p[3] && p[3] !== 'NA') ? p[3] : '',
    channel_follower_count: p[4],
  });
  if (!ch) return null;
  cacheSet(searchCache, key, ch);
  return ch;
}

function decodeYtUrl(s) {
  return String(s || '')
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/')
    .replace(/\\u003d/g, '=');
}

function httpsGetText(url, redirects) {
  redirects = redirects || 0;
  return new Promise(function (resolve, reject) {
    if (redirects > 4) return reject(new Error('redirect'));
    let mod = https;
    try {
      if (String(url).indexOf('http://') === 0) mod = http;
    } catch (e) {}
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.4',
        'Accept': 'text/html,application/xhtml+xml',
      },
    }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        var next = res.headers.location;
        if (next.indexOf('http') !== 0) {
          try { next = new URL(next, url).toString(); } catch (e) {}
        }
        return resolve(httpsGetText(next, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('http ' + res.statusCode));
      }
      const chunks = [];
      let size = 0;
      res.on('data', function (c) {
        size += c.length;
        if (size < 1500000) chunks.push(c);
        if (size > 1800000) res.destroy();
      });
      res.on('end', function () { resolve(Buffer.concat(chunks).toString('utf8')); });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(8000, function () { req.destroy(); reject(new Error('timeout')); });
  });
}

function avatarFromHtml(html) {
  const text = String(html || '');
  const block = text.match(/"avatar"\s*:\s*\{\s*"thumbnails"\s*:\s*\[([\s\S]{0,2500}?)\]/);
  if (block) {
    const urls = [];
    const re = /"url"\s*:\s*"(https:\\\/\\\/yt3\.[^"]+|https:\/\/yt3\.[^"]+)"/g;
    let m;
    while ((m = re.exec(block[1]))) urls.push(decodeYtUrl(m[1]));
    if (urls.length) return urls[urls.length - 1];
  }
  const og = text.match(/property="og:image"\s+content="(https:\/\/yt3\.[^"]+)"/i)
    || text.match(/content="(https:\/\/yt3\.[^"]+)"\s+property="og:image"/i);
  if (og) return decodeYtUrl(og[1]);
  const any = text.match(/https:\\\/\\\/yt3\.(?:ggpht|googleusercontent)\.com\\\/[^"\\]+/);
  if (any) return decodeYtUrl(any[0]);
  return '';
}

function pickThumbUrl(thumbs) {
  if (!thumbs || !thumbs.length) return '';
  const t = thumbs[thumbs.length - 1] || thumbs[0];
  return (t && t.url) ? String(t.url) : '';
}

function avatarFromBrowse(json) {
  if (!json || typeof json !== 'object') return { avatar: '', name: '', channel_id: '' };
  const header = json.header || {};
  const c4 = header.c4TabbedHeaderRenderer || {};
  const meta = ((json.metadata || {}).channelMetadataRenderer) || {};
  var avatar = pickThumbUrl((c4.avatar || {}).thumbnails) || pickThumbUrl((meta.avatar || {}).thumbnails);
  if (!avatar) {
    const blob = JSON.stringify(header) + JSON.stringify(json.metadata || {});
    const urls = blob.match(/https:\/\/yt3\.(?:ggpht|googleusercontent)\.com\/[^"\\]+/g);
    if (urls && urls.length) avatar = decodeYtUrl(urls[urls.length - 1]);
  }
  return {
    avatar: avatar || '',
    name: String(meta.title || c4.title || '').slice(0, 120),
    channel_id: String(meta.externalId || c4.channelId || '').slice(0, 64),
  };
}

function httpsJson(hostname, path, body, timeoutMs, maxBytes) {
  return new Promise(function (resolve, reject) {
    const payload = body ? JSON.stringify(body) : '';
    const cap = maxBytes || 900000;
    const req = https.request({
      hostname: hostname,
      path: path,
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Accept-Encoding': 'identity',
        'Origin': 'https://www.youtube.com',
        'Referer': 'https://www.youtube.com/',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, function (res) {
      const chunks = [];
      let size = 0;
      res.on('data', function (c) {
        size += c.length;
        if (size < cap) chunks.push(c);
      });
      res.on('end', function () {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(e); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs || 4000, function () { req.destroy(); reject(new Error('timeout')); });
    req.write(payload);
    req.end();
  });
}

function innertubeContext() {
  return { client: { clientName: 'WEB', clientVersion: '2.20240815.00.00', hl: 'ko', gl: 'KR' } };
}

function textOf(x) {
  if (!x) return '';
  if (typeof x === 'string') return x;
  if (x.simpleText) return String(x.simpleText);
  if (x.runs) return x.runs.map(function (r) { return r.text || ''; }).join('');
  return '';
}

function parseLen(s) {
  const p = String(s || '').split(':').map(function (x) { return parseInt(x, 10) || 0; });
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return 0;
}

function parseKoViews(s) {
  const t = String(s || '').replace(/,/g, '');
  const m = t.match(/([\d.]+)\s*(억|만|천|[KMB])?/i);
  if (!m) return 0;
  var n = parseFloat(m[1]) || 0;
  if (m[2] === '억') n *= 1e8;
  else if (m[2] === '만') n *= 1e4;
  else if (m[2] === '천') n *= 1e3;
  else if (m[2] === 'B' || m[2] === 'b') n *= 1e9;
  else if (m[2] === 'M' || m[2] === 'm') n *= 1e6;
  else if (m[2] === 'K' || m[2] === 'k') n *= 1e3;
  return Math.round(n);
}

function metaBits(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return { published: '', viewsText: '' };
  var published = '';
  var viewsText = '';
  const pub = t.match(/(\d+\s*(?:주일|주|개월|달|월|시간|분|일|년)\s*전|방금(?:\s*전)?)/);
  if (pub) published = pub[1];
  const views = t.match(/조회수\s*[\d.]+\s*(?:억|만|천)?\s*회?|[\d.]+\s*(?:억|만|천)\s*회|[\d.]+\s*회|[\d.]+\s*[KMB]\s*views?/i);
  if (views) viewsText = views[0];
  return { published: published, viewsText: viewsText };
}

function overlayLength(v) {
  const arr = (v && v.thumbnailOverlays) || [];
  for (var i = 0; i < arr.length; i++) {
    const t = ((arr[i] || {}).thumbnailOverlayTimeStatusRenderer || {}).text;
    if (t) return textOf(t);
  }
  return '';
}

function walkRenderers(node, acc, depth) {
  if (!node || depth > 18) return acc;
  if (Array.isArray(node)) {
    node.forEach(function (x) { walkRenderers(x, acc, (depth || 0) + 1); });
    return acc;
  }
  if (typeof node !== 'object') return acc;
  if (!acc.lockups) acc.lockups = [];
  if (node.videoRenderer) acc.videos.push(node.videoRenderer);
  if (node.gridVideoRenderer) acc.videos.push(node.gridVideoRenderer);
  if (node.compactVideoRenderer) acc.videos.push(node.compactVideoRenderer);
  if (node.lockupViewModel) acc.lockups.push(node.lockupViewModel);
  if (node.richItemRenderer && node.richItemRenderer.content) {
    walkRenderers(node.richItemRenderer.content, acc, (depth || 0) + 1);
  }
  if (node.channelRenderer) acc.channels.push(node.channelRenderer);
  Object.keys(node).forEach(function (k) {
    if (k === 'videoRenderer' || k === 'gridVideoRenderer' || k === 'compactVideoRenderer' || k === 'channelRenderer' || k === 'lockupViewModel') return;
    const v = node[k];
    if (v && typeof v === 'object') walkRenderers(v, acc, (depth || 0) + 1);
  });
  return acc;
}

function hasMembersBadge(node) {
  return !!findNestedString(node, function (s) {
    return s === 'BADGE_MEMBERS_ONLY' || s === '회원 전용' || s === '회원 우선 공개' || s === '회원전용';
  }, 0);
}

function mapInnertubeVideo(v) {
  if (!v) return null;
  const id = v.videoId || (((v.navigationEndpoint || {}).watchEndpoint) || {}).videoId || '';
  if (!id || id.length < 6) return null;
  const owner = ((v.owner || {}).videoOwnerRenderer) || {};
  const ownerRun = (((v.ownerText || v.shortBylineText || v.longBylineText || {}).runs) || [])[0]
    || (((owner.title || {}).runs) || [])[0]
    || {};
  const chId = ((((ownerRun.navigationEndpoint || {}).browseEndpoint) || {}).browseId)
    || ((((owner.navigationEndpoint || {}).browseEndpoint) || {}).browseId)
    || '';
  const chThumbs = (((v.channelThumbnailSupportedRenderers || {}).channelThumbnailWithLinkRenderer || {}).thumbnail || {}).thumbnails
    || ((v.channelThumbnail || {}).thumbnails)
    || ((owner.thumbnail || {}).thumbnails);
  const a11y = ((((v.title || {}).accessibility || {}).accessibilityData) || {}).label
    || ((((v.accessibility || {}).accessibilityData) || {}).label)
    || '';
  const bits = metaBits([textOf(v.viewCountText), textOf(v.shortViewCountText), textOf(v.publishedTimeText), a11y].join(' '));
  const published = textOf(v.publishedTimeText) || bits.published;
  const uploaded = parsePublishedText(published);
  const viewsText = textOf(v.shortViewCountText) || textOf(v.viewCountText) || bits.viewsText;
  return {
    id: id,
    title: textOf(v.title) || id,
    duration: parseLen(textOf(v.lengthText) || overlayLength(v)),
    uploader: textOf(v.ownerText) || textOf(v.shortBylineText) || textOf(v.longBylineText) || textOf(owner.title) || '',
    views: parseKoViews(viewsText),
    views_text: viewsText,
    channel_id: (chId && chId.indexOf('UC') === 0) ? chId : '',
    avatar: pickThumbUrl(chThumbs) || '',
    ts: uploaded,
    uploaded: uploaded,
    published: published,
    thumbnail: 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg',
    url: 'https://www.youtube.com/watch?v=' + id,
    members: hasMembersBadge(v) ? true : undefined,
  };
}

function findNestedString(node, test, depth) {
  if (!node || depth > 12) return '';
  if (typeof node === 'string') return test(node) ? node : '';
  if (Array.isArray(node)) {
    for (var i = 0; i < node.length; i++) {
      const r = findNestedString(node[i], test, (depth || 0) + 1);
      if (r) return r;
    }
    return '';
  }
  if (typeof node !== 'object') return '';
  const keys = Object.keys(node);
  for (var j = 0; j < keys.length; j++) {
    const r = findNestedString(node[keys[j]], test, (depth || 0) + 1);
    if (r) return r;
  }
  return '';
}

function mapLockupVideo(v) {
  if (!v) return null;
  const ctype = String(v.contentType || '');
  if (ctype && ctype.indexOf('VIDEO') < 0 && ctype.indexOf('SHORT') < 0) return null;
  const id = String(v.contentId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!id || id.length < 6) return null;
  const meta = ((v.metadata || {}).lockupMetadataViewModel) || {};
  const title = cleanMeta((meta.title && meta.title.content) || textOf(meta.title) || '');
  const rows = ((((meta.metadata || {}).contentMetadataViewModel) || {}).metadataRows) || [];
  const parts = [];
  rows.forEach(function (row) {
    ((row && row.metadataParts) || []).forEach(function (p) {
      const t = cleanMeta((p.text && p.text.content) || textOf(p.text) || p.accessibilityLabel || '');
      if (t) parts.push(t);
    });
  });
  var uploader = '';
  var views = 0;
  var viewsText = '';
  var published = '';
  parts.forEach(function (t) {
    const bits = metaBits(t);
    if (bits.published && !published) published = bits.published;
    if (bits.viewsText && !viewsText) {
      viewsText = bits.viewsText;
      if (!views) views = parseKoViews(bits.viewsText);
    }
    if (!bits.published && !bits.viewsText && !uploader && t.length < 80) uploader = t;
  });
  if (!published || !views) {
    const extra = findNestedString(v, function (s) {
      return /조회수|회$|\d+\s*(?:주일|주|개월|시간|분|일|년)\s*전/.test(s);
    }, 0);
    const bits = metaBits(extra);
    if (!published && bits.published) published = bits.published;
    if (!viewsText && bits.viewsText) {
      viewsText = bits.viewsText;
      views = parseKoViews(bits.viewsText);
    }
  }
  const durStr = findNestedString(v.contentImage, function (s) { return /^\d{1,2}:\d{2}(:\d{2})?$/.test(s); }, 0);
  const avatar = findNestedString(meta, function (s) { return /yt3\.(ggpht|googleusercontent)/i.test(s); }, 0);
  const uploaded = parsePublishedText(published);
  return {
    id: id,
    title: title || id,
    duration: parseLen(durStr),
    uploader: uploader,
    views: views,
    views_text: viewsText,
    channel_id: '',
    avatar: avatar ? decodeYtUrl(avatar) : '',
    ts: uploaded,
    uploaded: uploaded,
    published: published,
    thumbnail: 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg',
    url: 'https://www.youtube.com/watch?v=' + id,
    members: hasMembersBadge(v) ? true : undefined,
  };
}

function collectInnertubeItems(acc) {
  const items = [];
  const seen = {};
  function add(it) {
    if (!it || !it.id || seen[it.id]) return;
    seen[it.id] = true;
    items.push(it);
  }
  (acc.videos || []).forEach(function (v) { add(mapInnertubeVideo(v)); });
  (acc.lockups || []).forEach(function (v) { add(mapLockupVideo(v)); });
  return items;
}

function mapInnertubeChannel(c) {
  if (!c) return null;
  return asChannel({
    channel_id: c.channelId || '',
    name: textOf(c.title),
    avatar: pickThumbUrl((c.thumbnail || {}).thumbnails),
    subscriberCountText: textOf(c.subscriberCountText),
  });
}

async function innertubeSearch(query, limit) {
  const n = Math.min(Math.max(parseInt(limit, 10) || 16, 1), 30);
  const q = String(query || '').trim().slice(0, 120);
  if (!q) return { items: [], channels: [] };
  const key = 'it|s|' + n + '|' + q;
  const cached = cacheGet(searchCache, key, SEARCH_TTL);
  if (cached) return cached;
  return once(key, async function () {
    const json = await httpsJson(
      'www.youtube.com',
      '/youtubei/v1/search?prettyPrint=false',
      { context: innertubeContext(), query: q },
      4500
    );
    const acc = { videos: [], channels: [], lockups: [] };
    walkRenderers(json, acc, 0);
    const items = collectInnertubeItems(acc);
    const channels = [];
    acc.channels.forEach(function (c) {
      const ch = mapInnertubeChannel(c);
      if (ch) channels.push(ch);
    });
    const out = { items: items.slice(0, n), channels: channels };
    if (out.items.length) cacheSet(searchCache, key, out);
    return out;
  });
}

async function innertubeChannelVideos(channelId, limit) {
  const id = String(channelId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!id || id.indexOf('UC') !== 0) return [];
  const n = Math.min(Math.max(parseInt(limit, 10) || 16, 1), 40);
  const key = 'it|ch|' + n + '|' + id;
  const cached = cacheGet(searchCache, key, 10 * 60 * 1000);
  if (cached) return cached;
  return once(key, async function () {
    const json = await httpsJson(
      'www.youtube.com',
      '/youtubei/v1/browse?prettyPrint=false',
      { context: innertubeContext(), browseId: id, params: 'EgZ2aWRlb3PyBgQKAjoA' },
      4500
    );
    const acc = { videos: [], channels: [], lockups: [] };
    walkRenderers(json, acc, 0);
    const items = collectInnertubeItems(acc);
    const parsed = avatarFromBrowse(json);
    items.forEach(function (it) {
      if (!it.channel_id) it.channel_id = id;
      if (parsed) {
        if (!it.uploader) it.uploader = parsed.name || '';
        if (!it.avatar && parsed.avatar) it.avatar = parsed.avatar;
      }
    });
    const out = items.slice(0, n);
    if (out.length) cacheSet(searchCache, key, out);
    return out;
  });
}

async function innertubeChannelMeta(idOrHandle) {
  const raw = String(idOrHandle || '').trim();
  if (!raw || raw.indexOf('n-') === 0) return null;
  const key = 'chmeta2|' + raw;
  const cached = cacheGet(searchCache, key, 12 * 60 * 1000);
  if (cached && cached.avatar) return cached;
  const ctx = { client: { clientName: 'WEB', clientVersion: '2.20240815.00.00', hl: 'ko', gl: 'KR' } };
  let browseId = raw.indexOf('UC') === 0 ? raw : '';
  if (!browseId) {
    const handle = raw.charAt(0) === '@' ? raw : ('@' + raw.replace(/\s+/g, ''));
    try {
      const resolved = await httpsJson(
        'www.youtube.com',
        '/youtubei/v1/navigation/resolve_url?prettyPrint=false',
        { context: ctx, url: 'https://www.youtube.com/' + handle },
        2500
      );
      browseId = (((resolved.endpoint || {}).browseEndpoint) || {}).browseId || '';
    } catch (e) {
      browseId = handle;
    }
  }
  const json = await httpsJson(
    'www.youtube.com',
    '/youtubei/v1/browse?prettyPrint=false',
    { context: ctx, browseId: browseId || raw },
    4000
  );
  const parsed = avatarFromBrowse(json);
  const ch = asChannel({
    channel_id: parsed.channel_id || (String(browseId).indexOf('UC') === 0 ? browseId : '') || raw,
    name: parsed.name,
    avatar: parsed.avatar,
    subscriberCountText: findNestedString(json, function (s) { return /구독자|subscriber/i.test(String(s)); }, 0),
  });
  if (!ch) return null;
  if (ch.avatar) cacheSet(searchCache, key, ch);
  return ch;
}

function looksAvatar(url) {
  return /ggpht|googleusercontent|yt3\./i.test(String(url || ''));
}

async function fillChannelAvatars(channels) {
  const list = (channels || []).slice(0, 6);
  await Promise.all(list.map(async function (ch) {
    if (!ch || (looksAvatar(ch.avatar || ch.thumbnail) && ch.subscribers > 0)) return;
    try {
      const meta = await Promise.race([
        (async function () {
          try {
            const key = (ch.channel_id && String(ch.channel_id).indexOf('UC') === 0)
              ? ch.channel_id
              : (ch.name || ch.channel_id);
            const viaApi = await innertubeChannelMeta(key);
            if (viaApi && viaApi.avatar) return viaApi;
          } catch (e) {}
          return scrapeChannelMeta(ch.channel_id.indexOf && String(ch.channel_id).indexOf('UC') === 0 ? ch.channel_id : (ch.name || ch.channel_id));
        })(),
        new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 1800); }),
      ]);
      if (meta && meta.avatar) {
        ch.avatar = meta.avatar;
        ch.thumbnail = meta.avatar;
        if (meta.name) ch.name = meta.name;
      }
      if (meta && meta.subscribers > 0) ch.subscribers = meta.subscribers;
    } catch (e) {}
  }));
  return channels || [];
}

async function stampItemAvatars(items, limit) {
  const max = Math.min(parseInt(limit, 10) || 8, 12);
  const map = {};
  const names = {};
  (items || []).forEach(function (it) {
    if (it && it.channel_id && looksAvatar(it.avatar)) map[it.channel_id] = it.avatar;
  });
  const need = [];
  (items || []).forEach(function (it) {
    if (!it || !it.channel_id || map[it.channel_id]) return;
    if (need.indexOf(it.channel_id) === -1) need.push(it.channel_id);
  });
  if (need.length) {
    const chans = need.slice(0, max).map(function (id) {
      return { channel_id: id, name: '', avatar: '', thumbnail: '' };
    });
    await fillChannelAvatars(chans);
    chans.forEach(function (ch) {
      if (ch && ch.avatar) map[ch.channel_id] = ch.avatar;
      if (ch && ch.name) names[ch.channel_id] = ch.name;
    });
  }
  (items || []).forEach(function (it) {
    if (it && it.channel_id && map[it.channel_id]) it.avatar = map[it.channel_id];
    if (it && it.channel_id && names[it.channel_id] && !cleanMeta(it.uploader)) it.uploader = names[it.channel_id];
  });
  return items || [];
}

async function scrapeChannelMeta(idOrHandle) {
  const url = channelPageUrl(idOrHandle);
  if (!url) return null;
  const html = await httpsGetText(url.replace(/\/videos$/, ''));
  const avatar = avatarFromHtml(html);
  const nameM = html.match(/property="og:title"\s+content="([^"]+)"/i)
    || html.match(/content="([^"]+)"\s+property="og:title"/i);
  const idM = html.match(/"channelId"\s*:\s*"(UC[^"]+)"/)
    || html.match(/"externalId"\s*:\s*"(UC[^"]+)"/);
  return asChannel({
    channel_id: (idM && idM[1]) || idOrHandle,
    name: nameM ? String(nameM[1]).replace(/ - YouTube$/i, '') : '',
    avatar: avatar,
  });
}

async function channelMeta(idOrHandle, name) {
  const raw = String(idOrHandle || '').trim();
  if (!raw || raw.indexOf('n-') === 0) {
    if (name) return fetchChannelMeta('@' + String(name).replace(/\s+/g, ''));
    return null;
  }
  const key = 'chmeta2|' + raw;
  const cached = cacheGet(searchCache, key, 12 * 60 * 1000);
  if (cached) return cached;

  if (raw.indexOf('UC') === 0) {
    try {
      const youtubeOauth = require('./youtube-oauth');
      if (youtubeOauth.channelSnippets) {
        const map = await youtubeOauth.channelSnippets([raw]);
        if (map[raw] && (map[raw].avatar || map[raw].name)) {
          const ch = asChannel(map[raw]);
          if (ch) {
            cacheSet(searchCache, key, ch);
            return ch;
          }
        }
      }
    } catch (e) {}
    try {
      const viaInnertube = await innertubeChannelMeta(raw);
      if (viaInnertube && viaInnertube.avatar) return viaInnertube;
    } catch (e) {}
  }

  try {
    const scraped = await scrapeChannelMeta(raw);
    if (scraped && (scraped.avatar || scraped.name)) {
      cacheSet(searchCache, key, scraped);
      return scraped;
    }
  } catch (e) {}

  try {
    const viaYtdlp = await fetchChannelMeta(raw);
    if (viaYtdlp) {
      cacheSet(searchCache, key, viaYtdlp);
      return viaYtdlp;
    }
  } catch (e) {}

  if (name) {
    try {
      const viaName = await fetchChannelMeta('@' + String(name).replace(/\s+/g, ''));
      if (viaName) {
        cacheSet(searchCache, key, viaName);
        return viaName;
      }
    } catch (e) {}
  }
  return null;
}

function channelsFromVideos(query, items) {
  const byCh = {};
  (items || []).forEach(function (v) {
    if (!v || !v.channel_id) return;
    const score = channelScore(query, v.uploader || v.channel || '');
    if (score < 70) return;
    const prev = byCh[v.channel_id];
    if (!prev || score > prev.score) {
      byCh[v.channel_id] = {
        score: score,
        channel_id: v.channel_id,
        name: v.uploader || v.channel || v.channel_id,
        thumbnail: v.avatar || '',
        avatar: v.avatar || '',
      };
    }
  });
  return Object.keys(byCh)
    .map(function (id) { return byCh[id]; })
    .sort(function (a, b) { return b.score - a.score; })
    .map(function (x) { return asChannel(x); })
    .filter(Boolean);
}

function searchPrintArgs(n, q, offset) {
  const off = Math.max(0, parseInt(offset, 10) || 0);
  const end = off + n;
  const fetchN = Math.min(Math.max(end, n), 80);
  const args = [
    '--flat-playlist',
    '--playlist-end', String(end),
    '--print', ITEM_PRINT,
    'ytsearch' + fetchN + ':' + q,
  ];
  if (off > 0) args.splice(1, 0, '--playlist-start', String(off + 1));
  return args;
}

async function searchYoutube(query, limit, offset) {
  const q = String(query || '').trim().slice(0, 120);
  if (!q) return [];
  const n = Math.min(Math.max(parseInt(limit, 10) || 24, 1), 30);
  const off = Math.max(0, parseInt(offset, 10) || 0);
  const key = 's|' + off + '|' + n + '|' + q;
  const cached = cacheGet(searchCache, key, SEARCH_TTL);
  if (cached) return cached;

  if (!off) {
    try {
      const inn = await innertubeSearch(q, n);
      if (inn && inn.items && inn.items.length) {
        cacheSet(searchCache, key, inn.items);
        return inn.items;
      }
    } catch (e) {}
  }

  let items = [];
  try {
    const result = await ytdlpRun(searchPrintArgs(n, q, off), { playlist: true, timeout: 12000 });
    items = parsePrintItems(result.stdout);
  } catch (e) {
    items = [];
  }
  if (!items.length && !off) {
    try {
      const result = await ytdlpRun(searchPrintArgs(Math.min(n, 8), q, 0), { playlist: true, timeout: 10000 });
      items = parsePrintItems(result.stdout);
    } catch (e2) {
      items = [];
    }
  }
  if (items.length) cacheSet(searchCache, key, items);
  return items;
}

async function searchYoutubeWithChannels(query, limit, offset) {
  const q = String(query || '').trim().slice(0, 120);
  if (!q) return { items: [], channels: [] };
  const off = Math.max(0, parseInt(offset, 10) || 0);
  if (off > 0) return { items: await searchYoutube(q, limit, off), channels: [] };

  let items = [];
  let channels = [];
  try {
    const inn = await innertubeSearch(q, limit);
    items = (inn && inn.items) || [];
    channels = (inn && inn.channels) || [];
  } catch (e) {}
  if (!items.length) {
    items = await searchYoutube(q, limit, off);
  }
  const matched = channelsFromVideos(q, items);
  channels = mergeChannels(channels, matched);
  return { items: items, channels: channels };
}

function nextChannelVideos(channel, vid, currentTs) {
  const rows = (channel || []).filter(function (it) { return it && it.id; });
  var idx = -1;
  var i;
  for (i = 0; i < rows.length; i++) {
    if (rows[i].id === vid) { idx = i; break; }
  }
  // Newest first. The next video is the following row, then the newest row
  // after the oldest one.
  var seq = [];
  if (idx >= 0) seq = rows.slice(idx + 1).concat(rows.slice(0, idx));
  else if (currentTs > 0) {
    for (i = 0; i < rows.length; i++) {
      if (rows[i].id !== vid && rows[i].uploaded && rows[i].uploaded < currentTs) seq.push(rows[i]);
    }
  }
  return seq.filter(function (it) { return it.id !== vid; });
}

async function channelNewest(channelId, offset, limit, excludeId) {
  const url = channelPageUrl(channelId);
  if (!url) return [];
  const pageSize = 30;
  const start = Math.max(0, parseInt(offset, 10) || 0);
  const count = Math.max(1, parseInt(limit, 10) || 8);
  const need = start + count + (excludeId ? 1 : 0);
  const seen = {};
  const all = [];
  for (var off = 0; off < 240 && all.length < need; off += pageSize) {
    var batch = [];
    try { batch = await cachedChannelFeed(url, pageSize, off); } catch (e) { break; }
    if (!batch || !batch.length) break;
    var added = 0;
    for (var i = 0; i < batch.length; i++) {
      var it = batch[i];
      if (!it || !it.id || seen[it.id]) continue;
      if (channelId && it.channel_id && it.channel_id !== channelId) continue;
      seen[it.id] = true;
      added += 1;
      if (excludeId && it.id === excludeId) continue;
      all.push(it);
    }
    if (!added) break;
  }
  return all.slice(start, start + count);
}

async function videoStat(id) {
  const key = 'vstat|' + id;
  const hit = cacheGet(searchCache, key, 6 * 60 * 60 * 1000);
  if (hit && Object.prototype.hasOwnProperty.call(hit, 'members')) return hit;
  const json = await httpsJson('www.youtube.com', '/youtubei/v1/player?prettyPrint=false', {
    context: innertubeContext(),
    videoId: id,
    contentCheckOk: true,
    racyCheckOk: true,
  }, 4500);
  const views = parseInt(((json.videoDetails || {}).viewCount), 10) || 0;
  const micro = ((json.microformat || {}).playerMicroformatRenderer) || {};
  const uploaded = Date.parse(micro.publishDate || micro.uploadDate || '') || 0;
  const reason = String(((json.playabilityStatus || {}).reason) || '');
  const members = /채널 회원|회원 전용|회원 우선|회원전용|members only|members-only|channel members/i.test(reason);
  const stat = { views: views, uploaded: uploaded > 0 ? uploaded : 0, members: members };
  cacheSet(searchCache, key, stat);
  return stat;
}

async function fillItemStats(items) {
  const list = items || [];
  const missing = [];
  const seen = {};
  const ties = {};
  list.forEach(function (it) {
    const t = parseInt(it && (it.uploaded || it.ts), 10) || 0;
    if (t) ties[t] = (ties[t] || 0) + 1;
  });
  list.forEach(function (it) {
    if (!it || !it.id || seen[it.id]) return;
    const t = parseInt(it.uploaded, 10) || parseInt(it.ts, 10) || 0;
    const viewsOk = (parseInt(it.views, 10) || 0) > 0;
    const timeOk = t > 0 && !isCoarseTime(t) && !(ties[t] > 1);
    const membersKnown = it.members === true || it.members === false;
    if (viewsOk && timeOk && membersKnown) return;
    seen[it.id] = true;
    missing.push(it.id);
  });
  const cap = missing.slice(0, 40);
  const found = {};
  var cursor = 0;
  async function worker() {
    while (cursor < cap.length) {
      const id = cap[cursor++];
      try { found[id] = await videoStat(id); } catch (e) { found[id] = null; }
    }
  }
  const jobs = [];
  const workers = Math.min(4, cap.length);
  for (var w = 0; w < workers; w++) jobs.push(worker());
  if (jobs.length) await Promise.all(jobs);
  list.forEach(function (it) {
    const st = it && found[it.id];
    if (!st) return;
    if (!((parseInt(it.views, 10) || 0) > 0) && st.views > 0) it.views = st.views;
    const currentTime = parseInt(it.uploaded, 10) || parseInt(it.ts, 10) || 0;
    const nextTime = betterTime(currentTime, st.uploaded);
    if (nextTime > 0 && (nextTime !== currentTime || !(parseInt(it.uploaded, 10) > 0))) {
      it.uploaded = nextTime;
      it.ts = nextTime;
    }
    if (st.members === true) it.members = true;
    else if (st.members === false) it.members = false;
  });
  return list;
}

async function cachedChannelFeed(url, limit, offset) {
  const key = 'chfeed|' + offset + '|' + limit + '|' + url;
  const hit = cacheGet(searchCache, key, 10 * 60 * 1000);
  if (hit) return hit;
  const items = await youtubeFeed(url, limit, 15000, offset);
  if (items && items.length) cacheSet(searchCache, key, items);
  return items || [];
}

async function channelVideosUntilCurrent(channelId, uploader, vid, needAfter) {
  const url = channelPageUrl(channelId);
  if (!url) return [];
  const pageSize = 30;
  const want = Math.max(8, parseInt(needAfter, 10) || 8);
  const seen = {};
  const all = [];
  var foundAt = -1;
  for (var off = 0; off < 240; off += pageSize) {
    var batch = [];
    try { batch = await cachedChannelFeed(url, pageSize, off); } catch (e) { break; }
    if (!batch || !batch.length) break;
    var added = 0;
    for (var i = 0; i < batch.length; i++) {
      var it = batch[i];
      if (!it || !it.id || seen[it.id]) continue;
      if (channelId && it.channel_id && it.channel_id !== channelId) continue;
      seen[it.id] = true;
      if (vid && it.id === vid) foundAt = all.length;
      all.push(it);
      added += 1;
    }
    if (!added) break;
    if (foundAt >= 0 && all.length >= foundAt + 1 + want) break;
  }
  return all;
}

function firstPlayable(rows) {
  const list = rows || [];
  for (var i = 0; i < list.length; i++) {
    if (!list[i] || !list[i].id || list[i].members === true) continue;
    return list[i];
  }
  return null;
}

async function nextAutoplayVideo(channelId, vid, currentTs) {
  if (!channelId) return [];
  const url = channelPageUrl(channelId);
  if (!url) return [];
  const seen = {};
  const before = [];
  var found = false;
  var checked = 0;
  const maxCheck = 40;
  var feedEnded = false;
  for (var off = 0; off < 240 && checked < maxCheck && !feedEnded; off += 30) {
    var page = [];
    try { page = await cachedChannelFeed(url, 30, off); } catch (e) { feedEnded = true; break; }
    if (!page || !page.length) { feedEnded = true; break; }
    var added = 0;
    var after = [];
    for (var i = 0; i < page.length; i++) {
      var it = page[i];
      if (!it || !it.id || seen[it.id]) continue;
      if (it.channel_id && it.channel_id !== channelId) continue;
      seen[it.id] = true;
      added += 1;
      if (!found) {
        if (it.id === vid) found = true;
        else before.push(it);
        continue;
      }
      after.push(it);
    }
    if (!added) { feedEnded = true; break; }
    if (!found || !after.length) continue;
    var slice = after.slice(0, maxCheck - checked);
    checked += slice.length;
    for (var s = 0; s < slice.length; ) {
      var group = slice.slice(s, s + 4);
      s += group.length;
      try { await fillItemStats(group); } catch (e2) {}
      var hit = firstPlayable(group);
      if (hit) return [hit];
    }
  }
  if (!found) {
    const seq = nextChannelVideos(before, vid, currentTs).slice(0, 12);
    try { await fillItemStats(seq); } catch (e3) {}
    var missed = firstPlayable(seq);
    return missed ? [missed] : [];
  }
  if (!feedEnded || !before.length) return [];
  var wrap = before.slice(0, 12);
  try { await fillItemStats(wrap); } catch (e4) {}
  var wrapped = firstPlayable(wrap);
  return wrapped ? [wrapped] : [];
}

function findChild(node, key, depth) {
  if (!node || depth > 14) return null;
  if (Array.isArray(node)) {
    for (var i = 0; i < node.length; i++) {
      const hit = findChild(node[i], key, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  if (Object.prototype.hasOwnProperty.call(node, key) && node[key]) return node[key];
  const keys = Object.keys(node);
  for (var j = 0; j < keys.length; j++) {
    const child = node[keys[j]];
    if (!child || typeof child !== 'object') continue;
    const hit2 = findChild(child, key, depth + 1);
    if (hit2) return hit2;
  }
  return null;
}

function continuationToken(node, depth) {
  if (!node || depth > 14) return '';
  if (Array.isArray(node)) {
    for (var i = 0; i < node.length; i++) {
      const t = continuationToken(node[i], depth + 1);
      if (t) return t;
    }
    return '';
  }
  if (typeof node !== 'object') return '';
  if (node.continuationCommand && node.continuationCommand.token) return String(node.continuationCommand.token);
  const keys = Object.keys(node);
  for (var j = 0; j < keys.length; j++) {
    const t2 = continuationToken(node[keys[j]], depth + 1);
    if (t2) return t2;
  }
  return '';
}

function collectSuggestFrom(node) {
  const acc = { videos: [], channels: [], lockups: [] };
  walkRenderers(node, acc, 0);
  return collectInnertubeItems(acc);
}

function cleanSuggestId(videoId) {
  return String(videoId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 11);
}

async function fetchSuggestPage(videoId) {
  const id = cleanSuggestId(videoId);
  if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) return { items: [], token: '', done: true };
  const key = 'suggest2|' + id;
  const cached = cacheGet(searchCache, key, 10 * 60 * 1000);
  if (cached) return cached;
  return once(key, async function () {
    const json = await httpsJson(
      'www.youtube.com',
      '/youtubei/v1/next?prettyPrint=false',
      { context: innertubeContext(), videoId: id, contentCheckOk: true, racyCheckOk: true },
      8000,
      1800000
    );
    const secondary = findChild(json, 'secondaryResults', 0) || json;
    const items = collectSuggestFrom(secondary).filter(function (it) { return it && it.id && it.id !== id; });
    const out = { items: items, token: continuationToken(secondary, 0), done: false };
    out.done = !out.token;
    if (items.length) cacheSet(searchCache, key, out);
    return out;
  });
}

async function ensureSuggest(videoId, need) {
  const page = await fetchSuggestPage(videoId);
  const id = cleanSuggestId(videoId);
  const want = Math.max(0, parseInt(need, 10) || 0);
  if (!page || page.done || !page.token || (page.items || []).length >= want) return page;
  const moreKey = 'suggest2more|' + id + '|' + page.items.length;
  await once(moreKey, async function () {
    if (page.done || !page.token || page.items.length >= want) return page;
    const more = await httpsJson(
      'www.youtube.com',
      '/youtubei/v1/next?prettyPrint=false',
      { context: innertubeContext(), continuation: page.token },
      8000,
      2500000
    );
    const extra = collectSuggestFrom(more).filter(function (it) { return it && it.id && it.id !== id; });
    const seen = {};
    page.items.forEach(function (it) { if (it && it.id) seen[it.id] = true; });
    extra.forEach(function (it) {
      if (!it || !it.id || seen[it.id]) return;
      seen[it.id] = true;
      page.items.push(it);
    });
    page.token = continuationToken(more, 0);
    page.done = !page.token;
    return page;
  });
  return page;
}

async function youtubeSuggestions(videoId, limit, offset) {
  const n = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 24);
  const off = Math.max(0, parseInt(offset, 10) || 0);
  const page = await ensureSuggest(videoId, off + n);
  const items = (page && page.items) || [];
  return {
    items: items.slice(off, off + n),
    more: items.length > off + n || !!(page && !page.done && page.token),
  };
}

async function nextSuggestedVideo(videoId) {
  const page = await fetchSuggestPage(videoId);
  const id = cleanSuggestId(videoId);
  const rows = (page && page.items) || [];
  var checked = 0;
  for (var i = 0; i < rows.length && checked < 16;) {
    var group = [];
    while (i < rows.length && group.length < 4 && checked < 16) {
      var it = rows[i++];
      if (!it || !it.id || it.id === id) continue;
      group.push(it);
      checked += 1;
    }
    if (!group.length) break;
    try { await fillItemStats(group); } catch (e) {}
    var hit = firstPlayable(group);
    if (hit) return [hit];
  }
  return [];
}

async function youtubeRelated(id, title, limit, extra) {
  extra = extra || {};
  const n = Math.min(Math.max(parseInt(limit, 10) || 8, 1), 24);
  const offset = Math.max(0, parseInt(extra.offset, 10) || 0);
  const vid = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const channelId = String(extra.channel_id || '').replace(/[^a-zA-Z0-9_@-]/g, '');
  const uploader = String(extra.uploader || extra.channel || '').slice(0, 80);
  const currentTs = asMs(extra.uploaded);
  if (String(extra.pick || '') === 'next') {
    return nextAutoplayVideo(channelId, vid, currentTs);
  }
  if (!channelId) return [];
  try { return await channelNewest(channelId, offset, n, ''); } catch (e) { return []; }
}

async function youtubeComments(id, limit, offset, sort) {
  const vid = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 11);
  if (!/^[a-zA-Z0-9_-]{11}$/.test(vid)) return { items: [], more: false };
  const n = Math.min(Math.max(parseInt(limit, 10) || 1, 1), 20);
  const off = Math.max(0, parseInt(offset, 10) || 0);
  const descending = sort !== 'top-asc' && sort !== 'new-asc';
  const order = sort === 'new' || sort === 'new-asc' ? 'new' : 'top';
  const key = 'comments|' + sort + '|' + vid;
  let comments = cacheGet(commentCache, key, SEARCH_TTL);
  if (!comments || comments.length <= off + n) {
    const result = await ytdlpRun([
      '--write-comments',
      '-J',
      'https://www.youtube.com/watch?v=' + vid,
    ], { timeout: 60000, commentLimit: Math.min(Math.max(off + n + 20, 20), 100), commentSort: order });
    const data = parseJsonBlob(result.stdout) || {};
    comments = (Array.isArray(data.comments) ? data.comments : []).map(function (item) {
      if (!item) return null;
      const likeCandidates = [item.like_count, item._like_count, item.likeCount,
        item.likes, item.like_count_text, item.likeCountText, item.vote_count,
        item.voteCount, item.vote_count_text];
      const rawLikes = likeCandidates.find(function (value) { return value != null && value !== ''; });
      const likesText = rawLikes && typeof rawLikes === 'object' ? textOf(rawLikes) : rawLikes;
      const likesString = String(likesText == null ? '' : likesText).replace(/,/g, '').trim();
      const likes = likesString ? parseKoViews(likesString) : null;
      var rawTime = item.timestamp || item._timestamp || item.time || item.comment_time || item.published_at || item.publishedAt;
      var time = parseInt(rawTime, 10) || 0;
      if (time > 100000000000) time = Math.floor(time / 1000);
      if (!time && rawTime) {
        var parsedTime = Date.parse(String(rawTime));
        if (isFinite(parsedTime)) time = Math.floor(parsedTime / 1000);
      }
      return {
        id: String(item.id || '').slice(0, 120),
        author: String(item.author || item.uploader || 'YouTube 사용자').slice(0, 120),
        avatar: String(item.author_thumbnail || '').slice(0, 500),
        text: String(item.text || '').slice(0, 2000),
        likes: likes,
        time: time,
        timeText: String(item.time_text || item._time_text || item.published || item.published_time || item.comment_time_text || item.publishedTimeText || '').slice(0, 80),
      };
    }).filter(function (item) { return item && item.text; });
    comments.sort(function (a, b) {
      var result = order === 'new' ? (b.time || 0) - (a.time || 0) : (b.likes || 0) - (a.likes || 0);
      return descending ? result : -result;
    });
    cacheSet(commentCache, key, comments);
  }
  return {
    items: comments.slice(off, off + n),
    more: comments.length > off + n,
    total: comments.length,
  };
}

async function youtubeFeed(url, limit, timeout, offset) {
  const n = Math.min(Math.max(parseInt(limit, 10) || 24, 1), 40);
  const off = Math.max(0, parseInt(offset, 10) || 0);
  const result = await ytdlpRun([
    '--flat-playlist',
    '--playlist-start', String(off + 1),
    '--playlist-end', String(off + n),
    '--print', ITEM_PRINT,
    url,
  ], { timeout: timeout || 10000, playlist: true });
  return parsePrintItems(result.stdout);
}

async function youtubeHome(limit, offset) {
  const n = Math.min(Math.max(parseInt(limit, 10) || 24, 1), 40);
  const off = Math.max(0, parseInt(offset, 10) || 0);
  if (off > 0) return searchYoutube('인기 급상승', n, off);
  const key = 'home|' + n;
  const cached = cacheGet(searchCache, key, 8 * 60 * 1000);
  if (cached) return cached;

  try {
    const inn = await innertubeSearch('인기 급상승', n);
    if (inn && inn.items && inn.items.length) {
      cacheSet(searchCache, key, inn.items);
      return inn.items;
    }
  } catch (e) {}

  const tries = [
    'ytsearch' + n + ':인기 급상승',
    'https://www.youtube.com/feed/trending',
  ];
  let lastErr = '인기 영상을 가져오지 못했습니다';
  for (var i = 0; i < tries.length; i++) {
    try {
      const items = tries[i].indexOf('ytsearch') === 0
        ? await searchYoutube(tries[i].replace(/^ytsearch\d+:/, ''), n)
        : await youtubeFeed(tries[i], n, 12000);
      if (items && items.length) {
        cacheSet(searchCache, key, items);
        return items;
      }
    } catch (e) {
      lastErr = e.message || lastErr;
    }
  }
  throw new Error(lastErr);
}

async function youtubeSubscriptions(limit) {
  if (!config.getCookiesFile()) throw new Error('구독 피드는 YouTube 로그인이 필요합니다');
  const items = await youtubeFeed('https://www.youtube.com/feed/subscriptions', limit, 35000);
  if (!items.length) throw new Error('구독 영상이 없거나 쿠키가 만료되었습니다');
  return items;
}

function channelPageUrl(channelId) {
  const raw = String(channelId || '').trim();
  if (!raw || raw.indexOf('n-') === 0) return '';
  if (raw.charAt(0) === '@') {
    const handle = raw.replace(/[^\w\uac00-\ud7a3_@.-]/g, '');
    if (handle.length < 2) return '';
    return 'https://www.youtube.com/' + handle + '/videos';
  }
  const id = raw.replace(/[^a-zA-Z0-9_-]/g, '');
  if (id.indexOf('UC') === 0 && id.length >= 20) return 'https://www.youtube.com/channel/' + id + '/videos';
  return '';
}

async function youtubeChannelVideos(channelId, limit, name, offset, opts) {
  opts = opts || {};
  const n = Math.min(Math.max(parseInt(limit, 10) || 4, 1), 40);
  const off = Math.max(0, parseInt(offset, 10) || 0);
  let url = channelPageUrl(channelId);
  const key = 'ch3|' + off + '|' + n + '|' + (url || ('q:' + (name || channelId || '')));
  const cached = cacheGet(searchCache, key, 10 * 60 * 1000);
  if (cached) return cached;
  let items = [];
  if (String(channelId || '').indexOf('UC') === 0) {
    try { items = await channelNewest(channelId, off, n, ''); } catch (e) { items = []; }
  }
  if ((!items || !items.length) && !off && String(channelId || '').indexOf('UC') === 0) {
    try { items = await innertubeChannelVideos(channelId, n); } catch (e) { items = []; }
  }
  if ((!items || !items.length) && url) {
    try { items = await youtubeFeed(url, n, 8000, off); } catch (e) { items = []; }
  }
  if ((!items || !items.length) && name) {
    try { items = await searchYoutube(name, n, off); } catch (e) { items = []; }
  }
  (items || []).forEach(function (it) {
    if (!it) return;
    if (channelId && !it.channel_id) it.channel_id = String(channelId);
    if (name && !it.uploader) it.uploader = name;
  });
  cacheSet(searchCache, key, items || []);
  return items || [];
}

async function subscriptionFeed(channels, limit) {
  const n = Math.min(Math.max(parseInt(limit, 10) || 24, 1), 40);
  const chans = (channels || []).filter(function (ch) {
    return ch && (ch.channel_id || ch.name);
  }).slice(0, 5);
  if (!chans.length) return [];
  const per = 4;
  const out = [];
  let idx = 0;
  async function worker() {
    while (idx < chans.length) {
      const i = idx++;
      const ch = chans[i];
      try {
        const vids = await youtubeChannelVideos(ch.channel_id, per, ch.name, 0, { stamp: false });
        vids.forEach(function (v) {
          v.uploader = v.uploader || ch.name || '';
          v.channel_id = v.channel_id || ch.channel_id;
          out.push(v);
        });
      } catch (e) {}
    }
  }
  const workers = [];
  const wcount = Math.min(5, chans.length);
  for (var w = 0; w < wcount; w++) workers.push(worker());
  await Promise.all(workers);
  out.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
  return out.slice(0, n);
}

async function twitchStatus(channel) {
  const ch = String(channel || '').replace(/[^a-zA-Z0-9_]/g, '');
  if (!ch) return { live: false, error: '채널 없음' };
  try {
    const result = await ytdlpRun([
      '--print', '%(title)s|||%(view_count)s|||%(is_live)s',
      'https://www.twitch.tv/' + ch,
    ], { timeout: 18000 });
    const line = result.stdout.trim().split(/\r?\n/)[0] || '';
    const p = line.split('|||');
    const live = String(p[2] || '').toLowerCase() === 'true' || String(p[2] || '') === '1';
    return {
      live: live,
      channel: ch,
      title: p[0] || 'Live',
      viewers: parseInt(p[1], 10) || 0,
    };
  } catch (e) {
    const msg = e.message || '';
    if (/not currently live|offline|is offline/i.test(msg)) {
      return { live: false, channel: ch };
    }
    return { live: false, channel: ch, error: msg.slice(0, 80) };
  }
}

module.exports = {
  classify,
  isTestSource,
  testInfo,
  extractYoutubeId,
  extractTwitchChannel,
  scaleForQuality,
  bitrateForQuality,
  resolveSource,
  invalidateSource,
  searchYoutube,
  searchYoutubeWithChannels,
  youtubeHome,
  youtubeRelated,
  youtubeSuggestions,
  nextSuggestedVideo,
  youtubeComments,
  youtubeSubscriptions,
  youtubeChannelVideos,
  subscriptionFeed,
  channelMeta,
  fillChannelAvatars,
  fillItemStats,
  stampItemAvatars,
  channelScore,
  twitchStatus,
  ytdlpArgs,
  formatForQuality,
  youtubeFormatCandidatesForQuality,
  stripBrokenFormats,
};
