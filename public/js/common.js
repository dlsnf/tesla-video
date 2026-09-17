(function (w) {
  function base() { return w.APP_BASE || ''; }
  function getToken() {
    var t = '';
    try { t = localStorage.getItem('tv_token') || ''; } catch (e) {}
    if (t) return t;
    try {
      var m = String(document.cookie || '').match(/(?:^|; )tv_token=([^;]*)/);
      if (m) t = decodeURIComponent(m[1] || '');
    } catch (e2) {}
    if (t) return t;
    try {
      var q = /(?:^|[?&])token=([^&]*)/.exec(String(w.location.search || ''));
      if (q) t = decodeURIComponent(q[1] || '');
    } catch (e3) {}
    return t || '';
  }
  function setToken(t) {
    t = String(t || '');
    if (!t) return;
    try { localStorage.setItem('tv_token', t); } catch (e) {}
    try {
      var p = base() || '/';
      document.cookie = 'tv_token=' + encodeURIComponent(t) + '; path=' + p + '; max-age=31536000; samesite=lax';
      if (p !== '/') document.cookie = 'tv_token=' + encodeURIComponent(t) + '; path=/; max-age=31536000; samesite=lax';
    } catch (e2) {}
    try {
      if (w.history && w.history.replaceState && String(w.location.search || '').indexOf('token=') < 0) {
        var href = String(w.location.href || '');
        w.history.replaceState(null, '', href + (href.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(t));
      }
    } catch (e3) {}
  }
  function getDebug() {
    var q = /(?:^|[?&])debug=([^&]*)/.exec(String(w.location.search || ''));
    if (!q || q[1] === undefined) return false;
    var value = decodeURIComponent(q[1] || '');
    try { localStorage.setItem('tv_debug', value); } catch (e2) {}
    try { sessionStorage.setItem('tv_debug', value); } catch (e3) {}
    return value === '1' || value === 'true' || value === 'on';
  }
  function setDebug(on) {
    var v = !!on ? '1' : '';
    try { if (v) localStorage.setItem('tv_debug', v); else localStorage.removeItem('tv_debug'); } catch (e) {}
    try { if (v) sessionStorage.setItem('tv_debug', v); else sessionStorage.removeItem('tv_debug'); } catch (e2) {}
    try {
      if (w.history && w.history.replaceState && !!on && String(w.location.search || '').indexOf('debug=') < 0) {
        var href = String(w.location.href || '');
        w.history.replaceState(null, '', href + (href.indexOf('?') >= 0 ? '&' : '?') + 'debug=1');
      }
    } catch (e3) {}
  }
  function withDebug(u) {
    if (!getDebug()) return u;
    return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'debug=1';
  }
  function withToken(u) {
    var token = getToken();
    if (!token) return withDebug(u);
    u = u + (u.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(token);
    return withDebug(u);
  }
  function url(p) { return withToken(base() + p); }
  function ws(p) {
    var proto = w.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return withToken(proto + '//' + w.location.host + base() + p);
  }

  function xhr(method, path, body, cb) {
    var x = new XMLHttpRequest();
    x.open(method, url(path), true);
    x.withCredentials = true;
    x.timeout = 60000;
    x.setRequestHeader('Accept', 'application/json');
    var token = getToken();
    if (token) x.setRequestHeader('X-Tv-Token', token);
    if (body) x.setRequestHeader('Content-Type', 'application/json');
    x.onload = function () {
      var data = null;
      try { data = JSON.parse(x.responseText); } catch (e) { data = { raw: x.responseText }; }
      cb(x.status, data);
    };
    x.onerror = function () { cb(0, { error: 'network' }); };
    x.ontimeout = function () { cb(0, { error: 'timeout' }); };
    x.send(body ? JSON.stringify(body) : null);
  }

  function get(path, cb) { xhr('GET', path, null, cb); }
  function post(path, body, cb) { xhr('POST', path, body, cb); }

  function pad2(n) {
    n = String(n);
    return n.length < 2 ? '0' + n : n;
  }
  function fmtViews(n) {
    n = parseInt(n, 10) || 0;
    if (n <= 0) return '';
    if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, '') + '억회';
    if (n >= 10000) return Math.round(n / 10000) + '만회';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + '천회';
    return n + '회';
  }
  function fmtAgo(ms) {
    ms = parseInt(ms, 10) || 0;
    if (ms <= 0) return '';
    if (ms > 0 && ms < 1e12) ms *= 1000;
    var diff = Date.now() - ms;
    if (diff < 0) diff = 0;
    var min = Math.floor(diff / 60000);
    var hour = Math.floor(diff / 3600000);
    var day = Math.floor(diff / 86400000);
    if (hour < 1) {
      if (min < 1) return '방금';
      return min + '분 전';
    }
    if (hour < 24) return hour + '시간 전';
    if (day < 7) return day + '일 전';
    if (day < 30) return Math.max(1, Math.floor(day / 7)) + '주일 전';
    if (day < 365) return Math.max(1, Math.floor(day / 30)) + '개월 전';
    return Math.max(1, Math.floor(day / 365)) + '년 전';
  }
  function fmtDur(sec) {
    sec = parseInt(sec, 10) || 0;
    if (sec <= 0) return '';
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    if (h) return h + ':' + pad2(m) + ':' + pad2(s);
    return m + ':' + pad2(s);
  }

  function stampLinks() {
    var token = getToken();
    var debug = getDebug();
    var as = document.getElementsByTagName('a');
    var i;
    for (i = 0; i < as.length; i++) {
      var href = as[i].getAttribute('href');
      if (!href || href.charAt(0) === '#' || href.indexOf('javascript:') === 0) continue;
      if (href.indexOf('mailto:') === 0) continue;
      var next = href;
      if (token && next.indexOf('token=') < 0) {
        next += (next.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(token);
      }
      if (debug && next.indexOf('debug=') < 0) {
        next += (next.indexOf('?') >= 0 ? '&' : '?') + 'debug=1';
      }
      if (next !== href) as[i].href = next;
      if (/^https?:/i.test(href) && href.indexOf(w.location.host) < 0) continue;
    }
  }

  function home() { w.location.href = url('/') || '/'; }

  function showPin(done) {
    var mask = document.getElementById('pinMask');
    if (!mask) { if (done) done(); return; }
    mask.className = 'pin-mask on';
    var pin = '';
    var dots = document.getElementById('pinDots');
    var err = document.getElementById('pinErr');
    if (err) err.textContent = '';
    function render() {
      if (dots) dots.textContent = pin.length ? new Array(pin.length + 1).join('•') : 'PIN';
    }
    render();
    mask.onclick = function (e) {
      var b = e.target.getAttribute('data-k');
      if (b === undefined || b === null) return;
      if (b === 'c') { pin = ''; render(); return; }
      if (b === 'x') { pin = pin.slice(0, -1); render(); return; }
      if (pin.length >= 8) return;
      pin += b;
      render();
      if (pin.length >= 4) {
        post('/api/auth/login', { pin: pin }, function (st, d) {
          if (d && d.ok) {
            if (d.token) setToken(d.token);
            stampLinks();
            mask.className = 'pin-mask';
            if (done) done();
          } else {
            pin = '';
            render();
            if (err) err.textContent = (d && d.error) || 'PIN 오류';
          }
        });
      }
    };
  }

  function ensurePin(done) {
    get('/api/auth/status', function (status, data) {
      if (data && data.authed) {
        var t0 = getToken();
        if (t0) setToken(t0);
        stampLinks();
        if (done) done();
        return;
      }
      var token = getToken();
      if (token && data && data.authed) { if (done) done(); return; }
      if (token && (status === 0 || !data)) { if (done) done(); return; }
      showPin(done);
    });
  }

  function logout(done) {
    post('/api/auth/logout', {}, function () {
      try { localStorage.removeItem('tv_token'); } catch (e) {}
      try { document.cookie = 'tv_token=; path=/; max-age=0'; } catch (e2) {}
      showPin(done);
    });
  }

  if (String(w.location.search || '').indexOf('debug=') >= 0) {
    var debugParam = /(?:^|[?&])debug=([^&]*)/.exec(String(w.location.search || ''));
    if (debugParam) {
      try { localStorage.setItem('tv_debug', decodeURIComponent(debugParam[1] || '')); } catch (e) {}
      try { sessionStorage.setItem('tv_debug', decodeURIComponent(debugParam[1] || '')); } catch (e2) {}
    }
  }

  w.tv = { url: url, ws: ws, get: get, post: post, fmtDur: fmtDur, fmtViews: fmtViews, fmtAgo: fmtAgo, home: home, ensurePin: ensurePin, logout: logout, stampLinks: stampLinks, getToken: getToken, setToken: setToken, getDebug: getDebug, setDebug: setDebug, withDebug: withDebug };
})(window);
