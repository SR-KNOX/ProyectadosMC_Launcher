/* Configuración central. Todo valor "mágico" del launcher vive aquí. */
export const CONFIG = {
  app: {
    name: 'PROYECTADOS',
    version: '1.0.0',          // versión del launcher (se muestra en la barra lateral)
  },

  game: {
    minecraftVersion: '1.20.1',
    javaVersion: 17,
  },

  modpack: {
    defaultLocalVersion: '0.2.1',
    // Descripción de la tarjeta principal del inicio (temporada actual).
    description: 'Modpack desarrollado por RAYX para Minecraft 1.20.1 con Forge. Esta primera temporada marca el inicio de nuestro proyecto: una experiencia experimental en la que combinamos mods públicos con contenido y modificaciones creadas por nuestro propio equipo. Durante esta etapa estaremos probando, ajustando y perfeccionando el modpack para ofrecer una experiencia cada vez mejor. Con cada nueva temporada llegarán mejoras, novedades y contenido que harán evolucionar el mundo de nuestros jugadores.',
  },

  // Enlaces del launcher. TODO: poner aquí las direcciones reales (https://...). Vacío = el botón avisa que aún no está configurado.
  links: {
    store: '',     // tienda
    discord: 'https://discord.gg/2u582GpU5R',   // invitación al servidor de Discord
  },

  // Logs remotos (GitHub). Mismo repo que el modpack. Si falla, se usa CONFIG.changelog.
  logs: {
    url: 'https://raw.githubusercontent.com/SR-KNOX/mi-server-mods/main/logs.json',
    fallbackUrl: 'https://cdn.jsdelivr.net/gh/SR-KNOX/mi-server-mods@main/logs.json',
  },

  // Estado del servidor (ver services/server.js: consulta a la API de mcsrvstat.us, con los
  // jugadores/max que publique el servidor; si no responde, se muestra Fuera de línea).
  server: {
    name: 'Servidor de PROYECTADOS',
    address: '69.41.184.167:25586',
    pollMs: 30000,                     // cada cuánto se vuelve a consultar (ms)
    fallbackMaxPlayers: 30,            // máximo mostrado si la API no indica el real
  },

  // «Sobre nosotros» (textos del estudio).
  about: {
    studio: 'Todo comenzó con un grupo de amigos, una pasión compartida por los videojuegos y las ganas de crear algo más que simples partidas. Lo que inicialmente nació alrededor de Minecraft y de un proyecto propio de modpacks, poco a poco comenzó a convertirse en una idea mucho más grande. Así nació RAYX, con el propósito de transformar esa pasión en un espacio dedicado a crear, compartir y entretener.\n\nNuestro objetivo es abrirnos camino en el mundo del streaming y la creación de contenido, construyendo una comunidad donde cada partida, proyecto y transmisión sea una oportunidad para divertirnos y compartir nuevas experiencias.\n\nMinecraft es solo el comienzo. Con el tiempo queremos expandir nuestros proyectos, desarrollar contenido propio, explorar nuevos juegos y descubrir hasta dónde podemos llegar junto a nuestra comunidad.\n\nEsto es RAYX: un proyecto que comienza entre amigos, crece con la comunidad y no tiene límites para lo que está por venir.',
    project: 'Todo comenzó con un grupo de amigos, un modpack de más de 200 mods y un problema que se repetía cada fin de semana: alguien quería jugar y comenzaba la misma odisea de siempre. Capturas de pantalla, carpetas equivocadas, mods faltantes y el ya clásico: «A mí no me abre».\n\nDurante meses fui quien se conectaba de madrugada para ayudar a los demás a solucionar sus instalaciones, buscando errores y arreglando problemas para que todos pudieran disfrutar de la partida.\n\nHasta que una noche decidí que aquello tenía que cambiar: nadie más debería pasar por ese proceso para simplemente jugar con sus amigos. De esa necesidad nació PMCL, con una idea clara: simplificar la experiencia, eliminar complicaciones y permitir que lo verdaderamente importante fuera jugar, explorar y disfrutar junto a la comunidad.',
  },

  // Noticias del banner del inicio. La primera «diapositiva» siempre es el modpack; estas van después y el ciclo vuelve al modpack.
  // Cada noticia: { tag, title, text, image?, url? }. image = fondo del banner (1376×768 recomendado, mejor .webp); url = botón «Leer más».
  news: {
    intervalMs: 10000,   // tiempo que se muestra cada noticia
    items: [
      { tag: 'Novedad', image: 'assets/news/novedad.webp', title: 'Las Tierras Intermedias', text: 'Un mundo que alguna vez estuvo en equilibrio ahora se encuentra amenazado por una antigua fuerza que busca consumir toda forma de vida. Ante el despertar de Morth­ael, el Segador del Fin, una entidad cuyo propósito es sumir al mundo en la oscuridad eterna, la deidad superior Aetherion ha convocado a un grupo de elegidos provenientes de otros mundos. Su misión será explorar las Tierras Intermedias, sobrevivir a las amenazas que acechan en ellas y enfrentarse a las hordas de criaturas enviadas por Morth­ael. Pero el camino no será sencillo. Antiguos guardianes, poderosos enemigos y territorios corrompidos se interpondrán entre los elegidos y su verdadero objetivo.' },
      { tag: 'Evento', image: 'assets/news/evento.webp', title: 'El inicio', text: 'La aventura en las Tierras Intermedias ha comenzado. Tras vuestra llegada a este nuevo mundo, es momento de explorar sus territorios, descubrir los recursos que ofrece y encontrar un lugar al que llamar hogar. Vuestra primera misión será organizaros en grupos, explorar el entorno y establecer un asentamiento donde comenzar a construir vuestras bases. Preparad vuestros recursos, reunid aliados y sentad las primeras piedras de vuestro futuro. Lo que hoy será un pequeño refugio, mañana podría convertirse en vuestro hogar y fortaleza ante las amenazas que se avecinan. Las Tierras Intermedias os esperan. ¡Que comience la aventura!.' },
      { tag: 'Actualización', image: 'assets/news/actualizacion.webp', title: 'Notas de la versión', text: '¡Nuevos desafíos se aproximan a las Tierras Intermedias!. En las próximas actualizaciones llegarán eventos especiales protagonizados por jefes colosales, enemigos de gran poder que pondrán a prueba las habilidades y la preparación de los jugadores. Quienes logren derrotarlos podrán obtener recompensas únicas, materiales especiales y nuevos recursos que permitirán mejorar su equipamiento y progresar en su aventura. Cada enfrentamiento será un nuevo paso en el descubrimiento de los secretos y la historia de las Tierras Intermedias. Prepara tu equipo, reúne aliados y prepárate para lo que está por venir.' },
    ],
  },

  // LOGS (historial de cambios) — respaldo OFFLINE si GitHub no responde.
  // Formato actual: { schema: 1, updated: ISO, releases: [ { id, version, date, title, items: [{ type, text }] } ] }
  // 'id' es obligatorio y debe ser único por actualización publicada (recomendado: la versión del pack);
  // el launcher lo usa para el punto verde de "no visto". Los releases van de más nuevo a más viejo.
  // El archivo oficial vive en el repo mi-server-mods como logs.json.
  changelog: {
    schema: 1,
    updated: '2026-11-15T00:00:00.000Z',
    releases: [
      { id: '0.2.1', version: '0.2.1', date: '2026-11-15', title: 'Notas de la 0.2.1',
        items: [
          { type: 'change', text: 'Chloride actualizado a la versión 1.8.1' },
          { type: 'remove', text: 'Se retiró EverlastingSkins del pack' },
        ] },
      { id: '0.2.0', version: '0.2.0', date: '2026-11-14', title: 'Notas de la 0.2.0',
        items: [
          { type: 'new', text: 'Menú personalizado de PROYECTADOS' },
          { type: 'change', text: 'JEI actualizado a la versión 15.74.0.234' },
        ] },
      { id: '0.1.3', version: '0.1.3', date: '2026-11-13', title: 'Notas de la 0.1.3',
        items: [
          { type: 'new', text: 'Se agregó JEI' },
          { type: 'new', text: 'Se agregó WallJump' },
        ] },
    ],
  },

  // Contacto del estudio (sección «El estudio» de Sobre nosotros): un botón por persona.
  contact: [
    { name: 'knox', url: 'https://discord.com/users/934329981646028810' },
    { name: 'D0B6R0T', url: 'https://discord.com/users/726945904958898254' },
  ],

  nick: {
    min: 3,
    max: 16,
    pattern: /^\w{3,16}$/,
  },

  // Memoria RAM del juego (GB). El máximo real depende de la RAM del equipo (ver services/system.js).
  ram: {
    min: 2,
    step: 0.5,
    default: 4,
    recommended: '4–6 GB',   // texto de ayuda para este modpack
    reserveShare: 0.25,       // se deja libre al menos este % de la RAM para el sistema
  },

  skin: {
    maxBytes: 200 * 1024,   // límite del archivo
    sizes: ['64x64', '64x32'],
  },

  // Capa: PNG de 64×32 (o 22×17 de formato antiguo) y sus versiones HD (×2, ×4…: 128×64, 256×128…).
  cape: {
    maxBytes: 400 * 1024,
    maxScale: 8,            // hasta 512×256
  },

  // Tiempos de animación del launcher (ms)
  timing: {
    stepDelay: 900,
    launchDelay: 1200,
  },

  // Claves de localStorage
  storageKeys: {
    nick: 'nick',
    folder: 'folder',
    ram: 'ram',               // GB asignados al juego
    skin: 'skin',             // PNG de la skin (data URL)
    skinModel: 'skinModel',   // 'classic' | 'slim'
    cape: 'cape',             // PNG de la capa (data URL)
    played: 'played',         // '1' cuando el jugador ya lanzó el juego (desde ahí el nombre solo se cambia por ticket en Discord)
    logsSeen: 'pmc.logsSeen', // id del bloque de logs más reciente que ya vio el jugador (punto verde del sidebar)
    perfLevel: 'pmc.perfLevel',
  },
};
