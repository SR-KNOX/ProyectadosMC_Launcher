<div align="center">

# ⛏️ PMC Launcher

### Tu modpack Minecraft 1.20.1 + Forge, listo en un clic

[![Versión](https://img.shields.io/badge/versi%C3%B3n-1.0.0-7c3aed?style=for-the-badge&logo=github)](https://github.com/SR-KNOX/PMC_Launcher/releases)
[![Plataforma](https://img.shields.io/badge/plataforma-Windows-0078D6?style=for-the-badge&logo=windows)](https://github.com/SR-KNOX/PMC_Launcher)
[![Electron](https://img.shields.io/badge/Electron-45-47848F?style=for-the-badge&logo=electron)](https://www.electronjs.org/)
[![Licencia](https://img.shields.io/badge/licencia-MIT-22c55e?style=for-the-badge)](./LICENSE)
[![Hecho con](https://img.shields.io/badge/hecho%20con-%E2%9D%A4%EF%B8%8F%20y%20caf%C3%A9-ff69b4?style=for-the-badge)](https://github.com/SR-KNOX/PMC_Launcher)

<p>
  <a href="https://github.com/SR-KNOX/PMC_Launcher/releases/latest"><b>⬇️ Descargar instalador (.exe)</b></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/SR-KNOX/PMC_Launcher/issues">🐛 Reportar un bug</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/vD0B3R0Tv">✨ Créditos a Dobe</a>
</p>

<img src="docs/screenshots/home.png" alt="PMC Launcher — menú principal" width="90%">

</div>

---

## ✨ ¿Qué es PMC Launcher?

**PMC Launcher** es un launcher de escritorio construido con **Electron** para el modpack
**Proyectados MC · RAYX Studios** (Minecraft **1.20.1 + Forge 1.20.1-47.4.28**).

Está pensado para que **tus amigos jueguen sin complicaciones**: descargan un `.exe`,
lo instalan con doble clic y el launcher se encarga de todo — instalar Forge, preparar
la instancia, descargar los mods desde GitHub y lanzar el juego. **Sin cuenta de
Mojang, sin configurar nada a mano.**

> Proyecto no oficial. Minecraft © Mojang AB.

---

## 🚀 Características

<table>
  <tr>
    <td width="50%">

### 🎮 Para el jugador
- **Cuenta offline** — solo pide un nick (3–16 caracteres).
- **Instalación guiada** — elige la carpeta y la RAM; el launcher hace el resto.
- **Forge automático** — instala `1.20.1-47.4.28` y prepara `mods/` y `config/`.
- **Menú de cristal** — Jugar, Opciones y Salir sobre un fondo de video en bucle.
- **Skin personalizada** — sube un PNG 64×64 o 64×32, modelo Clásico/Delgado, con vista previa.
- **RAM ajustable** — desde el mínimo hasta la RAM total del equipo, con aviso al pasar del 80 % (pasos de 0,5 GB).
- **Volumen sincronizado** — el control del launcher escribe el volumen en el `options.txt` del juego.
- **El juego nunca se cae** — se lanza en modo *detached*: cerrar el launcher no cierra Minecraft.

    </td>
    <td width="50%">

### 🛠️ Para el desarrollador
- **Actualizaciones desde GitHub** (manifiesto por hashes) — se descarga solo lo que cambia: `manifest.json` lista mods (assets de releases) con sha256 y tamaño; `.pmc-cache.json` de la instancia registra lo instalado.
- **Config sin sync** — la config del cliente es de su dueño (el servidor es la autoridad): no se descarga, no se sobrescribe, no se repara. `config/` del repo es solo referencia.
- **Java 17 administrado** — descarga automática de Temurin (Adoptium) si hace falta, con respaldo en runtime de instancia o Java 17 del sistema.
- **Protocolo propio `app://`** — la UI se sirve como módulos ES, sin `file://`.
- **Fondo adaptativo** — video en bucle con fallback a bosque generado por código.
- **Perfil persistente** — `%APPDATA%/Proyectados MC/profile.json`.
- **Detección de instancia borrada** — si falta la carpeta, vuelve a la pantalla de instalación.
- **Logs estilo "últimas novedades"** — `logs.json` en el mismo repo: punto verde en la barra lateral y aviso «Nuevos cambios» cuando hay notas sin leer.
- **Build en un comando** — `npm run build` genera el instalador NSIS en `dist/`.

    </td>
  </tr>
</table>

---

## 📸 Capturas

| Menú principal | Instalación | Actualización |
|:---:|:---:|:---:|
| ![Menú principal](docs/screenshots/home.png) | ![Instalación](docs/screenshots/install.png) | ![Actualización](docs/screenshots/update.png) |
| ![Aviso de actualización](docs/screenshots/update-banner.png) | | |

---

## 📦 Requisitos

- **Windows** (10/11).
- **Java 17**. El launcher lo administra y lo descarga automáticamente (Temurin/Adoptium) si hace falta, con respaldo en un runtime de la instancia o en un Java 17 del sistema. Si no hay ninguno disponible, `minecraft-java-core` puede descargar el runtime de Java necesario.
- Conexión a internet la primera vez (para instalar Forge y descargar los mods).

---

## ⬇️ Instalación para jugadores

1. Ve a la [página de Releases](https://github.com/SR-KNOX/PMC_Launcher/releases/latest).
2. Descarga **`Proyectados MC Setup x.x.x.exe`**.
3. Ejecútalo con doble clic e instala (elige la carpeta si quieres).
4. Abre **Proyectados MC** desde el acceso directo del escritorio.
5. Escribe tu nick y… ¡a jugar! 🎉

---

## 🧑‍💻 Desarrollo y build

```powershell
# Clonar
git clone https://github.com/SR-KNOX/PMC_Launcher.git
cd PMC_Launcher

# Instalar dependencias
npm install

# Ejecutar en modo desarrollo
npm start

# Compilar instalador (.exe) -> carpeta dist/
npm run build
```

> En PowerShell, si los scripts están bloqueados, usa `npm.cmd` en lugar de `npm`.

---

## ⚙️ Configuración (`src/config.js`)

Todo el modpack se controla desde un único archivo:

```js
MINECRAFT_VERSION: "1.20.1",        // versión de Minecraft
FORGE_VERSION: "1.20.1-47.4.28",    // Forge fijo del modpack
DEFAULT_RAM_GB: 4,                  // RAM por defecto para un perfil nuevo

GITHUB: {
  enabled: true,                    // activar actualizaciones
  owner: "SR-KNOX",                 // tu usuario de GitHub
  repo: "mi-server-mods",           // repo público con manifiesto + releases
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
├─ logs.json       <- notas de cada actualización (sección Logs)
├─ config/...      <- CONFIG SOLO DE REFERENCIA, NO SE SINCRONIZA
└─ releases        <- assets = los .jar del modpack
```

- Al abrir el launcher se lee `manifest.json` (vía GitHub Contents API, en base64) y
  se calcula el diff contra `.pmc-cache.json` de la instancia (hash por archivo).
- Se descargan **solo** los archivos nuevos o cambiados; nada se re-descarga en vano.
- **La config NO se sincroniza** (decisión oficial): `config: []` y la carpeta
  `config/` del repo es solo referencia. El servidor es la autoridad, no el cliente.
  El jugador puede editar/borrar/cambiar sus configs libremente sin que el launcher
  lo detecte, lo reclame ni lo repare. Nada de sync, nada de fusiones (`force` ya no se usa).
- `.proyectados-instance.json` guarda la versión instalada; si la carpeta de la
  instancia desaparece, el launcher vuelve a la pantalla de instalación.
- El mismo mecanismo sirve para **reparar** los mods: archivos borrados o corruptos
  se detectan por hash y se vuelven a descargar (los configs NO se tocan nunca).

---

## 📦 Estructura del proyecto

```
PMC_Launcher/
├─ package.json
├─ build/                    Iconos (.png + .ico multi-resolución)
├─ scripts/                  Utilidades (make-icon.js)
├─ src/
│   ├─ config.js             Configuración del modpack (Minecraft/Forge/RAM + GitHub)
│   ├─ main.js               Proceso principal de Electron
│   ├─ preload.js            Puente seguro UI <-> lógica
│   ├─ lib/
│   │   ├─ java.js           Detección de Java en el sistema
│   │   ├─ mc.js             Instalación de Forge, lanzamiento y volumen del juego
│   │   ├─ manifest.js       Manifiesto por hashes (diff, descarga y aplicación)
│   │   ├─ net.js            Descargas seguras (URLs permitidas, timeouts)
│   │   ├─ cds.js            CDS / optimización de inicio
│   │   ├─ game-settings-profiles.js
│   │   ├─ jvm-profiles.js
│   │   ├─ zip.js
│   │   └─ modpack.js        LEGACY: vía antigua por mods.zip (no usar)
│   └─ ui/                   INTERFAZ (Electron)
│       ├─ index.html        Splash, bienvenida, inicio y páginas
│       ├─ assets/           Logos, Nunito (local, sin CDN) y fondo en video
│       ├─ css/              variables · base · components · screens
│       └─ js/               pantallas, servicios, ui
├─ tools/                    generate-manifest.js, packaged-check.js
└─ docs/                     Documentación extendida y capturas
```

### Reglas de la interfaz

- Las **pantallas** (`js/screens/`) solo manejan interfaz; todo lo que toque el
  sistema, la red o Git va en **services/**.
- La UI se sirve con el protocolo propio `app://` (no `file://`) para que los
  módulos ES funcionen igual que en una web.
- El **fondo** es el video `assets/video/bosque-bucle.*`; si no carga (o el equipo
  ahorra datos o pide menos movimiento), se usa el bosque generado por código
  (`js/ui/forest.js` / `forest-gl.js`).

---

## 💾 Perfil de cada jugador

Se guarda fuera de la instancia, en la carpeta de datos de la app:

```
%APPDATA%/Proyectados MC/profile.json
```

Contiene su Nick, la carpeta de la instancia, la RAM asignada, la skin, el volumen,
qué hacer al abrir el juego, la última versión del modpack y la versión de Forge con
la que se instaló. Por eso la segunda vez todo carga solo.

---

## 🤝 Créditos

Este proyecto no sería lo mismo sin la gente que lo hizo posible:

- 🧑‍💻 **[SR-KNOX](https://github.com/SR-KNOX)** — autor del launcher y del modpack Proyectados MC.
- ✨ **[Dobe](https://github.com/vD0B3R0Tv)** — ayuda, soporte y colaboración en el desarrollo del launcher.
- 🔧 Instalación/lanzamiento de Minecraft y Forge: [`minecraft-java-core`](https://www.npmjs.com/package/minecraft-java-core) (Luuxis).
- 🔤 Tipografía: [Nunito](https://fonts.google.com/specimen/Nunito) (OFL), servida localmente desde `assets/fonts/` — sin conexiones externas.
- ⚡ Framework: [Electron](https://www.electronjs.org/) + [electron-builder](https://www.electron.build/).
- 🎨 Diseño e interfaz: **RAYX Studios**.

> ¿Te gustó el proyecto? Dale una ⭐ al repo y síguenos.
> Un agradecimiento especial a **[@vD0B3R0Tv (Dobe)](https://github.com/vD0B3R0Tv)** por su ayuda en el desarrollo. 💜

### 👥 Contribuidores

<a href="https://github.com/SR-KNOX/PMC_Launcher/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=SR-KNOX/PMC_Launcher" alt="Contribuidores" />
</a>

Hecho con ayuda de **[Dobe](https://github.com/vD0B3R0Tv)** y **[SR-KNOX](https://github.com/SR-KNOX)**.

---

## 📜 Licencia

Distribuido bajo licencia **MIT**. Consulta [`LICENSE`](./LICENSE) para más detalles.

---

<div align="center">

Hecho con 💜 por **[SR-KNOX](https://github.com/SR-KNOX)** y **[Dobe](https://github.com/vD0B3R0Tv)** · Proyectados MC · RAYX Studios

</div>
