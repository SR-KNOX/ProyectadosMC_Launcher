/* Datos del equipo. */
export function getTotalRamGB() {
  if (window.__hardware && window.__hardware.totalRamGB) return window.__hardware.totalRamGB;
  if (window.__totalRamGB) return window.__totalRamGB;
  if (navigator.deviceMemory) return Math.max(navigator.deviceMemory, 8);
  return 8;
}

export function getFreeRamGB() {
  if (window.__hardware && window.__hardware.freeRamGB) return window.__hardware.freeRamGB;
  return getTotalRamGB();
}

export function getHardware() {
  return window.__hardware || null;
}