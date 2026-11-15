/* Utilidades generales sin dependencias del resto del proyecto. */
export const $ = id => document.getElementById(id);
export const sleep = ms => new Promise(r => setTimeout(r, ms));
