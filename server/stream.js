'use strict';

const { spawn } = require('child_process');
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

function parseStart(v) {
  const n = parseFloat(v);
  if (!isFinite(n) || n < 0) return 0;
  return Math.min(n, 12 * 3600);
}

function spawnFfmpeg(args) {
  return spawn(config.FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'] });
}

function ffmpegInputPrefix(start, isLive) {
  const args = [
    '-hide_banner', '-loglevel', 'error',
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '30',
  ];
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

function netInput(url, coarse, isLive) {
  const a = [
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '30',
    '-thread_queue_size', '1024',
    '-user_agent', YT_UA,
    '-referer', 'https://www.youtube.com/',
  ];
  if (!isLive && coarse > 0) a.push('-ss', String(coarse));
  a.push('-readrate', isLive ? '1.0' : '1.1');
  a.push('-i', url);
  return a;
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
  const sk = seekParts(start, info.isLive);
  const args = ['-hide_banner', '-loglevel', 'warning', '-fflags', '+genpts'];
  if (info.audioUrl && info.audioUrl !== info.videoUrl) {
    Array.prototype.push.apply(args, netInput(info.videoUrl, sk.coarse, info.isLive));
    Array.prototype.push.apply(args, netInput(info.audioUrl, sk.coarse, info.isLive));
    if (sk.fine > 0) args.push('-ss', String(sk.fine));
    args.push('-map', '0:v:0', '-map', '1:a:0');
  } else {
    Array.prototype.push.apply(args, netInput(info.videoUrl, sk.coarse, info.isLive));
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
  if (activeCount() >= config.MAX_STREAMS) {
    ws.send(JSON.stringify({ type: 'error', message: '동시 재생 한도(' + config.MAX_STREAMS + ')를 초과했습니다' }));
    ws.close();
    return;
  }

  let ffmpeg = null;
  let closed = false;
  let flushTimer = null;
  let clientHold = false;
  let flushWs = function () {};
  const slot = { kind: 'video', kill: function () { if (ffmpeg) killTree(ffmpeg); } };
  active.add(slot);

  function cleanup() {
    if (closed) return;
    closed = true;
    if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
    active.delete(slot);
    if (ffmpeg) killTree(ffmpeg);
    ffmpeg = null;
  }

  ws.on('close', cleanup);
  ws.on('error', cleanup);
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

  media.resolveSource(input, quality).then(function (info) {
    if (closed) return;
    sendJson(ws, { type: 'meta', title: info.title, duration: info.duration, isLive: info.isLive, id: info.id });
    sendStatus(ws, 'MPEG1 스트림 시작...');
    info.fps = extra && extra.fps === 30 ? 30 : 24;
    info.bitrate = media.bitrateForQuality(quality, !!(extra && extra.low));
    ffmpeg = startVideo(info, start);
    slot.kill = function () { if (ffmpeg) killTree(ffmpeg); };

    var pending = [];
    var pendingBytes = 0;
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
    slot.kill = function () { if (flushTimer) clearInterval(flushTimer); if (ffmpeg) killTree(ffmpeg); };

    ffmpeg.stdout.on('data', function (chunk) {
      pending.push(chunk);
      pendingBytes += chunk.length;
      if (pendingBytes >= PENDING_CAP) pauseOut();
      if (pendingBytes >= 32 * 1024) flushWs();
    });
    ffmpeg.stderr.on('data', function (d) {
      errBuf += d.toString();
      if (errBuf.length > 1200) errBuf = errBuf.slice(-600);
    });
    ffmpeg.on('close', function (code) {
      if (!closed) {
        var msg = '스트림 종료 (' + code + ')';
        if (code && errBuf) msg += ' ' + errBuf.replace(/\s+/g, ' ').slice(0, 140);
        sendJson(ws, { type: 'status', message: msg });
        try { ws.close(); } catch (e) {}
      }
      cleanup();
    });
    ffmpeg.on('error', function (e) {
      sendJson(ws, { type: 'error', message: e.message.slice(0, 120) });
      cleanup();
    });
  }).catch(function (e) {
    sendJson(ws, { type: 'error', message: e.message.slice(0, 180) });
    try { ws.close(); } catch (err) {}
    cleanup();
  });
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
