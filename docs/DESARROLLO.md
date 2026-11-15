# Desarrollo

Documentación técnica extendida de PMC Launcher. El README principal se centra en el jugador; aquí van los detalles para quienes quieran compilar, modificar o contribuir.

## Requisitos de desarrollo

- Node.js 20+
- npm
- Windows 10/11 (el build genera instalador NSIS para Windows)

## Comandos

```powershell
npm install
npm start        # modo desarrollo
npm run build    # instalador .exe en dist/
```

En PowerShell, si los scripts están bloqueados, usa `npm.cmd`.

## Configuración del modpack

Todo se controla desde `src/config.js`:

```js
MINECRAFT_VERSION: "1.20.1"
FORGE_VERSION: "1.20.1-47.4.28"
DEFAULT_RAM_GB: 4

GITHUB: {
  enabled: true,
  owner: "SR-KNOX",
  repo: "mi-server-mods",
  branch: "main",
  versionUrl: "https://raw.githubusercontent.com/SR-KNOX/mi-server-mods/refs/heads/main/version.json",
  downloadUrl: "https://github.com/SR-KNOX/mi-server-mods/releases/latest/download/mods.zip",
  manifestUrl: "https://api.github.com/repos/SR-KNOX/mi-server-mods/contents/manifest.json?ref=main",
}
```

## Actualizaciones desde GitHub (manifiesto por hashes, solo mods)

El modpack se publica en un repositorio **público** (`mi-server-mods`) con esta estructura:

```
mi-server-mods/
├─ manifest.json   <- { version, generatedAt, mods: [{file, sha256, size, url, force?}], config: [] }
├─ version.json    <- compatibilidad con el diseño anterior (legacy)
├─ logs.json       <- notas de cada actualización (pestaña Logs)
├─ config/...      <- CONFIG SOLO DE REFERENCIA, NO SE SINCRONIZA
└─ releases        <- assets = los .jar del modpack
```
- Al abrir el launcher se lee `manifest.json` (vía GitHub Contents API, en base64) y
  se calcula el diff contra `.pmc-cache.json` de la instancia (hash por archivo).
- Se descargan **solo** los archivos nuevos o cambiados; nada se re-descarga en vano.
- **La config NO se sincroniza** (decisión oficial): `config: []` en el manifiesto y la
  carpeta `config/` del repo es solo referencia. El servidor es la autoridad, no el
  cliente. El jugador puede editar/borrar/cambiar sus configs libremente sin que el
  launcher lo detecte, lo reclame ni lo repare. Nada de sync, nada de fusiones, nada
  de forzado (`force` ya no se usa).
- La carpeta `config/` en la instancia vive para los mods locales y el servidor;
  el launcher la crea y la deja en paz.
- `.proyectados-instance.json` guarda la versión instalada; si la carpeta de la
  instancia desaparece, el launcher vuelve a la pantalla de instalación.
- El mismo mecanismo sirve para **reparar** los mods: archivos borrados o corruptos
  se detectan por hash y se vuelven a descargar (los configs NO se tocan nunca).
## Logs (pestaña Logs)

`logs.json` vive en el mismo repositorio. Formato:

```json
{
  "schema": 1,
  "updated": "2026-11-13T00:00:00.000Z",
  "releases": [
    { "id": "0.1.3", "version": "0.1.3", "date": "2026-11-13", "title": "Notas de la 0.1.3",
      "items": [ { "type": "new", "text": "Se agregó JEI" } ] }
  ]
}
```

- `id` debe ser único por bloque publicado (recomendado: la versión). El launcher
  guarda el id visto en `localStorage["pmc.logsSeen"]` y muestra un punto verde +
  aviso «Nuevos cambios» si hay algo más nuevo. Al abrir la pestaña Logs se marca
  como visto y el punto desaparece.
- Independiente de las actualizaciones del modpack: pueden publicarse notas sin
  tocar la versión.
- Tipos: `new` (agregado), `change` (cambio/balance), `fix` (corregido),
  `remove` (retirado). Más reciente primero.
- Para publicar: editar `logs.json` en el repo y push a `main`.

## Estructura del proyecto

```
PMC_Launcher/
├─ package.json
├─ build/                    Iconos (.png + .ico multi-resolución)
├─ scripts/                  Utilidades (make-icon.js)
├─ src/
│   ├─ config.js             Configuración del modpack
│   ├─ main.js               Proceso principal de Electron
│   ├─ preload.js            Puente seguro UI <-> lógica
│   ├─ lib/
│   │   ├─ java.js           Detección de Java en el sistema
│   │   ├─ mc.js             Instalación de Forge, lanzamiento y volumen del juego
│   │   ├─ manifest.js       Manifiesto por hashes (diff, descarga y aplicación)
│   │   ├─ net.js            Descargas seguras (URLs permitidas, timeouts)
│   │   ├─ cds.js, jvm-profiles.js, game-settings-profiles.js, zip.js
│   │   └─ modpack.js        LEGACY: vía antigua por mods.zip (no usar)
│   └─ ui/                   Interfaz
│       ├─ index.html        Splash, bienvenida, inicio y páginas
│       ├─ assets/           Logos, Nunito (local) y fondo en video
│       ├─ css/              variables · base · components · screens
│       └─ js/               pantallas, servicios, ui
├─ tools/                    generate-manifest.js, packaged-check.js
└─ docs/                     Documentación y capturas
```

Reglas de la interfaz: las pantallas (`js/screens/`) solo manejan interfaz; todo lo que toque el sistema, la red o Git va en `services/`. La UI se sirve con el protocolo propio `app://` (no `file://`) para que los módulos ES funcionen igual que en una web. El fondo es el video `assets/video/bosque-bucle.*`; si no carga, se usa el bosque generado por código (`js/ui/forest.js` / `forest-gl.js`).

## Perfil del jugador

Se guarda fuera de la instancia:

```
%APPDATA%/Proyectados MC/profile.json
```

Contiene su Nick, la carpeta de la instancia, la RAM asignada, la skin, el volumen, qué hacer al abrir el juego, la última versión del modpack y la versión de Forge con la que se instaló.

## Java

Minecraft 1.20.1 + Forge 47.x necesita Java 17. Se prefiere una Java 17 del sistema o descargada en la instancia; si no hay ninguna, minecraft-java-core descarga el runtime de Mojang automáticamente antes de parchear.

## Distribución

El instalador NSIS queda en `dist/` tras `npm run build`. Se puede pasar a los jugadores directamente o publicar en GitHub Releases (el workflow `.github/workflows/build.yml` lo hace al pushear un tag `v*`).

## Contribuir

Ver [CONTRIBUTING.md](../CONTRIBUTING.md).

