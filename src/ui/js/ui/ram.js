/* Control deslizante de RAM (se usa en la instalación y en Opciones). */
import { $ } from '../utils.js';
import { CONFIG } from '../config.js';
import { getTotalRamGB } from '../services/system.js';

const fmt = n => (Number.isInteger(n) ? n : n.toFixed(1).replace('.', ',')) + ' GB';

/* Tope del deslizador: RAM total detectada, redondeada al paso. */
function maxRamGB() {
  const r = CONFIG.ram;
  const total = getTotalRamGB();
  const hardCap = Number.isFinite(total) ? total : 8;
  const cap = Math.floor(hardCap / r.step) * r.step;
  return Math.max(r.min, Number.isFinite(cap) ? cap : r.min);
}

/* Conecta un deslizador. p = prefijo de ids ('inst' | 'opt'). Devuelve { get, set }. */
export function bindRam(p, initial, onChange = () => {}) {
  const r = CONFIG.ram, range = $(p + 'RamRange'), max = maxRamGB();
  range.min = r.min; range.max = max; range.step = r.step;
  $(p + 'RamMin').textContent = fmt(r.min);
  $(p + 'RamMax').textContent = fmt(max);
  $(p + 'RamRec').textContent = 'Recomendado: ' + r.recommended;

  const paint = () => {
    const raw = parseFloat(range.value);
    const v = Number.isFinite(raw) ? Math.min(max, Math.max(r.min, raw)) : r.min;
    const pct = max > r.min ? ((v - r.min) / (max - r.min) * 100) : 0;
    range.style.setProperty('--p', pct + '%');
    $(p + 'RamVal').textContent = fmt(v);
    const h = $(p + 'RamHint');
    h.className = 'hint ram-hint';
    const total = getTotalRamGB() || 8;
    const limit80 = total * 0.8;
    if (v < 3) { h.textContent = 'Muy poca memoria: el juego puede ir lento o cerrarse.'; h.classList.add('warn'); }
    else if (v > limit80) { h.textContent = `Aviso: estás usando más del 80 % de tu RAM (${fmt(total)}). No se recomienda usar más de ${fmt(limit80)}.`; h.classList.add('warn'); }
    else h.textContent = `Tu equipo tiene ${fmt(total)} de RAM. No se recomienda usar más del 80 % (${fmt(limit80)}).`;
    range.classList.toggle('warn', v > limit80);
    onChange(v);
  };
  const set = v => {
    const n = Number(v);
    range.value = Math.min(max, Math.max(r.min, Number.isFinite(n) ? n : r.min));
    paint();
  };
  range.addEventListener('input', paint);
  set(initial);
  return { get: () => parseFloat(range.value), set };
}
