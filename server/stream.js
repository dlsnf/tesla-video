'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const config = require('./config');
const { killTree } = require('./proc');
const media = require('./media');

const active = new Set();
const YT_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

function activeCount() {
  var n = 0;
  active.forEach(function (s) { if (s.kind === 'video') n++; });
  return n;
}

function swallowErr(s) {
  if (s && s.on) s.on('error', function () {});
}

function evictAllVideo() {
  var list = [];
  active.forEach(function (s) {
    if (s.kind === 'video') list.push(s);
  });
  list.forEach(function (s) {
    try { s.kill(); } catch (e) {}
    active.delete(s);
  });
}

function evictOldestVideo() {
  evictAllVideo();
  return true;
}

function parseStart(v) {
  const n = parseFloat(v);
  if (!isFinite(n) || n < 0) return 0;
  return Math.min(n, 12 * 3600);
}

function spawnFfmpeg(args) {
  return spawn(config.FFMPEG, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
}

function killProc(p) {
  if (!p) return;
  try {
    if (p.kill && !p.pid) {
      p.kill();
      return;
    }
  } catch (e) {}
  try { if (p._buddy) killTree(p._buddy); } catch (e0) {}
  try { if (p.pid) killTree(p); } catch (e1) {}
}

function startYoutubePipe(info, start, format, timestampOffset) {
  var formats = {
    '134+140': '134+140/135+140/160+139/bestvideo[height<=360][vcodec^=avc1]+bestaudio[acodec^=mp4a]/best[height<=360][vcodec^=avc1][acodec^=mp4a]',
    '243+140': '243+140/134+140/160+139/bestvideo[height<=360][vcodec^=vp9]+bestaudio[acodec^=mp4a]/bestvideo[height<=360][vcodec^=avc1]+bestaudio[acodec^=mp4a]/best[height<=360][vcodec^=avc1][acodec^=mp4a]',
  };
  // The fallback is decoded by ffmpeg before reaching the car, so it can use
  // the best source at the requested size instead of being tied to a 360p
  // H.264 itag.
  var requestedHeight = Number(info && info.quality) >= 720 ? 720 : (Number(info && info.quality) >= 480 ? 480 : 360);
  var requestedFormat = 'bestvideo[height<=' + requestedHeight + ']+bestaudio/bv*[height<=' + requestedHeight + ']+ba/best[height<=' + requestedHeight + ']';
  const extra = [
    '-f', requestedHeight > 360 ? requestedFormat : (formats[format] || formats['134+140']),
    '--merge-output-format', 'mkv',
    '--no-part',
    '--no-progress',
    '-o', '-',
  ];
  const s = parseStart(start);
  if (!info.isLive && s > 2) {
    extra.push('--download-sections', '*' + Math.floor(s) + '-inf');
  }
  extra.push(info.pageUrl || ('https://www.youtube.com/watch?v=' + (info.id || '')));
  var dlArgs = media.ytdlpArgs(extra, { client: 'default', cookies: false, ignoreErrors: false });
  const ytdlp = spawn(config.YT_DLP, dlArgs, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  swallowErr(ytdlp.stdout);
  swallowErr(ytdlp.stderr);
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  swallowErr(stdout);
  swallowErr(stderr);
  const ee = new EventEmitter();
  var ffmpeg = null;
  var finished = false;

  function finish(code) {
    if (finished) return;
    finished = true;
    try { stdout.end(); } catch (e0) {}
    ee.emit('close', code == null ? 1 : code);
  }

  ytdlp.stderr.on('data', function (d) { try { stderr.write(d); } catch (e) {} });
  ytdlp.stdout.once('data', function (chunk) {
    if (finished) return;
    const ffArgs = [
      '-hide_banner', '-loglevel', 'warning',
      '-probesize', '512k',
      '-analyzeduration', '2M',
      '-fflags', '+genpts+discardcorrupt',
      '-err_detect', 'ignore_err',
      '-i', 'pipe:0',
    ];
    Array.prototype.push.apply(ffArgs, encodeTs(info, timestampOffset));
    ffmpeg = spawn(config.FFMPEG, ffArgs, { detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    swallowErr(ffmpeg.stdin);
    swallowErr(ffmpeg.stdout);
    swallowErr(ffmpeg.stderr);
    try { ffmpeg.stdin.write(chunk); } catch (eWrite) {}
    ytdlp.stdout.pipe(ffmpeg.stdin);
    ffmpeg.stdout.pipe(stdout);
    ffmpeg.stderr.on('data', function (d) { try { stderr.write(d); } catch (e1) {} });
    ffmpeg.on('close', function (code) {
      try { killTree(ytdlp); } catch (e2) {}
      finish(code);
    });
    ffmpeg.on('error', function () { finish(1); });
  });
  ytdlp.on('close', function (code) {
    if (!ffmpeg) {
      setTimeout(function () {
        if (!ffmpeg && !finished) finish(code || 1);
      }, 800);
    } else try { ffmpeg.stdin.end(); } catch (e3) {}
  });
  ytdlp.on('error', function (err) {
    ee.emit('error', err);
    finish(1);
  });

  return {
    stdout: stdout,
    stderr: stderr,
    _buddy: ytdlp,
    on: function (ev, fn) { ee.on(ev, fn); return this; },
    kill: function () {
      try { killTree(ytdlp); } catch (e4) {}
      try { if (ffmpeg) killTree(ffmpeg); } catch (e5) {}
    },
  };
}

function ffmpegInputPrefix(start, isLive) {
  const args = [
    '-hide_banner', '-loglevel', 'error',
  ];
  if (isLive) {
    args.push('-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '30');
  }
  if (!isLive && start > 0) {
    args.push('-ss', String(start));
  }
  args.push('-re');
  return args;
}

function seekParts(start, isLive) {
  const s = parseStart(start);
  if (isLive || s <= 0) return { coarse: 0, fine: 0 };
  if (s > 4) return { coarse: Math.max(0, s - 2), fine: 2 };
  return { coarse: 0, fine: s };
}

function cookieHeader() {
  var p = '';
  try { p = config.getCookiesFile ? config.getCookiesFile() : ''; } catch (e) { return ''; }
  if (!p) return '';
  var text = '';
  try { text = fs.readFileSync(p, 'utf8'); } catch (e2) { return ''; }
  var parts = [];
  text.split(/\r?\n/).forEach(function (line) {
    if (!line || line.charAt(0) === '#') return;
    var c = line.split('\t');
    if (c.length < 7) return;
    var domain = String(c[0] || '').toLowerCase();
    if (domain.indexOf('youtube') < 0 && domain.indexOf('google') < 0) return;
    parts.push(c[5] + '=' + c[6]);
  });
  return parts.join('; ');
}

function headerString(h) {
  var lines = [];
  if (h && typeof h === 'object') {
    Object.keys(h).forEach(function (k) {
      if (h[k] == null || h[k] === '') return;
      lines.push(k + ': ' + h[k]);
    });
  }
  if (!lines.length) {
    lines.push('User-Agent: ' + YT_UA);
    lines.push('Referer: https://www.youtube.com/');
    lines.push('Origin: https://www.youtube.com');
  }
  var hasCookie = lines.some(function (l) { return /^Cookie:/i.test(l); });
  var ck = cookieHeader();
  if (ck && !hasCookie) lines.push('Cookie: ' + ck);
  return lines.join('\r\n') + '\r\n';
}

function netInput(url, coarse, isLive, headers, opts) {
  opts = opts || {};
  const a = [
    '-thread_queue_size', '1024',
    '-headers', headerString(headers),
  ];
  if (isLive) {
    a.unshift('-reconnect_delay_max', '30');
    a.unshift('-reconnect_streamed', '1');
    a.unshift('-reconnect', '1');
  }
  if (!isLive && coarse > 0) a.push('-ss', String(coarse));
  // VOD is deliberately produced ahead of real time so the browser has a
  // meaningful reserve before a brief network or decoder hiccup.
  if (!opts.noRate) a.push('-readrate', isLive ? '1.0' : '1.35');
  a.push('-i', url);
  return a;
}

function pickDumpFormat(dump, ids) {
  var fmts = (dump && dump.formats) || [];
  var i, j;
  for (i = 0; i < ids.length; i++) {
    for (j = 0; j < fmts.length; j++) {
      if (String(fmts[j].format_id) === String(ids[i]) && fmts[j].url) return fmts[j];
    }
  }
  return null;
}

function startYoutubeSeek(info, start, opts) {
  if (!info || !info.videoUrl || !info.audioUrl) return null;
  var v = { url: info.videoUrl, http_headers: info.videoHeaders };
  var a = { url: info.audioUrl, http_headers: info.audioHeaders };
  var target = parseStart(start);
  var coarse = Math.max(0, target - 2);
  var fine = target - coarse;
  var args = ['-hide_banner', '-loglevel', 'warning', '-ss', String(coarse)];
  Array.prototype.push.apply(args, netInput(v.url, 0, false, v.http_headers, { noRate: true }));
  args.push('-ss', String(coarse));
  Array.prototype.push.apply(args, netInput(a.url, 0, false, a.http_headers, { noRate: true }));
  args.push('-map', '0:v:0', '-map', '1:a:0');
  if (fine > 0) args.push('-ss', String(fine));
  Array.prototype.push.apply(args, encodeTs(info, opts && opts.timestampOffset));
  return spawnFfmpeg(args);
}

function encodeTs(info, timestampOffset) {
  const offset = Number(timestampOffset) > 0 ? Number(timestampOffset) : 0;
  const videoPts = offset ? 'setpts=PTS-STARTPTS+' + offset + '/TB' : 'setpts=PTS-STARTPTS';
  const audioPts = offset ? 'asetpts=PTS-STARTPTS+' + offset + '/TB' : 'asetpts=PTS-STARTPTS';
  return [
    '-fflags', '+genpts',
    '-avoid_negative_ts', 'make_zero',
    '-c:v', 'mpeg1video',
    '-pix_fmt', 'yuv420p',
    '-q:v', '5',
    '-b:v', info.bitrate || '1000k',
    '-bf', '0',
    '-vf', 'fps=' + (info.fps === 30 ? 30 : 24) + ',scale=' + (info.scale || '640:360') + ':flags=fast_bilinear,setsar=1,' + videoPts,
    '-af', 'aresample=44100:first_pts=0,' + audioPts,
    '-c:a', 'mp2',
    '-b:a', '192k',
    '-ar', '44100',
    '-ac', '2',
    '-f', 'mpegts',
    '-flush_packets', '0',
    '-muxdelay', '0',
    '-muxpreload', '0',
    'pipe:1',
  ];
}

function startTestVideo(info) {
  const wh = String(info.scale || '640:360').split(':');
  return spawnFfmpeg([
    '-hide_banner', '-loglevel', 'error',
    '-re',
    '-f', 'lavfi',
    '-i', 'testsrc2=size=' + wh[0] + 'x' + wh[1] + ':rate=' + (info.fps === 30 ? 30 : 24),
    '-f', 'lavfi',
    '-i', 'sine=frequency=440:sample_rate=44100',
    '-map', '0:v:0',
    '-map', '1:a:0',
  ].concat(encodeTs(info)));
}

function startTestAudio() {
  return spawnFfmpeg([
    '-hide_banner', '-loglevel', 'error',
    '-re',
    '-f', 'lavfi',
    '-i', 'sine=frequency=440:sample_rate=44100',
    '-vn',
    '-c:a', 'libmp3lame',
    '-b:a', '160k',
    '-ar', '44100',
    '-ac', '1',
    '-f', 'mp3',
    'pipe:1',
  ]);
}

function startVideo(info, start, opts) {
  opts = opts || {};
  if (info.type === 'test') return startTestVideo(info);
  // The direct URL path is fast, but some CDN ranges legitimately return an
  // empty successful response after a seek. The legacy yt-dlp section reader
  // is slower to start but reliable for that fallback.
  if (info.type === 'youtube' && opts.legacySeek) {
    return startYoutubePipe(info, start, opts.format, opts.timestampOffset);
  }
  // Seeking remote YouTube media through the normal rate-limited relay can
  // leave ffmpeg waiting at a non-keyframe. Use independent fast inputs for
  // a seek; the output still starts at the requested, synchronized timestamp.
  if (info.type === 'youtube' && !info.isLive && Number(start) > 2 && info.videoUrl && info.audioUrl) {
    return startYoutubeSeek(info, start, opts);
  }
  const sk = seekParts(start, info.isLive);
  const args = ['-hide_banner', '-loglevel', 'warning', '-fflags', '+genpts+discardcorrupt', '-err_detect', 'ignore_err'];
  if (info.audioUrl && info.audioUrl !== info.videoUrl) {
    Array.prototype.push.apply(args, netInput(info.videoUrl, sk.coarse, info.isLive, info.videoHeaders));
    Array.prototype.push.apply(args, netInput(info.audioUrl, sk.coarse, info.isLive, info.audioHeaders));
    if (sk.fine > 0) args.push('-ss', String(sk.fine));
    args.push('-map', '0:v:0', '-map', '1:a:0');
  } else {
    Array.prototype.push.apply(args, netInput(info.videoUrl, sk.coarse, info.isLive, info.videoHeaders));
    if (sk.fine > 0) args.push('-ss', String(sk.fine));
    args.push('-map', '0:v:0', '-map', '0:a:0?');
  }
  Array.prototype.push.apply(args, encodeTs(info, opts.timestampOffset));
  return spawnFfmpeg(args);
}

function startAudio(info, start, fast) {
  if (info.type === 'test') return startTestAudio();
  const inputArgs = info.type === 'file'
    ? ['-hide_banner', '-loglevel', 'warning'].concat(Number(start) > 0 ? ['-ss', String(start)] : [], ['-i', info.audioUrl])
    : fast
    ? ['-hide_banner', '-loglevel', 'warning']
    : ffmpegInputPrefix(start, info.isLive);
  const sourceArgs = info.type === 'file' ? [] : [
    '-user_agent', YT_UA,
    '-referer', 'https://www.youtube.com/',
    '-i', info.audioUrl,
  ];
  const args = inputArgs.concat(sourceArgs, [
    '-vn',
    '-fflags', 'nobuffer',
    '-flags', 'low_delay',
    '-analyzeduration', fast ? '2M' : '0',
    '-probesize', fast ? '512k' : '32',
    '-c:a', 'libmp3lame',
    '-b:a', '160k',
    '-ar', '44100',
    '-ac', '2',
    '-f', 'mp3',
    'pipe:1',
  ]);
  return spawnFfmpeg(args);
}

function allowedPlayInput(input) {
  try {
    const c = media.classify(input);
    return !!(c && (c.type === 'youtube' || c.type === 'twitch' || c.type === 'test'));
  } catch (e) {
    return false;
  }
}

function attachWsStream(ws, input, quality, start, extra) {
  if (!allowedPlayInput(input)) {
    sendJson(ws, { type: 'error', message: 'YouTube/Twitch 주소만 재생할 수 있습니다' });
    ws.close();
    return;
  }
  if (extra && extra.refresh) {
    try {
      const classified = media.classify(input);
      if (classified && classified.id) media.invalidateSource(classified.id);
    } catch (eRefresh) {}
  }
  evictAllVideo();

  let ffmpeg = null;
  let closed = false;
  let flushTimer = null;
  let heartbeatTimer = null;
  let clientHold = false;
  let legacySeek = !!(extra && extra.legacySeek);
  let flushWs = function () {};
  const slot = { kind: 'video', kill: function () { killProc(ffmpeg); } };
  active.add(slot);

  function cleanup() {
    if (closed) return;
    closed = true;
    if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    active.delete(slot);
    killProc(ffmpeg);
    ffmpeg = null;
  }

  ws.on('close', cleanup);
  ws.on('error', cleanup);
  ws.isAlive = true;
  ws.on('pong', function () { ws.isAlive = true; });
  heartbeatTimer = setInterval(function () {
    if (closed || ws.readyState !== 1) return;
    if (!ws.isAlive) {
      try { ws.terminate(); } catch (ePing) {}
      cleanup();
      return;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch (ePingSend) { cleanup(); }
  }, 30000);
  heartbeatTimer.unref();
  ws.on('message', function (data) {
    var s = '';
    try {
      if (Buffer.isBuffer(data)) s = data.toString();
      else if (typeof data === 'string') s = data;
      else return;
      if (!s || s.charAt(0) !== '{') return;
      var msg = JSON.parse(s);
      if (!msg || !msg.type) return;
      if (msg.type === 'hold') {
        clientHold = true;
        try { if (ffmpeg && ffmpeg.stdout && ffmpeg.stdout.pause) ffmpeg.stdout.pause(); } catch (e0) {}
      } else if (msg.type === 'go') {
        clientHold = false;
        try { if (ffmpeg && ffmpeg.stdout && ffmpeg.stdout.resume) ffmpeg.stdout.resume(); } catch (e1) {}
        flushWs();
      }
    } catch (e2) {}
  });

  sendStatus(ws, '영상 주소를 확인하는 중...');

  function beginEncode() {
  if (closed || ws.readyState !== 1) return;
  media.resolveSource(input, quality).then(function (info) {
    if (closed) return;
    sendJson(ws, { type: 'meta', title: info.title, duration: info.duration, isLive: info.isLive, id: info.id });
    sendStatus(ws, parseStart(start) > 2 ? '지정한 위치부터 받는 중...' : 'MPEG1 스트림 시작...');
    info.fps = extra && extra.fps === 30 ? 30 : 24;
    info.bitrate = media.bitrateForQuality(quality, !!(extra && extra.low));
    var encodeAttempt = 0;
    ffmpeg = startVideo(info, start, { format: extra && extra.format, legacySeek: legacySeek });
    slot.kill = function () { killProc(ffmpeg); };

    var pending = [];
    var pendingBytes = 0;
    var mpegSent = 0;
    var errBuf = '';
    var sourceRejectedSeen = false;
    var sourceRefreshTimer = null;
    // Keep several seconds of encoded media available before applying socket
    // backpressure. This lets the browser refill audio after a decode hiccup.
    var SEND_CAP = 768 * 1024;
    var PENDING_CAP = 768 * 1024;
    function pauseOut() {
      try { if (ffmpeg && ffmpeg.stdout && ffmpeg.stdout.pause) ffmpeg.stdout.pause(); } catch (e) {}
    }
    function resumeOut() {
      if (clientHold || pendingBytes >= PENDING_CAP) return;
      try { if (ffmpeg && ffmpeg.stdout && ffmpeg.stdout.resume) ffmpeg.stdout.resume(); } catch (e) {}
    }
    flushWs = function () {
      if (ws.readyState !== 1) {
        pending = [];
        pendingBytes = 0;
        return;
      }
      if (clientHold || ws.bufferedAmount > SEND_CAP) {
        pauseOut();
        return;
      }
      if (!pendingBytes) {
        resumeOut();
        return;
      }
      var take = pendingBytes > 64 * 1024 ? 64 * 1024 : pendingBytes;
      var out;
      if (take === pendingBytes) {
        out = Buffer.concat(pending, pendingBytes);
        pending = [];
        pendingBytes = 0;
      } else {
        var acc = [];
        var left = take;
        while (left > 0 && pending.length) {
          var chunk = pending[0];
          if (chunk.length <= left) {
            acc.push(pending.shift());
            pendingBytes -= chunk.length;
            left -= chunk.length;
          } else {
            acc.push(chunk.subarray(0, left));
            pending[0] = chunk.subarray(left);
            pendingBytes -= left;
            left = 0;
          }
        }
        out = Buffer.concat(acc, take);
      }
      try { ws.send(out); } catch (e) { cleanup(); return; }
      if (pendingBytes >= PENDING_CAP || ws.bufferedAmount > SEND_CAP) pauseOut();
      else resumeOut();
    };
    flushTimer = setInterval(flushWs, 40);
    slot.kill = function () { if (flushTimer) clearInterval(flushTimer); killProc(ffmpeg); };

    function bindMpeg(cur) {
      if (!cur) return;
      var lastEncodedSec = 0;
      var streamDebugSent = false;
      swallowErr(cur.stdout);
      swallowErr(cur.stderr);
      if (cur.stdin) swallowErr(cur.stdin);
      cur.stdout.on('data', function (chunk) {
        if (!streamDebugSent) {
          streamDebugSent = true;
          sendJson(ws, {
            type: 'stream-debug',
            start: parseStart(start),
            requestedQuality: Number(quality) || 480,
            sourceHeight: info.sourceHeight || 0,
            output: info.scale || '',
            bitrate: info.bitrate || '',
            path: legacySeek ? 'yt-dlp-seek-fallback' : (parseStart(start) > 2 ? 'direct-seek' : 'direct-start')
          });
        }
        mpegSent += chunk.length;
        pending.push(chunk);
        pendingBytes += chunk.length;
        if (pendingBytes >= PENDING_CAP) pauseOut();
        if (pendingBytes >= 32 * 1024) flushWs();
      });
      cur.stderr.on('data', function (d) {
        var text = d.toString();
        if (/403|forbidden|http error/i.test(text)) sourceRejectedSeen = true;
        var tm = text.match(/time=([0-9:.]+)/g);
        if (tm && tm.length) {
          var raw = tm[tm.length - 1].replace(/^time=/, '').split(':');
          if (raw.length === 3) {
            var parsed = (parseFloat(raw[0]) * 3600) + (parseFloat(raw[1]) * 60) + parseFloat(raw[2]);
            if (isFinite(parsed)) lastEncodedSec = parsed;
          }
        }
        errBuf += text;
        if (errBuf.length > 1200) errBuf = errBuf.slice(-600);
      });
      if (cur._buddy && cur._buddy.stderr) {
        swallowErr(cur._buddy.stderr);
        swallowErr(cur._buddy.stdout);
        cur._buddy.stderr.on('data', function (d) {
          var s = d.toString().replace(/\s+/g, ' ').trim();
          if (s) {
            if (/403|forbidden|http error/i.test(s)) {
              sourceRejectedSeen = true;
              sendStatus(ws, 'YouTube 주소를 갱신하는 중...');
              if (!sourceRefreshTimer) {
                sourceRefreshTimer = setTimeout(function () {
                  sourceRefreshTimer = null;
                  if (closed || !cur._buddy) return;
                  sendStatus(ws, '다시 연결하는 중...');
                  try { killTree(cur._buddy); } catch (eRefresh) {}
                }, 1200);
              }
            }
            errBuf += ' ' + s;
            if (errBuf.length > 1200) errBuf = errBuf.slice(-600);
            sendStatus(ws, s.slice(-180));
          }
        });
      }
      function closeAfterDrain(message) {
        clientHold = false;
        // The last seconds are often still in the socket buffer. Closing on
        // a short deadline drops them and the repeat countdown starts early.
        var deadline = Date.now() + 15000;
        function drain() {
          if (closed) return;
          flushWs();
          if ((!pendingBytes && ws.bufferedAmount < 1024) || Date.now() >= deadline) {
            if (message) sendJson(ws, message);
            try { ws.close(); } catch (eClose) {}
            cleanup();
            return;
          }
          setTimeout(drain, 70);
        }
        drain();
      }
      cur.on('close', function (code) {
        if (closed) {
          cleanup();
          return;
        }
        var sourceRejected = sourceRejectedSeen || /403|forbidden|http error/i.test(errBuf);
        var streamFailed = code != null && code !== 0;
        // An empty, clean close after a VOD seek is a known CDN range edge
        // case. Do not retry the same request and then mark playback ended;
        // switch the client to the yt-dlp section-reader fallback instead.
        if (!legacySeek && parseStart(start) > 2 && mpegSent < 8000 && !sourceRejected) {
          sendStatus(ws, '시크 구간을 다시 준비하는 중...');
          closeAfterDrain({ type: 'seek-retry', mode: 'legacy' });
          return;
        }
        if ((mpegSent < 8000 || sourceRejected || streamFailed) && encodeAttempt < 2) {
          encodeAttempt += 1;
          try { media.invalidateSource(info && info.id); } catch (eInv) {}
          sendStatus(ws, parseStart(start) > 2 ? '지정한 위치부터 다시 받는 중...' : '다시 연결하는 중...');
          var resumeOffset = Math.max(0, lastEncodedSec - 0.5);
          var resumeStart = parseStart(start) + resumeOffset;
          media.resolveSource(input, quality).then(function (fresh) {
            if (closed) return;
            info = fresh;
            info.fps = extra && extra.fps === 30 ? 30 : 24;
            info.bitrate = media.bitrateForQuality(quality, !!(extra && extra.low));
            mpegSent = 0;
            errBuf = '';
            sourceRejectedSeen = false;
            if (sourceRefreshTimer) { clearTimeout(sourceRefreshTimer); sourceRefreshTimer = null; }
            ffmpeg = startVideo(info, resumeStart, { format: extra && extra.format, legacySeek: legacySeek, timestampOffset: resumeOffset });
            slot.kill = function () { if (flushTimer) clearInterval(flushTimer); killProc(ffmpeg); };
            bindMpeg(ffmpeg);
          }).catch(function (e) {
            sendJson(ws, { type: 'error', message: (e && e.message || '시크 실패').slice(0, 180) });
            try { ws.close(); } catch (e2) {}
            cleanup();
          });
          return;
        }
        if (mpegSent < 8000) {
          sendJson(ws, { type: 'error', message: '지정한 위치의 영상을 받지 못했습니다' });
        } else {
          var expectedSec = Math.max(0, (info.duration || 0) - parseStart(start));
          var shortOutput = !code && !legacySeek && expectedSec > 15
            && (!lastEncodedSec || lastEncodedSec < expectedSec - 4);
          if (parseStart(start) > 2) {
            sendJson(ws, {
              type: 'seek-debug',
              start: parseStart(start),
              expected: expectedSec,
              encoded: lastEncodedSec,
              code: code == null ? null : code,
              legacy: legacySeek,
              short: shortOutput,
            });
          }
          if (shortOutput && encodeAttempt < 2) {
            encodeAttempt += 1;
            sendStatus(ws, '시크 구간을 다시 준비하는 중...');
            closeAfterDrain({ type: 'seek-retry', mode: 'legacy' });
            return;
          }
          if (!code) {
            closeAfterDrain({ type: 'ended' });
            return;
          }
          var msg = '스트림 종료 (' + code + ')';
          if (errBuf) {
            var flat = errBuf.replace(/\s+/g, ' ');
            var ei = flat.lastIndexOf('ERROR:');
            msg += ' ' + (ei >= 0 ? flat.slice(ei, ei + 280) : flat.slice(-240));
          }
          sendJson(ws, { type: 'status', message: msg });
        }
        closeAfterDrain(null);
      });
      cur.on('error', function (e) {
        if (closed) return;
        sendJson(ws, { type: 'error', message: e.message.slice(0, 120) });
        try { ws.close(); } catch (eClose) {}
        cleanup();
      });
    }
    bindMpeg(ffmpeg);
  }).catch(function (e) {
    sendJson(ws, { type: 'error', message: e.message.slice(0, 180) });
    try { ws.close(); } catch (err) {}
    cleanup();
  });
  }
  setTimeout(beginEncode, 350);
}

function attachAudioStream(req, res, input, quality, start) {
  if (!allowedPlayInput(input)) {
    res.status(400).end();
    return;
  }
  if (activeCount() >= config.MAX_STREAMS) {
    res.status(429).end();
    return;
  }

  let ffmpeg = null;
  let audioInfo = null;
  let audioRetry = 0;
  let audioStartedAt = Date.now();
  let closed = false;
  const slot = { kind: 'audio', kill: function () { if (ffmpeg) killTree(ffmpeg); } };
  active.add(slot);

  function cleanup() {
    if (closed) return;
    closed = true;
    active.delete(slot);
    if (ffmpeg) killTree(ffmpeg);
    ffmpeg = null;
  }

  req.on('close', cleanup);
  res.on('close', cleanup);

  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Cache-Control': 'no-cache, no-store',
    'Access-Control-Allow-Origin': '*',
  });

  function attachAudio(info, seek) {
    if (closed) return;
    audioInfo = info;
    audioStartedAt = Date.now();
    ffmpeg = startAudio(info, seek);
    slot.kill = function () { if (ffmpeg) killTree(ffmpeg); };
    ffmpeg.stdout.pipe(res, { end: false });
    ffmpeg.stderr.on('data', function () {});
    ffmpeg.on('close', function (code) {
      if (closed) return;
      ffmpeg = null;
      if (code && audioRetry < 2 && audioInfo && audioInfo.id) {
        audioRetry++;
        const elapsed = Math.max(0, (Date.now() - audioStartedAt) / 1000);
        media.invalidateSource(audioInfo.id);
        media.resolveSource(input, quality).then(function (fresh) {
          attachAudio(fresh, (Number(seek) || 0) + elapsed - 0.25);
        }).catch(function () {
          try { res.end(); } catch (e0) {}
          cleanup();
        });
        return;
      }
      try { res.end(); } catch (e) {}
      cleanup();
    });
    ffmpeg.on('error', function () {
      try { res.end(); } catch (e) {}
      cleanup();
    });
  }

  media.resolveSource(input, quality).then(function (info) {
    attachAudio(info, start);
  }).catch(function () {
    try { res.status(500).end(); } catch (e) {}
    cleanup();
  });
}

function sendJson(ws, obj) {
  if (ws.readyState === 1) {
    try { ws.send(JSON.stringify(obj)); } catch (e) {}
  }
}

function sendStatus(ws, message) {
  sendJson(ws, { type: 'status', message: message });
}

module.exports = {
  activeCount,
  parseStart,
  attachWsStream,
  attachAudioStream,
};
