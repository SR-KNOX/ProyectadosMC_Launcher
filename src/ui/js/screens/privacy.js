/* Política de privacidad. Se abre desde Sobre nosotros.
   El texto describe lo que el launcher hace de verdad hoy; si cambia (servidor real, correo, etc.) hay que actualizarlo
   y subir la versión/fecha. Conviene que la revise una persona con formación legal antes de publicar el proyecto. */
import { $ } from '../utils.js';
import { CONFIG } from '../config.js';
import { showScreen } from '../router.js';

const VERSION = '2.2';
const DATE = '13 de noviembre de 2026';

const SECTIONS = [
  ['Quiénes somos',
   ['PROYECTADOS Launcher es un proyecto de RAYX. Esta política explica qué datos usa el launcher, para qué y qué puedes hacer con ellos.']],
  ['Qué datos usamos', [
    'Nombre de jugador: el nombre con el que apareces en el juego.',
    'Skin y capa que subas, y el modelo de skin elegido (clásico o delgado).',
    'Ajustes del launcher: carpeta de instalación, memoria RAM y versión del modpack instalada.',
    'El launcher no usa cuentas: no te pide correo ni contraseña. Tampoco pedimos datos de pago (la tienda es un sitio externo), ni tu ubicación, ni tu nombre real, ni usamos analíticas ni publicidad.']],
  ['Para qué los usamos', [
    'Mostrar tu nombre en el servidor del juego.',
    'Mostrar tu skin y tu capa en tu perfil dentro del launcher (de momento no se envían al servidor).',
    'Instalar y actualizar el modpack y mostrarte el estado del servidor.']],
  ['Dónde se guardan', [
    'En esta versión del launcher, tus datos se guardan solo en tu equipo, dentro del almacenamiento local de la aplicación. No salen de tu dispositivo.',
    'Cuando el launcher se conecte a un servidor de RAYX y se envíen datos allí, actualizaremos esta política y te avisaremos antes de ese cambio.']],
  ['Con quién los compartimos', [
    'No vendemos ni cedemos tus datos para publicidad.',
    'Tu nombre de jugador es visible para los demás jugadores del servidor, porque es la finalidad del juego.',
    'Los enlaces a Discord, la tienda y Minecraft (Mojang/Microsoft) llevan a sitios de terceros con sus propias políticas.']],
  ['Cuánto tiempo los conservamos', [
    'Tus datos se conservan en tu equipo hasta que los cambies o borres los datos del launcher.']],
  ['Tus derechos y cómo ejercerlos', [
    'Puedes subir o quitar tu skin y tu capa en Opciones cuando quieras. El nombre de jugador se puede corregir desde el launcher solo hasta que entres por primera vez al servidor; después, el cambio se pide con un ticket en nuestro Discord.',
    'Para borrar todo lo guardado, elimina los datos de la aplicación en tu equipo. Lo que exista en el servidor del juego (progreso, inventario) o cualquier duda o solicitud se gestiona por ticket en nuestro Discord, con los contactos de «Sobre nosotros».']],
  ['Menores de edad', [
    'Si eres menor de edad, usa el launcher con el conocimiento y el permiso de tu madre, padre o tutor.']],
  ['Cambios en esta política', [
    'Si cambiamos cómo usamos tus datos, publicaremos aquí la nueva versión con su fecha. Los cambios importantes se avisarán dentro del launcher.']],
];

let from = 's-about';

function render() {
  $('privMeta').textContent = `Versión ${VERSION} · actualizada el ${DATE}.`;
  const frag = [];
  SECTIONS.forEach(([title, items], i) => {
    const h = document.createElement('h2');
    h.textContent = `${i + 1}. ${title}`;
    frag.push(h);
    if (items.length === 1) {
      const p = document.createElement('p'); p.className = 'about-text'; p.textContent = items[0]; frag.push(p);
    } else {
      const ul = document.createElement('ul'); ul.className = 'legal-list';
      items.forEach(t => { const li = document.createElement('li'); li.textContent = t; ul.append(li); });
      frag.push(ul);
    }
  });
  const p = document.createElement('p');
  p.className = 'about-text legal-foot';
  p.textContent = `© RAYX. Minecraft es una marca registrada de Mojang AB; ${CONFIG.app.name ?? 'PROYECTADOS'} es un proyecto no oficial.`;
  frag.push(p);
  $('privBody').replaceChildren(...frag);
}

function openPrivacy(origin) {
  from = origin;
  render();
  showScreen('s-privacy');
  $('privBody').scrollTop = 0;
  document.querySelector('main')?.scrollTo?.(0, 0);
}

export function initPrivacyScreen() {
  $('btnPrivBack').onclick = () => showScreen(from);
  $('aboutPrivacy').onclick = () => openPrivacy('s-about');
}
