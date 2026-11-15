/* Servicio de skins y capas: valida el PNG, lo dibuja (cabeza, cuerpo y capa) y lo guarda.
   La skin/capa se guardan en localStorage del launcher Y en el perfil (profile.json).
   Antes de lanzar, main.js copia los PNG al instance/LocalSkin para que CustomSkinLoader
   los cargue dentro del juego (skins/<nick>.png y capes/<nick>.png). */
import { CONFIG } from '../config.js';
import { state } from '../state.js';
import { store } from '../storage.js';

const K = CONFIG.storageKeys;

const loadImage = src => new Promise((res, rej) => {
  const i = new Image();
  i.onload = () => res(i);
  i.onerror = () => rej(new Error('No se pudo leer la imagen.'));
  i.src = src;
});

const readFile = f => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = () => rej(new Error('No se pudo leer el archivo.'));
  r.readAsDataURL(f);
});

/* Valida y guarda la skin. Lanza Error con un mensaje claro si no sirve. */
export async function setSkinFromFile(file) {
  if (file.type !== 'image/png') throw new Error('La skin debe ser un archivo PNG.');
  if (file.size > CONFIG.skin.maxBytes) throw new Error('El archivo es muy pesado (máximo 200 KB).');
  const url = await readFile(file);
  const img = await loadImage(url);
  if (!CONFIG.skin.sizes.includes(`${img.width}x${img.height}`)) {
    throw new Error(`Tamaño no válido (${img.width}×${img.height}). Usa una skin de 64×64 o 64×32 px.`);
  }
  if (!store.set(K.skin, url)) throw new Error('No se pudo guardar la skin en este equipo.');
  state.skin = url;
}

export function clearSkin() {
  store.del(K.skin);
  state.skin = null;
}

export function setSkinModel(m) {
  state.skinModel = m === 'slim' ? 'slim' : 'classic';
  store.set(K.skinModel, state.skinModel);
}

/* ---------- Capa ---------- */
/* Escala de la textura: 64×32 → 1, 128×64 → 2…; el formato antiguo 22×17 → 1, 44×34 → 2…  Devuelve 0 si no es una capa válida. */
function capeScale(w, h) {
  const max = CONFIG.cape.maxScale;
  if (w % 64 === 0 && h === w / 2 && w / 64 <= max) return w / 64;
  if (w % 22 === 0 && h === (w / 22) * 17 && w / 22 <= max) return w / 22;
  return 0;
}

/* Valida y guarda la capa. Lanza Error con un mensaje claro si no sirve. */
export async function setCapeFromFile(file) {
  if (file.type !== 'image/png') throw new Error('La capa debe ser un archivo PNG.');
  if (file.size > CONFIG.cape.maxBytes) throw new Error(`El archivo es muy pesado (máximo ${Math.round(CONFIG.cape.maxBytes / 1024)} KB).`);
  const url = await readFile(file);
  const img = await loadImage(url);
  if (!capeScale(img.width, img.height)) {
    throw new Error(`Tamaño no válido (${img.width}×${img.height}). Usa una capa de 64×32 px (o 22×17, o sus versiones HD como 128×64).`);
  }
  if (!store.set(K.cape, url)) throw new Error('No se pudo guardar la capa en este equipo.');
  state.cape = url;
}

export function clearCape() {
  store.del(K.cape);
  state.cape = null;
}

/* Cara exterior de la capa (10×16 en la textura base) en un canvas de 10×16. */
export async function drawCape(canvas, src) {
  const ctx = canvas.getContext('2d');
  const img = await loadImage(src);
  const s = capeScale(img.width, img.height) || 1;
  ctx.imageSmoothingEnabled = s > 1;     // las capas HD se reducen suavizadas; la normal, píxel a píxel
  ctx.clearRect(0, 0, 10, 16);
  ctx.drawImage(img, s, s, 10 * s, 16 * s, 0, 0, 10, 16);
}

/* Cabeza (con capa de sombrero) en un canvas de 8×8. */
export async function drawHead(canvas, src) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 8, 8);
  const img = await loadImage(src);
  ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 8, 8);
  ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 8, 8);
}

/* Cuerpo completo de frente en un canvas de 16×32. Soporta skins 64×32 (antiguas) y 64×64. */
export async function drawBody(canvas, src, slim) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 16, 32);
  const img = await loadImage(src);
  const modern = img.height === 64;
  const aw = slim ? 3 : 4;
  const part = (sx, sy, w, h, dx, dy, flip) => {
    if (!flip) { ctx.drawImage(img, sx, sy, w, h, dx, dy, w, h); return; }
    ctx.save(); ctx.translate(dx + w, dy); ctx.scale(-1, 1);
    ctx.drawImage(img, sx, sy, w, h, 0, 0, w, h); ctx.restore();
  };
  // Capa base
  part(8, 8, 8, 8, 4, 0);                                                // cabeza
  part(20, 20, 8, 12, 4, 8);                                             // torso
  part(44, 20, aw, 12, 4 - aw, 8);                                       // brazo derecho
  modern ? part(36, 52, aw, 12, 12, 8) : part(44, 20, aw, 12, 12, 8, true); // brazo izquierdo
  part(4, 20, 4, 12, 4, 20);                                             // pierna derecha
  modern ? part(20, 52, 4, 12, 8, 20) : part(4, 20, 4, 12, 8, 20, true);  // pierna izquierda
  // Capa exterior
  part(40, 8, 8, 8, 4, 0);                                               // sombrero
  if (modern) {
    part(20, 36, 8, 12, 4, 8);                                           // chaqueta
    part(44, 36, aw, 12, 4 - aw, 8);                                     // manga derecha
    part(52, 52, aw, 12, 12, 8);                                         // manga izquierda
    part(4, 36, 4, 12, 4, 20);                                           // pantalón derecho
    part(4, 52, 4, 12, 8, 20);                                           // pantalón izquierdo
  }
}
