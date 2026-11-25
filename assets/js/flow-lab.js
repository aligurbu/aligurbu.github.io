/*!
 * flow-lab.js: the two Flow Lab explorables.
 *
 * 01 Squirmer: UI around SquirmerFlow (flow.js).
 * 02 Three-sphere swimmer (Najafi & Golestanian 2004), computed with the far-field theory of
 *    Liao, Lemus, Gurbuz, Tsang, Pak & Daddi-Moussa-Ider, Phys. Rev. E 109, 065106 (2024).
 *    Spheres of radius a on a line, joined by arms of prescribed lengths L1(t), L2(t). Sphere i
 *    exerts force f_i on the fluid (along the axis), and
 *        v_i = mu_S f_i + sum_{j != i} mu_P(|x_i - x_j|) f_j,
 *    with the Brinkman self-mobility (PRE Eq. 7)
 *        mu_S = 1 / (6 pi eta a A),   A = 1 + alpha a + (alpha a)^2 / 9,
 *    and the pair mobility (PRE Eq. 8, after Felderhof 2019)
 *        mu_P(d) = [B^2 - (1 + alpha d) e^{alpha (2a - d)}] / (2 pi eta alpha^2 d^3 A^2),
 *        B = 1 + alpha a + (alpha a)^2 / 3,
 *    which tends to the Rotne-Prager form (3 d^2 - 2 a^2) / (12 pi eta d^3) as alpha -> 0.
 *    Arm kinematics plus zero total force give three linear equations for f_1..f_3.
 *    The fluid velocity is the sum of the exact flows around three translating spheres.
 *    Units: a = 1, eta = 1, time in stroke cycles. Arms extend to D = 10 a, as in the paper.
 */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var TAU = Math.PI * 2;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function fmt(v, d) {
    var s = Math.abs(v).toFixed(d);
    return (v < 0 && +s !== 0 ? '−' : '') + s;
  }

  function setPlayButton(btn, paused) {
    if (!btn) return;
    var use = btn.querySelector('use'), label = btn.querySelector('span');
    if (use) use.setAttribute('href', paused ? '#i-play' : '#i-pause');
    if (label) label.textContent = paused ? 'Play' : 'Pause';
  }

  /* ================================================================ 01 Squirmer */
  function initSquirmer() {
    var stage = $('#sq-stage');
    if (!stage || !window.SquirmerFlow) return;
    var toggleBtn = $('#sq-toggle');
    var flow = new window.SquirmerFlow(stage, {
      beta: -3,
      density: 1 / 430,
      pointerEl: stage,
      onState: function (s) { setPlayButton(toggleBtn, s.paused); }
    });
    var slider = $('#sq-beta'), out = $('#sq-beta-out'), readout = $('#sq-readout'), hint = $('.stage-hint', stage);

    function describe(b) {
      var kind, text;
      if (b < -0.25) {
        kind = 'Pusher';
        text = 'Thrust comes from behind. Fluid is pushed out along the swimming axis and drawn in at the sides, as around <i>E. coli</i>. The far field is a force dipole and decays like 1/<i>r</i><sup>2</sup>.';
      } else if (b > 0.25) {
        kind = 'Puller';
        text = 'It pulls itself forward. Fluid is drawn in along the swimming axis and pushed out at the sides, as around <i>Chlamydomonas</i>. The far field is a force dipole and decays like 1/<i>r</i><sup>2</sup>.';
      } else {
        kind = 'Neutral';
        text = 'No force dipole: the far field is a source dipole that decays like 1/<i>r</i><sup>3</sup>, so it disturbs the fluid least.';
      }
      if (Math.abs(b) > 1) {
        text += ' Because |β| &gt; 1, the surface slip reverses near the ' + (b < 0 ? 'front' : 'rear') + ' pole.';
      }
      return '<span class="tag">' + kind + '</span><br>' + text + ' Speed <i>U</i> = 2<i>B</i><sub>1</sub>/3 for every β.';
    }
    function sync() {
      var b = parseFloat(slider.value);
      out.textContent = fmt(b, 1);
      readout.innerHTML = describe(b);
    }
    slider.addEventListener('input', function () { flow.setBeta(parseFloat(slider.value)); sync(); });

    $$('[data-frame]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var f = btn.getAttribute('data-frame');
        flow.setFrame(f);
        $$('[data-frame]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
        if (hint) hint.textContent = f === 'lab'
          ? 'Move the cursor over the flow to steer · lab frame'
          : 'Riding along with the swimmer · the fluid streams past';
      });
    });
    $$('[data-layer]').forEach(function (box) {
      box.addEventListener('change', function () {
        var layers = {};
        layers[box.getAttribute('data-layer')] = box.checked;
        flow.setLayers(layers);
      });
    });
    if (toggleBtn) toggleBtn.addEventListener('click', function () { flow.toggle(); });
    var resetBtn = $('#sq-reset');
    if (resetBtn) resetBtn.addEventListener('click', function () { flow.reset(); });
    sync();
  }

  /* ================================================================ 02 Three-sphere swimmer */
  // Pair mobility for motion along the line of centers, spheres a distance d apart (PRE Eq. 8).
  function pairMob(d, al) {
    if (al === 0) return (3 * d * d - 2) / (12 * Math.PI * d * d * d);
    var A = 1 + al + al * al / 9, B = 1 + al + al * al / 3;
    return (B * B - (1 + al * d) * Math.exp(al * (2 - d))) / (2 * Math.PI * al * al * d * d * d * A * A);
  }
  // Self-mobility of a sphere in a Brinkman medium (PRE Eq. 7).
  function selfMob(al) { return 1 / (6 * Math.PI * (1 + al + al * al / 9)); }

  // Flow at (dx, y) around a unit sphere translating along the axis with velocity U: the exact
  // Brinkman solution, a Brinkmanlet plus a potential dipole (Stokeslet plus source dipole when
  // alpha = 0). Written as u = U [cA e_x + cB (x/r)(x/r, y/r)], free of overflow for large alpha.
  function sphereFlow(dx, y, U, al, out) {
    var r = Math.sqrt(dx * dx + y * y), ir = 1 / r, ir3 = ir * ir * ir, cA, cB;
    if (al === 0) {
      cA = 0.75 * ir + 0.25 * ir3;
      cB = 0.75 * ir - 0.75 * ir3;
    } else {
      var iS = 1 / (al * r), E = 1.5 * Math.exp(-al * (r - 1)) * ir;
      var Dd = 0.5 * (1 + 3 / al + 3 / (al * al));            // total potential-dipole strength
      cA = E * (1 + iS + iS * iS) - Dd * ir3;
      cB = -E * (1 + 3 * iS + 3 * iS * iS) + 3 * Dd * ir3;
    }
    var cx = dx * ir;
    out.ux += U * (cA + cB * cx * cx);
    out.uy += U * cB * cx * y * ir;
  }

  // Slider position (0..50) to alpha a: 0, then 10 steps per decade from 0.013 to 1000.
  function alphaOf(p) { return p <= 0 ? 0 : Math.pow(10, (p - 20) / 10); }
  function fmtAlpha(al) { return al === 0 ? '0' : String(Number(al.toPrecision(2))); }

  // Prescribed arm lengths and their rates (per cycle) at phase t in [0, 1).
  function strokeAt(type, t, L, e) {
    t = t - Math.floor(t);
    if (type === 'four') {
      var q = Math.min(3, Math.floor(t * 4)), s = t * 4 - q, r = 4 * e;
      if (q === 0) return [L - e * s, L, -r, 0];
      if (q === 1) return [L - e, L - e * s, 0, -r];
      if (q === 2) return [L - e + e * s, L - e, r, 0];
      return [L, L - e + e * s, 0, r];
    }
    var w = TAU * t;
    if (type === 'smooth') {
      return [L - e / 2 + (e / 2) * Math.cos(w), L - e / 2 + (e / 2) * Math.cos(w - Math.PI / 2),
        -(e / 2) * TAU * Math.sin(w), -(e / 2) * TAU * Math.sin(w - Math.PI / 2)];
    }
    // reciprocal: both arms in phase with different amplitudes; the path retraces itself
    return [L - e / 2 + (e / 2) * Math.cos(w), L - e / 4 + (e / 4) * Math.cos(w),
      -(e / 2) * TAU * Math.sin(w), -(e / 4) * TAU * Math.sin(w)];
  }

  function det3(A) {
    return A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1])
         - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0])
         + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
  }

  // Forces and velocities for arm lengths (L1, L2) changing at rates (d1, d2).
  function solve(L1, L2, d1, d2, al, out) {
    var m = selfMob(al), g12 = pairMob(L1, al), g23 = pairMob(L2, al), g13 = pairMob(L1 + L2, al);
    var M = [[m, g12, g13], [g12, m, g23], [g13, g23, m]];
    var A = [
      [M[1][0] - M[0][0], M[1][1] - M[0][1], M[1][2] - M[0][2]],
      [M[2][0] - M[1][0], M[2][1] - M[1][1], M[2][2] - M[1][2]],
      [1, 1, 1]
    ];
    var b = [d1, d2, 0], D = det3(A), f = [0, 0, 0];
    for (var k = 0; k < 3; k++) {
      var Ak = A.map(function (row, i) { return row.map(function (v, j) { return j === k ? b[i] : v; }); });
      f[k] = det3(Ak) / D;
    }
    out.f = f;
    out.v = [0, 1, 2].map(function (i) { return M[i][0] * f[0] + M[i][1] * f[1] + M[i][2] * f[2]; });
    out.V = (out.v[0] + out.v[1] + out.v[2]) / 3;   // velocity of the center
    return out;
  }

  // Displacement of the center over one cycle (the mobility depends only on the arm lengths,
  // so the center velocity is a function of the stroke phase alone).
  function perCycle(type, L, e, al) {
    var N = 1600, h = 1 / N, c = 0, tmp = {};
    var V = function (t) { var s = strokeAt(type, t, L, e); return solve(s[0], s[1], s[2], s[3], al, tmp).V; };
    for (var n = 0; n < N; n++) {
      var t = n * h, k1 = V(t), k2 = V(t + h / 2), k4 = V(t + h);
      c += h * (k1 + 4 * k2 + k4) / 6;
    }
    return c;
  }

  function loopArea(type, L, e) {
    var N = 400, A = 0, p = strokeAt(type, 0, L, e);
    for (var n = 1; n <= N; n++) {
      var q = strokeAt(type, n / N, L, e);
      A += p[0] * q[1] - q[0] * p[1];
      p = q;
    }
    return A / 2;
  }

  function makeCanvas(host) {
    var c = document.createElement('canvas');
    c.setAttribute('aria-hidden', 'true');
    host.appendChild(c);
    return c;
  }

  function fitCanvas(c, host) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    }
    var ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }

  function initThreeSphere() {
    var stageEl = $('#ts-stage'), shapeEl = $('#ts-shape'), plotEl = $('#ts-plot');
    if (!stageEl || !shapeEl || !plotEl) return;
    var cStage = makeCanvas(stageEl), cShape = makeCanvas(shapeEl), cPlot = makeCanvas(plotEl);
    var readout = $('#ts-readout'), hint = $('#ts-hint'), toggleBtn = $('#ts-toggle');
    var epsIn = $('#ts-eps'), epsOut = $('#ts-eps-out'), alIn = $('#ts-alpha'), alOut = $('#ts-alpha-out');
    var showTracers = $('#ts-tracers'), showArrows = $('#ts-arrows');

    var S = {
      stroke: 'four', L: 10, eps: 6, alpha: 0,
      period: 2.6,                 // seconds per stroke cycle
      t: 0, c: 0, camX: 0,
      hist: [], sol: { f: [0, 0, 0], v: [0, 0, 0], V: 0 },
      paused: reduced, visible: true, last: 0,
      tracers: null
    };
    var NAMES = { four: 'Four-step stroke', smooth: 'Smooth (phase-shifted) stroke', recip: 'Reciprocal stroke' };

    function positions(t) {
      var s = strokeAt(S.stroke, t, S.L, S.eps);
      var x1 = S.c - (2 * s[0] + s[1]) / 3;
      return [x1, x1 + s[0], x1 + s[0] + s[1]];
    }

    function spawnTracer(T, i, view) {
      for (var tries = 0; tries < 12; tries++) {
        var x = view.x0 + Math.random() * (view.x1 - view.x0), y = view.y0 + Math.random() * (view.y1 - view.y0);
        var xs = positions(S.t), ok = true;
        for (var k = 0; k < 3; k++) {
          var dx = x - xs[k];
          if (dx * dx + y * y < 1.6 * 1.6) { ok = false; break; }
        }
        if (ok) { T.x[i] = T.px[i] = x; T.y[i] = T.py[i] = y; T.age[i] = Math.random() * 6; return; }
      }
      T.x[i] = T.px[i] = view.x0; T.y[i] = T.py[i] = view.y1;
    }

    function view(w, h) {
      var s = Math.min(w / (2 * S.L + 6), h / 7.5);
      return { s: s, x0: S.camX - w / 2 / s, x1: S.camX + w / 2 / s, y0: -h / 2 / s, y1: h / 2 / s };
    }

    function reset() {
      S.t = 0; S.c = 0; S.camX = 0; S.hist = [{ t: 0, c: 0 }];
      var p = fitCanvas(cStage, stageEl), v = view(p.w, p.h);
      var n = Math.round(Math.min(520, Math.max(160, p.w * p.h / 900)));
      S.tracers = { n: n, x: new Float32Array(n), y: new Float32Array(n), px: new Float32Array(n), py: new Float32Array(n), age: new Float32Array(n) };
      for (var i = 0; i < n; i++) spawnTracer(S.tracers, i, v);
      solve.apply(null, strokeAt(S.stroke, 0, S.L, S.eps).concat([S.alpha, S.sol]));
      draw();
    }

    function updateReadout() {
      var d = perCycle(S.stroke, S.L, S.eps, S.alpha);
      var d0 = S.alpha > 0 ? perCycle(S.stroke, S.L, S.eps, 0) : d;
      var area = Math.abs(loopArea(S.stroke, S.L, S.eps));
      var html = '<span class="tag">' + NAMES[S.stroke] + '</span><br>';
      if (S.stroke === 'recip') {
        html += 'Net displacement per cycle: <b>0</b>. The loop encloses no area, so every bit of progress is undone (the scallop theorem).';
      } else {
        html += 'Net displacement per cycle: <b>' + fmt(d, 3) + ' a</b><br>' +
          'Area enclosed in shape space: <b>' + area.toFixed(1) + ' a²</b><br>' +
          'Speed relative to a clear fluid: <b>' + Math.round(100 * d / d0) + '%</b>';
      }
      readout.innerHTML = html;
      if (hint) hint.textContent = NAMES[S.stroke];
    }

    function step(dtReal) {
      var dtc = dtReal / S.period, sub = 4, h = dtc / sub, tmp = {};
      for (var k = 0; k < sub; k++) {
        var t = S.t;
        var V = function (tt) { var s = strokeAt(S.stroke, tt, S.L, S.eps); return solve(s[0], s[1], s[2], s[3], S.alpha, tmp).V; };
        var k1 = V(t), k2 = V(t + h / 2), k4 = V(t + h);
        S.c += h * (k1 + 4 * k2 + k4) / 6;
        S.t += h;
      }
      var s = strokeAt(S.stroke, S.t, S.L, S.eps);
      solve(s[0], s[1], s[2], s[3], S.alpha, S.sol);

      // tracers ride the flow in the plane of the axis: the sum of the flows around the three
      // spheres, each translating with its self-induced velocity mu_S f_j
      var T = S.tracers, xs = positions(S.t), f = S.sol.f, al = S.alpha, mS = selfMob(al);
      var p = { w: stageEl.clientWidth, h: stageEl.clientHeight }, vw = view(p.w, p.h), u = { ux: 0, uy: 0 };
      for (var i = 0; i < T.n; i++) {
        var x = T.x[i], y = T.y[i], bad = false;
        u.ux = 0; u.uy = 0;
        for (var j = 0; j < 3; j++) {
          var dx = x - xs[j];
          if (dx * dx + y * y < 1.3 * 1.3) { bad = true; break; }
          sphereFlow(dx, y, mS * f[j], al, u);
        }
        T.age[i] += dtReal;
        if (bad || x < vw.x0 - 1 || x > vw.x1 + 1 || T.age[i] > 14) { spawnTracer(T, i, vw); continue; }
        T.px[i] = x; T.py[i] = y;
        T.x[i] = x + u.ux * dtc; T.y[i] = y + u.uy * dtc;
      }

      // camera follows the center lazily, so the net drift stays visible
      S.camX += (S.c - S.camX) * Math.min(1, dtReal * 0.35);
      S.hist.push({ t: S.t, c: S.c });
      while (S.hist.length && S.hist[0].t < S.t - 8) S.hist.shift();
    }

    function arrow(ctx, x0, y0, x1, y1, color) {
      var dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
      if (L < 2) return;
      var ux = dx / L, uy = dy / L, hl = Math.min(8, L * 0.45);
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - ux * hl * 0.6, y1 - uy * hl * 0.6); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - ux * hl - uy * hl * 0.55, y1 - uy * hl + ux * hl * 0.55);
      ctx.lineTo(x1 - ux * hl + uy * hl * 0.55, y1 - uy * hl - ux * hl * 0.55);
      ctx.closePath(); ctx.fill();
    }

    function drawStage() {
      var P = fitCanvas(cStage, stageEl), ctx = P.ctx, w = P.w, h = P.h, v = view(w, h), s = v.s;
      var X = function (x) { return w / 2 + (x - S.camX) * s; }, Y = function (y) { return h / 2 - y * s; };
      ctx.clearRect(0, 0, w, h);

      // axis and ruler (ticks every a, labels every 2a or 5a, measured from the start)
      ctx.strokeStyle = 'rgba(142, 160, 184, 0.18)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, Y(0)); ctx.lineTo(w, Y(0)); ctx.stroke();
      var yb = h - 26, every = s >= 16 ? 2 : 5;
      ctx.fillStyle = 'rgba(142, 160, 184, 0.75)';
      ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = 'center';
      for (var k = Math.floor(v.x0) - 1; k <= Math.ceil(v.x1) + 1; k++) {
        var xx = X(k), major = k % every === 0;
        ctx.strokeStyle = 'rgba(142, 160, 184, ' + (major ? 0.5 : 0.25) + ')';
        ctx.beginPath(); ctx.moveTo(xx, yb); ctx.lineTo(xx, yb + (major ? 8 : 4)); ctx.stroke();
        if (major) ctx.fillText(k === 0 ? '0' : (k > 0 ? '+' : '−') + Math.abs(k) + 'a', xx, yb + 20);
      }
      // start marker
      ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(94, 234, 212, 0.45)';
      ctx.beginPath(); ctx.moveTo(X(0), 18); ctx.lineTo(X(0), yb - 4); ctx.stroke();
      ctx.setLineDash([]);
      // the status line sits top right; drop the start label below it where they would collide
      var status = 'cycle ' + Math.floor(S.t + 1e-9) + '   center ' + (S.c >= 0 ? '+' : '−') + Math.abs(S.c).toFixed(2) + ' a';
      ctx.font = '500 11px "JetBrains Mono", ui-monospace, monospace';
      var statusLeft = w - 14 - ctx.measureText(status).width - 8;
      ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
      var sx = X(0) + 6, clash = sx < w - 14 && sx + ctx.measureText('start').width > statusLeft;
      ctx.fillStyle = 'rgba(94, 234, 212, 0.8)'; ctx.textAlign = 'left';
      ctx.fillText('start', sx, clash ? 44 : 26);

      // tracers
      if (showTracers.checked && S.tracers) {
        var T = S.tracers;
        ctx.lineCap = 'round'; ctx.lineWidth = 1.6;
        ctx.strokeStyle = 'rgba(94, 234, 212, 0.55)';
        ctx.beginPath();
        for (var i = 0; i < T.n; i++) {
          ctx.moveTo(X(T.px[i]), Y(T.py[i]));
          ctx.lineTo(X(T.x[i]) + 0.3, Y(T.y[i]));
        }
        ctx.stroke();
      }

      // arms and spheres
      var xs = positions(S.t), cy = Y(0);
      ctx.lineCap = 'round';
      for (var a = 0; a < 2; a++) {
        ctx.strokeStyle = 'rgba(200, 212, 228, 0.55)'; ctx.lineWidth = Math.max(2, s * 0.14);
        ctx.beginPath(); ctx.moveTo(X(xs[a]), cy); ctx.lineTo(X(xs[a + 1]), cy); ctx.stroke();
      }
      for (var q = 0; q < 3; q++) {
        var px = X(xs[q]), r = s;
        var g = ctx.createRadialGradient(px - 0.38 * r, cy - 0.42 * r, r * 0.08, px, cy, r * 1.04);
        g.addColorStop(0, '#ffd0d5'); g.addColorStop(0.32, '#ff6175'); g.addColorStop(0.74, '#c4203a'); g.addColorStop(1, '#650918');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(px, cy, r, 0, TAU); ctx.fill();
      }
      // sphere velocities
      if (showArrows.checked) {
        for (var m = 0; m < 3; m++) {
          var vx = S.sol.v[m], len = Math.max(-3.2, Math.min(3.2, vx * 0.1)) * s;
          arrow(ctx, X(xs[m]), cy - 1.8 * s, X(xs[m]) + len, cy - 1.8 * s, '#5eead4');
        }
      }
      // center marker
      var cx = X(S.c);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(cx, cy + 1.35 * s); ctx.lineTo(cx - 5, cy + 1.35 * s + 8); ctx.lineTo(cx + 5, cy + 1.35 * s + 8); ctx.closePath(); ctx.fill();
      // status text
      ctx.fillStyle = 'rgba(230, 236, 245, 0.9)'; ctx.textAlign = 'right';
      ctx.font = '500 11px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillText(status, w - 14, 26);
    }

    function drawShape() {
      var P = fitCanvas(cShape, shapeEl), ctx = P.ctx, w = P.w, h = P.h;
      ctx.clearRect(0, 0, w, h);
      var lo = S.L - S.eps - 0.6, hi = S.L + 0.6, pad = 34;
      var size = Math.min(w - pad - 16, h - pad - 40);
      var ox = pad, oy = 36 + size;
      var X = function (v) { return ox + (v - lo) / (hi - lo) * size; };
      var Y = function (v) { return oy - (v - lo) / (hi - lo) * size; };
      // axes
      ctx.strokeStyle = 'rgba(142, 160, 184, 0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ox, oy - size); ctx.lineTo(ox, oy); ctx.lineTo(ox + size, oy); ctx.stroke();
      ctx.fillStyle = 'rgba(200, 212, 228, 0.85)';
      ctx.font = 'italic 15px Newsreader, Georgia, serif'; ctx.textAlign = 'center';
      ctx.fillText('L₁', ox + size / 2, oy + 24);
      ctx.save(); ctx.translate(ox - 18, oy - size / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('L₂', 0, 0); ctx.restore();
      // loop
      ctx.beginPath();
      for (var n = 0; n <= 240; n++) {
        var q = strokeAt(S.stroke, n / 240, S.L, S.eps);
        if (n === 0) ctx.moveTo(X(q[0]), Y(q[1])); else ctx.lineTo(X(q[0]), Y(q[1]));
      }
      if (S.stroke !== 'recip') { ctx.fillStyle = 'rgba(94, 234, 212, 0.12)'; ctx.fill(); }
      ctx.strokeStyle = 'rgba(94, 234, 212, 0.85)'; ctx.lineWidth = 2; ctx.stroke();
      // direction arrows along the loop
      if (S.stroke !== 'recip') {
        [0.125, 0.375, 0.625, 0.875].forEach(function (tt) {
          var a0 = strokeAt(S.stroke, tt - 0.01, S.L, S.eps), a1 = strokeAt(S.stroke, tt + 0.01, S.L, S.eps);
          arrow(ctx, X(a0[0]), Y(a0[1]), X(a1[0]) + (X(a1[0]) - X(a0[0])) * 2, Y(a1[1]) + (Y(a1[1]) - Y(a0[1])) * 2, 'rgba(94, 234, 212, 0.95)');
        });
      }
      // current state
      var cur = strokeAt(S.stroke, S.t, S.L, S.eps), px = X(cur[0]), py = Y(cur[1]);
      var g = ctx.createRadialGradient(px, py, 0, px, py, 14);
      g.addColorStop(0, 'rgba(255, 90, 106, 0.55)'); g.addColorStop(1, 'rgba(255, 90, 106, 0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 14, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff6175'; ctx.beginPath(); ctx.arc(px, py, 5, 0, TAU); ctx.fill();
    }

    function drawPlot() {
      var P = fitCanvas(cPlot, plotEl), ctx = P.ctx, w = P.w, h = P.h;
      ctx.clearRect(0, 0, w, h);
      var H = S.hist;
      if (H.length < 2) return;
      var t1 = Math.max(S.t, 8), t0 = t1 - 8;
      var cmin = Infinity, cmax = -Infinity;
      for (var i = 0; i < H.length; i++) { cmin = Math.min(cmin, H[i].c); cmax = Math.max(cmax, H[i].c); }
      var mid = (cmin + cmax) / 2, span = Math.max(1, (cmax - cmin) * 1.25);
      var lo = mid - span / 2, hi = mid + span / 2, l = 52, r = 14, top = 30, bot = 22;
      var X = function (t) { return l + (t - t0) / (t1 - t0) * (w - l - r); };
      var Y = function (c) { return h - bot - (c - lo) / (hi - lo) * (h - top - bot); };
      ctx.strokeStyle = 'rgba(142, 160, 184, 0.16)'; ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(142, 160, 184, 0.75)'; ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = 'center';
      for (var k = Math.ceil(t0); k <= t1; k++) {
        ctx.beginPath(); ctx.moveTo(X(k), top - 6); ctx.lineTo(X(k), h - bot); ctx.stroke();
        ctx.fillText(String(k), X(k), h - 6);
      }
      ctx.textAlign = 'right';
      ctx.fillText((hi >= 0 ? '+' : '−') + Math.abs(hi).toFixed(1) + 'a', l - 8, top + 4);
      ctx.fillText((lo >= 0 ? '+' : '−') + Math.abs(lo).toFixed(1) + 'a', l - 8, h - bot);
      ctx.beginPath();
      for (var j = 0; j < H.length; j++) {
        if (j === 0) ctx.moveTo(X(H[j].t), Y(H[j].c)); else ctx.lineTo(X(H[j].t), Y(H[j].c));
      }
      ctx.strokeStyle = '#5eead4'; ctx.lineWidth = 2; ctx.stroke();
      var last = H[H.length - 1];
      ctx.fillStyle = '#ff6175'; ctx.beginPath(); ctx.arc(X(last.t), Y(last.c), 4, 0, TAU); ctx.fill();
    }

    function draw() { drawStage(); drawShape(); drawPlot(); }

    function loop(now) {
      if (S.paused || !S.visible || document.hidden) { S.raf = 0; return; }
      var dt = S.last ? Math.min(0.05, (now - S.last) / 1000) : 1 / 60;
      S.last = now;
      step(dt);
      draw();
      S.raf = requestAnimationFrame(loop);
    }
    function run() {
      if (!S.raf && !S.paused && S.visible && !document.hidden) { S.last = 0; S.raf = requestAnimationFrame(loop); }
      setPlayButton(toggleBtn, S.paused);
    }

    // controls
    $$('[data-stroke]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        S.stroke = btn.getAttribute('data-stroke');
        $$('[data-stroke]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
        reset(); updateReadout(); run();
      });
    });
    var pending = 0;
    function onParams() {
      S.eps = parseFloat(epsIn.value);
      S.alpha = alphaOf(parseFloat(alIn.value));
      epsOut.textContent = S.eps.toFixed(1) + ' a';
      alOut.textContent = 'α a = ' + fmtAlpha(S.alpha);
      alIn.setAttribute('aria-valuetext', 'alpha a = ' + fmtAlpha(S.alpha));
      if (!pending) pending = requestAnimationFrame(function () { pending = 0; updateReadout(); if (S.paused) draw(); });
    }
    epsIn.addEventListener('input', onParams);
    alIn.addEventListener('input', onParams);
    showTracers.addEventListener('change', function () { if (S.paused) draw(); });
    showArrows.addEventListener('change', function () { if (S.paused) draw(); });
    toggleBtn.addEventListener('click', function () { S.paused = !S.paused; run(); });
    $('#ts-reset').addEventListener('click', function () { reset(); run(); });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) { S.visible = entries[0].isIntersecting; run(); }).observe(stageEl);
    }
    document.addEventListener('visibilitychange', run);
    if (window.ResizeObserver) {
      new ResizeObserver(function () { if (!S.raf) draw(); }).observe(stageEl);
    }

    // test hook: /flow-lab/?debug exposes the state so the model can be stepped synchronously
    if (/[?&]debug\b/.test(location.search)) window.__threeSphere = { S: S, step: step, draw: draw };

    onParams();
    reset();
    updateReadout();
    if (reduced) { for (var w = 0; w < 120; w++) step(1 / 60); draw(); }
    run();
  }

  function boot() { initSquirmer(); initThreeSphere(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
