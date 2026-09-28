'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');
const favorites = require('./favorites');

const DIR = path.join(config.DATA_DIR, 'prefs');

function fileFor(pin) {
  return path.join(DIR, String(pin) + '.json');
}

function read(pin) {
  var prefs = { autoplayNext: false };
  if (!favorites.validPin(pin)) return prefs;
  try {
    var raw = JSON.parse(fs.readFileSync(fileFor(pin), 'utf8'));
    if (raw && raw.autoplayNext) prefs.autoplayNext = true;
  } catch (e) {}
  return prefs;
}

function write(pin, body) {
  var prefs = { autoplayNext: !!(body && body.autoplayNext) };
  if (!favorites.validPin(pin)) return prefs;
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(fileFor(pin), JSON.stringify(prefs));
  return prefs;
}

module.exports = { read: read, write: write };
