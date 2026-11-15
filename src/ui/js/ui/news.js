/* Banner de noticias del inicio: rota solo y cierra el ciclo (modpack → noticias → modpack).
   Se pausa con el cursor/foco encima, con la pestaña oculta o fuera del inicio. Datos: CONFIG.news. */
import { $ } from '../utils.js';
import { CONFIG } from '../config.js';
import { isScreenActive } from '../router.js';
import { openExternal } from '../services/app.js';

const TICK = 100;

function slideFor(n) {
  const a = document.createElement('article');
  a.className = 'slide';
  a.setAttribute('aria-label', n.title);
  const badges = document.createElement('div');
  badges.className = 'badges';
  const tag = document.createElement('span');
  tag.className = 'badge';
  tag.textContent = n.tag || 'Noticia';
  badges.append(tag);
  const h = document.createElement('h3');
  h.className = 'slide-title';
  h.textContent = n.title;
  const p = document.createElement('p');
  p.className = 'hero-text';
  p.textContent = n.text;
  a.append(badges, h, p);
  if (n.url) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ghost slide-more';
    b.textContent = 'Leer más';
    b.onclick = () => openExternal(n.url);
    a.append(b);
  }
  return a;
}

export function initNews() {
  const box = $('slides');
  (CONFIG.news.items || []).forEach(n => box.append(slideFor(n)));
  const slides = [...box.children];
  const total = slides.length;

  // Fondos de imagen del banner: una capa detrás del texto que se funde con cada noticia (la del modpack no lleva)
  const items = [null, ...(CONFIG.news.items || [])];
  const bgBox = document.createElement('div');
  bgBox.className = 'hero-bgs';
  bgBox.setAttribute('aria-hidden', 'true');
  const bgs = items.map(n => {
    if (!n || !n.image) return null;
    const im = new Image();
    im.alt = '';
    im.decoding = 'async';
    im.src = n.image;
    bgBox.append(im);
    return im;
  });
  if (bgs.some(Boolean)) $('hero').prepend(bgBox);
  const dots = $('newsDots');

  if (total < 2) {            // sin noticias: no hay carrusel
    $('newsPrev').hidden = $('newsNext').hidden = dots.hidden = true;
    return;
  }

  const dotEls = slides.map((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', `Ir a la noticia ${i + 1} de ${total}`);
    b.append(document.createElement('i'));
    b.onclick = () => go(i);
    dots.append(b);
    return b;
  });

  let cur = 0, elapsed = 0, paused = false;
  const dur = CONFIG.news.intervalMs;

  function setProgress() {
    dotEls[cur].style.setProperty('--p', Math.min(1, elapsed / dur));
  }
  function go(i) {
    cur = (i + total) % total;       // al llegar al final vuelve a la primera
    slides.forEach((s, k) => {
      const on = k === cur;
      s.classList.toggle('on', on);
      s.inert = !on;
      bgs[k]?.classList.toggle('on', on);
      dotEls[k].classList.toggle('on', on);
      dotEls[k].setAttribute('aria-current', on ? 'true' : 'false');
      dotEls[k].style.setProperty('--p', 0);
    });
    elapsed = 0;
  }
  go(0);

  $('newsPrev').onclick = () => go(cur - 1);
  $('newsNext').onclick = () => go(cur + 1);

  const hero = $('hero');
  hero.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') paused = true; });
  hero.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') paused = false; });
  hero.addEventListener('focusin', () => { paused = true; });
  hero.addEventListener('focusout', () => { paused = false; });

  // Deslizar con el dedo
  let x0 = null;
  hero.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  hero.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 50) go(cur + (dx < 0 ? 1 : -1));
  }, { passive: true });

  setInterval(() => {
    if (window.__gameRunning || paused || document.hidden || !isScreenActive('s-home')) return;
    elapsed += TICK;
    if (elapsed >= dur) go(cur + 1); else setProgress();
  }, TICK);
}
