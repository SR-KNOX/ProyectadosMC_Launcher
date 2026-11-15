/* Barra de progreso por pasos (usada en instalación y actualización). */
import { $, sleep } from '../utils.js';
import { CONFIG } from '../config.js';

export async function progress(barId, fillId, statId, steps) {
  const bar = $(barId);
  bar.style.visibility = 'visible';
  bar.style.display = 'block';
  for (let i = 0; i < steps.length; i++) {
    $(statId).textContent = steps[i];
    $(fillId).style.width = ((i + 1) / steps.length * 100) + '%';
    await sleep(CONFIG.timing.stepDelay);
  }
}

export function resetProgress(barId, fillId) {
  const bar = $(barId);
  bar.style.visibility = 'hidden';
  $(fillId).style.width = '0';
}