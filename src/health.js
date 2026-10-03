import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { GAME_CONFIG } from './config.js';

export class PlayerHealth {
  constructor({ player, world, cameraRig, onChange, onDamage, onShieldBreak, onEliminated, onRespawn }) {
    this.player = player;
    this.world = world;
    this.cameraRig = cameraRig;
    this.cfg = GAME_CONFIG.playerCombat;

    this.onChange = onChange;
    this.onDamage = onDamage;
    this.onShieldBreak = onShieldBreak;
    this.onEliminated = onEliminated;
    this.onRespawn = onRespawn;

    this.health = this.cfg.maxHealth;
    this.shield = this.cfg.maxShield;
    this.alive = true;
    this.respawnTimer = 0;
    this.zoneInside = new Map();

    for (const zone of world.damageZones) this.zoneInside.set(zone, false);
    this.emitChange();
  }

  update(dt) {
    if (!this.alive) {
      this.respawnTimer = Math.max(0, this.respawnTimer - dt);
      if (this.respawnTimer <= 0) this.respawn();
      return;
    }

    const p = this.player.group.position;
    for (const zone of this.world.damageZones) {
      const inside =
        p.x >= zone.minX && p.x <= zone.maxX &&
        p.z >= zone.minZ && p.z <= zone.maxZ;

      const wasInside = this.zoneInside.get(zone) ?? false;
      if (inside && !wasInside) {
        this.takeDamage(zone.damage, zone.source);
      }
      this.zoneInside.set(zone, inside);
    }
  }

  takeDamage(amount, sourcePosition = null) {
    if (!this.alive || amount <= 0) return null;

    const shieldBefore = this.shield;
    const healthBefore = this.health;
    let remaining = amount;

    const shieldDamage = Math.min(this.shield, remaining);
    this.shield -= shieldDamage;
    remaining -= shieldDamage;

    const healthDamage = Math.min(this.health, remaining);
    this.health -= healthDamage;

    const shieldBroken = shieldBefore > 0 && this.shield === 0;
    const direction = sourcePosition ? this.directionFromSource(sourcePosition) : 0;

    const result = {
      requestedDamage: amount,
      shieldDamage,
      healthDamage,
      shieldBefore,
      healthBefore,
      shield: this.shield,
      health: this.health,
      shieldBroken,
      direction
    };

    this.emitChange();
    this.onDamage?.(result);
    if (shieldBroken) this.onShieldBreak?.(result);

    if (this.health <= 0) this.eliminate();
    return result;
  }

  restoreArmor(amount) {
    if (!this.alive || amount <= 0) return 0;
    const before = this.shield;
    this.shield = Math.min(this.cfg.maxShield, this.shield + amount);
    const restored = this.shield - before;
    if (restored > 0) this.emitChange();
    return restored;
  }

  eliminate() {
    if (!this.alive) return;
    this.alive = false;
    this.respawnTimer = this.cfg.respawnDelay;
    this.player.velocity.set(0, 0, 0);
    this.player.group.visible = false;
    this.onEliminated?.({ respawnDelay: this.cfg.respawnDelay });
  }

  respawn() {
    this.health = this.cfg.maxHealth;
    this.shield = this.cfg.maxShield;
    this.alive = true;
    this.respawnTimer = 0;
    this.player.resetAt(this.world.spawnPoint);
    for (const zone of this.world.damageZones) this.zoneInside.set(zone, false);
    this.emitChange();
    this.onRespawn?.();
  }

  directionFromSource(sourcePosition) {
    const p = this.player.group.position;
    const dx = sourcePosition.x - p.x;
    const dz = sourcePosition.z - p.z;
    const sourceAngle = Math.atan2(dx, -dz);
    const relative = sourceAngle - this.cameraRig.yaw;
    return THREE.MathUtils.radToDeg(Math.atan2(Math.sin(relative), Math.cos(relative)));
  }

  emitChange() {
    this.onChange?.({
      health: this.health,
      shield: this.shield,
      maxHealth: this.cfg.maxHealth,
      maxShield: this.cfg.maxShield,
      alive: this.alive
    });
  }
}
