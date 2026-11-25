/* site.js: progressive enhancements for every page (the content works without it). */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Theme ---------- */
  var themeBtn = $('[data-theme-toggle]');
  function applyTheme(t, save) {
    root.setAttribute('data-theme', t);
    if (themeBtn) themeBtn.setAttribute('aria-pressed', String(t === 'dark'));
    if (save) { try { localStorage.setItem('theme', t); } catch (e) { /* ignore */ } }
  }
  if (themeBtn) {
    applyTheme(root.getAttribute('data-theme') || 'light', false);
    themeBtn.addEventListener('click', function () {
      applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true);
    });
  }
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onScheme = function (e) {
      var saved = null;
      try { saved = localStorage.getItem('theme'); } catch (err) { /* ignore */ }
      if (!saved) applyTheme(e.matches ? 'dark' : 'light', false);
    };
    if (mq.addEventListener) mq.addEventListener('change', onScheme);
  }

  /* ---------- Header: transparent over the dark hero, solid elsewhere ---------- */
  var header = $('.site-header');
  var hero = $('[data-hero]');
  if (header) {
    var onScroll = function () { header.setAttribute('data-scrolled', String(window.scrollY > 8)); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    if (hero && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        header.setAttribute('data-solid', String(!entries[0].isIntersecting));
      }, { rootMargin: '-' + (header.offsetHeight || 68) + 'px 0px 0px 0px' }).observe(hero);
    } else {
      header.setAttribute('data-solid', 'true');
    }
  }

  /* ---------- Mobile menu ---------- */
  var menuBtn = $('.menu-toggle');
  var navLinks = $('#nav-links');
  if (menuBtn && navLinks && header) {
    var setMenu = function (open) {
      header.classList.toggle('nav-open', open);
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      document.body.style.overflow = open ? 'hidden' : '';
    };
    menuBtn.addEventListener('click', function () { setMenu(!header.classList.contains('nav-open')); });
    navLinks.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
    window.addEventListener('resize', function () { if (window.innerWidth > 920) setMenu(false); });
  }

  /* ---------- Scrollspy for in-page navigation ---------- */
  var spyLinks = $$('.nav-links a[href^="#"]');
  if (spyLinks.length && 'IntersectionObserver' in window) {
    var bySection = new Map();
    spyLinks.forEach(function (a) {
      var s = document.getElementById(a.getAttribute('href').slice(1));
      if (s) bySection.set(s, a);
    });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        spyLinks.forEach(function (l) { l.removeAttribute('aria-current'); });
        var a = bySection.get(e.target);
        if (a) a.setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    bySection.forEach(function (a, s) { spy.observe(s); });
    if (hero) spy.observe(hero);
    $$('main > section[id]').forEach(function (s) { if (!bySection.has(s)) spy.observe(s); });
  }

  /* ---------- Reveal on scroll ---------- */
  var reveals = $$('.reveal');
  if (!reduceMotion && 'IntersectionObserver' in window) {
    reveals.forEach(function (el) {
      // stagger items that sit side by side (grid cells, list items)
      var item = el.parentElement && el.parentElement.tagName === 'LI' ? el.parentElement : el;
      var i = item.parentElement ? Array.prototype.indexOf.call(item.parentElement.children, item) : 0;
      if (i > 0) el.style.transitionDelay = Math.min(i, 6) * 70 + 'ms';
    });
    var ro = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); ro.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    reveals.forEach(function (el) { ro.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ---------- Publication filters ---------- */
  var filtersEl = $('[data-pub-filters]');
  if (filtersEl) {
    var pubs = $$('.pub');
    var groups = $$('[data-pub-group]');
    var statusEl = $('[data-pub-status]');
    var btns = $$('.filter', filtersEl);
    var has = function (p, f) { return f === 'all' || (' ' + (p.getAttribute('data-tags') || '') + ' ').indexOf(' ' + f + ' ') > -1; };
    btns.forEach(function (b) {
      var c = $('.count', b);
      if (c) c.textContent = pubs.filter(function (p) { return has(p, b.getAttribute('data-filter')); }).length;
    });
    var applyFilter = function (f) {
      var shown = 0;
      btns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-filter') === f)); });
      pubs.forEach(function (p) { var ok = has(p, f); p.hidden = !ok; if (ok) shown++; });
      groups.forEach(function (g) { g.hidden = !$$('.pub', g).some(function (p) { return !p.hidden; }); });
      if (statusEl) statusEl.textContent = 'Showing ' + shown + ' of ' + pubs.length + '.';
    };
    filtersEl.hidden = false;
    filtersEl.addEventListener('click', function (e) {
      var b = e.target.closest('.filter');
      if (b) applyFilter(b.getAttribute('data-filter'));
    });
    applyFilter('all');
  }

  /* ---------- Copy buttons (BibTeX, bio) ---------- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-copy]');
    if (!btn) return;
    var src = $(btn.getAttribute('data-copy'));
    if (!src) return;
    var text = src.textContent.trim();
    var done = function () {
      var label = $('span', btn), old = label ? label.textContent : '';
      btn.setAttribute('data-copied', 'true');
      if (label) label.textContent = 'Copied';
      setTimeout(function () { btn.removeAttribute('data-copied'); if (label) label.textContent = old; }, 1600);
    };
    var fallback = function () {
      var range = document.createRange();
      range.selectNodeContents(src);
      var sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
      try { document.execCommand('copy'); } catch (err) { /* ignore */ }
      sel.removeAllRanges();
      done();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  });

  /* ---------- Email (assembled at runtime to deter address harvesters) ---------- */
  $$('[data-email-user]').forEach(function (a) {
    var addr = a.getAttribute('data-email-user') + '@' + a.getAttribute('data-email-domain');
    a.setAttribute('href', 'mailto:' + addr);
    a.textContent = addr;
  });

  /* ---------- Footer year ---------- */
  $$('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });

  /* ---------- Research animations: play while on screen, stay still for reduced motion, always pausable */
  $$('[data-video]').forEach(function (box) {
    var v = $('video', box), btn = $('[data-video-toggle]', box);
    if (!v) return;
    var userPaused = reduceMotion;
    var play = function () { var p = v.play(); if (p && p.catch) p.catch(function () {}); };
    var sync = function () {
      var on = !v.paused;
      box.classList.toggle('is-playing', on);
      if (btn) btn.setAttribute('aria-label', on ? 'Pause animation' : 'Play animation');
    };
    v.addEventListener('play', sync);
    v.addEventListener('pause', sync);
    if (btn) btn.addEventListener('click', function () {
      if (v.paused) { userPaused = false; play(); } else { userPaused = true; v.pause(); }
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { if (!userPaused) play(); } else if (!v.paused) { v.pause(); }
        });
      }, { threshold: 0.35 }).observe(box);
    } else if (!userPaused) {
      play();
    }
    sync();
  });

  /* ---------- Hero / 404 simulation ---------- */
  var stage = $('[data-flow-stage]');
  if (stage && window.SquirmerFlow) {
    var panel = $('[data-sim-panel]');
    var mode = stage.getAttribute('data-flow-mode') || 'hero';
    var toggleBtn = panel ? $('[data-sim-toggle]', panel) : null;
    var flow = new window.SquirmerFlow(stage, {
      beta: parseFloat(stage.getAttribute('data-beta') || '-3'),
      density: mode === 'hero' ? 1 / 540 : 1 / 800,
      pointerEl: hero || stage,
      // keep the autopilot in the open space beside the text column
      roam: mode === 'hero' ? function (W, H) {
        if (W >= 1100) return { x0: W * 0.5, y0: H * 0.15, x1: W * 0.97, y1: H - 250 };
        if (W > 820) return { x0: W * 0.62, y0: H * 0.12, x1: W * 0.97, y1: H - 270 };
        return { x0: W * 0.06, y0: H * 0.06, x1: W * 0.94, y1: H * 0.94 };
      } : null,
      glow: mode === 'hero' && window.innerWidth <= 820 ? 0.6 : 1,
      onState: function (s) {
        if (panel) panel.classList.toggle('is-paused', s.paused);
        if (toggleBtn) toggleBtn.setAttribute('aria-label', s.paused ? 'Play animation' : 'Pause animation');
      }
    });
    window.heroFlow = flow;
    if (panel) {
      $$('[data-beta]', panel).forEach(function (b) {
        b.addEventListener('click', function () {
          flow.setBeta(parseFloat(b.getAttribute('data-beta')));
          $$('[data-beta]', panel).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        });
      });
      if (toggleBtn) toggleBtn.addEventListener('click', function () { flow.toggle(); });
    }
  }
})();
