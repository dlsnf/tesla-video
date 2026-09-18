'use strict';

const { spawn } = require('child_process');

function run(cmd, args, opts) {
  opts = opts || {};
  const timeoutMs = opts.timeout || 25000;
  return new Promise(function (resolve, reject) {
    const child = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let out = Buffer.alloc(0);
    let err = Buffer.alloc(0);
    let done = false;

    const timer = setTimeout(function () {
      if (done) return;
      done = true;
      try { child.kill('SIGKILL'); } catch (e) {}
      reject(new Error(cmd + ' timeout'));
    }, timeoutMs);

    child.stdout.on('data', function (d) { out = Buffer.concat([out, d]); });
    child.stderr.on('data', function (d) { err = Buffer.concat([err, d]); });
    child.on('error', function (e) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', function (code) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const stdout = out.toString('utf8');
      const stderr = err.toString('utf8');
      if (code === 0 || stdout.trim()) {
        resolve({ stdout: stdout, stderr: stderr, code: code });
        return;
      }
      const msg = stderr.replace(/Deprecated Feature:[\s\S]*?(?=\n[A-Z]|\n$|$)/g, '').trim()
        || stderr.trim().slice(0, 400)
        || (cmd + ' exit ' + code);
      reject(Object.assign(new Error(msg.slice(0, 400)), {
        stdout: stdout,
        stderr: stderr,
        code: code,
      }));
    });
  });
}

function killTree(child) {
  if (!child || !child.pid) return;
  var pid = child.pid;
  try {
    process.kill(-pid, 'SIGKILL');
  } catch (eGroup) {}
  try {
    var killer = spawn('pkill', ['-9', '-P', String(pid)], { stdio: 'ignore' });
    killer.on('error', function () {});
    if (killer.unref) killer.unref();
  } catch (e0) {}
  try { child.kill('SIGKILL'); } catch (e1) {}
  try { process.kill(pid, 'SIGKILL'); } catch (e2) {}
}

module.exports = { run, killTree };
