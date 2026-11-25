/*!
 * flow.js: live Stokes flow around a squirmer (hero, Flow Lab, and 404 page).
 *
 * Physics, with lengths in units of the swimmer radius a (Lighthill 1952; Blake 1971).
 * A spherical squirmer with surface slip  u_s = B1 sin(t) + B2 sin(t) cos(t)  swims along e
 * at speed U = 2 B1 / 3. In the lab frame the flow it generates is
 *
 *   u_r     = (2/3) B1 (a/r)^3 cos t + B2 [ (a/r)^4 - (a/r)^2 ] P2(cos t)
 *   u_theta = (1/3) B1 (a/r)^3 sin t + B2 (a/r)^4 sin t cos t,          beta = B2 / B1,
 *
 * with stream function  psi = (B1/3) sin^2 t / r + (B2/2) (1/r^2 - 1) sin^2 t cos t.
 * beta < 0 is a pusher (like E. coli), beta > 0 a puller (like Chlamydomonas).
 * When an external torque turns the swimmer (as a magnetic field turns a microrobot),
 * the rigid rotation adds the rotlet  Omega x r (a/r)^3.  Stokes flow is linear, so the
 * superposition is exact. The flow is axisymmetric about e, so tracers in a plane that
 * contains the axis stay in that plane: the canvas shows that plane.
 */
(function (global) {
  'use strict';

  var TAU = Math.PI * 2;
  // Tracer color buckets, by lab-frame speed |u|/U (log-spaced edges).
  var EDGES = [0.004, 0.009, 0.02, 0.042, 0.09, 0.18, 0.36];
  var COLORS = ['#26354d', '#2b4c74', '#2e6c9c', '#2f8fbb', '#38b3cf', '#5ad3d6', '#a3f2e4', '#ffffff'];
  var NB = COLORS.length;
  // Trails: K past positions per tracer, sampled every SAMPLE_DT seconds, drawn in fading bands.
  var K = 30, SAMPLE_DT = 0.1, NBAND = 5;
  var BAND_ALPHA = [1, 0.72, 0.46, 0.26, 0.11];

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function wrapPi(x) {
    x = (x + Math.PI) % TAU;
    if (x < 0) x += TAU;
    return x - Math.PI;
  }
  function bucketOf(s) {
    var b = 0;
    while (b < NB - 1 && s > EDGES[b]) b++;
    return b;
  }

  // Speed-map colormap: night -> deep blue -> teal -> cyan -> near white.
  var LUT = (function () {
    var stops = [
      [0.0, [6, 11, 20]], [0.28, [14, 38, 72]], [0.55, [18, 112, 136]],
      [0.8, [94, 234, 212]], [1.0, [240, 255, 251]]
    ];
    var lut = new Uint8ClampedArray(256 * 3);
    for (var i = 0; i < 256; i++) {
      var t = i / 255, k = 0;
      while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
      var a = stops[k], b = stops[k + 1], f = (t - a[0]) / (b[0] - a[0]);
      for (var c = 0; c < 3; c++) lut[i * 3 + c] = a[1][c] + (b[1][c] - a[1][c]) * f;
    }
    return lut;
  })();

  function SquirmerFlow(stage, options) {
    var o = this.o = Object.assign({
      beta: -3,            // B2 / B1
      radius: 0,           // swimmer radius in CSS px (0 = derive from stage size)
      speed: 2.8,          // swimming speed U in radii per second
      density: 1 / 520,    // tracers per CSS px^2
      minParticles: 260,
      maxParticles: 4200,
      lineWidth: 1.35,
      glow: 1,             // trail brightness multiplier
      frame: 'lab',        // 'lab' or 'swimmer' (comoving)
      steer: true,         // autopilot wander plus pointer steering (lab frame)
      pointerEl: null,     // element whose pointer movements steer the swimmer
      roam: null,          // function (W, H) -> {x0, y0, x1, y1}: autopilot region
      tracers: true,
      streamlines: false,
      speedMap: false,
      markers: true,
      dprCap: 1.75,
      onState: null,       // callback({paused})
      onFrame: null        // callback(flow) after each rendered frame
    }, options || {});

    this.stage = stage;
    this.reduced = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.cHeat = this._makeCanvas('flow-heat');
    this.cTrail = this._makeCanvas('flow-trails');
    this.cTop = this._makeCanvas('flow-overlay');
    this.ctxH = this.cHeat.getContext('2d');
    this.ctxT = this.cTrail.getContext('2d');
    this.ctxO = this.cTop.getContext('2d');
    this.cHeat.style.display = o.speedMap ? '' : 'none';

    this.t = 0;
    this.phi = -0.35;
    this.omega = 0;
    this.pointer = null;
    this.sampleAcc = 0;
    this.hi = 0;
    this.running = false;
    this.userPaused = false;
    this.visible = true;
    this.ux = 0; this.uy = 0;
    this._loopBound = this._loop.bind(this);

    this._initMarkers(18);
    this.setBeta(o.beta, true);
    this._resize(true);
    this._bind();

    // Start with a little history so the first frame already shows the flow.
    this._warm(this.reduced ? 200 : 40);
    if (this.reduced) this.userPaused = true;
    this._updateRun();
  }

  var P = SquirmerFlow.prototype;

  // ---------------------------------------------------------------- setup
  P._makeCanvas = function (cls) {
    var c = this.stage.querySelector('canvas.' + cls);
    if (!c) {
      c = document.createElement('canvas');
      c.className = cls;
      c.setAttribute('aria-hidden', 'true');
      this.stage.appendChild(c);
    }
    return c;
  };

  P._bind = function () {
    var self = this;
    if (global.ResizeObserver) {
      this.ro = new ResizeObserver(function () { self._resize(false); });
      this.ro.observe(this.stage);
    } else {
      global.addEventListener('resize', function () { self._resize(false); });
    }
    if (global.IntersectionObserver) {
      this.io = new IntersectionObserver(function (entries) {
        self.visible = entries[0].isIntersecting;
        self._updateRun();
      });
      this.io.observe(this.stage);
    }
    this._onVis = function () { self._updateRun(); };
    document.addEventListener('visibilitychange', this._onVis);

    var el = this.o.pointerEl || this.stage;
    var setPointer = function (e) {
      var r = self.stage.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      if (x < 0 || y < 0 || x > r.width || y > r.height) return;
      self.pointer = { x: x, y: y, t: performance.now() };
    };
    el.addEventListener('pointermove', setPointer, { passive: true });
    el.addEventListener('pointerdown', setPointer, { passive: true });
    el.addEventListener('pointerleave', function () { self.pointer = null; }, { passive: true });
  };

  P._resize = function (first) {
    var W = Math.max(1, this.stage.clientWidth), H = Math.max(1, this.stage.clientHeight);
    if (!first && W === this.W && H === this.H) return;
    var oldW = this.W, oldH = this.H;
    this.W = W; this.H = H;
    this.dpr = Math.min(global.devicePixelRatio || 1, this.o.dprCap);
    var cs = [this.cTrail, this.cTop];
    for (var i = 0; i < cs.length; i++) {
      cs[i].width = Math.round(W * this.dpr);
      cs[i].height = Math.round(H * this.dpr);
    }
    this.ctxT.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctxO.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.a = this.o.radius || clamp(Math.min(W, H) * 0.03, 12, 27);
    this._setSpeed();

    if (first || this.o.frame === 'swimmer' || !oldW) {
      this._placeSwimmer();
    } else {
      // keep the swimmer at the same relative position
      this.sx = this.sx / oldW * W;
      this.sy = this.sy / oldH * H;
    }

    var n = Math.round(clamp(W * H * this.o.density, this.o.minParticles, this.o.maxParticles));
    if (!this.n || Math.abs(n - this.n) / this.n > 0.12 || first) this._alloc(n);
    else {
      for (var k = 0; k < this.n; k++) {
        if (this.X[k] > W || this.Y[k] > H) this._spawn(k, true);
      }
    }
    this.slPath = null;
    this.heatDirty = true;
    this.ctxT.clearRect(0, 0, W, H);
    if (!first && !this.running) this._render(0);
  };

  P._setSpeed = function () {
    this.U = this.o.speed * this.a;     // CSS px per second
    this.B1 = 1.5 * this.U;
    this.B2 = this.beta * this.B1;
  };

  P._roamRect = function () {
    var W = this.W, H = this.H;
    if (this.o.roam) return this.o.roam(W, H);
    var m = Math.min(W, H) * 0.08;
    return { x0: m, y0: m, x1: W - m, y1: H - m };
  };

  P._placeSwimmer = function () {
    if (this.o.frame === 'swimmer') {
      this.sx = this.W * 0.5; this.sy = this.H * 0.5; this.phi = 0;
    } else {
      var R = this._roamRect();
      this.sx = (R.x0 + R.x1) / 2; this.sy = (R.y0 + R.y1) / 2;
    }
    this.omega = 0;
  };

  P._alloc = function (n) {
    this.n = n;
    this.X = new Float32Array(n); this.Y = new Float32Array(n);
    this.PX = new Float32Array(n); this.PY = new Float32Array(n);
    this.AGE = new Float32Array(n); this.LIFE = new Float32Array(n);
    this.BK = new Uint8Array(n);
    this.ACT = new Float32Array(n);                // recent peak speed, sets trail color
    this.HX = new Float32Array(n * K); this.HY = new Float32Array(n * K);
    this.HV = new Uint8Array(n);                   // number of valid history samples
    for (var i = 0; i < n; i++) {
      this._spawn(i, true);
      this.AGE[i] = Math.random() * this.LIFE[i];   // desynchronize respawns
    }
  };

  P._spawn = function (i, anywhere) {
    var W = this.W, H = this.H, x, y;
    if (!anywhere && this.o.frame === 'swimmer') {
      x = W + 2 + Math.random() * 6;   // upstream edge (swimmer faces +x)
      y = Math.random() * H;
    } else {
      x = Math.random() * W;
      y = Math.random() * H;
    }
    var dx = x - this.sx, dy = y - this.sy, rr = 1.3 * this.a;
    if (dx * dx + dy * dy < rr * rr) { x = (x + W * 0.5) % W; }
    this.X[i] = this.PX[i] = x;
    this.Y[i] = this.PY[i] = y;
    this.AGE[i] = 0;
    this.LIFE[i] = 7 + Math.random() * 14;
    this.BK[i] = 0;
    this.ACT[i] = 0;
    this.HV[i] = 0;
  };

  P._initMarkers = function (perSide) {
    var n = perSide * 2;
    this.MT = new Float32Array(n);   // polar angle from the swimming direction
    this.MS = new Int8Array(n);      // side (+1 / -1)
    this.MA = new Float32Array(n);   // age, for fade-in
    for (var i = 0; i < n; i++) {
      this.MS[i] = i < perSide ? 1 : -1;
      this.MT[i] = 0.15 + Math.random() * (Math.PI - 0.3);
      this.MA[i] = 1;
    }
  };

  // ---------------------------------------------------------------- physics
  // Lab-frame velocity at (x, y) for a swimmer at (sx, sy) heading (ex, ey), rotating at omega.
  P._vel = function (x, y, sx, sy, ex, ey, omega) {
    var a = this.a, dx = x - sx, dy = y - sy;
    var r = Math.sqrt(dx * dx + dy * dy);
    if (r < a) { var s = a / (r || 1e-6); dx *= s; dy *= s; r = a; }
    var inv = 1 / r, rx = dx * inv, ry = dy * inv;
    var q = a * inv, q2 = q * q, q3 = q2 * q, q4 = q2 * q2;
    var c = rx * ex + ry * ey;
    var P2 = 1.5 * c * c - 0.5;
    var B1 = this.B1, B2 = this.B2;
    var ur = 0.6666666667 * B1 * c * q3 + B2 * (q4 - q2) * P2;
    var g = 0.3333333333 * B1 * q3 + B2 * c * q4;          // u_theta / sin(theta)
    var k = ur + g * c;
    var ux = k * rx - g * ex, uy = k * ry - g * ey;
    if (omega) { var w = omega * q3; ux -= w * dy; uy += w * dx; }   // rotlet
    this.ux = ux; this.uy = uy;
  };

  P._steer = function (dt) {
    var a = this.a, desired = null, gain = 1;
    var now = performance.now();
    if (this.pointer && now - this.pointer.t < 4500) {
      var dx = this.pointer.x - this.sx, dy = this.pointer.y - this.sy;
      if (dx * dx + dy * dy > 6.25 * a * a) { desired = Math.atan2(dy, dx); gain = 2.4; }
      else { desired = this.phi + 0.7; gain = 1.2; }   // circle the cursor when close
    }
    if (desired === null) {
      var R = this._roamRect(), m = 2.2 * a + 24;
      var outside = this.sx < R.x0 + m || this.sx > R.x1 - m || this.sy < R.y0 + m || this.sy > R.y1 - m;
      if (outside) {
        desired = Math.atan2((R.y0 + R.y1) / 2 - this.sy, (R.x0 + R.x1) / 2 - this.sx);
        gain = 1.7;
      } else {
        var t = this.t;
        desired = this.phi + 0.55 * Math.sin(0.29 * t) + 0.35 * Math.sin(0.61 * t + 1.3) + 0.15 * Math.sin(1.13 * t + 0.4);
      }
    }
    var target = clamp(gain * wrapPi(desired - this.phi), -1.3, 1.3);
    this.omega += (target - this.omega) * Math.min(1, dt * 3);
  };

  P._step = function (dt) {
    var o = this.o, lab = o.frame === 'lab', U = this.U, a = this.a;
    if (lab && o.steer) this._steer(dt); else this.omega = 0;

    var om = this.omega;
    var phi0 = this.phi, ex0 = Math.cos(phi0), ey0 = Math.sin(phi0);
    var phiM = phi0 + 0.5 * dt * om, exM = Math.cos(phiM), eyM = Math.sin(phiM);
    var sx0 = this.sx, sy0 = this.sy;
    var sxM = lab ? sx0 + 0.5 * dt * U * ex0 : sx0, syM = lab ? sy0 + 0.5 * dt * U * ey0 : sy0;
    var sxN = lab ? sx0 + dt * U * exM : sx0, syN = lab ? sy0 + dt * U * eyM : sy0;

    var n = this.n, X = this.X, Y = this.Y, PX = this.PX, PY = this.PY;
    var AGE = this.AGE, LIFE = this.LIFE, BK = this.BK, ACT = this.ACT;
    var W = this.W, H = this.H, pad = 30, rIn = 1.04 * a, rIn2 = rIn * rIn, invU = 1 / U;
    var decay = Math.exp(-dt / 2.0);

    for (var i = 0; i < n; i++) {
      var x = X[i], y = Y[i];
      this._vel(x, y, sx0, sy0, ex0, ey0, om);
      var k1x = this.ux, k1y = this.uy;
      if (!lab) { k1x -= U * ex0; k1y -= U * ey0; }
      this._vel(x + 0.5 * dt * k1x, y + 0.5 * dt * k1y, sxM, syM, exM, eyM, om);
      var k2x = this.ux, k2y = this.uy;
      var s = Math.sqrt(k2x * k2x + k2y * k2y) * invU;      // lab-frame speed / U
      if (!lab) { k2x -= U * exM; k2y -= U * eyM; }

      PX[i] = x; PY[i] = y;
      x += dt * k2x; y += dt * k2y;
      AGE[i] += dt;

      if (AGE[i] > LIFE[i]) { this._spawn(i, true); continue; }
      if (x < -pad || x > W + pad || y < -pad || y > H + pad) { this._spawn(i, false); continue; }
      var dx = x - sxN, dy = y - syN, d2 = dx * dx + dy * dy;
      if (d2 < rIn2) {   // numerical guard: the exact flow never enters the swimmer
        var f = rIn / Math.sqrt(d2 || 1e-6);
        x = sxN + dx * f; y = syN + dy * f;
        PX[i] = x; PY[i] = y;
      }
      X[i] = x; Y[i] = y;
      BK[i] = bucketOf(s);
      var act = ACT[i] * decay;
      ACT[i] = s > act ? s : act;
    }

    // record trail history for every tracer at a fixed cadence
    this.sampleAcc += dt;
    if (this.sampleAcc >= SAMPLE_DT) {
      this.sampleAcc -= SAMPLE_DT;
      if (this.sampleAcc > SAMPLE_DT) this.sampleAcc = 0;
      var HX = this.HX, HY = this.HY, HV = this.HV, slot = this.hi;
      for (var h = 0; h < n; h++) {
        HX[h * K + slot] = X[h]; HY[h * K + slot] = Y[h];
        if (HV[h] < K) HV[h]++;
      }
      this.hi = (slot + 1) % K;
    }

    // surface markers ride the slip velocity u_s = B1 sin t (1 + beta cos t), relative to the body
    if (o.markers) {
      var MT = this.MT, MA = this.MA, B1 = this.B1, beta = this.beta;
      for (var m = 0; m < MT.length; m++) {
        var th = MT[m];
        th += dt * B1 * Math.sin(th) * (1 + beta * Math.cos(th)) / a;
        MA[m] += dt;
        if (th < 0.12 || th > Math.PI - 0.12) { th = 0.2 + Math.random() * (Math.PI - 0.4); MA[m] = 0; }
        MT[m] = th;
      }
    }

    if (lab) {
      this.sx = sxN; this.sy = syN;
      this.phi = wrapPi(phi0 + dt * om);
    }
    this.t += dt;
  };

  // ---------------------------------------------------------------- drawing
  P._render = function (dt) {
    var o = this.o;
    if (o.speedMap) this._drawSpeedMap();
    if (o.tracers) this._drawTracers(dt);
    this._drawOverlay();
    if (o.onFrame) o.onFrame(this);
  };

  // Trails are redrawn from each tracer's recent history every frame (nothing accumulates on
  // the canvas, so there are no ghost residues), additively, so dense bright trails glow.
  P._drawTracers = function () {
    var c = this.ctxT, W = this.W, H = this.H;
    c.clearRect(0, 0, W, H);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.lineWidth = this.o.lineWidth;

    var n = this.n, X = this.X, Y = this.Y, HX = this.HX, HY = this.HY, HV = this.HV;
    var ACT = this.ACT, BK = this.BK, hi = this.hi, per = K / NBAND;
    var swimmerFrame = this.o.frame === 'swimmer';   // everything streams past: trail every tracer
    var paths = [], band, b, i, k;
    for (band = 0; band < NBAND; band++) paths.push(new Array(NB));

    for (i = 0; i < n; i++) {
      var hv = HV[i];
      if (!hv) continue;
      b = bucketOf(ACT[i]);
      if (swimmerFrame) { if (b < 1) b = 1; }
      else if (b < 1) continue;
      var base = i * K, oldest = (hi - hv + K) % K;
      var ddx = X[i] - HX[base + oldest], ddy = Y[i] - HY[base + oldest];
      if (ddx * ddx + ddy * ddy < 0.8) continue;      // has not really moved
      var px = X[i], py = Y[i];
      for (k = 0; k < hv; k++) {
        var slot = (hi - 1 - k + 2 * K) % K;
        var qx = HX[base + slot], qy = HY[base + slot];
        band = (k / per) | 0;
        var p = paths[band][b] || (paths[band][b] = new Path2D());
        p.moveTo(px, py); p.lineTo(qx, qy);
        px = qx; py = qy;
      }
    }

    c.globalCompositeOperation = 'lighter';
    for (band = NBAND - 1; band >= 0; band--) {
      c.globalAlpha = BAND_ALPHA[band] * this.o.glow;
      for (b = 0; b < NB; b++) {
        if (paths[band][b]) { c.strokeStyle = COLORS[b]; c.stroke(paths[band][b]); }
      }
    }
    c.globalAlpha = 1;

    // tracer heads, colored by their current speed
    c.lineWidth = this.o.lineWidth + 0.35;
    for (b = 0; b < NB; b++) {
      c.beginPath();
      var any = false;
      for (i = 0; i < n; i++) {
        if (BK[i] !== b) continue;
        c.moveTo(X[i], Y[i]); c.lineTo(X[i] + 0.3, Y[i]);
        any = true;
      }
      if (any) { c.strokeStyle = COLORS[b]; c.stroke(); }
    }
    c.globalCompositeOperation = 'source-over';
  };

  P._drawOverlay = function () {
    var c = this.ctxO;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.W, this.H);
    if (this.o.streamlines) this._drawStreamlines(c);
    this._drawSwimmer(c);
  };

  P._drawSwimmer = function (c) {
    var a = this.a, x = this.sx, y = this.sy, phi = this.phi;
    var g = c.createRadialGradient(x, y, a * 0.5, x, y, a * 3.4);
    g.addColorStop(0, 'rgba(255, 90, 106, 0.30)');
    g.addColorStop(1, 'rgba(255, 90, 106, 0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, a * 3.4, 0, TAU); c.fill();

    g = c.createRadialGradient(x - 0.38 * a, y - 0.42 * a, a * 0.08, x, y, a * 1.04);
    g.addColorStop(0, '#ffd0d5');
    g.addColorStop(0.32, '#ff6175');
    g.addColorStop(0.74, '#c4203a');
    g.addColorStop(1, '#650918');
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, a, 0, TAU); c.fill();

    if (this.o.markers) {
      var MT = this.MT, MS = this.MS, MA = this.MA, rr = 0.84 * a;
      c.fillStyle = '#fff5f6';
      for (var m = 0; m < MT.length; m++) {
        var ang = phi + MS[m] * MT[m];
        c.globalAlpha = 0.8 * Math.min(1, MA[m] / 0.5) * (0.45 + 0.55 * Math.sin(MT[m]));
        c.beginPath();
        c.arc(x + rr * Math.cos(ang), y + rr * Math.sin(ang), Math.max(0.9, a * 0.065), 0, TAU);
        c.fill();
      }
      c.globalAlpha = 1;
    }
    // a soft highlight on the leading edge shows which way it swims
    c.strokeStyle = 'rgba(255, 230, 233, 0.55)';
    c.lineWidth = Math.max(1, a * 0.08);
    c.beginPath(); c.arc(x, y, a * 1.0, phi - 0.55, phi + 0.55); c.stroke();
  };

  // Streamlines: contours of the Stokes stream function on a polar (log r, theta) grid in body
  // coordinates, so they stay sharp next to the swimmer and are built once per parameter change.
  P._buildStreamlines = function () {
    var swim = this.o.frame === 'swimmer';
    var B1 = 1.5, B2 = this.beta * B1;                   // normalized so that U = 1, a = 1
    var Rmax = Math.max(24, Math.hypot(this.W, this.H) / this.a * 1.1);
    var NR = 170, NT = 140, lr1 = Math.log(Rmax);
    var psi = new Float64Array(NR * NT), rs = new Float64Array(NR), ths = new Float64Array(NT);
    for (var i = 0; i < NR; i++) rs[i] = Math.exp(lr1 * i / (NR - 1));
    for (var j = 0; j < NT; j++) ths[j] = Math.PI * j / (NT - 1);
    for (i = 0; i < NR; i++) {
      var r = rs[i];
      for (j = 0; j < NT; j++) {
        var s = Math.sin(ths[j]), co = Math.cos(ths[j]), s2 = s * s;
        var v = (B1 / 3) * s2 / r + 0.5 * B2 * (1 / (r * r) - 1) * s2 * co;
        if (swim) v -= 0.5 * r * r * s2;
        psi[i * NT + j] = v;
      }
    }
    var levels = [];
    if (swim) {
      var dy = 26 / this.a;                              // ~26 px between far-field streamlines
      for (var k = 1; k * dy < Rmax; k++) levels.push(-0.5 * (k * dy) * (k * dy));
      levels.push(-0.06, -0.2, 0.02, 0.08, 0.2);
    } else if (Math.abs(this.beta) < 0.25) {
      // neutral: closed source-dipole loops psi = (B1/3) sin^2 t / r, nested geometrically
      for (var q = 0; q < 12; q++) levels.push(0.5 * Math.pow(0.6, q));
    } else {
      // force dipole: far away psi -> -(B2/2) sin^2 t cos t, so streamlines become radial lines.
      // Pick levels at evenly spaced far-field angles (up to the extremum at atan(sqrt 2))
      // so the rays fan out evenly instead of bunching around the zero lines.
      var amp = 0.5 * Math.abs(B2), tmax = Math.atan(Math.SQRT2);
      for (var kk = 1; kk <= 5; kk++) {
        var th = tmax * kk / 5.5, L0 = amp * Math.sin(th) * Math.sin(th) * Math.cos(th);
        levels.push(L0, -L0);
      }
    }
    var path = new Path2D();
    for (var li = 0; li < levels.length; li++) this._contour(psi, rs, ths, NR, NT, levels[li], path);
    this.slPath = path;
    this.slKey = this.beta + '|' + this.o.frame + '|' + this.W + 'x' + this.H;
  };

  P._contour = function (F, rs, ths, NR, NT, L, path) {
    function seg(r1, t1, r2, t2) {
      var x1 = r1 * Math.cos(t1), y1 = r1 * Math.sin(t1), x2 = r2 * Math.cos(t2), y2 = r2 * Math.sin(t2);
      path.moveTo(x1, y1); path.lineTo(x2, y2);
      path.moveTo(x1, -y1); path.lineTo(x2, -y2);
    }
    for (var i = 0; i < NR - 1; i++) {
      for (var j = 0; j < NT - 1; j++) {
        var v0 = F[i * NT + j] - L, v1 = F[(i + 1) * NT + j] - L;
        var v2 = F[(i + 1) * NT + j + 1] - L, v3 = F[i * NT + j + 1] - L;
        var idx = (v0 > 0 ? 1 : 0) | (v1 > 0 ? 2 : 0) | (v2 > 0 ? 4 : 0) | (v3 > 0 ? 8 : 0);
        if (idx === 0 || idx === 15) continue;
        var r0 = rs[i], r1 = rs[i + 1], t0 = ths[j], t1 = ths[j + 1];
        // edge crossing points, linear in (r, theta)
        var e = [];
        if ((v0 > 0) !== (v1 > 0)) { var f = v0 / (v0 - v1); e.push([r0 + f * (r1 - r0), t0]); }
        if ((v1 > 0) !== (v2 > 0)) { f = v1 / (v1 - v2); e.push([r1, t0 + f * (t1 - t0)]); }
        if ((v2 > 0) !== (v3 > 0)) { f = v2 / (v2 - v3); e.push([r1 + f * (r0 - r1), t1]); }
        if ((v3 > 0) !== (v0 > 0)) { f = v3 / (v3 - v0); e.push([r0, t1 + f * (t0 - t1)]); }
        if (e.length === 2) seg(e[0][0], e[0][1], e[1][0], e[1][1]);
        else if (e.length === 4) { seg(e[0][0], e[0][1], e[1][0], e[1][1]); seg(e[2][0], e[2][1], e[3][0], e[3][1]); }
      }
    }
  };

  P._drawStreamlines = function (c) {
    var key = this.beta + '|' + this.o.frame + '|' + this.W + 'x' + this.H;
    if (!this.slPath || this.slKey !== key) this._buildStreamlines();
    var a = this.a, d = this.dpr, cs = Math.cos(this.phi), sn = Math.sin(this.phi);
    c.save();
    c.setTransform(d * a * cs, d * a * sn, -d * a * sn, d * a * cs, d * this.sx, d * this.sy);
    c.lineWidth = 1.1 / a;
    c.strokeStyle = 'rgba(255, 214, 102, 0.55)';
    c.stroke(this.slPath);
    c.restore();
  };

  P._drawSpeedMap = function () {
    if (!this.heatDirty && this.o.frame === 'swimmer') return;
    var cell = 5, w = Math.ceil(this.W / cell), h = Math.ceil(this.H / cell);
    if (!this.heatImg || this.heatImg.width !== w || this.heatImg.height !== h) {
      // a coarse canvas, upscaled smoothly by the browser
      this.cHeat.width = w; this.cHeat.height = h;
      this.heatImg = this.ctxH.createImageData(w, h);
    }
    var data = this.heatImg.data, ex = Math.cos(this.phi), ey = Math.sin(this.phi), invU = 1 / this.U;
    for (var j = 0; j < h; j++) {
      for (var i = 0; i < w; i++) {
        this._vel((i + 0.5) * cell, (j + 0.5) * cell, this.sx, this.sy, ex, ey, this.omega);
        var s = Math.sqrt(this.ux * this.ux + this.uy * this.uy) * invU;
        var t = clamp((Math.log(s + 1e-9) / Math.LN10 + 2.4) / 2.5, 0, 1);
        var li = (t * 255) | 0, p = (j * w + i) * 4;
        data[p] = LUT[li * 3]; data[p + 1] = LUT[li * 3 + 1]; data[p + 2] = LUT[li * 3 + 2]; data[p + 3] = 255;
      }
    }
    this.ctxH.putImageData(this.heatImg, 0, 0);
    this.heatDirty = false;
  };

  // ---------------------------------------------------------------- loop & API
  P._warm = function (frames) {
    for (var f = 0; f < frames; f++) { this._step(1 / 60); this._render(1 / 60); }
  };

  P._loop = function (now) {
    if (!this.running) return;
    var dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 1 / 60;
    this.last = now;
    if (dt > 0.034) { this._step(dt / 2); this._step(dt / 2); } else this._step(dt);
    this._render(dt);
    this.raf = requestAnimationFrame(this._loopBound);
  };

  P._updateRun = function () {
    var should = this.visible && !document.hidden && !this.userPaused;
    if (should && !this.running) {
      this.running = true; this.last = 0;
      this.raf = requestAnimationFrame(this._loopBound);
    } else if (!should && this.running) {
      this.running = false;
      cancelAnimationFrame(this.raf);
    }
    if (this.o.onState) this.o.onState({ paused: this.userPaused });
  };

  P.play = function () { this.userPaused = false; this._updateRun(); };
  P.pause = function () { this.userPaused = true; this._updateRun(); };
  P.toggle = function () { if (this.userPaused) this.play(); else this.pause(); };
  Object.defineProperty(P, 'paused', { get: function () { return this.userPaused; } });

  P.setBeta = function (beta, silent) {
    this.beta = +beta;
    if (this.a) this._setSpeed();
    this.slPath = null;
    this.heatDirty = true;
    if (!silent && !this.running) this._render(0);
  };

  P.setFrame = function (frame) {
    if (frame === this.o.frame) return;
    this.o.frame = frame;
    this._placeSwimmer();
    for (var i = 0; i < this.n; i++) this._spawn(i, true);
    this.ctxT.clearRect(0, 0, this.W, this.H);
    this.slPath = null; this.heatDirty = true;
    if (!this.running) this._render(0);
  };

  P.setLayers = function (layers) {
    var o = this.o;
    if ('tracers' in layers) { o.tracers = !!layers.tracers; if (!o.tracers) this.ctxT.clearRect(0, 0, this.W, this.H); }
    if ('streamlines' in layers) o.streamlines = !!layers.streamlines;
    if ('speedMap' in layers) {
      o.speedMap = !!layers.speedMap;
      this.cHeat.style.display = o.speedMap ? '' : 'none';
      this.heatDirty = true;
    }
    if (!this.running) this._render(0);
  };

  P.reset = function () {
    this._placeSwimmer();
    this.phi = this.o.frame === 'swimmer' ? 0 : -0.35;
    this.t = 0;
    for (var i = 0; i < this.n; i++) this._spawn(i, true);
    this.ctxT.clearRect(0, 0, this.W, this.H);
    this.heatDirty = true;
    this._warm(20);
  };

  P.destroy = function () {
    this.pause();
    if (this.ro) this.ro.disconnect();
    if (this.io) this.io.disconnect();
    document.removeEventListener('visibilitychange', this._onVis);
  };

  global.SquirmerFlow = SquirmerFlow;
})(window);
