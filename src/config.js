// ============================================================
//  CONFIGURACIÓN DEL MODPACK — edita este archivo a tu gusto
// ============================================================

module.exports = {
  // Versión de Minecraft del modpack
  MINECRAFT_VERSION: "1.20.1",

  // Versión de Forge fija para el modpack (formato completo de Forge).
  // No se consulta en línea: todos los jugadores usan la misma.
  FORGE_VERSION: "1.20.1-47.4.28",

  // RAM por defecto que se asigna a un perfil nuevo (en GB)
  DEFAULT_RAM_GB: 4,

  // --------------------------------------------------------
  // ACTUALIZACIONES DESDE GITHUB
  // El repositorio debe ser PÚBLICO.
  //
  //   manifest.json -> raíz del repo. Define la versión y lista los
  //                    archivos con su sha256 y URL:
  //                      { "version": "0.1.3", "mods": [ { file, sha256, size, url, force? } ],
  //                        "config": [ ... ] }
  //                    mods  -> assets de los releases (descargas directas)
  //                    config-> archivos del repo sirviendo desde main
  //   version.json  -> compatibilidad con el diseño anterior (ya no es
  //                    la vía principal). modpack.js es la vía LEGACY.
  //
  // Al abrir el launcher se lee el manifiesto, se calcula el diff contra
  // la instancia (.pmc-cache.json guarda hashes de lo instalado) y se
  // descargan sólo los archivos que cambiaron. "JUGAR" pasa a
  // "ACTUALIZAR" cuando hay notas. También vale para reparar archivos
  // dañados (misma vía, versión idéntica).
  // --------------------------------------------------------
  GITHUB: {
    enabled: true,
    owner: "SR-KNOX",
    repo: "mi-server-mods",
    branch: "main",
    versionUrl: "https://raw.githubusercontent.com/SR-KNOX/mi-server-mods/refs/heads/main/version.json",
    // Respaldo si el manifiesto no responde (diseño anterior).
    downloadUrl: "https://github.com/SR-KNOX/mi-server-mods/releases/latest/download/mods.zip",
    // Vía principal actual: manifiesto por hashes (la API devuelve base64; ver src/lib/manifest.js).
    manifestUrl: "https://api.github.com/repos/SR-KNOX/mi-server-mods/contents/manifest.json?ref=main",
  },
};
