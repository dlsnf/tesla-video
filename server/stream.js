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
  return spawn(config.FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'] });
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

function startYoutubePipe(info, start) {
  var tmp = '';
  if (info.dumpJson) {
    tmp = path.join(os.tmpdir(), 'yt-' + Date.now() + '-' + Math.random().toString(16).slice(2) + '.json');
    fs.writeFileSync(tmp, JSON.stringify(media.stripBrokenFormats(info.dumpJson)));
  }
  const extra = [
    '-f', '134+140/135+140/160+139/bestvideo[height<=360]+bestaudio/bestvideo+bestaudio',
    '--merge-output-format', 'mkv',
    '--no-part',
    '--no-progress',
    '-o', '-',
  ];
  const s = parseStart(start);
  if (!info.isLive && s > 2) extra.push('--download-sections', '*' + Math.floor(s) + '-inf');
  var dlArgs;
  if (tmp) {
    extra.unshift('--load-info-json', tmp);
    dlArgs = extra.slice();
    dlArgs.unshift(
      '--force-ipv4',
      '--no-warnings',
      '--js-runtimes', 'node:' + process.execPath,
      '--extractor-args', 'youtube:player_client=default'
    );
  } else {
    extra.push(info.pageUrl || ('https://www.youtube.com/watch?v=' + (info.id || '')));
    dlArgs = media.ytdlpArgs(extra, { client: 'default', cookies: false, ignoreErrors: false });
  }
  const ytdlp = spawn(config.YT_DLP, dlArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
  swallowErr(ytdlp.stdout);
  swallowErr(ytdlp.stderr);
  function dropTmp() { if (tmp) try { fs.unlinkSync(tmp); } catch (e) {} }
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
    dropTmp();
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
      '-fflags', '+genpts',
      '-i', 'pipe:0',
    ];
    Array.prototype.push.apply(ffArgs, encodeTs(info));
    ffmpeg = spawn(config.FFMPEG, ffArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
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
  if (!opts.noRate) a.push('-readrate', isLive ? '1.0' : '1.1');
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

function startYoutubeSeek(info, start) {
  var dump = info.dumpJson ? media.stripBrokenFormats(info.dumpJson) : null;
  var v = pickDumpFormat(dump, ['134', '135', '160', '133', '243', '244']);
  var a = pickDumpFormat(dump, ['140', '139', '251', '250', '249']);
  if (!v || !a || !v.url || !a.url) return null;
  var s = String(Math.floor(start));
  var args = ['-hide_banner', '-loglevel', 'warning', '-ss', s];
  Array.prototype.push.apply(args, netInput(v.url, 0, false, v.http_headers, { noRate: true }));
  args.push('-ss', s);
  Array.prototype.push.apply(args, netInput(a.url, 0, false, a.http_headers, { noRate: true }));
  args.push('-map', '0:v:0', '-map', '1:a:0');
  Array.prototype.push.apply(args, encodeTs(info));
  return spawnFfmpeg(args);
}

function encodeTs(info) {
  return [
    '-fflags', '+genpts',
    '-avoid_negative_ts', 'make_zero',
    '-c:v', 'mpeg1video',
    '-pix_fmt', 'yuv420p',
    '-q:v', '5',
    '-b:v', info.bitrate || '1000k',
    '-bf', '0',
    '-vf', 'fps=' + (info.fps === 30 ? 30 : 24) + ',scale=' + (info.scale || '640:360') + ':flags=fast_bilinear,setsar=1,setpts=PTS-STARTPTS',
    '-af', 'aresample=44100:first_pts=0,asetpts=PTS-STARTPTS',
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

function startVideo(info, start) {
  if (info.type === 'test') return startTestVideo(info);
  if (info.type === 'youtube') return startYoutubePipe(info, start);
  const sk = seekParts(start, info.isLive);
  const args = ['-hide_banner', '-loglevel', 'warning', '-fflags', '+genpts'];
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
  Array.prototype.push.apply(args, encodeTs(info));
  return spawnFfmpeg(args);
}

function startAudio(info, start) {
  if (info.type === 'test') return startTestAudio();
  const args = ffmpegInputPrefix(start, info.isLive).concat([
    '-user_agent', YT_UA,
    '-referer', 'https://www.youtube.com/',
    '-i', info.audioUrl,
    '-vn',
    '-fflags', 'nobuffer',
    '-flags', 'low_delay',
    '-analyzeduration', '0',
    '-probesize', '32',
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
    ffmpeg = startVideo(info, start);
    slot.kill = function () { killProc(ffmpeg); };

    var pending = [];
    var pendingBytes = 0;
    var mpegSent = 0;
    var errBuf = '';
    var SEND_CAP = 256 * 1024;
    var PENDING_CAP = 256 * 1024;
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
      var take = pendingBytes > 32 * 1024 ? 32 * 1024 : pendingBytes;
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
    flushTimer = setInterval(flushWs, 70);
    slot.kill = function () { if (flushTimer) clearInterval(flushTimer); killProc(ffmpeg); };

    function bindMpeg(cur) {
      if (!cur) return;
      swallowErr(cur.stdout);
      swallowErr(cur.stderr);
      if (cur.stdin) swallowErr(cur.stdin);
      cur.stdout.on('data', function (chunk) {
        mpegSent += chunk.length;
        pending.push(chunk);
        pendingBytes += chunk.length;
        if (pendingBytes >= PENDING_CAP) pauseOut();
        if (pendingBytes >= 32 * 1024) flushWs();
      });
      cur.stderr.on('data', function (d) {
        errBuf += d.toString();
        if (errBuf.length > 1200) errBuf = errBuf.slice(-600);
      });
      if (cur._buddy && cur._buddy.stderr) {
        swallowErr(cur._buddy.stderr);
        swallowErr(cur._buddy.stdout);
        cur._buddy.stderr.on('data', function (d) {
          var s = d.toString().replace(/\s+/g, ' ').trim();
          if (s) {
            errBuf += ' ' + s;
            if (errBuf.length > 1200) errBuf = errBuf.slice(-600);
            sendStatus(ws, s.slice(-180));
          }
        });
      }
      function closeAfterDrain(message) {
        clientHold = false;
        var deadline = Date.now() + 3000;
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
        if (mpegSent < 8000 && encodeAttempt < 2) {
          encodeAttempt += 1;
          try { media.invalidateSource(info && info.id); } catch (eInv) {}
          sendStatus(ws, parseStart(start) > 2 ? '지정한 위치부터 다시 받는 중...' : '다시 연결하는 중...');
          media.resolveSource(input, quality).then(function (fresh) {
            if (closed) return;
            info = fresh;
            info.fps = extra && extra.fps === 30 ? 30 : 24;
            info.bitrate = media.bitrateForQuality(quality, !!(extra && extra.low));
            mpegSent = 0;
            errBuf = '';
            pending = [];
            pendingBytes = 0;
            ffmpeg = startVideo(info, start);
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
        } else if (!code) {
          closeAfterDrain({ type: 'ended' });
          return;
        }
        else {
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
  if (activeCount() > config.MAX_STREAMS) {
    res.status(429).end();
    return;
  }

  let ffmpeg = null;
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

  media.resolveSource(input, quality).then(function (info) {
    if (closed) return;
    ffmpeg = startAudio(info, start);
    slot.kill = function () { if (ffmpeg) killTree(ffmpeg); };
    ffmpeg.stdout.pipe(res);
    ffmpeg.stderr.on('data', function () {});
    ffmpeg.on('close', function () {
      try { res.end(); } catch (e) {}
      cleanup();
    });
    ffmpeg.on('error', function () {
      try { res.end(); } catch (e) {}
      cleanup();
    });
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
