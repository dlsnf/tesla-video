(function () {
  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage'), na = $('na'), st = $('st'), list = $('list');
  var player = null, playing = null, quality = 360, fps = 24, vbrLow = true, startAt = 0;
  var duration = 0, isLive = false, clock0 = 0, fpsCount = 0, lastFps = 0;
  var bufEnd = 0;
  var paused = false, tickTimer = null, syncTimer = null, forceTimer = null, audioTimer = null;
  var pausePos = -1;
  var pauseHeard = 0;
  var pauseUnread = -1;
  var resumeAt = 0;
  var lastHeard = 0;
  var resumeHeard = 0;
  var resumePending = false;
  var resumeSyncTimer = null;
  var AUDIO_QUEUE_SEC = 3.5;
  var PREROLL_SEC = 1.5;
  var bufTarget = 10;
  var VIDEO_CATCH_FRAMES = 2;
  var prerolling = false;
  var prerollAt = 0;
  var rebuffering = false;
  var netBytes = 0;
  var pauseNet0 = -1;
  var streamHeld = false;
  var needStreamRestart = false;
  var overflowFails = 0;
  var videoFail = 0;
  var ended = false;
  var streamEnded = false;
  var audioMediaCursor = 0;
  var videoShownAt = 0;
  var videoFrames = 0;
  var seeking = false;
  var seekPick = 0;
  var seekTouch = false;
  var seekSent = 0;
  var lastSyncRestart = 0;
  var videoCatching = false;
  var useHttpAudio = false, videoStartWall = 0;
  var fsOn = false, tapHide = null;
  var soundUnlockBound = false, soundResyncing = false, wantSoundHint = false;
  var currentFeed = 'home';
  var videoAr = 16 / 9;
  var favIds = {};
  var subIds = {};
  var lastItems = [];
  var lastChannels = [];
  var lastQuery = '';
  var lastSearchItems = [];
  var lastSearchChannels = [];
  var watchItem = null;
  var watchChannel = null;
  var libRaw = [];
  var libFilter = '';
  var libVidFilter = '';
  var libSort = 'new';
  var libEmpty = '결과 없음';
  var currentPin = '';
  var subList = [];
  var selectedCh = '';
  var restoreCh = '';
  var pendingScroll = 0;
  var relatedTimer = null;
  var pager = { mode: '', q: '', id: '', name: '', offset: 0, more: false, busy: false };
  var chAvatarMap = {};
  var hydrateTimer = null;
  var reqSeq = 0;
  var subPending = {};
  var subWant = {};
  var subTapAt = {};

  function beginReq() { return ++reqSeq; }
  function stillReq(seq) { return seq === reqSeq; }

  function setStatus(t) { if (st) st.textContent = t; }

  function qsVal(name) {
    var raw = String(window.location.search || '');
    if (raw.charAt(0) === '?') raw = raw.substring(1);
    if (!raw && String(window.location.hash || '').indexOf('?') >= 0) {
      raw = window.location.hash.substring(window.location.hash.indexOf('?') + 1);
    }
    var p = raw.split('&');
    for (var i = 0; i < p.length; i++) {
      var kv = p[i].split('=');
      if (kv[0] === name) {
        try { return decodeURIComponent((kv[1] || '').replace(/\+/g, ' ')); }
        catch (e) { return kv[1] || ''; }
      }
    }
    return '';
  }

  function rememberWatch(id, url) {
    var rec = { v: id || '', url: url || '', ts: Date.now() };
    try { sessionStorage.setItem('tv_watch', JSON.stringify(rec)); } catch (e) {}
    try { localStorage.setItem('tv_watch', JSON.stringify(rec)); } catch (e2) {}
  }

  function readWatch() {
    var v = qsVal('v');
    var u = qsVal('url');
    if (v || u) {
      rememberWatch(v, u);
      return { v: v, url: u };
    }
    var rec = null;
    try { rec = JSON.parse(sessionStorage.getItem('tv_watch') || 'null'); } catch (e) {}
    if (!rec) {
      try { rec = JSON.parse(localStorage.getItem('tv_watch') || 'null'); } catch (e2) {}
    }
    return rec || { v: '', url: '' };
  }

  function historyGet() {
    try { return JSON.parse(localStorage.getItem('tv_hist') || '[]'); } catch (e) { return []; }
  }
  function historyAdd(item) {
    var h = historyGet().filter(function (x) { return x.id !== item.id; });
    h.unshift(item);
    localStorage.setItem('tv_hist', JSON.stringify(h.slice(0, 24)));
  }

  function looksLikeUrl(s) {
    return /youtube\.com|youtu\.be|twitch\.tv|^https?:\/\//i.test(s) || /^[a-zA-Z0-9_-]{11}$/.test(s.trim());
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function clearSearchBox() {
    lastQuery = '';
    if ($('q')) $('q').value = '';
    if ($('qWatch')) $('qWatch').value = '';
  }

  function saveBrowseState() {
    if (stage) return;
    try {
      localStorage.setItem('tv_browse', JSON.stringify({
        feed: currentFeed || 'home',
        q: currentFeed === 'search' ? (lastQuery || (($('q') && $('q').value) || '')) : '',
        selectedCh: selectedCh || '',
        scroll: window.scrollY || 0,
        ts: Date.now()
      }));
    } catch (e) {}
  }

  function readBrowseState() {
    try { return JSON.parse(localStorage.getItem('tv_browse') || 'null'); } catch (e) { return null; }
  }

  function maybeScroll() {
    if (!pendingScroll) return;
    var y = pendingScroll;
    pendingScroll = 0;
    setTimeout(function () { try { window.scrollTo(0, y); } catch (e) {} }, 80);
  }

  function restoreBrowse() {
    if (qsVal('home') === '1') {
      try { history.replaceState({}, '', tv.url('/player/')); } catch (e) {}
      loadHome();
      return;
    }
    var st = readBrowseState();
    if (!st || !st.feed) { loadHome(); return; }
    pendingScroll = parseInt(st.scroll, 10) || 0;
    if (st.feed === 'subs') {
      restoreCh = st.selectedCh || '';
      loadSubs();
    } else if (st.feed === 'favs') loadFavs();
    else if (st.feed === 'music') search('음악 공식 뮤직비디오', 'music');
    else if (st.feed === 'game') search('게임 실황', 'game');
    else if (st.feed === 'news') search('뉴스 헤드라인', 'news');
    else if (st.feed === 'search' && st.q) {
      if ($('q')) $('q').value = st.q;
      search(st.q, 'search');
    } else loadHome();
  }

  function looksAv(url) {
    return /ggpht|googleusercontent|yt3\./i.test(String(url || ''));
  }

  function cleanName(s) {
    s = String(s || '').trim();
    if (!s || s === 'NA' || s === 'NaN' || s === 'None' || s === 'null') return '';
    return s;
  }

  function rememberAvatars(arr) {
    (arr || []).forEach(function (it) {
      if (!it) return;
      var id = it.channel_id;
      var av = it.avatar || it.thumbnail;
      if (id && looksAv(av)) chAvatarMap[id] = av;
    });
  }

  function avatarFor(it) {
    if (!it) return '';
    if (looksAv(it.avatar)) return it.avatar;
    if (it.channel_id && chAvatarMap[it.channel_id]) return chAvatarMap[it.channel_id];
    if (it.channel_id && subIds[it.channel_id] && looksAv(subIds[it.channel_id].thumbnail || subIds[it.channel_id].avatar)) {
      return subIds[it.channel_id].avatar || subIds[it.channel_id].thumbnail;
    }
    return '';
  }

  function applyAvatarNode(el, url, name) {
    if (!el || !url) return;
    el.innerHTML = avatarInner(url, name || el.getAttribute('data-chname') || '?');
  }

  function hydrateAvatars() {
    if (hydrateTimer) clearTimeout(hydrateTimer);
    hydrateTimer = setTimeout(function () {
      hydrateTimer = null;
      var nodes = document.querySelectorAll('[data-chid]');
      var ids = [];
      var seen = {};
      for (var i = 0; i < nodes.length; i++) {
        var id = nodes[i].getAttribute('data-chid');
        if (!id || seen[id]) continue;
        if (chAvatarMap[id]) {
          applyAvatarNode(nodes[i], chAvatarMap[id], nodes[i].getAttribute('data-chname') || '');
          seen[id] = true;
          continue;
        }
        if (nodes[i].getElementsByTagName('img').length) continue;
        seen[id] = true;
        ids.push(id);
      }
      if (!ids.length) return;
      tv.get('/api/youtube/avatars?ids=' + encodeURIComponent(ids.slice(0, 12).join(',')), function (code, data) {
        if (!data || !data.ok || !data.avatars) return;
        Object.keys(data.avatars).forEach(function (cid) {
          var rec = data.avatars[cid];
          var url = rec && (rec.avatar || rec.thumbnail);
          if (!url) return;
          chAvatarMap[cid] = url;
          var els = document.querySelectorAll('[data-chid="' + cid + '"]');
          for (var j = 0; j < els.length; j++) applyAvatarNode(els[j], url, (rec && rec.name) || '');
        });
      });
    }, 60);
  }

  function goYtHome() {
    try {
      localStorage.setItem('tv_browse', JSON.stringify({ feed: 'home', q: '', selectedCh: '', scroll: 0, ts: Date.now() }));
    } catch (e) {}
    clearSearchBox();
    if (stage) location.href = tv.url('/player/?home=1');
    else loadHome();
  }

  function avatarInner(thumb, name) {
    var letter = String(name || '?').charAt(0);
    var useImg = thumb && !/mqdefault|hqdefault|maxresdefault|i\.ytimg/i.test(thumb);
    if (useImg) {
      return '<img src="' + escapeHtml(thumb) + '" alt="" referrerpolicy="no-referrer" onerror="this.style.display=\'none\';var n=this.nextSibling;if(n)n.style.display=\'block\'">'
        + '<span class="sub-letter" style="display:none">' + escapeHtml(letter) + '</span>';
    }
    return '<span class="sub-letter">' + escapeHtml(letter) + '</span>';
  }

  function resetPager(mode, extra) {
    extra = extra || {};
    pager.mode = mode || '';
    pager.q = extra.q || '';
    pager.id = extra.id || '';
    pager.name = extra.name || '';
    pager.offset = 0;
    pager.more = !!(mode && mode !== 'favs');
    pager.busy = false;
    paintMoreBar();
  }

  function paintMoreBar() {
    var bar = $('moreBar');
    if (!bar) return;
    if (!pager.more || !pager.mode || pager.mode === 'favs') {
      bar.style.display = 'none';
      return;
    }
    bar.style.display = 'block';
    bar.textContent = pager.busy ? '불러오는 중...' : '더 보기';
    bar.disabled = !!pager.busy;
  }

  function uniqueNew(base, add) {
    var seen = {};
    (base || []).forEach(function (it) { if (it && it.id) seen[it.id] = true; });
    var out = [];
    (add || []).forEach(function (it) {
      if (!it || !it.id || seen[it.id]) return;
      seen[it.id] = true;
      out.push(it);
    });
    return out;
  }

  function cardChannelName(it) {
    var name = cleanName(it.uploader || it.channel || it.name || '');
    if (!name && it.channel_id && subIds[it.channel_id]) name = cleanName(subIds[it.channel_id].name);
    if (!name && pager.mode === 'subchannel' && pager.name) name = cleanName(pager.name);
    if (!name && pager.mode === 'ytchannel' && pager.name) name = cleanName(pager.name);
    if (!name && watchChannel && watchChannel.name) name = cleanName(watchChannel.name);
    return name;
  }

  function cardHtml(it) {
    var dur = tv.fmtDur(it.duration);
    var views = tv.fmtViews(it.views);
    var viewsText = views ? ('조회수 ' + views) : cleanName(it.views_text || '');
    var ago = tv.fmtAgo(it.uploaded) || cleanName(it.published || '');
    var on = !!(it.id && favIds[it.id]);
    var chName = cardChannelName(it);
    var html = '<div class="yt-card" data-id="' + escapeHtml(it.id || '') + '" data-url="' + (it.url || ('https://www.youtube.com/watch?v=' + it.id)) + '">';
    html += '<div class="yt-thumb-wrap"><img src="' + (it.thumbnail || '') + '" alt="" loading="lazy" decoding="async">';
    html += '<button type="button" class="star-btn' + (on ? ' on' : '') + '" data-star="' + escapeHtml(it.id || '') + '" aria-label="즐겨찾기">';
    html += '<svg class="star-svg" viewBox="0 0 24 24"><path d="M12 2.4l2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 16.3 6.6 19.2l1-6.1L3.2 8.8l6.1-.9z"/></svg></button>';
    if (dur) html += '<span class="yt-dur">' + dur + '</span>';
    html += '</div>';
    html += '<table class="yt-card-body"><tr>';
    html += '<td class="yt-card-av-td"><div class="yt-card-av" data-chid="' + escapeHtml(it.channel_id || '') + '" data-chname="' + escapeHtml(chName) + '">' + avatarInner(avatarFor(it), chName || it.title || '?') + '</div></td>';
    html += '<td class="yt-card-text"><div class="t">' + escapeHtml(it.title || '') + '</div>';
    html += '<div class="d">' + escapeHtml(chName || '채널') + '</div>';
    var stats = [];
    if (viewsText) stats.push(viewsText);
    if (ago) stats.push(ago);
    html += '<div class="d">' + escapeHtml(stats.join(' · ') || ' ') + '</div>';
    html += '</td></tr></table></div>';
    return html;
  }

  function appendCards(items) {
    if (!list || !items || !items.length) return;
    var html = '';
    for (var i = 0; i < items.length; i++) html += cardHtml(items[i]);
    var box = document.createElement('div');
    box.innerHTML = html;
    while (box.firstChild) list.appendChild(box.firstChild);
    rememberAvatars(items);
    hydrateAvatars();
  }

  function nearBottom() {
    var el = document.documentElement;
    var top = window.pageYOffset || el.scrollTop || (document.body && document.body.scrollTop) || 0;
    var h = window.innerHeight || el.clientHeight || 0;
    var full = Math.max(el.scrollHeight || 0, (document.body && document.body.scrollHeight) || 0);
    return top + h >= full - 520;
  }

  function onScrollMore() {
    var mask = $('pinMask');
    if (mask && mask.className.indexOf('on') >= 0) return;
    if (pager.busy || !pager.more) return;
    if (nearBottom()) loadMore();
  }

  function loadMore() {
    if (pager.busy || !pager.more) return;
    if (!pager.mode || pager.mode === 'favs') return;
    var seq = reqSeq;
    var mode = pager.mode;
    pager.busy = true;
    paintMoreBar();
    var limit = pager.mode === 'related' ? 12 : 16;
    var done = function (code, data) {
      if (!stillReq(seq) || pager.mode !== mode) return;
      pager.busy = false;
      var add = uniqueNew(pager.mode === 'subchannel' ? libRaw : lastItems, (data && data.items) || []);
      if (!data || !data.ok || !add.length) {
        pager.more = false;
        paintMoreBar();
        return;
      }
      pager.offset += add.length;
      pager.more = data.more !== false && add.length >= 8;
      if (pager.mode === 'subchannel') {
        libRaw = libRaw.concat(add);
        applyLibView();
      } else {
        lastItems = lastItems.concat(add);
        appendCards(add);
      }
      paintMoreBar();
    };
    if (pager.mode === 'home') {
      tv.get('/api/youtube/home?limit=' + limit + '&offset=' + pager.offset, done);
    } else if (pager.mode === 'search') {
      var chQ = (currentFeed && currentFeed !== 'search') ? '&channels=0' : '';
      tv.get('/api/youtube/search?q=' + encodeURIComponent(pager.q) + '&limit=' + limit + '&offset=' + pager.offset + chQ, done);
    } else if (pager.mode === 'ytchannel') {
      tv.get('/api/youtube/channel?id=' + encodeURIComponent(pager.id) + '&name=' + encodeURIComponent(pager.name) + '&limit=' + limit + '&offset=' + pager.offset, done);
    } else if (pager.mode === 'subchannel') {
      tv.get('/api/subscriptions/channel?id=' + encodeURIComponent(pager.id) + '&limit=' + limit + '&offset=' + pager.offset, done);
    } else if (pager.mode === 'related') {
      var extra = '';
      if (watchChannel && watchChannel.channel_id) extra += '&channel_id=' + encodeURIComponent(watchChannel.channel_id);
      if (watchChannel && watchChannel.name) extra += '&uploader=' + encodeURIComponent(watchChannel.name);
      var ids = [];
      if (watchItem && watchItem.id) ids.push(watchItem.id);
      for (var i = 0; i < lastItems.length; i++) if (lastItems[i] && lastItems[i].id) ids.push(lastItems[i].id);
      extra += '&exclude=' + encodeURIComponent(ids.join(','));
      tv.get('/api/youtube/related?id=' + encodeURIComponent((watchItem && watchItem.id) || '') + '&title=' + encodeURIComponent((watchItem && watchItem.title) || '') + extra + '&limit=' + limit + '&offset=' + pager.offset, done);
    } else {
      pager.busy = false;
      pager.more = false;
      paintMoreBar();
    }
  }

  function renderChannelHits(channels) {
    if (!channels || !channels.length) return '';
    var html = '<div class="ch-hits">';
    for (var i = 0; i < channels.length; i++) {
      var ch = channels[i];
      var id = ch.channel_id || '';
      if (!id) continue;
      var on = !!subIds[id];
      var chName = cleanName(ch.name || '') || id;
      html += '<table class="ch-hit"><tr>';
      html += '<td class="ch-hit-main" data-ch="' + escapeHtml(id) + '">';
      html += '<div class="ch-hit-av" data-chid="' + escapeHtml(id) + '" data-chname="' + escapeHtml(chName) + '">' + avatarInner(avatarFor(ch) || ch.thumbnail || ch.avatar || '', chName) + '</div>';
      html += '<div class="ch-hit-meta"><div class="ch-hit-name">' + escapeHtml(chName) + '</div>';
      html += '<div class="ch-hit-sub">채널</div></div></td>';
      html += '<td class="ch-hit-action" data-sub="' + escapeHtml(id) + '" data-subname="' + escapeHtml(chName) + '">';
      html += '<span class="sub-btn' + (on ? ' on' : '') + '">' + (on ? '구독중' : '구독') + '</span>';
      html += '</td></tr></table>';
    }
    html += '</div>';
    return html;
  }

  function scrollWatchResults() {
    if (!stage) return;
    var el = $('chips') || $('relH') || list;
    if (!el) return;
    setTimeout(function () {
      var y = 0, n = el;
      while (n) {
        y += n.offsetTop || 0;
        n = n.offsetParent;
      }
      try { window.scrollTo(0, Math.max(0, y - 10)); } catch (e) {}
    }, 80);
  }

  function renderItems(items, emptyText, channels) {
    var chHtml = renderChannelHits(channels || []);
    if ((!items || !items.length) && !chHtml) {
      list.innerHTML = '<div class="notice">' + (emptyText || '결과 없음') + '</div>';
      maybeScroll();
      if (stage && pager.mode === 'search') scrollWatchResults();
      return;
    }
    var html = chHtml;
    for (var i = 0; i < (items || []).length; i++) html += cardHtml(items[i]);
    list.innerHTML = html || '<div class="notice">' + (emptyText || '결과 없음') + '</div>';
    rememberAvatars(items);
    rememberAvatars(channels);
    maybeScroll();
    paintMoreBar();
    hydrateAvatars();
    if (stage && pager.mode === 'search') scrollWatchResults();
  }

  function setChip(feed) {
    currentFeed = feed;
    var box = $('chips');
    var chips = box ? box.querySelectorAll('.chip') : [];
    for (var i = 0; i < chips.length; i++) {
      chips[i].className = 'chip' + (chips[i].getAttribute('data-feed') === feed ? ' on' : '');
    }
    var bar = $('watchTabSearch');
    if (bar) bar.style.display = (stage && feed === 'search') ? 'block' : 'none';
    if (stage && feed === 'search' && $('qWatchTab')) {
      if (lastQuery && !$('qWatchTab').value) $('qWatchTab').value = lastQuery;
      try { $('qWatchTab').focus(); } catch (e) {}
    }
  }

  function renderSkeleton() {
    var html = '';
    for (var i = 0; i < 6; i++) {
      html += '<div class="yt-card"><div class="yt-thumb-wrap"></div><table class="yt-card-body"><tr><td class="yt-card-av-td"><div class="yt-card-av"></div></td><td class="yt-card-text"><div class="t">불러오는 중</div><div class="d">&nbsp;</div><div class="d">&nbsp;</div></td></tr></table></div>';
    }
    list.innerHTML = html;
  }

  function showLibTools(on, kind) {
    var el = $('libTools');
    if (!el) return;
    el.style.display = on ? 'block' : 'none';
    if ($('libFilter')) {
      $('libFilter').placeholder = kind === 'subs' ? '채널명으로 검색' : '제목 또는 채널명으로 필터';
    }
    if ($('libVidFilter')) $('libVidFilter').style.display = kind === 'subs' ? 'block' : 'none';
    if ($('libSorts')) $('libSorts').style.display = on ? '' : 'none';
    var chBtn = $('libSorts') && $('libSorts').querySelector('[data-sort="channel"]');
    if (chBtn) chBtn.style.display = kind === 'subs' ? 'none' : '';
  }

  function resetLib() {
    libFilter = '';
    libVidFilter = '';
    libSort = 'new';
    if ($('libFilter')) $('libFilter').value = '';
    if ($('libVidFilter')) $('libVidFilter').value = '';
    if ($('libSorts')) {
      var btns = $('libSorts').querySelectorAll('[data-sort]');
      for (var i = 0; i < btns.length; i++) {
        btns[i].className = 'chip' + (btns[i].getAttribute('data-sort') === 'new' ? ' on' : '');
      }
    }
  }

  function hasTs(arr) {
    for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i].ts) return true;
    return false;
  }

  function applyLibView(emptyText) {
    if (emptyText) libEmpty = emptyText;
    var q = (libFilter || '').toLowerCase();
    var items = libRaw.slice();
    if (currentFeed === 'subs') {
      var vq = (libVidFilter || '').toLowerCase();
      if (vq) {
        items = items.filter(function (it) {
          return String(it.title || '').toLowerCase().indexOf(vq) >= 0;
        });
      }
    } else if (q) {
      items = items.filter(function (it) {
        return String(it.title || '').toLowerCase().indexOf(q) >= 0
          || String(it.uploader || '').toLowerCase().indexOf(q) >= 0
          || String(it.name || '').toLowerCase().indexOf(q) >= 0;
      });
    }
    if (libSort === 'title') {
      items.sort(function (a, b) { return String(a.title || '').localeCompare(String(b.title || ''), 'ko'); });
    } else if (libSort === 'channel') {
      items.sort(function (a, b) {
        return String(a.uploader || a.name || '').localeCompare(String(b.uploader || b.name || ''), 'ko');
      });
    } else if (libSort === 'views') {
      items.sort(function (a, b) { return (b.views || 0) - (a.views || 0); });
    } else if (libSort === 'dur') {
      items.sort(function (a, b) { return (b.duration || 0) - (a.duration || 0); });
    } else if (libSort === 'old') {
      if (hasTs(items)) items.sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
      else items.reverse();
    } else if (libSort === 'new' && hasTs(items)) {
      items.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    }
    lastItems = items;
    lastChannels = [];
    if (currentFeed === 'subs') {
      renderRail();
      if (!selectedCh) return;
    }
    renderItems(items, libEmpty, []);
  }

  function showSubsRail(on) {
    var td = $('subsTd');
    var split = document.querySelector('.feed-split');
    if (td) td.style.display = on ? 'table-cell' : 'none';
    if (split) split.className = 'feed-split' + (on ? ' subs-on' : '');
    if (!on) selectedCh = '';
  }

  function isUnread(ch) {
    if (!ch || !ch.last_video_id) return false;
    if (selectedCh && selectedCh === ch.channel_id) return false;
    if (ch.unread) return true;
    var seen = parseInt(ch.last_seen, 10) || 0;
    var vts = parseInt(ch.last_video_ts, 10) || 0;
    if (!seen) return true;
    return vts > seen;
  }

  function filteredSubList() {
    var q = (libFilter || '').toLowerCase();
    if (!q) return subList.slice();
    return subList.filter(function (ch) {
      return String(ch.name || '').toLowerCase().indexOf(q) >= 0;
    });
  }

  function renderRail() {
    var rail = $('subsRail');
    if (!rail) return;
    var vis = filteredSubList();
    var html = '';
    for (var i = 0; i < vis.length; i++) {
      var ch = vis[i];
      var on = selectedCh && selectedCh === ch.channel_id;
      html += '<div class="sub-ch' + (on ? ' on' : '') + '" data-ch="' + escapeHtml(ch.channel_id) + '">';
      html += '<div class="sub-av" data-chid="' + escapeHtml(ch.channel_id || '') + '" data-chname="' + escapeHtml(ch.name || ch.channel_id || '') + '">' + avatarInner(avatarFor(ch) || ch.thumbnail || ch.avatar || '', ch.name || ch.channel_id) + '</div>';
      html += '<span class="sub-ch-name">' + escapeHtml(ch.name || ch.channel_id) + '</span>';
      if (isUnread(ch)) html += '<span class="sub-dot"></span>';
      html += '</div>';
    }
    if (!html) html = '<div class="notice">구독한 채널이 없습니다</div>';
    rail.innerHTML = html;
    rememberAvatars(subList);
    hydrateAvatars();
  }

  function openChannel(id) {
    var ch = null;
    for (var i = 0; i < subList.length; i++) if (subList[i].channel_id === id) ch = subList[i];
    if (!ch || !id) return;
    var seq = beginReq();
    selectedCh = id;
    ch.unread = false;
    ch.last_seen = Date.now();
    saveBrowseState();
    renderRail();
    setStatus((ch.name || '채널') + ' 영상을 불러오는 중...');
    renderSkeleton();
    tv.post('/api/subscriptions/seen', { channel_id: id }, function () {});
    resetPager('subchannel', { id: id, name: ch.name || '' });
    tv.get('/api/subscriptions/channel?id=' + encodeURIComponent(id) + '&limit=16', function (code, data) {
      if (!stillReq(seq) || currentFeed !== 'subs' || selectedCh !== id) return;
      if (!data || !data.ok) {
        setStatus((data && data.error) || '채널 영상을 불러오지 못했습니다');
        pager.more = false;
        paintMoreBar();
        if (list) list.innerHTML = '<div class="notice">이 채널의 영상을 가져오지 못했습니다. 다시 눌러 보세요.</div>';
        return;
      }
      if (data.channel) {
        for (var j = 0; j < subList.length; j++) {
          if (subList[j].channel_id === id) {
            subList[j] = data.channel;
            subList[j].unread = false;
            subList[j].last_seen = Date.now();
          }
        }
        subIds[id] = data.channel;
        rememberAvatars([data.channel]);
        renderRail();
      }
      libRaw = data.items || [];
      pager.offset = libRaw.length;
      pager.more = data.more !== false && libRaw.length >= 8;
      setStatus((ch.name || '채널') + ' · ' + libRaw.length + '개');
      applyLibView('이 채널에 영상이 없습니다');
      paintMoreBar();
    });
  }

  function loadHome() {
    var seq = beginReq();
    setChip('home');
    clearSearchBox();
    lastChannels = [];
    showLibTools(false);
    showSubsRail(false);
    resetPager('home');
    setStatus('홈 피드를 불러오는 중...');
    renderSkeleton();
    saveBrowseState();
    tv.get('/api/youtube/home?limit=16', function (code, data) {
      if (!stillReq(seq) || currentFeed !== 'home') return;
      if (code === 401) { setStatus('PIN이 필요합니다. 새로고침 후 다시 입력하세요.'); return; }
      if (!data || !data.ok || !data.items || !data.items.length) {
        setStatus((data && data.error) ? (data.error + ' → 인기 영상으로 대체') : '홈 실패, 인기 영상으로 대체');
        tv.get('/api/youtube/search?q=' + encodeURIComponent('인기 급상승') + '&limit=16', function (c2, d2) {
          if (!stillReq(seq) || currentFeed !== 'home') return;
          lastItems = (d2 && d2.items) || [];
          lastChannels = [];
          pager.offset = lastItems.length;
          pager.more = !!(d2 && d2.more);
          renderItems(lastItems, '영상을 불러오지 못했습니다');
        });
        return;
      }
      setStatus(data.source === 'subs' ? '구독 채널 최신' : '인기 급상승');
      lastItems = data.items || [];
      pager.offset = lastItems.length;
      pager.more = data.more !== false;
      renderItems(data.items);
    });
  }

  function loadFavs() {
    var seq = beginReq();
    setChip('favs');
    lastChannels = [];
    resetLib();
    showLibTools(true, 'favs');
    showSubsRail(false);
    resetPager('favs');
    saveBrowseState();
    setStatus('즐겨찾기');
    tv.get('/api/favorites', function (code, data) {
      if (!stillReq(seq) || currentFeed !== 'favs') return;
      if (!data || !data.ok) { setStatus((data && data.error) || '즐겨찾기를 불러오지 못했습니다'); return; }
      libRaw = data.items || [];
      favIds = {};
      for (var i = 0; i < libRaw.length; i++) favIds[libRaw[i].id] = libRaw[i];
      setStatus('즐겨찾기 ' + libRaw.length + '개' + (currentPin ? ' · PIN ' + currentPin : ''));
      applyLibView('즐겨찾기가 없습니다. 목록의 별을 누르면 추가됩니다.');
    });
  }

  function loadFavMap(cb) {
    tv.get('/api/favorites', function (code, data) {
      favIds = {};
      if (data && data.ok && data.items) {
        for (var i = 0; i < data.items.length; i++) favIds[data.items[i].id] = data.items[i];
      }
      paintWatchStar();
      if (cb) cb();
    });
  }

  function loadSubMap(cb) {
    tv.get('/api/subscriptions', function (code, data) {
      subIds = {};
      if (data && data.ok && data.items) {
        for (var i = 0; i < data.items.length; i++) subIds[data.items[i].channel_id] = data.items[i];
        rememberAvatars(data.items);
      }
      paintSubBtn();
      if (cb) cb();
    });
  }

  function itemById(id) {
    if (watchItem && watchItem.id === id) return watchItem;
    if (favIds[id]) return favIds[id];
    for (var i = 0; i < lastItems.length; i++) {
      if (lastItems[i].id === id) return lastItems[i];
    }
    return { id: id, title: id, url: 'https://www.youtube.com/watch?v=' + id, thumbnail: 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg' };
  }

  function paintStarEl(el, on) {
    if (!el) return;
    el.className = 'star-btn' + (el.id === 'btnFavWatch' ? ' watch-star' : '') + (on ? ' on' : '');
  }

  function paintWatchStar() {
    var btn = $('btnFavWatch');
    if (!btn || !watchItem) return;
    btn.setAttribute('data-star', watchItem.id);
    paintStarEl(btn, !!favIds[watchItem.id]);
  }

  function toggleFav(id) {
    if (!id) return;
    tv.post('/api/favorites/toggle', itemById(id), function (code, data) {
      if (!data || !data.ok) return;
      if (data.on) favIds[id] = itemById(id);
      else delete favIds[id];
      var stars = document.querySelectorAll('[data-star="' + id + '"]');
      for (var i = 0; i < stars.length; i++) paintStarEl(stars[i], data.on);
      paintWatchStar();
      if (currentFeed === 'favs' && !data.on) {
        libRaw = libRaw.filter(function (x) { return x.id !== id; });
        applyLibView();
      }
    });
  }

  function paintSubBtn() {
    var btn = $('btnSub');
    var row = $('chRow');
    if (!btn) return;
    var id = watchChannel && watchChannel.channel_id;
    var on = !!(id && subIds[id]);
    btn.className = 'sub-btn' + (on ? ' on' : '');
    btn.textContent = on ? '구독중' : '구독';
    if (row) {
      row.style.display = (watchChannel && (watchChannel.name || watchChannel.channel_id)) ? 'table' : 'none';
    }
    if ($('chAv') && watchChannel) {
      $('chAv').setAttribute('data-chid', watchChannel.channel_id || '');
      $('chAv').setAttribute('data-chname', watchChannel.name || '');
      $('chAv').innerHTML = avatarInner(avatarFor(watchChannel) || watchChannel.avatar || watchChannel.thumbnail || '', watchChannel.name || '');
      hydrateAvatars();
    }
  }

  function paintSubEls(id, on) {
    var els = document.querySelectorAll('[data-sub="' + id + '"]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var btn = (el.className && el.className.indexOf('sub-btn') >= 0)
        ? el
        : (el.querySelector ? el.querySelector('.sub-btn') : null);
      if (!btn) btn = el;
      btn.className = 'sub-btn' + (on ? ' on' : '');
      btn.textContent = on ? '구독중' : '구독';
    }
    if (watchChannel && watchChannel.channel_id === id) paintSubBtn();
  }

  function channelById(id) {
    if (watchChannel && watchChannel.channel_id === id) return watchChannel;
    if (subIds[id]) return subIds[id];
    for (var i = 0; i < lastChannels.length; i++) {
      if (lastChannels[i].channel_id === id) return lastChannels[i];
    }
    for (var j = 0; j < subList.length; j++) {
      if (subList[j].channel_id === id) return subList[j];
    }
    return { channel_id: id, name: id };
  }

  function sendSubState(ch) {
    var id = ch.channel_id;
    if (!id) return;
    var want = !!subWant[id];
    subPending[id] = true;
    tv.post('/api/subscriptions/toggle', {
      channel_id: ch.channel_id,
      name: ch.name || ch.uploader || '',
      uploader: ch.uploader || ch.name || '',
      avatar: ch.avatar || '',
      thumbnail: ch.thumbnail || ch.avatar || '',
      on: want
    }, function (code, data) {
      subPending[id] = false;
      if (!data || !data.ok) {
        if (want) delete subIds[id];
        else subIds[id] = ch;
        paintSubEls(id, !want);
        setStatus((data && data.error) || '구독을 바꾸지 못했습니다');
        return;
      }
      if (!!subWant[id] !== want) {
        sendSubState(ch);
        return;
      }
      var nid = data.channel_id || id;
      if (watchChannel && (watchChannel.channel_id === nid || watchChannel.name === ch.name)) {
        watchChannel.channel_id = nid;
      }
      if (data.on) subIds[nid] = ch;
      else delete subIds[nid];
      paintSubEls(nid, data.on);
      setStatus(data.on ? ((ch.name || '채널') + ' 구독 중') : ((ch.name || '채널') + ' 구독 해제'));
    });
  }

  function toggleSubChannel(ch) {
    if (!ch || !ch.channel_id) return;
    var id = String(ch.channel_id);
    var now = Date.now();
    if (subTapAt[id] && now - subTapAt[id] < 400) return;
    subTapAt[id] = now;
    if (chAvatarMap[id] && !looksAv(ch.avatar || ch.thumbnail)) {
      ch.avatar = chAvatarMap[id];
      ch.thumbnail = chAvatarMap[id];
    }
    var want = !subIds[id];
    subWant[id] = want;
    if (want) subIds[id] = ch;
    else delete subIds[id];
    paintSubEls(id, want);
    setStatus(want ? ((ch.name || '채널') + ' 구독 중') : ((ch.name || '채널') + ' 구독 해제'));
    if (subPending[id]) return;
    sendSubState(ch);
  }

  function toggleSub() {
    toggleSubChannel(watchChannel);
  }

  function openSearchChannel(id) {
    var seq = beginReq();
    var ch = channelById(id);
    lastChannels = [];
    if ($('relH')) $('relH').textContent = (ch && ch.name) ? (ch.name + ' 영상') : '채널 영상';
    setStatus(((ch && ch.name) || '채널') + ' 영상을 불러오는 중...');
    resetPager('ytchannel', { id: id, name: (ch && ch.name) || '' });
    renderSkeleton();
    tv.get('/api/youtube/channel?id=' + encodeURIComponent(id) + '&name=' + encodeURIComponent((ch && ch.name) || '') + '&limit=16', function (code, data) {
      if (!stillReq(seq)) return;
      if (!data || !data.ok) {
        setStatus((data && data.error) || '채널 영상을 불러오지 못했습니다');
        pager.more = false;
        renderItems([], '이 채널의 영상을 가져오지 못했습니다', []);
        return;
      }
      lastItems = data.items || [];
      pager.offset = lastItems.length;
      pager.more = data.more !== false && lastItems.length >= 8;
      setStatus(((ch && ch.name) || '채널') + ' · ' + lastItems.length + '개');
      renderItems(lastItems, '이 채널에 영상이 없습니다', []);
    });
  }

  function search(q, chip) {
    if (relatedTimer) { clearTimeout(relatedTimer); relatedTimer = null; }
    var seq = beginReq();
    lastQuery = q;
    lastChannels = [];
    setChip(chip || 'search');
    showLibTools(false);
    showSubsRail(false);
    saveBrowseState();
    resetPager('search', { q: q });
    setStatus('검색 중...');
    renderSkeleton();
    if (stage) scrollWatchResults();
    var wantChannels = !chip || chip === 'search';
    tv.get('/api/youtube/search?q=' + encodeURIComponent(q) + '&limit=16' + (wantChannels ? '' : '&channels=0'), function (code, data) {
      if (!stillReq(seq)) return;
      if (chip && currentFeed !== chip) return;
      if (!chip && currentFeed !== 'search') return;
      if (!data || !data.ok) {
        setStatus((data && data.error) || '검색 실패');
        pager.more = false;
        paintMoreBar();
        if (list) list.innerHTML = '<div class="notice">검색에 실패했습니다. 다른 단어로 다시 검색해 보세요.</div>';
        if (stage) scrollWatchResults();
        return;
      }
      lastItems = data.items || [];
      lastChannels = wantChannels ? (data.channels || []) : [];
      if (!chip || chip === 'search') {
        lastSearchItems = lastItems;
        lastSearchChannels = lastChannels;
      }
      pager.offset = lastItems.length;
      pager.more = data.more !== false && lastItems.length >= 8;
      var extra = lastChannels.length ? (' · 채널 ' + lastChannels.length + '개') : '';
      var label = chip && chip !== 'search' ? (chip === 'news' ? '뉴스' : chip === 'music' ? '음악' : chip === 'game' ? '게임' : q) : ('"' + q + '" 검색 결과');
      setStatus(label + ' ' + lastItems.length + '개' + extra);
      renderItems(lastItems, '검색 결과 없음', lastChannels);
    });
  }

  function loadSubs() {
    var seq = beginReq();
    setChip('subs');
    lastChannels = [];
    resetLib();
    showLibTools(true, 'subs');
    showSubsRail(true);
    resetPager('');
    selectedCh = restoreCh || '';
    var want = restoreCh;
    restoreCh = '';
    libRaw = [];
    saveBrowseState();
    setStatus('구독 채널을 불러오는 중...');
    renderSkeleton();
    tv.get('/api/subscriptions', function (code, data) {
      if (!stillReq(seq) || currentFeed !== 'subs') return;
      if (!data || !data.ok) {
        setStatus((data && data.error) || '구독을 불러오지 못했습니다');
        if (list) list.innerHTML = '<div class="notice">재생 화면에서 채널명 옆 <b>구독</b>을 누르면 이 PIN 계정에 저장됩니다.</div>';
        return;
      }
      subList = data.items || [];
      subIds = {};
      for (var i = 0; i < subList.length; i++) subIds[subList[i].channel_id] = subList[i];
      if (!subList.length) {
        setStatus('구독한 채널 없음' + (currentPin ? ' · PIN ' + currentPin : ''));
        renderRail();
        if (list) list.innerHTML = '<div class="notice">아직 구독한 채널이 없습니다. 영상을 연 다음 채널명 옆의 빨간 <b>구독</b> 버튼을 누르세요. PIN마다 따로 저장됩니다.</div>';
        return;
      }
      setStatus('구독 ' + subList.length + '개 채널' + (currentPin ? ' · PIN ' + currentPin : ''));
      renderRail();
      var pick = want;
      if (pick) {
        var found = false;
        for (var k = 0; k < subList.length; k++) {
          if (subList[k].channel_id === pick) found = true;
        }
        if (!found) pick = '';
      }
      if (!pick) pick = subList[0].channel_id;
      rememberAvatars(subList);
      openChannel(pick);
      setTimeout(function () {
        if (currentFeed !== 'subs') return;
        tv.get('/api/subscriptions/check', function (c2, d2) {
          if (currentFeed !== 'subs') return;
          if (!(d2 && d2.ok && d2.items)) return;
          subList = d2.items;
          for (var j = 0; j < subList.length; j++) {
            if (selectedCh && subList[j].channel_id === selectedCh) {
              subList[j].unread = false;
              subList[j].last_seen = Date.now();
            }
            subIds[subList[j].channel_id] = subList[j];
          }
          rememberAvatars(subList);
          renderRail();
        });
      }, 2500);
    });
  }

  function queuedAudio(pl) {
    pl = pl || player;
    try {
      if (pl && pl.audioOut && pl.audioOut.enqueuedTime) {
        return Math.max(0, pl.audioOut.enqueuedTime);
      }
    } catch (e) {}
    return 0;
  }

  function rememberHeard(t) {
    if (t > 0) lastHeard = t;
    return t;
  }

  function decoderSoundTime() {
    try {
      if (!player || !player.audio || !player.audioOut) return 0;
      var t = player.audio.currentTime;
      if (t > 0 && isFinite(t)) return t;
    } catch (e) {}
    return 0;
  }

  function playingSoundTime(opts) {
    var allowFallback = !(opts && opts.fallback === false);
    try {
      if (!player || !player.audioOut || !player.audioOut.context) {
        if (!allowFallback) return 0;
        if (lastHeard > 0) return lastHeard;
        return pauseHeard > 0 ? pauseHeard : 0;
      }
      var now = player.audioOut.context.currentTime;
      var srcs = player.audioOut._srcs || [];
      var i, s, live = null, past = 0, nextAt = 0, nextMedia = 0;
      for (i = 0; i < srcs.length; i++) {
        s = srcs[i];
        if (s._ctxAt == null || s._dur == null || s._mediaAt == null) continue;
        if (now >= s._ctxAt && now < s._ctxAt + s._dur) {
          live = s._mediaAt + (now - s._ctxAt);
          break;
        }
        if (now >= s._ctxAt + s._dur) {
          var atEnd = s._mediaAt + s._dur;
          if (atEnd > past) past = atEnd;
        } else if (now < s._ctxAt && (!nextAt || s._ctxAt < nextAt)) {
          nextAt = s._ctxAt;
          nextMedia = s._mediaAt;
        }
      }
      if (live != null) return rememberHeard(live);
      if (nextAt) {
        var pred = nextMedia - (nextAt - now);
        if (pred > 0) return rememberHeard(pred);
        if (nextMedia > 0) return rememberHeard(nextMedia);
      }
      if (past > 0) return rememberHeard(past);
      var dec = decoderSoundTime();
      if (dec > 0) return rememberHeard(dec);
    } catch (e) {}
    if (!allowFallback) return 0;
    if (lastHeard > 0) return lastHeard;
    if (pauseHeard > 0) return pauseHeard;
    return 0;
  }

  function clearPauseClock() {
    resumeHeard = 0;
    pauseHeard = 0;
    resumePending = false;
  }

  function liveClockReady() {
    try {
      var ctx = player && player.audioOut && player.audioOut.context;
      if (!ctx || ctx.state !== 'running') return false;
      return playingSoundTime({ fallback: false }) > 0;
    } catch (e) { return false; }
  }

  function targetHeard() {
    var live = playingSoundTime({ fallback: false });
    if (resumePending || resumeHeard > 0) {
      if (liveClockReady() && live > 0) return live;
      if (resumeHeard > 0) return resumeHeard;
    }
    return live > 0 ? live : playingSoundTime();
  }

  function videoCaughtUp(vt, heard) {
    return heard > 0 && isFinite(vt) && vt >= heard - 0.025 && vt <= heard + 0.04;
  }

  function restartDeadVideoStream(reason, extra) {
    if (ended || streamEnded || paused || prerolling || !playing || !player) return;
    if (Date.now() - lastDeadVideoRestart < 15000) return;
    var sec = Math.max(0, (currentPos() || 0) - 0.5);
    lastDeadVideoRestart = Date.now();
    debugPlayback(reason || 'restart-dead-video', Object.assign({
      position: sec,
      videoTime: player && player.video ? player.video.currentTime : -1,
      heard: playingSoundTime({ fallback: false }),
      lastVideoDecodeMs: lastVideoDecodeAt ? Date.now() - lastVideoDecodeAt : -1,
      queuedAudio: queuedAudio(),
      packedAhead: packedAhead(),
      audioAhead: audioAheadSec(),
      videoAhead: videoAheadSec()
    }, extra || {}));
    playUrl(playing, sec, { skipInfo: true });
  }

  function markCaughtUp() {
    if (resumePending && !liveClockReady()) return;
    videoCatching = false;
    clearPauseClock();
  }

  function skipVideoToSound(pl) {
    if (ended || prerolling || paused || !pl || !pl.video) return;
    var heard = targetHeard();
    if (!(heard > 0)) return;
    var vt = pl.video.currentTime;
    if (!isFinite(vt)) return;
    if (vt > heard + 0.04) {
      if (!resumePending) videoCatching = false;
      return;
    }
    if (videoCaughtUp(vt, heard)) {
      markCaughtUp();
      return;
    }
    if (heard - vt > 0.08) videoCatching = true;
    var cap = videoCatching ? VIDEO_CATCH_FRAMES : 1;
    var i = 0;
    while (i < cap) {
      heard = targetHeard();
      vt = pl.video.currentTime;
      if (!(heard > 0) || !isFinite(vt)) break;
      if (vt >= heard - 0.02) {
        videoFail = 0;
        markCaughtUp();
        break;
      }
      if (!pl.video.decode()) {
        videoFail++;
        break;
      }
      videoFail = 0;
      i++;
    }
    if (shouldRestartFromSound(heard, vt)) needStreamRestart = true;
    if (videoCatching) {
      heard = targetHeard();
      vt = pl.video.currentTime;
      if (videoCaughtUp(vt, heard) || (heard > 0 && isFinite(vt) && vt > heard + 0.04)) {
        markCaughtUp();
      }
    }
  }

  function requestSoundSync() {
    if (ended || prerolling || paused || !player) return;
    videoCatching = true;
    skipVideoToSound(player);
  }

  function clearResumeSync() {
    if (resumeSyncTimer) {
      clearTimeout(resumeSyncTimer);
      resumeSyncTimer = null;
    }
  }

  function scheduleResumeSync(tries) {
    clearResumeSync();
    if (paused || !player) return;
    resumeSyncTimer = setTimeout(function () {
      resumeSyncTimer = null;
      if (paused || !player) return;
      skipVideoToSound(player);
      var ready = liveClockReady();
      var vt = player.video && player.video.currentTime;
      var heard = targetHeard();
      if (ready && heard > 0 && isFinite(vt) && heard - vt > 0.04) {
        videoCatching = true;
        skipVideoToSound(player);
      }
      if (ready && !videoCatching && videoCaughtUp(vt, heard)) {
        markCaughtUp();
        return;
      }
      if (tries < 50) scheduleResumeSync(tries + 1);
    }, 50);
  }

  function currentPos() {
    if (paused && pausePos >= 0) return pausePos;
    var heard = playingSoundTime();
    if (heard > 0.04) {
      pausePos = -1;
      return startAt + heard;
    }
    if (pausePos >= 0) return pausePos;
    try {
      if (player && player.video && isFinite(player.video.currentTime) && player.video.currentTime > 0) {
        return startAt + player.video.currentTime;
      }
    } catch (e) {}
    if (clock0) return startAt + (Date.now() - clock0) / 1000;
    return startAt;
  }

  function fmtPlayClock(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    return tv.fmtDur(sec) || '0:00';
  }

  function bitsUnread(dec) {
    try {
      if (!dec || !dec.bits) return 0;
      var bits = dec.bits;
      var left = (bits.byteLength || 0) - ((bits.index || 0) / 8);
      return left > 0 ? left : 0;
    } catch (e) { return 0; }
  }

  function bufferLeftSec(dec, bytesPerSec) {
    if (!bytesPerSec) return 0;
    return bitsUnread(dec) / bytesPerSec;
  }

  function packedAhead() {
    try {
      var vRate = videoByteRate();
      var sec = Math.max(
        bufferLeftSec(player && player.audio, 24000),
        bufferLeftSec(player && player.video, vRate)
      );
      var cap = remainSec();
      if (sec > cap) sec = cap;
      return Math.max(0, sec);
    } catch (e) { return 0; }
  }

  function videoByteRate() {
    var kb = 600;
    if (quality >= 720) kb = vbrLow ? 1000 : 1500;
    else if (quality >= 480) kb = vbrLow ? 700 : 1000;
    else kb = vbrLow ? 400 : 600;
    return (kb * 1000) / 8;
  }

  function outHeight() {
    return quality >= 480 ? 480 : 360;
  }

  function remainSec() {
    if (isLive || !(duration > 0)) return 86400;
    var pos = (paused && pausePos >= 0) ? pausePos : currentPos();
    var left = duration - pos;
    return left > 0 ? left : 0;
  }

  function decoderFill() {
    function fill(dec) {
      try {
        if (!dec || !dec.bits || !dec.bits.bytes || !dec.bits.bytes.length) return 0;
        return bitsUnread(dec) / dec.bits.bytes.length;
      } catch (e) { return 0; }
    }
    return Math.max(fill(player && player.audio), fill(player && player.video));
  }

  function streamSocket() {
    try { return player && player.source && player.source.socket; } catch (e) { return null; }
  }

  function sendStreamCtrl(hold) {
    hold = !!hold;
    if (streamHeld === hold) return;
    var sock = streamSocket();
    if (!sock || sock.readyState !== 1) return;
    try {
      sock.send(JSON.stringify({ type: hold ? 'hold' : 'go' }));
      streamHeld = hold;
    } catch (e) {}
  }

  function nearEnd() {
    if (isLive || !(duration > 0)) return false;
    return currentPos() >= Math.max(0, duration - 1.5);
  }

  function disableReconnect() {
    try {
      if (!player || !player.source) return;
      player.source.shouldAttemptReconnect = false;
      player.source.reconnectInterval = 0;
      if (player.source.reconnectTimeoutId) {
        clearTimeout(player.source.reconnectTimeoutId);
        player.source.reconnectTimeoutId = 0;
      }
    } catch (e) {}
  }

  function markStreamEnded() {
    if (isLive || ended) return;
    streamEnded = true;
    disableReconnect();
  }

  function supplyDrained() {
    return queuedAudio() < 0.2 && packedAhead() < 0.15;
  }

  function finishPlayback() {
    if (ended || !playing || isLive) return;
    ended = true;
    streamEnded = true;
    prerolling = false;
    rebuffering = false;
    needStreamRestart = false;
    videoCatching = false;
    paused = true;
    pausePos = duration > 0 ? duration : currentPos();
    disableReconnect();
    holdPlayback();
    if ($('btnPause')) $('btnPause').textContent = '재생';
    applyChrome();
    paintSeekBar();
    setStatus('종료');
  }

  function applyStreamHold() {
    if (ended || !player || isLive) {
      if (isLive) sendStreamCtrl(false);
      return;
    }
    var fill = decoderFill();
    var ahead = packedAhead();
    var remain = remainSec();
    var wantHold = fill >= 0.65;
    if (paused) {
      if (ahead >= bufTarget || ahead >= remain - 0.2) wantHold = true;
    } else if (ahead >= bufTarget) {
      wantHold = true;
    }
    if (wantHold) {
      sendStreamCtrl(true);
      return;
    }
    if (paused) {
      if (fill <= 0.42 && ahead < bufTarget - 2 && ahead < remain - 0.8) sendStreamCtrl(false);
      return;
    }
    if (fill < 0.6 && ahead < bufTarget - 1) sendStreamCtrl(false);
  }

  function shouldRestartFromSound(heard, vt) {
    if (ended || streamEnded || paused || prerolling || rebuffering || isLive || !videoStartWall) return false;
    if (Date.now() - videoStartWall < 4000) return false;
    if (Date.now() - lastSyncRestart < 12000) return false;
    if (!(heard > 0) || !isFinite(vt)) return false;
    var behind = heard - vt;
    if (behind > 0.7 && videoFail >= 8 && packedAhead() > 0.25) return true;
    if (behind > 2.5 && videoFail >= 4) return true;
    return false;
  }

  function restartFromSound() {
    if (ended || streamEnded || paused || !playing || isLive || soundResyncing) return;
    if (Date.now() - lastSyncRestart < 12000) return;
    var src = playing;
    var sec = currentPos();
    if (!(sec >= 0) || !src) return;
    lastSyncRestart = Date.now();
    soundResyncing = true;
    needStreamRestart = false;
    videoFail = 0;
    playUrl(src, sec);
  }

  function bufferedAhead() {
    return Math.max(0, queuedAudio() + packedAhead());
  }

  function hardenBits(dec) {
    if (!dec || !dec.bits || dec.bits.__keep) return;
    var bits = dec.bits;
    bits.__keep = true;
    bits.evict = function (need) {
      var consumed = this.index >> 3;
      var cap = this.bytes.length;
      var tail = cap - this.byteLength;
      if (need <= tail) return;
      if (consumed > 0) {
        if (this.bytes.copyWithin) this.bytes.copyWithin(0, consumed, this.byteLength);
        else this.bytes.set(this.bytes.subarray(consumed, this.byteLength), 0);
        this.byteLength -= consumed;
        this.index = 0;
      }
    };
    bits.appendSingleBuffer = function (buf) {
      buf = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
      var room = this.bytes.length - this.byteLength;
      if (room < buf.length) {
        sendStreamCtrl(true);
        overflowFails++;
        if (overflowFails >= 3) needStreamRestart = true;
        return;
      }
      overflowFails = 0;
      this.bytes.set(buf, this.byteLength);
      this.byteLength += buf.length;
    };
  }

  function paintSeekBar() {
    if (seeking) return;
    var seek = $('seek');
    var wrap = $('seekWrap');
    if (!seek) return;
    if (isLive || !duration) {
      if (wrap) wrap.style.display = 'none';
      seek.style.display = 'none';
      bufEnd = 0;
      return;
    }
    if (wrap) wrap.style.display = 'block';
    seek.style.display = 'block';
    var pos = currentPos();
    if (pos < 0) pos = 0;
    if (pos > duration) pos = duration;
    seek.max = duration;
    seek.value = String(pos);
    var ahead = Math.max(packedAhead(), queuedAudio());
    if (ahead > duration - pos) ahead = Math.max(0, duration - pos);
    var liveEnd = pos + ahead;
    if (liveEnd > bufEnd) bufEnd = liveEnd;
    if (bufEnd < pos) bufEnd = pos;
    if (bufEnd > duration) bufEnd = duration;
    var playPct = pos / duration;
    var bufPct = Math.min(1, bufEnd / duration);
    if ($('seekPlay')) $('seekPlay').style.width = (playPct * 100) + '%';
    if ($('seekBuf')) $('seekBuf').style.width = (bufPct * 100) + '%';
    if ($('seekKnob')) $('seekKnob').style.left = (playPct * 100) + '%';
    var clock = fmtPlayClock(pos) + ' / ' + fmtPlayClock(duration);
    if (paused && ahead >= 0.5) clock += ' · +' + Math.round(ahead) + '초';
    if ($('npTime')) $('npTime').textContent = clock;
  }

  function stop(keepBox) {
    if (relatedTimer) { clearTimeout(relatedTimer); relatedTimer = null; }
    if (player) { try { player.destroy(); } catch (e) {} player = null; }
    if (na) {
      try { na.pause(); na.removeAttribute('src'); na.load(); } catch (e) {}
    }
    if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
    clearResumeSync();
    if (forceTimer) { clearTimeout(forceTimer); forceTimer = null; }
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    if (audioTimer) { clearInterval(audioTimer); audioTimer = null; }
    playing = null;
    paused = false;
    pausePos = -1;
    pauseHeard = 0;
    lastHeard = 0;
    resumeHeard = 0;
    resumePending = false;
    pauseUnread = -1;
    pauseNet0 = -1;
    resumeAt = 0;
    streamHeld = false;
    needStreamRestart = false;
    overflowFails = 0;
    videoFail = 0;
    prerolling = false;
    prerollAt = 0;
    rebuffering = false;
    ended = false;
    streamEnded = false;
    bufEnd = 0;
    if ($('btnPause')) $('btnPause').textContent = '일시정지';
    if (!keepBox) {
      fsOn = false;
      document.body.className = '';
      if ($('playerBox')) $('playerBox').className = 'player-box';
      if ($('btnFs')) $('btnFs').textContent = '전체화면';
    } else {
      applyChrome();
    }
  }

  function playUrl(src, seek, opts) {
    var playSeq = beginReq();
    var keepPaused = !!(opts && opts.keepPaused);
    wakeAudio();
    stop(true);
    playing = src;
    startAt = seek || 0;
    bufEnd = startAt;
    if (keepPaused) {
      paused = true;
      pausePos = startAt;
      if ($('btnPause')) $('btnPause').textContent = '재생';
    } else {
      paused = false;
      pausePos = -1;
      if ($('btnPause')) $('btnPause').textContent = '일시정지';
    }
    applyChrome();
    $('npTitle').textContent = '불러오는 중...';
    $('npFps').textContent = outHeight() + 'p · ' + fps + 'fps · 0 FPS';
    stage.width = 640;
    stage.height = 360;
    videoAr = 16 / 9;

    tv.get('/api/media/info?url=' + encodeURIComponent(src) + '&quality=' + quality, function (code, info) {
      if (!stillReq(playSeq)) return;
      if (code === 401) {
        soundResyncing = false;
        setStatus('PIN이 필요합니다');
        tv.ensurePin(function () { if (stillReq(playSeq) || playing === src) playUrl(src, startAt, keepPaused ? { keepPaused: true } : null); });
        return;
      }
      if (!info || !info.ok) {
        soundResyncing = false;
        setStatus((info && info.error) || '영상을 열 수 없습니다. 다른 영상을 선택해 보세요.');
        if ($('npTitle')) $('npTitle').textContent = '재생할 수 없음';
        return;
      }
      duration = info.duration || 0;
      isLive = !!info.isLive;
      videoAr = (info.aspect > 0.1) ? info.aspect : ((info.width && info.height) ? (info.width / info.height) : (16 / 9));
      if (info.width && info.height) {
        stage.width = info.width;
        stage.height = info.height;
      } else {
        var hh = quality >= 480 ? 480 : 360;
        stage.height = hh;
        stage.width = Math.round(hh * videoAr);
        if (stage.width % 2) stage.width += 1;
      }
      fitStage();
      $('npTitle').textContent = info.title || src;
      paintSeekBar();
      historyAdd({ id: info.id, title: info.title, url: info.pageUrl || src, thumbnail: info.thumbnail, duration: duration, uploader: info.uploader, views: info.views || 0 });
      if (info.channel_id) {
        tv.post('/api/history/watch', { id: info.id, channel_id: info.channel_id }, function () {});
      }
      if ($('watchH')) $('watchH').textContent = info.title || '재생';
      if (info.id) rememberWatch(info.id, info.pageUrl || src);
      watchItem = {
        id: info.id,
        title: info.title,
        url: info.pageUrl || src,
        thumbnail: info.thumbnail,
        duration: info.duration,
        uploader: info.uploader,
        views: info.views || 0,
        channel_id: info.channel_id || '',
        avatar: info.avatar || '',
        uploaded: info.uploaded || 0
      };
      watchChannel = {
        channel_id: info.channel_id || '',
        name: info.channel || info.uploader || '',
        uploader: info.uploader || '',
        thumbnail: info.avatar || info.thumbnail || '',
        avatar: info.avatar || ''
      };
      if ($('chName')) $('chName').textContent = watchChannel.name || watchChannel.channel_id || '';
      rememberAvatars([watchChannel]);
      paintWatchStar();
      paintSubBtn();
      startPipes(src);
      if (relatedTimer) clearTimeout(relatedTimer);
      var keepTab = currentFeed === 'search' || currentFeed === 'subs' || currentFeed === 'favs';
      if (!keepTab) showRelatedLoading();
      relatedTimer = setTimeout(function () {
        relatedTimer = null;
        if (!stillReq(playSeq)) return;
        if (currentFeed === 'search' || currentFeed === 'subs' || currentFeed === 'favs') return;
        loadRelated(info.id, info.title, playSeq);
      }, 400);
    });
  }

  function showRelatedLoading() {
    if (!list || !stage) return;
    setChip('related');
    showLibTools(false);
    showSubsRail(false);
    if ($('relH')) $('relH').textContent = '관련 동영상 · 불러오는 중...';
    renderSkeleton();
  }

  function loadRelated(id, title, seq) {
    if (!list) return;
    if (seq == null) seq = reqSeq;
    lastChannels = [];
    setChip('related');
    showLibTools(false);
    showSubsRail(false);
    resetPager('related');
    if ($('relH')) $('relH').textContent = '관련 동영상 · 불러오는 중...';
    if (list && !list.querySelector('.yt-card')) showRelatedLoading();
    var extra = '';
    if (watchChannel && watchChannel.channel_id) extra += '&channel_id=' + encodeURIComponent(watchChannel.channel_id);
    if (watchChannel && watchChannel.name) extra += '&uploader=' + encodeURIComponent(watchChannel.name);
    tv.get('/api/youtube/related?id=' + encodeURIComponent(id || '') + '&title=' + encodeURIComponent(title || '') + extra + '&limit=8', function (code, data) {
      if (!stillReq(seq)) return;
      if (currentFeed === 'search' || currentFeed === 'subs' || currentFeed === 'favs') return;
      if ($('relH')) $('relH').textContent = '관련 동영상';
      if (data && data.ok) {
        lastItems = data.items || [];
        pager.offset = lastItems.length;
        pager.more = true;
        renderItems(data.items, '추천 영상이 없습니다');
      } else {
        renderItems([], '관련 영상을 불러오지 못했습니다');
      }
    });
  }

  function wsUrlFor(src, start) {
    return tv.ws('/ws/mpeg1?url=' + encodeURIComponent(src) + '&quality=' + quality + '&fps=' + fps + '&vbr=' + (vbrLow ? 'low' : 'norm') + '&start=' + encodeURIComponent(String(start || 0)));
  }

  function startHttpAudio(src) {
    if (!na) return;
    var q = '&quality=' + quality + '&start=' + encodeURIComponent(String(startAt));
    na.preload = 'none';
    na.src = tv.url('/api/audio?url=' + encodeURIComponent(src) + q + '&_=' + Date.now());
    na.load();
    (function tryPlay() { if (na) na.play().catch(function () { setTimeout(tryPlay, 120); }); })();
  }

  var SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

  function isAudioLive() {
    try {
      var out = player && player.audioOut;
      if (!out || !out.context) return false;
      if (out.context.state !== 'running') return false;
      if (out.speakerTime && out.speakerTime() > 0.15) return true;
      if (out.enqueuedTime > 0.15) return true;
      return false;
    } catch (e) { return false; }
  }

  function wakeAudio() {
    try {
      var WA = window.JSMpeg && JSMpeg.AudioOutput && JSMpeg.AudioOutput.WebAudio;
      var C = window.AudioContext || window.webkitAudioContext;
      if (!WA || !C) return;
      if (!WA.CachedContext || WA.CachedContext.state === 'closed') {
        WA.CachedContext = new C();
      }
      var ctx = WA.CachedContext;
      if (ctx.resume) ctx.resume();
      var buf = ctx.createBuffer(1, 1, 22050);
      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      if (src.start) src.start(0);
    } catch (e) {}
  }

  function primeHtmlAudio() {
    var el = $('na');
    if (!el) return;
    try {
      if (el.getAttribute('data-prime') !== '1') {
        el.setAttribute('data-prime', '1');
        el.preload = 'auto';
        el.loop = false;
        el.muted = false;
        el.volume = 0.05;
        el.src = SILENT_WAV;
      }
      var p = el.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }

  function unlockPlaybackAudio() {
    primeHtmlAudio();
    wakeAudio();
    try {
      var out = player && player.audioOut;
      if (out && out.context && out.context.resume) out.context.resume();
      if (out && out.unlock) out.unlock(function () {});
      if (out) {
        out.unlocked = true;
        out.enabled = true;
      }
    } catch (e2) {}
    applyPlayerVol();
  }

  function bindSoundUnlock() {
    if (soundUnlockBound) return;
    soundUnlockBound = true;
    function kick() { unlockPlaybackAudio(); }
    document.addEventListener('touchstart', kick, true);
    document.addEventListener('click', kick, true);
    document.addEventListener('pageshow', kick, false);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        kick();
        videoCatching = true;
        requestSoundSync();
        scheduleResumeSync(0);
      }
    }, false);
    document.addEventListener('pageshow', function () { requestSoundSync(); }, false);
  }

  function unlockAudio() {
    unlockPlaybackAudio();
    bindSoundUnlock();
  }

  function startPipes(src) {
    useHttpAudio = false;
    videoStartWall = 0;
    unlockAudio();
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    launchPlayer(wsUrlFor(src, startAt));
    if (paused) {
      holdPlayback();
      videoStartWall = Date.now();
      pauseNet0 = netBytes;
      applyChrome();
      paintSeekBar();
      setStatus('일시정지 · 미리 받는 중');
    } else {
      unlockPlaybackAudio();
    }
    applyPlayerVol();
    fitStage();
    if (audioTimer) { clearInterval(audioTimer); audioTimer = null; }
    var kicks = 0;
    audioTimer = setInterval(function () {
      kicks++;
      unlockPlaybackAudio();
      if (isAudioLive() || kicks > 40 || !playing || paused) {
        clearInterval(audioTimer);
        audioTimer = null;
      }
    }, 250);
    if (forceTimer) clearTimeout(forceTimer);
    forceTimer = setTimeout(function () {
      forceTimer = null;
      if (!playing || paused) return;
      var fpsEl = $('npFps');
      var fpsTxt = fpsEl ? fpsEl.textContent : '';
      if (!videoStartWall) {
        setStatus('영상이 시작되지 않았습니다. 360으로 다시 눌러 보거나 다른 영상을 선택해 보세요.');
      }
    }, 10000);

    tickTimer = setInterval(function () {
      if (!playing) return;
      if (ended) {
        setStatus('종료');
        paintSeekBar();
        return;
      }
      if (prerolling && !paused) setStatus('불러오는 중');
      if (paused) {
        hookNetBytes();
        applyStreamHold();
        paintSeekBar();
        var ahead = packedAhead();
        var remain = remainSec();
        var full = remain <= 0.5 || ahead >= bufTarget || ahead >= remain - 0.2 || decoderFill() >= 0.75;
        if (full && ahead >= 0.5) {
          setStatus('일시정지 · 미리 받기 ' + Math.round(ahead) + '초 · 대기');
        } else if (ahead >= 0.5) {
          setStatus('일시정지 · 미리 받기 ' + Math.round(ahead) + '초');
        } else {
          setStatus('일시정지 · 미리 받는 중');
        }
      }
      if (isLive || !duration) {
        if ($('npTime')) $('npTime').textContent = isLive ? 'LIVE' : tv.fmtDur(currentPos());
        if ($('seekWrap') && !paused) $('seekWrap').style.display = 'none';
        return;
      }
      paintSeekBar();
    }, 250);

    if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
    syncTimer = setInterval(function () {
      if (!playing || paused) return;
      requestSoundSync();
    }, 2000);

    setStatus(paused ? '일시정지 · 미리 받는 중' : '불러오는 중');
  }

  function patchAudioClicks() {
    var WA = window.JSMpeg && JSMpeg.AudioOutput && JSMpeg.AudioOutput.WebAudio;
    if (!WA || WA.prototype.__noclick) return;
    WA.prototype.__noclick = true;
    WA.prototype.destroy = function () {
      if (this._srcs) {
        while (this._srcs.length) {
          var s = this._srcs.shift();
          try { if (s.stop) s.stop(); } catch (e0) {}
          try { s.disconnect(); } catch (e1) {}
        }
      }
      this.startTime = 0;
      this.mediaOrigin = null;
      try { this.gain.disconnect(); } catch (e) {}
      this.context._connections = Math.max(0, (this.context._connections || 1) - 1);
    };
    WA.prototype.getEnqueuedTime = function () {
      if (!this.context) return 0;
      return Math.max(0, this.startTime - this.context.currentTime);
    };
    WA.prototype.speakerTime = function () {
      if (this.mediaOrigin == null || !this.context) return 0;
      return Math.max(0, this.context.currentTime - this.mediaOrigin);
    };
    WA.prototype.play = function (rate, left, right) {
      if (paused) return;
      if (prerolling) {
        if (!this._pending) this._pending = [];
        this._pending.push({
          rate: rate,
          left: left.slice ? left.slice() : new Float32Array(left),
          right: right.slice ? right.slice() : new Float32Array(right)
        });
        return;
      }
      if (!this.enabled) return;
      this.unlocked = true;
      try {
        if (this.context && this.context.state !== 'running' && this.context.resume) this.context.resume();
      } catch (e) {}
      var ctx = this.context;
      var now = ctx.currentTime;
      var nSamp = left.length;
      var dur = nSamp / rate;
      var offset = 0;
      if (this.startTime < now) {
        offset = now - this.startTime;
        if (offset >= dur) {
          this.startTime += dur;
          audioMediaCursor += dur;
          return;
        }
      }
      var buf = ctx.createBuffer(2, nSamp, rate);
      var ch0 = buf.getChannelData(0);
      var ch1 = buf.getChannelData(1);
      ch0.set(left);
      ch1.set(right);
      if (offset > 0) {
        var fadeAt = Math.floor(offset * rate);
        var fadeN = Math.min(64, nSamp - fadeAt);
        var f = 0;
        for (; f < fadeN; f++) {
          var g = f / fadeN;
          ch0[fadeAt + f] *= g;
          ch1[fadeAt + f] *= g;
        }
      }
      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.destination);
      var when = this.startTime + offset;
      if (Math.abs(this.gain.gain.value - this.volume) > 0.01) this.gain.gain.value = this.volume;
      src._mediaAt = audioMediaCursor + offset;
      src._ctxAt = when;
      src._dur = dur - offset;
      var out = this;
      src.onended = function () {
        try { src.disconnect(); } catch (e2) {}
        if (!out._srcs) return;
        var k = 0;
        while (k < out._srcs.length) {
          if (out._srcs[k] === src) out._srcs.splice(k, 1);
          else k++;
        }
      };
      try { src.start(when, offset); } catch (e3) { src.start(when); }
      this.startTime += dur;
      audioMediaCursor += dur;
      if (!this._srcs) this._srcs = [];
      this._srcs.push(src);
    };
  }

  function pendingAudioSec(out) {
    var p = out && out._pending;
    if (!p || !p.length) return 0;
    var s = 0, i;
    for (i = 0; i < p.length; i++) s += p[i].left.length / p[i].rate;
    return s;
  }

  function flushPrerollAudio(out) {
    if (!out) return;
    var pend = out._pending || [];
    out._pending = [];
    prerolling = false;
    rebuffering = false;
    try {
      var ctx = out.context;
      var now = ctx ? ctx.currentTime : 0;
      if (!(out.startTime > now)) out.startTime = now;
      if (ctx && ctx.state !== 'running' && ctx.resume) ctx.resume();
    } catch (e0) {}
    var i;
    for (i = 0; i < pend.length; i++) {
      out.play(pend[i].rate, pend[i].left, pend[i].right);
    }
  }

  function beginRebuffer() {
    if (ended || streamEnded || paused || prerolling || !player) return;
    prerolling = true;
    rebuffering = true;
    prerollAt = Date.now();
    sendStreamCtrl(false);
    try {
      var ctx = player.audioOut && player.audioOut.context;
      if (ctx && ctx.state === 'running' && ctx.suspend) ctx.suspend();
    } catch (e) {}
    setStatus('불러오는 중');
  }

  function shouldRebuffer() {
    if (ended || streamEnded || paused || prerolling || !player) return false;
    if (videoStartWall && Date.now() - videoStartWall < 2500) return false;
    var q = queuedAudio();
    var packed = packedAhead();
    return q < 0.4 && packed < 0.3;
  }

  function patchMpegPacing() {
    if (!window.JSMpeg || !JSMpeg.Player || JSMpeg.Player.prototype.__pace) return;
    JSMpeg.Player.prototype.__pace = true;
    JSMpeg.Player.prototype.updateForStreaming = function () {
      applyStreamHold();
      if (ended || paused) return;
      if (streamEnded && supplyDrained()) {
        finishPlayback();
        return;
      }
      if (this.audioOut) {
        this.audioOut.unlocked = true;
        try {
          if (!prerolling && this.audioOut.context && this.audioOut.context.state !== 'running' && this.audioOut.context.resume) {
            this.audioOut.context.resume();
          }
        } catch (e) {}
      }
      if (!prerolling && shouldRebuffer()) {
        beginRebuffer();
      }
      if (!lastVideoDecodeAt && Date.now() - prerollAt > 8000 && netBytes > 4000) {
        restartDeadVideoStream('restart-no-video-first-frame');
        return;
      }
      if (lastVideoDecodeAt && Date.now() - lastVideoDecodeAt > 4000) {
        restartDeadVideoStream('restart-video-stalled', {
          stalledMs: Date.now() - lastVideoDecodeAt
        });
        return;
      }
      if (prerolling) {
        var need = isLive ? 0.8 : PREROLL_SEC;
        var n = 0;
        while (this.audio && pendingAudioSec(this.audioOut) < need && n < 24) {
          n++;
          if (!this.audio.decode()) break;
        }
        if (this.video && this.video.currentTime === 0) this.video.decode();
        var readyA = pendingAudioSec(this.audioOut);
        var readyV = this.video && this.video.currentTime > 0;
        var waited = prerollAt ? (Date.now() - prerollAt) : 0;
        var minA = rebuffering ? 0.8 : 0.3;
        var maxWait = rebuffering ? 20000 : 8000;
        if ((readyA >= need && readyV) || (waited > maxWait && readyA > minA && readyV)) {
          flushPrerollAudio(this.audioOut);
          setStatus('재생');
        } else {
          if (rebuffering && waited > 8000 && nearEnd() && supplyDrained()) {
            finishPlayback();
            return;
          }
          applyStreamHold();
          return;
        }
      }
      if (this.audio && this.audioOut && this.audioOut.enabled) {
        var queued = this.audioOut.enqueuedTime || 0;
        var n2 = 0;
        while (queued < AUDIO_QUEUE_SEC && n2 < 48) {
          n2++;
          if (!this.audio.decode()) break;
          queued = this.audioOut.enqueuedTime || 0;
        }
      }
      if (!this.video) return;
      skipVideoToSound(this);
      applyStreamHold();
      if (needStreamRestart) restartFromSound();
    };
  }

  function launchPlayer(wsUrl) {
    if (player) { try { player.destroy(); } catch (e) {} player = null; }
    clock0 = 0;
    fpsCount = 0;
    lastFps = Date.now();
    videoStartWall = 0;
    netBytes = 0;
    pauseNet0 = -1;
    audioMediaCursor = 0;
    videoShownAt = 0;
    videoFrames = 0;
    videoCatching = false;
    lastHeard = 0;
    resumeHeard = 0;
    resumePending = false;
    streamHeld = false;
    needStreamRestart = false;
    overflowFails = 0;
    videoFail = 0;
    soundResyncing = false;
    prerolling = true;
    prerollAt = Date.now();
    rebuffering = false;
    ended = false;
    streamEnded = false;
    try {
      patchMpegPacing();
      patchAudioClicks();
      player = new JSMpeg.Player(wsUrl, {
        canvas: stage,
        audio: true,
        streaming: true,
        reconnectInterval: 0,
        maxBufferSize: 8 * 1024 * 1024,
        audioBufferSize: 2 * 1024 * 1024,
        videoBufferSize: 4 * 1024 * 1024,
        maxAudioLag: 4.5,
        disableWebAssembly: true,
        decodeFirstFrame: true,
        pauseWhenHidden: false,
        preserveDrawingBuffer: false,
        disableWebAudio: false,
        onSourceCompleted: function () { markStreamEnded(); },
        onVideoDecode: function () {
          if (!videoStartWall) {
            videoStartWall = Date.now();
            clock0 = Date.now();
            fitStage();
          }
          fpsCount++;
          var now = Date.now();
          if (now - lastFps >= 1000) {
            $('npFps').textContent = outHeight() + 'p · ' + fps + 'fps · ' + fpsCount + ' FPS';
            fpsCount = 0;
            lastFps = now;
          }
        }
      });
      hardenBits(player.audio);
      hardenBits(player.video);
      if (player.audioOut) {
        player.audioOut.startTime = 0;
        player.audioOut.mediaOrigin = null;
        player.audioOut._srcs = [];
        player.audioOut.enabled = true;
        player.audioOut.unlocked = true;
      }
      applyPlayerVol();
      fitStage();
      disableReconnect();
      hookNetBytes();
      setTimeout(hookNetBytes, 200);
      setTimeout(hookNetBytes, 1000);
    } catch (e) {
      setStatus('플레이어 오류: ' + e.message);
    }
  }

  function hookNetBytes() {
    if (!player || !player.source) return;
    var src = player.source;
    if (src.__byteHook) {
      if (src.socket && src.__onMsg) src.socket.onmessage = src.__onMsg;
      return;
    }
    if (!src.onMessage) return;
    var orig = src.onMessage.bind(src);
    src.__onMsg = function (ev) {
      if (ev && typeof ev.data === 'string') {
        try {
          var msg = JSON.parse(ev.data);
          if (msg && msg.type === 'ended') markStreamEnded();
        } catch (e0) {}
        return;
      }
      try {
        if (ev && ev.data && ev.data.byteLength) netBytes += ev.data.byteLength;
      } catch (e) {}
      orig(ev);
    };
    src.__byteHook = true;
    src.onMessage = src.__onMsg;
    if (src.socket) src.socket.onmessage = src.__onMsg;
    if (!src.__endHook) {
      src.__endHook = true;
      var origClose = src.onClose ? src.onClose.bind(src) : null;
      src.onClose = function () {
        disableReconnect();
        if (origClose) origClose();
        if (!ended && playing && (streamEnded || nearEnd())) markStreamEnded();
      };
      if (src.socket) src.socket.onclose = src.onClose.bind(src);
    }
  }

  function seekTo(sec) {
    if (!playing) return;
    if (isLive) return;
    if (sec < 0) sec = 0;
    if (duration && sec > duration - 2) sec = Math.max(0, duration - 2);
    seeking = false;
    seekSent = Date.now();
    if (paused) {
      playUrl(playing, sec, { keepPaused: true });
      return;
    }
    pausePos = -1;
    playUrl(playing, sec);
  }

  function seekPctFromEvent(e) {
    var wrap = $('seekWrap');
    if (!wrap || !duration) return 0;
    var x = e.clientX;
    if (e.changedTouches && e.changedTouches[0]) x = e.changedTouches[0].clientX;
    else if (e.touches && e.touches[0]) x = e.touches[0].clientX;
    var r = wrap.getBoundingClientRect();
    var w = r.width || 1;
    var pct = (x - r.left) / w;
    if (pct < 0) pct = 0;
    if (pct > 1) pct = 1;
    return pct;
  }

  function previewSeek(pct) {
    seekPick = pct * duration;
    if ($('seekPlay')) $('seekPlay').style.width = (pct * 100) + '%';
    if ($('seekKnob')) $('seekKnob').style.left = (pct * 100) + '%';
    if ($('seek')) $('seek').value = String(seekPick);
    if ($('npTime')) $('npTime').textContent = fmtPlayClock(seekPick) + ' / ' + fmtPlayClock(duration);
  }

  function flashTap(symbol) {
    var icon = $('tapIcon');
    if (!icon) return;
    icon.textContent = symbol;
    icon.className = 'tap-icon show';
    if (tapHide) clearTimeout(tapHide);
    tapHide = setTimeout(function () { icon.className = 'tap-icon'; }, 500);
  }

  function onPlayerTap() {
    unlockPlaybackAudio();
    if (!playing || !videoStartWall) return;
    togglePause();
  }

  function holdPlayback() {
    if (!player) return;
    hookNetBytes();
    pauseUnread = bitsUnread(player.audio) + bitsUnread(player.video);
    pauseNet0 = netBytes;
    if (player.audioOut) {
      player.audioOut.enabled = false;
      try { if (player.audioOut.gain) player.audioOut.gain.gain.value = 0; } catch (e5) {}
      var ctx = player.audioOut.context;
      if (ctx && ctx.state === 'running' && ctx.suspend) {
        try { ctx.suspend(); } catch (e6) {}
      }
    }
  }

  function resumePlayback() {
    if (!player) return;
    resumeAt = Date.now();
    resumePending = true;
    videoCatching = true;
    sendStreamCtrl(false);
    resumeHeard = pauseHeard > 0 ? pauseHeard : lastHeard;
    if (player.audioOut) {
      player.audioOut.enabled = true;
      player.audioOut.unlocked = true;
      var ctx = player.audioOut.context;
      var live = playingSoundTime({ fallback: false });
      if (!(live > 0)) {
        try {
          var decT = player.audio && player.audio.decodedTime;
          if (decT > 0) audioMediaCursor = decT;
          else if (pauseHeard > 0) audioMediaCursor = pauseHeard;
          if (ctx) player.audioOut.startTime = ctx.currentTime;
        } catch (e0) {}
      }
      try {
        if (ctx && ctx.state !== 'running' && ctx.resume) {
          var p = ctx.resume();
          if (p && p.then) {
            p.then(function () {
              if (paused || !player) return;
              skipVideoToSound(player);
            });
          }
        }
      } catch (e) {}
      applyPlayerVol();
    }
    player.wantsToPlay = true;
    player.paused = false;
    unlockPlaybackAudio();
    if (!player.animationId && player.play) player.play();
    skipVideoToSound(player);
    scheduleResumeSync(0);
  }

  function togglePause() {
    if (!playing) return;
    if (ended) {
      ended = false;
      playUrl(playing, 0);
      return;
    }
    if (!paused) {
      if (!player) return;
      pausePos = currentPos();
      pauseHeard = playingSoundTime();
      if (!(pauseHeard > 0)) {
        try {
          pauseHeard = (player.video && player.video.currentTime) || 0;
        } catch (e0) { pauseHeard = 0; }
      }
      if (pauseHeard > 0) lastHeard = pauseHeard;
      paused = true;
      holdPlayback();
      applyStreamHold();
      if (na) { try { na.pause(); } catch (e) {} }
      $('btnPause').textContent = '재생';
      flashTap('▶');
      applyChrome();
      paintSeekBar();
      setStatus('일시정지 · 미리 받는 중');
    } else {
      paused = false;
      $('btnPause').textContent = '일시정지';
      flashTap('❚❚');
      applyChrome();
      if (!player) {
        var resumeSec = pausePos >= 0 ? pausePos : startAt;
        pausePos = -1;
        playUrl(playing, resumeSec);
      } else {
        videoCatching = true;
        resumePlayback();
      }
      paintSeekBar();
      setStatus('재생');
    }
  }

  function applyChrome() {
    var box = $('playerBox');
    if (!box) return;
    var cls = 'player-box on';
    if (fsOn) cls += ' fs';
    if (paused) cls += ' paused';
    box.className = cls;
    document.body.className = fsOn ? 'player-fs' : '';
    if ($('btnFs')) $('btnFs').textContent = fsOn ? '전체화면 종료' : '전체화면';
    fitStage();
  }

  function applyInlineAr() {
    if (fsOn) return;
    if (!stage || !stage.parentNode) return;
    var wrap = stage.parentNode;
    wrap.style.position = 'relative';
    wrap.style.left = '';
    wrap.style.top = '';
    wrap.style.right = '';
    wrap.style.bottom = '';
    wrap.style.width = '100%';
    wrap.style.height = '0';
    wrap.style.margin = '';
    wrap.style.transform = '';
    wrap.style.paddingBottom = (100 / (videoAr > 0.1 ? videoAr : (16 / 9))) + '%';
  }

  function fitStage() {
    if (!stage || !stage.parentNode) return;
    var wrap = stage.parentNode;
    if (!fsOn) {
      applyInlineAr();
      return;
    }
    var vw = window.innerWidth || 1280;
    var vh = window.innerHeight || 720;
    var ar = videoAr > 0.1 ? videoAr : (16 / 9);
    var w, h;
    if (vw / vh > ar) {
      h = vh;
      w = Math.round(h * ar);
    } else {
      w = vw;
      h = Math.round(w / ar);
    }
    wrap.style.paddingBottom = '0';
    wrap.style.position = 'absolute';
    wrap.style.left = '50%';
    wrap.style.top = '50%';
    wrap.style.right = '';
    wrap.style.bottom = '';
    wrap.style.width = w + 'px';
    wrap.style.height = h + 'px';
    wrap.style.margin = '0';
    wrap.style.transform = 'translate(-50%, -50%)';
  }

  function setFs(on) {
    var box = $('playerBox');
    if (!box) return;
    fsOn = !!on;
    applyChrome();
    setTimeout(fitStage, 0);
    setTimeout(fitStage, 80);
  }

  function applyPlayerVol() {
    var pct = parseInt(($('vol') && $('vol').value) || '100', 10);
    var v = Math.max(0, Math.min(100, pct)) / 100;
    if (player) {
      try { player.volume = v; } catch (e) {}
    }
    if (na) { na.volume = v; na.muted = pct <= 0; }
  }

  function snapVideoToAudio() {
    requestSoundSync();
  }

  function goWatch(id, url) {
    saveBrowseState();
    rememberWatch(id, url);
    if (id) location.href = tv.url('/watch/?v=' + encodeURIComponent(id));
    else if (url) location.href = tv.url('/watch/?url=' + encodeURIComponent(url));
  }

  function clearWatchSearchResults() {
    beginReq();
    lastQuery = '';
    lastSearchItems = [];
    lastSearchChannels = [];
    lastItems = [];
    lastChannels = [];
    if ($('qWatch')) $('qWatch').value = '';
    if ($('qWatchTab')) $('qWatchTab').value = '';
    showLibTools(false);
    showSubsRail(false);
    setChip('search');
    resetPager('search', { q: '' });
    pager.more = false;
    paintMoreBar();
    if ($('relH')) $('relH').textContent = '검색 결과';
    setStatus('검색');
    if (list) list.innerHTML = '<div class="notice">다른 동영상을 검색해 보세요.</div><div class="watch-fill"></div>';
  }

  function doWatchSearch(raw) {
    var q = String(raw || '').trim();
    if ($('qWatch')) $('qWatch').value = q;
    if ($('qWatchTab')) $('qWatchTab').value = q;
    if (!q) {
      clearWatchSearchResults();
      return;
    }
    if (looksLikeUrl(q)) {
      var wm = q.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([a-zA-Z0-9_-]{11})/) || (/^[a-zA-Z0-9_-]{11}$/.test(q) ? [0, q] : null);
      goWatch(wm && wm[1], q);
      return;
    }
    if ($('relH')) $('relH').textContent = '검색 결과';
    search(q);
  }
  if ($('btnWatchSearch')) $('btnWatchSearch').onclick = function () {
    doWatchSearch(($('qWatch') && $('qWatch').value) || '');
  };
  if ($('qWatch')) $('qWatch').onkeydown = function (e) {
    if (e.key === 'Enter') doWatchSearch(this.value);
  };
  if ($('btnWatchTabSearch')) $('btnWatchTabSearch').onclick = function () {
    doWatchSearch(($('qWatchTab') && $('qWatchTab').value) || '');
  };
  if ($('qWatchTab')) $('qWatchTab').onkeydown = function (e) {
    if (e.key === 'Enter') doWatchSearch(this.value);
  };

  if ($('btnGo')) $('btnGo').onclick = function () {
    var q = $('q').value.trim();
    if (!q) {
      lastQuery = '';
      lastSearchItems = [];
      lastSearchChannels = [];
      if ($('q')) $('q').value = '';
      loadHome();
      return;
    }
    if (looksLikeUrl(q)) {
      var m = q.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([a-zA-Z0-9_-]{11})/) || (/^[a-zA-Z0-9_-]{11}$/.test(q) ? [0, q] : null);
      goWatch(m && m[1], q);
      return;
    }
    search(q);
  };
  if ($('q')) $('q').onkeydown = function (e) { if (e.key === 'Enter' && $('btnGo')) $('btnGo').click(); };
  if ($('btnAppHome')) $('btnAppHome').onclick = function () { tv.home(); };
  if ($('btnYtHome')) $('btnYtHome').onclick = function (e) {
    if (e && e.preventDefault) e.preventDefault();
    goYtHome();
  };
  function reloadWatch() {
    var id = (watchItem && watchItem.id) || qsVal('v') || (readWatch() && readWatch().v) || '';
    var url = playing || (watchItem && watchItem.url) || '';
    rememberWatch(id, url);
    unlockPlaybackAudio();
    if (id) {
      location.replace(tv.url('/watch/?v=' + encodeURIComponent(id) + '&r=' + Date.now()));
      return;
    }
    if (url) {
      location.replace(tv.url('/watch/?url=' + encodeURIComponent(url) + '&r=' + Date.now()));
      return;
    }
    location.reload();
  }
  if ($('btnWatchReload')) $('btnWatchReload').onclick = function () { reloadWatch(); };
  if ($('btnWatchBack')) $('btnWatchBack').onclick = function () {
    stop(false);
    location.href = tv.url('/player/');
  };
  if ($('btnStop')) $('btnStop').onclick = function () { stop(false); setStatus('정지'); };
  if ($('btnPause')) $('btnPause').onclick = togglePause;
  if ($('btnFromStart')) $('btnFromStart').onclick = function () {
    if (!playing) return;
    playUrl(playing, 0);
  };
  if ($('tapLayer')) $('tapLayer').onclick = onPlayerTap;
  if ($('btnBack')) $('btnBack').onclick = function () { seekTo(currentPos() - 10); };
  if ($('btnFwd')) $('btnFwd').onclick = function () { seekTo(currentPos() + 10); };
  if ($('btnFs')) $('btnFs').onclick = function (e) { if (e) e.stopPropagation(); setFs(!fsOn); };
  var lastVol = 100;
  function setVol(pct) {
    pct = Math.max(0, Math.min(100, pct));
    if ($('vol')) $('vol').value = String(pct);
    var v = pct / 100;
    applyPlayerVol();
    if (na) { na.volume = v; na.muted = pct <= 0; }
    if ($('btnMute')) $('btnMute').textContent = pct <= 0 ? '✕' : '♪';
  }
  if ($('vol')) $('vol').oninput = function () {
    lastVol = parseInt(this.value, 10) || 0;
    setVol(lastVol);
  };
  if ($('btnMute')) $('btnMute').onclick = function () {
    var cur = parseInt(($('vol') && $('vol').value) || '100', 10);
    if (cur > 0) { lastVol = cur; setVol(0); }
    else setVol(lastVol || 100);
  };
  if ($('seekWrap')) {
    var wrap = $('seekWrap');
    wrap.ontouchstart = function (e) {
      if (!duration) return;
      seekTouch = true;
      seeking = true;
      previewSeek(seekPctFromEvent(e));
      if (e.preventDefault) e.preventDefault();
    };
    wrap.ontouchmove = function (e) {
      if (!seeking) return;
      previewSeek(seekPctFromEvent(e));
      if (e.preventDefault) e.preventDefault();
    };
    wrap.ontouchend = function (e) {
      if (!seeking) return;
      previewSeek(seekPctFromEvent(e));
      seekTo(seekPick);
    };
    wrap.onmousedown = function (e) {
      if (seekTouch) return;
      if (!duration) return;
      seeking = true;
      previewSeek(seekPctFromEvent(e));
    };
    wrap.onmousemove = function (e) {
      if (seekTouch || !seeking) return;
      previewSeek(seekPctFromEvent(e));
    };
    wrap.onmouseup = function (e) {
      if (seekTouch) { seekTouch = false; return; }
      if (!seeking) return;
      previewSeek(seekPctFromEvent(e));
      seekTo(seekPick);
    };
    wrap.onmouseleave = function () {
      if (seekTouch || !seeking) return;
      seeking = false;
    };
    wrap.onclick = function (e) {
      if (seekTouch) { seekTouch = false; return; }
      if (Date.now() - seekSent < 500) return;
      if (!duration) return;
      previewSeek(seekPctFromEvent(e));
      seekTo(seekPick);
      if (e.stopPropagation) e.stopPropagation();
    };
  }
  if ($('seek')) {
    $('seek').oninput = function () {
      if (!duration) return;
      seeking = true;
      var v = parseFloat(this.value) || 0;
      previewSeek(Math.max(0, Math.min(1, v / duration)));
    };
    $('seek').onchange = function () {
      seekTo(parseFloat(this.value) || 0);
    };
  }

  function bindToggleBtns(sel, cls, apply, restart) {
    var btns = document.querySelectorAll(sel);
    for (var i = 0; i < btns.length; i++) {
      btns[i].onclick = function () {
        apply(this);
        for (var j = 0; j < btns.length; j++) btns[j].className = 'ctrl ' + cls;
        this.className = 'ctrl ' + cls + ' on';
        if (restart !== false && playing) playUrl(playing, currentPos());
      };
    }
  }
  bindToggleBtns('.qbtn', 'qbtn', function (el) {
    quality = parseInt(el.getAttribute('data-q'), 10) || 360;
  });
  bindToggleBtns('.fbtn', 'fbtn', function (el) {
    fps = parseInt(el.getAttribute('data-fps'), 10) === 30 ? 30 : 24;
  });
  bindToggleBtns('.rbtn', 'rbtn', function (el) {
    vbrLow = el.getAttribute('data-vbr') === 'low';
  });
  bindToggleBtns('.bbtn', 'bbtn', function (el) {
    var n = parseInt(el.getAttribute('data-buf'), 10);
    bufTarget = (n === 15 || n === 20) ? n : 10;
    applyStreamHold();
  }, false);

  function eventSubEl(from) {
    var t = from;
    while (t && t !== document && !(t.getAttribute && t.getAttribute('data-sub'))) t = t.parentNode;
    if (!t || t === document) return null;
    return t.getAttribute('data-sub') ? t : null;
  }

  function fireSubFromEl(t) {
    if (!t) return;
    var id = t.getAttribute('data-sub');
    if (!id) return;
    var name = t.getAttribute('data-subname') || '';
    var ch = channelById(id);
    if (name && (!ch.name || ch.name === ch.channel_id)) ch.name = name;
    if (lastChannels && lastChannels.length) {
      for (var i = 0; i < lastChannels.length; i++) {
        if (lastChannels[i].channel_id === id) {
          ch = lastChannels[i];
          break;
        }
      }
    }
    toggleSubChannel(ch);
  }

  if (list) {
    list.ontouchend = function (e) {
      var subEl = eventSubEl(e.target);
      if (!subEl) return;
      fireSubFromEl(subEl);
    };
    list.onclick = function (e) {
    var el = e.target;
    var star = e.target;
    while (star && star !== list && !(star.getAttribute && star.getAttribute('data-star'))) star = star.parentNode;
    if (star && star !== list && star.getAttribute('data-star')) {
      if (e.stopPropagation) e.stopPropagation();
      toggleFav(star.getAttribute('data-star'));
      return;
    }
    var subEl = eventSubEl(e.target);
    if (subEl && list.contains(subEl)) {
      if (e.stopPropagation) e.stopPropagation();
      fireSubFromEl(subEl);
      return;
    }
    var chEl = e.target;
    while (chEl && chEl !== list && !(chEl.getAttribute && chEl.getAttribute('data-ch'))) chEl = chEl.parentNode;
    if (chEl && chEl !== list && chEl.getAttribute('data-ch')) {
      openSearchChannel(chEl.getAttribute('data-ch'));
      return;
    }
    while (el && el !== list && !el.getAttribute('data-url') && !el.getAttribute('data-id')) el = el.parentNode;
    if (!el || el === list) return;
    goWatch(el.getAttribute('data-id'), el.getAttribute('data-url'));
  };
  }
  if ($('btnFavWatch')) $('btnFavWatch').onclick = function () {
    var id = this.getAttribute('data-star') || (watchItem && watchItem.id);
    toggleFav(id);
  };
  if ($('btnSub')) $('btnSub').onclick = function () { toggleSub(); };
  if ($('libFilter')) {
    $('libFilter').oninput = function () {
      libFilter = this.value.trim();
      if (currentFeed === 'subs') {
        var vis = filteredSubList();
        renderRail();
        if (!vis.length) {
          if (list) list.innerHTML = '<div class="notice">해당하는 채널이 없습니다</div>';
          return;
        }
        if (!selectedCh || !vis.some(function (ch) { return ch.channel_id === selectedCh; })) {
          openChannel(vis[0].channel_id);
        }
        return;
      }
      if (currentFeed === 'favs') applyLibView();
    };
  }
  if ($('libVidFilter')) {
    $('libVidFilter').oninput = function () {
      libVidFilter = this.value.trim();
      if (currentFeed === 'subs') applyLibView();
    };
  }
  if ($('libSorts')) $('libSorts').onclick = function (e) {
    var s = e.target.getAttribute('data-sort');
    if (!s) return;
    libSort = s;
    var btns = $('libSorts').querySelectorAll('[data-sort]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].className = 'chip' + (btns[i].getAttribute('data-sort') === s ? ' on' : '');
    }
    if (currentFeed === 'favs' || currentFeed === 'subs') applyLibView();
  };
  function paintLogoutLabel() {
    var els = document.querySelectorAll('.js-logout');
    var label = currentPin ? ('로그아웃 ' + currentPin) : '로그아웃';
    for (var i = 0; i < els.length; i++) els[i].textContent = label;
  }

  function doLogout() {
    try { if (fsOn) setFs(false); } catch (e) {}
    try { stop(false); } catch (e) {}
    try { localStorage.removeItem('tv_browse'); } catch (e) {}
    clearSearchBox();
    tv.logout(function () {
      favIds = {};
      subIds = {};
      subList = [];
      libRaw = [];
      lastItems = [];
      selectedCh = '';
      currentPin = '';
      paintLogoutLabel();
      loadFavMap();
      loadSubMap();
      tv.get('/api/auth/status', function (c, d) {
        currentPin = (d && d.pin) || '';
        paintLogoutLabel();
      });
      if (stage) {
        var vid = qsVal('v');
        var u = qsVal('url');
        if (vid) playUrl('https://www.youtube.com/watch?v=' + vid);
        else if (u) playUrl(u);
      } else {
        loadHome();
      }
    });
  }

  var logoutEls = document.querySelectorAll('.js-logout');
  for (var li = 0; li < logoutEls.length; li++) {
    logoutEls[li].onclick = function (e) {
      if (e && e.stopPropagation) e.stopPropagation();
      doLogout();
    };
  }
  if ($('subsRail')) $('subsRail').onclick = function (e) {
    var el = e.target;
    while (el && el !== this && !(el.getAttribute && el.getAttribute('data-ch'))) el = el.parentNode;
    if (!el || el === this) return;
    openChannel(el.getAttribute('data-ch'));
  };

  if ($('moreBar')) $('moreBar').onclick = function () { loadMore(); };
  window.addEventListener('scroll', onScrollMore, false);
  document.addEventListener('touchend', onScrollMore, false);

  function openWatchSearchTab() {
    setChip('search');
    showLibTools(false);
    showSubsRail(false);
    resetPager('search', { q: lastQuery || '' });
    if (!lastQuery) {
      lastItems = [];
      lastChannels = [];
      if (list) list.innerHTML = '<div class="notice">다른 동영상을 검색해 보세요.</div><div class="watch-fill"></div>';
      paintMoreBar();
      setStatus('검색');
      return;
    }
    if (lastSearchItems && lastSearchItems.length) {
      lastItems = lastSearchItems;
      lastChannels = lastSearchChannels;
      renderItems(lastItems, '검색 결과 없음', lastChannels);
      setStatus('"' + lastQuery + '" 검색 결과 ' + lastItems.length + '개');
      return;
    }
    search(lastQuery, 'search');
  }

  function openWatchRelatedTab() {
    setChip('related');
    showLibTools(false);
    showSubsRail(false);
    showRelatedLoading();
    var id = (watchItem && watchItem.id) || qsVal('v') || (readWatch() && readWatch().v) || '';
    var title = (watchItem && watchItem.title) || (($('watchH') && $('watchH').textContent) || '');
    loadRelated(id, title, beginReq());
  }

  function keepWatchScroll(fn) {
    if (!stage) { fn(); return; }
    var y = window.pageYOffset || (document.documentElement && document.documentElement.scrollTop) || 0;
    fn();
    setTimeout(function () {
      try { window.scrollTo(0, y); } catch (e) {}
    }, 0);
  }

  if ($('chips')) $('chips').onclick = function (e) {
    var feed = e.target.getAttribute('data-feed');
    if (!feed) return;
    restoreCh = '';
    pendingScroll = 0;
    if (stage) {
      keepWatchScroll(function () {
        if (feed === 'related') openWatchRelatedTab();
        else if (feed === 'search') openWatchSearchTab();
        else if (feed === 'subs') loadSubs();
        else if (feed === 'favs') loadFavs();
      });
      return;
    }
    if (feed === 'home') loadHome();
    else if (feed === 'subs') loadSubs();
    else if (feed === 'favs') loadFavs();
    else if (feed === 'music') search('음악 공식 뮤직비디오', 'music');
    else if (feed === 'game') search('게임 실황', 'game');
    else if (feed === 'news') search('뉴스 헤드라인', 'news');
  };

  window.addEventListener('resize', function () { if (fsOn) fitStage(); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && fsOn) setFs(false);
    var el = e.target;
    var tag = el && el.tagName ? el.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (el && el.isContentEditable)) return;
    if (e.key === ' ' && playing) { e.preventDefault(); togglePause(); }
    if ((e.key === 'f' || e.key === 'F') && playing) setFs(!fsOn);
  });

  tv.ensurePin(function () {
    tv.get('/api/auth/status', function (c, d) {
      currentPin = (d && d.pin) || '';
      paintLogoutLabel();
    });
    loadFavMap();
    loadSubMap();
    if (stage) {
      unlockAudio();
      setChip('related');
      var w = readWatch();
      if (w.v) playUrl('https://www.youtube.com/watch?v=' + w.v);
      else if (w.url) playUrl(w.url);
      else setStatus('재생할 영상이 없습니다');
    } else {
      restoreBrowse();
    }
  });
})();
