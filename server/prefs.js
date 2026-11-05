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

function cleanSearches(list) {
  var out = [];
  var seen = {};
  if (!list || !list.length) return out;
  for (var i = 0; i < list.length; i++) {
    var q = String(list[i] || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!q) continue;
    var key = q.toLowerCase();
    if (seen[key]) continue;
    seen[key] = 1;
    out.push(q);
    if (out.length >= 12) break;
  }
  return out;
}

function read(pin) {
  var prefs = { autoplayNext: false, autoQuality: false, volume: 100, searchHistory: true, recentSearches: [], searchRev: 0 };
  if (!favorites.validPin(pin)) return prefs;
  try {
    var raw = JSON.parse(fs.readFileSync(fileFor(pin), 'utf8'));
    if (raw && raw.autoplayNext) prefs.autoplayNext = true;
    if (raw && raw.autoQuality === true) prefs.autoQuality = true;
    if (raw && raw.searchHistory === false) prefs.searchHistory = false;
    if (prefs.searchHistory && raw && raw.recentSearches) prefs.recentSearches = cleanSearches(raw.recentSearches);
    var rev = raw && parseInt(raw.searchRev, 10);
    if (rev === rev && rev > 0) prefs.searchRev = rev;
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
  var rev = 0;
  var haveRev = false;
  if (body && body.searchRev != null && body.searchRev !== '') {
    rev = parseInt(body.searchRev, 10);
    haveRev = rev === rev && rev > 0;
  }
  var currentRev = prefs.searchRev || 0;
  var accept = !haveRev || rev >= currentRev;
  if (accept) {
    if (body && Object.prototype.hasOwnProperty.call(body, 'searchHistory')) prefs.searchHistory = !!body.searchHistory;
    if (body && Array.isArray(body.recentSearches)) prefs.recentSearches = cleanSearches(body.recentSearches);
    if (haveRev) prefs.searchRev = rev;
  }
  if (!prefs.searchHistory) prefs.recentSearches = [];
  if (body && body.volume != null && body.volume !== '') {
    var volume = clampVolume(body.volume);
    if (volume != null) prefs.volume = volume;
  }
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(fileFor(pin), JSON.stringify(prefs));
  return prefs;
}

module.exports = { read: read, write: write };
