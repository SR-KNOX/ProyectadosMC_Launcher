// Perfiles de ajustes del juego (options.txt) según hardware. Editar aquí.
// Solo se escriben las claves que falten: no se sobrescriben cambios del jugador.
const profiles = {
  low: {
    renderDistance: 6,
    simulationDistance: 6,
    entityDistance: 0.5,
    particles: 2,
    biomeBlendRadius: 1,
    mipmapLevels: 2,
    maxFps: 60,
    graphicsMode: 0,
    smoothLighting: 0,
    vsync: true,
  },
  medium: {
    renderDistance: 8,
    simulationDistance: 8,
    entityDistance: 1.0,
    particles: 1,
    biomeBlendRadius: 2,
    mipmapLevels: 4,
    maxFps: 120,
    graphicsMode: 1,
    smoothLighting: 1,
    vsync: true,
  },
  high: {
    renderDistance: 12,
    simulationDistance: 12,
    entityDistance: 2.0,
    particles: 0,
    biomeBlendRadius: 3,
    mipmapLevels: 4,
    maxFps: 240,
    graphicsMode: 1,
    smoothLighting: 2,
    vsync: false,
  },
};

function selectProfile(hardware) {
  const { selectProfile } = require("./jvm-profiles");
  return selectProfile(hardware);
}

module.exports = { profiles, selectProfile };