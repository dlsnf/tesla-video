'use strict';

const favorites = require('./favorites');
const subscriptions = require('./subscriptions');
const history = require('./history');
const media = require('./media');

// Home recommendations for one PIN. A few subscribed channels and recent
// favorites only: scanning every subscription makes the home request too slow.
const SUB_CHANNELS = 5;
const FAV_SEEDS = 3;
const FAV_CHANNELS = 3;
const FAST_CHANNELS = 4;
const FAST_PAGE = 4;
const LONE_KEEP = 4;
const TAIL_EXTRA = 1;
const FETCH_CHANNEL = 30;
const KEEP_CHANNEL = 4;
const FETCH_SIMILAR = 12;
const KEEP_SIMILAR = 6;
const CHANNEL_MAX = 120;
const SIMILAR_MAX = 36;
const CACHE_MS = 10 * 60 * 1000;
const JOB_MS = 7000;
const BUDGET_MS = 12000;
const CONCURRENCY = 4;

const pools = new Map();
const building = new Map();

function channelOk(id) {
  const raw = String(id || '');
  return raw.indexOf('UC') === 0 && raw.length >= 20;
}

function videoOk(id) {
  return /^[a-zA-Z0-9_-]{6,32}$/.test(String(id || ''));
}

function suggestOk(id) {
  return /^[a-zA-Z0-9_-]{11}$/.test(String(id || ''));
}

function skipIds(favs, hist) {
  const skip = {};
  (favs || []).forEach(function (it) {
    if (it && it.id) skip[String(it.id)] = true;
  });
  (hist || []).forEach(function (it) {
    if (it && it.id) skip[String(it.id)] = true;
  });
  return skip;
}

function copyItem(it, reason) {
  const id = String(it.id);
  const uploaded = parseInt(it.uploaded, 10) || parseInt(it.ts, 10) || 0;
  const copy = {
    id: id,
    title: String(it.title || id).slice(0, 200),
    duration: parseInt(it.duration, 10) || 0,
    uploader: String(it.uploader || '').slice(0, 120),
    views: parseInt(it.views, 10) || 0,
    views_text: String(it.views_text || '').slice(0, 80),
    thumbnail: String(it.thumbnail || ('https://i.ytimg.com/vi/' + id + '/mqdefault.jpg')).slice(0, 400),
    url: String(it.url || ('https://www.youtube.com/watch?v=' + id)).slice(0, 300),
    channel_id: channelOk(it.channel_id) ? String(it.channel_id) : '',
    avatar: String(it.avatar || '').slice(0, 400),
    uploaded: uploaded,
    ts: parseInt(it.ts, 10) || uploaded,
    published: String(it.published || '').slice(0, 40),
    reason: String(reason || '').slice(0, 40),
  };
  if (it.members === true) copy.members = true;
  else if (it.members === false) copy.members = false;
  return copy;
}

function takeFresh(items, skip, seen, keep, reason) {
  const out = [];
  (items || []).forEach(function (it) {
    if (out.length >= keep) return;
    if (!it || !videoOk(it.id) || skip[it.id] || seen[it.id]) return;
    seen[it.id] = true;
    out.push(copyItem(it, reason));
  });
  return out;
}

function collectGroups(groups, skip, seen, keep) {
  return (groups || []).map(function (group) {
    return takeFresh(group && group.items, skip, seen, keep, group && group.reason);
  });
}

function roundRobin(groups) {
  const out = [];
  var round = 0;
  var more = true;
  while (more && round < 80) {
    more = false;
    for (var i = 0; i < groups.length; i++) {
      const row = groups[i];
      if (row && row[round]) {
        out.push(row[round]);
        more = true;
      }
    }
    round += 1;
  }
  return out;
}

// Two subscribed videos, then one similar video, then one favorite-channel video.
function zipHome(subs, similar, favChannels, limit) {
  const lanes = [subs || [], similar || [], favChannels || []];
  const pattern = [0, 0, 1, 2];
  const idx = [0, 0, 0];
  const out = [];
  var guard = 0;
  while (out.length < limit && guard < 500) {
    guard += 1;
    var progressed = false;
    for (var p = 0; p < pattern.length && out.length < limit; p++) {
      const lane = pattern[p];
      if (idx[lane] < lanes[lane].length) {
        out.push(lanes[lane][idx[lane]++]);
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return out;
}

function channelKey(it) {
  const id = it && it.channel_id;
  if (id && String(id).indexOf('UC') === 0) return 'c:' + id;
  const name = it && it.uploader;
  if (name) return 'u:' + name;
  return 'v:' + ((it && it.id) || '');
}

// One video per channel each turn. A channel that still has videos does not
// fill the rest of the page after the others run out; those wait for the next mix.
function balanceItems(items, opts) {
  opts = opts || {};
  const order = [];
  const buckets = {};
  (items || []).forEach(function (it) {
    if (!it) return;
    const key = channelKey(it);
    if (!buckets[key]) {
      buckets[key] = [];
      order.push(key);
    }
    buckets[key].push(it);
  });
  const out = [];
  const parked = [];
  const used = {};
  order.forEach(function (key) { used[key] = 0; });
  var guard = 0;
  while (guard++ < 500) {
    const alive = order.filter(function (key) { return buckets[key].length; });
    if (!alive.length) break;
    if (alive.length === 1) {
      const key = alive[0];
      var cap = buckets[key].length;
      if (order.length > 1) cap = TAIL_EXTRA;
      else if (opts.holdTail) cap = LONE_KEEP;
      var extra = 0;
      while (buckets[key].length && extra < cap) {
        out.push(buckets[key].shift());
        extra += 1;
      }
      while (buckets[key].length) parked.push(buckets[key].shift());
      break;
    }
    for (var i = 0; i < alive.length; i++) {
      const key = alive[i];
      var minUsed = used[alive[0]];
      for (var j = 1; j < alive.length; j++) minUsed = Math.min(minUsed, used[alive[j]]);
      if (used[key] > minUsed) continue;
      out.push(buckets[key].shift());
      used[key] += 1;
    }
  }
  order.forEach(function (key) {
    while (buckets[key].length) parked.push(buckets[key].shift());
  });
  return { out: out, parked: parked };
}

function mixHome(spec) {
  spec = spec || {};
  const skip = spec.skip || {};
  const seen = {};
  const keepChannel = spec.keepChannel || KEEP_CHANNEL;
  const subs = roundRobin(collectGroups(spec.subs, skip, seen, keepChannel));
  const similar = roundRobin(collectGroups(spec.similar, skip, seen, spec.keepSimilar || KEEP_SIMILAR));
  const favChannels = roundRobin(collectGroups(spec.favChannels, skip, seen, keepChannel));
  return zipHome(subs, similar, favChannels, spec.limit || 40);
}

function fingerprint(subs, favs) {
  const subPart = (subs || []).map(function (ch) { return (ch && ch.channel_id) || ''; }).join(',');
  const favPart = (favs || []).map(function (it) { return (it && it.id) || ''; }).join(',');
  return subPart + '#' + favPart;
}

function withTimeout(promise, ms) {
  return new Promise(function (resolve) {
    var settled = false;
    const timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      resolve(null);
    }, ms);
    Promise.resolve(promise).then(function (value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    }, function () {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(null);
    });
  });
}

function runJobs(jobs) {
  const slots = new Array(jobs.length);
  var next = 0;
  var pending = 0;
  var stop = false;
  if (!jobs.length) return Promise.resolve(slots);
  return new Promise(function (resolve) {
    const timer = setTimeout(function () {
      stop = true;
      resolve(slots);
    }, BUDGET_MS);
    function finish() {
      if (stop) return;
      if (next >= jobs.length && pending === 0) {
        clearTimeout(timer);
        stop = true;
        resolve(slots);
      }
    }
    function pump() {
      while (!stop && pending < CONCURRENCY && next < jobs.length) {
        const i = next++;
        pending += 1;
        withTimeout(jobs[i].run(), JOB_MS).then(function (value) {
          slots[i] = value;
          pending -= 1;
          pump();
          finish();
        });
      }
      finish();
    }
    pump();
  });
}

function interleave(lists) {
  const out = [];
  var round = 0;
  var more = true;
  while (more && round < 20) {
    more = false;
    for (var i = 0; i < lists.length; i++) {
      if (lists[i][round]) {
        out.push(lists[i][round]);
        more = true;
      }
    }
    round += 1;
  }
  return out;
}

function blankState(subs, favs) {
  const subChans = [];
  (subs || []).forEach(function (ch) {
    if (subChans.length >= SUB_CHANNELS) return;
    if (!ch || !channelOk(ch.channel_id)) return;
    subChans.push(ch);
  });
  const chosen = {};
  subChans.forEach(function (ch) { chosen[ch.channel_id] = true; });
  const subById = {};
  (subs || []).forEach(function (ch) {
    if (ch && channelOk(ch.channel_id)) subById[ch.channel_id] = ch;
  });
  const seeds = [];
  const favChans = [];
  const favSeen = {};
  (favs || []).forEach(function (it) {
    if (!it) return;
    if (seeds.length < FAV_SEEDS && suggestOk(it.id)) seeds.push(it);
    if (favChans.length >= FAV_CHANNELS) return;
    const cid = String(it.channel_id || '');
    if (!channelOk(cid) || chosen[cid] || favSeen[cid]) return;
    favSeen[cid] = true;
    const sub = subById[cid];
    favChans.push({
      channel_id: cid,
      name: (sub && sub.name) || it.uploader || '',
      reason: sub ? '구독 채널' : '즐겨찾기 채널',
    });
  });
  return {
    items: [],
    parked: [],
    subs: subChans.map(function (ch) {
      return { channel_id: ch.channel_id, name: ch.name || '', reason: '구독 채널', offset: 0, done: false, miss: 0, max: CHANNEL_MAX };
    }),
    similar: seeds.map(function (it) {
      return { id: it.id, reason: '즐겨찾기와 비슷한 영상', offset: 0, done: false, miss: 0, max: SIMILAR_MAX };
    }),
    favChannels: favChans.map(function (ch) {
      return { channel_id: ch.channel_id, name: ch.name || '', reason: ch.reason, offset: 0, done: false, miss: 0, max: CHANNEL_MAX };
    }),
    exhausted: false,
  };
}

function refreshExhausted(state) {
  function open(list) {
    return (list || []).some(function (src) { return src && !src.done; });
  }
  state.exhausted = !open(state.subs) && !open(state.similar) && !open(state.favChannels);
}

function noteFetch(src, payload, pageSize) {
  if (!payload) {
    src.miss = (src.miss || 0) + 1;
    if (src.miss >= 2) src.done = true;
    return [];
  }
  src.miss = 0;
  const list = payload.items || [];
  src.offset += list.length && list.length < pageSize ? list.length : pageSize;
  if (payload.more === false || src.offset >= src.max) src.done = true;
  else if (list.length < pageSize && payload.more !== true) src.done = true;
  return list;
}

function sourceFresh(src) {
  return src && !src.done && !src.fastPick && !(src.offset > 0);
}

function takeFast(state) {
  const pool = [];
  function add(list) {
    (list || []).forEach(function (src) {
      if (pool.length >= FAST_CHANNELS) return;
      if (!sourceFresh(src)) return;
      src.fastPick = true;
      pool.push(src);
    });
  }
  add(state.subs);
  if (pool.length < FAST_CHANNELS) add(state.favChannels);
  if (!pool.length) add(state.similar);
  return pool;
}

function hasRest(state) {
  function pending(list) {
    return (list || []).some(sourceFresh);
  }
  return pending(state.subs) || pending(state.favChannels) || pending(state.similar);
}

function jobsFor(state, mode) {
  mode = mode || 'more';
  if (mode === 'fast') takeFast(state);
  const subJobs = [];
  const similarJobs = [];
  const favJobs = [];
  function accept(src) {
    if (!src || src.done) return false;
    if (mode === 'fast') return src.fastPick && !(src.offset > 0);
    if (mode === 'rest') return sourceFresh(src);
    return true;
  }
  function addChannel(src, kind, bucket) {
    if (!accept(src)) return;
    const page = mode === 'fast' ? FAST_PAGE : FETCH_CHANNEL;
    const fast = mode === 'fast';
    bucket.push({
      kind: kind,
      reason: src.reason,
      src: src,
      pageSize: page,
      run: function () {
        return media.youtubeChannelVideos(src.channel_id, page, src.name, src.offset, fast ? { fast: true } : {})
          .then(function (items) {
            const list = items || [];
            return { items: list, more: fast && list.length ? true : undefined };
          });
      },
    });
  }
  state.subs.forEach(function (src) { addChannel(src, 'sub', subJobs); });
  state.favChannels.forEach(function (src) { addChannel(src, 'favch', favJobs); });
  state.similar.forEach(function (src) {
    if (!accept(src)) return;
    const page = mode === 'fast' ? FAST_PAGE : FETCH_SIMILAR;
    similarJobs.push({
      kind: 'similar',
      reason: src.reason,
      src: src,
      pageSize: page,
      run: function () {
        return media.youtubeSuggestions(src.id, page, src.offset).then(function (pageOut) {
          return { items: (pageOut && pageOut.items) || [], more: !!(pageOut && pageOut.more) };
        });
      },
    });
  });
  return interleave([subJobs, similarJobs, favJobs]);
}

async function extend(state, skip, mode) {
  refreshExhausted(state);
  if (state.exhausted) return 0;
  const jobs = jobsFor(state, mode);
  if (!jobs.length) {
    if (mode !== 'fast' && mode !== 'rest') state.exhausted = true;
    return 0;
  }
  const slots = await runJobs(jobs);
  const grouped = { sub: [], similar: [], favch: [] };
  slots.forEach(function (payload, i) {
    const job = jobs[i];
    if (!job) return;
    const list = noteFetch(job.src, payload, job.pageSize);
    if (list.length) grouped[job.kind].push({ reason: job.reason, items: list });
  });
  refreshExhausted(state);
  const skipNow = {};
  Object.keys(skip || {}).forEach(function (id) { skipNow[id] = true; });
  state.items.forEach(function (it) { if (it && it.id) skipNow[it.id] = true; });
  const extra = mixHome({
    subs: grouped.sub,
    similar: grouped.similar,
    favChannels: grouped.favch,
    skip: skipNow,
    keepChannel: FETCH_CHANNEL,
    keepSimilar: FETCH_SIMILAR,
    limit: 400,
  });
  const added = pushBalanced(state, extra, mode === 'fast' || hasRest(state));
  console.log('[tesla-video home] custom ' + (mode || 'more') + ' added=' + added + ' total=' + state.items.length);
  return added;
}

function pushBalanced(state, incoming, holdTail) {
  const batch = (state.parked || []).concat(incoming || []);
  state.parked = [];
  if (!batch.length) return 0;
  const balanced = balanceItems(batch, { holdTail: !!holdTail });
  balanced.out.forEach(function (it) { state.items.push(it); });
  state.parked = balanced.parked;
  return balanced.out.length;
}

function visibleItems(state, skip) {
  return state.items.filter(function (it) { return it && it.id && !skip[it.id]; });
}

async function ensure(state, need, skip) {
  var guard = 0;
  while (guard < 4 && !state.exhausted && visibleItems(state, skip).length < need) {
    guard += 1;
    const added = await extend(state, skip, 'more');
    if (added) continue;
    if (state.parked && state.parked.length && !hasRest(state)) {
      if (!pushBalanced(state, [], false)) break;
      continue;
    }
    break;
  }
}

function readState(key) {
  const hit = pools.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_MS || !hit.state || !hit.state.items) {
    pools.delete(key);
    return null;
  }
  return hit.state;
}

function saveState(key, state) {
  pools.set(key, { ts: Date.now(), state: state });
}

function enqueue(key, fn) {
  const prev = building.get(key) || Promise.resolve();
  const task = prev.then(fn, fn);
  building.set(key, task);
  const done = task.then(function (value) {
    if (building.get(key) === task) building.delete(key);
    return value;
  }, function (err) {
    if (building.get(key) === task) building.delete(key);
    throw err;
  });
  return done;
}

function scheduleWarm(key, pin) {
  enqueue(key, async function () {
    const state = readState(key);
    if (!state || !hasRest(state)) return null;
    const skip = skipIds(favorites.read(pin), history.read(pin));
    await extend(state, skip, 'rest');
    saveState(key, state);
    return null;
  }).catch(function () {});
}

function pageFrom(state, skip, off, n, touchWarm) {
  refreshExhausted(state);
  const visible = visibleItems(state, skip);
  const items = visible.slice(off, off + n);
  const needsWarm = !state.warming && hasRest(state);
  if (touchWarm && needsWarm) state.warming = true;
  return {
    items: items,
    more: visible.length > off + n || !state.exhausted || !!((state.parked || []).length),
    needsWarm: needsWarm,
    empty: !items.length && off === 0,
  };
}

// null tells /api/youtube/home to use the Korea popular chart.
async function home(pin, limit, offset, opts) {
  try {
    if (!pin) return null;
    opts = opts || {};
    const subs = subscriptions.readDecorated(pin);
    const favs = favorites.read(pin);
    if (!subs.length && !favs.length) return null;
    const n = Math.min(Math.max(parseInt(limit, 10) || 16, 1), 40);
    const off = Math.max(0, parseInt(offset, 10) || 0);
    const key = String(pin) + '|' + fingerprint(subs, favs);
    const skip = skipIds(favs, history.read(pin));
    if (opts.stats) {
      const cached = readState(key);
      if (cached) {
        const peeked = pageFrom(cached, skip, off, n, false);
        if (!peeked.empty) return { items: peeked.items, more: peeked.more };
      }
    }
    const page = await enqueue(key, async function () {
      var state = readState(key);
      if (!state) state = blankState(subs, favs);
      const liveSkip = skipIds(favs, history.read(pin));
      var visible = visibleItems(state, liveSkip);
      if (off === 0 && visible.length < n) {
        await extend(state, liveSkip, 'fast');
        visible = visibleItems(state, liveSkip);
        if (!visible.length && !state.exhausted) await extend(state, liveSkip, 'fast');
      } else if (visible.length < off + n) {
        await ensure(state, off + n, liveSkip);
      }
      const built = pageFrom(state, liveSkip, off, n, true);
      if (built.empty) {
        pools.delete(key);
        return null;
      }
      saveState(key, state);
      return { items: built.items, more: built.more, needsWarm: built.needsWarm };
    });
    if (page && page.needsWarm && !opts.stats) scheduleWarm(key, pin);
    return page;
  } catch (e) {
    return null;
  }
}

module.exports = {
  home,
  mixHome,
  balanceItems,
  noteFetch,
  channelOk,
  videoOk,
};
