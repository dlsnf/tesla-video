(function () {
  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage'), na = $('na'), st = $('st'), list = $('list');
  var player = null, playing = null, quality = 360, fps = 24, vbrLow = true, streamFormat = '134+140', startAt = 0;
  var preservedStageFrame = '';
  var stageFrameReady = false, stagePrerollReady = false;
  var duration = 0, isLive = false, fpsCount = 0, lastFps = 0;
  var bufEnd = 0;
  var paused = false, tickTimer = null, syncTimer = null, forceTimer = null, audioTimer = null;
  var pausePos = -1;
  var pauseWall = 0;
  var pauseHeard = 0;
  var pauseUnread = -1;
  var resumeAt = 0;
  var lastHeard = 0;
  var lastPlaybackPos = 0;
  var resumeHeard = 0;
  var resumePending = false;
  var resumeSyncTimer = null;
  // Keep enough real audio cushion to absorb transport jitter without letting
  // a long scheduled queue make video recovery visibly late.
  var AUDIO_QUEUE_SEC = 2.5;
  var SEEK_AUDIO_PREROLL_SEC = 3;
  var PREROLL_SEC = 3;
  var bufTarget = 10;
  var VIDEO_CATCH_FRAMES = 2;
  var VIDEO_CATCH_MAX_FRAMES = 24;
  var SYNC_INTERVAL_MS = 250;
  var prerolling = false;
  var prerollAt = 0;
  var prerollTimer = null;
  var rebuffering = false;
  var lastStreamErr = '';
  var netBytes = 0;
  var lastNetGrowthAt = 0;
  var pauseNet0 = -1;
  var streamHeld = false;
  var needStreamRestart = false;
  var overflowFails = 0;
  var videoFail = 0;
  var ended = false;
  var streamEnded = false;
  var repeatEnabled = false;
  var repeatTimer = null;
  var repeatAt = 0;
  var endCoastFrom = 0;
  var endCoastPos = 0;

  function updateRepeatButton() {
    var button = $('btnRepeat');
    if (!button) return;
    button.classList.toggle('on', repeatEnabled);
    button.setAttribute('aria-pressed', repeatEnabled ? 'true' : 'false');
  }
  var audioMediaCursor = 0;
  var videoShownAt = 0;
  var videoFrames = 0;
  var lastVideoDecodeAt = 0;
  var rebufferVideoDecodeAt = 0;
  var lastFrameInterval = 0;
  var lastOutputWatchAt = 0;
  var outputGapSince = 0;
  var seeking = false;
  var seekPick = 0;
  var seekTouch = false;
  var seekSent = 0;
  var seekDebounce = null;
  var pendingSeekSec = null;
  var pendingSeekOpts = null;
  var seekSettleUntil = 0;
  var streamRetry = 0;
  var streamGen = 0;
  var pipeTok = 0;
  var pipeLegacy = false;
  var recoveringStream = false;
  var lastRebufferSkipLog = 0;
  var lastSyncRestart = 0;
  var lastDeadVideoRestart = 0;
  var prerollRecoveryCount = 0;
  var lastSocketRestart = 0;
  var driftSince = 0;
  var driftAlerted = false;
  var videoLeadSince = 0;
  var videoCatching = false;
  var audioStarvedSince = 0;
  var videoStartWall = 0;
  var fsOn = false, tapHide = null, fsControlsTimer = null;
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
  var playbackDebug = !!(window.tv && window.tv.getDebug ? window.tv.getDebug() : /(?:^|[?&])debug=1(?:&|$)/.test(String(window.location.search || '')));
  var lastDebugStatus = '';
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
  var commentsId = '';
  var commentsOffset = 0;
  var commentsMore = false;
  var commentsLoading = false;
  var commentsOpened = false;
  var commentsSort = 'top';
  var commentsCache = { top: [], new: [] };
  var commentsPrefetching = { top: false, new: false };
  var commentsRequestSeq = 0;

  function beginReq() { return ++reqSeq; }
  function stillReq(seq) { return seq === reqSeq; }

  function commentTime(ts, text) {
    if (!ts) return String(text || '작성 시간 확인 불가');
    ts = Number(ts) || 0;
    if (ts > 100000000000) ts /= 1000;
    var diff = Math.max(0, Date.now() - ts * 1000);
    var min = Math.floor(diff / 60000);
    if (min < 1) return '방금';
    if (min < 60) return min + '분 전';
    var hour = Math.floor(min / 60);
    if (hour < 24) return hour + '시간 전';
    return Math.floor(hour / 24) + '일 전';
  }

  function commentLikes(value) {
    if (value == null || value === '') return '좋아요 정보 없음';
    var n = Number(value);
    if (!isFinite(n)) return String(value);
    return n.toLocaleString('ko-KR');
  }

  function commentHtml(item) {
    var meta = '';
    var when = commentTime(item.time, item.timeText);
    if (when) meta = when;
    var author = item.author || 'YouTube 사용자';
    var initial = escapeHtml(author.charAt(0) || '?');
    var avatar = item.avatar
      ? '<img src="' + escapeHtml(item.avatar) + '" alt="" referrerpolicy="no-referrer">'
      : '<span>' + initial + '</span>';
    return '<article class="comment-item"><div class="comment-avatar">' + avatar + '</div><div class="comment-body">'
      + '<div class="comment-author">' + escapeHtml(author) + '<span class="comment-meta">' + escapeHtml(meta) + '</span></div>'
      + '<div class="comment-text">' + escapeHtml(item.text || '') + '</div>'
      + '<div class="comment-actions"><button type="button" aria-label="좋아요"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10v10H4V10h3zm3 10h7.2c.8 0 1.5-.5 1.8-1.3l1.5-5.2c.3-1-.5-2-1.5-2H14l.7-3.4.1-.6c0-.4-.2-.8-.5-1.1L13 5l-5 5v10h2z"/></svg></button>'
      + '<span class="comment-like-count">' + escapeHtml(commentLikes(item.likes)) + '</span><button type="button" aria-label="싫어요"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 14V4h3v10h-3zm-3-10H6.8C6 4 5.3 4.5 5 5.3l-1.5 5.2c-.3 1 .5 2 1.5 2H10l-.7 3.4-.1.6c0 .4.2.8.5 1.1L11 19l5-5V4h-2z"/></svg></button><button class="comment-reply" type="button">답글</button></div>'
      + '</div></article>';
  }

  function setCommentsState(text, loading) {
    var state = $('commentsState');
    if (!state) return;
    state.textContent = text || '';
    state.className = 'comments-state' + (loading ? ' loading' : '');
  }

  function renderCommentsLoading(message) {
    var list = $('commentsList');
    if (!list || list.children.length) return;
    var label = message || '댓글을 불러오는 중...';
    list.innerHTML = '<div class="comments-loading-card" aria-live="polite">'
      + '<span class="comments-loading-spinner" aria-hidden="true"></span>'
      + '<strong>' + escapeHtml(label) + '</strong><span>댓글 정보와 좋아요 수를 가져오고 있습니다</span></div>'
      + '<div class="comment-skeleton"><i></i><div><b></b><em></em><em></em></div></div>'
      + '<div class="comment-skeleton"><i></i><div><b></b><em></em><em></em></div></div>';
  }

  function updateCommentSortButtons() {
    var buttons = document.querySelectorAll('[data-comment-sort]');
    for (var i = 0; i < buttons.length; i++) {
      var selected = buttons[i].getAttribute('data-comment-sort') === commentsSort;
      buttons[i].className = 'comment-sort' + (selected ? ' on' : '');
      buttons[i].setAttribute('aria-pressed', selected ? 'true' : 'false');
    }
  }

  function resetComments(id, type) {
    commentsId = type === 'youtube' ? String(id || '') : '';
    commentsOffset = 0;
    commentsMore = false;
    commentsLoading = false;
    commentsOpened = false;
    commentsSort = 'top';
    commentsCache = { top: [], new: [] };
    commentsPrefetching = { top: false, new: false };
    commentsRequestSeq++;
    updateCommentSortButtons();
    var box = $('commentsBox');
    var panel = $('commentsPanel');
    var list = $('commentsList');
    if (box) box.style.display = commentsId ? 'block' : 'none';
    if (panel) panel.hidden = true;
    if (list) list.innerHTML = '';
    if ($('commentsPreviewText')) $('commentsPreviewText').textContent = commentsId ? '댓글을 불러오는 중...' : '';
    setCommentsState('', false);
    if (commentsId) loadComments(1, true);
  }

  function loadComments(limit, previewOnly) {
    if (!commentsId || commentsLoading) return;
    var requestSeq = ++commentsRequestSeq;
    commentsLoading = true;
    if (!previewOnly && commentsOffset === 0) setCommentsState('', false);
    tv.get('/api/youtube/comments?id=' + encodeURIComponent(commentsId) + '&limit=' + (limit || 10) + '&offset=' + commentsOffset + '&sort=' + commentsSort, function (code, data) {
      if (requestSeq !== commentsRequestSeq) return;
      commentsLoading = false;
      if (!data || !data.ok) {
        if (previewOnly && $('commentsPreviewText')) $('commentsPreviewText').textContent = '댓글을 불러오지 못했습니다';
        setCommentsState('댓글을 불러오지 못했습니다', false);
        return;
      }
      var items = data.items || [];
      if (previewOnly) {
        if ($('commentsPreviewText')) $('commentsPreviewText').textContent = items[0] ? ((items[0].author || '사용자') + ' · ' + items[0].text) : '댓글이 없습니다';
        commentsMore = !!data.more;
        if (commentsOpened && $('commentsList')) {
          $('commentsList').innerHTML = '';
          loadComments(10, false);
        }
        return;
      }
      if (commentsOffset === 0) {
        commentsCache[commentsSort] = [];
        // Replace the initial loading card instead of appending comments
        // beneath it.
        if ($('commentsList')) $('commentsList').innerHTML = '';
      }
      commentsCache[commentsSort] = commentsCache[commentsSort].concat(items);
      var list = $('commentsList');
      if (list) {
        for (var i = 0; i < items.length; i++) list.insertAdjacentHTML('beforeend', commentHtml(items[i]));
      }
      commentsOffset += items.length;
      commentsMore = !!data.more;
      setCommentsState(commentsMore ? '아래로 내리면 더 불러옵니다' : (commentsOffset ? '댓글 끝' : '댓글이 없습니다'), false);
    });
  }

  function openComments() {
    if (!commentsId) return;
    commentsOpened = true;
    var panel = $('commentsPanel');
    if (panel) panel.hidden = false;
    if (commentsLoading) {
      renderCommentsLoading();
      setCommentsState('', false);
    } else if (!$('commentsList') || !$('commentsList').children.length) {
      renderCommentsLoading();
      loadComments(10, false);
    }
    prefetchComments('new');
  }

  function closeComments() {
    commentsOpened = false;
    var panel = $('commentsPanel');
    if (panel) panel.hidden = true;
  }

  function setCommentSort(sort) {
    if (!commentsOpened) return;
    if (!/^(?:top|top-asc|new|new-asc)$/.test(sort) || commentsSort === sort) return;
    commentsSort = sort;
    commentsRequestSeq++;
    commentsLoading = false;
    commentsOffset = 0;
    commentsMore = false;
    updateCommentSortButtons();
    if ($('commentsList')) {
      $('commentsList').scrollTop = 0;
      // Sorting always replaces the list: never leave comments in the old
      // order visible while the selected order is being prepared.
      $('commentsList').innerHTML = '';
    }
    renderCommentsLoading('댓글 정렬 중...');
    setCommentsState('', false);
    var kind = sort.indexOf('new') === 0 ? 'new' : 'top';
    if (commentsPrefetching[kind] && commentsSort === kind) return;
    if (commentsCache[commentsSort] && commentsCache[commentsSort].length) {
      var cachedSort = commentsSort;
      // Keep a short visible loading transition even for an already fetched
      // sort, so the order change is clear and old comments never flash back.
      setTimeout(function () {
        if (!commentsOpened || commentsSort !== cachedSort || !commentsCache[cachedSort]) return;
        commentsOffset = commentsCache[cachedSort].length;
        if ($('commentsList')) $('commentsList').innerHTML = commentsCache[cachedSort].map(commentHtml).join('');
        commentsMore = true;
        setCommentsState('아래로 내리면 더 불러옵니다', false);
      }, 120);
      return;
    }
    loadComments(10, false);
  }

  function prefetchComments(sort) {
    if (!commentsId || commentsPrefetching[sort] || commentsCache[sort].length) return;
    commentsPrefetching[sort] = true;
    tv.get('/api/youtube/comments?id=' + encodeURIComponent(commentsId) + '&limit=20&offset=0&sort=' + sort, function (code, data) {
      commentsPrefetching[sort] = false;
      if (!data || !data.ok) return;
      commentsCache[sort] = data.items || [];
      // A prefetched descending list must never replace an active ascending
      // sort; the ascending request has its own server-side ordering.
      if (commentsOpened && commentsSort === sort && $('commentsList')) {
        commentsOffset = commentsCache[sort].length;
        commentsMore = !!data.more;
        $('commentsList').innerHTML = commentsCache[sort].map(commentHtml).join('');
        setCommentsState(commentsMore ? '아래로 내리면 더 불러옵니다' : '댓글 끝', false);
      }
    });
  }

  function isBotErr(s) {
    return /봇이 아님|not a bot|Sign in to confirm|봇으로 차단|페이지를 새로고침해야|page needs to be reloaded|Forbidden|403|format is not available/i.test(String(s || ''));
  }
  function showBotHelp(on) {
    var b = $('btnBotHelp');
    if (!b) return;
    b.style.display = on ? 'inline-block' : 'none';
  }
  function setStatus(t) {
    if (st) st.textContent = t;
    var stageStatus = $('stageStatus');
    var stageLoader = $('stageLoader');
    var stageRepeat = $('stageRepeat');
    var stageRepeatCount = $('stageRepeatCount');
    var repeatMatch = String(t || '').match(/^(\d+)초 (?:후|뒤에) 다시 재생합니다$/);
    if (stageStatus) {
      var showStageStatus = /재생할 수 없음|플레이어 오류|종료/.test(String(t || ''));
      stageStatus.textContent = showStageStatus ? t : '';
      stageStatus.className = showStageStatus ? 'stage-status on' : 'stage-status';
    }
    if (stageLoader) {
      updateStageLoader(t);
    }
    if (stageRepeat) {
      stageRepeat.className = repeatMatch ? 'stage-repeat on' : 'stage-repeat';
      if (repeatMatch && stageRepeatCount) stageRepeatCount.textContent = repeatMatch[1];
    }
    showBotHelp(isBotErr(t));
    if (playbackDebug && t !== lastDebugStatus) {
      lastDebugStatus = t;
      console.log('[tesla-video status]', t);
    }
  }

  function updateStageLoader(status) {
    var stageLoader = $('stageLoader');
    if (!stageLoader) return;
    var loading = /지정한 위치로 이동 중|불러오는 중/.test(String(status || ''));
    var waitingForPlayback = !!player && (!stageFrameReady || !stagePrerollReady);
    stageLoader.className = loading || waitingForPlayback ? 'stage-loader on' : 'stage-loader';
  }

  function debugPlayback(label, extra) {
    if (!playbackDebug || !window.console || !console.log) return;
    var data = extra || {};
    data.label = label;
    data.at = new Date().toISOString();
    try { console.log('[tesla-video playback]', data); } catch (e) {}
  }

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
    try { localStorage.setItem('tv_hist', JSON.stringify(h.slice(0, 24))); } catch (e) {}
    tv.post('/api/history/watch', {
      id: item.id,
      channel_id: item.channel_id || '',
      title: item.title || '',
      url: item.url || '',
      thumbnail: item.thumbnail || '',
      duration: item.duration || 0,
      uploader: item.uploader || ''
    }, function () {});
  }

  function loadServerHistory() {
    tv.get('/api/history', function (c, d) {
      if (!d || !d.ok || !d.items || !d.items.length) return;
      var cur = historyGet();
      var map = {};
      cur.forEach(function (x) { if (x && x.id) map[x.id] = x; });
      d.items.forEach(function (x) {
        if (!x || !x.id) return;
        if (!map[x.id]) cur.push(x);
      });
      try { localStorage.setItem('tv_hist', JSON.stringify(cur.slice(0, 40))); } catch (e) {}
      if (currentFeed === 'history') render();
    });
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
    if ($('qWatchTab')) $('qWatchTab').value = '';
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

  function formatSubscribers(value) {
    var n = parseInt(value, 10) || 0;
    if (n < 1000) return n ? (n + '명') : '';
    if (n < 10000) return (Math.round(n / 100) / 10).toString().replace(/\.0$/, '') + '천명';
    if (n < 100000000) return (Math.round(n / 1000) / 10).toString().replace(/\.0$/, '') + '만명';
    return (Math.round(n / 1000000) / 100).toString().replace(/\.0+$/, '') + '억명';
  }

  function cardHtml(it) {
    var dur = tv.fmtDur(it.duration);
    var views = tv.fmtViews(it.views);
    var viewsText = views ? ('조회수 ' + views) : cleanName(it.views_text || '');
    var ago = tv.fmtAgo(it.uploaded) || cleanName(it.published || '');
    var on = !!(it.id && favIds[it.id]);
    var chName = cardChannelName(it);
    var html = '<div class="yt-card" data-id="' + escapeHtml(it.id || '') + '" data-url="' + escapeHtml(it.url || ('https://www.youtube.com/watch?v=' + it.id)) + '">';
    html += '<div class="yt-thumb-wrap"><img src="' + escapeHtml(it.thumbnail || '') + '" alt="" loading="lazy" decoding="async">';
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
      html += '<div class="ch-hit-sub">채널' + (formatSubscribers(ch.subscribers) ? ' · 구독자 ' + escapeHtml(formatSubscribers(ch.subscribers)) : '') + '</div></div></td>';
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

  function parkedAudioSec(out) {
    var parked = out && out._parked;
    if (!parked || !parked.length) return 0;
    var sec = 0;
    var i;
    for (i = 0; i < parked.length; i++) sec += parked[i].left.length / parked[i].rate;
    return sec;
  }

  function queuedAudio(pl) {
    pl = pl || player;
    var device = 0;
    try {
      var out = pl && pl.audioOut;
      if (out && out.context) {
        if (out.getEnqueuedTime) {
          var t = out.getEnqueuedTime();
          if (t > 0) device = t;
        }
        if (!(device > 0) && out.startTime > 0) {
          var left = out.startTime - out.context.currentTime;
          if (left > 0) device = left;
        }
        if (!(device > 0) && out.enqueuedTime > 0) device = out.enqueuedTime;
      }
    } catch (e) {}
    if (!(device > 0)) device = 0;
    return device + parkedAudioSec(pl && pl.audioOut);
  }

  function rememberHeard(t) {
    if (t > 0) lastHeard = t;
    return t;
  }

  // Playhead of samples actually handed to the audio device.
  // Decoder time runs ahead while a rebuffer is only queued, and the wall
  // clock keeps moving through a stall. Neither matches what is audible.
  function speakerHeard() {
    try {
      var out = player && player.audioOut;
      if (!out || !out.context || !(out._schedEndMedia > 0) || out._schedEndCtx == null) return 0;
      var ahead = out._schedEndCtx - out.context.currentTime;
      if (ahead < 0) ahead = 0;
      var heard = out._schedEndMedia - ahead;
      return heard > 0 && isFinite(heard) ? heard : 0;
    } catch (e) { return 0; }
  }

  function playingSoundTime(opts) {
    var allowFallback = !(opts && opts.fallback === false);
    var heard = speakerHeard();
    if (heard > 0) return rememberHeard(heard);
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
    if (ended || streamEnded || paused || !playing || !player) return;
    if (Date.now() - lastDeadVideoRestart < 15000) return;
    if (prerolling && prerollRecoveryCount >= 1) {
      failPreroll();
      return;
    }
    var sec = Math.max(0, (currentPos() || 0) - 0.5);
    lastDeadVideoRestart = Date.now();
    if (prerolling) prerollRecoveryCount++;
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
    playUrl(playing, sec, { skipInfo: true, recovery: true });
  }

  // Video bytes can sit unread while playback waits on the next audio packet.
  // That is a short gap, not a dead stream, as long as picture and sound
  // still agree.
  function waitingOnBufferedVideo() {
    if (videoAheadSec() < 1) return false;
    if (audioAheadSec() >= 0.2 || queuedAudio() >= 0.2) return false;
    var vt = player && player.video && isFinite(player.video.currentTime) ? player.video.currentTime : 0;
    var heard = playingSoundTime({ fallback: false });
    if (heard > 0 && Math.abs(vt - heard) > 0.5) return false;
    return true;
  }

  function markCaughtUp() {
    if (resumePending && !liveClockReady()) return;
    videoCatching = false;
    clearPauseClock();
  }

  function skipVideoToSound(pl) {
    if (ended || prerolling || paused || !pl || !pl.video) return;
    if (seekSettleUntil && Date.now() < seekSettleUntil) return;
    var heard = targetHeard();
    if (!(heard > 0)) return;
    var vt = pl.video.currentTime;
    if (!isFinite(vt)) return;
    if (Date.now() - videoStartWall > 3000 && vt - heard > 0.12) {
      if (!videoLeadSince) videoLeadSince = Date.now();
      if (Date.now() - videoLeadSince >= 300 && Date.now() - lastSyncRestart >= 12000) {
        restartFromSound(true);
        return;
      }
    } else if (vt <= heard + 0.25) {
      videoLeadSince = 0;
    }
    var drift = Math.abs(vt - heard);
    if (Date.now() - videoStartWall > 5000 && drift > 0.5) {
      if (!driftSince) driftSince = Date.now();
      if (!driftAlerted && Date.now() - driftSince >= 1200) {
        driftAlerted = true;
        try {
          console.warn('[tesla-video sync] A/V drift detected', {
            startAt: startAt,
            videoTime: vt,
            audioTime: heard,
            drift: vt - heard,
          });
        } catch (eWarn) {}
      }
    } else if (drift < 0.25) {
      driftSince = 0;
    }
    if (vt > heard + 0.04) {
      if (videoCatching) videoCatching = false;
      return;
    }
    if (videoCaughtUp(vt, heard)) {
      markCaughtUp();
      return;
    }
    if (heard - vt > 0.08) videoCatching = true;
    var lag = Math.max(0, heard - vt);
    var cap = videoCatching
      ? Math.min(VIDEO_CATCH_MAX_FRAMES, Math.max(VIDEO_CATCH_FRAMES, Math.ceil(lag * fps * 1.5)))
      : 1;
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

  function monitorOutputClocks() {
    if (ended || prerolling || paused || !player || !videoStartWall) return;
    var audioTime = playingSoundTime({ fallback: false });
    var videoTime = player.video && isFinite(player.video.currentTime) ? player.video.currentTime : 0;
    if (!(audioTime > 0) || !(videoTime >= 0)) return;
    var now = Date.now();
    var frameGap = lastVideoDecodeAt ? now - lastVideoDecodeAt : -1;
    var drift = videoTime - audioTime;
    if (frameGap > 900 && audioAheadSec() < 1.0) {
      if (!outputGapSince) outputGapSince = now;
      if (now - outputGapSince >= 1000) {
        try {
          console.warn('[tesla-video output] video frame gap while audio advances', {
            frameGapMs: frameGap,
            videoTime: videoTime,
            audioTime: audioTime,
            drift: drift,
            frameIntervalMs: lastFrameInterval,
            videoAhead: videoAheadSec(),
            audioAhead: audioAheadSec(),
          });
        } catch (eWarn) {}
      }
    } else if (frameGap >= 0 && frameGap < 400) {
      outputGapSince = 0;
    }
    if (playbackDebug && now - lastOutputWatchAt >= 2000) {
      lastOutputWatchAt = now;
      debugPlayback('output-clock-watch', {
        videoTime: videoTime,
        audioTime: audioTime,
        drift: drift,
        frameGapMs: frameGap,
        frameIntervalMs: lastFrameInterval,
        videoAhead: videoAheadSec(),
        audioAhead: audioAheadSec(),
        queuedAudio: queuedAudio(),
      });
    }
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

  function audiblePos() {
    var heard = playingSoundTime();
    if (heard > 0.02) return startAt + heard;
    if (pausePos >= 0) return pausePos;
    return lastPlaybackPos >= startAt ? lastPlaybackPos : startAt;
  }

  function currentPos() {
    if (paused && pausePos >= 0) {
      lastPlaybackPos = pausePos;
      return pausePos;
    }
    var pos = audiblePos();
    // The title length can be a little longer than the last audible sample.
    // Keep the seconds moving to that label before the repeat countdown,
    // and only after nothing is left to play.
    if (streamEnded && !isLive && duration > 0 && audioPendingSec() < 0.25) {
      var gap = duration - pos;
      if (gap > 0.05 && gap <= 2.5) {
        if (!endCoastFrom) {
          endCoastFrom = Date.now();
          endCoastPos = pos;
        }
        var coast = endCoastPos + (Date.now() - endCoastFrom) / 1000;
        if (coast > pos) pos = coast;
        if (pos > duration) pos = duration;
      } else if (gap <= 0.05) {
        endCoastFrom = 0;
      }
    } else {
      endCoastFrom = 0;
    }
    if (pos > 0.02) {
      // A seek replaces lastPlaybackPos before the new stream starts. Inside
      // one stream the audible clock only moves forward. Any backward step
      // would flip the displayed second.
      if (!(lastPlaybackPos > startAt + 0.25 && pos < lastPlaybackPos)) {
        pausePos = -1;
        lastPlaybackPos = pos;
      }
      return lastPlaybackPos;
    }
    if (pausePos >= 0) return pausePos;
    return lastPlaybackPos >= startAt ? lastPlaybackPos : startAt;
  }

  // A retry after the encode dies must continue from what was on screen.
  // startAt stays at the original request, which is 0 for a normal play.
  function streamResumeSec() {
    var played = currentPos();
    if (!(played > 0.5)) played = lastPlaybackPos > 0 ? lastPlaybackPos : startAt;
    if (played > startAt + 1) return Math.max(0, played - 0.5);
    return Math.max(0, startAt || 0);
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
      var audioSec = bufferLeftSec(player && player.audio, 24000) + queuedAudio();
      var videoSec = bufferLeftSec(player && player.video, vRate);
      var sec = Math.min(audioSec, videoSec);
      var cap = remainSec();
      if (sec > cap) sec = cap;
      return Math.max(0, sec);
    } catch (e) { return 0; }
  }

  function audioAheadSec() {
    return Math.max(0, bufferLeftSec(player && player.audio, 24000) + queuedAudio());
  }

  function videoAheadSec() {
    return Math.max(0, bufferLeftSec(player && player.video, videoByteRate()));
  }

  function videoByteRate() {
    var kb = 600;
    if (quality >= 720) kb = vbrLow ? 1800 : 3000;
    else if (quality >= 480) kb = vbrLow ? 1100 : 1800;
    else kb = vbrLow ? 400 : 600;
    return (kb * 1000) / 8;
  }

  function outHeight() {
    if (quality >= 720) return 720;
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
    var audioFill = fill(player && player.audio);
    var videoFill = fill(player && player.video);
    if (!player || !player.audio || !player.video) return Math.max(audioFill, videoFill);
    return Math.min(audioFill, videoFill);
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
    // A socket close this close to the title is the file finishing, not a
    // stall. It must not start the repeat countdown by itself.
    return currentPos() >= Math.max(0, duration - 1.5);
  }

  function audioPendingSec() {
    return Math.max(0, bufferLeftSec(player && player.audio, 24000) + queuedAudio());
  }

  function readyToFinish() {
    if (isLive || !streamEnded) return false;
    if (audioPendingSec() >= 0.25) return false;
    if (!(duration > 0)) return true;
    var gap = duration - audiblePos();
    if (gap > 2.5) return true;
    return currentPos() >= duration - 0.2;
  }

  function flushDemuxTail() {
    try {
      var demux = player && player.demuxer;
      var info = demux && demux.pesPacketInfo;
      if (!info || !demux.packetComplete) return;
      var ids = Object.keys(info);
      var i;
      for (i = 0; i < ids.length; i++) {
        var pkt = info[ids[i]];
        if (pkt && pkt.currentLength > 0 && pkt.buffers && pkt.buffers.length) demux.packetComplete(pkt);
      }
    } catch (e) {}
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

  function finishPlayback() {
    if (ended || !playing || isLive) return;
    ended = true;
    streamEnded = true;
    prerolling = false;
    rebuffering = false;
    needStreamRestart = false;
    driftSince = 0;
    driftAlerted = false;
    videoLeadSince = 0;
    videoCatching = false;
    paused = true;
    pausePos = duration > 0 ? duration : currentPos();
    disableReconnect();
    holdPlayback();
    if ($('btnPause')) $('btnPause').textContent = '재생';
    applyChrome();
    paintSeekBar();
    setStatus('종료');
    scheduleRepeatPlayback();
  }

  function scheduleRepeatPlayback() {
    if (!repeatEnabled || !playing || isLive || repeatTimer) return;
    var src = playing;
    repeatAt = Date.now() + 3000;
    setStatus('3초 뒤에 다시 재생합니다');
    repeatTimer = setTimeout(function () {
      repeatTimer = null;
      repeatAt = 0;
      if (!repeatEnabled || !src || playing !== src || !ended) return;
      // A repeat is always a new stream from zero. Clear the retained canvas
      // frame too, so a late first frame cannot look like a mid-video restart.
      preservedStageFrame = '';
      if (stage) {
        try { stage.width = stage.width; } catch (eClear) {}
      }
      debugPlayback('repeat-restart', { requestedStart: 0, lastPosition: lastPlaybackPos });
      playUrl(src, 0, { skipInfo: false, repeat: true });
    }, 3000);
  }

  function applyStreamHold() {
    if (ended || !player || isLive) {
      if (isLive) sendStreamCtrl(false);
      return;
    }
    var fill = decoderFill();
    var ahead = packedAhead();
    var q = queuedAudio();
    var audioAhead = audioAheadSec();
    var videoAhead = videoAheadSec();
    var remain = remainSec();
    if (!paused && (audioAhead < 0.8 || videoAhead < 0.5)) {
      sendStreamCtrl(false);
      return;
    }
    var wantHold = false;
    if (paused) {
      if (ahead >= bufTarget || ahead >= remain - 0.2) wantHold = true;
    } else if (ahead >= bufTarget && q > 0.6) {
      wantHold = true;
    } else if (fill >= 0.65 && q > 1.2) {
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
    if (Math.abs(behind) < 0.2) return false;
    var audioAhead = audioAheadSec();
    var videoAhead = videoAheadSec();
    var packed = packedAhead();
    var queued = queuedAudio();
    if (audioAhead > 0.7 || videoAhead > 0.7 || packed > 1.0 || queued > 0.5) return false;
    if (behind > 0.7 && videoFail >= 8 && packed > 0.25 && packed < 1.0) return true;
    if (behind > 1.5 && videoFail >= 4 && packed < 0.8) return true;
    return false;
  }

  function restartFromSound(force) {
    if (ended || streamEnded || paused || !playing || isLive || soundResyncing) return;
    if (Date.now() - lastSyncRestart < 12000) return;
    var src = playing;
    var sec = currentPos();
    if (!(sec >= 0) || !src) return;
    var audioAhead = audioAheadSec();
    var videoAhead = videoAheadSec();
    var packed = packedAhead();
    var queued = queuedAudio();
    if (!force && (audioAhead > 1.0 || videoAhead > 1.0 || packed > 2.0 || queued > 0.8)) {
      debugPlayback('restartFromSound-skip-buffer-present', {
        position: sec,
        heard: playingSoundTime({ fallback: false }),
        videoTime: player && player.video ? player.video.currentTime : -1,
        videoFail: videoFail,
        packedAhead: packed,
        audioAhead: audioAhead,
        videoAhead: videoAhead,
        queuedAudio: queued
      });
      return;
    }
    debugPlayback('restartFromSound', {
      position: sec,
      heard: playingSoundTime({ fallback: false }),
      videoTime: player && player.video ? player.video.currentTime : -1,
      videoFail: videoFail,
      packedAhead: packed,
      audioAhead: audioAhead,
      videoAhead: videoAhead,
      queuedAudio: queued
    });
    lastSyncRestart = Date.now();
    soundResyncing = true;
    needStreamRestart = false;
    videoFail = 0;
    playUrl(src, sec);
  }

  function bufferedAhead() {
    return packedAhead();
  }

  function hardenBits(dec) {
    if (!dec || !dec.bits || dec.bits.__keep) return;
    var bits = dec.bits;
    bits.__keep = true;
    bits.evict = function (need) {
      var consumed = this.index >> 3;
      var cap = this.bytes.length;
      var tail = cap - this.byteLength;
      if (this.index === (this.byteLength << 3) || need > tail + consumed) {
        this.byteLength = 0;
        this.index = 0;
        return;
      }
      if (consumed > 0) {
        if (this.bytes.copyWithin) this.bytes.copyWithin(0, consumed, this.byteLength);
        else this.bytes.set(this.bytes.subarray(consumed, this.byteLength), 0);
        this.byteLength -= consumed;
        this.index -= consumed << 3;
      }
    };
    bits.appendSingleBuffer = function (buf) {
      buf = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
      this.evict(buf.length);
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

  function showSeekBuf(fromSec, aheadSec) {
    var buf = $('seekBuf');
    if (!buf || !duration) return;
    fromSec = Number(fromSec) || 0;
    aheadSec = Number(aheadSec) || 0;
    if (fromSec < 0) fromSec = 0;
    if (aheadSec < 0) aheadSec = 0;
    if (fromSec > duration) fromSec = duration;
    if (fromSec + aheadSec > duration) aheadSec = duration - fromSec;
    buf.style.left = ((fromSec / duration) * 100) + '%';
    buf.style.width = ((aheadSec / duration) * 100) + '%';
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
    var ahead = packedAhead();
    if (ahead > bufTarget) ahead = bufTarget;
    if (ahead > duration - pos) ahead = Math.max(0, duration - pos);
    // Keep the furthest buffered edge stable while the playhead consumes it.
    // It grows when more data arrives and only disappears once playback has
    // actually reached that edge (or a seek/restart resets the stream).
    var observedEnd = pos + ahead;
    if (observedEnd > bufEnd || pos >= bufEnd) bufEnd = observedEnd;
    ahead = Math.max(0, bufEnd - pos);
    var playPct = pos / duration;
    if ($('seekPlay')) $('seekPlay').style.width = (playPct * 100) + '%';
    showSeekBuf(pos, ahead);
    if ($('seekKnob')) $('seekKnob').style.left = (playPct * 100) + '%';
    var clock = fmtPlayClock(pos) + ' / ' + fmtPlayClock(duration);
    if (paused && ahead >= 0.5) clock += ' · +' + Math.round(ahead) + '초';
    if ($('npTime')) $('npTime').textContent = clock;
  }

  function stop(keepBox) {
    streamGen += 1;
    pipeTok += 1;
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
    if (seekDebounce) { clearTimeout(seekDebounce); seekDebounce = null; }
    if (repeatTimer) { clearTimeout(repeatTimer); repeatTimer = null; }
    repeatAt = 0;
    endCoastFrom = 0;
    endCoastPos = 0;
    updateRepeatButton();
    playing = null;
    paused = false;
    pauseWall = 0;
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
    if (prerollTimer) { clearTimeout(prerollTimer); prerollTimer = null; }
    rebuffering = false;
    ended = false;
    streamEnded = false;
    stageFrameReady = false;
    stagePrerollReady = false;
    updateStageLoader('');
    if ($('loadingCurtain')) $('loadingCurtain').className = 'loading-curtain';
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

  function captureStageFrame() {
    if (!stage || !stage.width || !stage.height || !videoStartWall) return '';
    try { return stage.toDataURL('image/png'); }
    catch (e) { return ''; }
  }

  function restoreStageFrame() {
    var frame = $('stageFrame');
    if (!frame || !preservedStageFrame) return;
    frame.src = preservedStageFrame;
    frame.className = 'stage-frame on';
  }

  function revealPlayback() {
    if ($('stageLoadingBg')) $('stageLoadingBg').className = 'stage-loading-bg';
    if ($('loadingCurtain')) $('loadingCurtain').className = 'loading-curtain';
    document.body.classList.remove('watch-loading');
  }

  function sameWatch(src) {
    if (!src) return false;
    if (playing && playing === src) return true;
    if (watchItem && watchItem.url && watchItem.url === src) return true;
    if (watchItem && watchItem.id && src.indexOf(watchItem.id) >= 0) return true;
    return false;
  }

  function playUrl(src, seek, opts) {
    opts = opts || {};
    var useLegacy = !!opts.legacy;
    if (!opts.recovery) prerollRecoveryCount = 0;
    var playSeq = beginReq();
    var keepPaused = !!opts.keepPaused;
    var skipInfo = !!opts.skipInfo && duration > 0 && sameWatch(src);
    preservedStageFrame = '';
    if ($('stageLoadingBg')) $('stageLoadingBg').className = 'stage-loading-bg on';
    if ($('loadingCurtain')) $('loadingCurtain').className = 'loading-curtain on';
    wakeAudio();
    stop(true);
    playing = src;
    startAt = seek || 0;
    lastPlaybackPos = startAt;
    bufEnd = startAt;
    showSeekBuf(startAt, 0);
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
    $('npFps').textContent = outHeight() + 'p · ' + fps + 'fps · 0 FPS';
    if (skipInfo) {
      paintSeekBar();
      streamRetry = 0;
      var tok = ++pipeTok;
      var src0 = src;
      var at0 = startAt;
      setTimeout(function () {
        if (tok !== pipeTok || playing !== src0) return;
        startAt = at0;
        pipeLegacy = useLegacy;
        startPipes(src0);
      }, 120);
      return;
    }
    $('npTitle').textContent = '불러오는 중...';
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
        if ($('loadingCurtain')) $('loadingCurtain').className = 'loading-curtain';
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
      historyAdd({ id: info.id, channel_id: info.channel_id || '', title: info.title, url: info.pageUrl || src, thumbnail: info.thumbnail, duration: duration, uploader: info.uploader, views: info.views || 0 });
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
      resetComments(info.id, info.type);
      if ($('chName')) $('chName').textContent = watchChannel.name || watchChannel.channel_id || '';
      rememberAvatars([watchChannel]);
      paintWatchStar();
      paintSubBtn();
      pipeLegacy = useLegacy;
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

  function wsUrlFor(src, start, refresh, legacy) {
    return tv.ws('/ws/mpeg1?url=' + encodeURIComponent(src) + '&quality=' + quality + '&fps=' + fps + '&vbr=' + (vbrLow ? 'low' : 'norm') + '&format=' + encodeURIComponent(streamFormat) + '&start=' + encodeURIComponent(String(start || 0)) + (refresh ? '&refresh=1' : '') + (legacy ? '&legacy=1' : ''));
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
      // CachedContext is the playback context. Resuming it while paused
      // plays the queued buffers out in silence and leaves the picture behind.
      if (paused) return;
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
    if (paused) return;
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
    // Audio and video must come from the same MPEG-TS timeline.  A separate
    // HTML audio request races the canvas decoder at startup and drifts after
    // a seek or reconnect, especially on the in-car browser.
    videoStartWall = 0;
    driftSince = 0;
    driftAlerted = false;
    videoLeadSince = 0;
    unlockAudio();
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    var legacy = pipeLegacy;
    pipeLegacy = false;
    launchPlayer(wsUrlFor(src, startAt, legacy || startAt > 2, legacy));
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
    var failWait = 45000;
    if (startAt > 2) failWait += Math.min(120000, Math.floor(startAt) * 500);
    forceTimer = setTimeout(function () {
      forceTimer = null;
      if (!playing || paused || ended) return;
      if ((prerolling || !videoStartWall) && netBytes < 8000) failPreroll();
    }, failWait);

    tickTimer = setInterval(function () {
      if (!playing) return;
      if (ended) {
        if (repeatAt > Date.now()) {
          setStatus(Math.ceil((repeatAt - Date.now()) / 1000) + '초 뒤에 다시 재생합니다');
        } else {
          setStatus('종료');
        }
        paintSeekBar();
        return;
      }
      if (prerolling && !paused && !lastStreamErr) {
        var cur = st ? st.textContent : '';
        if (!cur || cur === '불러오는 중' || cur === '재생' || /MPEG1|이동 중|위치부터 받는/.test(cur)) {
          setStatus(startAt > 2 ? '지정한 위치로 이동 중...' : '불러오는 중');
        }
      }
      if (paused) {
        hookNetBytes();
        applyStreamHold();
        paintSeekBar();
        var ahead = packedAhead();
        var remain = remainSec();
        var full = remain <= 0.5 || ahead >= bufTarget || ahead >= remain - 0.2 || decoderFill() >= 0.75;
        if (player && player.video && isFinite(player.video.currentTime) && player.video.currentTime > 0.001) {
          stageFrameReady = true;
        }
        if (full && ahead >= 0.5) {
          stagePrerollReady = true;
          updateStageLoader('');
        }
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
      monitorOutputClocks();
      requestSoundSync();
    }, SYNC_INTERVAL_MS);

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
      if (!(this._schedEndMedia > 0) || this._schedEndCtx == null || !this.context) return 0;
      var ahead = this._schedEndCtx - this.context.currentTime;
      if (ahead < 0) ahead = 0;
      var heard = this._schedEndMedia - ahead;
      return heard > 0 && isFinite(heard) ? heard : 0;
    };
    WA.prototype.play = function (rate, left, right) {
      // Keep the PCM. Dropping it advances the decoder without anything to
      // play, so the next sound after resume belongs to a later frame.
      if (prerolling || paused) {
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
      if (!(this.startTime > now - 0.004)) this.startTime = now;
      var nSamp = left.length;
      var dur = nSamp / rate;
      var buf = ctx.createBuffer(2, nSamp, rate);
      var ch0 = buf.getChannelData(0);
      var ch1 = buf.getChannelData(1);
      ch0.set(left);
      ch1.set(right);
      if (this.startTime <= now + 0.003) {
        var fadeN = Math.min(96, nSamp);
        var f = 0;
        for (; f < fadeN; f++) {
          var g = f / fadeN;
          ch0[f] *= g;
          ch1[f] *= g;
        }
      }
      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.destination);
      var when = this.startTime;
      if (Math.abs(this.gain.gain.value - this.volume) > 0.01) this.gain.gain.value = this.volume;
      src._mediaAt = audioMediaCursor;
      src._ctxAt = when;
      src._dur = dur;
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
      try { src.start(when); } catch (e3) { try { src.start(now); } catch (e4) {} }
      this.startTime += dur;
      audioMediaCursor += dur;
      // Anchors describe audio that has been started on the device, not
      // audio still sitting in the preroll queue.
      this._schedEndCtx = this.startTime;
      this._schedEndMedia = audioMediaCursor;
      this.enqueuedTime = Math.max(0, this.startTime - ctx.currentTime);
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

  function trimPendingAudio(pending, seconds) {
    var left = Math.max(0, Number(seconds) || 0);
    while (pending.length && left > 0.0005) {
      var part = pending[0];
      var duration = part.left.length / part.rate;
      if (duration <= left + 0.0005) {
        pending.shift();
        left -= duration;
        continue;
      }
      var samples = Math.min(part.left.length, Math.floor(left * part.rate));
      if (samples > 0) {
        part.left = part.left.subarray(samples);
        part.right = part.right.subarray(samples);
      }
      left = 0;
    }
    return pending;
  }

  function failPreroll(msg) {
    if (!prerolling) return;
    if ($('loadingCurtain')) $('loadingCurtain').className = 'loading-curtain';
    var failedMessage = msg || lastStreamErr;
    prerolling = false;
    if (prerollTimer) { clearTimeout(prerollTimer); prerollTimer = null; }
    var m = failedMessage;
    if (!m) {
      m = startAt > 2
        ? '지정한 위치의 영상을 아직 받지 못했습니다. 시크가 실패한 것이지, 유튜브 차단과는 다를 수 있습니다.'
        : '영상을 시작하지 못했습니다. 스트림이 오지 않았습니다.';
    }
    stop(true);
    setStatus(m);
  }

  function flushPrerollAudio(out) {
    if (!out) return;
    if (prerollTimer) { clearTimeout(prerollTimer); prerollTimer = null; }
    var pend = out._pending || [];
    out._pending = [];
    var fromRebuffer = rebuffering;
    prerolling = false;
    stagePrerollReady = true;
    updateStageLoader('');
    rebuffering = false;
    streamRetry = 0;
    seekSettleUntil = 0;
    try {
      var ctx = out.context;
      var now = ctx ? ctx.currentTime : 0;
      if (!(out.startTime > now + 0.05)) out.startTime = now;
      if (ctx && ctx.state !== 'running' && ctx.resume) ctx.resume();
    } catch (e0) {}
    if (paused) {
      out._pending = pend;
      return;
    }
    // MPEG-TS can begin a seek on the next video keyframe while decoded audio
    // still starts at timestamp zero. Drop that unavailable audio lead so the
    // first audible sample belongs to the frame currently on the canvas.
    // A rebuffer continues the same timeline; trimming it would discard the
    // audio just buffered and jump the clock back to the video decoder head.
    if (!fromRebuffer && player && player.video && isFinite(player.video.currentTime)) {
      var firstVideoTime = Math.max(0, player.video.currentTime);
      if (firstVideoTime > 0.04) {
        trimPendingAudio(pend, firstVideoTime);
        audioMediaCursor = firstVideoTime;
      }
    }
    // Leave one paint interval for the decoded first frame before the first
    // WebAudio buffer is scheduled. This makes the canvas visible when sound
    // begins without introducing perceptible A/V offset.
    try {
      if (out.context) out.startTime = Math.max(out.startTime || 0, out.context.currentTime + 0.035);
    } catch (eStart) {}
    var i;
    for (i = 0; i < pend.length; i++) {
      out.play(pend[i].rate, pend[i].left, pend[i].right);
    }
    debugPlayback('playback-start', {
      start: startAt,
      videoTime: player && player.video ? player.video.currentTime : 0,
      queuedAudio: queuedAudio(),
      audioAhead: audioAheadSec(),
      videoAhead: videoAheadSec(),
      prerollMs: prerollAt ? Date.now() - prerollAt : 0,
      quality: quality,
      bitrateMode: vbrLow ? 'low' : 'normal'
    });
  }

  function beginRebuffer() {
    if (ended || streamEnded || paused || prerolling || !player) return;
    var audioAhead = audioAheadSec();
    var videoAhead = videoAheadSec();
    var packed = packedAhead();
    var queued = queuedAudio();
    if (audioAhead > 1.0 || videoAhead > 1.0 || packed > 1.5 || queued > 0.8) {
      if (!lastRebufferSkipLog || Date.now() - lastRebufferSkipLog > 2000) {
        lastRebufferSkipLog = Date.now();
        debugPlayback('beginRebuffer-skip-buffer-present', {
          audioAhead: audioAhead,
          videoAhead: videoAhead,
          packedAhead: packed,
          queuedAudio: queued,
          videoFail: videoFail,
          lastVideoDecodeMs: lastVideoDecodeAt ? Date.now() - lastVideoDecodeAt : -1
        });
      }
      return;
    }
    debugPlayback('beginRebuffer', {
      audioAhead: audioAhead,
      videoAhead: videoAhead,
      packedAhead: packed,
      queuedAudio: queued,
      videoFail: videoFail,
      lastVideoDecodeMs: lastVideoDecodeAt ? Date.now() - lastVideoDecodeAt : -1,
      audioState: player.audioOut && player.audioOut.context ? player.audioOut.context.state : 'none'
    });
    prerolling = true;
    rebuffering = true;
    rebufferVideoDecodeAt = 0;
    prerollAt = Date.now();
    sendStreamCtrl(false);
    setStatus('불러오는 중');
  }

  function shouldRebuffer() {
    if (ended || streamEnded || paused || prerolling || !player) return false;
    if (videoStartWall && Date.now() - videoStartWall < 2500) return false;
    var audioAhead = audioAheadSec();
    var packed = packedAhead();
    var queued = queuedAudio();
    var decodeStalled = lastVideoDecodeAt > 0 && Date.now() - lastVideoDecodeAt > 1800;
    var heard = playingSoundTime({ fallback: false });
    var videoTime = player && player.video && isFinite(player.video.currentTime) ? player.video.currentTime : 0;
    // A short MP2 packet gap is normal on the car browser. Do not flash the
    // loading state for it; only rebuffer after a sustained empty audio clock.
    var audioEmpty = audioAhead < 0.08 && queued < 0.08 && packed < 0.08;
    if (audioEmpty) {
      if (!audioStarvedSince) audioStarvedSince = Date.now();
    } else {
      audioStarvedSince = 0;
    }
    var audioStarved = audioEmpty && Date.now() - audioStarvedSince > 1200;
    var decodeStarved = decodeStalled && audioEmpty && Date.now() - audioStarvedSince > 700;
    // Sound is the master clock. If the canvas has no near-term frame while
    // the audible clock is moving ahead, enter one coordinated rebuffer
    // before the mismatch becomes visible.
    var videoCannotFollow = heard > videoTime + 0.22 && videoAheadSec() < 0.35;
    if (audioAhead > 1.0 || packed > 1.5 || queued > 0.8) return false;
    return audioStarved || decodeStarved || videoCannotFollow;
  }

  function primeVideoDecodeIfNeeded(playerObj) {
    if (!playerObj || !playerObj.video || !playerObj.video.decode) return false;
    var dec = playerObj.video;
    var tries = 0;
    while (tries < 12) {
      var vt = dec.currentTime;
      if (isFinite(vt) && vt > 0.001) return true;
      if (!dec.decode()) break;
      tries++;
    }
    return false;
  }

  function patchMpegPacing() {
    if (!window.JSMpeg || !JSMpeg.Player || JSMpeg.Player.prototype.__pace) return;
    JSMpeg.Player.prototype.__pace = true;
    JSMpeg.Player.prototype.updateForStreaming = function () {
      applyStreamHold();
      if (ended) return;
      if (readyToFinish()) {
        finishPlayback();
        return;
      }
      if (this.audioOut) {
        this.audioOut.unlocked = true;
        try {
          if (!paused && !prerolling && this.audioOut.context && this.audioOut.context.state !== 'running' && this.audioOut.context.resume) {
            this.audioOut.context.resume();
          }
        } catch (e) {}
      }
      if (!prerolling && shouldRebuffer()) {
        beginRebuffer();
      }
      var firstFrameWait = startAt > 2 ? 30000 : 8000;
      if (!lastVideoDecodeAt && Date.now() - prerollAt > firstFrameWait && netBytes > 4000) {
        restartDeadVideoStream('restart-no-video-first-frame');
        return;
      }
      var stalledMs = lastVideoDecodeAt ? Date.now() - lastVideoDecodeAt : 0;
      var recentResume = resumeAt && Date.now() - resumeAt < 4000;
      var naturalEnd = streamEnded && audioPendingSec() < 0.25;
      var socketQuiet = lastNetGrowthAt > 0 && Date.now() - lastNetGrowthAt > 12000;
      if (stalledMs > 4000 && !recentResume && !naturalEnd && !(waitingOnBufferedVideo() && !socketQuiet)) {
        restartDeadVideoStream('restart-video-stalled', {
          stalledMs: stalledMs
        });
        return;
      }
      if (prerolling) {
        var need = isLive ? 0.8 : (startAt > 2 || rebuffering ? SEEK_AUDIO_PREROLL_SEC : PREROLL_SEC);
        var n = 0;
        while (this.audio && pendingAudioSec(this.audioOut) < need && n < 24) {
          n++;
          if (!this.audio.decode()) break;
        }
        if (this.video) {
          var vt0 = this.video.currentTime;
          if (rebuffering || !isFinite(vt0) || vt0 <= 0.001) {
            var vd = 0;
            while (vd < 12 && (rebuffering ? !rebufferVideoDecodeAt : (!isFinite(this.video.currentTime) || this.video.currentTime <= 0.001))) {
              vd++;
              if (!this.video.decode()) break;
            }
          }
        }
        var readyA = pendingAudioSec(this.audioOut);
        var waited = prerollAt ? (Date.now() - prerollAt) : 0;
        var readyV = this.video && (rebuffering
          ? rebufferVideoDecodeAt >= prerollAt
          : (stageFrameReady && lastVideoDecodeAt >= prerollAt));
        var minA = rebuffering ? 0.8 : 0.3;
        var maxWait = rebuffering ? 20000 : 8000;
        var ready = (readyA >= need && readyV) || (waited > 4000 && readyV && readyA > 0.2) || (waited > maxWait && readyA > minA && readyV);
        if (ready && paused) {
          stagePrerollReady = true;
          updateStageLoader('');
          applyStreamHold();
          return;
        }
        if (ready) {
          flushPrerollAudio(this.audioOut);
          setStatus('재생');
        } else {
          if (!rebuffering && startAt <= 2 && waited > 15000 && readyA < 0.05) {
            failPreroll();
            return;
          }
          if (rebuffering && waited > 8000 && audioPendingSec() < 0.25 && nearEnd()) {
            markStreamEnded();
          }
          if (rebuffering && waited > 8000 && !readyV) {
            restartDeadVideoStream('restart-rebuffer-video-stalled', {
              stalledMs: lastVideoDecodeAt ? Date.now() - lastVideoDecodeAt : -1,
              readyAudioSec: readyA,
              rebufferWaitMs: waited
            });
            return;
          }
          applyStreamHold();
          return;
        }
      }
      if (!paused && this.audio && this.audioOut && this.audioOut.enabled) {
        var queued = queuedAudio(this);
        var queueTarget = resumePending ? 0.15 : AUDIO_QUEUE_SEC;
        var n2 = 0;
        while (queued < queueTarget && n2 < 24) {
          n2++;
          if (!this.audio.decode()) break;
          queued = queuedAudio(this);
        }
      }
      if (this.video && (!isFinite(this.video.currentTime) || this.video.currentTime <= 0.001)) {
        primeVideoDecodeIfNeeded(this);
      }
      if (!this.video) return;
      skipVideoToSound(this);
      applyStreamHold();
      if (needStreamRestart) restartFromSound();
    };
  }

  function launchPlayer(wsUrl) {
    var gen = ++streamGen;
    if (player) { try { player.destroy(); } catch (e) {} player = null; }
    fpsCount = 0;
    lastFps = Date.now();
    videoStartWall = 0;
    netBytes = 0;
    lastNetGrowthAt = Date.now();
    pauseNet0 = -1;
    audioMediaCursor = 0;
    videoShownAt = 0;
    videoFrames = 0;
    lastVideoDecodeAt = 0;
    rebufferVideoDecodeAt = 0;
    lastFrameInterval = 0;
    lastOutputWatchAt = 0;
    outputGapSince = 0;
    videoCatching = false;
    audioStarvedSince = 0;
    lastSocketRestart = 0;
    seekSettleUntil = 0;
    lastHeard = 0;
    endCoastFrom = 0;
    endCoastPos = 0;
    resumeHeard = 0;
    resumePending = false;
    streamHeld = false;
    needStreamRestart = false;
    overflowFails = 0;
    videoFail = 0;
    soundResyncing = false;
    prerolling = true;
    stageFrameReady = false;
    stagePrerollReady = false;
    updateStageLoader('불러오는 중');
    prerollAt = Date.now();
    lastStreamErr = '';
    lastDeadVideoRestart = 0;
    if (prerollTimer) clearTimeout(prerollTimer);
    var waitMs = 45000;
    if (startAt > 2) waitMs += Math.min(120000, Math.floor(startAt) * 500);
    prerollTimer = setTimeout(function () {
      prerollTimer = null;
      if (netBytes > 8000) return;
      failPreroll();
    }, waitMs);
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
        onSourceCompleted: function () {
          if (isLive || nearEnd() || streamEnded) markStreamEnded();
        },
        onVideoDecode: function () {
          var decodeNow = Date.now();
          if (lastVideoDecodeAt) lastFrameInterval = decodeNow - lastVideoDecodeAt;
          if (rebuffering) rebufferVideoDecodeAt = decodeNow;
          var frame = $('stageFrame');
          if (frame) frame.className = 'stage-frame';
          var loadingBg = $('stageLoadingBg');
          if (loadingBg) loadingBg.className = 'stage-loading-bg';
          if ($('loadingCurtain')) $('loadingCurtain').className = 'loading-curtain';
          preservedStageFrame = '';
          lastVideoDecodeAt = decodeNow;
          if (!videoStartWall) {
            videoStartWall = Date.now();
            fitStage();
            debugPlayback('first-video-frame', {
              start: startAt,
              videoTime: player && player.video ? player.video.currentTime : 0,
              audioTime: playingSoundTime({ fallback: false }),
              quality: quality,
              bitrateMode: vbrLow ? 'low' : 'normal'
            });
          }
          fpsCount++;
            stageFrameReady = true;
            updateStageLoader('');
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
      restoreStageFrame();
      if (player.audioOut) {
        player.audioOut.startTime = 0;
        player.audioOut.mediaOrigin = null;
        player.audioOut._srcs = [];
        player.audioOut._schedEndCtx = 0;
        player.audioOut._schedEndMedia = 0;
        player.audioOut._pending = [];
        player.audioOut.enabled = true;
        player.audioOut.unlocked = true;
      }
      applyPlayerVol();
      fitStage();
      disableReconnect();
      hookNetBytes(gen);
      try {
        player.wantsToPlay = true;
        player.paused = false;
        if (player.play) player.play();
      } catch (ePlay) {}
      setTimeout(function () { if (gen === streamGen) hookNetBytes(gen); }, 200);
      setTimeout(function () { if (gen === streamGen) hookNetBytes(gen); }, 1000);
    } catch (e) {
      setStatus('플레이어 오류: ' + e.message);
    }
  }

  function hookNetBytes(gen) {
    if (gen == null) gen = streamGen;
    if (!player || !player.source) return;
    var src = player.source;
    if (src.__byteHook && src.__hookGen === gen) {
      if (src.socket && src.__onMsg) src.socket.onmessage = src.__onMsg;
      if (src.socket && src.__onClose) src.socket.onclose = src.__onClose;
      return;
    }
    if (!src.onMessage) return;
    var orig = src.onMessage.bind(src);
    src.__hookGen = gen;
    src.__onMsg = function (ev) {
      if (gen !== streamGen) return;
      if (ev && typeof ev.data === 'string') {
        try {
          var msg = JSON.parse(ev.data);
          if (msg && msg.type === 'stream-debug' && playbackDebug) {
            debugPlayback('stream-source', msg);
          }
          if (msg && msg.type === 'seek-debug' && playbackDebug) {
            debugPlayback('seek-stream-closed', msg);
          }
          if (msg && msg.type === 'seek-retry') {
            var resumeSec = streamResumeSec();
            recoveringStream = true;
            setStatus(resumeSec > 1 ? '끊긴 위치부터 다시 받는 중...' : '시크 구간을 다시 준비하는 중...');
            setTimeout(function () {
              recoveringStream = false;
              if (gen !== streamGen || !playing || ended) return;
              playUrl(playing, resumeSec, { skipInfo: true, legacy: msg.mode === 'legacy' });
            }, 40);
            return;
          }
          if (msg && msg.type === 'ended') {
            flushDemuxTail();
            markStreamEnded();
          }
          if (msg && (msg.type === 'error' || msg.type === 'status') && msg.message) {
            var sm = String(msg.message).replace(/\s+/g, ' ').trim();
            if (/ERROR:|Forbidden|403|unable to|format is not available|페이지를 새로고침|봇이 아님|지정한 위치의 영상/i.test(sm)) {
              lastStreamErr = sm.slice(0, 240);
              if (prerolling && /지정한 위치의 영상/i.test(sm)) {
                setStatus(startAt > 2 ? '지정한 위치부터 다시 받는 중...' : '불러오는 중');
              } else {
                setStatus(lastStreamErr);
                if (prerolling) failPreroll(lastStreamErr);
              }
            } else if (/동시 재생 한도/.test(sm)) {
              setTimeout(function () {
                if (gen !== streamGen) return;
                if (playing && prerolling) startPipes(playing);
              }, 500);
            } else if (/MPEG1|위치부터 받는/.test(sm) && !lastStreamErr) {
              setStatus(startAt > 2 ? '지정한 위치로 이동 중...' : '불러오는 중');
            } else if (!lastStreamErr && sm && !/MPEG1|확인하는|위치부터 받는/.test(sm)) {
              setStatus(sm.slice(0, 180));
            }
          }
        } catch (e0) {}
        return;
      }
      try {
        if (ev && ev.data && ev.data.byteLength) {
          netBytes += ev.data.byteLength;
          lastNetGrowthAt = Date.now();
        }
      } catch (e) {}
      orig(ev);
    };
    src.__byteHook = true;
    src.onMessage = src.__onMsg;
    if (src.socket) src.socket.onmessage = src.__onMsg;
    var origClose = src.__origClose || (src.onClose ? src.onClose.bind(src) : null);
    src.__origClose = origClose;
    src.__onClose = function () {
      if (src.__closedOnce) return;
      src.__closedOnce = true;
      if (gen !== streamGen) return;
      disableReconnect();
      if (origClose) {
        try { origClose(); } catch (eC) {}
      }
      if (prerolling && playing && !ended && !paused) {
        if (netBytes >= 4000) return;
        if (streamRetry < 1) {
          streamRetry += 1;
          setTimeout(function () {
            if (gen !== streamGen) return;
            if (playing && prerolling && !ended) launchPlayer(wsUrlFor(playing, startAt, startAt > 2));
          }, 350);
          return;
        }
        failPreroll(lastStreamErr || '지정한 위치로 이동하지 못했습니다. 다시 눌러 보세요.');
        return;
      }
      if (!ended && playing && !paused && !streamEnded && !nearEnd() && !recoveringStream) {
        if (Date.now() - lastSocketRestart >= 12000) {
          lastSocketRestart = Date.now();
          var resumeSec = Math.max(0, currentPos() - 0.5);
          if (resumeSec < 5 && lastPlaybackPos >= 5) resumeSec = Math.max(0, lastPlaybackPos - 0.5);
          setStatus('네트워크가 끊겨 재연결하는 중...');
          setTimeout(function () {
            if (gen !== streamGen || !playing || paused || ended || streamEnded) return;
            playUrl(playing, resumeSec, { skipInfo: true });
          }, 350);
        }
        return;
      }
      if (!ended && playing && (streamEnded || nearEnd())) markStreamEnded();
    };
    src.onClose = src.__onClose;
    if (src.socket) src.socket.onclose = src.__onClose;
  }

  function seekTo(sec) {
    if (!playing) return;
    if (isLive) return;
    if (sec < 0) sec = 0;
    if (duration && sec > duration - 2) sec = Math.max(0, duration - 2);
    seeking = false;
    seekSent = Date.now();
    pendingSeekSec = sec;
    pendingSeekOpts = paused ? { keepPaused: true, skipInfo: true } : { skipInfo: true };
    if ($('npTime') && duration) $('npTime').textContent = fmtPlayClock(sec) + ' / ' + fmtPlayClock(duration);
    setStatus(sec > 1 ? '지정한 위치로 이동 중...' : '불러오는 중');
    if (seekDebounce) clearTimeout(seekDebounce);
    seekDebounce = setTimeout(function () {
      seekDebounce = null;
      var t = pendingSeekSec;
      var o = pendingSeekOpts || { skipInfo: true };
      pendingSeekSec = null;
      pendingSeekOpts = null;
      if (t == null || !playing) return;
      if (!o.keepPaused) pausePos = -1;
      playUrl(playing, t, o);
    }, 120);
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
    showSeekBuf(seekPick, 0);
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

  function copyChannel(buf, channel, from) {
    var data = buf.getChannelData(channel);
    return new Float32Array(data.subarray(from));
  }

  function fadeHead(left, right) {
    var n = Math.min(64, left.length);
    var f;
    for (f = 0; f < n; f++) {
      var g = f / n;
      left[f] *= g;
      right[f] *= g;
    }
  }

  // The shared AudioContext keeps running if anything calls resume(), and the
  // samples already handed to it then play out at zero gain. Stop those
  // buffers and keep the unplayed tail so resume continues the same sound.
  function parkScheduledAudio(out) {
    if (!out || out._held) return;
    out._held = true;
    var ctx = out.context;
    var srcs = (out._srcs || []).slice();
    out._srcs = [];
    var kept = [];
    var now = 0;
    try { if (ctx) now = ctx.currentTime; } catch (eNow) { now = 0; }
    var i;
    for (i = 0; i < srcs.length; i++) {
      var src = srcs[i];
      try { src.onended = null; } catch (e0) {}
      try {
        var buf = src.buffer;
        var when = src._ctxAt;
        var rate = buf ? buf.sampleRate : 0;
        if (buf && rate > 0 && isFinite(src._mediaAt) && when != null && isFinite(when)) {
          var skip = now - when;
          var from = skip > 0 ? Math.floor(skip * rate) : 0;
          if (from < 0) from = 0;
          if (from < buf.length) {
            var left = copyChannel(buf, 0, from);
            var right = buf.numberOfChannels > 1 ? copyChannel(buf, 1, from) : new Float32Array(left);
            if (from > 0 && kept.length === 0) fadeHead(left, right);
            kept.push({
              rate: rate,
              left: left,
              right: right,
              mediaAt: src._mediaAt + (from / rate)
            });
          }
        }
      } catch (eCopy) {}
      try { src.stop(0); } catch (e1) {}
      try { src.disconnect(); } catch (e2) {}
    }
    if (kept.length) {
      audioMediaCursor = kept[0].mediaAt;
      out._schedEndMedia = audioMediaCursor;
      out._schedEndCtx = now;
      out.startTime = now;
    }
    out._parked = kept;
  }

  function scheduleHeldAudio(out) {
    if (!out) return;
    var parked = out._parked || [];
    var pending = out._pending || [];
    out._parked = [];
    out._pending = [];
    out._held = false;
    var ctx = out.context;
    if (ctx) {
      var soon = ctx.currentTime + 0.02;
      var endCtx = out._schedEndCtx || 0;
      out.startTime = endCtx > soon ? endCtx : soon;
    }
    var i;
    for (i = 0; i < parked.length; i++) out.play(parked[i].rate, parked[i].left, parked[i].right);
    for (i = 0; i < pending.length; i++) out.play(pending[i].rate, pending[i].left, pending[i].right);
  }

  function holdPlayback() {
    if (!player) return;
    hookNetBytes();
    pauseUnread = bitsUnread(player.audio) + bitsUnread(player.video);
    pauseNet0 = netBytes;
    if (player.audioOut) {
      parkScheduledAudio(player.audioOut);
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
      if (prerolling) flushPrerollAudio(player.audioOut);
      var ctx = player.audioOut.context;
      var live = playingSoundTime({ fallback: false });
      debugPlayback('resume-after-paused-seek', {
        videoTime: player.video && isFinite(player.video.currentTime) ? player.video.currentTime : -1,
        audioCursor: audioMediaCursor,
        decodedTime: player.audio && isFinite(player.audio.decodedTime) ? player.audio.decodedTime : -1,
        pendingAudioSec: pendingAudioSec(player.audioOut),
        parkedAudioSec: parkedAudioSec(player.audioOut),
        contextTime: ctx ? ctx.currentTime : -1,
        liveSoundTime: live,
        speakerHeard: speakerHeard()
      });
      // Replay the tail captured at pause. Scheduling it at the video head
      // would skip the sound that was already queued, and scheduling it at
      // the decoder head would repeat it.
      scheduleHeldAudio(player.audioOut);
      // The last frame is from before the pause. Leaving its timestamp in
      // place makes a pause longer than 4s look like a stalled decoder.
      lastVideoDecodeAt = Date.now();
      seekSettleUntil = 0;
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
      pauseWall = Date.now();
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
      // A healthy socket can resume in place. Rebuilding the stream on a
      // short pause throws away the buffer and lands the clock on a new seek.
      if (pauseWall && Date.now() - pauseWall > 60000 && playing) {
        var resumeSec = pausePos >= 0 ? pausePos : currentPos();
        pauseWall = 0;
        pausePos = -1;
        playUrl(playing, resumeSec, { skipInfo: true });
        paintSeekBar();
        return;
      }
      pauseWall = 0;
      var socket = streamSocket();
      if (!socket || socket.readyState !== 1) {
        var reconnectSec = pausePos >= 0 ? pausePos : startAt;
        pausePos = -1;
        playUrl(playing, reconnectSec, { skipInfo: true });
        paintSeekBar();
        return;
      }
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
    if (!fsOn && fsControlsTimer) {
      clearTimeout(fsControlsTimer);
      fsControlsTimer = null;
    }
    applyChrome();
    setTimeout(fitStage, 0);
    setTimeout(fitStage, 80);
    setTimeout(function () {
      if (!playing || ended) return;
      unlockPlaybackAudio();
      requestSoundSync();
      scheduleResumeSync(0);
    }, 120);
  }

  function toggleFsControls() {
    var box = $('playerBox');
    if (!box || !fsOn) return;
    if (box.classList.contains('controls-visible')) {
      box.classList.remove('controls-visible');
      if (fsControlsTimer) { clearTimeout(fsControlsTimer); fsControlsTimer = null; }
      return;
    }
    box.classList.add('controls-visible');
    if (fsControlsTimer) clearTimeout(fsControlsTimer);
    fsControlsTimer = setTimeout(function () {
      fsControlsTimer = null;
      if (fsOn && !paused) box.classList.remove('controls-visible');
    }, 10000);
  }

  function applyPlayerVol() {
    var pct = parseInt(($('vol') && $('vol').value) || '100', 10);
    var v = Math.max(0, Math.min(100, pct)) / 100;
    if (player) {
      try { player.volume = v; } catch (e) {}
      try {
        if (!paused && player.audioOut && player.audioOut.gain) player.audioOut.gain.gain.value = v;
      } catch (e2) {}
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
  if ($('btnBotHelp')) $('btnBotHelp').onclick = function () {
    location.href = tv.url('/help/youtube/');
  };
  if ($('btnStop')) $('btnStop').onclick = function () { stop(false); setStatus('정지'); };
  if ($('btnPause')) $('btnPause').onclick = togglePause;
  if ($('commentsPreview')) $('commentsPreview').onclick = openComments;
  if ($('commentsClose')) $('commentsClose').onclick = closeComments;
  var commentSortButtons = document.querySelectorAll('[data-comment-sort]');
  for (var csi = 0; csi < commentSortButtons.length; csi++) {
    commentSortButtons[csi].onclick = function () { setCommentSort(this.getAttribute('data-comment-sort')); };
  }
  if ($('commentsList')) $('commentsList').onscroll = function () {
    if (!commentsOpened || !commentsMore || commentsLoading) return;
    if (this.scrollTop + this.clientHeight >= this.scrollHeight - 120) loadComments(10, false);
  };
  if ($('btnRepeat')) $('btnRepeat').onclick = function () {
    repeatEnabled = !repeatEnabled;
    updateRepeatButton();
    if (repeatEnabled && ended) scheduleRepeatPlayback();
    if (!repeatEnabled && repeatTimer) {
      clearTimeout(repeatTimer);
      repeatTimer = null;
      repeatAt = 0;
      if (ended) setStatus('종료');
    }
  };
  updateRepeatButton();
  if ($('btnFromStart')) $('btnFromStart').onclick = function () {
    if (!playing) return;
    playUrl(playing, 0, { skipInfo: true });
  };
  if ($('tapLayer')) $('tapLayer').onclick = onPlayerTap;
  if ($('playerBox')) $('playerBox').onclick = function (e) {
    if (fsOn && e.target === this) toggleFsControls();
  };
  function bindTap(el, fn) {
    if (!el) return;
    var last = 0;
    function go(e) {
      if (e) {
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
      }
      var now = Date.now();
      if (now - last < 600) return;
      last = now;
      fn();
    }
    el.ontouchend = go;
    el.onclick = function (e) {
      if (Date.now() - last < 600) {
        if (e && e.preventDefault) e.preventDefault();
        return;
      }
      go(e);
    };
  }
  bindTap($('btnBack'), function () {
    var base = pendingSeekSec != null ? pendingSeekSec : currentPos();
    seekTo(base - 10);
  });
  bindTap($('btnFwd'), function () {
    var base = pendingSeekSec != null ? pendingSeekSec : currentPos();
    seekTo(base + 10);
  });
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
      seekTouch = false;
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
      if (Date.now() - seekSent < 1200) return;
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
      if (Date.now() - seekSent < 400) return;
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
  bindToggleBtns('.fmtbtn', 'fmtbtn', function (el) {
    streamFormat = el.getAttribute('data-format') || '134+140';
  });
  bindToggleBtns('.bbtn', 'bbtn', function (el) {
    var n = parseInt(el.getAttribute('data-buf'), 10);
    bufTarget = (n === 10 || n === 20 || n === 30) ? n : 10;
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
    loadServerHistory();
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
