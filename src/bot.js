import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { GAME_CONFIG } from './config.js';

export class CombatBot {
  constructor({ scene, world, player, playerHealth, targets }) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.playerHealth = playerHealth;
    this.targets = targets;
    this.cfg = GAME_CONFIG.bot;

    this.spawnPoint = new THREE.Vector3(6.5, 0, -4.5);
    this.group = new THREE.Group();
    this.health = this.cfg.maxHealth;
    this.alive = true;
    this.state = 'IDLE';
    this.fireCooldown = 0;
    this.respawnTimer = 0;
    this.searchTimer = 0;
    this.flashTimer = 0;
    this.muzzleTimer = 0;
    this.lastSeen = null;
    this.raycaster = new THREE.Raycaster();

    this.buildModel();
    this.resetPosition();
    scene.add(this.group);
    targets.registerHitMeshes([this.body, this.head]);
  }

  buildModel() {
    this.bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xd95757,
      roughness: 0.55,
      emissive: 0x000000
    });
    this.headMaterial = new THREE.MeshStandardMaterial({
      color: 0x7e2020,
      roughness: 0.5,
      emissive: 0x000000
    });

    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.72, 8, 16), this.bodyMaterial);
    this.body.position.y = 0.86;
    this.body.castShadow = true;
    this.group.add(this.body);

    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.30, 18, 14), this.headMaterial);
    this.head.position.y = 1.78;
    this.head.castShadow = true;
    this.group.add(this.head);

    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.12, 0.09),
      new THREE.MeshStandardMaterial({ color: 0x151b23, metalness: 0.2, roughness: 0.25 })
    );
    visor.position.set(0, 1.80, -0.27);
    this.group.add(visor);

    const gunMat = new THREE.MeshStandardMaterial({ color: 0x27323d, roughness: 0.45, metalness: 0.3 });
    this.gun = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.15, 0.58), gunMat);
    this.gun.position.set(0.34, 1.02, -0.42);
    this.group.add(this.gun);

    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0.34, 1.02, -0.76);
    this.group.add(this.muzzle);

    this.muzzleFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff765e })
    );
    this.muzzleFlash.position.copy(this.muzzle.position);
    this.muzzleFlash.visible = false;
    this.group.add(this.muzzleFlash);

    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(1.18, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x1a2028, side: THREE.DoubleSide, depthTest: false })
    );
    bg.position.set(0, 2.35, 0);
    bg.renderOrder = 10;
    this.group.add(bg);

    this.healthBar = new THREE.Mesh(
      new THREE.PlaneGeometry(1.10, 0.075),
      new THREE.MeshBasicMaterial({ color: 0x58d26f, side: THREE.DoubleSide, depthTest: false })
    );
    this.healthBar.position.set(0, 2.35, -0.01);
    this.healthBar.renderOrder = 11;
    this.group.add(this.healthBar);

    for (const mesh of [this.body, this.head]) {
      mesh.userData.combatTarget = this;
      mesh.userData.hitZone = mesh === this.head ? 'head' : 'body';
      mesh.userData.disabled = false;
    }
  }

  resetPosition() {
    this.group.position.copy(this.spawnPoint);
    this.group.visible = true;
    this.group.rotation.set(0, 0, 0);
  }

  update(dt, camera) {
    this.updateVisuals(dt, camera);

    if (!this.alive) {
      this.state = 'DEAD';
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn();
      return;
    }

    if (!this.playerHealth.alive) {
      this.state = 'IDLE';
      this.lastSeen = null;
      return;
    }

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);

    const botPos = this.group.position;
    const playerPos = this.player.group.position;
    const flatToPlayer = new THREE.Vector3(playerPos.x - botPos.x, 0, playerPos.z - botPos.z);
    const distance = flatToPlayer.length();

    if (distance > this.cfg.detectionRange) {
      this.state = 'IDLE';
      this.lastSeen = null;
      return;
    }

    const hasSight = this.hasLineOfSight();
    if (hasSight) {
      this.lastSeen = playerPos.clone();
      this.searchTimer = this.cfg.searchDuration;
    } else {
      this.searchTimer = Math.max(0, this.searchTimer - dt);
    }

    if (hasSight && distance <= this.cfg.attackRange) {
      this.state = 'ATTACK';
      this.facePosition(playerPos, dt);

      if (distance > this.cfg.preferredRange + 1.2) {
        this.moveToward(playerPos, dt, 0.55);
      } else if (distance < this.cfg.preferredRange - 1.8) {
        this.moveAway(playerPos, dt, 0.42);
      }

      if (this.fireCooldown <= 0) this.fire();
      return;
    }

    if (hasSight) {
      this.state = 'CHASE';
      this.facePosition(playerPos, dt);
      this.moveToward(playerPos, dt, 1);
      return;
    }

    if (this.lastSeen && this.searchTimer > 0) {
      this.state = 'SEARCH';
      this.facePosition(this.lastSeen, dt);
      this.moveToward(this.lastSeen, dt, 0.8);
      if (flatDistance(this.group.position, this.lastSeen) < 0.8) {
        this.searchTimer = 0;
      }
      return;
    }

    this.state = 'IDLE';
  }

  hasLineOfSight() {
    const origin = this.group.position.clone().add(new THREE.Vector3(0, 1.45, 0));
    const target = this.player.group.position.clone().add(new THREE.Vector3(0, 1.10, 0));
    const direction = target.clone().sub(origin);
    const distance = direction.length();
    if (distance <= 0.001) return true;
    direction.normalize();

    this.raycaster.set(origin, direction);
    this.raycaster.near = 0.05;
    this.raycaster.far = Math.max(0.05, distance - 0.10);
    const hits = this.raycaster.intersectObjects(this.world.cameraObstacles, false);
    return hits.length === 0;
  }

  moveToward(target, dt, multiplier = 1) {
    const direction = new THREE.Vector3(
      target.x - this.group.position.x,
      0,
      target.z - this.group.position.z
    );
    if (direction.lengthSq() < 0.0001) return;
    direction.normalize();
    this.moveWithCollision(direction.x * this.cfg.moveSpeed * multiplier * dt, direction.z * this.cfg.moveSpeed * multiplier * dt);
  }

  moveAway(target, dt, multiplier = 1) {
    const direction = new THREE.Vector3(
      this.group.position.x - target.x,
      0,
      this.group.position.z - target.z
    );
    if (direction.lengthSq() < 0.0001) return;
    direction.normalize();
    this.moveWithCollision(direction.x * this.cfg.moveSpeed * multiplier * dt, direction.z * this.cfg.moveSpeed * multiplier * dt);
  }

  moveWithCollision(dx, dz) {
    const oldX = this.group.position.x;
    const oldZ = this.group.position.z;

    if (!this.wouldCollide(oldX + dx, oldZ)) this.group.position.x += dx;
    if (!this.wouldCollide(this.group.position.x, oldZ + dz)) this.group.position.z += dz;

    const ground = this.world.groundHeightAt(this.group.position.x, this.group.position.z);
    this.group.position.y = ground;
  }

  wouldCollide(x, z) {
    const r = this.cfg.radius;
    const bottom = this.group.position.y;
    const top = bottom + 1.95;

    for (const collider of this.world.colliders) {
      const b = collider.box;
      const overlapsY = bottom < b.max.y && top > b.min.y;
      if (!overlapsY) continue;

      const hit =
        x + r > b.min.x &&
        x - r < b.max.x &&
        z + r > b.min.z &&
        z - r < b.max.z;

      if (hit) return true;
    }
    return false;
  }

  facePosition(target, dt) {
    const dx = target.x - this.group.position.x;
    const dz = target.z - this.group.position.z;
    const targetYaw = Math.atan2(dx, dz) + Math.PI;
    this.group.rotation.y = dampAngle(this.group.rotation.y, targetYaw, 12, dt);
  }

  fire() {
    if (!this.alive || !this.playerHealth.alive || !this.hasLineOfSight()) return;

    this.fireCooldown = 1 / this.cfg.fireRate;
    this.muzzleTimer = 0.055;
    this.muzzleFlash.visible = true;

    const muzzlePos = new THREE.Vector3();
    this.muzzle.getWorldPosition(muzzlePos);
    const target = this.player.group.position.clone().add(new THREE.Vector3(0, 1.0, 0));
    this.spawnTracer(muzzlePos, target);
    this.playerHealth.takeDamage(this.cfg.damage, this.group.position);
  }

  spawnTracer(from, to) {
    const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
    const material = new THREE.LineBasicMaterial({ color: 0xff7867, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geometry, material);
    this.scene.add(line);

    setTimeout(() => {
      this.scene.remove(line);
      geometry.dispose();
      material.dispose();
    }, 65);
  }

  takeWeaponDamage(hitZone, baseDamage, headshotMultiplier) {
    if (!this.alive) return null;

    const headshot = hitZone === 'head';
    const damage = Math.round(baseDamage * (headshot ? headshotMultiplier : 1));
    this.health = Math.max(0, this.health - damage);
    this.flashTimer = 0.09;
    this.bodyMaterial.emissive.setHex(headshot ? 0xff8a42 : 0xffffff);
    this.headMaterial.emissive.setHex(headshot ? 0xff8a42 : 0xffffff);
    this.updateHealthBar();

    let eliminated = false;
    if (this.health <= 0) {
      eliminated = true;
      this.die();
    }

    return {
      damage,
      headshot,
      eliminated,
      health: this.health
    };
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.state = 'DEAD';
    this.respawnTimer = this.cfg.respawnDelay;
    this.group.visible = false;
    this.body.userData.disabled = true;
    this.head.userData.disabled = true;
  }

  respawn() {
    this.health = this.cfg.maxHealth;
    this.alive = true;
    this.state = 'IDLE';
    this.respawnTimer = 0;
    this.searchTimer = 0;
    this.lastSeen = null;
    this.body.userData.disabled = false;
    this.head.userData.disabled = false;
    this.bodyMaterial.emissive.setHex(0x000000);
    this.headMaterial.emissive.setHex(0x000000);
    this.updateHealthBar();
    this.resetPosition();
  }

  updateHealthBar() {
    const ratio = Math.max(0, this.health / this.cfg.maxHealth);
    this.healthBar.scale.x = Math.max(0.001, ratio);
    this.healthBar.position.x = -(1 - ratio) * 0.55;
  }

  updateVisuals(dt, camera) {
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        this.bodyMaterial.emissive.setHex(0x000000);
        this.headMaterial.emissive.setHex(0x000000);
      }
    }

    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= dt;
      if (this.muzzleTimer <= 0) this.muzzleFlash.visible = false;
    }

    if (camera && this.group.visible) {
      const q = camera.quaternion;
      this.healthBar.parent.children
        .filter((child) => child === this.healthBar || child.geometry?.type === 'PlaneGeometry')
        .forEach((child) => child.quaternion.copy(q));
    }
  }
}

function flatDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function dampAngle(current, target, lambda, dt) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * (1 - Math.exp(-lambda * dt));
}
