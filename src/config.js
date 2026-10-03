export const GAME_CONFIG = {
  movement: {
    walkSpeed: 5.2,
    sprintSpeed: 8.4,
    crouchSpeed: 2.8,
    acceleration: 22,
    deceleration: 28,
    airAcceleration: 7.5,
    jumpVelocity: 8.6,
    gravity: 24,
    slideInitialSpeed: 11.5,
    slideDuration: 0.72,
    slideFriction: 8,
    radius: 0.45,
    standingHeight: 1.8,
    crouchHeight: 1.15
  },
  camera: {
    distance: 5.4,
    adsDistance: 3.15,
    height: 1.6,
    shoulderOffset: 0.75,
    adsShoulderOffset: 0.92,
    normalFov: 68,
    adsFov: 57,
    sensitivity: 0.0024,
    pitchMin: -0.7,
    pitchMax: 1.1,
    collisionPadding: 0.22
  },
  tacticalAR: {
    damage: 27,
    headshotMultiplier: 1.5,
    fireRate: 8.5,
    magazineSize: 30,
    reloadTime: 1.55,
    range: 90,
    hipBloom: 0.012,
    adsBloom: 0.0032,
    recoilPitch: 0.010,
    recoilYaw: 0.0045
  },
  playerCombat: {
    maxHealth: 100,
    maxShield: 100,
    respawnDelay: 2.5
  },
  bot: {
    maxHealth: 100,
    moveSpeed: 3.4,
    detectionRange: 28,
    attackRange: 15,
    preferredRange: 9,
    damage: 12,
    fireRate: 2.2,
    respawnDelay: 2.5,
    searchDuration: 2.2,
    radius: 0.42
  }
};
