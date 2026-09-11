'use strict';

const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');

function env(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === null || v === '') return fallback;
  return v;
}

const PUBLIC_BASE = String(env('PUBLIC_BASE', '')).replace(/\/+$/, '');

function getCookiesFile() {
  const cookiesCandidates = [
    env('COOKIES_FILE', ''),
    path.join(ROOT, 'youtube-cookies.txt'),
    path.join(DATA_DIR, 'youtube-cookies.txt'),
  ].filter(Boolean);
  return cookiesCandidates.find(function (p) {
    try { return fs.existsSync(p) && fs.statSync(p).size > 20; } catch (e) { return false; }
  }) || '';
}

const COOKIES_FILE = getCookiesFile();

module.exports = {
  ROOT,
  PUBLIC_DIR,
  DATA_DIR,
  PORT: parseInt(env('PORT', '8742'), 10),
  BIND_HOST: env('BIND_HOST', '0.0.0.0'),
  PUBLIC_BASE,
  ACCESS_PIN: String(env('ACCESS_PIN', '')),
  ALLOWED_PINS: String(env('ALLOWED_PINS', env('ACCESS_PIN', '')))
    .split(/[,\s]+/)
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return /^\d{4,8}$/.test(s); }),
  MAX_STREAMS: Math.max(1, parseInt(env('MAX_STREAMS', '2'), 10) || 2),
  YT_DLP: env('YT_DLP', 'yt-dlp'),
  FFMPEG: env('FFMPEG', 'ffmpeg'),
  COOKIES_FILE,
  getCookiesFile,
  TWITCH_CLIENT_ID: env('TWITCH_CLIENT_ID', ''),
  TWITCH_CLIENT_SECRET: env('TWITCH_CLIENT_SECRET', ''),
  TWITCH_REDIRECT_URI: env(
    'TWITCH_REDIRECT_URI',
    'http://example.com/tv/api/twitch/callback'
  ),
  GOOGLE_CLIENT_ID: env('GOOGLE_CLIENT_ID', ''),
  GOOGLE_CLIENT_SECRET: env('GOOGLE_CLIENT_SECRET', ''),
  GOOGLE_API_KEY: env('GOOGLE_API_KEY', ''),
  GOOGLE_REDIRECT_URI: env(
    'GOOGLE_REDIRECT_URI',
    'http://example.com/tv/api/youtube/callback'
  ),
};
