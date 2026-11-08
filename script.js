// Password Generator — plain JavaScript. Passwords are made with crypto.getRandomValues and never saved.
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;
  var SETTINGS_KEY = 'pwgen_settings';   // only the settings are saved, never a password
  var THEME_KEY = 'pwgen_theme';

  var SETS = {
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lower: 'abcdefghijklmnopqrstuvwxyz',
    digits: '0123456789',
    symbols: '!@#$%^&*()-_=+[]{};:,.?/'
  };
  var LOOK_ALIKE = /[0O1lI]/g;

  var defaults = { length: 16, upper: true, lower: true, digits: true, symbols: true, similar: false };
  var settings = loadSettings();
  var current = '';
  var recent = [];

  function loadSettings() {
    try {
      var s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
      if (s && typeof s === 'object') {
        var out = {};
        Object.keys(defaults).forEach(function (k) { out[k] = typeof s[k] === typeof defaults[k] ? s[k] : defaults[k]; });
        out.length = Math.min(64, Math.max(6, Math.round(out.length)));
        return out;
      }
    } catch (e) {}
    return Object.assign({}, defaults);
  }
  function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {} }

  // Uniform random integer in [0, max) without modulo bias.
  function randomInt(max) {
    var limit = Math.floor(0x100000000 / max) * max;
    var buf = new Uint32Array(1);
    do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
    return buf[0] % max;
  }

  function chosenSets() {
    return ['upper', 'lower', 'digits', 'symbols']
      .filter(function (k) { return settings[k]; })
      .map(function (k) { return settings.similar ? SETS[k].replace(LOOK_ALIKE, '') : SETS[k]; });
  }

  // One character from every chosen set, the rest from all of them, then a fair shuffle.
  function generate() {
    var sets = chosenSets();
    if (!sets.length) return '';
    var all = sets.join('');
    var chars = sets.map(function (s) { return s[randomInt(s.length)]; });
    while (chars.length < settings.length) chars.push(all[randomInt(all.length)]);
    for (var i = chars.length - 1; i > 0; i--) {
      var j = randomInt(i + 1);
      var tmp = chars[i]; chars[i] = chars[j]; chars[j] = tmp;
    }
    return chars.join('');
  }

  // Strength from the size of the character pool and the length (bits of randomness).
  function strength() {
    var pool = chosenSets().join('').length;
    var bits = pool ? Math.floor(settings.length * Math.log2(pool)) : 0;
    if (bits < 45) return { level: 1, label: 'Weak.', note: 'Easy to guess. Make it longer.' };
    if (bits < 65) return { level: 2, label: 'Okay.', note: 'Fine for low-risk accounts. Longer is better.' };
    if (bits < 90) return { level: 3, label: 'Strong.', note: 'Good for most accounts.' };
    return { level: 4, label: 'Very strong.', note: 'Good for email, banking and other important accounts.' };
  }

  // ---------- UI ----------
  function showPassword(pw) {
    var box = $('password');
    box.textContent = '';
    for (var i = 0; i < pw.length; i++) {
      var ch = pw[i];
      if (/[0-9]/.test(ch) || !/[A-Za-z]/.test(ch)) {
        var span = document.createElement('span');
        span.className = /[0-9]/.test(ch) ? 'd' : 's';
        span.textContent = ch;
        box.appendChild(span);
      } else {
        box.appendChild(document.createTextNode(ch));
      }
    }
  }

  function makeNew() {
    var none = !chosenSets().length;
    $('hint').hidden = !none;
    $('copy').disabled = none;
    if (none) { current = ''; $('password').textContent = '—'; updateStrength(); return; }
    current = generate();
    showPassword(current);
    updateStrength();
    resetCopy();
  }

  function updateStrength() {
    var el = $('strength');
    if (!current) { el.dataset.level = '0'; $('strength-label').textContent = ''; $('strength-note').textContent = ''; return; }
    var s = strength();
    el.dataset.level = String(s.level);
    $('strength-label').textContent = s.label;
    $('strength-note').textContent = s.note;
  }

  function syncControls() {
    $('length').value = settings.length;
    $('length-value').textContent = settings.length;
    ['upper', 'lower', 'digits', 'symbols', 'similar'].forEach(function (k) { $(k).checked = settings[k]; });
  }

  $('length').addEventListener('input', function () {
    settings.length = +$('length').value;
    $('length-value').textContent = settings.length;
    saveSettings();
    makeNew();
  });
  ['upper', 'lower', 'digits', 'symbols', 'similar'].forEach(function (k) {
    $(k).addEventListener('change', function () { settings[k] = $(k).checked; saveSettings(); makeNew(); });
  });
  $('regen').addEventListener('click', makeNew);

  // ---------- Copy ----------
  var copyTimer = 0;
  function resetCopy() { clearTimeout(copyTimer); $('copy').classList.remove('is-copied'); $('copy-label').textContent = 'Copy'; }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {   // fallback for older browsers
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) resolve(); else reject(new Error('copy failed'));
    });
  }
  $('copy').addEventListener('click', function () {
    if (!current) return;
    var pw = current;
    copyText(pw).then(function () {
      $('copy').classList.add('is-copied');
      $('copy-label').textContent = 'Copied';
      clearTimeout(copyTimer);
      copyTimer = setTimeout(resetCopy, 2000);
      addRecent(pw);
    }, function () {
      $('copy-label').textContent = 'Copy failed, select it by hand';
    });
  });

  // ---------- Recent (memory only, this tab) ----------
  function addRecent(pw) {
    recent = recent.filter(function (p) { return p !== pw; });
    recent.unshift(pw);
    recent = recent.slice(0, 5);
    renderRecent();
  }
  function renderRecent() {
    var ul = $('recent-list');
    ul.textContent = '';
    recent.forEach(function (pw) {
      var li = document.createElement('li');
      var code = document.createElement('code');
      code.textContent = pw;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'link-btn';
      b.textContent = 'Copy';
      b.addEventListener('click', function () {
        copyText(pw).then(function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1500); });
      });
      li.appendChild(code);
      li.appendChild(b);
      ul.appendChild(li);
    });
  }
  $('clear-recent').addEventListener('click', function () { recent = []; renderRecent(); });

  // ---------- Theme: follows the device/browser until the visitor picks one ----------
  var themeMeta = document.querySelector('meta[name="theme-color"]');
  function setThemeColor() { themeMeta.content = root.dataset.theme === 'dark' ? '#121415' : '#eef0ef'; }
  setThemeColor();
  $('theme-btn').addEventListener('click', function () {
    if (root.dataset.theme === 'dark') delete root.dataset.theme; else root.dataset.theme = 'dark';
    try { localStorage.setItem(THEME_KEY, root.dataset.theme === 'dark' ? 'dark' : 'light'); } catch (e) {}
    setThemeColor();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (err) {}
    if (saved === 'dark' || saved === 'light') return;
    if (e.matches) root.dataset.theme = 'dark'; else delete root.dataset.theme;
    setThemeColor();
  });

  syncControls();
  renderRecent();
  makeNew();
})();
