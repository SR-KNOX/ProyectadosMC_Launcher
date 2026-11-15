/* Avisos flotantes: actualización del modpack (#toast) y estado del servidor (#toastSrv). */
import { $ } from '../utils.js';

export function showToast(text) {
  if (text) $('toastText').textContent = text;
  $('toast').classList.add('show');
}

export function hideToast() {
  $('toast').classList.remove('show');
}

/* Aviso del servidor: se cierra solo. tone = 'ok' | 'warn' | 'err' (color del borde). */
let srvTimer;
export function showServerToast(title, text, tone = 'ok', ms = 7000) {
  $('toastSrvTitle').textContent = title;
  $('toastSrvText').textContent = text;
  $('toastSrv').dataset.tone = tone;
  $('toastSrv').classList.add('show');
  clearTimeout(srvTimer);
  srvTimer = setTimeout(hideServerToast, ms);
}

function hideServerToast() {
  clearTimeout(srvTimer);
  $('toastSrv').classList.remove('show');
}

export function initToast() {
  $('toastX').onclick = hideToast;
  $('toastSrvX').onclick = hideServerToast;
}
