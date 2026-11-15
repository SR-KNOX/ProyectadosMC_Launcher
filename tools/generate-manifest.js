// Genera manifest.json para el modpack.
// Uso: node tools/generate-manifest.js <carpetaModpack> [urlBase] [version]
// La carpeta debe contener mods/ y/o config/.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.argv[2] || '.';
const baseUrl = (process.argv[3] || '').replace(/\/$/, '');
const version = process.argv[4] || '1.0.0';

function sha256File(p) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(p));
  return h.digest('hex');
}

function walk(dir, base) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) out.push(...walk(full, base));
    else out.push(path.relative(base, full).replace(/\\/g, '/'));
  }
  return out;
}

const manifest = { version, generatedAt: new Date().toISOString(), mods: [], config: [] };

const modsDir = path.join(root, 'mods');
for (const rel of walk(modsDir, modsDir)) {
  const full = path.join(modsDir, rel);
  const st = fs.statSync(full);
  manifest.mods.push({
    file: rel,
    sha256: sha256File(full),
    size: st.size,
    url: baseUrl ? baseUrl + '/mods/' + rel.split('/').map(encodeURIComponent).join('/') : '',
    force: false,
  });
}

const configDir = path.join(root, 'config');
for (const rel of walk(configDir, configDir)) {
  const full = path.join(configDir, rel);
  const st = fs.statSync(full);
  manifest.config.push({
    file: 'config/' + rel,
    sha256: sha256File(full),
    size: st.size,
    url: baseUrl ? baseUrl + '/config/' + rel.split('/').map(encodeURIComponent).join('/') : '',
    // Marca como forzado editando este campo a true para archivos que siempre deben sobrescribirse.
    force: false,
  });
}

const outPath = path.join(root, 'manifest.json');
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2), 'utf8');
console.log('Manifiesto generado en', outPath);
console.log('Mods:', manifest.mods.length, 'Config:', manifest.config.length);