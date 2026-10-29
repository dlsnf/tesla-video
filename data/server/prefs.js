'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');
const favorites = require('./favorites');

const DIR = path.join(config.DATA_DIR, 'prefs');

function fileFor(pin) {
  return path.join(DIR, String(pin) + '.json');
}

function clampVolume(v) {
  var n = parseInt(v, 10);
  if (n !== n) return null;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function read(pin) {
  var prefs = { autoplayNext: false, autoQuality: false, volume: 100 };
  if (!favorites.validPin(pin)) return prefs;
  try {
    var raw = JSON.parse(fs.readFileSync(fileFor(pin), 'utf8'));
    if (raw && raw.autoplayNext) prefs.autoplayNext = true;
    if (raw && raw.autoQuality === true) prefs.autoQuality = true;
    var volume = raw && clampVolume(raw.volume);
    if (volume != null) prefs.volume = volume;
  } catch (e) {}
  return prefs;
}

function write(pin, body) {
  var prefs = read(pin);
  if (!favorites.validPin(pin)) return prefs;
  if (body && Object.prototype.hasOwnProperty.call(body, 'autoplayNext')) prefs.autoplayNext = !!body.autoplayNext;
  if (body && Object.prototype.hasOwnProperty.call(body, 'autoQuality')) prefs.autoQuality = !!body.autoQuality;
  if (body && body.volume != null && body.volume !== '') {
    var volume = clampVolume(body.volume);
    if (volume != null) prefs.volume = volume;
  }
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(fileFor(pin), JSON.stringify(prefs));
  return prefs;
}

module.exports = { read: read, write: write };
