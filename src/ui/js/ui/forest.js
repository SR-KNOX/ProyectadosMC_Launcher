/* Bosque oscuro estilo Minecraft: pixel-art generado por código (arte original y provisional).

   Escena: noche azul, luna cuadrada, camino en perspectiva hacia un resplandor verde azulado,
   árboles de bloques por capas (roble oscuro y abeto), un jefe encapuchado con guadaña caminando
   de espaldas hacia el bosque, niebla que se desplaza, luciérnagas y hongos luminosos.

   Toda la animación es un BUCLE PERFECTO de LOOP_STEPS pasos (24 s): al terminar vuelve exactamente
   al inicio, sin saltos. Altura lógica fija (180); el ancho sale de la proporción del dispositivo.
   El mismo archivo sirve para el launcher y para la versión independiente del diseño. */

const H = 180;
const LOOP_STEPS = 240;   // pasos por vuelta
const STEP_MS = 100;      // 10 pasos/s -> vuelta de 24 s
const MIN_W = 96, MAX_W = 480;
const TAU = Math.PI * 2;

/* ---------- utilidades ---------- */
const clamp = (v, a = 0, b = 255) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgb = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const makeRng = seed => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

function hash2(i, j, s = 0) {
  let h = Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(s | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* Ruido periódico: se repite cada `size` celdas (sirve para niebla que se desplaza sin costuras) */
function makeNoise(rnd, size) {
  const g = Array.from({ length: size * size }, () => rnd());
  const at = (x, y) => g[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  const sm = t => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return (a + (b - a) * xf) * (1 - yf) + (c + (d - c) * xf) * yf;
  };
}

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  return [c, x];
}
const fillC = (x, col, X, Y, w, h) => { x.fillStyle = typeof col === 'string' ? col : rgb(col); x.fillRect(X, Y, w, h); };

/* ---------- composición según el formato ---------- */
function widthFor(w, h) {
  return Math.max(MIN_W, Math.min(MAX_W, Math.round(H * w / Math.max(1, h))));
}

function layoutFor(W) {
  const portrait = W < H * 1.1;
  const yh = Math.round(H * (portrait ? .5 : .6));              // línea del horizonte
  const narrow = !portrait && W < 290;                            // 4:3: el jefe se corre a la derecha
  const vx = Math.round(W * (portrait ? .5 : narrow ? .7 : .62)); // punto de fuga del camino
  const L = {
    W, portrait, yh, vx,
    cb: Math.round(W * (narrow ? .62 : .5)),                                     // centro del camino abajo
    hwb: Math.round(W * (portrait ? .5 : .3)),                  // medio ancho del camino abajo
    bossY: Math.round(H * (portrait ? .7 : .88)),
    bossScale: portrait ? .7 : 1,                               // el jefe se dibuja más pequeño en vertical
  };
  L.bossX = Math.round(pathCenter(L, L.bossY));
  // Esfera luminosa detrás del jefe (como en la referencia)
  L.orb = portrait ? { x: Math.round(W * .5), y: yh - 26, R: 34 } : { x: L.bossX + 20, y: yh - 36, R: 54 };
  return L;
}
const pathT = (L, y) => (y - L.yh) / (H - L.yh);
const pathCenter = (L, y) => {
  const t = pathT(L, y);
  return L.vx + (L.cb - L.vx) * t + Math.sin(t * 3.4) * L.W * (L.portrait ? .012 : .02);
};
const pathHalf = (L, y) => 2 + (L.hwb - 2) * pathT(L, y);

/* ---------- cielo, luna y estrellas ---------- */
function paintSky(L) {
  const W = L.W, [c, x] = canvasOf(W, H);
  const img = x.createImageData(W, H), d = img.data;
  const top = hex('#030812'), mid = hex('#091a36'), low = hex('#0b3a50');
  const gx = L.vx, gy = L.yh - 8, gr = Math.max(70, W * .3);

  for (let y = 0; y < H; y++) {
    const t = Math.min(1, y / L.yh), q = Math.floor(t * 16) / 16;
    const base = q < .6 ? mix(top, mid, q / .6) : mix(mid, low, (q - .6) / .4);
    for (let xx = 0; xx < W; xx++) {
      let r = base[0], g = base[1], b = base[2];
      const dd = Math.hypot((xx - gx) * .75, (y - gy) * 1.4) / gr;          // resplandor al final del camino
      if (dd < 1) { const a = Math.floor((1 - dd) * (1 - dd) * 8) / 8; r += a * 26; g += a * 112; b += a * 108; }
      const i = (y * W + xx) * 4;
      d[i] = clamp(r); d[i + 1] = clamp(g); d[i + 2] = clamp(b); d[i + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);

  // Estrellas (algunas titilan)
  const rnd = makeRng(5), twinkle = [];
  for (let i = 0; i < 46; i++) {
    const sx = (rnd() * W) | 0, sy = (rnd() * L.yh * .62) | 0;
    if (Math.hypot(sx - L.orb.x, sy - L.orb.y) < L.orb.R + 3) continue;
    if (i % 3 === 0) twinkle.push({ x: sx, y: sy, ph: rnd() * TAU, k: [2, 3, 4, 6][(rnd() * 4) | 0] });
    else fillC(x, i % 5 === 0 ? '#9fdcf0' : '#4f7fa6', sx, sy, 1, 1);
  }

  // Luna roja: halo escalonado, disco con relieve y cráteres, borde brillante
  const { x: ox, y: oy, R } = L.orb;
  const disc = (cx, cy, r, col) => {
    x.fillStyle = col;
    for (let dy = -r; dy <= r; dy++) { const hw = Math.round(Math.sqrt(r * r - dy * dy)); x.fillRect(cx - hw, cy + dy, 2 * hw + 1, 1); }
  };
  for (let r = R + 44; r > R; r -= 4) disc(ox, oy, r, 'rgba(210,40,40,.05)');
  const nz = makeNoise(makeRng(9), 64), nz2 = makeNoise(makeRng(31), 64);
  for (let y = oy - R; y <= oy + R; y++) {
    for (let xx = ox - R; xx <= ox + R; xx++) {
      const dx = xx - ox, dy = y - oy, dist = Math.hypot(dx, dy);
      if (dist > R) continue;
      const k = dist / R, n = nz(xx / 5, y / 5), m = nz2(xx / 11, y / 11), rim = Math.pow(k, 5), sh = clamp(.55 + (-dx - dy * .4) / R * .35, 0, 1);
      const v = Math.floor((.55 + n * .25 + m * .35) * sh * 6) / 6;
      fillC(x, [150 + v * 95 + rim * 40, 18 + v * 55 + rim * 35, 22 + v * 40 + rim * 25], xx, y, 1, 1);
    }
  }
  const crng = makeRng(14);
  for (let i = 0; i < 9; i++) {                                      // cráteres
    const a = crng() * TAU, r = crng() * R * .7, cr = 2 + ((crng() * R / 6) | 0);
    disc(Math.round(ox + Math.cos(a) * r), Math.round(oy + Math.sin(a) * r), cr, 'rgba(70,6,12,.45)');
    disc(Math.round(ox + Math.cos(a) * r - 1), Math.round(oy + Math.sin(a) * r - 1), Math.max(1, cr - 1), 'rgba(120,20,24,.35)');
  }
  const lights = [];

  return { canvas: c, twinkle, lights };
}

/* ---------- rayos de luna entre los árboles ---------- */
function paintRays(L) {
  const [c, x] = canvasOf(L.W, H);
  const mx = L.orb.x, my = L.orb.y + L.orb.R * .5;
  const n = L.portrait ? 2 : 4;
  for (let i = 0; i < n; i++) {
    const s = i - (n - 1) / 2;
    const x0 = mx + s * 15, slope = -.3 + s * .08, y0 = my + 10, y1 = L.yh + 20;
    const w0 = 5, grow = .32;
    for (let y = y0; y < y1; y++) {
      const t = (y - y0) / (y1 - y0);
      const q = Math.floor(Math.min(1, t * 2.5) * Math.min(1, (1 - t) * 2) * .08 * 10) / 10;
      if (q <= 0) continue;
      const cx = x0 + slope * (y - y0), w = w0 + grow * (y - y0);
      fillC(x, `rgba(255,120,110,${q})`, Math.round(cx - w / 2), y, Math.round(w), 1);
    }
  }
  return c;
}

/* ---------- suelo en perspectiva hecho de bloques + camino ---------- */
function paintGround(L) {
  const W = L.W, [c, x] = canvasOf(W, H);
  const img = x.createImageData(W, H), d = img.data;
  const grass = ['#05181f', '#061d24', '#08262b', '#04151c'].map(hex), moss = hex('#0b3a37');
  const stone = ['#101f30', '#152840', '#0c1927', '#193349'].map(hex);
  const dirt = ['#08161d', '#0a1b24'].map(hex), fog = hex('#175564');
  const K = ((H - L.yh) ** 2) / 9;

  for (let y = L.yh; y < H; y++) {
    const dy = y - L.yh + .5, t = pathT(L, y);
    const zv = K / dy, vi = Math.floor(zv), vf = zv - vi, cellH = dy * dy / K;
    const pc = pathCenter(L, y), ph = pathHalf(L, y), fa = Math.pow(1 - t, 2) * .42;
    for (let xx = 0; xx < W; xx++) {
      const wx = (xx - L.vx) / dy * 8, ui = Math.floor(wx), uf = wx - ui;
      const as = Math.abs((xx - pc) / ph), h = hash2(ui, vi, 7);
      let col;
      if (as < 1) {
        col = as > .84 + (h - .5) * .1 ? dirt[h < .5 ? 0 : 1] : stone[Math.floor(h * stone.length)];
        if (cellH > 1.6 && (vf < .12 || uf < .1)) col = mix(col, [0, 0, 0], .35);
        if (cellH < 1) col = mix(col, stone[1], (1 - cellH) * .8);
      } else {
        col = h > .93 ? moss : grass[Math.floor(h * grass.length)];
        if (cellH > 2 && vf > .88) col = mix(col, [40, 120, 110], .12);
        if (cellH < 1) col = mix(col, grass[1], (1 - cellH) * .8);
      }
      col = mix(col, fog, fa);
      const i = (y * W + xx) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);

  // Sombra del jefe
  for (let i = -4; i <= 4; i++) {
    const hw = Math.round(21 * L.bossScale * Math.sqrt(1 - (i / 4.6) ** 2));
    fillC(x, 'rgba(0,5,10,.5)', L.bossX - hw, L.bossY + 2 + i, hw * 2, 1);
  }

  // Hongos luminosos junto al camino
  const rnd = makeRng(88), shrooms = [], count = L.portrait ? 4 : 7;
  for (let i = 0; i < count; i++) {
    const y = Math.round(H * (.8 + rnd() * .17)), side = i % 2 ? 1 : -1;
    const sx = Math.round(pathCenter(L, y) + side * (pathHalf(L, y) + 7 + rnd() * 24));
    if (sx < 6 || sx > W - 6) continue;
    const green = i % 3 === 0;
    const m = { x: sx, y, rgb: green ? '56,217,138' : '31,201,187', ph: rnd() * TAU, k: [2, 3, 4][(rnd() * 3) | 0] };
    fillC(x, '#a9d8d0', sx, y - 2, 1, 2);
    fillC(x, green ? '#2fbf7a' : '#1fc9bb', sx - 2, y - 4, 5, 2);
    fillC(x, green ? '#a6ffcf' : '#7ffff0', sx - 1, y - 5, 3, 1);
    shrooms.push(m);
  }
  return { canvas: c, shrooms };
}

/* ---------- árboles de bloques ---------- */
const PAL = {
  far:  { leaf: ['#0a2f3d', '#0b3646', '#092936', '#0a3340'], trunk: ['#09283a', '#0b2f40'], hi: '#237a86' },
  mid:  { leaf: ['#06262f', '#082f35', '#052029', '#09302f'], trunk: ['#061b25', '#08222d'], hi: '#1c7d75' },
  mid2: { leaf: ['#051d26', '#07262c', '#041a22', '#072827'], trunk: ['#05151d', '#071b25'], hi: '#187068' },
  near: { leaf: ['#04161e', '#051c25', '#03111a', '#061f24'], trunk: ['#040f17', '#06151e'], hi: '#12525a' },
};

function canopy(x, cx, topY, b, rows, P, rnd, glints, erode) {
  const cells = new Set(), key = (gx, ry) => gx + ',' + ry;
  rows.forEach((hw, ry) => {
    for (let gx = -hw; gx <= hw; gx++) {
      if (hw > 0 && Math.abs(gx) === hw && rnd() < erode) continue;
      cells.add(key(gx, ry));
    }
  });
  for (let i = 0; i < rows.length; i++) {                         // bultos sueltos
    const ry = (rnd() * rows.length) | 0, gx = Math.round((rnd() * 2 - 1) * (rows[ry] + 1));
    if (rnd() < .6) cells.add(key(gx, ry));
  }
  for (const k of cells) {
    const [gx, ry] = k.split(',').map(Number);
    const up = cells.has(key(gx, ry - 1)), dn = cells.has(key(gx, ry + 1));
    let col = P.leaf[(rnd() * P.leaf.length) | 0];
    if (!up) col = mix(col, P.hi, .5); else if (!dn) col = mix(col, [0, 0, 0], .3);
    const X = Math.round(cx + gx * b - b / 2), Y = topY + ry * b;
    fillC(x, col, X, Y, b, b);
    if (b >= 4) {                                                  // textura de hoja
      fillC(x, mix(col, [0, 0, 0], .45), X + 1 + ((rnd() * (b - 2)) | 0), Y + 1 + ((rnd() * (b - 2)) | 0), 1, 1);
      fillC(x, mix(col, P.hi, .35), X + ((rnd() * (b - 1)) | 0), Y + ((rnd() * (b - 1)) | 0), 1, 1);
    }
    if (glints && !up && rnd() < .3) glints.push({ x: X + 1, y: Y, w: Math.max(2, b - 2), ph: rnd() * TAU, k: [2, 3, 4, 6][(rnd() * 4) | 0] });
  }
}

function tree(x, t, b, P, rnd, glints) {
  const w = t.spruce ? Math.max(2, b) : 2 * b, th = t.tb * b;
  for (let r = 0; r < t.tb; r++) fillC(x, P.trunk[(rnd() * P.trunk.length) | 0], t.x - w / 2, t.base - (r + 1) * b, w, b);
  if (b >= 4) {                                                    // vetas de corteza y borde iluminado
    for (let i = 0; i < 3; i++) fillC(x, mix(P.trunk[0], [0, 0, 0], .5), t.x - w / 2 + 1 + ((rnd() * (w - 2)) | 0), t.base - th + ((rnd() * th * .6) | 0), 1, Math.max(3, (rnd() * th * .4) | 0));
    fillC(x, mix(P.trunk[1], P.hi, .35), t.x + w / 2 - 1, t.base - th, 1, th);
  }
  fillC(x, P.trunk[0], t.x - w / 2 - 1, t.base - 2, w + 2, 2);     // raíces
  if (t.spruce) {
    const rows = Array.from({ length: t.n }, (_, i) => Math.min(t.maxHW || 3, Math.floor((i + 1) / 2.4)));
    canopy(x, t.x, t.base - th - t.n * b + b, b, rows, P, rnd, glints, .22);
  } else {
    canopy(x, t.x, t.base - th - (t.rows.length - 1) * b, b, t.rows, P, rnd, glints, .38);
  }
}

function paintForest(L) {
  const W = L.W, rnd = makeRng(21);
  const P = {};
  for (const k in PAL) P[k] = { leaf: PAL[k].leaf.map(hex), trunk: PAL[k].trunk.map(hex), hi: hex(PAL[k].hi) };
  const glints = { mid: [], near: [] };
  const [farC, fx] = canvasOf(W, H), [midC, mx] = canvasOf(W, H), [nearC, nx] = canvasOf(W, H);

  // Capa lejana (bloques de 2px), dejando libre la salida del camino
  const far = [];
  for (let xx = -4; xx < W + 8; xx += 5 + ((rnd() * 5) | 0)) {
    if (Math.abs(xx - L.vx) < 9) continue;
    const spruce = rnd() < .55;
    far.push({ x: xx, base: L.yh + 1 + ((rnd() * 4) | 0), spruce, tb: spruce ? 3 : 7 + ((rnd() * 4) | 0), n: 9 + ((rnd() * 5) | 0), rows: [3, 4, 5, 5, 4, 3], maxHW: 3 });
  }
  far.sort((a, b) => a.base - b.base).forEach(t => tree(fx, t, 2, P.far, rnd, null));

  // Capa media (bloques de 4px), fuera del camino
  const mid = [];
  for (let xx = 4; xx < W; xx += 11 + ((rnd() * 9) | 0)) {
    const base = L.yh + 12 + ((rnd() * 22) | 0);
    if (Math.abs(xx - pathCenter(L, base)) < pathHalf(L, base) + 11) continue;
    const spruce = rnd() < .4;
    mid.push({ x: xx, base, spruce, tb: spruce ? 3 : 8 + ((rnd() * 3) | 0), n: 12 + ((rnd() * 4) | 0), rows: [2, 3, 4, 4, 3, 2], maxHW: 3 });
  }
  mid.sort((a, b) => a.base - b.base).forEach(t => tree(mx, t, 4, P.mid, rnd, glints.mid));

  // Robles más cercanos y grandes (bloques de 6px) a los lados del camino
  const mid2 = [];
  for (let xx = 12; xx < W; xx += 30 + ((rnd() * 22) | 0)) {
    const base = L.yh + 38 + ((rnd() * 10) | 0);
    if (Math.abs(xx - pathCenter(L, base)) < pathHalf(L, base) + 18) continue;
    mid2.push({ x: xx, base, spruce: false, tb: 7 + ((rnd() * 3) | 0), rows: [2, 3, 4, 4, 3, 2] });
  }
  mid2.sort((a, b) => a.base - b.base).forEach(t => tree(mx, t, 6, P.mid2, rnd, glints.mid));

  // Capa cercana: dos robles gigantes que enmarcan la escena (bloques de 8px)
  const nb = L.portrait ? 6 : 8, rows = L.portrait ? [2, 3, 3, 4, 3, 2] : [4, 6, 7, 7, 6, 4, 3];
  const nearTree = cx => {
    for (let y = 0; y < H; y += nb) fillC(nx, P.near.trunk[(rnd() * 2) | 0], cx - nb, y, 2 * nb, nb);
    for (let i = 0; i < 5; i++) fillC(nx, [2, 8, 12], cx - nb + 1 + ((rnd() * (2 * nb - 2)) | 0), (rnd() * H) | 0, 1, 20 + ((rnd() * 60) | 0));
    fillC(nx, mix(P.near.trunk[1], P.near.hi, .4), cx + nb - 1, 0, 1, H);
    canopy(nx, cx, -nb * 2 + 4, nb, rows, P.near, rnd, glints.near, .3);
  };
  nearTree(Math.round(W * .045) + 2);
  nearTree(W - Math.round(W * .05) - 2);

  // Matas de hierba oscura al borde inferior
  for (let xx = 0; xx < W; xx += 2 + ((rnd() * 3) | 0)) {
    const h = 2 + ((rnd() * 7) | 0);
    fillC(nx, rnd() < .5 ? '#03101a' : '#051b25', xx, H - h, 2, h);
  }
  return { far: farC, mid: midC, near: nearC, glints };
}

/* ---------- niebla (mosaico periódico: se desplaza sin costuras) ---------- */
function fogTile(Pw, Fh, color, aMax, seed) {
  const [c, x] = canvasOf(Pw, Fh), img = x.createImageData(Pw, Fh), d = img.data, rnd = makeRng(seed);
  const n1 = makeNoise(rnd, 8), n2 = makeNoise(rnd, 16), n3 = makeNoise(rnd, 32);
  for (let y = 0; y < Fh; y++) {
    const env = Math.sin(Math.PI * (y + .5) / Fh), v = y / 12;
    for (let xx = 0; xx < Pw; xx++) {
      const u = xx / Pw;
      const f = n1(u * 8, v * .6) * .55 + n2(u * 16, v * 1.2) * .3 + n3(u * 32, v * 2.4) * .15;
      const q = Math.floor(clamp((f - .42) * 2.4, 0, 1) * env * aMax * 6) / 6;
      const i = (y * Pw + xx) * 4;
      d[i] = color[0]; d[i + 1] = color[1]; d[i + 2] = color[2]; d[i + 3] = Math.round(q * 255);
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}
function drawTile(ctx, tile, W, y, off) {
  const Pw = tile.width;
  for (let xx = -(((off % Pw) + Pw) % Pw); xx < W; xx += Pw) ctx.drawImage(tile, xx, y);
}

/* ---------- el jefe: encapuchado con guadaña, de espaldas ---------- */
/* Se dibuja a escala s (1 = tamaño completo) para que quepa bien en pantallas verticales. */
function makeBoss(s) {
  const OY = 8, S = v => Math.round(v * s);
  const SW = S(80), SH = S(128);
  const [c, x] = canvasOf(SW, SH), rnd = makeRng(77);
  // Rectángulos redondeados por los bordes: las piezas contiguas encajan sin huecos a cualquier escala
  const R = (X, Y, w, h, col) => {
    const x0 = S(X), y0 = S(Y + OY), x1 = S(X + w), y1 = S(Y + OY + h);
    x.fillStyle = col; x.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
  };
  const d0 = '#04070d', d1 = '#0a1020', d2 = '#101a30', d3 = '#1a2744', steel = '#1b2838';
  const staffX = y => Math.round(8 + (112 - y) * .115);
  const bodyL = y => Math.round(20 - (y - 50) * .12), bodyR = y => Math.round(60 + (y - 50) * .12);

  // Bastón
  for (let y = 14; y <= 112; y++) { R(staffX(y), y, 2, 1, steel); R(staffX(y) + 2, y, 1, 1, '#2f5666'); }

  // Hoja de la guadaña (curva que se afila hacia la punta; filo brillante en el lado cóncavo)
  const P0 = [19, 16], P1 = [44, -6], P2 = [64, 34], edge = [], N = 150;
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    const bx = u * u * P0[0] + 2 * u * t * P1[0] + t * t * P2[0], by = u * u * P0[1] + 2 * u * t * P1[1] + t * t * P2[1];
    const tx = 2 * u * (P1[0] - P0[0]) + 2 * t * (P2[0] - P1[0]), ty = 2 * u * (P1[1] - P0[1]) + 2 * t * (P2[1] - P1[1]);
    const len = Math.hypot(tx, ty) || 1, nx = -ty / len, ny = tx / len, th = 2 + 7 * Math.pow(1 - t, .75);
    for (let k = -th * .4; k <= th * .6; k += .5) {
      const f = (k + th * .4) / th;
      R(Math.round(bx + nx * k), Math.round(by + ny * k), 1, 1, f > .9 ? '#e2fffb' : f > .72 ? '#8fe9e4' : f > .34 ? '#3e98a4' : '#1d2f40');
    }
    if (i % 3 === 0) edge.push([S(Math.round(bx + nx * th * .6)), S(Math.round(by + ny * th * .6) + OY)]);
  }
  R(16, 13, 7, 4, steel); R(19, 14, 2, 2, '#5ef2dc');                       // remate con gema

  // Capa: cuerpo, dobladillo roto y pliegues
  for (let y = 50; y < 100; y += 2) R(bodyL(y), y, bodyR(y) - bodyL(y), 2, d1);
  for (let xx = bodyL(100); xx < bodyR(100); xx += 2) {
    const ln = rnd() < .18 ? 0 : 2 + ((rnd() * 5) | 0) * 2;
    if (ln) R(xx, 100, 2, ln, d1);
  }
  for (let i = 0; i < 14; i++) {
    const y = 54 + ((rnd() * 36) | 0), len = 8 + ((rnd() * 28) | 0);
    const xx = (bodyL(y) + 3 + ((rnd() * (bodyR(y) - bodyL(y) - 8)) | 0)) & ~1;
    R(xx, y, 2, len, i % 3 ? d2 : d0);
  }
  R(39, 46, 2, 54, d0);                                                      // costura central

  // Hombros con púas, manga derecha y brazo izquierdo sujetando el bastón
  R(24, 46, 32, 2, d2); R(20, 48, 40, 2, d2);
  R(21, 40, 3, 8, d1); R(22, 36, 2, 4, d1); R(56, 40, 3, 8, d1); R(56, 36, 2, 4, d1);
  R(60, 50, 8, 34, d2);
  for (let y = 48; y < 70; y += 2) R(Math.round(20 - (y - 48) * .45), y, 13, 2, d2);
  R(11, 64, 6, 6, d3);                                                       // mano / guantelete

  // Capucha
  // Cabeza girada 3/4 hacia la luna (derecha): capucha desplazada, con punta frontal y cara oscura de perfil
  R(34, 26, 16, 18, d2); R(36, 24, 12, 2, d2); R(38, 22, 8, 2, d2); R(31, 44, 21, 4, d1);
  R(50, 30, 4, 4, d2); R(50, 34, 6, 5, d1); R(52, 39, 3, 3, d2);               // punta de la capucha mirando a la luna
  R(41, 28, 2, 16, d1); R(46, 28, 4, 16, d3); R(51, 32, 3, 3, d0);              // costura y ojo en sombra

  // Contraluz verde azulado en los bordes (la luz viene del fondo)
  const id = x.getImageData(0, 0, SW, SH), dd = id.data, al = new Uint8Array(SW * SH);
  for (let i = 0; i < SW * SH; i++) al[i] = dd[i * 4 + 3] > 0 ? 1 : 0;
  const at = (xx, yy) => (xx < 0 || yy < 0 || xx >= SW || yy >= SH) ? 0 : al[yy * SW + xx];
  for (let yy = 0; yy < SH; yy++) for (let xx = 0; xx < SW; xx++) {
    if (!at(xx, yy)) continue;
    const i = (yy * SW + xx) * 4;
    if (dd[i] + dd[i + 1] + dd[i + 2] > 200) continue;
    const moonSide = yy < S(OY + 50) && xx > S(46), col = !at(xx, yy - 1) ? (moonSide ? [230, 110, 100] : [72, 205, 214]) : !at(xx + 1, yy) ? (moonSide ? [205, 70, 72] : [52, 160, 178]) : !at(xx - 1, yy) ? [34, 108, 128] : null;
    if (col) { dd[i] = col[0]; dd[i + 1] = col[1]; dd[i + 2] = col[2]; }
  }
  x.putImageData(id, 0, 0);

  // Jirones de tela que se mecen (se dibujan en cada fotograma)
  const strips = [];
  const add = (xx, yy, len, ph) => strips.push({ x: S(xx), y: S(yy + OY), len: Math.max(3, S(len)), ph });
  [13, 17, 21].forEach((xx, i) => add(xx, 70, 9 + i * 2, i * 1.3));
  [61, 64, 67].forEach((xx, i) => add(xx, 84, 10 + i * 2, 2 + i));
  [20, 28, 36, 44, 52, 60].forEach((xx, i) => add(xx, 104, 8 + (i % 3) * 4, i * .9));

  return { canvas: c, s, ox: S(40), anchor: S(OY + 104), strips, edge, rune: { x: S(40), y: S(74 + OY) } };
}

function drawBoss(ctx, B, L, p) {
  const s = B.s, bob = Math.round(Math.sin(TAU * 8 * p));                     // flotar suave (3 s)
  const ox = L.bossX - B.ox, oy = L.bossY - B.anchor - Math.max(2, Math.round(3 * s)) + bob;
  ctx.drawImage(B.canvas, ox, oy);

  const w = Math.max(1, Math.round(2 * s));
  for (const t of B.strips) {
    const sw = Math.round(Math.sin(TAU * 3 * p + t.ph) * 1.4 * s), sy = oy + t.y, h1 = Math.round(t.len * .4);
    fillC(ctx, '#0a1020', ox + t.x, sy, w, h1);
    fillC(ctx, '#0a1020', ox + t.x + sw, sy + h1, w, t.len - h1);
    fillC(ctx, 'rgba(60,170,190,.55)', ox + t.x + sw + w, sy + h1, 1, t.len - h1);
  }

  // Runa en la espalda que late
  const r = Math.max(2, Math.round(4 * s)), rx = ox + B.rune.x, ry = oy + B.rune.y;
  ctx.fillStyle = `rgba(94,242,220,${(.4 + .6 * (.5 + .5 * Math.sin(TAU * 4 * p))).toFixed(2)})`;
  for (let dy = -r; dy <= r; dy++) { const ww = r - Math.abs(dy); ctx.fillRect(rx - ww, ry + dy, 1, 1); ctx.fillRect(rx + ww, ry + dy, 1, 1); }
  ctx.fillRect(rx, ry - 1, 1, 3); ctx.fillRect(rx - 1, ry, 3, 1);

  // Filo de la hoja: brillo suave y un destello que la recorre cada 6 s
  ctx.fillStyle = `rgba(190,255,250,${(.25 + .25 * (.5 + .5 * Math.sin(TAU * 6 * p))).toFixed(2)})`;
  B.edge.forEach(([ex, ey], i) => { if (i % 2 === 0) ctx.fillRect(ox + ex, oy + ey, 1, 1); });
  const prog = (4 * p) % 1;
  if (prog < .25) {
    const i = Math.min(B.edge.length - 1, Math.floor(prog / .25 * B.edge.length));
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    for (let k = 0; k < 3; k++) { const e = B.edge[Math.max(0, i - k)]; ctx.fillRect(ox + e[0], oy + e[1], 1, 1); }
  }
}

/* ---------- escena completa ---------- */
function createForest(W) {
  const L = layoutFor(W);
  const sky = paintSky(L), rays = paintRays(L), ground = paintGround(L), trees = paintForest(L), boss = makeBoss(L.bossScale);
  const fogA = fogTile(Math.round(W * .62), 46, [80, 195, 205], .38, 31);
  const fogB = fogTile(Math.round(W * .47), 58, [40, 130, 155], .2, 47);

  // Luciérnagas y chispas de alma
  const rnd = makeRng(303), flies = [], sparks = [];
  const fcount = Math.max(16, Math.round(28 * W / 320));
  for (let i = 0; i < fcount; i++) {
    flies.push({
      x: rnd() * W, y: L.yh - 26 + rnd() * (H - L.yh + 16), ax: 4 + rnd() * 6, ay: 3 + rnd() * 5,
      kx: 1 + ((rnd() * 2) | 0), ky: 1 + ((rnd() * 3) | 0), n: [3, 4, 6, 8][(rnd() * 4) | 0],
      p1: rnd() * TAU, p2: rnd() * TAU, p3: rnd() * TAU, c: rnd() < .7 ? '110,255,235' : '150,255,150',
    });
  }
  for (let i = 0; i < 16; i++) {
    sparks.push({ x: L.bossX + (rnd() * 2 - 1) * 28 * L.bossScale, y: L.bossY - 6 - rnd() * 26 * L.bossScale, k: 2 + ((rnd() * 2) | 0), ph: rnd(), wph: rnd() * TAU });
  }

  function frame(ctx, n) {
    const p = (n % LOOP_STEPS) / LOOP_STEPS;
    ctx.globalAlpha = 1;
    ctx.drawImage(sky.canvas, 0, 0);
    for (const s of sky.twinkle) {
      const a = Math.max(0, Math.sin(TAU * s.k * p + s.ph)) ** 2;
      fillC(ctx, `rgba(190,240,255,${(.25 + a * .75).toFixed(2)})`, s.x, s.y, 1, 1);
    }
    for (const l of sky.lights) {                                             // motas de la esfera
      const a = .25 + .75 * Math.max(0, Math.sin(TAU * l.k * p + l.ph)) ** 2;
      ctx.fillStyle = `rgba(${l.col[0]},${l.col[1]},${l.col[2]},${a.toFixed(2)})`;
      for (const [qx, qy] of l.pts) ctx.fillRect(qx, qy, 1, 1);
    }
    ctx.drawImage(ground.canvas, 0, 0);
    ctx.drawImage(trees.far, 0, 0);
    drawTile(ctx, fogA, W, L.yh - 24, -Math.round(p * fogA.width));          // niebla lejana, hacia la izquierda

    ctx.globalAlpha = .55 + .45 * (.5 + .5 * Math.sin(TAU * 3 * p));         // rayos de luna que respiran
    ctx.drawImage(rays, 0, 0);
    ctx.globalAlpha = 1;

    ctx.drawImage(trees.mid, 0, 0);
    for (const g of trees.glints.mid) {
      const a = Math.max(0, Math.sin(TAU * g.k * p + g.ph)) ** 4;
      if (a > .08) fillC(ctx, `rgba(160,255,235,${(a * .6).toFixed(2)})`, g.x, g.y, g.w, 1);
    }

    drawBoss(ctx, boss, L, p);
    for (const s of sparks) {                                                 // almas que suben del manto
      const prog = (s.k * p + s.ph) % 1, a = Math.sin(Math.PI * prog);
      const sx = Math.round(s.x + Math.sin(TAU * 2 * p + s.wph) * 2), sy = Math.round(s.y - prog * 36 * L.bossScale);
      fillC(ctx, `rgba(120,255,235,${(a * .9).toFixed(2)})`, sx, sy, 1, a > .6 ? 2 : 1);
    }

    drawTile(ctx, fogB, W, L.yh + 22, Math.round(p * fogB.width));            // bruma baja, hacia la derecha

    ctx.drawImage(trees.near, 0, 0);
    for (const g of trees.glints.near) {
      const a = Math.max(0, Math.sin(TAU * g.k * p + g.ph)) ** 4;
      if (a > .08) fillC(ctx, `rgba(120,230,215,${(a * .5).toFixed(2)})`, g.x, g.y, g.w, 1);
    }

    for (const m of ground.shrooms) {                                         // brillo de hongos
      const a = .1 + .12 * (.5 + .5 * Math.sin(TAU * m.k * p + m.ph));
      fillC(ctx, `rgba(${m.rgb},${(a * .6).toFixed(2)})`, m.x - 6, m.y - 8, 13, 9);
      fillC(ctx, `rgba(${m.rgb},${(a * 1.4).toFixed(2)})`, m.x - 3, m.y - 6, 7, 6);
    }
    for (const f of flies) {                                                  // luciérnagas
      const fx = Math.round(f.x + f.ax * Math.cos(TAU * f.kx * p + f.p1)), fy = Math.round(f.y + f.ay * Math.sin(TAU * f.ky * p + f.p2));
      const a = .3 + .7 * Math.max(0, Math.sin(TAU * f.n * p + f.p3)) ** 2;
      fillC(ctx, `rgba(${f.c},${(a * .18).toFixed(2)})`, fx - 1, fy - 1, 3, 3);
      fillC(ctx, `rgba(${f.c},${a.toFixed(2)})`, fx, fy, 1, 1);
    }
  }
  return { W, H, layout: L, frame };
}

/* ---------- montaje en un <canvas>: tamaño, bucle, redimensionado ---------- */
export function mountForest(canvas) {
  let timer = null, lastW = 0, step = 0;
  const render = () => {
    const W = widthFor(innerWidth, innerHeight);
    lastW = W;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const forest = createForest(W);
    clearInterval(timer);
    forest.frame(ctx, step);
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      timer = setInterval(() => { if (!document.hidden) { step = (step + 1) % LOOP_STEPS; forest.frame(ctx, step); } }, STEP_MS);
    }
  };
  render();
  // Al girar el dispositivo o cambiar el tamaño de la ventana, se redibuja si la proporción cambió de verdad
  let wait;
  addEventListener('resize', () => {
    clearTimeout(wait);
    wait = setTimeout(() => { if (Math.abs(widthFor(innerWidth, innerHeight) - lastW) >= 4) render(); }, 200);
  });
}
