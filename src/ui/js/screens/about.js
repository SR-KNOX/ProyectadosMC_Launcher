/* Pantalla Sobre nosotros: estudio (con contacto), proyecto, comunidad y aviso legal. */
import { $ } from '../utils.js';
import { CONFIG } from '../config.js';
import { state } from '../state.js';
import { showScreen } from '../router.js';
import { openExternal } from '../services/app.js';

/* Un párrafo por cada bloque separado por una línea en blanco. */
function paragraphs(box, text) {
  box.replaceChildren(...text.split(/\n\s*\n/).map(t => {
    const p = document.createElement('p');
    p.className = 'about-text';
    p.textContent = t.trim();
    return p;
  }));
}

function contactButtons() {
  const box = $('contactBtns');
  if (box.children.length) return;
  CONFIG.contact.forEach(c => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ghost';
    b.innerHTML = '<svg class="ico fill" aria-hidden="true"><use href="#i-discord"/></svg>';
    b.append(c.name);
    b.title = `Abrir el Discord de ${c.name}`;
    b.setAttribute('aria-label', `Contactar a ${c.name} por Discord`);
    b.onclick = () => openExternal(c.url);
    box.append(b);
  });
}

export function initAboutScreen() {
  contactButtons();
  $('navAbout').onclick = () => {
    paragraphs($('aboutStudio'), CONFIG.about.studio);
    paragraphs($('aboutProject'), CONFIG.about.project);
    $('aboutVer').textContent = 'v' + CONFIG.app.version;
    $('aboutMc').textContent = CONFIG.game.minecraftVersion;
    $('aboutPack').textContent = 'v' + state.local;
    showScreen('s-about');
  };
}
