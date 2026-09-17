'use strict';

const https = require('https');
const config = require('./config');

function httpsRequest(options, body) {
  return new Promise(function (resolve, reject) {
    const req = https.request(options, function (res) {
      let data = '';
      res.on('data', function (c) { data += c; });
      res.on('end', function () { resolve({ status: res.statusCode, body: data }); });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function loginUrl() {
  return 'https://id.twitch.tv/oauth2/authorize'
    + '?client_id=' + encodeURIComponent(config.TWITCH_CLIENT_ID)
    + '&redirect_uri=' + encodeURIComponent(config.TWITCH_REDIRECT_URI)
    + '&response_type=code'
    + '&scope=user:read:follows';
}

async function exchangeCode(code) {
  const body = 'client_id=' + encodeURIComponent(config.TWITCH_CLIENT_ID)
    + '&client_secret=' + encodeURIComponent(config.TWITCH_CLIENT_SECRET)
    + '&code=' + encodeURIComponent(code)
    + '&grant_type=authorization_code'
    + '&redirect_uri=' + encodeURIComponent(config.TWITCH_REDIRECT_URI);
  const res = await httpsRequest({
    hostname: 'id.twitch.tv',
    method: 'POST',
    path: '/oauth2/token',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }, body);
  return JSON.parse(res.body);
}

function helix(path, token) {
  return httpsRequest({
    hostname: 'api.twitch.tv',
    method: 'GET',
    path: path,
    headers: {
      'Client-ID': config.TWITCH_CLIENT_ID,
      'Authorization': 'Bearer ' + token,
    },
  });
}

async function followedChannels(token) {
  const userRes = await helix('/helix/users', token);
  const user = JSON.parse(userRes.body);
  if (!user.data || !user.data[0]) throw new Error('No user');
  const userId = user.data[0].id;
  const folRes = await helix('/helix/channels/followed?user_id=' + userId + '&first=100', token);
  const follows = JSON.parse(folRes.body);
  const channels = (follows.data || []).map(function (f) {
    return f.broadcaster_login || (f.broadcaster_name ? String(f.broadcaster_name).toLowerCase() : null);
  }).filter(Boolean);
  return { ok: true, channels: channels, total: follows.total || channels.length };
}

module.exports = { loginUrl, exchangeCode, followedChannels };
