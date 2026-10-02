(function () {
  
  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage'), na = $('na'), st = $('st'), list = $('list');
  // The player starts hidden. Showing it, or restoring the last offset on
  // refresh, was leaving the page scrolled below the video.
  var stickWatchTop = !!stage;
  function scrollWatchTop() {
    try { window.scrollTo(0, 0); } catch (e) {}
    try {
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    } catch (e2) {}
  }
  if (stage) {
    try { if (history && 'scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) {}
    try {
      document.documentElement.style.overflowAnchor = 'none';
      document.body.style.overflowAnchor = 'none';
    } catch (e3) {}
    scrollWatchTop();
    window.addEventListener('pageshow', scrollWatchTop);
  }
  var player = null, playing = null, quality = 360, fps = 24, vbrLow = true, streamFormat = '134+140', startAt = 0;
  var preservedStageFrame = '';
  var stageFrameReady = false, stagePrerollReady = false;
  var duration = 0, isLive = false, fpsCount = 0, lastFps = 0;
  var durationSource = '';
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
  var AUDIO_QUEUE_SEC = 3.5;
  var AUDIO_CUT_FADE_SEC = 0.008;
  var BUFFER_SEEK_MAX_SEC = 12;
  var BUFFER_SEEK_MARGIN_SEC = 1;
  var SEEK_AUDIO_PREROLL_SEC = 3;
  var PREROLL_SEC = 3;
  var SUBS_DETAIL_BUFFER_SEC = 5;
  var SUBS_DETAIL_STABLE_MS = 1000;
  var SUBS_DETAIL_FALLBACK_MS = 10000;
  var SUBS_WARM_BUFFER_SEC = 5;
  var AUTO_REBUFFER_WINDOW_MS = 30000;
  var AUTO_REBUFFER_TRIGGER_COUNT = 2;
  var AUTO_VIDEO_SCALE_STEPS = [1, 0.75, 0.6];
  var AUTO_VIDEO_RESTORE_BUFFER_SEC = 8;
  var AUTO_VIDEO_RESTORE_STABLE_MS = 30000;
  var AUTO_VIDEO_RESTORE_QUIET_MS = 45000;
  var AUTO_VIDEO_USER_IGNORE_MS = 8000;
  var AUTO_VIDEO_PRESSURE_EARLY_SEC = 10;
  var AUTO_VIDEO_PRESSURE_CRITICAL_SEC = 3;
  var AUTO_VIDEO_PRESSURE_SAMPLE_MS = 1000;
  var AUTO_VIDEO_PRESSURE_TREND_SEC_PER_SEC = 1;
  var AUTO_VIDEO_PRESSURE_EMERGENCY_AUDIO_SEC = 1;
  var AUTO_VIDEO_PRESSURE_EMERGENCY_TIME_TO_EMPTY_SEC = 1;
  var AUTO_VIDEO_PRESSURE_HOLD_MS = 1200;
  var AUTO_VIDEO_PRESSURE_CRITICAL_HOLD_MS = 500;
  var AUTO_VIDEO_DOWNSHIFT_COOLDOWN_MS = 15000;
  var bufTarget = 30;
  var seamPlayer = null;
  var seamCanvas = null;
  var seamTimer = null;
  var seamSpliceAt = 0;
  var seamQuality = 0;
  var seamAutoQuality = false;
  var seamAutoDeadline = 0;
  var seamReady = false;
  var seamHasFrame = false;
  var seamStarted = 0;
  var seamTriggerReason = '';
  var seamLegacy = false;
  var armingSeam = false;
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
  // A repeat keeps the previous title length. An encoder close far before
  // that label is a dropped stream, not the credits.
  var earlyResumeAt = -1;
  var earlyResumeLegacy = false;
  var pendingEarlyContinue = false;
  var forceShortFinish = false;
  var repeatEnabled = false;
  var repeatRunCount = 0;
  var repeatAskOpen = false;
  var repeatHeld = false;
  var autoplayNext = false;
  var autoplayLoaded = false;
  var autoQuality = false;
  var autoQualityLoaded = false;
  var autoQualityTouched = false;
  var autoQualityUpSince = 0;
  var autoQualityDownSince = 0;
  var autoQualityDownStartBuffer = 0;
  var autoQualityCooldownUntil = 0;
  var autoQualityLastSwitchAt = 0;
  var autoQualityDebugAt = {};
  var AUTO_QUALITY_UP_BUFFER_SEC = 20; //버퍼 20초 이상이면 화질 업그레이드
  var AUTO_QUALITY_UP_STABLE_MS = 8000; //버퍼 상향 조건을 8초 이상 유지 화질 업그레이드
  var AUTO_QUALITY_DOWN_BUFFER_SEC = 15;
  var AUTO_QUALITY_DOWN_EMERGENCY_SEC = 10;
  var AUTO_QUALITY_DOWN_TREND_SEC = 3000;
  var AUTO_QUALITY_HYSTERESIS_SEC = 5;
  var AUTO_QUALITY_RECOVERY_QUIET_MS = 5000;
  var AUTO_QUALITY_CANDIDATE_TIMEOUT_MS = 12000;
  var SEAM_JOIN_AUDIO_READY_SEC = 2.5;
  var endMode = '';
  var nextToken = 0;
  var nextItem = null;
  var nextDue = false;
  var nextReady = false;
  var nextLookupRestorePlayback = false;
  var nextLookupPauseOverridden = false;
  var repeatTimer = null;
  var repeatAt = 0;
  var endCoastFrom = 0;
  var endCoastPos = 0;
  // 다음 영상 자동 재생, 반복 재생. 이 횟수만큼 끝나면 확인을 묻는다.
  var AUTO_NEXT_LIMIT = 30;
  var REPEAT_PLAY_LIMIT = 30;
  // 채널 영상 한 페이지. 한 줄이 3장이라 3의 배수로 둔다.
  var RELATED_PAGE = 12;

  function updateRepeatButton() {
    var button = $('btnRepeat');
    if (!button) return;
    button.classList.toggle('on', repeatEnabled);
    button.setAttribute('aria-pressed', repeatEnabled ? 'true' : 'false');
  }

  function paintAutoplayButton() {
    var button = $('btnAutoplay');
    if (!button) return;
    button.classList.toggle('on', autoplayNext);
    button.setAttribute('aria-pressed', autoplayNext ? 'true' : 'false');
    button.setAttribute('aria-checked', autoplayNext ? 'true' : 'false');
  }

  function paintAutoQualityButton() {
    var button = $('btnAutoQuality');
    if (!button) return;
    button.classList.toggle('on', autoQuality);
    button.setAttribute('aria-pressed', autoQuality ? 'true' : 'false');
    button.setAttribute('aria-checked', autoQuality ? 'true' : 'false');
  }

  function paintQualityButtons() {
    var buttons = document.querySelectorAll('.qbtn');
    for (var i = 0; i < buttons.length; i++) {
      var selected = (parseInt(buttons[i].getAttribute('data-q'), 10) || 360) === quality;
      buttons[i].classList.toggle('on', selected);
      buttons[i].setAttribute('aria-pressed', selected ? 'true' : 'false');
    }
  }

  function setAutoQualityPreference(enabled, source) {
    enabled = !!enabled;
    if (enabled && quality >= 720) {
      setStatus('자동 화질은 360p와 480p에서 사용할 수 있습니다');
      return false;
    }
    var previous = autoQuality;
    autoQuality = enabled;
    autoQualityTouched = true;
    autoQualityLoaded = true;
    autoQualityUpSince = 0;
    autoQualityDownSince = 0;
    autoQualityDownStartBuffer = 0;
    paintAutoQualityButton();
    debugPlayback('auto-quality-preference-changed', { enabled: autoQuality, quality: quality, source: source || 'toggle' });
    if (!autoQuality && seamPlayer && seamAutoQuality) cancelSeam('preference-disabled');
    if (!currentPin) return true;
    tv.post('/api/prefs', { autoQuality: autoQuality }, function (code, data) {
      if (data && data.ok) {
        debugPlayback('auto-quality-preference-saved', { enabled: autoQuality });
        return;
      }
      autoQuality = previous;
      autoQualityLoaded = true;
      paintAutoQualityButton();
      debugPlayback('auto-quality-preference-save-failed', { code: code, restored: previous });
    });
    return true;
  }

  function loadAutoplayPref() {
    var pin = currentPin;
    if (!pin) {
      autoplayNext = false;
      autoQuality = false;
      autoQualityLoaded = true;
      paintAutoplayButton();
      paintAutoQualityButton();
      debugPlayback('auto-quality-preference-loaded', { enabled: autoQuality, source: 'default-no-pin' });
      return;
    }
    tv.get('/api/prefs', function (c, d) {
      if (pin !== currentPin || autoplayLoaded) return;
      autoplayLoaded = true;
      autoplayNext = !!(d && d.ok && d.autoplayNext);
      if (!autoQualityTouched) autoQuality = !!(d && d.ok && d.autoQuality === true);
      autoQualityLoaded = true;
      paintAutoplayButton();
      paintAutoQualityButton();
      debugPlayback('auto-quality-preference-loaded', {
        enabled: autoQuality,
        source: d && d.ok ? 'server' : 'default',
        touchedDuringLoad: autoQualityTouched
      });
      if (!volTouched && d && d.ok && d.volume != null && d.volume !== '') {
        var pct = parseInt(d.volume, 10);
        if (pct === pct) {
          if (pct > 0) lastVol = pct;
          setVol(pct, { quiet: true });
        }
      }
    });
  }
  var audioMediaCursor = 0;
  // Browser reload is not a user gesture. The audio context stays suspended,
  // so the picture follows this wall clock until samples can really start.
  var silentClockFrom = 0;
  var silentClockBase = 0;
  var releasingSilent = false;
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
  var pendingSeekRatio = null;
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
  var fsOn = false, fsAlign = 'top', tapHide = null, chromeTimer = null;
  var keepFsOnBoot = false;
  try {
    keepFsOnBoot = sessionStorage.getItem('tv_fs_keep') === '1';
    if (keepFsOnBoot) sessionStorage.removeItem('tv_fs_keep');
  } catch (eKeepFs) {}
  var feedHost = null;
  var feedScroll = null;
  var feedLayerMode = 'flow';
  var feedLayerLayout = false;
  var feedAnimToken = 0;
  var keepLayerOnBoot = false;
  try {
    if (stage) {
      keepLayerOnBoot = sessionStorage.getItem('tv_feed_layer') === '1';
      if (keepLayerOnBoot) sessionStorage.removeItem('tv_feed_layer');
    }
  } catch (eKeepLayer) {}
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
  var membersShownId = '';
  var libRaw = [];
  var libFilter = '';
  var subsFindQ = '';
  var libVidFilter = '';
  var libSort = 'new';
  var suggestSortSet = false;
  var nextVidBusy = false;
  var libEmpty = '결과 없음';
  var currentPin = '';
  var playbackDebug = !!(window.tv && window.tv.getDebug ? window.tv.getDebug() : /(?:^|[?&])debug=1(?:&|$)/.test(String(window.location.search || '')));
  var lastDebugStatus = '';
  var subList = [];
  var subVideoCache = {};
  var subsWarmGen = 0;
  var subsWarmId = '';
  var subsWarmPaint = null;
  var subsWarmHoldLogged = false;
  var pipePending = false;
  var pendingWatchSourceOpen = false;
  var pendingSubStats = null;
  var subStatsTimer = null;
  var subStatsStableChannel = '';
  var subStatsStableSince = 0;
  var adaptiveVideoScale = 1;
  var adaptiveRebufferTimes = [];
  var adaptiveLastRebufferAt = 0;
  var adaptiveIgnoreUntil = 0;
  var adaptiveWarmupUntil = 0;
  var adaptiveManualRestart = false;
  var adaptiveStableSince = 0;
  var adaptiveRestoreAttemptAt = 0;
  var adaptivePressureSince = 0;
  var adaptivePressureSampleAt = 0;
  var adaptivePressureSampleBuffer = 0;
  var adaptivePressureSampleAudioBuffer = 0;
  var adaptiveEmergencyWaitLogged = false;
  var adaptiveLastScaleChangeAt = 0;
  var subsOpen = null;
  var subPriority = 0;
  var subsLoggedDone = '';
  var subsRosterLogged = '';
  var SUBS_WARM_HEAD = 8;
  // Around the opened channel: next, previous, two ahead, two back.
  var SUBS_WARM_AROUND = [1, -1, 2, -2];
  var selectedCh = '';
  var feedSubCh = null;
  var restoreCh = '';
  var pendingScroll = 0;
  var relatedTimer = null;
  var pager = { mode: '', q: '', id: '', name: '', offset: 0, more: false, busy: false };
  var chAvatarMap = {};
  var hydrateTimer = null;
  var reqSeq = 0;
  var subFeedGen = 0;
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
    if ($('commentsPreview')) $('commentsPreview').setAttribute('aria-expanded', 'false');
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
    if ($('commentsPreview')) $('commentsPreview').setAttribute('aria-expanded', 'true');
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
    if ($('commentsPreview')) $('commentsPreview').setAttribute('aria-expanded', 'false');
  }

  function toggleComments() {
    if (commentsOpened) closeComments();
    else openComments();
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
  // Channel-list loads must not replace the playback line or the stage loader.
  function setListStatus(t) {
    if (stage && playing) return;
    setStatus(t);
  }

  function setStatus(t) {
    if (st) {
      st.textContent = t;
      st.className = String(t || '') === '회원전용 영상입니다' ? 'stat members' : 'stat';
    }
    var stageStatus = $('stageStatus');
    var stageLoader = $('stageLoader');
    var stageRepeat = $('stageRepeat');
    var stageRepeatCount = $('stageRepeatCount');
    var repeatMatch = String(t || '').match(/^(\d+)초 (?:후|뒤에) (?:다시 재생합니다|다음 영상을 재생합니다)$/);
    if (stageStatus) {
      var membersMsg = String(t || '') === '회원전용 영상입니다';
      var showStageStatus = membersMsg || /재생할 수 없음|플레이어 오류/.test(String(t || ''));
      stageStatus.textContent = showStageStatus ? t : '';
      stageStatus.className = 'stage-status' + (showStageStatus ? ' on' : '') + (membersMsg ? ' members' : '');
    }
    if (stageLoader) {
      updateStageLoader(t);
    }
    if (stageRepeat) {
      var nextCountdown = !!(repeatMatch && /다음 영상을 재생합니다$/.test(String(t || '')));
      stageRepeat.className = repeatMatch ? ('stage-repeat on' + (nextCountdown ? ' next' : '')) : 'stage-repeat';
      if (repeatMatch && stageRepeatCount) stageRepeatCount.textContent = repeatMatch[1];
      stageRepeat.setAttribute('aria-label', nextCountdown ? '다음 영상 재생' : '반복 재생 대기');
    }
    syncCenterIconCover();
    showBotHelp(isBotErr(t));
    if (playbackDebug && t !== lastDebugStatus) {
      lastDebugStatus = t;
      console.log('[tesla-video status]', t);
    }
  }

  function syncCenterIconCover() {
    var icon = $('tapIcon');
    if (!icon || !icon.classList) return;
    var loader = $('stageLoader');
    var repeat = $('stageRepeat');
    var busy = (loader && loader.classList.contains('on')) || (repeat && repeat.classList.contains('on'));
    icon.classList.toggle('is-covered', !!busy);
  }

  function updateStageLoader(status) {
    var stageLoader = $('stageLoader');
    if (!stageLoader) return;
    var loading = nextVidBusy || /지정한 위치로 이동 중|불러오는 중/.test(String(status || ''));
    var waitingForPlayback = !!player && (!stageFrameReady || !stagePrerollReady);
    stageLoader.className = loading || waitingForPlayback ? 'stage-loader on' : 'stage-loader';
    syncCenterIconCover();
  }

  function debugPlayback(label, extra) {
    if (!playbackDebug || !window.console || !console.log) return;
    var data = extra || {};
    data.label = label;
    data.at = new Date().toISOString();
    try { console.log('[tesla-video playback]', data); } catch (e) {}
  }

  function debugAutoQuality(label, extra, intervalMs) {
    if (!playbackDebug) return;
    var reason = extra && extra.reason ? ':' + extra.reason : '';
    var key = label + reason;
    var now = Date.now();
    var lastAt = autoQualityDebugAt[key] || 0;
    if (now - lastAt < (intervalMs || 0)) return;
    autoQualityDebugAt[key] = now;
    debugPlayback(label, extra);
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

  function videoIdFromSrc(src) {
    var s = String(src || '');
    var m = s.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
    if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
    return '';
  }

  // Title and channel name stay out of the address. Apache rejects a query that contains two parenthesis groups.
  function readMembersMap() {
    var all = null;
    try { all = JSON.parse(sessionStorage.getItem('tv_members') || 'null'); } catch (e) { return {}; }
    if (!all || typeof all !== 'object') return {};
    if (all.id) {
      var one = {};
      one[all.id] = all;
      return one;
    }
    return all;
  }

  function rememberMembersHint(meta) {
    if (!meta || !meta.id) return;
    var all = readMembersMap();
    var prev = all[meta.id] || {};
    all[meta.id] = {
      id: String(meta.id),
      channel_id: meta.channel_id || prev.channel_id || '',
      name: meta.name || prev.name || '',
      title: meta.title || prev.title || '',
      uploaded: meta.uploaded || prev.uploaded || 0,
      thumbnail: meta.thumbnail || prev.thumbnail || '',
      duration: meta.duration || prev.duration || 0,
      views: meta.views || prev.views || 0,
      url: meta.url || prev.url || '',
      ts: Date.now()
    };
    var keys = [];
    for (var k in all) if (Object.prototype.hasOwnProperty.call(all, k)) keys.push(k);
    keys.sort(function (a, b) { return (all[a].ts || 0) - (all[b].ts || 0); });
    while (keys.length > 40) delete all[keys.shift()];
    try { sessionStorage.setItem('tv_members', JSON.stringify(all)); } catch (e2) {}
  }

  function storedMembers(id) {
    if (!id) return null;
    var rec = readMembersMap()[id];
    if (rec && rec.id === id) return rec;
    return null;
  }

  function membersHintFor(id) {
    var stored = storedMembers(id);
    var qid = qsVal('v');
    if (qsVal('m') === '1' && id && (!qid || qid === id)) {
      return {
        id: id,
        channel_id: qsVal('ch') || (stored && stored.channel_id) || '',
        name: (stored && stored.name) || '',
        title: (stored && stored.title) || '',
        uploaded: (stored && stored.uploaded) || 0,
        thumbnail: (stored && stored.thumbnail) || '',
        duration: (stored && stored.duration) || 0,
        views: (stored && stored.views) || 0,
        url: (stored && stored.url) || ''
      };
    }
    return stored;
  }

  function membersLinkQuery(channelId) {
    var q = '&m=1';
    if (channelId) q += '&ch=' + encodeURIComponent(channelId);
    return q;
  }

  function setWatchFrom(from) {
    try {
      if (from === 'favs') sessionStorage.setItem('tv_watch_from', 'favs');
      else sessionStorage.removeItem('tv_watch_from');
    } catch (e) {}
  }

  function setWatchSub(id) {
    try {
      if (id) sessionStorage.setItem('tv_watch_sub', id);
      else sessionStorage.removeItem('tv_watch_sub');
    } catch (e) {}
  }

  // A video opened from the favorites tab keeps that list. The address is the
  // source of truth so a refresh does not fall back to the channel list.
  function watchFromFavs() {
    if (qsVal('from') === 'favs') return true;
    if (qsVal('v') || qsVal('url')) return false;
    try { return sessionStorage.getItem('tv_watch_from') === 'favs'; } catch (e) { return false; }
  }

  // A video opened from a subscribed channel keeps that channel selected.
  function watchSubChannel() {
    if (qsVal('from') === 'favs') return '';
    var q = qsVal('sub');
    if (q) return q;
    if (qsVal('v') || qsVal('url') || !stage) return '';
    try { return sessionStorage.getItem('tv_watch_sub') || ''; } catch (e) { return ''; }
  }

  function watchOriginQuery(favs, subId) {
    if (favs) return '&from=favs';
    if (subId) return '&sub=' + encodeURIComponent(subId);
    return '';
  }

  function watchKeepsSubList() {
    if (!watchSubChannel()) return false;
    return currentFeed !== 'search' && currentFeed !== 'related' && currentFeed !== 'suggest' && currentFeed !== 'favs';
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
    var cls = String(el.className || '');
    if (cls.indexOf('yt-card') >= 0 && cls.indexOf('yt-card-av') < 0) return;
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
    try { sessionStorage.removeItem('tv_watch_back'); } catch (e0) {}
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
    var playingNow = !!(stage && watchItem && it.id && watchItem.id === it.id);
    var chId = it.channel_id || '';
    if (!chId && (pager.mode === 'subchannel' || pager.mode === 'ytchannel')) chId = pager.id || '';
    if (!chId && stage && currentFeed === 'related' && watchChannel) chId = watchChannel.channel_id || '';
    var html = '<div class="yt-card' + (playingNow ? ' is-playing' : '') + '" data-id="' + escapeHtml(it.id || '') + '" data-url="' + escapeHtml(it.url || ('https://www.youtube.com/watch?v=' + it.id)) + '"';
    if (it.members) {
      html += ' data-members="1" data-title="' + escapeHtml(it.title || '') + '"';
      html += ' data-uploaded="' + escapeHtml(String(it.uploaded || it.ts || 0)) + '" data-thumb="' + escapeHtml(it.thumbnail || '') + '"';
      html += ' data-dur="' + escapeHtml(String(it.duration || 0)) + '" data-views="' + escapeHtml(String(it.views || 0)) + '"';
    }
    html += '>';
    html += '<div class="yt-thumb-wrap"><img src="' + escapeHtml(it.thumbnail || '') + '" alt="" loading="lazy" decoding="async">';
    if (playingNow) html += '<span class="yt-now-shade" aria-hidden="true"></span><span class="yt-now">지금 재생 중</span>';
    html += '<button type="button" class="star-btn' + (on ? ' on' : '') + '" data-star="' + escapeHtml(it.id || '') + '" aria-label="즐겨찾기">';
    html += '<svg class="star-svg" viewBox="0 0 24 24"><path d="M12 2.4l2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 16.3 6.6 19.2l1-6.1L3.2 8.8l6.1-.9z"/></svg></button>';
    if (dur) html += '<span class="yt-dur">' + dur + '</span>';
    html += '</div>';
    html += '<table class="yt-card-body"><tr>';
    html += '<td class="yt-card-av-td"><div class="yt-card-av" data-chid="' + escapeHtml(chId) + '" data-chname="' + escapeHtml(chName) + '">' + avatarInner(avatarFor(it), chName || it.title || '?') + '</div></td>';
    html += '<td class="yt-card-text"><div class="t">' + escapeHtml(it.title || '') + '</div>';
    if (it.members) html += '<div class="members-only">회원전용 영상</div>';
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
    if (feedHost && feedScroll && feedLayerMode && feedLayerMode !== 'flow') {
      var topL = feedScroll.scrollTop || 0;
      var hL = feedScroll.clientHeight || 0;
      var fullL = feedScroll.scrollHeight || 0;
      return topL + hL >= fullL - 520;
    }
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

  function pagerKeepsLib(mode) {
    return mode === 'subchannel' || mode === 'home' || mode === 'search' || mode === 'related' || mode === 'suggest';
  }

  function feedUsesLibView(feed) {
    return feed === 'home' || feed === 'music' || feed === 'game' || feed === 'news'
      || feed === 'favs' || feed === 'related' || feed === 'search' || feed === 'suggest' || feed === 'subs';
  }

  function loadMore() {
    if (pager.busy || !pager.more) return;
    if (!pager.mode || pager.mode === 'favs') return;
    var seq = reqSeq;
    var mode = pager.mode;
    pager.busy = true;
    paintMoreBar();
    var limit = (pager.mode === 'related' || pager.mode === 'suggest') ? RELATED_PAGE : 16;
    var done = function (code, data) {
      if (!stillReq(seq) || pager.mode !== mode) return;
      pager.busy = false;
      var add = uniqueNew(pagerKeepsLib(mode) ? libRaw : lastItems, (data && data.items) || []);
      if (!data || !data.ok || !add.length) {
        pager.more = false;
        paintMoreBar();
        return;
      }
      pager.offset += add.length;
      pager.more = data.more !== false && add.length >= 8;
      if (pagerKeepsLib(mode)) {
        libRaw = libRaw.concat(add);
        if (mode === 'search') lastSearchItems = libRaw.slice();
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
      tv.get('/api/youtube/related?id=' + encodeURIComponent((watchItem && watchItem.id) || '') + relatedRequestExtra() + '&limit=' + limit + '&offset=' + pager.offset, done);
    } else if (pager.mode === 'suggest') {
      tv.get('/api/youtube/suggest?id=' + encodeURIComponent((watchItem && watchItem.id) || '') + '&limit=' + limit + '&offset=' + pager.offset, done);
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

  function clearFeedChips() {
    var box = $('chips');
    if (!box) return;
    var chips = box.querySelectorAll('.chip');
    for (var i = 0; i < chips.length; i++) chips[i].className = 'chip';
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
    paintSortChips();
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
      $('libFilter').style.display = (on && kind === 'subs') ? 'none' : '';
      $('libFilter').placeholder = kind === 'subs' ? '채널명으로 검색' : '제목 또는 채널명으로 필터';
    }
    if ($('libVidFilter')) $('libVidFilter').style.display = kind === 'subs' ? 'block' : 'none';
    if ($('libSorts')) $('libSorts').style.display = on ? '' : 'none';
  }

  function paintSortChips() {
    var box = $('libSorts');
    if (!box) return;
    var btns = box.querySelectorAll('[data-sort]');
    for (var i = 0; i < btns.length; i++) {
      var s = btns[i].getAttribute('data-sort');
      if (s === 'rec') btns[i].style.display = currentFeed === 'suggest' ? '' : 'none';
      btns[i].className = 'chip' + (s === libSort ? ' on' : '');
    }
  }

  function ensureSuggestSort() {
    if (!suggestSortSet) {
      suggestSortSet = true;
      libSort = 'rec';
    }
    paintSortChips();
  }

  function resetLib() {
    libFilter = '';
    libVidFilter = '';
    libSort = 'new';
    suggestSortSet = false;
    if ($('libFilter')) $('libFilter').value = '';
    if ($('libVidFilter')) $('libVidFilter').value = '';
    paintSortChips();
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
    } else if (libSort === 'views') {
      items.sort(function (a, b) { return (b.views || 0) - (a.views || 0); });
    } else if (libSort === 'dur') {
      items.sort(function (a, b) { return (b.duration || 0) - (a.duration || 0); });
    } else if (currentFeed === 'favs' && (libSort === 'old' || libSort === 'new')) {
      items = sortFavsBySaved(items, libSort);
    } else if (currentFeed === 'home' && (libSort === 'old' || libSort === 'new')) {
      if (libSort === 'old') items.reverse();
    } else if (libSort === 'old' || libSort === 'new') {
      if (hasSortTime(items)) {
        var indexed = items.map(function (it, i) { return { it: it, i: i }; });
        indexed.sort(function (a, b) {
          var d = sortTime(a.it) - sortTime(b.it);
          if (libSort === 'new') d = -d;
          return d || (a.i - b.i);
        });
        items = indexed.map(function (row) { return row.it; });
      } else if (libSort === 'old') {
        items.reverse();
      }
    }
    lastItems = items;
    var channels = currentFeed === 'search' ? (lastChannels || []) : [];
    if (currentFeed !== 'search') lastChannels = [];
    if (currentFeed === 'subs') {
      renderRail();
      if (!selectedCh) return;
    }
    renderItems(items, libEmpty, channels);
  }

  function coarseTime(ms) {
    ms = parseInt(ms, 10) || 0;
    if (ms > 0 && ms < 1e12) ms *= 1000;
    if (!(ms > 0)) return true;
    var d = new Date(ms);
    var midnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
    var noon = d.getUTCHours() === 12 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
    return midnight || noon;
  }

  function favSavedAt(it) {
    return parseInt(it && it.saved, 10) || 0;
  }

  function sortFavsBySaved(items, mode) {
    var indexed = [];
    var hasSaved = false;
    for (var i = 0; i < items.length; i++) {
      indexed.push({ it: items[i], i: i });
      if (favSavedAt(items[i])) hasSaved = true;
    }
    if (hasSaved) {
      indexed.sort(function (a, b) {
        var d = favSavedAt(a.it) - favSavedAt(b.it);
        if (mode === 'new') d = -d;
        return d || (a.i - b.i);
      });
    } else if (mode === 'old') {
      indexed.reverse();
    }
    var out = [];
    for (var j = 0; j < indexed.length; j++) out.push(indexed[j].it);
    return out;
  }

  function sortTime(it) {
    if (!it) return 0;
    var uploaded = parseInt(it.uploaded, 10) || 0;
    var ts = parseInt(it.ts, 10) || 0;
    if (uploaded && ts) {
      if (coarseTime(uploaded) && !coarseTime(ts)) return ts;
      if (coarseTime(ts) && !coarseTime(uploaded)) return uploaded;
    }
    return uploaded || ts;
  }

  function hasSortTime(arr) {
    for (var i = 0; i < arr.length; i++) if (sortTime(arr[i])) return true;
    return false;
  }

  function showWatchFilters() {
    if (!stage) return;
    showLibTools(true, 'watch');
  }

  function showSubsRail(on) {
    var td = $('subsTd');
    var split = document.querySelector('.feed-split');
    if (td) td.style.display = '';
    if (split) {
      var watch = split.className.indexOf('watch-feed') >= 0;
      split.className = 'feed-split subs-on' + (watch ? ' watch-feed' : '');
    }
    if (!on && selectedCh) {
      selectedCh = '';
      feedSubCh = null;
      renderRail();
    }
    paintFeedSub();
  }

  function paintFeedSub() {
    var box = $('feedSub');
    if (!box) return;
    var show = currentFeed === 'subs' && !!selectedCh;
    box.style.display = show ? '' : 'none';
    if (!show) return;
    var ch = subChannelById(selectedCh) || subIds[selectedCh] || feedSubCh || { channel_id: selectedCh, name: selectedCh };
    feedSubCh = ch;
    if ($('feedSubName')) $('feedSubName').textContent = ch.name || ch.channel_id || '';
    var btn = $('btnFeedSub');
    if (!btn) return;
    var on = !!subIds[selectedCh];
    btn.className = 'sub-btn' + (on ? ' on' : '');
    btn.textContent = on ? '구독중' : '구독';
  }

  function syncSubListMembership(ch, on) {
    if (!ch || !ch.channel_id) return;
    var id = ch.channel_id;
    var idx = -1;
    var i;
    for (i = 0; i < subList.length; i++) {
      if (subList[i] && subList[i].channel_id === id) { idx = i; break; }
    }
    if (on) {
      if (idx < 0) {
        if (!ch.ts) ch.ts = Date.now();
        subList.push(ch);
        subList = sortSubList(subList);
      }
    } else if (idx >= 0) {
      subList.splice(idx, 1);
    }
    renderRail();
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
    var q = subsFindQ || (currentFeed === 'subs' ? libFilter : '');
    q = String(q || '').toLowerCase();
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

  function pageScrollY() {
    return window.pageYOffset || (document.documentElement && document.documentElement.scrollTop) || (document.body && document.body.scrollTop) || 0;
  }

  function restorePageScroll(y) {
    if (!(y > 0)) return;
    try { window.scrollTo(0, y); } catch (e) {}
    try { if (document.body) document.body.scrollTop = y; } catch (e2) {}
  }

  function subChannelById(id) {
    for (var i = 0; i < subList.length; i++) {
      if (subList[i].channel_id === id) return subList[i];
    }
    return null;
  }

  function rememberSubCache(id, data) {
    var prev = subVideoCache[id];
    var items = (data && data.items) ? data.items.slice() : [];
    if (prev && prev.items && prev.items.length > items.length) items = prev.items.slice();
    subVideoCache[id] = {
      ok: true,
      failed: false,
      items: items,
      more: !!(data && data.more !== false && items.length >= 8),
      channel: (data && data.channel) || (prev && prev.channel) || null
    };
  }

  function markSubFailed(id, error) {
    subVideoCache[id] = { ok: false, failed: true, items: null, error: String(error || '실패'), channel: null, more: false };
  }

  function subChannelName(id) {
    var ch = subChannelById(id) || subIds[id];
    return (ch && (ch.name || ch.channel_id)) || id || '';
  }

  function subLoadProgress() {
    var total = 0;
    var done = 0;
    var failed = 0;
    var i;
    for (i = 0; i < subList.length; i++) {
      var cid = subList[i] && subList[i].channel_id;
      if (!cid) continue;
      total++;
      var cached = subVideoCache[cid];
      if (cached && cached.ok) done++;
      else if (cached && cached.failed) failed++;
    }
    return { total: total, done: done, failed: failed, pending: total - done - failed };
  }

  function selectedSubIndex() {
    var i;
    if (!selectedCh) return -1;
    for (i = 0; i < subList.length; i++) {
      if (subList[i] && subList[i].channel_id === selectedCh) return i;
    }
    return -1;
  }

  // The rail stays on the YouTube screens. Prefetch the top of that rail.
  // Opening a channel also prefetches two after it and two before it.
  function subsAroundIndex(i) {
    var sel = selectedSubIndex();
    if (sel < 0 || i === sel) return false;
    var n;
    for (n = 0; n < SUBS_WARM_AROUND.length; n++) {
      if (sel + SUBS_WARM_AROUND[n] === i) return true;
    }
    return false;
  }

  function subsWarmTarget(i) {
    if (i < 0 || i >= subList.length) return false;
    if (!(subList[i] && subList[i].channel_id)) return false;
    if (i < SUBS_WARM_HEAD) return true;
    return subsAroundIndex(i);
  }

  function subWarmProgress() {
    var total = 0;
    var done = 0;
    var failed = 0;
    var i;
    for (i = 0; i < subList.length; i++) {
      if (!subsWarmTarget(i)) continue;
      total++;
      var cached = subVideoCache[subList[i].channel_id];
      if (cached && cached.ok) done++;
      else if (cached && cached.failed) failed++;
    }
    return { total: total, done: done, failed: failed, pending: total - done - failed };
  }

  function logSubs(msg) {
    if (!playbackDebug || !window.console || !console.log) return;
    try { console.log('[tesla-video subs]', msg); } catch (e) {}
  }

  function logSubsRoster() {
    var ids = [];
    var parts = [];
    var i;
    for (i = 0; i < subList.length; i++) {
      var ch = subList[i];
      if (!ch || !ch.channel_id) continue;
      ids.push(ch.channel_id);
      parts.push((parts.length + 1) + '.' + (ch.name || ch.channel_id) + '(재생 ' + (ch.watch_count || 0) + ')');
    }
    var key = ids.join(',');
    if (!key || key === subsRosterLogged) return;
    subsRosterLogged = key;
    subsLoggedDone = '';
    logSubs('구독 채널 ' + parts.length + '개');
    var shown = parts.length;
    var extra = 0;
    if (parts.length > 20) {
      shown = SUBS_WARM_HEAD;
      extra = parts.length - shown;
    }
    for (i = 0; i < shown; i++) logSubs(parts[i]);
    if (extra) logSubs('외 ' + extra + '개');
  }

  function showSubsLoadStatus() {
    if (currentFeed !== 'subs' || playing) return;
    var p = subWarmProgress();
    var all = subLoadProgress();
    if (!all.total) return;
    var ch = subChannelById(selectedCh);
    var head = (ch && selectedCh) ? ((ch.name || '채널') + ' · ' + ((libRaw && libRaw.length) || 0) + '개') : ('구독 ' + all.total + '개');
    var tail = p.pending
      ? ('미리받기 ' + (p.done + p.failed) + '/' + p.total + (subsWarmId ? (' · ' + subChannelName(subsWarmId)) : ''))
      : (p.failed ? ('미리받기 확인 끝 · 실패 ' + p.failed) : ('미리받기 ' + p.done + '/' + p.total));
    setStatus(head + ' · ' + tail);
  }

  function logSubsStart(kind, id) {
    var p = subWarmProgress();
    logSubs(kind + ' ' + (p.done + p.failed + 1) + '/' + p.total + ' · ' + subChannelName(id) + ' · ' + id);
    showSubsLoadStatus();
  }

  function logSubsEnd(kind, id, detail) {
    var p = subWarmProgress();
    var all = subLoadProgress();
    logSubs(kind + ' ' + p.done + '/' + p.total + ' · 실패 ' + p.failed + ' · ' + subChannelName(id) + (detail ? (' · ' + detail) : ''));
    if (p.total > 0 && p.pending === 0) {
      var outside = all.total > p.total;
      var key = p.done + ':' + p.failed + ':' + p.total + ':' + (outside ? String(selectedSubIndex()) : 'all');
      if (subsLoggedDone !== key) {
        subsLoggedDone = key;
        if (outside) {
          logSubs('미리받기 범위 끝 · 성공 ' + p.done + ' · 실패 ' + p.failed + ' · 범위 ' + p.total + ' · 구독 ' + all.total + '개');
        } else {
          logSubs(p.failed
            ? ('구독 채널 영상 확인 끝 · 성공 ' + p.done + ' · 실패 ' + p.failed + ' · 전체 ' + p.total)
            : ('구독 채널 영상 모두 불러옴 · ' + p.done + '/' + p.total));
        }
      }
    }
    showSubsLoadStatus();
  }

  function mergeOpenChannel(id, channel) {
    if (!channel) return;
    for (var j = 0; j < subList.length; j++) {
      if (subList[j].channel_id !== id) continue;
      subList[j] = channel;
      if (selectedCh === id) {
        subList[j].unread = false;
        subList[j].last_seen = Date.now();
      }
      subIds[id] = subList[j];
    }
    rememberAvatars([channel]);
    renderRail();
  }

  function paintSubItems(id, items, more) {
    var ch = subChannelById(id) || subIds[id] || { name: '' };
    var y = pageScrollY();
    libRaw = (items || []).slice();
    pager.offset = libRaw.length;
    pager.more = more !== false && libRaw.length >= 8;
    setListStatus((ch.name || '채널') + ' · ' + libRaw.length + '개');
    applyLibView('이 채널에 영상이 없습니다');
    paintMoreBar();
    restorePageScroll(y);
    showSubsLoadStatus();
  }

  function subStatsReady(id) {
    if (!playing || !stage) return true;
    if (!stagePrerollReady || prerolling || rebuffering || selectedCh !== id) return false;
    if (paused) return true;
    if (subStatsStableChannel !== id) {
      subStatsStableChannel = id;
      subStatsStableSince = 0;
    }
    var now = Date.now();
    if (packedAhead() >= SUBS_DETAIL_BUFFER_SEC) {
      if (!subStatsStableSince) subStatsStableSince = now;
      if (now - subStatsStableSince >= SUBS_DETAIL_STABLE_MS) return true;
    } else {
      subStatsStableSince = 0;
    }
    return !!(videoStartWall && now - videoStartWall >= SUBS_DETAIL_FALLBACK_MS
      && audioAheadSec() >= 0.2 && stageFrameReady && lastVideoDecodeAt
      && now - lastVideoDecodeAt < 1500);
  }

  function fetchSubStats(id, seq) {
    logSubs('상세 확인 시작 · ' + subChannelName(id) + ' · ' + id);
    subPriority++;
    tv.get('/api/subscriptions/channel?id=' + encodeURIComponent(id) + '&limit=16', function (code, data) {
      if (subPriority > 0) subPriority--;
      if (!stillReq(seq) || currentFeed !== 'subs' || selectedCh !== id) return;
      if (!data || !data.ok || !data.items) {
        logSubs('상세 확인 실패 · ' + subChannelName(id) + ' · ' + ((data && data.error) || '응답 없음'));
        return;
      }
      var byId = {};
      var i;
      for (i = 0; i < data.items.length; i++) {
        if (data.items[i] && data.items[i].id) byId[data.items[i].id] = data.items[i];
      }
      var cached = subVideoCache[id];
      var base = (cached && cached.items && cached.items.length) ? cached.items : data.items.slice();
      for (i = 0; i < base.length; i++) {
        if (base[i] && byId[base[i].id]) base[i] = byId[base[i].id];
      }
      subVideoCache[id] = {
        ok: true,
        failed: false,
        items: base.slice(),
        more: data.more !== false && base.length >= 8,
        channel: data.channel || (cached && cached.channel) || null
      };
      if (data.channel) mergeOpenChannel(id, data.channel);
      var memberCount = 0;
      for (i = 0; i < base.length; i++) if (base[i] && base[i].members) memberCount++;
      logSubs('상세 확인 완료 · ' + subChannelName(id) + ' · 영상 ' + base.length + '개 · 회원전용 ' + memberCount + '개');
      if (selectedCh !== id) return;
      if (libRaw.length > base.length) {
        for (i = 0; i < libRaw.length; i++) {
          if (libRaw[i] && byId[libRaw[i].id]) libRaw[i] = byId[libRaw[i].id];
        }
        var y = pageScrollY();
        applyLibView('이 채널에 영상이 없습니다');
        paintMoreBar();
        restorePageScroll(y);
        return;
      }
      paintSubItems(id, base, data.more);
    });
  }

  function refreshSubStats(id, seq) {
    if (subStatsReady(id)) {
      pendingSubStats = null;
      subStatsStableChannel = '';
      subStatsStableSince = 0;
      fetchSubStats(id, seq);
      return;
    }
    pendingSubStats = { id: id, seq: seq };
    logSubs('상세 확인 대기 · ' + subChannelName(id));
    if (subStatsTimer) return;
    function check() {
      subStatsTimer = null;
      var request = pendingSubStats;
      if (!request) return;
      if (!stillReq(request.seq) || currentFeed !== 'subs' || selectedCh !== request.id) {
        pendingSubStats = null;
        subStatsStableChannel = '';
        subStatsStableSince = 0;
        return;
      }
      if (!subStatsReady(request.id)) {
        subStatsTimer = setTimeout(check, 500);
        return;
      }
      pendingSubStats = null;
      subStatsStableChannel = '';
      subStatsStableSince = 0;
      fetchSubStats(request.id, request.seq);
    }
    subStatsTimer = setTimeout(check, 500);
  }

  function sortSubList(items) {
    return (items || []).slice().sort(function (a, b) {
      var ac = a.watch_count || 0;
      var bc = b.watch_count || 0;
      if (bc !== ac) return bc - ac;
      return (b.ts || 0) - (a.ts || 0);
    });
  }

  function warmDelay() {
    if (subPriority > 0) return 600;
    if (playing) return 2500;
    return 2000;
  }

  // Hold background channel work through playback startup and preroll.
  function playbackNeedsPipe() {
    if (!playing || ended) return false;
    if (pipePending) return true;
    if (!player || prerolling || !stagePrerollReady) return true;
    var ahead = packedAhead();
    var remain = remainSec();
    if (remain <= 0.5 || ahead >= remain - 0.2) return false;
    return ahead < SUBS_WARM_BUFFER_SEC;
  }

  function warmBusy(cid) {
    if (!cid || subVideoCache[cid] || cid === subsWarmId) return true;
    if (subsOpen && cid === subsOpen.id) return true;
    if (selectedCh && cid === selectedCh) return true;
    return false;
  }

  function nextWarmId() {
    var sel = selectedSubIndex();
    var n;
    var i;
    var cid;
    if (sel >= 0) {
      for (n = 0; n < SUBS_WARM_AROUND.length; n++) {
        i = sel + SUBS_WARM_AROUND[n];
        if (i < 0 || i >= subList.length || !subList[i]) continue;
        cid = subList[i].channel_id;
        if (warmBusy(cid)) continue;
        return cid;
      }
    }
    for (i = 0; i < SUBS_WARM_HEAD && i < subList.length; i++) {
      if (!subList[i]) continue;
      cid = subList[i].channel_id;
      if (warmBusy(cid)) continue;
      return cid;
    }
    return '';
  }

  // One channel at a time. The rail is always visible, so the top of the
  // rail is prefetched on entry. A selected channel first prefetches the
  // next, previous, two-ahead, and two-back channels that are not cached.
  function warmOtherChannels() {
    var gen = ++subsWarmGen;
    function step() {
      if (gen !== subsWarmGen) return;
      logSubsRoster();
      if (playbackNeedsPipe()) {
        if (!subsWarmHoldLogged) {
          subsWarmHoldLogged = true;
          logSubs('미리받기 일시정지 · 재생 버퍼 채우는 중');
        }
        setTimeout(step, 600);
        return;
      }
      if (subsWarmHoldLogged) {
        subsWarmHoldLogged = false;
        logSubs('미리받기 다시 시작');
      }
      if (subPriority > 0 || pendingSubStats || subsWarmId) {
        setTimeout(step, 600);
        return;
      }
      var nextId = nextWarmId();
      if (!nextId) return;
      setTimeout(function () {
        if (gen !== subsWarmGen) return;
        if (playbackNeedsPipe() || subPriority > 0 || pendingSubStats) {
          step();
          return;
        }
        if (nextWarmId() !== nextId || subPriority > 0 || subVideoCache[nextId] || subsWarmId || (subsOpen && subsOpen.id === nextId) || (selectedCh && nextId === selectedCh)) {
          step();
          return;
        }
        subsWarmId = nextId;
        logSubsStart('미리받기', nextId);
        tv.get('/api/subscriptions/channel?id=' + encodeURIComponent(nextId) + '&limit=16&quick=1', function (code, data) {
          if (subsWarmId === nextId) subsWarmId = '';
          var paint = subsWarmPaint && subsWarmPaint.id === nextId ? subsWarmPaint : null;
          if (data && data.ok) {
            rememberSubCache(nextId, data);
            logSubsEnd('미리받기 완료', nextId, '영상 ' + ((data.items && data.items.length) || 0) + '개');
            if (paint && stillReq(paint.seq) && currentFeed === 'subs' && selectedCh === nextId) {
              subsWarmPaint = null;
              if (data.channel) mergeOpenChannel(nextId, data.channel);
              paintSubItems(nextId, (subVideoCache[nextId] && subVideoCache[nextId].items) || [], data.more);
              if (data.quick) refreshSubStats(nextId, paint.seq);
            } else if (currentFeed === 'subs' && data.channel && selectedCh !== nextId) {
              mergeOpenChannel(nextId, data.channel);
            }
          } else {
            markSubFailed(nextId, (data && data.error) || '응답 없음');
            logSubsEnd('미리받기 실패', nextId, (data && data.error) || '응답 없음');
            if (paint && stillReq(paint.seq) && currentFeed === 'subs' && selectedCh === nextId) {
              subsWarmPaint = null;
              setListStatus((data && data.error) || '채널 영상을 불러오지 못했습니다');
              pager.more = false;
              paintMoreBar();
              if (list) list.innerHTML = '<div class="notice">이 채널의 영상을 가져오지 못했습니다. 다시 눌러 보세요.</div>';
            }
          }
          if (gen !== subsWarmGen) return;
          step();
        });
      }, warmDelay());
    }
    step();
  }

  function openChannel(id, opts) {
    opts = opts || {};
    var ch = subChannelById(id);
    if (!ch || !id) return;
    if (currentFeed !== 'subs') resetLib();
    setChip('subs');
    showLibTools(true, 'subs');
    showSubsRail(true);
    var seq = opts.keepSeq ? reqSeq : beginReq();
    var feedGen = ++subFeedGen;
    selectedCh = id;
    feedSubCh = ch;
    paintFeedSub();
    ch.unread = false;
    ch.last_seen = Date.now();
    saveBrowseState();
    renderRail();
    revealSelectedChannel(0);
    tv.post('/api/subscriptions/seen', { channel_id: id }, function () {});
    resetPager('subchannel', { id: id, name: ch.name || '' });
    var cached = subVideoCache[id];
    if (cached && cached.ok) {
      logSubs('선택 캐시 · ' + subChannelName(id) + ' · 영상 ' + ((cached.items && cached.items.length) || 0) + '개 · ' + id);
      paintSubItems(id, cached.items || [], cached.more);
      refreshSubStats(id, seq);
      warmOtherChannels();
      return;
    }
    if (cached && cached.failed) delete subVideoCache[id];
    if (subsWarmId === id || (subsOpen && subsOpen.id === id)) {
      subsWarmPaint = { id: id, seq: seq };
      if (subsOpen && subsOpen.id === id) subsOpen.seq = seq;
      logSubs('선택 · 이미 미리받는 중 · ' + subChannelName(id) + ' · ' + id);
      setListStatus((ch.name || '채널') + ' 영상을 불러오는 중...');
      renderSkeleton();
      return;
    }
    setListStatus((ch.name || '채널') + ' 영상을 불러오는 중...');
    renderSkeleton();
    logSubsStart('선택', id);
    subPriority++;
    subsOpen = { id: id, seq: seq };
    tv.get('/api/subscriptions/channel?id=' + encodeURIComponent(id) + '&limit=16&quick=1', function (code, data) {
      if (subPriority > 0) subPriority--;
      var ticket = subsOpen;
      var mine = ticket && ticket.id === id;
      var paintSeq = mine ? ticket.seq : seq;
      if (mine && subsOpen === ticket) subsOpen = null;
      var live = subFeedGen === feedGen && currentFeed === 'subs' && selectedCh === id && (opts.keepSeq || stillReq(paintSeq));
      if (data && data.ok) {
        rememberSubCache(id, data);
        logSubsEnd('선택 완료', id, '영상 ' + ((data.items && data.items.length) || 0) + '개');
        if (!live) {
          if (currentFeed === 'subs' && !subsOpen) warmOtherChannels();
          return;
        }
        if (data.channel) mergeOpenChannel(id, data.channel);
        paintSubItems(id, (subVideoCache[id] && subVideoCache[id].items) || data.items || [], data.more);
        if (data.quick) {
          refreshSubStats(id, paintSeq);
          warmOtherChannels();
        }
        return;
      }
      if (subsOpen && subsOpen.id === id) return;
      if (subVideoCache[id] && subVideoCache[id].ok) return;
      markSubFailed(id, (data && data.error) || '응답 없음');
      logSubsEnd('선택 실패', id, (data && data.error) || '응답 없음');
      if (!live) {
        if (currentFeed === 'subs' && !subsOpen) warmOtherChannels();
        return;
      }
      setListStatus((data && data.error) || '채널 영상을 불러오지 못했습니다');
      pager.more = false;
      paintMoreBar();
      if (list) list.innerHTML = '<div class="notice">이 채널의 영상을 가져오지 못했습니다. 다시 눌러 보세요.</div>';
      warmOtherChannels();
    });
  }

  function loadHome() {
    var seq = beginReq();
    setChip('home');
    clearSearchBox();
    lastChannels = [];
    resetLib();
    libRaw = [];
    showLibTools(true, 'list');
    showSubsRail(false);
    resetPager('home');
    setStatus('추천 영상을 불러오는 중...');
    renderSkeleton();
    saveBrowseState();
    tv.get('/api/youtube/home?limit=16', function (code, data) {
      if (!stillReq(seq) || currentFeed !== 'home') return;
      if (code === 401) { setStatus('PIN이 필요합니다. 새로고침 후 다시 입력하세요.'); return; }
      if (!data || !data.ok || !data.items || !data.items.length) {
        setStatus((data && data.error) ? (data.error + ' → 인기 영상으로 대체') : '홈 실패, 인기 영상으로 대체');
        tv.get('/api/youtube/search?q=' + encodeURIComponent('인기 급상승') + '&limit=16', function (c2, d2) {
          if (!stillReq(seq) || currentFeed !== 'home') return;
          libRaw = ((d2 && d2.items) || []).slice();
          lastChannels = [];
          pager.offset = libRaw.length;
          pager.more = !!(d2 && d2.more);
          applyLibView('영상을 불러오지 못했습니다');
        });
        return;
      }
      setStatus('최근 인기');
      libRaw = (data.items || []).slice();
      pager.offset = libRaw.length;
      pager.more = data.more !== false;
      applyLibView('영상을 불러오지 못했습니다');
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
      var items = (data && data.ok && data.items) || [];
      for (var i = 0; i < items.length; i++) subIds[items[i].channel_id] = items[i];
      if (items.length) rememberAvatars(items);
      if (currentFeed !== 'subs') {
        subList = sortSubList(items);
        renderRail();
        if (subList.length) warmOtherChannels();
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
        syncSubListMembership(ch, !want);
        paintFeedSub();
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
      syncSubListMembership(ch, !!data.on);
      paintFeedSub();
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
    syncSubListMembership(ch, want);
    if (selectedCh === id) feedSubCh = ch;
    paintFeedSub();
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
    if (stage && (!chip || chip === 'search')) showWatchFilters();
    else if (!stage) {
      resetLib();
      libRaw = [];
      showLibTools(true, 'list');
    } else showLibTools(false);
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
      if ((stage && (!chip || chip === 'search')) || !stage) {
        libRaw = lastItems.slice();
        applyLibView('검색 결과 없음');
      } else {
        renderItems(lastItems, '검색 결과 없음', lastChannels);
      }
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
      subList = sortSubList(data.items || []);
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
          subList = sortSubList(d2.items);
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
  function speakerDelaySec() {
    try {
      var ctx = player && player.audioOut && player.audioOut.context;
      if (!ctx) return 0;
      var delay = 0;
      if (isFinite(ctx.outputLatency) && ctx.outputLatency > 0) delay = ctx.outputLatency;
      else if (isFinite(ctx.baseLatency) && ctx.baseLatency > 0) delay = ctx.baseLatency;
      if (delay > 0.25) delay = 0.25;
      return delay > 0 ? delay : 0;
    } catch (e) { return 0; }
  }

  function speakerHeard() {
    try {
      var out = player && player.audioOut;
      if (!out || !out.context || !(out._schedEndMedia > 0) || out._schedEndCtx == null) return 0;
      var ahead = out._schedEndCtx - out.context.currentTime;
      if (ahead < 0) ahead = 0;
      // currentTime is when the sample enters the output device. The picture
      // has to wait out the device delay or it leads the sound that is heard.
      var heard = out._schedEndMedia - ahead - speakerDelaySec();
      return heard > 0 && isFinite(heard) ? heard : 0;
    } catch (e) { return 0; }
  }

  function audioContextRunning(out) {
    try {
      var ctx = out && out.context;
      if (!ctx && player && player.audioOut) ctx = player.audioOut.context;
      return !!(ctx && ctx.state === 'running');
    } catch (e) { return false; }
  }

  function clearSilentClock() {
    silentClockFrom = 0;
    silentClockBase = 0;
  }

  function armSilentClock(base) {
    if (audioContextRunning()) return;
    if (!(base >= 0) || !isFinite(base)) base = 0;
    silentClockBase = base;
    silentClockFrom = Date.now();
    watchAudioContext(player && player.audioOut && player.audioOut.context);
    debugPlayback('silent-clock', { base: base });
  }

  function pauseSilentClock() {
    if (!(silentClockFrom > 0)) return;
    silentClockBase = silentClockBase + (Date.now() - silentClockFrom) / 1000;
    silentClockFrom = -1;
  }

  function resumeSilentClock() {
    if (silentClockFrom < 0) silentClockFrom = Date.now();
  }

  function silentHeard() {
    if (!silentClockFrom || audioContextRunning()) return 0;
    var t = silentClockBase;
    if (silentClockFrom > 0 && !paused && !prerolling) t += (Date.now() - silentClockFrom) / 1000;
    if (!isLive && duration > startAt) {
      var cap = duration - startAt;
      if (t > cap) t = cap;
    }
    return t > 0 && isFinite(t) ? t : 0;
  }

  function playingSoundTime(opts) {
    var allowFallback = !(opts && opts.fallback === false);
    var heard = speakerHeard();
    if (heard > 0) return rememberHeard(heard);
    if (!audioContextRunning()) {
      var coast = silentHeard();
      if (coast > 0) return coast;
    }
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
    return heard > 0 && isFinite(vt) && vt >= heard - 0.008 && vt <= heard + 0.04;
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
        if (playbackDebug) {
          try {
            console.warn('[tesla-video sync] A/V drift detected', {
              startAt: startAt,
              videoTime: vt,
              audioTime: heard,
              drift: vt - heard,
            });
          } catch (eWarn) {}
        }
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
      if (vt >= heard - 0.004) {
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
        if (playbackDebug) {
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
        speakerDelayMs: Math.round(speakerDelaySec() * 1000),
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

  var measuredVideoBps = 0;

  function tuneVideoRate() {
    var vBytes = bitsUnread(player && player.video);
    var aSec = bufferLeftSec(player && player.audio, 24000) + queuedAudio();
    if (vBytes < 8000 || aSec < 2) return;
    var implied = vBytes / aSec;
    if (!(implied >= 8000 && implied <= 800000)) return;
    measuredVideoBps = measuredVideoBps ? (measuredVideoBps * 0.8 + implied * 0.2) : implied;
  }

  function videoByteRate() {
    tuneVideoRate();
    if (measuredVideoBps > 0) return measuredVideoBps;
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

  function sendStreamCtrl(hold, force) {
    hold = !!hold;
    if (streamHeld === hold && !force) return;
    var sock = streamSocket();
    if (!sock || sock.readyState !== 1) return;
    try {
      sock.send(JSON.stringify({ type: hold ? 'hold' : 'go' }));
      streamHeld = hold;
    } catch (e) {}
  }

  function nearEnd() {
    if (isLive || !(duration > 0)) return false;
    // Use the heard position. A retained label from the previous play must
    // not make a repeat look finished for its whole running time.
    return audiblePos() >= Math.max(0, duration - 1.5);
  }

  function titleGapSec() {
    if (isLive || !(duration > 0)) return 0;
    var gap = duration - audiblePos();
    return gap > 0 ? gap : 0;
  }

  // The bytes already in hand reach the title, allowing the same slack the
  // clock uses when the label is a little longer than the last sample.
  function tailCoversTitle() {
    var gap = titleGapSec();
    if (!(gap > 2.5)) return true;
    return audioAheadSec() + 2.5 >= gap;
  }

  function titleStillAhead() {
    if (isLive || !(duration > 0)) return false;
    return titleGapSec() > 2.5 && !tailCoversTitle();
  }

  function audioPendingSec() {
    return Math.max(0, bufferLeftSec(player && player.audio, 24000) + queuedAudio());
  }

  function readyToFinish() {
    if (isLive || !streamEnded) return false;
    if (audioPendingSec() >= 0.25) return false;
    if (!(duration > 0)) return true;
    var gap = titleGapSec();
    // A large hole means the encode stopped early. Finishing here skips the
    // rest of the title and starts the repeat countdown.
    if (gap > 2.5 && !forceShortFinish) return false;
    if (gap > 2.5) return true;
    return currentPos() >= duration - 0.2;
  }

  function continueUnfinishedTitle(preferLegacy) {
    if (ended || !playing || isLive) return false;
    if (recoveringStream) return true;
    if (paused) {
      pendingEarlyContinue = true;
      return true;
    }
    var at = streamResumeSec();
    if (duration > 0 && at > duration - 1) at = Math.max(0, duration - 1);
    var same = earlyResumeAt >= 0 && Math.abs(at - earlyResumeAt) < 12;
    var useLegacy = false;
    if (same) {
      if (earlyResumeLegacy) return false;
      useLegacy = true;
      earlyResumeLegacy = true;
    } else if (preferLegacy) {
      useLegacy = true;
      earlyResumeLegacy = true;
    } else {
      earlyResumeLegacy = false;
    }
    earlyResumeAt = at;
    pendingEarlyContinue = false;
    debugPlayback('continue-unfinished', {
      at: at,
      gap: titleGapSec(),
      audioAhead: audioAheadSec(),
      legacy: useLegacy
    });
    recoveringStream = true;
    if (beginSeamlessReconnect(useLegacy, null, false, null, 'unfinished-title')) return true;
    var gen = streamGen;
    var resumeAtSec = at;
    setStatus(resumeAtSec > 1 ? '끊긴 위치부터 다시 받는 중...' : '불러오는 중');
    setTimeout(function () {
      recoveringStream = false;
      if (gen !== streamGen || !playing || ended) return;
      playUrl(playing, resumeAtSec, { skipInfo: true, legacy: useLegacy, keepEarlyResume: true });
    }, 40);
    return true;
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
    paintPlayButton();
    applyChrome();
    showChromeOverlay();
    paintSeekBar();
    setStatus('종료');
    if (repeatEnabled) scheduleRepeatPlayback();
    else if (autoplayNext) scheduleNextPlayback();
  }

  function clearEndTimer() {
    if (repeatTimer) { clearTimeout(repeatTimer); repeatTimer = null; }
    repeatAt = 0;
    endMode = '';
    nextDue = false;
    nextItem = null;
    nextReady = false;
    nextToken += 1;
  }

  function beginRepeatRestart(src) {
    preservedStageFrame = '';
    if (stage) {
      try { stage.width = stage.width; } catch (eClear) {}
    }
    debugPlayback('repeat-restart', { requestedStart: 0, lastPosition: lastPlaybackPos });
    playUrl(src, 0, { skipInfo: false, repeat: true });
  }

  function scheduleRepeatPlayback() {
    if (!repeatEnabled || !playing || isLive) return;
    clearEndTimer();
    endMode = 'repeat';
    if (repeatRunCount >= REPEAT_PLAY_LIMIT) {
      showRepeatAsk();
      return;
    }
    var src = playing;
    repeatAt = Date.now() + 3000;
    setStatus('3초 뒤에 다시 재생합니다');
    repeatTimer = setTimeout(function () {
      repeatTimer = null;
      repeatAt = 0;
      if (!repeatEnabled || !src || playing !== src || !ended) return;
      repeatRunCount += 1;
      beginRepeatRestart(src);
    }, 3000);
  }

  function favsNewest(items) {
    var rows = [];
    for (var i = 0; i < (items || []).length; i++) {
      if (items[i] && items[i].id) rows.push(items[i]);
    }
    return sortFavsBySaved(rows, 'new');
  }

  function nextPlayableItem(rows, currentId) {
    var list = rows || [];
    if (!list.length) return null;
    var start = 0;
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === currentId) { start = i + 1; break; }
    }
    for (i = 0; i < list.length; i++) {
      var it = list[(start + i) % list.length];
      if (!it || !it.id || it.id === currentId) continue;
      if (it.members === true) continue;
      return it;
    }
    return null;
  }

  function fetchNextSubscriptionItem(channelId, currentId, done, offset, currentUploaded) {
    offset = Number(offset) || 0;
    var pageSize = 40;
    currentUploaded = Number(currentUploaded) || 0;
    if (offset > 400 && !currentUploaded) { done(null); return; }
    if (!offset) {
      var cached = subVideoCache[channelId];
      var cachedItems = cached && cached.ok && cached.items ? cached.items : [];
      var cachedCurrentIndex = -1;
      for (var c = 0; c < cachedItems.length; c++) {
        if (cachedItems[c] && cachedItems[c].id === currentId) { cachedCurrentIndex = c; break; }
      }
      if (cachedCurrentIndex >= 0) {
        for (var n = cachedCurrentIndex + 1; n < cachedItems.length; n++) {
          if (cachedItems[n] && cachedItems[n].id && cachedItems[n].members !== true) {
            done(cachedItems[n]);
            return;
          }
        }
        offset = cachedItems.length;
      }
    }
    tv.get('/api/subscriptions/channel?id=' + encodeURIComponent(channelId)
      + '&limit=' + pageSize + '&offset=' + offset + '&quick=1', function (code, data) {
      if (!data || !data.ok || !data.items) { done(null); return; }
      var items = data.items;
      var currentIndex = -1;
      for (var i = 0; i < items.length; i++) {
        if (items[i] && items[i].id === currentId) { currentIndex = i; break; }
      }
      if (currentIndex >= 0) {
        for (var j = currentIndex + 1; j < items.length; j++) {
          if (items[j] && items[j].id && items[j].members !== true) {
            done(items[j]);
            return;
          }
        }
      }
      if (items.length >= pageSize) {
        var oldest = items[items.length - 1];
        var oldestUploaded = Number(oldest && (oldest.uploaded || oldest.ts)) || 0;
        if (currentUploaded && oldestUploaded && oldestUploaded < currentUploaded) {
          done(null);
          return;
        }
        fetchNextSubscriptionItem(channelId, currentId, done, offset + items.length, currentUploaded);
        return;
      }
      done(null);
    });
  }

  function fetchNextPlaybackItem(done) {
    var currentId = (watchItem && watchItem.id) || qsVal('v') || '';
    var subChannelId = watchSubChannel();
    var videoChannelId = watchItem && watchItem.channel_id;
    if (subChannelId && (!videoChannelId || videoChannelId === subChannelId)) {
      subPriority++;
      fetchNextSubscriptionItem(subChannelId, currentId, function (item) {
        if (subPriority > 0) subPriority--;
        done(item);
      }, 0, watchItem && watchItem.uploaded);
      return;
    }
    tv.get('/api/youtube/suggest?id=' + encodeURIComponent(currentId) + '&pick=next', function (code, data) {
      done(nextPlayableItem((data && data.ok && data.items) || [], currentId));
    });
  }

  function nextItemKeepsSubscriptionOrigin(item) {
    var subChannelId = watchSubChannel();
    var videoChannelId = watchItem && watchItem.channel_id;
    return !!(subChannelId && item && item.channel_id === subChannelId
      && (!videoChannelId || videoChannelId === subChannelId));
  }

  function nextFavItem(items, currentId) {
    var rows = favsNewest(items);
    if (rows.length < 2) return null;
    return nextPlayableItem(rows, currentId);
  }

  function showWatchFavs(opts) {
    opts = opts || {};
    if (!list) return;
    var seq = opts.keepSeq ? reqSeq : beginReq();
    setChip('favs');
    showWatchFilters();
    showSubsRail(false);
    resetPager('favs');
    pager.more = false;
    paintMoreBar();
    if (!list.querySelector('.yt-card')) renderSkeleton();
    tv.get('/api/favorites', function (code, data) {
      if (!stillReq(seq) || currentFeed !== 'favs') return;
      var items = (data && data.ok && data.items) || [];
      for (var i = 0; i < items.length; i++) favIds[items[i].id] = items[i];
      paintWatchStar();
      libRaw = items;
      applyLibView(data && data.ok ? '즐겨찾기가 없습니다' : '즐겨찾기를 불러오지 못했습니다');
    });
  }

  function autoRunCount() {
    try { return parseInt(sessionStorage.getItem('tv_auto_run') || '0', 10) || 0; }
    catch (e) { return 0; }
  }

  function setAutoRunCount(n) {
    try { sessionStorage.setItem('tv_auto_run', String(Math.max(0, n || 0))); } catch (e) {}
  }

  function hideAutoAsk() {
    var el = $('autoAsk');
    if (el) el.className = 'auto-ask';
  }

  function showAutoAsk() {
    var el = $('autoAsk');
    if (!el) {
      el = document.createElement('div');
      el.id = 'autoAsk';
      el.className = 'auto-ask';
      el.innerHTML = '<div class="auto-ask-box"><h2>다음 영상을 재생할까요?</h2><p>자동으로 ' + AUTO_NEXT_LIMIT + '개 영상을 재생했습니다.</p><div class="auto-ask-actions"><button type="button" class="btn btn-gray" id="autoAskNo">그만</button><button type="button" class="btn btn-red" id="autoAskYes">재생</button></div></div>';
      document.body.appendChild(el);
      $('autoAskYes').onclick = function () {
        hideAutoAsk();
        if (!nextItem) { setStatus('종료'); return; }
        startNextVideo(true);
      };
      $('autoAskNo').onclick = function () {
        hideAutoAsk();
        nextItem = null;
        nextDue = false;
        setStatus('종료');
      };
    }
    el.className = 'auto-ask on';
    setStatus('다음 영상을 재생할까요?');
  }

  function hideRepeatAsk() {
    repeatAskOpen = false;
    var el = $('repeatAsk');
    if (el) el.className = 'auto-ask';
  }

  function showRepeatAsk() {
    repeatHeld = false;
    repeatAskOpen = true;
    var el = $('repeatAsk');
    if (!el) {
      el = document.createElement('div');
      el.id = 'repeatAsk';
      el.className = 'auto-ask';
      el.innerHTML = '<div class="auto-ask-box"><h2>계속 반복 재생할까요?</h2><p>이 영상을 ' + REPEAT_PLAY_LIMIT + '번 반복 재생했습니다.</p><div class="auto-ask-actions"><button type="button" class="btn btn-gray" id="repeatAskNo">취소</button><button type="button" class="btn btn-red" id="repeatAskYes">계속 재생</button></div></div>';
      document.body.appendChild(el);
      $('repeatAskYes').onclick = function () {
        var src = playing;
        hideRepeatAsk();
        repeatHeld = false;
        repeatRunCount = 1;
        if (!repeatEnabled || !src) { setStatus('일시정지'); return; }
        beginRepeatRestart(src);
        showChromeOverlay();
      };
      $('repeatAskNo').onclick = function () {
        hideRepeatAsk();
        repeatHeld = true;
        setStatus('일시정지');
        showChromeOverlay();
      };
    }
    el.className = 'auto-ask on';
    setStatus('계속 반복 재생할까요?');
    showChromeOverlay();
  }

  function startNextVideo(confirmed) {
    nextDue = false;
    if (repeatEnabled || !autoplayNext || !ended || !nextItem) {
      if (ended && !repeatEnabled) setStatus('종료');
      return;
    }
    var item = nextItem;
    nextItem = null;
    if (item.members === true) {
      setStatus('종료');
      return;
    }
    var keepSubscriptionOrigin = nextItemKeepsSubscriptionOrigin(item);
    goWatch(item.id, item.url, {
      keepFrom: true,
      clearOrigin: !keepSubscriptionOrigin,
      auto: true,
      resetRun: !!confirmed,
      members: !!item.members,
      channelId: item.channel_id || '',
      channelName: item.uploader || item.channel || '',
      title: item.title || '',
      uploaded: item.uploaded || item.ts || 0,
      thumbnail: item.thumbnail || '',
      duration: item.duration || 0,
      views: item.views || 0
    });
  }

  function scheduleNextPlayback() {
    if (repeatEnabled || !autoplayNext || !playing || isLive) return;
    clearEndTimer();
    endMode = 'next';
    var src = playing;
    var token = nextToken;
    var limited = autoRunCount() >= AUTO_NEXT_LIMIT;
    if (!limited) {
      repeatAt = Date.now() + 3000;
      setStatus('3초 뒤에 다음 영상을 재생합니다');
    } else {
      setStatus('다음 영상을 확인하는 중...');
    }
    function gotNext(item) {
      if (token !== nextToken) return;
      nextReady = true;
      nextItem = item || null;
      if (limited) {
        if (!nextItem) { setStatus('종료'); return; }
        showAutoAsk();
        return;
      }
      if (nextDue) startNextVideo(false);
    }
    fetchNextPlaybackItem(gotNext);
    if (limited) return;
    repeatTimer = setTimeout(function () {
      repeatTimer = null;
      repeatAt = 0;
      if (repeatEnabled || !autoplayNext || !src || playing !== src || !ended) return;
      if (!nextReady) {
        nextDue = true;
        setStatus('다음 영상을 불러오는 중...');
        return;
      }
      startNextVideo(false);
    }, 3000);
  }

  function applyStreamHold() {
    if (ended || !player || isLive) {
      if (isLive) sendStreamCtrl(false);
      return;
    }
    if (seamPlayer) {
      sendStreamCtrl(true);
      return;
    }
    var fill = decoderFill();
    var ahead = packedAhead();
    var q = queuedAudio();
    var audioAhead = audioAheadSec();
    var videoAhead = videoAheadSec();
    var remain = remainSec();
    var audioUse = byteUse(player.audio);
    var videoUse = byteUse(player.video);
    var bytesTight = audioUse >= 0.45 || videoUse >= 0.45;
    var quiet = lastNetGrowthAt > 0 && Date.now() - lastNetGrowthAt > 800;
    // Start pulling again while most of the target is still left. A 5s floor
    // lets the speaker queue hit zero before the server is sending again.
    var refillBelow = Math.max(8, bufTarget - 4);
    if (!paused && (audioAhead < refillBelow || videoAhead < 1)) {
      sendStreamCtrl(false, quiet);
      return;
    }
    var wantHold = false;
    if (paused) {
      if (ahead >= bufTarget || ahead >= remain - 0.2 || bytesTight) wantHold = true;
    } else if (audioAhead >= bufTarget) {
      wantHold = true;
    } else if (ahead >= bufTarget && q > 0.6) {
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
    if (ahead < bufTarget - 2) sendStreamCtrl(false, quiet);
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

  function byteUse(dec) {
    try {
      var bits = dec && dec.bits;
      if (!bits || !bits.bytes || !bits.bytes.length) return 0;
      var unread = bits.byteLength - ((bits.index || 0) >> 3);
      if (unread < 0) unread = 0;
      return unread / bits.bytes.length;
    } catch (e) { return 0; }
  }

  function hardenBits(dec) {
    if (!dec || !dec.bits || dec.bits.__keep) return;
    var bits = dec.bits;
    bits.__keep = true;
    bits.evict = function () {
      var consumed = this.index >> 3;
      // A full buffer still holds audio or video we have not played.
      // Discarding it is what freezes the picture and forces a reload.
      if (consumed > 0 && this.byteLength > consumed) {
        if (this.bytes.copyWithin) this.bytes.copyWithin(0, consumed, this.byteLength);
        else this.bytes.set(this.bytes.subarray(consumed, this.byteLength), 0);
        this.byteLength -= consumed;
        this.index -= consumed << 3;
        return;
      }
      if (this.index === (this.byteLength << 3)) {
        this.byteLength = 0;
        this.index = 0;
      }
    };
    bits.appendSingleBuffer = function (buf) {
      buf = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
      this.evict();
      var room = this.bytes.length - this.byteLength;
      if (room < buf.length && this.resize) {
        var need = this.byteLength + buf.length;
        this.resize(Math.max(need, this.bytes.length * 2));
        room = this.bytes.length - this.byteLength;
      }
      if (room < buf.length) {
        // Clearing this side only skips seconds of picture or sound while the
        // other side and both clocks keep going, so they drift apart by that gap.
        sendStreamCtrl(true);
        needStreamRestart = true;
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
    if (isLive) {
      if (wrap) wrap.style.display = 'none';
      seek.style.display = 'none';
      seek.disabled = true;
      if ($('seekKnob')) $('seekKnob').style.display = 'none';
      bufEnd = 0;
      return;
    }
    if (wrap) wrap.style.display = 'block';
    seek.style.display = 'block';
    if (!duration) {
      seek.disabled = false;
      seek.min = '0';
      seek.max = '1000';
      var pendingRatio = pendingSeekRatio == null ? 0 : pendingSeekRatio;
      seek.value = String(Math.round(pendingRatio * 1000));
      if ($('seekPlay')) $('seekPlay').style.width = (pendingRatio * 100) + '%';
      if ($('seekBuf')) {
        $('seekBuf').style.left = (pendingRatio * 100) + '%';
        $('seekBuf').style.width = '0%';
      }
      if ($('seekKnob')) {
        $('seekKnob').style.display = '';
        $('seekKnob').style.left = (pendingRatio * 100) + '%';
      }
      return;
    }
    seek.disabled = false;
    if ($('seekKnob')) $('seekKnob').style.display = '';
    var pos = currentPos();
    if (pos < 0) pos = 0;
    if (pos > duration) pos = duration;
    seek.max = duration;
    seek.value = String(pos);
    var ahead = packedAhead();
    if (ahead > duration - pos) ahead = Math.max(0, duration - pos);
    var playPct = pos / duration;
    if ($('seekPlay')) $('seekPlay').style.width = (playPct * 100) + '%';
    showSeekBuf(pos, ahead);
    if ($('seekKnob')) $('seekKnob').style.left = (playPct * 100) + '%';
    var clock = fmtPlayClock(pos) + ' / ' + fmtPlayClock(duration);
    if (paused && ahead >= 0.5) clock += ' · +' + Math.round(ahead) + '초';
    if ($('npTime')) $('npTime').textContent = clock;
  }

  function stop(keepBox) {
    cancelSeam();
    streamGen += 1;
    pipeTok += 1;
    pipePending = false;
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
    clearEndTimer();
    endCoastFrom = 0;
    endCoastPos = 0;
    earlyResumeAt = -1;
    earlyResumeLegacy = false;
    pendingEarlyContinue = false;
    forceShortFinish = false;
    updateRepeatButton();
    playing = null;
    clearSilentClock();
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
    measuredVideoBps = 0;
    paintPlayButton();
    if (!keepBox) {
      fsOn = false;
      feedLayerMode = 'flow';
      feedLayerLayout = false;
      if (feedHost) {
        feedHost.className = 'feed-host feed-host-flow';
        feedHost.style.transition = '';
        feedHost.style.transform = '';
        feedHost.style.bottom = '';
      }
      document.body.className = '';
      if ($('playerBox')) $('playerBox').className = 'player-box';
      paintFsButton();
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

  function fmtCount(n) {
    n = parseInt(n, 10);
    if (!isFinite(n) || n < 0) return '';
    if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, '') + '억';
    if (n >= 10000) return Math.round(n / 10000) + '만';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + '천';
    return String(n);
  }

  function paintWatchMeta(info) {
    var el = $('watchMeta');
    if (!el) return;
    if (!info) {
      el.textContent = '';
      return;
    }
    var parts = [];
    var views = tv.fmtViews(info.views);
    if (views) parts.push('조회수 ' + views);
    var ago = tv.fmtAgo(info.uploaded);
    if (ago) parts.push(ago);
    if (info.comments != null && info.comments !== '') {
      var comments = fmtCount(info.comments);
      if (comments !== '') parts.push('댓글 ' + comments);
    }
    el.textContent = parts.join(' · ');
  }

  function showMembersList(seq) {
    if (currentFeed === 'search' || currentFeed === 'subs' || (currentFeed === 'favs' && !watchFromFavs())) return;
    if (watchKeepsSubList()) return;
    if (watchFromFavs() && currentFeed !== 'related' && currentFeed !== 'suggest') {
      showWatchFavs({ keepSeq: true });
      return;
    }
    if (currentFeed === 'related') {
      if (watchChannel && watchChannel.channel_id && watchItem) {
        showRelatedLoading();
        loadRelated(watchItem.id, watchItem.title || '', seq);
        return;
      }
      setChip('related');
      showWatchFilters();
      showSubsRail(false);
      resetPager('related');
      if ($('relH')) $('relH').textContent = '이 채널의 다른 영상';
      if (list) list.innerHTML = '<div class="notice">채널 정보를 찾지 못해 목록을 불러오지 못했습니다</div>';
      return;
    }
    if (watchItem && watchItem.id) {
      showSuggestLoading();
      loadSuggest(watchItem.id, seq);
      return;
    }
    setChip('suggest');
    showWatchFilters();
    showSubsRail(false);
    ensureSuggestSort();
    if ($('relH')) $('relH').textContent = '추천 영상';
    if (list) list.innerHTML = '<div class="notice">추천 영상을 불러오지 못했습니다</div>';
  }

  // The list already knows this video is members-only. Do not ask /api/media/info or open a stream.
  function showMembersWatch(src, hint) {
    hint = hint || {};
    var id = hint.id || videoIdFromSrc(src) || '';
    if (membersShownId && membersShownId === id && watchItem && watchItem.id === id) {
      revealPlayback();
      setStatus('회원전용 영상입니다');
      paintPlayButton();
      return;
    }
    membersShownId = id;
    var playSeq = beginReq();
    hideRepeatAsk();
    hideAutoAsk();
    repeatRunCount = 0;
    repeatHeld = false;
    stop(true);
    playing = src || (id ? ('https://www.youtube.com/watch?v=' + id) : '');
    paused = true;
    ended = false;
    isLive = false;
    duration = 0;
    durationSource = '';
    videoStartWall = 0;
    videoAr = 16 / 9;
    startAt = 0;
    if (stage) {
      stage.width = 640;
      stage.height = 360;
    }
    var bootFs = false;
    if (keepFsOnBoot) {
      keepFsOnBoot = false;
      fsOn = true;
      bootFs = true;
    }
    applyChrome();
    revealPlayback();
    if (bootFs) {
      setTimeout(fitStage, 0);
      setTimeout(fitStage, 80);
    }
    paintPlayButton();
    paintSeekBar();
    var title = hint.title || '회원전용 영상입니다';
    if ($('npTitle')) $('npTitle').textContent = title;
    if ($('watchH')) $('watchH').textContent = title;
    setStatus('회원전용 영상입니다');
    watchItem = {
      id: id,
      title: hint.title || '',
      url: playing,
      thumbnail: hint.thumbnail || (id ? ('https://i.ytimg.com/vi/' + id + '/mqdefault.jpg') : ''),
      duration: hint.duration || 0,
      uploader: hint.name || '',
      views: hint.views || 0,
      channel_id: hint.channel_id || '',
      avatar: '',
      uploaded: hint.uploaded || 0,
      members: true
    };
    watchChannel = {
      channel_id: hint.channel_id || '',
      name: hint.name || '',
      uploader: hint.name || '',
      thumbnail: '',
      avatar: ''
    };
    paintWatchMeta({ views: hint.views || 0, uploaded: hint.uploaded || 0 });
    if ($('chName')) $('chName').textContent = watchChannel.name || '';
    rememberAvatars([watchChannel]);
    paintWatchStar();
    paintSubBtn();
    if (id) {
      historyAdd({
        id: id,
        channel_id: hint.channel_id || '',
        title: hint.title || '',
        url: playing,
        thumbnail: watchItem.thumbnail,
        duration: hint.duration || 0,
        uploader: hint.name || ''
      });
    }
    showMembersList(playSeq);
  }

  function playUrl(src, seek, opts) {
    opts = opts || {};
    var membersKnown = membersHintFor(videoIdFromSrc(src));
    if (membersKnown) {
      pipePending = false;
      showMembersWatch(src, membersKnown);
      return;
    }
    membersShownId = '';
    var useLegacy = !!opts.legacy;
    var sameSrc = playing === src;
    if (!opts.repeat) hideRepeatAsk();
    if (!sameSrc && !opts.repeat) {
      repeatRunCount = 0;
      repeatHeld = false;
    }
    pendingSeekRatio = null;
    if (!opts.recovery) prerollRecoveryCount = 0;
    var playSeq = beginReq();
    var keepPaused = !!opts.keepPaused;
    var skipInfo = !!opts.skipInfo && duration > 0 && durationSource === src && sameWatch(src);
    preservedStageFrame = '';
    var keepEarlyResume = !!opts.keepEarlyResume;
    var savedEarlyAt = earlyResumeAt;
    var savedEarlyLegacy = earlyResumeLegacy;
    if ($('stageLoadingBg')) $('stageLoadingBg').className = 'stage-loading-bg on';
    if ($('loadingCurtain')) $('loadingCurtain').className = 'loading-curtain on';
    wakeAudio();
    stop(true);
    pipePending = true;
    if (keepEarlyResume) {
      earlyResumeAt = savedEarlyAt;
      earlyResumeLegacy = savedEarlyLegacy;
    }
    playing = src;
    startAt = seek || 0;
    lastPlaybackPos = startAt;
    bufEnd = startAt;
    if (durationSource !== src) {
      duration = 0;
      durationSource = '';
      isLive = false;
    }
    paintSeekBar();
    showSeekBuf(startAt, 0);
    if (keepPaused) {
      paused = true;
      pausePos = startAt;
    } else {
      paused = false;
      pausePos = -1;
    }
    paintPlayButton();
    var bootFs = false;
    if (keepFsOnBoot) {
      keepFsOnBoot = false;
      fsOn = true;
      bootFs = true;
    }
    applyChrome();
    if (bootFs) {
      setTimeout(fitStage, 0);
      setTimeout(fitStage, 80);
    }
    syncChromeAfterPlay();
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
        pipePending = false;
        soundResyncing = false;
        setStatus('PIN이 필요합니다');
        tv.ensurePin(function () { if (stillReq(playSeq) || playing === src) playUrl(src, startAt, keepPaused ? { keepPaused: true } : null); });
        return;
      }
      if (!info || !info.ok) {
        pipePending = false;
        if ($('loadingCurtain')) $('loadingCurtain').className = 'loading-curtain';
        soundResyncing = false;
        if (info && /회원\s*전용|회원전용/.test(String(info.error || ''))) {
          var mid = videoIdFromSrc(src);
          var known = membersHintFor(mid) || { id: mid };
          if (info.channel_id) known.channel_id = info.channel_id;
          if (info.channel || info.uploader) known.name = known.name || info.channel || info.uploader;
          if (info.title) known.title = known.title || info.title;
          if (mid) rememberMembersHint(known);
          showMembersWatch(src, membersHintFor(mid) || known);
          return;
        }
        setStatus((info && info.error) || '영상을 열 수 없습니다. 다른 영상을 선택해 보세요.');
        if ($('npTitle')) $('npTitle').textContent = '재생할 수 없음';
        if (watchFromFavs() && currentFeed !== 'search' && currentFeed !== 'subs' && currentFeed !== 'related' && currentFeed !== 'suggest') showWatchFavs({ keepSeq: true });
        return;
      }
      durationSource = src;
      duration = info.duration || 0;
      isLive = !!info.isLive;
      if (pendingSeekRatio != null) {
        if (!isLive && duration > 0) {
          startAt = Math.min(Math.max(0, duration - 2), duration * pendingSeekRatio);
          lastPlaybackPos = startAt;
          bufEnd = startAt;
        }
        pendingSeekRatio = null;
      }
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
      paintWatchMeta(info);
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
        uploaded: info.uploaded || 0,
        comments: info.comments == null ? null : info.comments
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
      var keepOther = currentFeed === 'search' || currentFeed === 'subs' || (currentFeed === 'favs' && !watchFromFavs());
      if (watchFromFavs() && currentFeed !== 'search' && currentFeed !== 'subs' && currentFeed !== 'related' && currentFeed !== 'suggest') {
        showWatchFavs({ keepSeq: true });
      } else if (currentFeed === 'related') {
        showRelatedLoading();
        relatedTimer = setTimeout(function () {
          relatedTimer = null;
          if (!stillReq(playSeq)) return;
          if (currentFeed !== 'related') return;
          loadRelated(info.id, info.title, playSeq);
        }, 400);
      } else if (watchKeepsSubList()) {
        // The subscribed channel list is opened once the rail is ready.
      } else if (!keepOther) {
        showSuggestLoading();
        relatedTimer = setTimeout(function () {
          relatedTimer = null;
          if (!stillReq(playSeq)) return;
          if (currentFeed !== 'suggest') return;
          loadSuggest(info.id, playSeq);
        }, 400);
      }
    });
  }

  function showRelatedLoading() {
    if (!list || !stage) return;
    setChip('related');
    showWatchFilters();
    showSubsRail(false);
    if ($('relH')) $('relH').textContent = ((watchChannel && watchChannel.name) ? watchChannel.name + ' · ' : '') + '다른 영상 불러오는 중...';
    renderSkeleton();
  }

  // Title and channel name stay off this query. Apache rejects titles that contain two parentheses.
  function relatedRequestExtra() {
    var extra = '';
    if (watchChannel && watchChannel.channel_id) extra += '&channel_id=' + encodeURIComponent(watchChannel.channel_id);
    if (watchItem && watchItem.uploaded) extra += '&uploaded=' + encodeURIComponent(String(watchItem.uploaded));
    return extra;
  }

  function loadRelated(id, title, seq) {
    if (!list) return;
    if (seq == null) seq = reqSeq;
    lastChannels = [];
    setChip('related');
    showWatchFilters();
    showSubsRail(false);
    resetPager('related');
    if ($('relH')) $('relH').textContent = ((watchChannel && watchChannel.name) ? watchChannel.name + ' · ' : '') + '다른 영상 불러오는 중...';
    if (list && !list.querySelector('.yt-card')) showRelatedLoading();
    tv.get('/api/youtube/related?id=' + encodeURIComponent(id || '') + relatedRequestExtra() + '&limit=' + RELATED_PAGE, function (code, data) {
      if (!stillReq(seq)) return;
      if (currentFeed !== 'related') return;
      if ($('relH')) $('relH').textContent = (watchChannel && watchChannel.name) ? (watchChannel.name + '의 다른 영상') : '이 채널의 다른 영상';
      if (data && data.ok) {
        libRaw = (data.items || []).slice();
        pager.offset = libRaw.length;
        pager.more = true;
        applyLibView('채널 영상이 없습니다');
      } else {
        libRaw = [];
        applyLibView('채널 영상을 불러오지 못했습니다');
      }
    });
  }

  function showSuggestLoading() {
    if (!list || !stage) return;
    setChip('suggest');
    showWatchFilters();
    showSubsRail(false);
    ensureSuggestSort();
    if ($('relH')) $('relH').textContent = '추천 영상 불러오는 중...';
    if (!list.querySelector('.yt-card')) renderSkeleton();
  }

  function loadSuggest(id, seq) {
    if (!list) return;
    if (seq == null) seq = reqSeq;
    lastChannels = [];
    setChip('suggest');
    showWatchFilters();
    showSubsRail(false);
    ensureSuggestSort();
    resetPager('suggest');
    if ($('relH')) $('relH').textContent = '추천 영상 불러오는 중...';
    if (list && !list.querySelector('.yt-card')) showSuggestLoading();
    var vid = id || (watchItem && watchItem.id) || '';
    tv.get('/api/youtube/suggest?id=' + encodeURIComponent(vid) + '&limit=' + RELATED_PAGE, function (code, data) {
      if (!stillReq(seq)) return;
      if (currentFeed !== 'suggest') return;
      if ($('relH')) $('relH').textContent = '추천 영상';
      if (data && data.ok) {
        libRaw = (data.items || []).slice();
        pager.offset = libRaw.length;
        pager.more = !!(data.more && libRaw.length);
        applyLibView('추천 영상이 없습니다');
      } else {
        libRaw = [];
        pager.more = false;
        paintMoreBar();
        applyLibView('추천 영상을 불러오지 못했습니다');
      }
    });
  }

  function wsUrlFor(src, start, refresh, legacy, requestedQuality, parallel) {
    var streamQuality = parseInt(requestedQuality, 10) || quality;
    return tv.ws('/ws/mpeg1?url=' + encodeURIComponent(src) + '&quality=' + streamQuality + '&fps=' + fps + '&vbr=' + (vbrLow ? 'low' : 'norm') + '&vscale=' + adaptiveVideoScale.toFixed(2) + '&format=' + encodeURIComponent(streamFormat) + '&start=' + encodeURIComponent(String(start || 0)) + (refresh ? '&refresh=1' : '') + (legacy ? '&legacy=1' : '') + (parallel ? '&parallel=1' : ''));
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
      watchAudioContext(ctx);
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
    releaseSilentAudio();
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
    pipePending = false;
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
    launchPlayer(wsUrlFor(src, startAt, legacy, legacy)); //refresh=1 비활성화
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
        if (repeatAskOpen) {
          paintSeekBar();
          return;
        }
        if (repeatHeld) {
          setStatus('일시정지');
          paintSeekBar();
          return;
        }
        if (repeatAt > Date.now()) {
          setStatus(Math.ceil((repeatAt - Date.now()) / 1000) + '초 뒤에 ' + (endMode === 'next' ? '다음 영상을 재생합니다' : '다시 재생합니다'));
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
        if (!isLive) paintSeekBar();
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

  function rampAudioOutput(out, now, restore) {
    if (!out || !out.gain || !out.gain.gain) return now;
    var param = out.gain.gain;
    var level = Number(param.value);
    if (!isFinite(level)) level = 1;
    var end = now + AUDIO_CUT_FADE_SEC;
    try {
      param.cancelScheduledValues(now);
      param.setValueAtTime(level, now);
      param.linearRampToValueAtTime(0, end);
      if (restore) {
        var target = Number(out.volume);
        if (!isFinite(target)) target = level;
        param.setValueAtTime(0, end);
        param.linearRampToValueAtTime(target, end + AUDIO_CUT_FADE_SEC);
      }
    } catch (e) {}
    return end;
  }

  function patchAudioClicks() {
    var WA = window.JSMpeg && JSMpeg.AudioOutput && JSMpeg.AudioOutput.WebAudio;
    if (!WA || WA.prototype.__noclick) return;
    WA.prototype.__noclick = true;
    WA.prototype.destroy = function () {
      var ctx = this.context;
      var now = ctx ? ctx.currentTime : 0;
      var stopAt = rampAudioOutput(this, now, false);
      var sources = (this._srcs || []).slice();
      this._srcs = [];
      for (var i = 0; i < sources.length; i++) {
        try { sources[i].onended = null; } catch (e0) {}
        try { if (sources[i].stop) sources[i].stop(stopAt); } catch (e1) {}
      }
      this.startTime = 0;
      this.mediaOrigin = null;
      setTimeout(function () {
        for (var j = 0; j < sources.length; j++) {
          try { sources[j].disconnect(); } catch (e2) {}
        }
        try { if (this.gain) this.gain.disconnect(); } catch (e3) {}
        if (ctx) ctx._connections = Math.max(0, (ctx._connections || 1) - 1);
      }.bind(this), AUDIO_CUT_FADE_SEC * 2000);
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
      if (this._capture) {
        var capDur = left.length / rate;
        this._capture.push({
          rate: rate,
          left: left.slice ? left.slice() : new Float32Array(left),
          right: right.slice ? right.slice() : new Float32Array(right),
          mediaAt: audioMediaCursor
        });
        audioMediaCursor += capDur;
        return;
      }
      // Keep the PCM. Dropping it advances the decoder without anything to
      // play, so the next sound after resume belongs to a later frame.
      if (armingSeam || this._seamHold) {
        if (!this._pending) this._pending = [];
        this._pending.push({
          rate: rate,
          left: left.slice ? left.slice() : new Float32Array(left),
          right: right.slice ? right.slice() : new Float32Array(right)
        });
        return;
      }
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
      // start() throws while the context is suspended and must not move the
      // speaker clock. Keep the PCM until the context is actually running.
      if (this.context && this.context.state !== 'running') {
        if (!this._pending) this._pending = [];
        var heldLeft = left.slice ? left.slice() : new Float32Array(left);
        var heldRight = right.slice ? right.slice() : new Float32Array(right);
        this._pending.push({ rate: rate, left: heldLeft, right: heldRight });
        audioMediaCursor += heldLeft.length / rate;
        watchAudioContext(this.context);
        return;
      }
      this.unlocked = true;
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

  function watchAudioContext(ctx) {
    if (!ctx || ctx.__tvState) return;
    try {
      ctx.__tvState = true;
      ctx.addEventListener('statechange', function () {
        if (ctx.state === 'running') releaseSilentAudio();
      });
    } catch (e) {}
  }

  function holdSilentAudio(out) {
    if (!out || !(silentClockFrom > 0) || paused || prerolling || audioContextRunning(out)) return;
    var heard = silentHeard();
    if (!(heard > 0.2)) return;
    var pend = out._pending || [];
    var dur = pendingAudioSec(out);
    if (!pend.length || !(dur > 0)) return;
    var behind = heard - (audioMediaCursor - dur);
    var drop = behind - 0.12;
    if (drop > 0.05) trimPendingAudio(pend, drop);
  }

  function releaseSilentAudio() {
    if (releasingSilent) return;
    if (!(silentClockFrom > 0) || paused || prerolling || !player || !player.audioOut) return;
    var out = player.audioOut;
    var ctx = out.context;
    if (!ctx || ctx.state !== 'running') return;
    var vt = 0;
    try {
      if (player.video && isFinite(player.video.currentTime)) vt = Math.max(0, player.video.currentTime);
    } catch (eVt) { vt = 0; }
    var heard = silentHeard();
    var align = vt > 0.02 ? vt : heard;
    var pend = out._pending || [];
    var dur = 0;
    var i;
    for (i = 0; i < pend.length; i++) {
      if (pend[i] && pend[i].left && pend[i].rate) dur += pend[i].left.length / pend[i].rate;
    }
    var drop = align - (audioMediaCursor - dur);
    if (drop > 0.02) trimPendingAudio(pend, drop);
    out._pending = [];
    audioMediaCursor = align > 0 ? align : Math.max(0, audioMediaCursor - dur);
    clearSilentClock();
    releasingSilent = true;
    try {
      var soon = ctx.currentTime + 0.035;
      if (!(out.startTime > soon)) out.startTime = soon;
      for (i = 0; i < pend.length; i++) out.play(pend[i].rate, pend[i].left, pend[i].right);
      videoCatching = true;
      debugPlayback('silent-clock-release', {
        align: align,
        pending: pend.length,
        videoTime: vt
      });
    } catch (eRel) {}
    releasingSilent = false;
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
    if (!fromRebuffer) {
      adaptiveWarmupUntil = Date.now() + AUTO_VIDEO_USER_IGNORE_MS;
      adaptivePressureSince = 0;
      adaptivePressureSampleAt = 0;
      adaptiveEmergencyWaitLogged = false;
    }
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
    if (!fromRebuffer && startAt > 0 && pend.length) {
      fadeHead(pend[0].left, pend[0].right);
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
    if (!audioContextRunning(out)) {
      var coastBase = 0;
      if (player && player.video && isFinite(player.video.currentTime)) coastBase = Math.max(0, player.video.currentTime);
      armSilentClock(coastBase);
    }
    debugPlayback('playback-start', {
      start: startAt,
      videoTime: player && player.video ? player.video.currentTime : 0,
      queuedAudio: queuedAudio(),
      audioQueueTargetSec: AUDIO_QUEUE_SEC,
      audioAhead: audioAheadSec(),
      videoAhead: videoAheadSec(),
      prerollMs: prerollAt ? Date.now() - prerollAt : 0,
      quality: quality,
      bitrateMode: vbrLow ? 'low' : 'normal'
    });
    if (adaptiveManualRestart) {
      adaptiveManualRestart = false;
      adaptiveIgnoreUntil = Date.now() + AUTO_VIDEO_USER_IGNORE_MS;
    }
    if (pendingWatchSourceOpen) {
      pendingWatchSourceOpen = false;
      setTimeout(openWatchSourceChannel, 0);
    }
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
    if (recordAdaptiveRebuffer()) return;
    prerolling = true;
    rebuffering = true;
    rebufferVideoDecodeAt = 0;
    prerollAt = Date.now();
    sendStreamCtrl(false);
    setStatus('불러오는 중');
  }

  function noteManualPlaybackAction() {
    adaptiveRebufferTimes = [];
    adaptiveStableSince = 0;
    adaptiveRestoreAttemptAt = 0;
    adaptivePressureSince = 0;
    adaptivePressureSampleAt = 0;
    adaptiveEmergencyWaitLogged = false;
    adaptiveWarmupUntil = Date.now() + AUTO_VIDEO_USER_IGNORE_MS;
    autoQualityUpSince = 0;
    autoQualityDownSince = 0;
    autoQualityDownStartBuffer = 0;
    adaptiveIgnoreUntil = Date.now() + AUTO_VIDEO_USER_IGNORE_MS;
  }

  function markManualPlaybackRestart(resetRate) {
    noteManualPlaybackAction();
    if (resetRate) {
      adaptiveVideoScale = 1;
      adaptiveLastScaleChangeAt = 0;
    }
    adaptiveIgnoreUntil = 0;
    adaptiveManualRestart = true;
  }

  function recordAdaptiveRebuffer() {
    var now = Date.now();
    if (adaptiveManualRestart || now < adaptiveIgnoreUntil || now < adaptiveWarmupUntil) {
      debugPlayback('adaptive-bitrate-rebuffer-ignored', {
        until: Math.max(adaptiveIgnoreUntil, adaptiveWarmupUntil),
        manualRestart: adaptiveManualRestart
      });
      return false;
    }
    adaptiveLastRebufferAt = now;
    adaptiveStableSince = 0;
    adaptiveRebufferTimes = adaptiveRebufferTimes.filter(function (at) {
      return now - at <= AUTO_REBUFFER_WINDOW_MS;
    });
    adaptiveRebufferTimes.push(now);
    debugPlayback('adaptive-bitrate-rebuffer', {
      count: adaptiveRebufferTimes.length,
      windowMs: AUTO_REBUFFER_WINDOW_MS,
      scale: adaptiveVideoScale
    });
    if (adaptiveRebufferTimes.length < AUTO_REBUFFER_TRIGGER_COUNT) return false;
    adaptiveRebufferTimes = [];
    if (autoQuality && autoQualityLoaded && quality === 480) {
      var resumePosition = currentPos();
      quality = 360;
      adaptiveVideoScale = Math.min(adaptiveVideoScale, AUTO_VIDEO_SCALE_STEPS[1]);
      adaptiveLastScaleChangeAt = now;
      adaptivePressureSince = 0;
      adaptivePressureSampleAt = 0;
      autoQualityLastSwitchAt = now;
      autoQualityDownSince = 0;
      autoQualityDownStartBuffer = 0;
      paintQualityButtons();
      debugPlayback('auto-quality-rebuffer-fallback', {
        from: 480,
        to: 360,
        position: resumePosition
      });
      playUrl(playing, resumePosition, { skipInfo: true, recovery: true });
      return true;
    }
    var scaleIndex = AUTO_VIDEO_SCALE_STEPS.indexOf(adaptiveVideoScale);
    if (scaleIndex < 0) scaleIndex = 0;
    if (scaleIndex >= AUTO_VIDEO_SCALE_STEPS.length - 1) {
      debugPlayback('adaptive-video-floor', { scale: adaptiveVideoScale });
      return false;
    }
    var previousScale = adaptiveVideoScale;
    adaptiveVideoScale = AUTO_VIDEO_SCALE_STEPS[scaleIndex + 1];
    adaptiveLastScaleChangeAt = now;
    adaptivePressureSince = 0;
    adaptivePressureSampleAt = 0;
    debugPlayback('adaptive-video-downshift', {
      quality: quality,
      fromScale: previousScale,
      toScale: adaptiveVideoScale,
      position: currentPos()
    });
    playUrl(playing, currentPos(), { skipInfo: true, recovery: true });
    return true;
  }

  function maybeDownshiftAdaptiveVideoScale() {
    var now = Date.now();
    if (isLive || !playing || paused || ended || nearEnd() || prerolling || rebuffering || recoveringStream || seamPlayer
      || now < adaptiveWarmupUntil || now < adaptiveIgnoreUntil || (seekSettleUntil && now < seekSettleUntil)) {
      adaptivePressureSince = 0;
      adaptivePressureSampleAt = 0;
      adaptiveEmergencyWaitLogged = false;
      return;
    }
    var ahead = packedAhead();
    var audioAhead = audioAheadSec();
    var critical = ahead <= AUTO_VIDEO_PRESSURE_CRITICAL_SEC;
    if (!critical && now - adaptiveLastScaleChangeAt < AUTO_VIDEO_DOWNSHIFT_COOLDOWN_MS) return;
    if (!adaptivePressureSampleAt) {
      adaptivePressureSampleAt = now;
      adaptivePressureSampleBuffer = ahead;
      adaptivePressureSampleAudioBuffer = audioAhead;
      adaptiveEmergencyWaitLogged = false;
      return;
    }
    var elapsed = now - adaptivePressureSampleAt;
    if (elapsed < AUTO_VIDEO_PRESSURE_SAMPLE_MS) return;
    var drainRate = (adaptivePressureSampleBuffer - ahead) * 1000 / elapsed;
    var audioDrainRate = (adaptivePressureSampleAudioBuffer - audioAhead) * 1000 / elapsed;
    adaptivePressureSampleAt = now;
    adaptivePressureSampleBuffer = ahead;
    adaptivePressureSampleAudioBuffer = audioAhead;
    var pressure = critical || (ahead <= AUTO_VIDEO_PRESSURE_EARLY_SEC && drainRate >= AUTO_VIDEO_PRESSURE_TREND_SEC_PER_SEC);
    if (!pressure) {
      adaptivePressureSince = 0;
      adaptiveEmergencyWaitLogged = false;
      return;
    }
    if (!adaptivePressureSince) adaptivePressureSince = now;
    var holdMs = critical ? AUTO_VIDEO_PRESSURE_CRITICAL_HOLD_MS : AUTO_VIDEO_PRESSURE_HOLD_MS;
    if (now - adaptivePressureSince < holdMs) return;
    var audioReserve = audioAheadSec();
    var scaleIndex = AUTO_VIDEO_SCALE_STEPS.indexOf(adaptiveVideoScale);
    if (scaleIndex < 0) scaleIndex = 0;
    if (scaleIndex >= AUTO_VIDEO_SCALE_STEPS.length - 1) {
      adaptivePressureSince = 0;
      return;
    }
    var previousScale = adaptiveVideoScale;
    if (critical && audioReserve < 3) {
      var timeToAudioEmpty = audioDrainRate > 0 ? audioReserve / audioDrainRate : Infinity;
      var audioAtRisk = audioReserve <= AUTO_VIDEO_PRESSURE_EMERGENCY_AUDIO_SEC
        || timeToAudioEmpty <= AUTO_VIDEO_PRESSURE_EMERGENCY_TIME_TO_EMPTY_SEC;
      if (!audioAtRisk) {
        if (!adaptiveEmergencyWaitLogged) {
          adaptiveEmergencyWaitLogged = true;
          debugPlayback('adaptive-bitrate-emergency-waiting', {
            quality: quality,
            scale: adaptiveVideoScale,
            packedBufferSec: ahead,
            audioBufferSec: audioReserve,
            audioDrainRate: Math.round(audioDrainRate * 10) / 10,
            estimatedAudioTimeToEmptySec: isFinite(timeToAudioEmpty) ? Math.round(timeToAudioEmpty * 10) / 10 : null,
            emergencyThresholdSec: AUTO_VIDEO_PRESSURE_EMERGENCY_AUDIO_SEC
          });
        }
        return;
      }
      adaptiveVideoScale = AUTO_VIDEO_SCALE_STEPS[AUTO_VIDEO_SCALE_STEPS.length - 1];
      adaptiveLastScaleChangeAt = now;
      adaptivePressureSince = 0;
      adaptivePressureSampleAt = 0;
      adaptiveEmergencyWaitLogged = false;
      adaptiveStableSince = 0;
      adaptiveRebufferTimes = [];
      var resumePosition = currentPos();
      debugPlayback('adaptive-bitrate-emergency-restart', {
        quality: quality,
        fromScale: previousScale,
        toScale: adaptiveVideoScale,
        packedBufferSec: ahead,
        audioBufferSec: audioReserve,
        audioDrainRate: Math.round(audioDrainRate * 10) / 10,
        estimatedAudioTimeToEmptySec: isFinite(timeToAudioEmpty) ? Math.round(timeToAudioEmpty * 10) / 10 : null,
        position: resumePosition
      });
      playUrl(playing, resumePosition, { skipInfo: true, recovery: true });
      return;
    }
    adaptiveVideoScale = AUTO_VIDEO_SCALE_STEPS[scaleIndex + 1];
    if (!beginSeamlessReconnect(false, quality, false, 3, 'adaptive-bitrate-downshift')) {
      adaptiveVideoScale = previousScale;
      adaptivePressureSince = 0;
      return;
    }
    adaptiveLastScaleChangeAt = now;
    adaptivePressureSince = 0;
    adaptivePressureSampleAt = 0;
    adaptiveEmergencyWaitLogged = false;
    adaptiveStableSince = 0;
    adaptiveRebufferTimes = [];
    debugPlayback('adaptive-bitrate-downshift-request', {
      quality: quality,
      fromScale: previousScale,
      toScale: adaptiveVideoScale,
      packedBufferSec: ahead,
      audioBufferSec: audioAheadSec(),
      drainRate: Math.round(drainRate * 10) / 10
    });
  }

  function maybeRestoreAdaptiveVideoScale() {
    if (adaptiveVideoScale >= 1 || !playing || paused || ended || isLive || prerolling || rebuffering || recoveringStream || seamPlayer) {
      adaptiveStableSince = 0;
      return;
    }
    var now = Date.now();
    if (now < adaptiveIgnoreUntil || now < adaptiveWarmupUntil || nearEnd()) {
      adaptiveStableSince = 0;
      return;
    }
    var restoreBufferSec = Math.max(AUTO_VIDEO_RESTORE_BUFFER_SEC, Math.min(15, bufTarget * 0.6));
    if (packedAhead() < restoreBufferSec) {
      adaptiveStableSince = 0;
      return;
    }
    if (!adaptiveStableSince) adaptiveStableSince = now;
    if (now - adaptiveLastRebufferAt < AUTO_VIDEO_RESTORE_QUIET_MS
      || now - adaptiveStableSince < AUTO_VIDEO_RESTORE_STABLE_MS
      || now - adaptiveRestoreAttemptAt < 5000) return;
    adaptiveRestoreAttemptAt = now;
    var scaleIndex = AUTO_VIDEO_SCALE_STEPS.indexOf(adaptiveVideoScale);
    if (scaleIndex <= 0) return;
    var previousScale = adaptiveVideoScale;
    adaptiveVideoScale = AUTO_VIDEO_SCALE_STEPS[scaleIndex - 1];
    if (!beginSeamlessReconnect(false, null, false, null, 'adaptive-bitrate-restore')) {
      adaptiveVideoScale = previousScale;
      return;
    }
    adaptiveLastScaleChangeAt = now;
    adaptiveStableSince = 0;
    adaptiveRebufferTimes = [];
    debugPlayback('adaptive-video-upshift', {
      quality: quality,
      fromScale: previousScale,
      toScale: adaptiveVideoScale,
      bufferSec: packedAhead()
    });
  }

  function maybeAutoQualitySwitch() {
    var now = Date.now();
    // Do not start a quality transition if its splice would land in the title tail.
    var candidateStartAt = currentPos() + audioAheadSec();
    if (nearEnd() || (!isLive && duration > 0 && candidateStartAt > duration - 1.5)) {
      autoQualityUpSince = 0;
      autoQualityDownSince = 0;
      autoQualityDownStartBuffer = 0;
      return;
    }
    var reason = '';
    if (!autoQuality) reason = 'disabled';
    else if (!autoQualityLoaded) reason = 'preference-not-loaded';
    else if (!playing) reason = 'no-video';
    else if (paused) reason = 'paused';
    else if (ended) reason = 'ended';
    else if (isLive) reason = 'live-stream';
    else if (prerolling) reason = 'initial-buffering';
    else if (rebuffering) reason = 'rebuffering';
    else if (recoveringStream) reason = 'stream-recovery';
    else if (seamPlayer) reason = 'quality-candidate-running';
    else if (quality >= 720) reason = 'manual-quality-720-or-higher';
    else if (now < adaptiveIgnoreUntil) reason = 'manual-action-cooldown';
    else if (now < autoQualityCooldownUntil) reason = 'candidate-failure-cooldown';
    else if (nearEnd()) reason = 'near-video-end';
    if (reason) {
      autoQualityUpSince = 0;
      autoQualityDownSince = 0;
      autoQualityDownStartBuffer = 0;
      debugAutoQuality('auto-quality-idle', { reason: reason, quality: quality }, 5000);
      return;
    }
    var ahead = packedAhead();
    debugAutoQuality('auto-quality-monitor', {
      quality: quality,
      bufferSec: Math.round(ahead * 10) / 10,
      direction: quality <= 360 ? 'waiting-to-upshift' : 'waiting-to-downshift',
      adaptiveVideoScale: adaptiveVideoScale,
      upStableMs: autoQualityUpSince ? now - autoQualityUpSince : 0,
      downTrendMs: autoQualityDownSince ? now - autoQualityDownSince : 0,
      downBufferDropSec: autoQualityDownSince ? Math.round((autoQualityDownStartBuffer - ahead) * 10) / 10 : 0,
      lastRebufferAgoMs: adaptiveLastRebufferAt ? now - adaptiveLastRebufferAt : null,
      lastSwitchAgoMs: autoQualityLastSwitchAt ? now - autoQualityLastSwitchAt : null,
      upBufferThresholdSec: AUTO_QUALITY_UP_BUFFER_SEC,
      downBufferThresholdSec: AUTO_QUALITY_DOWN_BUFFER_SEC,
      emergencyBufferThresholdSec: AUTO_QUALITY_DOWN_EMERGENCY_SEC
    }, 5000);
    if (quality <= 360) {
      autoQualityDownSince = 0;
      autoQualityDownStartBuffer = 0;
      if (adaptiveVideoScale < 1) {
        autoQualityUpSince = 0;
        debugAutoQuality('auto-quality-upshift-deferred-for-bitrate-recovery', {
          quality: quality,
          adaptiveVideoScale: adaptiveVideoScale,
          bufferSec: Math.round(ahead * 10) / 10
        }, 5000);
        return;
      }
      var expectedFrameIntervalMs = 1000 / (fps || 24);
      var frameCadenceStable = lastFrameInterval > 0 && lastFrameInterval <= expectedFrameIntervalMs * 1.5;
      if (!frameCadenceStable) {
        autoQualityUpSince = 0;
        debugAutoQuality('auto-quality-upshift-deferred-frame-instability', {
          quality: quality,
          frameIntervalMs: lastFrameInterval,
          maxFrameIntervalMs: Math.round(expectedFrameIntervalMs * 1.5),
          bufferSec: Math.round(ahead * 10) / 10
        }, 5000);
        return;
      }
      if (ahead < AUTO_QUALITY_UP_BUFFER_SEC
        || now - adaptiveLastRebufferAt < AUTO_QUALITY_RECOVERY_QUIET_MS
        || now - autoQualityLastSwitchAt < AUTO_QUALITY_RECOVERY_QUIET_MS) {
        autoQualityUpSince = 0;
        return;
      }
      if (!autoQualityUpSince) autoQualityUpSince = now;
      if (now - autoQualityUpSince < AUTO_QUALITY_UP_STABLE_MS) return;
      if (beginSeamlessReconnect(false, 480, true, null, 'auto-quality-upshift')) {
        autoQualityUpSince = 0;
        debugPlayback('auto-quality-upshift-request', { from: 360, to: 480, bufferSec: ahead });
      }
      return;
    }
    autoQualityUpSince = 0;
    if (ahead <= AUTO_QUALITY_DOWN_EMERGENCY_SEC) {
      autoQualityDownSince = now - AUTO_QUALITY_DOWN_TREND_SEC;
      autoQualityDownStartBuffer = ahead + AUTO_QUALITY_HYSTERESIS_SEC;
    } else if (ahead <= AUTO_QUALITY_DOWN_BUFFER_SEC) {
      if (!autoQualityDownSince) {
        autoQualityDownSince = now;
        autoQualityDownStartBuffer = ahead;
      }
    } else {
      autoQualityDownSince = 0;
      autoQualityDownStartBuffer = 0;
      return;
    }
    if (now - autoQualityDownSince < AUTO_QUALITY_DOWN_TREND_SEC
      || autoQualityDownStartBuffer - ahead < 1) return;
    if (adaptiveVideoScale > AUTO_VIDEO_SCALE_STEPS[AUTO_VIDEO_SCALE_STEPS.length - 1]) {
      debugAutoQuality('auto-quality-downshift-deferred-for-bitrate-recovery', {
        quality: quality,
        adaptiveVideoScale: adaptiveVideoScale,
        bufferSec: Math.round(ahead * 10) / 10
      }, 5000);
      return;
    }
    var resumePosition = currentPos();
    var candidateAudioAhead = audioAheadSec();
    quality = 360;
    paintQualityButtons();
    autoQualityLastSwitchAt = now;
    autoQualityDownSince = 0;
    autoQualityDownStartBuffer = 0;
    adaptiveLastScaleChangeAt = now;
    adaptivePressureSince = 0;
    adaptivePressureSampleAt = 0;
    adaptiveRebufferTimes = [];
    debugPlayback('auto-quality-downshift-restart', {
      from: 480,
      to: 360,
      position: resumePosition,
      packedBufferSec: ahead,
      audioBufferSec: candidateAudioAhead,
      adaptiveVideoScale: adaptiveVideoScale
    });
    playUrl(playing, resumePosition, { skipInfo: true, recovery: true });
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
      if (this._seam || (armingSeam && this !== player)) {
        this._seam = true;
        pumpSeam(this);
        return;
      }
      applyStreamHold();
      if (ended) return;
      if (streamEnded && titleStillAhead()) {
        if (continueUnfinishedTitle()) return;
        if (audioPendingSec() < 0.25) forceShortFinish = true;
      }
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
      if (!paused && stalledMs > 4000 && socketQuiet && !recentResume && !naturalEnd) {
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
        var fallbackWait = rebuffering ? 8000 : 6000;
        var ready = (readyA >= need && readyV) || (waited > fallbackWait && readyV && readyA >= 1);
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
      if (this === player) releaseSilentAudio();
      if (!paused && this.audio && this.audioOut && this.audioOut.enabled) {
        if (this === player) holdSilentAudio(this.audioOut);
        var queued = queuedAudio(this);
        if (this === player && !audioContextRunning(this.audioOut)) queued += pendingAudioSec(this.audioOut);
        var queueTarget = resumePending ? 0.15 : AUDIO_QUEUE_SEC;
        var n2 = 0;
        while (queued < queueTarget && n2 < 24) {
          n2++;
          if (!this.audio.decode()) break;
          queued = queuedAudio(this);
          if (this === player && !audioContextRunning(this.audioOut)) queued += pendingAudioSec(this.audioOut);
        }
      }
      if (this.video && (!isFinite(this.video.currentTime) || this.video.currentTime <= 0.001)) {
        primeVideoDecodeIfNeeded(this);
      }
      if (!this.video) return;
      skipVideoToSound(this);
      applyStreamHold();
      if (this === player) maybeDownshiftAdaptiveVideoScale();
      if (this === player) maybeRestoreAdaptiveVideoScale();
      if (this === player) maybeAutoQualitySwitch();
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
    clearSilentClock();
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
    adaptivePressureSince = 0;
    adaptivePressureSampleAt = 0;
    if (prerollTimer) clearTimeout(prerollTimer);
    var waitMs = 25000;
    if (startAt > 2) waitMs += Math.min(120000, Math.floor(startAt) * 500);
    prerollTimer = setTimeout(function () {
      prerollTimer = null;
      if (netBytes > 8000) return;
      failPreroll();
    }, waitMs);
    rebuffering = false;
    ended = false;
    streamEnded = false;
    forceShortFinish = false;
    if (!paused) lastPlaybackPos = startAt;
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
        preserveDrawingBuffer: true,
        disableWebAudio: false,
        onSourceCompleted: function () {
          if (isLive || nearEnd() || streamEnded) markStreamEnded();
        },
        onVideoDecode: function () { noteVideoFrame(); }
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

  function noteVideoFrame() {
    if (player && player.video) syncVideoAspect(player.video.width, player.video.height);
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
      if (overlayOpen()) armChromeTimer();
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

  function pumpSeam(pl) {
    if (!pl) return;
    if (seamPlayer && pl !== seamPlayer) return;
    var out = pl.audioOut;
    var pending = pendingAudioSec(out);
    var n = 0;
    while (out && pl.audio && pending < 2.5 && n < 6) {
      if (!pl.audio.decode()) break;
      pending = pendingAudioSec(out);
      n++;
    }
    if (!seamHasFrame && pl.video && pl.video.decode && pl.video.decode()) seamHasFrame = true;
    var ready = !!(seamHasFrame && pending >= SEAM_JOIN_AUDIO_READY_SEC);
    if (ready && !seamReady) {
      debugPlayback('seamless-candidate-ready', {
        trigger: seamTriggerReason || 'unspecified',
        targetQuality: seamQuality,
        queuedAudioSec: pending,
        spliceAt: seamSpliceAt,
        waitMs: seamStarted ? Date.now() - seamStarted : 0,
        currentFrameIntervalMs: lastFrameInterval,
        currentFrameAgeMs: lastVideoDecodeAt ? Date.now() - lastVideoDecodeAt : null
      });
      if (seamAutoQuality) {
        debugPlayback('auto-quality-candidate-ready', {
          targetQuality: seamQuality,
          queuedAudioSec: pending,
          spliceAt: seamSpliceAt
        });
      }
    }
    seamReady = ready;
  }

  function cancelSeam(reason) {
    var hadCandidate = !!seamPlayer;
    var cancelledAutoQuality = seamAutoQuality;
    var cancelledQuality = seamQuality;
    if (hadCandidate) {
      debugPlayback('seamless-candidate-cancelled', {
        trigger: seamTriggerReason || 'unspecified',
        targetQuality: cancelledQuality || quality,
        reason: reason || 'cancelled',
        waitMs: seamStarted ? Date.now() - seamStarted : 0,
        ready: seamReady,
        audioBufferSec: audioAheadSec()
      });
    }
    if (cancelledAutoQuality) {
      debugPlayback('auto-quality-candidate-cancelled', {
        targetQuality: cancelledQuality,
        reason: reason || 'cancelled'
      });
    }
    if (seamTimer) { clearInterval(seamTimer); seamTimer = null; }
    var extra = seamPlayer;
    seamPlayer = null;
    seamReady = false;
    seamHasFrame = false;
    seamSpliceAt = 0;
    seamQuality = 0;
    seamAutoQuality = false;
    seamAutoDeadline = 0;
    seamStarted = 0;
    seamTriggerReason = '';
    seamLegacy = false;
    recoveringStream = false;
    if (extra) {
      try { extra._seam = false; } catch (e0) {}
      try { if (extra.audioOut) extra.audioOut._seamHold = false; } catch (e1) {}
      try { extra.destroy(); } catch (e2) {}
    }
    if (seamCanvas && seamCanvas.parentNode) {
      try { seamCanvas.parentNode.removeChild(seamCanvas); } catch (e3) {}
    }
    seamCanvas = null;
    if (player && !paused) applyStreamHold();
  }

  function showSeamCanvas(canvas) {
    if (!canvas || !stage || !stage.parentNode) return;
    canvas.id = 'stage';
    canvas.className = stage.className;
    canvas.style.cssText = stage.style.cssText;
    stage.parentNode.insertBefore(canvas, stage);
    stage.id = 'stage-old';
    stage.style.display = 'none';
    stage.parentNode.removeChild(stage);
    stage = canvas;
  }

  function stopLiveSources(out) {
    if (!out || !out._srcs) return;
    while (out._srcs.length) {
      var src = out._srcs.shift();
      try { src.onended = null; } catch (e0) {}
      try { if (src.stop) src.stop(0); } catch (e1) {}
      try { src.disconnect(); } catch (e2) {}
    }
  }

  function commitSeam() {
    if (!seamPlayer || !player || player === seamPlayer) return;
    var next = seamPlayer;
    var canvas = seamCanvas;
    var at = seamSpliceAt;
    var previousQuality = quality;
    var nextQuality = seamQuality || quality;
    var autoQualitySwitch = seamAutoQuality;
    var triggerReason = seamTriggerReason || 'unspecified';
    var previousPosition = currentPos();
    var previousVideoTime = player.video && isFinite(player.video.currentTime) ? player.video.currentTime : -1;
    var previousAudioTime = playingSoundTime({ fallback: false });
    var previousAudioBufferSec = audioAheadSec();
    var previousVideoBufferSec = videoAheadSec();
    var previousPackedBufferSec = packedAhead();
    var previousFrameIntervalMs = lastFrameInterval;
    var previousFrameAgeMs = lastVideoDecodeAt ? Date.now() - lastVideoDecodeAt : null;
    var candidateVideoTime = next.video && isFinite(next.video.currentTime) ? next.video.currentTime : -1;
    var candidateAudioBufferSec = pendingAudioSec(next.audioOut);
    var transitionWaitMs = seamStarted ? Date.now() - seamStarted : 0;
    debugPlayback('seamless-prejoin-state', {
      trigger: triggerReason,
      fromQuality: previousQuality,
      toQuality: nextQuality,
      spliceAt: at,
      transitionWaitMs: transitionWaitMs,
      currentPosition: previousPosition,
      currentVideoTime: previousVideoTime,
      currentAudioTime: previousAudioTime,
      currentDriftSec: previousVideoTime >= 0 && previousAudioTime > 0 ? previousVideoTime - previousAudioTime : null,
      audioBufferSec: previousAudioBufferSec,
      videoBufferSec: previousVideoBufferSec,
      packedBufferSec: previousPackedBufferSec,
      frameIntervalMs: previousFrameIntervalMs,
      frameAgeMs: previousFrameAgeMs,
      candidateVideoTime: candidateVideoTime,
      candidateAudioBufferSec: candidateAudioBufferSec,
      candidateReady: seamReady
    });
    if (seamTimer) { clearInterval(seamTimer); seamTimer = null; }
    seamPlayer = null;
    seamCanvas = null;
    seamReady = false;
    seamHasFrame = false;
    seamSpliceAt = 0;
    seamQuality = 0;
    seamAutoQuality = false;
    seamAutoDeadline = 0;
    seamStarted = 0;
    seamTriggerReason = '';
    seamLegacy = false;
    recoveringStream = false;
    next._seam = false;
    if (next.audioOut) {
      next.audioOut._seamHold = false;
      next.audioOut.enabled = true;
      next.audioOut.unlocked = true;
    }
    stopLiveSources(player.audioOut);
    var old = player;
    player = next;
    streamHeld = false;
    quality = nextQuality;
    if (autoQualitySwitch) autoQualityLastSwitchAt = Date.now();
    if (autoQualitySwitch) {
      debugPlayback('auto-quality-switch-applied', {
        from: previousQuality,
        to: nextQuality,
        position: at
      });
    }
    paintQualityButtons();
    startAt = at;
    lastPlaybackPos = at;
    bufEnd = at;
    audioMediaCursor = 0;
    lastHeard = 0;
    pauseHeard = 0;
    resumeHeard = 0;
    resumePending = false;
    if (next.audioOut) {
      next.audioOut.startTime = 0;
      next.audioOut._schedEndCtx = 0;
      next.audioOut._schedEndMedia = 0;
      next.audioOut._srcs = next.audioOut._srcs || [];
      var ctx = next.audioOut.context;
      var pending = next.audioOut._pending || [];
      next.audioOut._pending = [];
      if (ctx) next.audioOut.startTime = ctx.currentTime + 0.02;
      var i;
      for (i = 0; i < pending.length; i++) {
        next.audioOut.play(pending[i].rate, pending[i].left, pending[i].right);
      }
    }
    showSeamCanvas(canvas);
    applyPlayerVol();
    lastVideoDecodeAt = Date.now();
    hookNetBytes(streamGen);
    setTimeout(function () { if (player === next) hookNetBytes(streamGen); }, 200);
    setTimeout(function () { if (player === next) hookNetBytes(streamGen); }, 1000);
    try { old.destroy(); } catch (eOld) {}
    fitStage();
    debugPlayback('seamless-join', {
      at: at,
      trigger: triggerReason,
      fromQuality: previousQuality,
      toQuality: nextQuality,
      fromPosition: previousPosition,
      fromVideoTime: previousVideoTime,
      fromAudioTime: previousAudioTime,
      fromAudioBufferSec: previousAudioBufferSec,
      candidateVideoTime: candidateVideoTime,
      candidateAudioBufferSec: candidateAudioBufferSec,
      transitionWaitMs: transitionWaitMs,
      queuedAudio: queuedAudio(),
      audioAheadSec: audioAheadSec()
    });
  }

  function watchSeam() {
    if (!seamPlayer || !playing || ended) {
      cancelSeam('playback-ended');
      return;
    }
    if (paused) return;
    if (seamAutoQuality && !seamReady && Date.now() > seamAutoDeadline) {
      autoQualityCooldownUntil = Date.now() + AUTO_QUALITY_RECOVERY_QUIET_MS;
      debugPlayback('auto-quality-candidate-timeout', {
        targetQuality: seamQuality,
        bufferSec: audioAheadSec()
      });
      cancelSeam('candidate-timeout');
      return;
    }
    var left = audioAheadSec();
    if (seamReady && left < 0.12) {
      commitSeam();
      return;
    }
    if (left < 0.3 && !seamReady) {
      if (seamAutoQuality) {
        autoQualityCooldownUntil = Date.now() + AUTO_QUALITY_RECOVERY_QUIET_MS;
        debugPlayback('auto-quality-candidate-missed-tail', { targetQuality: seamQuality });
        cancelSeam('candidate-missed-tail');
        return;
      }
      var resumeSec = Math.max(0, currentPos() - 0.3);
      var legacy = seamLegacy;
      cancelSeam();
      playUrl(playing, resumeSec, { skipInfo: true, legacy: legacy });
    }
  }

  function beginSeamlessReconnect(legacy, targetQuality, autoQualityCandidate, minimumBufferSec, triggerReason) {
    if (seamPlayer) return true;
    if (!playing || !player || paused || ended || isLive) {
      if (autoQualityCandidate) debugAutoQuality('auto-quality-candidate-waiting', { reason: 'playback-state-changed', targetQuality: targetQuality || quality }, 5000);
      return false;
    }
    var remain = audioAheadSec();
    var requiredBufferSec = Number(minimumBufferSec);
    if (!(requiredBufferSec > 0)) requiredBufferSec = 4;
    if (!(remain >= requiredBufferSec)) {
      if (autoQualityCandidate) debugAutoQuality('auto-quality-candidate-waiting', {
        reason: 'insufficient-audio-buffer',
        targetQuality: targetQuality || quality,
        bufferSec: remain,
        requiredBufferSec: requiredBufferSec
      }, 5000);
      return false;
    }
    var at = currentPos() + remain;
    if (duration > 0 && at > duration - 1.5) {
      if (autoQualityCandidate) debugAutoQuality('auto-quality-candidate-waiting', {
        reason: 'near-video-end',
        targetQuality: targetQuality || quality,
        spliceAt: at
      }, 5000);
      return false;
    }
    seamSpliceAt = at;
    seamQuality = parseInt(targetQuality, 10) || quality;
    seamAutoQuality = !!autoQualityCandidate;
    seamAutoDeadline = seamAutoQuality
      ? Date.now() + Math.min(AUTO_QUALITY_CANDIDATE_TIMEOUT_MS, Math.max(3000, (remain - 0.1) * 1000))
      : 0;
    seamLegacy = !!legacy;
    seamTriggerReason = triggerReason || 'unspecified';
    seamReady = false;
    seamHasFrame = false;
    seamStarted = Date.now();
    seamCanvas = document.createElement('canvas');
    seamCanvas.width = stage.width || 640;
    seamCanvas.height = stage.height || 360;
    seamCanvas.setAttribute('aria-hidden', 'true');
    seamCanvas.style.display = 'none';
    if (stage && stage.parentNode) stage.parentNode.appendChild(seamCanvas);
    armingSeam = true;
    try {
      var prefetch = null;
      prefetch = new JSMpeg.Player(wsUrlFor(playing, at, !autoQualityCandidate, !!legacy, seamQuality, true), {
        canvas: seamCanvas,
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
        preserveDrawingBuffer: true,
        disableWebAudio: false,
        onVideoDecode: function () {
          seamHasFrame = true;
          if (player === prefetch) noteVideoFrame();
        }
      });
      seamPlayer = prefetch;
    } catch (eSeam) {
      armingSeam = false;
      if (autoQualityCandidate) {
        debugPlayback('auto-quality-candidate-start-failed', {
          targetQuality: seamQuality,
          error: eSeam && eSeam.message ? eSeam.message : String(eSeam)
        });
      }
      cancelSeam('player-construction-failed');
      return false;
    }
    armingSeam = false;
    seamPlayer._seam = true;
    sendStreamCtrl(true, true);
    if (seamPlayer.audioOut) {
      seamPlayer.audioOut._seamHold = true;
      seamPlayer.audioOut.volume = 0;
      try { if (seamPlayer.audioOut.gain) seamPlayer.audioOut.gain.gain.value = 0; } catch (eGain) {}
    }
    hardenBits(seamPlayer.audio);
    hardenBits(seamPlayer.video);
    try {
      seamPlayer.wantsToPlay = true;
      seamPlayer.paused = false;
      if (seamPlayer.play) seamPlayer.play();
    } catch (ePlay) {}
    if (seamTimer) clearInterval(seamTimer);
    seamTimer = setInterval(watchSeam, 50);
    debugPlayback('seamless-candidate-started', {
      trigger: seamTriggerReason,
      automaticQuality: seamAutoQuality,
      fromQuality: quality,
      toQuality: seamQuality,
      videoScale: adaptiveVideoScale,
      spliceAt: at,
      audioBufferSec: remain,
      timeoutMs: seamAutoDeadline ? seamAutoDeadline - Date.now() : null
    });
    if (seamAutoQuality) {
      debugPlayback('auto-quality-candidate-started', {
        from: quality,
        to: seamQuality,
        spliceAt: at,
        bufferSec: remain,
        timeoutMs: seamAutoDeadline - Date.now(),
        trigger: triggerReason || 'unspecified'
      });
    }
    debugPlayback('seamless-prefetch', {
      at: at,
      remain: remain,
      quality: seamQuality,
      videoScale: adaptiveVideoScale,
      trigger: triggerReason || 'unspecified'
    });
    return true;
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
      if (gen !== streamGen || !player || player.source !== src) return;
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
            if (!titleStillAhead()) {
              markStreamEnded();
              return;
            }
            if (continueUnfinishedTitle(msg.mode === 'legacy')) return;
            forceShortFinish = true;
            markStreamEnded();
            return;
          }
          if (msg && msg.type === 'ended') {
            flushDemuxTail();
            debugPlayback('encoder-ended', {
              gap: titleGapSec(),
              audioAhead: audioAheadSec(),
              covers: tailCoversTitle(),
              encoded: msg.encoded,
              expected: msg.expected,
              position: audiblePos()
            });
            if (titleStillAhead()) {
              if (continueUnfinishedTitle()) return;
              forceShortFinish = true;
            }
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
            } else if (/시크 구간을 다시 준비/.test(sm) && audioAheadSec() >= 4) {
              return;
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
      if (!player || player.source !== src) {
        debugPlayback('stale-stream-close-ignored', {
          generation: gen,
          currentGeneration: streamGen
        });
        return;
      }
      disableReconnect();
      if (origClose) {
        try { origClose(); } catch (eC) {}
      }
      if (prerolling && playing && !ended && !paused) {
        if (netBytes >= 4000) {
          if (!recoveringStream && !isLive && duration > 0 && tailCoversTitle()) {
            markStreamEnded();
            return;
          }
          if (titleStillAhead() && !continueUnfinishedTitle(false)) {
            forceShortFinish = true;
            markStreamEnded();
          }
          return;
        }
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
        if (Date.now() - lastSocketRestart < 12000) return;
        lastSocketRestart = Date.now();
        if (beginSeamlessReconnect(false, null, false, null, 'socket-recovery')) return;
        if (!isLive && duration > 0 && tailCoversTitle()) {
          markStreamEnded();
          return;
        }
        var resumeSec = Math.max(0, currentPos() - 0.5);
        if (resumeSec < 5 && lastPlaybackPos >= 5) resumeSec = Math.max(0, lastPlaybackPos - 0.5);
        setStatus('네트워크가 끊겨 재연결하는 중...');
        setTimeout(function () {
          if (gen !== streamGen || !playing || paused || ended || streamEnded) return;
          playUrl(playing, resumeSec, { skipInfo: true });
        }, 350);
        return;
      }
      if (!ended && playing && (streamEnded || nearEnd())) markStreamEnded();
    };
    src.onClose = src.__onClose;
    if (src.socket) src.socket.onclose = src.__onClose;
  }

  function chunkDur(ch) {
    if (!ch || !ch.left || !ch.rate) return 0;
    return ch.left.length / ch.rate;
  }

  function streamHeardRel() {
    var heard = playingSoundTime({ fallback: false });
    if (heard > 0) return heard;
    if (paused && pauseHeard > 0) return pauseHeard;
    if (paused && pausePos >= startAt) return Math.max(0, pausePos - startAt);
    return 0;
  }

  function bufferCoversSeek(target) {
    if (!player || !player.video || !player.audio || !player.audioOut) return false;
    if (!playing || isLive || ended || streamEnded) return false;
    if (prerolling || rebuffering || recoveringStream || soundResyncing || needStreamRestart) return false;
    if (!videoStartWall && !stageFrameReady) return false;
    if (videoFail >= 4) return false;
    var nowPos = currentPos();
    var delta = target - nowPos;
    if (!(delta > 0.2) || delta > BUFFER_SEEK_MAX_SEC) return false;
    if (!(audioAheadSec() > delta + BUFFER_SEEK_MARGIN_SEC)) return false;
    if (!(videoAheadSec() > delta + BUFFER_SEEK_MARGIN_SEC)) return false;
    var vt = player.video.currentTime;
    var heard = streamHeardRel();
    if (!isFinite(vt)) return false;
    if (Math.abs(vt - heard) > 0.55) return false;
    var decoded = player.audio.currentTime;
    if (!isFinite(decoded)) return false;
    if (!paused && Math.abs(decoded - audioMediaCursor) > 1.5) return false;
    var targetRel = target - startAt;
    if (!(targetRel > vt + 0.05)) return false;
    var frames = Math.ceil((targetRel - vt) * (fps || 24));
    if (frames > 360) return false;
    return true;
  }

  function harvestScheduledAudio(out, fadeTransition) {
    var chunks = [];
    var srcs = (out._srcs || []).slice();
    out._srcs = [];
    var now = 0;
    try { if (out.context) now = out.context.currentTime; } catch (eNow) { now = 0; }
    var hasTransition = !!(fadeTransition && srcs.length);
    var stopAt = hasTransition ? rampAudioOutput(out, now, true) : now;
    var i;
    for (i = 0; i < srcs.length; i++) {
      var src = srcs[i];
      try {
        var buf = src.buffer;
        var rate = buf ? buf.sampleRate : 0;
        var when = src._ctxAt;
        if (buf && rate > 0 && isFinite(src._mediaAt) && when != null && isFinite(when)) {
          var skip = now - when;
          var from = skip > 0 ? Math.floor(skip * rate) : 0;
          if (from < 0) from = 0;
          if (from < buf.length) {
            var left = copyChannel(buf, 0, from);
            var right = buf.numberOfChannels > 1 ? copyChannel(buf, 1, from) : new Float32Array(left);
            chunks.push({ rate: rate, left: left, right: right, mediaAt: src._mediaAt + (from / rate) });
          }
        }
      } catch (eCopy) {}
      if (hasTransition) {
        try { src.stop(stopAt); } catch (eStop) {}
      } else {
        try { src.onended = null; } catch (eEnded) {}
        try { src.stop(0); } catch (eStopNow) {}
        try { src.disconnect(); } catch (eDisconnect) {}
      }
    }
    var parked = out._parked || [];
    out._parked = [];
    for (i = 0; i < parked.length; i++) {
      if (parked[i] && parked[i].left && parked[i].rate) {
        chunks.push({
          rate: parked[i].rate,
          left: parked[i].left,
          right: parked[i].right || parked[i].left,
          mediaAt: isFinite(parked[i].mediaAt) ? parked[i].mediaAt : audioMediaCursor
        });
      }
    }
    var pending = out._pending || [];
    out._pending = [];
    var pendAt = audioMediaCursor;
    if (chunks.length) {
      var last = chunks[chunks.length - 1];
      pendAt = last.mediaAt + chunkDur(last);
    }
    for (i = 0; i < pending.length; i++) {
      if (!pending[i] || !pending[i].left || !pending[i].rate) continue;
      chunks.push({
        rate: pending[i].rate,
        left: pending[i].left,
        right: pending[i].right || pending[i].left,
        mediaAt: pendAt
      });
      pendAt += pending[i].left.length / pending[i].rate;
    }
    out._seekStartTime = hasTransition ? stopAt : now;
    out.startTime = out._seekStartTime;
    return chunks;
  }

  function trimChunks(chunks, targetRel) {
    var kept = [];
    var i;
    for (i = 0; i < chunks.length; i++) {
      var ch = chunks[i];
      var dur = chunkDur(ch);
      var start = ch.mediaAt;
      var end = start + dur;
      if (!(dur > 0) || !(end > targetRel + 0.001)) continue;
      if (start >= targetRel - 0.001) {
        kept.push(ch);
        continue;
      }
      var n = Math.floor((targetRel - start) * ch.rate);
      if (n < 0) n = 0;
      if (n >= ch.left.length) continue;
      kept.push({
        rate: ch.rate,
        left: ch.left.subarray(n),
        right: (ch.right || ch.left).subarray(n),
        mediaAt: targetRel
      });
    }
    return kept;
  }

  function chunksContinuous(chunks, from) {
    var at = from;
    var i;
    for (i = 0; i < chunks.length; i++) {
      if (Math.abs(chunks[i].mediaAt - at) > 0.08) return false;
      at += chunkDur(chunks[i]);
    }
    return true;
  }

  function chunksSpan(chunks) {
    var sum = 0;
    var i;
    for (i = 0; i < chunks.length; i++) sum += chunkDur(chunks[i]);
    return sum;
  }

  function commitBufferSeek(target, kept, wasPaused) {
    var out = player.audioOut;
    var targetRel = target - startAt;
    var now = 0;
    try { if (out.context) now = out.context.currentTime; } catch (eNow) { now = 0; }
    audioMediaCursor = targetRel;
    out._schedEndMedia = targetRel;
    out._schedEndCtx = now;
    out.startTime = out._seekStartTime > now ? out._seekStartTime : now;
    out._seekStartTime = 0;
    out._capture = null;
    lastHeard = targetRel;
    endCoastFrom = 0;
    seekSettleUntil = Date.now() + 700;
    videoCatching = false;
    driftSince = 0;
    driftAlerted = false;
    videoLeadSince = 0;
    videoFail = 0;
    if (wasPaused) {
      out._parked = kept;
      out._pending = [];
      out._held = true;
      out.enabled = false;
      pausePos = target;
      pauseHeard = targetRel;
      lastPlaybackPos = target;
      paused = true;
    } else {
      out._parked = [];
      out._pending = [];
      out._held = false;
      out.enabled = true;
      paused = false;
      pausePos = -1;
      if (kept.length) fadeHead(kept[0].left, kept[0].right);
      var i;
      for (i = 0; i < kept.length; i++) out.play(kept[i].rate, kept[i].left, kept[i].right);
      lastPlaybackPos = target;
    }
    paintSeekBar();
    paintPlayButton();
  }

  function seekInsideBuffer(target) {
    if (!bufferCoversSeek(target)) {
      debugPlayback('buffer-seek-skip', {
        target: target,
        pos: currentPos(),
        audioAhead: audioAheadSec(),
        videoAhead: videoAheadSec(),
        prerolling: prerolling,
        videoFail: videoFail
      });
      return false;
    }
    var out = player.audioOut;
    var targetRel = target - startAt;
    var decoded = player.audio.currentTime;
    var wasPaused = !!paused;
    var harvested = harvestScheduledAudio(out, !wasPaused);
    var kept = trimChunks(harvested, targetRel);
    if (targetRel > decoded - 0.02) {
      out._capture = [];
      var guard = 0;
      var t0 = Date.now();
      var audioOk = false;
      while (guard < 500 && Date.now() - t0 < 90) {
        var at = player.audio.currentTime;
        if (isFinite(at) && at >= targetRel - 0.03) { audioOk = true; break; }
        if (!player.audio.decode()) break;
        guard++;
      }
      var captured = out._capture || [];
      out._capture = null;
      if (!audioOk) return false;
      var more = trimChunks(captured, targetRel);
      var i;
      for (i = 0; i < more.length; i++) kept.push(more[i]);
    } else {
      var expect = decoded - targetRel;
      if (expect > 0.45 && chunksSpan(kept) + 0.35 < expect) return false;
    }
    if (kept.length && !chunksContinuous(kept, targetRel)) return false;
    var v0 = Date.now();
    var videoOk = false;
    var vg = 0;
    while (vg < 400 && Date.now() - v0 < 140) {
      var vt = player.video.currentTime;
      if (isFinite(vt) && vt >= targetRel - 0.04) { videoOk = true; break; }
      if (!player.video.decode()) break;
      vg++;
    }
    if (!videoOk) return false;
    commitBufferSeek(target, kept, wasPaused);
    debugPlayback('buffer-seek', { target: target, keptSec: chunksSpan(kept), paused: wasPaused });
    if (!wasPaused) setStatus('재생');
    return true;
  }

  function seekTo(sec) {
    if (!playing) return;
    if (durationSource !== playing || !(duration > 0)) {
      debugPlayback('seek-ignored-metadata-pending', {
        playing: playing,
        durationSource: durationSource,
        duration: duration
      });
      return;
    }
    if (membersShownId && membersShownId === videoIdFromSrc(playing)) {
      setStatus('회원전용 영상입니다');
      return;
    }
    if (isLive) return;
    noteManualPlaybackAction();
    if (sec < 0) sec = 0;
    if (duration && sec > duration - 2) sec = Math.max(0, duration - 2);
    seeking = false;
    seekSent = Date.now();
    pendingSeekSec = sec;
    pendingSeekOpts = paused ? { keepPaused: true, skipInfo: true } : { skipInfo: true };
    if ($('npTime') && duration) $('npTime').textContent = fmtPlayClock(sec) + ' / ' + fmtPlayClock(duration);
    if (seekDebounce) clearTimeout(seekDebounce);
    seekDebounce = setTimeout(function () {
      seekDebounce = null;
      var t = pendingSeekSec;
      var o = pendingSeekOpts || { skipInfo: true };
      pendingSeekSec = null;
      pendingSeekOpts = null;
      if (t == null || !playing) return;
      var jumped = false;
      try { jumped = seekInsideBuffer(t); } catch (eSeek) { jumped = false; }
      if (jumped) {
        adaptiveIgnoreUntil = Date.now() + AUTO_VIDEO_USER_IGNORE_MS;
        var seekSocket = streamSocket();
        var seekAudioAhead = audioAheadSec();
        var seekPackedAhead = packedAhead();
        if (!paused && (!seekSocket || seekSocket.readyState !== 1) && !tailCoversTitle()) {
          var continuationMinimum = Math.max(0.8, Math.min(3, seekAudioAhead - 0.5));
          var continuationStarted = beginSeamlessReconnect(
            false,
            quality,
            false,
            continuationMinimum,
            'buffer-seek-continuation'
          );
          debugPlayback('buffer-seek-continuation-request', {
            target: t,
            currentPosition: currentPos(),
            audioBufferSec: seekAudioAhead,
            packedBufferSec: seekPackedAhead,
            socketState: seekSocket ? seekSocket.readyState : 'missing',
            minimumBufferSec: continuationMinimum,
            candidateStarted: continuationStarted
          });
        }
        return;
      }
      if (!o.keepPaused) pausePos = -1;
      setStatus(t > 1 ? '지정한 위치로 이동 중...' : '불러오는 중');
      markManualPlaybackRestart(false);
      playUrl(playing, t, o);
    }, 120);
  }

  function skipSeconds(delta) {
    var base = pendingSeekSec != null ? pendingSeekSec : currentPos();
    seekTo(base + delta);
  }

  function seekPctFromEvent(e) {
    var wrap = $('seekWrap');
    if (!wrap) return 0;
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
    pct = Math.max(0, Math.min(1, pct));
    if (!(duration > 0)) {
      pendingSeekRatio = pct;
      if ($('seekPlay')) $('seekPlay').style.width = (pct * 100) + '%';
      if ($('seekBuf')) {
        $('seekBuf').style.left = '0%';
        $('seekBuf').style.width = '0%';
      }
      if ($('seekKnob')) $('seekKnob').style.left = (pct * 100) + '%';
      if ($('seek')) $('seek').value = String(Math.round(pct * 1000));
      return;
    }
    seekPick = pct * duration;
    if ($('seekPlay')) $('seekPlay').style.width = (pct * 100) + '%';
    if ($('seekKnob')) $('seekKnob').style.left = (pct * 100) + '%';
    showSeekBuf(seekPick, 0);
    if ($('seek')) $('seek').value = String(seekPick);
    if ($('npTime')) $('npTime').textContent = fmtPlayClock(seekPick) + ' / ' + fmtPlayClock(duration);
  }

  function finishSeek() {
    if (duration > 0) {
      seekTo(seekPick);
      return;
    }
    seeking = false;
    seekSent = Date.now();
    if (pendingSeekRatio != null) {
      debugPlayback('seek-queued-for-media-info', { ratio: pendingSeekRatio, source: playing });
    }
  }

  function overlayOpen() {
    var box = $('playerBox');
    return !!(box && box.classList.contains('overlay-on'));
  }

  function hideChromeOverlay() {
    var box = $('playerBox');
    if (chromeTimer) { clearTimeout(chromeTimer); chromeTimer = null; }
    if (box) box.classList.remove('overlay-on');
    setFeedLayerInset();
  }

  function armChromeTimer() {
    if (chromeTimer) { clearTimeout(chromeTimer); chromeTimer = null; }
    if (paused || ended || !playing || !videoStartWall) return;
    chromeTimer = setTimeout(function () {
      chromeTimer = null;
      if (paused || ended || !playing || !videoStartWall) return;
      hideChromeOverlay();
    }, 5000);
  }

  function showChromeOverlay() {
    var box = $('playerBox');
    if (box) box.classList.add('overlay-on');
    armChromeTimer();
    setFeedLayerInset();
  }

  function syncChromeAfterPlay() {
    if (paused || ended || !playing || !videoStartWall) {
      if (chromeTimer) { clearTimeout(chromeTimer); chromeTimer = null; }
      return;
    }
    if (overlayOpen()) armChromeTimer();
  }

  function bumpChrome() {
    if (overlayOpen()) armChromeTimer();
    else showChromeOverlay();
  }

  function onEmptyTap() {
    unlockPlaybackAudio();
    if (overlayOpen()) hideChromeOverlay();
    else showChromeOverlay();
  }

  function copyChannel(buf, channel, from) {
    var data = buf.getChannelData(channel);
    return new Float32Array(data.subarray(from));
  }

  function fadeHead(left, right) {
    var n = Math.min(220, left.length);
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
    if (out.context && out.context.state !== 'running') {
      out._held = false;
      return;
    }
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
    var resumePlayer = player;
    resumeAt = Date.now();
    resumePending = true;
    videoCatching = true;
    sendStreamCtrl(false);
    resumeHeard = pauseHeard > 0 ? pauseHeard : lastHeard;
    var resumeAudioOut = resumePlayer.audioOut;
    if (resumeAudioOut) {
      resumeAudioOut.enabled = true;
      resumeAudioOut.unlocked = true;
      if (prerolling) flushPrerollAudio(resumeAudioOut);
      var ctx = resumeAudioOut.context;
      var live = playingSoundTime({ fallback: false });
      debugPlayback('resume-after-paused-seek', {
        videoTime: player.video && isFinite(player.video.currentTime) ? player.video.currentTime : -1,
        audioCursor: audioMediaCursor,
        decodedTime: player.audio && isFinite(player.audio.decodedTime) ? player.audio.decodedTime : -1,
        pendingAudioSec: pendingAudioSec(resumeAudioOut),
        parkedAudioSec: parkedAudioSec(resumeAudioOut),
        contextTime: ctx ? ctx.currentTime : -1,
        liveSoundTime: live,
        speakerHeard: speakerHeard()
      });
      // The last frame is from before the pause. Leaving its timestamp in
      // place makes a pause longer than 4s look like a stalled decoder.
      lastVideoDecodeAt = Date.now();
      seekSettleUntil = 0;
      var resumeHeldAudio = function () {
        if (paused || player !== resumePlayer) return;
        // Restore the queued tail only after the suspended context can schedule it.
        scheduleHeldAudio(resumeAudioOut);
        applyPlayerVol();
        skipVideoToSound(resumePlayer);
        scheduleResumeSync(0);
      };
      try {
        if (ctx && ctx.state !== 'running' && ctx.resume) {
          var p = ctx.resume();
          if (p && p.then) {
            p.then(resumeHeldAudio, function (error) {
              debugPlayback('resume-audio-context-failed', {
                state: ctx.state,
                error: error && error.message ? error.message : String(error)
              });
            });
          } else resumeHeldAudio();
        } else {
          resumeHeldAudio();
        }
      } catch (e) {}
    }
    player.wantsToPlay = true;
    player.paused = false;
    unlockPlaybackAudio();
    if (pendingEarlyContinue && titleStillAhead()) {
      pendingEarlyContinue = false;
      continueUnfinishedTitle();
    }
    if (!player.animationId && player.play) player.play();
    skipVideoToSound(player);
    scheduleResumeSync(0);
  }

  function togglePause(fromNextLookup) {
    if (nextVidBusy && !fromNextLookup) nextLookupPauseOverridden = true;
    if (!playing) return;
    if (membersShownId && membersShownId === videoIdFromSrc(playing)) {
      setStatus('회원전용 영상입니다');
      showChromeOverlay();
      return;
    }
    if (ended) {
      markManualPlaybackRestart(false);
      ended = false;
      hideRepeatAsk();
      playUrl(playing, 0);
      showChromeOverlay();
      return;
    }
    noteManualPlaybackAction();
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
      pauseSilentClock();
      paused = true;
      pauseWall = Date.now();
      holdPlayback();
      applyStreamHold();
      if (na) { try { na.pause(); } catch (e) {} }
      paintPlayButton();
      applyChrome();
      showChromeOverlay();
      paintSeekBar();
      setStatus('일시정지 · 미리 받는 중');
    } else {
      paused = false;
      paintPlayButton();
      applyChrome();
      var socket = streamSocket();
      var pauseDurationMs = pauseWall ? Date.now() - pauseWall : 0;
      var reconnectReason = pauseDurationMs > 60000
        ? 'long-pause'
        : (!socket || socket.readyState !== 1 ? 'socket-unavailable' : '');
      if (reconnectReason) {
        var reconnectSec = pausePos >= 0 ? pausePos : startAt;
        var bufferedAudioSec = audioAheadSec();
        var bufferedPackedSec = packedAhead();
        pauseWall = 0;
        if (player && bufferedPackedSec >= 1 && bufferedAudioSec >= 1) {
          debugPlayback('pause-resume-buffer-preserved', {
            reason: reconnectReason,
            pauseDurationMs: pauseDurationMs,
            position: reconnectSec,
            packedBufferSec: bufferedPackedSec,
            audioBufferSec: bufferedAudioSec,
            socketState: socket ? socket.readyState : 'missing'
          });
          resumeSilentClock();
          videoCatching = true;
          resumePlayback();
          releaseSilentAudio();
          var candidateSpliceAt = currentPos() + audioAheadSec();
          var bufferedTailCoversTitle = !isLive && duration > 0 && candidateSpliceAt > duration - 1.5;
          var candidateStarted = false;
          if (!bufferedTailCoversTitle) {
            var minimumBufferSec = Math.min(3, Math.max(0.8, bufferedAudioSec - 0.5));
            candidateStarted = beginSeamlessReconnect(false, quality, false, minimumBufferSec, 'pause-buffer-resume:' + reconnectReason);
          }
          if (!candidateStarted && !bufferedTailCoversTitle) {
            var fallbackPosition = Math.max(reconnectSec, currentPos() - 0.3);
            debugPlayback('pause-resume-buffer-fallback', {
              reason: 'continuation-candidate-not-started',
              position: fallbackPosition,
              packedBufferSec: packedAhead(),
              audioBufferSec: audioAheadSec()
            });
            pausePos = -1;
            markManualPlaybackRestart(false);
            playUrl(playing, fallbackPosition, { skipInfo: true });
            paintSeekBar();
            showChromeOverlay();
            return;
          }
          if (bufferedTailCoversTitle) {
            debugPlayback('pause-resume-buffer-tail-sufficient', {
              position: currentPos(),
              candidateSpliceAt: candidateSpliceAt,
              duration: duration,
              audioBufferSec: audioAheadSec(),
              packedBufferSec: packedAhead()
            });
          }
          paintSeekBar();
          setStatus('재생');
          showChromeOverlay();
          return;
        }
        debugPlayback('pause-resume-buffer-unavailable', {
          reason: reconnectReason,
          pauseDurationMs: pauseDurationMs,
          position: reconnectSec,
          packedBufferSec: bufferedPackedSec,
          audioBufferSec: bufferedAudioSec,
          socketState: socket ? socket.readyState : 'missing'
        });
        pausePos = -1;
        markManualPlaybackRestart(false);
        playUrl(playing, reconnectSec, { skipInfo: true });
        paintSeekBar();
        showChromeOverlay();
        return;
      }
      pauseWall = 0;
      if (!player) {
        var resumeSec2 = pausePos >= 0 ? pausePos : startAt;
        pausePos = -1;
        markManualPlaybackRestart(false);
        playUrl(playing, resumeSec2);
      } else {
        resumeSilentClock();
        videoCatching = true;
        resumePlayback();
        releaseSilentAudio();
      }
      paintSeekBar();
      setStatus('재생');
      showChromeOverlay();
    }
  }

  function paintPlayButton() {
    var pausedNow = !!paused;
    var btn = $('btnPause');
    if (btn) {
      btn.classList.toggle('is-paused', pausedNow);
      btn.setAttribute('aria-label', pausedNow ? '재생' : '일시정지');
    }
    var icon = $('tapIcon');
    if (icon) {
      icon.classList.toggle('is-paused', pausedNow);
      icon.setAttribute('aria-label', pausedNow ? '재생' : '일시정지');
    }
  }

  function paintFsButton() {
    var btn = $('btnFs');
    if (btn) btn.setAttribute('aria-label', fsOn ? '전체화면 종료' : '전체화면');
    var back = $('btnWatchBack');
    if (back) back.setAttribute('aria-label', fsOn ? '전체화면 종료' : '뒤로');
  }

  function applyChrome() {
    var box = $('playerBox');
    if (!box) return;
    var overlay = box.classList.contains('overlay-on');
    var cls = 'player-box on';
    if (fsOn) cls += ' fs';
    if (fsOn && fsAlign === 'center') cls += ' fs-center';
    if (fsOn && fsAlign === 'bottom') cls += ' fs-bottom';
    if (paused) cls += ' paused';
    if (overlay) cls += ' overlay-on';
    box.className = cls;
    settleFeedLayer();
    var touchLayer = $('tapLayer');
    if (touchLayer) touchLayer.style.touchAction = fsOn ? 'none' : 'pan-y';
    paintFsButton();
    paintPrevButton();
    fitStage();
    if (stickWatchTop) {
      stickWatchTop = false;
      scrollWatchTop();
      setTimeout(scrollWatchTop, 0);
      setTimeout(scrollWatchTop, 80);
      setTimeout(scrollWatchTop, 320);
    }
  }

  function syncVideoAspect(w, h) {
    var dw = parseFloat(w) || 0;
    var dh = parseFloat(h) || 0;
    if (dw < 16 || dh < 16) return;
    var ar = dw / dh;
    if (ar < 0.2 || ar > 4) return;
    if (Math.abs(ar - videoAr) < 0.02) return;
    videoAr = ar;
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
    wrap.style.height = '0';
    wrap.style.transform = '';
    var ar = videoAr > 0.1 ? videoAr : (16 / 9);
    var bleed = document.documentElement && document.documentElement.classList.contains('watch-doc');
    if (bleed) {
      wrap.style.width = '100vw';
      wrap.style.maxWidth = '100vw';
      wrap.style.marginLeft = 'calc(50% - 50vw)';
      wrap.style.marginRight = 'calc(50% - 50vw)';
      wrap.style.paddingBottom = (100 / ar) + 'vw';
    } else {
      wrap.style.width = '100%';
      wrap.style.margin = '';
      wrap.style.paddingBottom = (100 / ar) + '%';
    }
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
    wrap.style.right = 'auto';
    wrap.style.width = w + 'px';
    wrap.style.height = h + 'px';
    wrap.style.margin = '0';
    if (fsAlign === 'bottom') {
      wrap.style.top = 'auto';
      wrap.style.bottom = '0';
      wrap.style.transform = 'translate(-50%, 0)';
    } else if (fsAlign === 'center') {
      wrap.style.top = '50%';
      wrap.style.bottom = 'auto';
      wrap.style.transform = 'translate(-50%, -50%)';
    } else {
      wrap.style.top = '0';
      wrap.style.bottom = 'auto';
      wrap.style.transform = 'translate(-50%, 0)';
    }
  }

  function setFs(on) {
    var box = $('playerBox');
    if (!box) return;
    fsOn = !!on;
    if (!fsOn) {
      try { sessionStorage.removeItem('tv_fs_keep'); } catch (eFsOff) {}
    }
    applyChrome();
    if (fsOn) hideChromeOverlay();
    else showChromeOverlay();
    setTimeout(fitStage, 0);
    setTimeout(fitStage, 80);
    setTimeout(function () {
      if (!playing || ended) return;
      unlockPlaybackAudio();
      requestSoundSync();
      scheduleResumeSync(0);
    }, 120);
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

  function prevWatchItem() {
    var curId = (watchItem && watchItem.id) || qsVal('v') || '';
    var stack = readWatchBack();
    var i;
    for (i = stack.length - 1; i >= 0; i--) {
      var prev = stack[i];
      if (prev && ((prev.id && prev.id !== curId) || (!prev.id && prev.url))) return prev;
    }
    return null;
  }

  function paintPrevButton() {
    var btn = $('btnPrevVid');
    if (!btn) return;
    var on = !!prevWatchItem();
    btn.className = on ? 'ctrl' : 'ctrl is-off';
    btn.setAttribute('aria-disabled', on ? 'false' : 'true');
  }

  function playPrevVideo() {
    if (!prevWatchItem()) {
      paintPrevButton();
      return;
    }
    backWatch();
  }

  function playNextVideo() {
    var btn = $('btnNextVid');
    if (btn && btn.getAttribute('aria-disabled') === 'true') return;
    if (nextVidBusy) return;
    var id = (watchItem && watchItem.id) || qsVal('v') || '';
    if (!id) {
      setStatus('다음 영상이 없습니다');
      return;
    }
    var restorePlayback = !paused && !!player;
    nextVidBusy = true;
    nextLookupRestorePlayback = restorePlayback;
    nextLookupPauseOverridden = false;
    if (restorePlayback) togglePause(true);
    setStatus('다음 영상을 불러오는 중...');
    fetchNextPlaybackItem(function (item) {
      nextVidBusy = false;
      var nowId = (watchItem && watchItem.id) || qsVal('v') || '';
      if (nowId && nowId !== id) {
        nextLookupRestorePlayback = false;
        nextLookupPauseOverridden = false;
        return;
      }
      if (!item) {
        if ($('btnNextVid')) {
          $('btnNextVid').className = 'ctrl is-off';
          $('btnNextVid').setAttribute('aria-disabled', 'true');
        }
        var shouldResume = nextLookupRestorePlayback && !nextLookupPauseOverridden;
        nextLookupRestorePlayback = false;
        nextLookupPauseOverridden = false;
        if (shouldResume && paused && player && !ended) togglePause();
        setStatus('다음 영상이 없습니다');
        return;
      }
      nextLookupRestorePlayback = false;
      nextLookupPauseOverridden = false;
      var keepSubscriptionOrigin = nextItemKeepsSubscriptionOrigin(item);
      goWatch(item.id, item.url || ('https://www.youtube.com/watch?v=' + item.id), {
        holdRun: true,
        keepFs: true,
        keepFrom: true,
        clearOrigin: !keepSubscriptionOrigin,
        members: item.members === true,
        channelId: item.channel_id || '',
        channelName: item.uploader || item.channel || '',
        title: item.title || '',
        uploaded: item.uploaded || item.ts || 0,
        thumbnail: item.thumbnail || '',
        duration: item.duration || 0,
        views: item.views || 0
      });
    });
  }

  function readWatchBack() {
    try { return JSON.parse(sessionStorage.getItem('tv_watch_back') || '[]'); } catch (e) { return []; }
  }

  function writeWatchBack(list) {
    try { sessionStorage.setItem('tv_watch_back', JSON.stringify((list || []).slice(-20))); } catch (e) {}
  }

  function goWatch(id, url, opts) {
    opts = opts || {};
    saveBrowseState();
    rememberWatch(id, url);
    var leavingFrom = watchFromFavs() ? 'favs' : '';
    var leavingSub = watchSubChannel();
    var destFavs = opts.clearOrigin ? false : (opts.keepFrom ? leavingFrom === 'favs' : currentFeed === 'favs');
    var destSub = '';
    if (!opts.clearOrigin && !destFavs) {
      if (opts.keepFrom) destSub = leavingSub;
      else if (currentFeed === 'subs' && selectedCh) destSub = selectedCh;
    }
    if (destFavs) {
      setWatchFrom('favs');
      setWatchSub('');
    } else {
      setWatchFrom('');
      setWatchSub(destSub);
    }
    if (stage) {
      var curId = (watchItem && watchItem.id) || qsVal('v') || '';
      var curUrl = (watchItem && watchItem.url) || qsVal('url') || '';
      if ((curId && curId !== id) || (!curId && curUrl && curUrl !== url)) {
        var stack = readWatchBack();
        var top = stack.length ? stack[stack.length - 1] : null;
        var leavingMembers = (membersShownId && curId && membersShownId === curId) || qsVal('m') === '1';
        var leavingCh = leavingMembers ? ((watchChannel && watchChannel.channel_id) || qsVal('ch') || '') : '';
        if (!top || top.id !== curId || (!curId && top.url !== curUrl)) stack.push({ id: curId, url: curUrl, from: leavingFrom, sub: leavingSub, members: leavingMembers ? 1 : 0, ch: leavingCh });
        writeWatchBack(stack);
      }
    } else {
      writeWatchBack([]);
    }
    if (opts.auto) setAutoRunCount(opts.resetRun ? 1 : autoRunCount() + 1);
    else if (!opts.holdRun) setAutoRunCount(0);
    hideAutoAsk();
    hideRepeatAsk();
    try {
      if ((opts.auto || opts.keepFs) && fsOn) sessionStorage.setItem('tv_fs_keep', '1');
      else sessionStorage.removeItem('tv_fs_keep');
    } catch (eFsKeep) {}
    try {
      if (feedLayerMode === 'open') sessionStorage.setItem('tv_feed_layer', '1');
      else sessionStorage.removeItem('tv_feed_layer');
    } catch (eLayerKeep) {}
    if (opts.members && id) {
      rememberMembersHint({
        id: id,
        channel_id: opts.channelId || '',
        name: opts.channelName || '',
        title: opts.title || '',
        uploaded: opts.uploaded || 0,
        thumbnail: opts.thumbnail || '',
        duration: opts.duration || 0,
        views: opts.views || 0,
        url: url || ''
      });
    }
    var fromQ = watchOriginQuery(destFavs, destSub);
    var membersQ = (opts.members && id) ? membersLinkQuery(opts.channelId || '') : '';
    if (id) location.href = tv.url('/watch/?v=' + encodeURIComponent(id) + fromQ + membersQ);
    else if (url) location.href = tv.url('/watch/?url=' + encodeURIComponent(url) + fromQ);
  }

  function backWatch() {
    var curId = (watchItem && watchItem.id) || qsVal('v') || '';
    var stack = readWatchBack();
    var prev = null;
    while (stack.length) {
      prev = stack.pop();
      if (prev && ((prev.id && prev.id !== curId) || (!prev.id && prev.url))) break;
      prev = null;
    }
    writeWatchBack(stack);
    var stayFs = !!fsOn;
    setAutoRunCount(0);
    hideRepeatAsk();
    try {
      if (stayFs) sessionStorage.setItem('tv_fs_keep', '1');
      else sessionStorage.removeItem('tv_fs_keep');
    } catch (eFsBack) {}
    try {
      if (feedLayerMode === 'open') sessionStorage.setItem('tv_feed_layer', '1');
      else sessionStorage.removeItem('tv_feed_layer');
    } catch (eLayerBack) {}
    if (prev && prev.from === 'favs') {
      setWatchFrom('favs');
      setWatchSub('');
    } else {
      setWatchFrom('');
      setWatchSub((prev && prev.sub) || '');
    }
    var fromQ = watchOriginQuery(!!(prev && prev.from === 'favs'), (prev && prev.from !== 'favs' && prev.sub) || '');
    var membersQ = (prev && prev.members && prev.id) ? membersLinkQuery(prev.ch || '') : '';
    var previousUrl = '';
    if (prev && prev.id) {
      previousUrl = tv.url('/watch/?v=' + encodeURIComponent(prev.id) + fromQ + membersQ);
    } else if (prev && prev.url) {
      previousUrl = tv.url('/watch/?url=' + encodeURIComponent(prev.url) + fromQ);
    }
    if (previousUrl) {
      location.replace(previousUrl);
      return;
    }
    stop(stayFs);
    location.href = tv.url('/player/');
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

  function armSearchGuard(el, q) {
    if (!el) return;
    el._guardQ = q;
    el._guardUntil = Date.now() + 500;
    if (el.value !== q) el.value = q;
  }

  function keepSearchText(el) {
    if (!el || !el._guardQ || Date.now() > el._guardUntil) return;
    var q = el._guardQ;
    var last = q.charAt(q.length - 1);
    if (last && el.value === q + last) el.value = q;
  }

  function bindSearchEnter(el, submit) {
    if (!el) return;
    var lastAt = 0;
    var lastQ = '';
    function run(q) {
      var now = Date.now();
      if (q === lastQ && now - lastAt < 400) return;
      lastAt = now;
      lastQ = q;
      submit(q);
    }
    el._composing = false;
    el._enterPending = false;
    el.addEventListener('compositionstart', function () { el._composing = true; });
    el.addEventListener('compositionend', function () {
      el._composing = false;
      if (!el._enterPending) return;
      el._enterPending = false;
      var q = el.value;
      setTimeout(function () { run(q); }, 0);
    });
    el.addEventListener('keydown', function (e) {
      var enter = e.key === 'Enter' || e.keyCode === 13;
      if (!enter) return;
      if (e.isComposing || e.keyCode === 229 || el._composing) {
        el._enterPending = true;
        return;
      }
      if (e.preventDefault) e.preventDefault();
      var q = el.value;
      setTimeout(function () { run(q); }, 0);
    });
    el.addEventListener('input', function () { keepSearchText(el); });
  }

  function doWatchSearch(raw) {
    var q = String(raw || '').trim();
    armSearchGuard($('qWatch'), q);
    armSearchGuard($('qWatchTab'), q);
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
  bindSearchEnter($('qWatch'), doWatchSearch);
  if ($('btnWatchTabSearch')) $('btnWatchTabSearch').onclick = function () {
    doWatchSearch(($('qWatchTab') && $('qWatchTab').value) || '');
  };
  bindSearchEnter($('qWatchTab'), doWatchSearch);

  function submitHomeSearch(raw) {
    var q = String(raw || '').trim();
    armSearchGuard($('q'), q);
    if (!q) {
      lastQuery = '';
      lastSearchItems = [];
      lastSearchChannels = [];
      loadHome();
      return;
    }
    if (looksLikeUrl(q)) {
      var m = q.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([a-zA-Z0-9_-]{11})/) || (/^[a-zA-Z0-9_-]{11}$/.test(q) ? [0, q] : null);
      goWatch(m && m[1], q);
      return;
    }
    search(q);
  }
  if ($('btnGo')) $('btnGo').onclick = function () {
    submitHomeSearch(($('q') && $('q').value) || '');
  };
  bindSearchEnter($('q'), submitHomeSearch);
  if ($('btnAppHome')) $('btnAppHome').onclick = function () { location.href = tv.url('/?stay=1'); };
  if ($('btnYtHome')) $('btnYtHome').onclick = function (e) {
    if (e && e.preventDefault) e.preventDefault();
    goYtHome();
  };
  function reloadWatch() {
    var id = (watchItem && watchItem.id) || qsVal('v') || (readWatch() && readWatch().v) || '';
    var url = playing || (watchItem && watchItem.url) || '';
    rememberWatch(id, url);
    unlockPlaybackAudio();
    try { sessionStorage.removeItem('tv_fs_keep'); } catch (eFsReload) {}
    try { sessionStorage.removeItem('tv_feed_layer'); } catch (eLayerReload) {}
    var fromQ = watchOriginQuery(watchFromFavs(), watchFromFavs() ? '' : watchSubChannel());
    var membersOn = (membersShownId && id && membersShownId === id) || qsVal('m') === '1' || !!membersHintFor(id);
    var membersQ = membersOn ? membersLinkQuery((watchChannel && watchChannel.channel_id) || qsVal('ch') || '') : '';
    if (id) {
      location.replace(tv.url('/watch/?v=' + encodeURIComponent(id) + fromQ + membersQ + '&r=' + Date.now()));
      return;
    }
    if (url) {
      location.replace(tv.url('/watch/?url=' + encodeURIComponent(url) + fromQ + '&r=' + Date.now()));
      return;
    }
    location.reload();
  }
  if ($('btnWatchReload')) $('btnWatchReload').onclick = function () { reloadWatch(); };
  if ($('btnWatchBack')) $('btnWatchBack').onclick = function (e) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (fsOn) { setFs(false); return; }
    backWatch();
  };
  if ($('btnBotHelp')) $('btnBotHelp').onclick = function () {
    location.href = tv.url('/help/youtube/');
  };
  if ($('btnStop')) $('btnStop').onclick = function () { stop(false); setStatus('정지'); };
  if ($('btnPause')) $('btnPause').onclick = togglePause;
  if ($('commentsPreview')) $('commentsPreview').onclick = toggleComments;
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
    if (!repeatEnabled && endMode === 'repeat') {
      clearEndTimer();
      hideRepeatAsk();
      repeatHeld = false;
      if (autoplayNext && ended) scheduleNextPlayback();
      else if (ended) setStatus('종료');
    }
  };
  if ($('btnAutoplay')) $('btnAutoplay').onclick = function () {
    autoplayNext = !autoplayNext;
    autoplayLoaded = true;
    paintAutoplayButton();
    tv.post('/api/prefs', { autoplayNext: autoplayNext }, function (code, data) {
      if (data && data.ok) {
        autoplayNext = !!data.autoplayNext;
        paintAutoplayButton();
        return;
      }
      autoplayNext = !autoplayNext;
      paintAutoplayButton();
    });
    if (!ended || repeatEnabled) return;
    if (autoplayNext) scheduleNextPlayback();
    else {
      clearEndTimer();
      setStatus('종료');
    }
  };
  if ($('btnAutoQuality')) $('btnAutoQuality').onclick = function () {
    setAutoQualityPreference(!autoQuality);
  };
  updateRepeatButton();
  paintAutoplayButton();
  paintAutoQualityButton();
  if ($('btnFromStart')) $('btnFromStart').onclick = function () {
    if (!playing) return;
    markManualPlaybackRestart(false);
    playUrl(playing, 0, { skipInfo: true });
  };
  if ($('playerBox')) $('playerBox').onclick = function (e) {
    if (e.target === this) onEmptyTap();
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
  (function bindCenterPress() {
    var icon = $('tapIcon');
    if (!icon) return;
    var start = null;
    var last = 0;
    var touchAt = 0;
    function run(e) {
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.stopPropagation) e.stopPropagation();
      var now = Date.now();
      if (now - last < 600) return;
      last = now;
      if (!overlayOpen()) return;
      togglePause();
    }
    icon.addEventListener('touchstart', function (e) {
      touchAt = Date.now();
      var t = e.touches && e.touches[0];
      if (!t) return;
      start = { x: t.clientX, y: t.clientY, touch: true };
    }, false);
    icon.addEventListener('touchend', function (e) {
      touchAt = Date.now();
      var t = (e.changedTouches && e.changedTouches[0]) || null;
      var x = t ? t.clientX : (start ? start.x : 0);
      var y = t ? t.clientY : (start ? start.y : 0);
      var s = start;
      start = null;
      if (!s || !t) return;
      var dx = x - s.x;
      var dy = y - s.y;
      if (dx < 0) dx = -dx;
      if (dy < 0) dy = -dy;
      if (dx >= 10 || dy >= 10) {
        if (e.preventDefault) e.preventDefault();
        return;
      }
      run(e);
    }, false);
    icon.onmousedown = function (e) {
      if (Date.now() - touchAt < 700) return;
      if (e.button != null && e.button !== 0) return;
      start = { x: e.clientX, y: e.clientY, touch: false };
    };
    icon.onmouseup = function (e) {
      if (Date.now() - touchAt < 700) return;
      var s = start;
      start = null;
      if (!s || s.touch) return;
      var dx = e.clientX - s.x;
      var dy = e.clientY - s.y;
      if (dx < 0) dx = -dx;
      if (dy < 0) dy = -dy;
      if (dx >= 10 || dy >= 10) return;
      run(e);
    };
  })();
  function playerBoxOn() {
    var box = $('playerBox');
    return !!(box && box.classList && box.classList.contains('on'));
  }
  function writeBodyClass() {
    var cls = '';
    if (fsOn) cls = 'player-fs';
    if (feedLayerLayout) cls += (cls ? ' ' : '') + 'fs-feed-layer';
    document.body.className = cls;
  }
  function setFeedLayerInset() {
    if (!feedHost) return;
    feedHost.style.bottom = '';
  }
  function runFeedChange(nextMode, apply) {
    var y = -1;
    if (feedLayerMode === 'flow' || nextMode === 'flow') {
      y = window.pageYOffset || (document.documentElement && document.documentElement.scrollTop) || (document.body && document.body.scrollTop) || 0;
    }
    apply();
    if (y >= 0) {
      try { window.scrollTo(0, y); } catch (eScroll) {}
    }
  }
  function setFeedOpen() {
    if (!feedHost) return;
    runFeedChange('open', function () {
      feedLayerMode = 'open';
      feedLayerLayout = true;
      feedHost.style.transition = '';
      feedHost.style.transform = '';
      setFeedLayerInset();
      writeBodyClass();
    });
  }
  function setFeedPark() {
    if (!feedHost) return;
    runFeedChange('park', function () {
      feedLayerMode = 'park';
      feedLayerLayout = false;
      feedHost.className = 'feed-host feed-host-park';
      feedHost.style.transition = '';
      feedHost.style.transform = '';
      setFeedLayerInset();
      writeBodyClass();
    });
  }
  function setFeedFlow() {
    if (!feedHost) {
      feedLayerMode = 'flow';
      feedLayerLayout = false;
      return;
    }
    runFeedChange('flow', function () {
      feedLayerMode = 'flow';
      feedLayerLayout = false;
      feedHost.className = 'feed-host feed-host-flow';
      feedHost.style.transition = '';
      feedHost.style.transform = '';
      feedHost.style.bottom = '';
      writeBodyClass();
    });
  }
  function settleFeedLayer() {
    if (!feedHost || !playerBoxOn()) {
      if (feedLayerMode !== 'drag') setFeedFlow();
      else writeBodyClass();
      return;
    }
    if (feedLayerMode === 'drag') {
      setFeedLayerInset();
      writeBodyClass();
      return;
    }
    if (feedLayerMode === 'open' || keepLayerOnBoot) {
      keepLayerOnBoot = false;
      setFeedOpen();
      return;
    }
    if (fsOn) setFeedPark();
    else setFeedFlow();
  }
  function animateFeedLayer(open) {
    if (!feedHost) return;
    var token = ++feedAnimToken;
    feedLayerMode = 'drag';
    feedLayerLayout = true;
    feedHost.className = 'feed-host feed-host-drag';
    writeBodyClass();
    setFeedLayerInset();
    feedHost.style.transition = 'transform 180ms ease-out';
    feedHost.style.transform = open ? 'translateX(0px)' : 'translateX(100%)';
    var done = false;
    function finish() {
      if (token !== feedAnimToken || done) return;
      done = true;
      feedHost.removeEventListener('transitionend', onEnd);
      if (open) setFeedOpen();
      else if (fsOn) setFeedPark();
      else setFeedFlow();
    }
    function onEnd(ev) {
      if (ev && ev.propertyName && ev.propertyName !== 'transform') return;
      finish();
    }
    feedHost.addEventListener('transitionend', onEnd);
    setTimeout(finish, 260);
  }
  function closeFeedLayer() {
    if (!feedHost || feedLayerMode === 'flow') return;
    if (feedLayerMode === 'park') {
      if (!fsOn) setFeedFlow();
      return;
    }
    animateFeedLayer(false);
  }
  function releaseFeedLayer() {
    if (!feedHost) return;
    if (feedLayerMode !== 'open' && feedLayerMode !== 'drag') return;
    if (fsOn) setFeedPark();
    else setFeedFlow();
  }
  function setupSubsStick() {
    var td = $('subsTd');
    if (!td || td.getElementsByClassName('subs-stick').length) return;
    var box = document.createElement('div');
    box.className = 'subs-stick';
    while (td.firstChild) box.appendChild(td.firstChild);
    td.appendChild(box);
  }
  function setupFeedHost() {
    var box = $('playerBox');
    var chips = $('chips');
    var tables = document.getElementsByClassName('feed-split');
    var table = tables && tables.length ? tables[0] : null;
    if (!box || !chips || !table || !chips.parentNode || $('feedHost')) return;
    var host = document.createElement('div');
    host.id = 'feedHost';
    host.className = 'feed-host feed-host-flow';
    var head = document.createElement('div');
    head.className = 'feed-layer-head';
    var title = document.createElement('div');
    title.className = 'feed-layer-title';
    title.textContent = '영상 리스트';
    var closeBtn = document.createElement('button');
    closeBtn.id = 'feedLayerClose';
    closeBtn.type = 'button';
    closeBtn.className = 'feed-layer-close';
    closeBtn.setAttribute('aria-label', '목록 닫기');
    closeBtn.innerHTML = '<svg class="feed-layer-x" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6 L18 18 M18 6 L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    head.appendChild(title);
    head.appendChild(closeBtn);
    var scroll = document.createElement('div');
    scroll.id = 'feedLayerScroll';
    scroll.className = 'feed-layer-scroll';
    chips.parentNode.insertBefore(host, chips);
    host.appendChild(head);
    host.appendChild(scroll);
    var order = [];
    order.push(chips);
    if ($('watchTabSearch')) order.push($('watchTabSearch'));
    if ($('relH')) order.push($('relH'));
    if ($('libTools')) order.push($('libTools'));
    order.push(table);
    var i;
    for (i = 0; i < order.length; i++) {
      if (order[i] && order[i].parentNode) scroll.appendChild(order[i]);
    }
    var stick = document.getElementsByClassName('subs-stick');
    if (stick && stick.length && !document.getElementById('subsLayerLabel')) {
      var lab = document.createElement('div');
      lab.id = 'subsLayerLabel';
      lab.className = 'subs-layer-label';
      lab.textContent = '구독리스트';
      stick[0].insertBefore(lab, stick[0].firstChild);
    }
    closeBtn.onclick = function (e) {
      if (e && e.stopPropagation) e.stopPropagation();
      closeFeedLayer();
    };
    scroll.addEventListener('scroll', onScrollMore, false);
    feedHost = host;
    feedScroll = scroll;
  }
  (function bindStageGesture() {
    setupSubsStick();
    setupFeedHost();
    var layer = $('tapLayer');
    if (!layer) return;
    var gesture = null;
    var mouseGesture = null;
    var pageGesture = null;
    var pageMouse = null;
    var suppressLayerClick = false;
    var lastTouchAt = 0;
    function pointOf(e) {
      var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
      return { x: t.clientX, y: t.clientY };
    }
    var pendingTap = null;
    var skipFlashTimer = 0;
    function clearPendingTap() {
      if (!pendingTap) return;
      clearTimeout(pendingTap.timer);
      pendingTap = null;
    }
    function zoneAt(x) {
      var r = layer.getBoundingClientRect();
      var w = r.width || 1;
      var p = (x - r.left) / w;
      return p < 0.5 ? -1 : 1;
    }
    function showSkipFlash(dir) {
      var back = $('skipBack');
      var fwd = $('skipFwd');
      if (back) back.className = dir < 0 ? 'skip-flash skip-back on' : 'skip-flash skip-back';
      if (fwd) fwd.className = dir > 0 ? 'skip-flash skip-fwd on' : 'skip-flash skip-fwd';
      if (skipFlashTimer) clearTimeout(skipFlashTimer);
      skipFlashTimer = setTimeout(function () {
        skipFlashTimer = 0;
        if (back) back.className = 'skip-flash skip-back';
        if (fwd) fwd.className = 'skip-flash skip-fwd';
      }, 800);
    }
    function onStageTap(x) {
      unlockPlaybackAudio();
      var now = Date.now();
      var zone = zoneAt(x);
      if (pendingTap && (now - pendingTap.at) <= 450 && pendingTap.zone === zone) {
        pendingTap.at = now;
        pendingTap.count += 1;
        clearTimeout(pendingTap.timer);
        if (pendingTap.count >= 3) {
          var z = pendingTap.zone;
          pendingTap = null;
          if (!playing || isLive) return;
          skipSeconds(z < 0 ? -10 : 10);
          showSkipFlash(z);
          return;
        }
        pendingTap.timer = setTimeout(function () {
          pendingTap = null;
          setFs(!fsOn);
        }, 200);
        return;
      }
      clearPendingTap();
      pendingTap = {
        at: now,
        zone: zone,
        count: 1,
        timer: setTimeout(function () {
          pendingTap = null;
          onEmptyTap();
        }, 450)
      };
    }
    function layerBlockedTarget(node) {
      var t = node;
      while (t && t !== document) {
        if (t.id === 'seekWrap' || t.id === 'seek') return true;
        if (t.classList && t.classList.contains('bar-bottom')) return true;
        t = t.parentNode;
      }
      return false;
    }
    function feedLayerWidth() {
      if (!feedHost) return 402;
      var w = feedHost.offsetWidth || 0;
      if (w > 20) return w;
      var vw = window.innerWidth || 402;
      return vw < 402 ? vw : 402;
    }
    function moveFeedDrag(g) {
      if (!g.drag || !feedHost) return;
      var dx = g.x1 - g.x0;
      var w = g.width || 1;
      var offset = g.base + dx;
      if (offset < 0) offset = 0;
      if (offset > w) offset = w;
      g.offset = offset;
      feedHost.style.transform = 'translateX(' + offset + 'px)';
    }
    function beginFeedDrag(g) {
      if (!feedHost || !playerBoxOn()) return false;
      feedAnimToken += 1;
      var fromOpen = feedLayerMode === 'open';
      runFeedChange('drag', function () {
        feedLayerMode = 'drag';
        feedLayerLayout = true;
        feedHost.className = 'feed-host feed-host-drag';
        writeBodyClass();
        setFeedLayerInset();
        feedHost.style.transition = 'none';
        feedHost.style.transform = fromOpen ? 'translateX(0px)' : 'translateX(100%)';
      });
      var w = feedLayerWidth();
      g.base = fromOpen ? 0 : w;
      g.width = w;
      g.drag = true;
      moveFeedDrag(g);
      return true;
    }
    function flickVelocity(g) {
      var s = g.samples || [];
      if (s.length < 2) return 0;
      var last = s[s.length - 1];
      var prev = s[0];
      var i;
      for (i = s.length - 1; i >= 0; i--) {
        if (last.t - s[i].t >= 40) { prev = s[i]; break; }
      }
      var dt = last.t - prev.t;
      if (dt < 16) return 0;
      return (last.x - prev.x) / dt;
    }
    function endFeedDrag(g) {
      if (!g || !g.drag) return;
      var w = g.width || feedLayerWidth() || 1;
      var offset = g.offset != null ? g.offset : g.base;
      var vx = flickVelocity(g);
      var openAmt = w - offset;
      var open = false;
      if (vx <= -0.4) open = true;
      else if (vx >= 0.4) open = false;
      else if (openAmt >= w * 0.4) open = true;
      animateFeedLayer(!!open);
    }
    function trackMove(g, x, y) {
      g.x1 = x;
      g.y1 = y;
      if (!g.samples) g.samples = [];
      g.samples.push({ t: Date.now(), x: x });
      if (g.samples.length > 8) g.samples.shift();
      if (g.mode === 'v') return;
      var dx = x - g.x0;
      var dy = y - g.y0;
      var adx = dx < 0 ? -dx : dx;
      var ady = dy < 0 ? -dy : dy;
      if (g.mode !== 'h') {
        if (adx < 10 && ady < 10) return;
        if (ady >= adx || !feedHost || !playerBoxOn() || layerBlockedTarget(g.target)) {
          g.mode = 'v';
          return;
        }
        if (!beginFeedDrag(g)) { g.mode = 'v'; return; }
        g.mode = 'h';
        return;
      }
      moveFeedDrag(g);
    }
    function finishGesture(g) {
      if (!g) return;
      if (g.mode === 'h') {
        endFeedDrag(g);
        return;
      }
      var dx = g.x1 - g.x0;
      var dy = g.y1 - g.y0;
      var adx = dx < 0 ? -dx : dx;
      var ady = dy < 0 ? -dy : dy;
      if (adx < 10 && ady < 10) {
        onStageTap(g.x1);
        return;
      }
      clearPendingTap();
      unlockPlaybackAudio();
    }
    function newGesture(x, y, target) {
      return { x0: x, y0: y, x1: x, y1: y, target: target, mode: '', samples: [{ t: Date.now(), x: x }] };
    }
    layer.addEventListener('touchstart', function (e) {
      lastTouchAt = Date.now();
      if (!e.touches || e.touches.length !== 1) { gesture = null; return; }
      var p = pointOf(e);
      gesture = newGesture(p.x, p.y, e.target);
    }, { passive: true });
    function endTouch(e) {
      lastTouchAt = Date.now();
      if (!gesture) return;
      var g = gesture;
      gesture = null;
      var p = pointOf(e);
      if (p && isFinite(p.x)) trackMove(g, p.x, p.y);
      finishGesture(g);
    }
    layer.addEventListener('touchmove', function (e) {
      if (!gesture) return;
      if (!e.touches || e.touches.length !== 1) return;
      var p = pointOf(e);
      trackMove(gesture, p.x, p.y);
      if (gesture.mode === 'h' && e.cancelable && e.preventDefault) e.preventDefault();
    }, { passive: false });
    layer.addEventListener('touchend', function (e) { endTouch(e); }, false);
    layer.addEventListener('touchcancel', function () {
      lastTouchAt = Date.now();
      var g = gesture;
      gesture = null;
      if (g && g.mode === 'h') endFeedDrag(g);
      else clearPendingTap();
    }, false);
    layer.onmousedown = function (e) {
      if (Date.now() - lastTouchAt < 700) return;
      if (e.button != null && e.button !== 0) return;
      mouseGesture = newGesture(e.clientX, e.clientY, e.target);
    };
    document.addEventListener('mousemove', function (e) {
      if (mouseGesture) trackMove(mouseGesture, e.clientX, e.clientY);
      else if (pageMouse) trackMove(pageMouse, e.clientX, e.clientY);
    });
    document.addEventListener('mouseup', function (e) {
      if (mouseGesture) {
        var g = mouseGesture;
        mouseGesture = null;
        var x = e && typeof e.clientX === 'number' ? e.clientX : g.x1;
        var y = e && typeof e.clientY === 'number' ? e.clientY : g.y1;
        trackMove(g, x, y);
        finishGesture(g);
        return;
      }
      if (!pageMouse) return;
      var pg = pageMouse;
      pageMouse = null;
      var px = e && typeof e.clientX === 'number' ? e.clientX : pg.x1;
      var py = e && typeof e.clientY === 'number' ? e.clientY : pg.y1;
      trackMove(pg, px, py);
      if (pg.mode === 'h') {
        suppressLayerClick = true;
        setTimeout(function () { suppressLayerClick = false; }, 400);
      }
      finishPageGesture(pg);
    });
    function insideTapLayer(node) {
      return !!(layer && node && layer.contains(node));
    }
    function pageSwipeSurface(node) {
      if (!node) return false;
      var box = $('playerBox');
      if (box && (node === box || box.contains(node))) return true;
      if (feedHost && (node === feedHost || feedHost.contains(node))) return true;
      return false;
    }
    function pageSwipeBlocked(node) {
      var t = node;
      while (t && t !== document) {
        if (t.id === 'seekWrap' || t.id === 'seek') return true;
        if (t.classList && (t.classList.contains('bar-bottom') || t.classList.contains('subs-rail') || t.classList.contains('vol-wrap'))) return true;
        var tag = t.tagName ? t.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
        t = t.parentNode;
      }
      return false;
    }
    function finishPageGesture(g) {
      if (!g || g.mode !== 'h') return;
      endFeedDrag(g);
    }
    function startPageGesture(x, y, target) {
      if (!fsOn || !playerBoxOn() || !feedHost) return null;
      if (insideTapLayer(target)) return null;
      if (!pageSwipeSurface(target)) return null;
      if (pageSwipeBlocked(target)) return null;
      var g = newGesture(x, y, target);
      g.page = true;
      return g;
    }
    document.addEventListener('click', function (e) {
      if (!suppressLayerClick) return;
      suppressLayerClick = false;
      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
    }, true);
    document.addEventListener('touchstart', function (e) {
      suppressLayerClick = false;
      if (!fsOn || !playerBoxOn()) return;
      if (!e.touches || e.touches.length !== 1) { pageGesture = null; return; }
      var p = pointOf(e);
      var g = startPageGesture(p.x, p.y, e.target);
      if (!g) return;
      lastTouchAt = Date.now();
      pageGesture = g;
    }, { capture: true, passive: true });
    document.addEventListener('touchmove', function (e) {
      if (!pageGesture) return;
      if (!e.touches || e.touches.length !== 1) return;
      var p = pointOf(e);
      trackMove(pageGesture, p.x, p.y);
      if (pageGesture.mode === 'h' && e.cancelable && e.preventDefault) e.preventDefault();
    }, { capture: true, passive: false });
    document.addEventListener('touchend', function (e) {
      if (!pageGesture) return;
      lastTouchAt = Date.now();
      var g = pageGesture;
      pageGesture = null;
      var p = pointOf(e);
      if (p && isFinite(p.x)) trackMove(g, p.x, p.y);
      if (g.mode === 'h') {
        suppressLayerClick = true;
        if (e.cancelable && e.preventDefault) e.preventDefault();
        setTimeout(function () { suppressLayerClick = false; }, 400);
      }
      finishPageGesture(g);
    }, true);
    document.addEventListener('touchcancel', function () {
      var g = pageGesture;
      pageGesture = null;
      if (g && g.mode === 'h') endFeedDrag(g);
    }, true);
    document.addEventListener('mousedown', function (e) {
      if (Date.now() - lastTouchAt < 700) return;
      if (e.button != null && e.button !== 0) return;
      if (pageMouse || mouseGesture) return;
      var g = startPageGesture(e.clientX, e.clientY, e.target);
      if (!g) return;
      pageMouse = g;
    }, true);
  })();
  function chromeControlTarget(node) {
    var box = $('playerBox');
    if (!box || !node || !box.contains(node)) return false;
    var t = node;
    while (t && t !== box) {
      if (t.id === 'tapLayer' || t.id === 'tapIcon') return false;
      if (t.id === 'btnFs') return false;
      if (t.id === 'seekWrap' || t.id === 'btnWatchBack') return true;
      if (t.classList && (t.classList.contains('bar-bottom') || t.classList.contains('ctrl') || t.classList.contains('autoplay-toggle') || t.classList.contains('vol-wrap') || t.classList.contains('hud-back'))) return true;
      var tag = t.tagName ? t.tagName.toLowerCase() : '';
      if (tag === 'button' || tag === 'input') return true;
      t = t.parentNode;
    }
    return false;
  }
  document.addEventListener('touchstart', function (e) {
    if (chromeControlTarget(e.target)) bumpChrome();
  }, { capture: true, passive: true });
  document.addEventListener('mousedown', function (e) {
    if (chromeControlTarget(e.target)) bumpChrome();
  }, true);
  bindTap($('btnBack'), function () { skipSeconds(-10); });
  bindTap($('btnFwd'), function () { skipSeconds(10); });
  bindTap($('btnPrevVid'), function () { playPrevVideo(); });
  bindTap($('btnNextVid'), function () { playNextVideo(); });
  if ($('btnFs')) $('btnFs').onclick = function (e) { if (e) e.stopPropagation(); setFs(!fsOn); };
  var lastVol = 100;
  var volTouched = false;
  var volSaveTimer = 0;
  function saveVolumePref(pct) {
    if (!currentPin) return;
    if (volSaveTimer) clearTimeout(volSaveTimer);
    volSaveTimer = setTimeout(function () {
      volSaveTimer = 0;
      tv.post('/api/prefs', { volume: pct }, function () {});
    }, 300);
  }
  function setVol(pct, opts) {
    pct = Math.max(0, Math.min(100, pct));
    if ($('vol')) $('vol').value = String(pct);
    var v = pct / 100;
    applyPlayerVol();
    if (na) { na.volume = v; na.muted = pct <= 0; }
    if ($('btnMute')) $('btnMute').textContent = pct <= 0 ? '✕' : '♪';
    if (!opts || !opts.quiet) saveVolumePref(pct);
  }
  if ($('vol')) $('vol').oninput = function () {
    volTouched = true;
    lastVol = parseInt(this.value, 10) || 0;
    setVol(lastVol);
    bumpChrome();
  };
  if ($('btnMute')) $('btnMute').onclick = function () {
    volTouched = true;
    var cur = parseInt(($('vol') && $('vol').value) || '100', 10);
    if (cur > 0) { lastVol = cur; setVol(0); }
    else setVol(lastVol || 100);
  };
  if ($('seekWrap')) {
    var wrap = $('seekWrap');
    wrap.ontouchstart = function (e) {
      seekTouch = true;
      seeking = true;
      previewSeek(seekPctFromEvent(e));
      if (e.preventDefault) e.preventDefault();
    };
    wrap.ontouchmove = function (e) {
      if (!seeking) return;
      bumpChrome();
      previewSeek(seekPctFromEvent(e));
      if (e.preventDefault) e.preventDefault();
    };
    wrap.ontouchend = function (e) {
      if (!seeking) return;
      previewSeek(seekPctFromEvent(e));
      finishSeek();
      seekTouch = false;
    };
    wrap.onmousedown = function (e) {
      if (seekTouch) return;
      seeking = true;
      previewSeek(seekPctFromEvent(e));
    };
    wrap.onmousemove = function (e) {
      if (seekTouch || !seeking) return;
      bumpChrome();
      previewSeek(seekPctFromEvent(e));
    };
    wrap.onmouseup = function (e) {
      if (seekTouch) { seekTouch = false; return; }
      if (!seeking) return;
      previewSeek(seekPctFromEvent(e));
      finishSeek();
    };
    wrap.onmouseleave = function () {
      if (seekTouch || !seeking) return;
      seeking = false;
    };
    wrap.onclick = function (e) {
      if (seekTouch) { seekTouch = false; return; }
      if (Date.now() - seekSent < 1200) return;
      previewSeek(seekPctFromEvent(e));
      finishSeek();
      if (e.stopPropagation) e.stopPropagation();
    };
  }
  if ($('seek')) {
    $('seek').oninput = function () {
      bumpChrome();
      seeking = true;
      var v = parseFloat(this.value) || 0;
      var max = parseFloat(this.max) || 1000;
      previewSeek(Math.max(0, Math.min(1, v / (duration > 0 ? duration : max))));
    };
    $('seek').onchange = function () {
      if (Date.now() - seekSent < 400) return;
      if (duration > 0) seekTo(parseFloat(this.value) || 0);
      else finishSeek();
    };
  }

  function bindToggleBtns(sel, cls, apply, restart) {
    var btns = document.querySelectorAll(sel);
    for (var i = 0; i < btns.length; i++) {
      btns[i].onclick = function () {
        apply(this);
        for (var j = 0; j < btns.length; j++) btns[j].className = 'ctrl ' + cls;
        this.className = 'ctrl ' + cls + ' on';
        if (restart !== false && playing) {
          markManualPlaybackRestart(true);
          playUrl(playing, currentPos());
        }
      };
    }
  }
  bindToggleBtns('.qbtn', 'qbtn', function (el) {
    quality = parseInt(el.getAttribute('data-q'), 10) || 360;
    if (autoQuality) setAutoQualityPreference(false, 'manual-quality');
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
    bufTarget = (n === 10 || n === 20 || n === 30) ? n : 30;
    applyStreamHold();
  }, false);
  bindToggleBtns('.abtn', 'abtn', function (el) {
    var align = el.getAttribute('data-align');
    fsAlign = (align === 'center' || align === 'bottom') ? align : 'top';
    if (fsOn) applyChrome();
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
    if (el.className && el.className.indexOf('is-playing') >= 0) return;
    var stayFs = !!fsOn;
    releaseFeedLayer();
    var watchOpts = null;
    if (el.getAttribute('data-members') === '1') {
      var av = el.querySelector('.yt-card-av');
      watchOpts = {
        members: true,
        channelId: (av && av.getAttribute('data-chid')) || '',
        channelName: (av && av.getAttribute('data-chname')) || '',
        title: el.getAttribute('data-title') || '',
        uploaded: parseInt(el.getAttribute('data-uploaded') || '0', 10) || 0,
        thumbnail: el.getAttribute('data-thumb') || '',
        duration: parseFloat(el.getAttribute('data-dur') || '0') || 0,
        views: parseInt(el.getAttribute('data-views') || '0', 10) || 0
      };
    }
    if (stayFs) {
      if (!watchOpts) watchOpts = {};
      watchOpts.keepFs = true;
    }
    goWatch(el.getAttribute('data-id'), el.getAttribute('data-url'), watchOpts);
  };
  }
  if ($('btnFavWatch')) $('btnFavWatch').onclick = function () {
    var id = this.getAttribute('data-star') || (watchItem && watchItem.id);
    toggleFav(id);
  };
  if ($('btnSub')) $('btnSub').onclick = function () { toggleSub(); };
  if ($('btnFeedSub')) $('btnFeedSub').onclick = function () {
    if (!selectedCh) return;
    toggleSubChannel(feedSubCh || channelById(selectedCh));
  };
  if ($('subsFind')) {
    $('subsFind').oninput = function () {
      subsFindQ = this.value.trim();
      var vis = filteredSubList();
      renderRail();
      if (currentFeed !== 'subs') return;
      if (!vis.length) {
        if (list) list.innerHTML = '<div class="notice">해당하는 채널이 없습니다</div>';
        return;
      }
      if (!selectedCh || !vis.some(function (ch) { return ch.channel_id === selectedCh; })) {
        openChannel(vis[0].channel_id);
      }
    };
  }
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
      if (feedUsesLibView(currentFeed) && currentFeed !== 'subs') applyLibView();
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
    suggestSortSet = true;
    paintSortChips();
    if (feedUsesLibView(currentFeed)) applyLibView();
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
      subVideoCache = {};
      subsWarmGen++;
      subsWarmId = '';
      subsWarmPaint = null;
      subsOpen = null;
      libRaw = [];
      lastItems = [];
      selectedCh = '';
      currentPin = '';
      autoplayNext = false;
      autoplayLoaded = false;
      paintAutoplayButton();
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
    showWatchFilters();
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
      lastChannels = lastSearchChannels;
      libRaw = lastSearchItems.slice();
      applyLibView('검색 결과 없음');
      setStatus('"' + lastQuery + '" 검색 결과 ' + lastItems.length + '개');
      return;
    }
    search(lastQuery, 'search');
  }

  function revealSelectedChannel(attempt) {
    var rail = $('subsRail');
    if (!rail || !rail.getBoundingClientRect) return;
    var on = rail.querySelector('.sub-ch.on');
    if (!on || !on.getBoundingClientRect) return;
    var railRect = rail.getBoundingClientRect();
    var onRect = on.getBoundingClientRect();
    if (onRect.top < railRect.top) rail.scrollTop -= railRect.top - onRect.top;
    else if (onRect.bottom > railRect.bottom) rail.scrollTop += onRect.bottom - railRect.bottom;
    if (onRect.left < railRect.left) rail.scrollLeft -= railRect.left - onRect.left;
    else if (onRect.right > railRect.right) rail.scrollLeft += onRect.right - railRect.right;
    attempt = Number(attempt) || 0;
    if (attempt < 3) {
      setTimeout(function () { revealSelectedChannel(attempt + 1); }, attempt === 0 ? 80 : 160);
    }
  }

  function openWatchSourceChannel() {
    if (!stage) return;
    if (playing && (!stagePrerollReady || prerolling)) {
      pendingWatchSourceOpen = true;
      return;
    }
    pendingWatchSourceOpen = false;
    var id = watchSubChannel();
    if (!id) return;
    if (currentFeed === 'search' || currentFeed === 'related' || currentFeed === 'suggest' || currentFeed === 'favs' || currentFeed === 'subs') return;
    if (!subChannelById(id)) {
      setChip('suggest');
      var vid = (watchItem && watchItem.id) || qsVal('v') || '';
      if (vid) loadSuggest(vid, reqSeq);
      return;
    }
    openChannel(id, { keepSeq: true });
  }

  function openWatchSuggestTab() {
    setChip('suggest');
    showWatchFilters();
    showSubsRail(false);
    ensureSuggestSort();
    showSuggestLoading();
    var id = (watchItem && watchItem.id) || qsVal('v') || (readWatch() && readWatch().v) || '';
    loadSuggest(id, beginReq());
  }

  function openWatchRelatedTab() {
    setChip('related');
    showWatchFilters();
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
      if (feed !== currentFeed) resetLib();
      keepWatchScroll(function () {
        if (feed === 'suggest') openWatchSuggestTab();
        else if (feed === 'related') openWatchRelatedTab();
        else if (feed === 'search') openWatchSearchTab();
        else if (feed === 'subs') loadSubs();
        else if (feed === 'favs') showWatchFavs();
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

  window.addEventListener('resize', function () {
    if (fsOn) fitStage();
    setFeedLayerInset();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && fsOn) setFs(false);
    var el = e.target;
    var tag = el && el.tagName ? el.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (el && el.isContentEditable)) return;
    if (e.key === ' ' && playing) { e.preventDefault(); togglePause(); }
    if ((e.key === 'f' || e.key === 'F') && playing) setFs(!fsOn);
  });

  if (stage) showChromeOverlay();
  tv.ensurePin(function () {
    tv.get('/api/auth/status', function (c, d) {
      currentPin = (d && d.pin) || '';
      paintLogoutLabel();
      if (currentPin) loadAutoplayPref();
    });
    loadServerHistory();
    loadFavMap();
    loadSubMap(function () {
      if (stage) openWatchSourceChannel();
    });
    if (stage) {
      if (qsVal('from') === 'favs') {
        setWatchFrom('favs');
        setWatchSub('');
      } else if (qsVal('sub')) {
        setWatchFrom('');
        setWatchSub(qsVal('sub'));
      } else if (qsVal('v') || qsVal('url')) {
        setWatchFrom('');
        setWatchSub('');
      }
      unlockAudio();
      if (watchFromFavs()) setChip('favs');
      else if (watchSubChannel()) {
        clearFeedChips();
        if (currentFeed !== 'subs' && list && !list.querySelector('.yt-card')) renderSkeleton();
      } else setChip('suggest');
      paintPrevButton();
      var w = readWatch();
      if (w.v) playUrl('https://www.youtube.com/watch?v=' + w.v);
      else if (w.url) playUrl(w.url);
      else setStatus('재생할 영상이 없습니다');
    } else {
      restoreBrowse();
    }
  });
})();
