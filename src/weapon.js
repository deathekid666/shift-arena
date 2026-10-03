import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { GAME_CONFIG, WEAPON_ORDER } from './config.js';

export class WeaponSystem {
  constructor({ scene, camera, cameraRig, player, input, world, targets, onHit, onFire, onSwitch }) {
    this.scene = scene;
    this.camera = camera;
    this.cameraRig = cameraRig;
    this.player = player;
    this.input = input;
    this.world = world;
    this.targets = targets;
    this.onHit = onHit;
    this.onFire = onFire;
    this.onSwitch = onSwitch;

    this.cameraRay = new THREE.Raycaster();
    this.muzzleRay = new THREE.Raycaster();
    this.center = new THREE.Vector2(0, 0);
    this.activeIndex = 0;

    this.entries = WEAPON_ORDER.map((key) => {
      const cfg = GAME_CONFIG.weapons[key];
      const model = this.buildModel(cfg);
      const state = {
        ammo: cfg.magazineSize,
        fireCooldown: 0,
        reloadTimer: 0,
        flashTimer: 0,
        isReloading: false
      };
      return { key, cfg, model, state };
    });

    this.entries.forEach((entry, index) => {
      entry.model.group.visible = index === this.activeIndex;
      this.player.group.add(entry.model.group);
    });

    this.emitSwitch();
  }

  get active() {
    return this.entries[this.activeIndex];
  }

  get cfg() {
    return this.active.cfg;
  }

  get state() {
    return this.active.state;
  }

  get name() {
    return this.cfg.name;
  }

  get role() {
    return this.cfg.role;
  }

  get ammo() {
    return this.state.ammo;
  }

  get magazineSize() {
    return this.cfg.magazineSize;
  }

  get isReloading() {
    return this.state.isReloading;
  }

  get reloadProgress() {
    if (!this.state.isReloading) return 0;
    return 1 - Math.max(0, this.state.reloadTimer) / this.cfg.reloadTime;
  }

  get aiming() {
    return this.input.pointerLocked && this.input.mouseDown(2);
  }

  get adsFov() {
    return this.cfg.adsFov;
  }

  get firing() {
    if (!this.input.pointerLocked) return false;
    return this.cfg.automatic ? this.input.mouseDown(0) : this.input.consumeMouse(0);
  }

  updateSelection() {
    this.processWeaponSwitch();
  }

  update(dt) {
    for (const entry of this.entries) {
      entry.state.fireCooldown = Math.max(0, entry.state.fireCooldown - dt);

      if (entry.state.flashTimer > 0) {
        entry.state.flashTimer -= dt;
        if (entry.state.flashTimer <= 0) entry.model.muzzleFlash.visible = false;
      }
    }

    const state = this.state;
    const cfg = this.cfg;

    if (state.isReloading) {
      state.reloadTimer -= dt;
      if (state.reloadTimer <= 0) {
        state.ammo = cfg.magazineSize;
        state.isReloading = false;
      }
    } else if (this.input.consume('reload') && state.ammo < cfg.magazineSize) {
      this.beginReload();
    }

    const wantsFire = this.firing;
    if (wantsFire && !state.isReloading && state.fireCooldown <= 0) {
      if (state.ammo > 0) this.fire();
      else this.beginReload();
    }

    const model = this.active.model.group;
    const targetX = this.aiming ? 0.40 : 0.48;
    const targetZ = this.aiming ? -0.58 : -0.46;
    model.position.x = THREE.MathUtils.damp(model.position.x, targetX, 18, dt);
    model.position.z = THREE.MathUtils.damp(model.position.z, targetZ, 18, dt);
  }

  processWeaponSwitch() {
    for (let index = 0; index < this.entries.length; index++) {
      if (this.input.consume(`slot${index + 1}`)) {
        this.switchTo(index);
        return;
      }
    }
  }

  switchTo(index) {
    if (index < 0 || index >= this.entries.length || index === this.activeIndex) return;

    const previous = this.active;
    previous.model.group.visible = false;
    previous.model.muzzleFlash.visible = false;
    previous.state.isReloading = false;
    previous.state.reloadTimer = 0;

    this.activeIndex = index;
    this.active.model.group.visible = true;
    this.emitSwitch();
  }

  emitSwitch() {
    this.onSwitch?.({
      index: this.activeIndex,
      slot: this.cfg.slot,
      name: this.cfg.name,
      role: this.cfg.role,
      damage: this.cfg.damage,
      magazineSize: this.cfg.magazineSize,
      fireRate: this.cfg.fireRate
    });
  }

  beginReload() {
    const state = this.state;
    if (state.isReloading || state.ammo === this.cfg.magazineSize) return;
    state.isReloading = true;
    state.reloadTimer = this.cfg.reloadTime;
  }

  reset() {
    for (const entry of this.entries) {
      entry.state.ammo = entry.cfg.magazineSize;
      entry.state.fireCooldown = 0;
      entry.state.reloadTimer = 0;
      entry.state.flashTimer = 0;
      entry.state.isReloading = false;
      entry.model.muzzleFlash.visible = false;
    }
  }

  fire() {
    const cfg = this.cfg;
    const state = this.state;

    state.ammo -= 1;
    state.fireCooldown = 1 / cfg.fireRate;
    state.flashTimer = 0.045;
    this.active.model.muzzleFlash.visible = true;

    const yawKick = (Math.random() - 0.5) * 2 * cfg.recoilYaw;
    this.cameraRig.kick(cfg.recoilPitch, yawKick);
    this.onFire?.({ name: cfg.name });

    if (cfg.pellets > 1) this.fireShotgun();
    else this.fireSingle();
  }

  fireSingle() {
    const cfg = this.cfg;
    const shot = this.traceShot(cfg.hipBloom, cfg.adsBloom, cfg.range);

    if (shot.actualHit?.object?.userData?.combatTarget) {
      const multiplier = damageFalloff(shot.distance, cfg);
      const result = this.targets.applyDamage(
        shot.actualHit.object,
        cfg.damage * multiplier,
        cfg.headshotMultiplier
      );
      if (result) {
        result.damage = Math.round(result.damage);
        this.onHit?.(result);
      }
    }

    this.spawnTracer(shot.muzzlePos, shot.impactPoint, 1);
  }

  fireShotgun() {
    const cfg = this.cfg;
    const pelletDamage = cfg.damage / cfg.pellets;
    let totalDamage = 0;
    let anyHeadshot = false;
    let eliminated = false;
    let firstMuzzle = null;
    const tracerPoints = [];

    for (let i = 0; i < cfg.pellets; i++) {
      const shot = this.traceShot(cfg.hipBloom, cfg.adsBloom, cfg.range);
      if (!firstMuzzle) firstMuzzle = shot.muzzlePos.clone();
      if (i % 3 === 0) tracerPoints.push(shot.impactPoint.clone());

      if (!shot.actualHit?.object?.userData?.combatTarget) continue;

      const multiplier = damageFalloff(shot.distance, cfg);
      const result = this.targets.applyDamage(
        shot.actualHit.object,
        pelletDamage * multiplier,
        cfg.headshotMultiplier
      );

      if (!result) continue;
      totalDamage += result.damage;
      anyHeadshot = anyHeadshot || result.headshot;
      eliminated = eliminated || result.eliminated;
    }

    if (firstMuzzle) {
      tracerPoints.forEach((point) => this.spawnTracer(firstMuzzle, point, 0.72));
    }

    if (totalDamage > 0) {
      this.onHit?.({
        damage: Math.round(totalDamage),
        headshot: anyHeadshot,
        eliminated
      });
    }
  }

  traceShot(hipBloom, adsBloom, range) {
    const spread = this.aiming ? adsBloom : hipBloom;
    this.cameraRay.setFromCamera(this.center, this.camera);

    const cameraDirection = this.cameraRay.ray.direction.clone();
    applySpread(cameraDirection, this.camera, spread);
    cameraDirection.normalize();

    const objects = [...this.targets.hitMeshes, ...this.world.cameraObstacles];
    const cameraHit = firstValidHit(
      this.cameraRay,
      this.camera.position,
      cameraDirection,
      objects,
      range
    );

    const aimPoint = cameraHit
      ? cameraHit.point.clone()
      : this.camera.position.clone().add(cameraDirection.multiplyScalar(range));

    const muzzlePos = new THREE.Vector3();
    this.active.model.muzzle.getWorldPosition(muzzlePos);

    const muzzleDirection = aimPoint.clone().sub(muzzlePos);
    const aimDistance = muzzleDirection.length();
    muzzleDirection.normalize();

    const actualHit = firstValidHit(
      this.muzzleRay,
      muzzlePos,
      muzzleDirection,
      objects,
      Math.min(range, aimDistance + 0.25)
    );

    const impactPoint = actualHit
      ? actualHit.point.clone()
      : muzzlePos.clone().add(muzzleDirection.multiplyScalar(Math.min(range, aimDistance)));

    return {
      muzzlePos,
      actualHit,
      impactPoint,
      distance: actualHit ? muzzlePos.distanceTo(actualHit.point) : range
    };
  }

  spawnTracer(from, to, opacity = 0.9) {
    const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
    const material = new THREE.LineBasicMaterial({
      color: 0xffe39a,
      transparent: true,
      opacity
    });
    const line = new THREE.Line(geometry, material);
    this.scene.add(line);

    setTimeout(() => {
      this.scene.remove(line);
      geometry.dispose();
      material.dispose();
    }, 55);
  }

  buildModel(cfg) {
    const group = new THREE.Group();
    const shell = new THREE.MeshStandardMaterial({
      color: cfg.color,
      roughness: 0.42,
      metalness: 0.22
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x152434,
      roughness: 0.5,
      metalness: 0.28
    });
    const accent = new THREE.MeshStandardMaterial({
      color: 0xeef7ff,
      roughness: 0.34,
      metalness: 0.08
    });

    const bodyHeight = cfg.pellets > 1 ? 0.25 : 0.20;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, bodyHeight, cfg.modelLength),
      shell
    );
    body.position.z = -0.12;
    group.add(body);

    const stock = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.17, cfg.name.includes('SMG') ? 0.20 : 0.30),
      accent
    );
    stock.position.z = cfg.modelLength * 0.45;
    group.add(stock);

    const barrelLength = cfg.name.includes('SNIPER') ? 0.78 : cfg.pellets > 1 ? 0.54 : 0.44;
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.05, barrelLength, 10),
      dark
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -(cfg.modelLength / 2 + barrelLength / 2);
    group.add(barrel);

    const mag = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, cfg.pellets > 1 ? 0.22 : 0.30, 0.16),
      dark
    );
    mag.position.set(0, -0.22, 0.02);
    mag.rotation.x = -0.14;
    group.add(mag);

    if (!cfg.name.includes('SHOTGUN')) {
      const sight = new THREE.Mesh(
        new THREE.BoxGeometry(cfg.name.includes('SNIPER') ? 0.14 : 0.10, 0.08, cfg.name.includes('SNIPER') ? 0.28 : 0.16),
        accent
      );
      sight.position.set(0, 0.15, -0.16);
      group.add(sight);
    }

    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0, -(cfg.modelLength / 2 + barrelLength + 0.04));
    group.add(muzzle);

    const muzzleFlash = new THREE.Mesh(
      new THREE.SphereGeometry(cfg.pellets > 1 ? 0.11 : 0.075, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd466 })
    );
    muzzleFlash.position.copy(muzzle.position);
    muzzleFlash.visible = false;
    group.add(muzzleFlash);

    group.position.set(0.48, 1.02, -0.46);
    group.rotation.x = -0.04;

    return { group, muzzle, muzzleFlash };
  }
}

function firstValidHit(raycaster, origin, direction, objects, maxDistance) {
  raycaster.set(origin, direction);
  raycaster.near = 0;
  raycaster.far = maxDistance;
  const hits = raycaster.intersectObjects(objects, false);
  return hits.find((hit) => !hit.object.userData.disabled) ?? null;
}

function applySpread(direction, camera, amount) {
  if (amount <= 0) return;
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.sqrt(Math.random()) * amount;
  direction.addScaledVector(right, Math.cos(angle) * radius);
  direction.addScaledVector(up, Math.sin(angle) * radius);
}

function damageFalloff(distance, cfg) {
  if (distance <= cfg.falloffStart) return 1;
  if (distance >= cfg.falloffEnd) return cfg.minDamageMultiplier;

  const t = (distance - cfg.falloffStart) / (cfg.falloffEnd - cfg.falloffStart);
  return 1 - (1 - cfg.minDamageMultiplier) * t;
}
