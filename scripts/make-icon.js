// Genera un icono .ico (bloque de césped estilo Minecraft) sin dependencias.
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

const SIZE = 256;
const px = Buffer.alloc(SIZE * SIZE * 4); // RGBA

// Paleta Proyectados MC (esmeralda sobre noche)
const night = [11, 16, 38];
const emerald = [61, 220, 132];
const emeraldD = [31, 157, 85];
const emeraldL = [110, 235, 165];
const black = [4, 7, 18];

function set(x, y, c) {
  const i = (y * SIZE + x) * 4;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
  px[i + 3] = c.length > 3 ? c[3] : 255;
}

// Determinista "aleatorio" para textura
function rand(x, y, seed) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return n - Math.floor(n);
}

// Dibujamos un bloque de césped estilizado con la paleta del launcher:
// - fondo redondeado noche, borde esmeralda
// - parte superior más clara, inferior más oscura
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    // Bordes redondeados
    const m = 6;
    const corner = 28;
    const inCornerX = x < m + corner && y < m + corner && Math.hypot(x - (m + corner), y - (m + corner)) > corner;
    const inCornerX2 = x > SIZE - m - corner && y < m + corner && Math.hypot(x - (SIZE - m - corner), y - (m + corner)) > corner;
    const inCornerY = x < m + corner && y > SIZE - m - corner && Math.hypot(x - (m + corner), y - (SIZE - m - corner)) > corner;
    const inCornerY2 = x > SIZE - m - corner && y > SIZE - m - corner && Math.hypot(x - (SIZE - m - corner), y - (SIZE - m - corner)) > corner;
    if (x < m || y < m || x >= SIZE - m || y >= SIZE - m || inCornerX || inCornerX2 || inCornerY || inCornerY2) {
      set(x, y, [0, 0, 0, 0]); // transparente fuera
      continue;
    }
    // Borde interior esmeralda
    if (x < m + 6 || y < m + 6 || x >= SIZE - m - 6 || y >= SIZE - m - 6) {
      set(x, y, emeraldD);
      continue;
    }
    const topHeight = Math.floor(SIZE * 0.45);
    if (y < topHeight) {
      const c = rand(x, y, 1) > 0.5 ? emerald : emeraldL;
      set(x, y, c);
    } else {
      const c = rand(x, y, 2) > 0.5 ? emeraldD : night;
      set(x, y, c);
    }
  }
}

// ---- Codificar PNG ----
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
// filter type 0 por scanline
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  px.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);

// ---- Empaquetar como ICO (PNG dentro de ICO) ----
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type = icon
header.writeUInt16LE(1, 4); // count
const entry = Buffer.alloc(16);
entry[0] = 0; // 0 => 256
entry[1] = 0;
entry[2] = 0;
entry[3] = 0;
entry.writeUInt16LE(1, 4); // planes
entry.writeUInt16LE(32, 6); // bpp
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(6 + 16, 12); // offset
const ico = Buffer.concat([header, entry, png]);

const out = path.join(__dirname, "..", "build", "icon.ico");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, ico);
console.log("Icono generado:", out, ico.length, "bytes");
