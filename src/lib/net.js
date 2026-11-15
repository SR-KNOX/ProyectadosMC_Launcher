// ============================================================
//  Descargas de red: allowlist central de hosts y comprobaciones
//  de seguridad (HTTPS obligatorio, también tras redirecciones).
// ============================================================

// Hosts usados realmente por el manifiesto, la configuración y las
// descargas gestionadas por el launcher:
//  - github.com: assets de las releases del modpack (redirigen)
//  - raw.githubusercontent.com: manifest, configs y version.json
//  - objects.githubusercontent.com / release-assets.githubusercontent.com:
//    destino de las redirecciones de los assets de GitHub
//  - api.github.com: API de contenidos y de releases
//  - api.adoptium.net: API de Temurin 17
//  - codeload.github.com: ZIP de un tag/rama (respaldo)
const ALLOWED_HOSTS = [
  "github.com",
  "api.github.com",
  "codeload.github.com",
  "raw.githubusercontent.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
  "github-releases.githubusercontent.com",
  "api.adoptium.net",
];

function isAllowedUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return ALLOWED_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

function assertAllowedUrl(url, label) {
  if (!isAllowedUrl(url)) {
    const name = label ? ` (${label})` : "";
    throw new Error(`URL no permitida${name}: solo se aceptan HTTPS de hosts conocidos.`);
  }
  return url;
}

/* fetch con allowlist: valida la URL inicial y la final (tras redirecciones). */
async function fetchAllowed(url, options = {}) {
  assertAllowedUrl(url);
  const res = await fetch(url, options);
  if (!isAllowedUrl(res.url)) {
    try { res.body?.cancel(); } catch { /* ignore */ }
    throw new Error("La descarga redirigió a un host no permitido.");
  }
  return res;
}

module.exports = { ALLOWED_HOSTS, isAllowedUrl, assertAllowedUrl, fetchAllowed };