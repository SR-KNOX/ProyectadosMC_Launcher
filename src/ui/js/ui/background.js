import { $ } from '../utils.js';
import { mountForest } from './forest.js';
import { mountForestGL } from './forest-gl.js';

// Fondo: video en bucle (assets/video). Respaldo, si falla o el equipo pide ahorrar datos/movimiento:
// bosque en WebGL y, si no hay WebGL, bosque pixel-art en canvas 2D.
function mountFallback() {
  const c = $('bg');
  if (c.dataset.on) return;
  c.dataset.on = '1';
  if (mountForestGL(c)) return;
  const n = c.cloneNode(false); // un canvas que ya pidió WebGL no puede pasar a 2D
  n.style.imageRendering = '';
  c.replaceWith(n);
  mountForest(n);
}

export function pauseBackground() {
  const v = $('bgv');
  if (v) v.pause();
  const c = $('bg');
  if (c) c.dataset.paused = '1';
}

export function drawBackground() {
  const v = $('bgv');
  const saver = navigator.connection && navigator.connection.saveData;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!v || saver) { v && v.remove(); return mountFallback(); }
  if (still) { v.classList.add('on'); return; }              // solo la imagen fija del póster
  let done = false;
  const ok = () => { done = true; document.body.classList.add('has-video'); v.classList.add('on'); };
  const fail = () => { if (done) return; done = true; v.remove(); mountFallback(); };
  v.addEventListener('playing', ok, { once: true });
  v.addEventListener('error', fail);                         // el video falló
  const srcs = v.querySelectorAll('source');
  if (srcs.length) srcs[srcs.length - 1].addEventListener('error', fail);   // falló el último formato disponible
  v.addEventListener('stalled', () => setTimeout(() => { if (!v.currentTime) fail(); }, 4000));
  const t = v.play();
  if (t && t.catch) t.catch(fail);
  setTimeout(() => { if (!done && !v.currentTime) fail(); }, 6000);
  // Ahorra batería: pausa el video cuando la pestaña no está visible
  document.addEventListener('visibilitychange', () => { document.hidden ? v.pause() : v.play().catch(() => {}); });
}
