(function (w) {
  function base() { return w.APP_BASE || ''; }
  function withToken(u) {
    var token = localStorage.getItem('tv_token');
    if (!token) return u;
    return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(token);
  }
  function url(p) { return withToken(base() + p); }
  function ws(p) {
    var proto = w.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return withToken(proto + '//' + w.location.host + base() + p);
  }

  function xhr(method, path, body, cb) {
    var x = new XMLHttpRequest();
    x.open(method, url(path), true);
    x.timeout = 60000;
    x.setRequestHeader('Accept', 'application/json');
    var token = localStorage.getItem('tv_token');
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
            if (d.token) localStorage.setItem('tv_token', d.token);
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
      if (data && data.authed) { if (done) done(); return; }
      var token = '';
      try { token = localStorage.getItem('tv_token') || ''; } catch (e) {}
      if (token && (status === 0 || !data)) { if (done) done(); return; }
      showPin(done);
    });
  }

  function logout(done) {
    post('/api/auth/logout', {}, function () {
      try { localStorage.removeItem('tv_token'); } catch (e) {}
      showPin(done);
    });
  }

  w.tv = { url: url, ws: ws, get: get, post: post, fmtDur: fmtDur, fmtViews: fmtViews, fmtAgo: fmtAgo, home: home, ensurePin: ensurePin, logout: logout };
})(window);
