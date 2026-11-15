/* Navegación entre pantallas (secciones .screen del index.html).
   Marca <body data-screen="..."> para que el CSS muestre u oculte elementos por pantalla
   y <body data-flow="onb"> en la pantalla de bienvenida (nombre e instalación), que van sin barra lateral. */
import { $ } from './utils.js';

const ONBOARDING = ['s-folder'];

export function showScreen(id) {
  document.querySelectorAll('.screen').forEach(e => e.classList.remove('on'));
  $(id).classList.add('on');
  document.body.dataset.screen = id;
  document.body.dataset.flow = ONBOARDING.includes(id) ? 'onb' : 'app';
}

export function isScreenActive(id) {
  return $(id).classList.contains('on');
}
