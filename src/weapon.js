import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { GAME_CONFIG, WEAPON_ORDER } from './config.js';
import { WeaponAudio } from './audio.js';

export class WeaponSystem {
  constructor({ scene, camera, cameraRig, player, input, world, targets, onHit, onFire, onSwitch, onInventoryChange }) {
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
    this.onInventoryChange = onInventoryChange;

    this.audio = new WeaponAudio();
    this.cameraRay = new THREE.Raycaster();
    this.muzzleRay = new THREE.Raycaster();
    this.center = new THREE.Vector2(0, 0);
    this.activeSlot = 0;
    this.loadout = ['tacticalAR', 'compactSMG'];
    this.blocked = false;
    this.visualHidden = false;
    this.ammoPool = { light: 90, medium: 90, shells: 24, heavy: 8 };
    this.ammoCaps = { light: 180, medium: 180, shells: 48, heavy: 20 };
    this.startingAmmo = { ...this.ammoPool };
    this.handMounted = false;
    this.tmpHandWorld = new THREE.Vector3();
    this.tmpHandLocal = new THREE.Vector3();

    this.entries = WEAPON_ORDER.map((key) => {
      const cfg = GAME_CONFIG.weapons[key];
      const model = this.buildModel(cfg);
      const state = {
        ammo: cfg.magazineSize,
        fireCooldown: 0,
        reloadTimer: 0,
        flashTimer: 0,
        isReloading: false,
        dynamicBloom: 0,
        visualKick: 0,
        shotIndex: 0,
        sinceShot: 999,
        bobTime: 0
      };
      return { key, cfg, model, state };
    });

    this.catalog = new Map(this.entries.map((entry) => [entry.key, entry]));
    this.entries.forEach((entry) => {
      entry.model.group.visible = entry.key === this.loadout[this.activeSlot];
      this.player.group.add(entry.model.group);
    });

    this.player.setWeaponVisualActive?.(true);

    this.player.characterReady?.then((avatar) => {
      this.handMounted = Boolean(avatar);
    });

    this.emitSwitch();
    this.emitInventory();
  }

  unlockAudio() {
    this.audio.unlock();
  }

  get active() { return this.catalog.get(this.loadout[this.activeSlot]); }
  get cfg() { return this.active.cfg; }
  get state() { return this.active.state; }
  get name() { return this.cfg.name; }
  get role() { return this.cfg.role; }
  get ammo() { return this.state.ammo; }
  get magazineSize() { return this.cfg.magazineSize; }
  get reserveAmmo() { return this.ammoPool[this.cfg.ammoType] ?? 0; }
  get isReloading() { return this.state.isReloading; }
  get reticleType() { return this.cfg.reticle; }
  get scoped() { return Boolean(this.cfg.scope && this.aiming); }
  get adsFov() { return this.cfg.adsFov; }
  get adsDistance() { return this.cfg.adsDistance; }
  get adsShoulderOffset() { return this.cfg.adsShoulderOffset; }

  get reloadProgress() {
    if (!this.state.isReloading) return 0;
    return 1 - Math.max(0, this.state.reloadTimer) / this.cfg.reloadTime;
  }

  get aiming() {
    return !this.blocked && this.input.pointerLocked && this.input.mouseDown(2);
  }

  get firing() {
    if (this.blocked || !this.input.pointerLocked) return false;
    return this.cfg.automatic ? this.input.mouseDown(0) : this.input.consumeMouse(0);
  }

  setBlocked(blocked) {
    this.blocked = Boolean(blocked);
  }

  setVisualHidden(hidden) {
    this.visualHidden = Boolean(hidden);
    this.player.setWeaponVisualActive?.(!this.visualHidden);
    for (const entry of this.entries) {
      entry.model.group.visible =
        !this.visualHidden &&
        entry.key === this.loadout[this.activeSlot];
    }
  }

  getConfig(key) {
    return GAME_CONFIG.weapons[key] ?? null;
  }

  getEntry(key) {
    return this.catalog.get(key) ?? null;
  }

  getLoadoutState() {
    return {
      activeSlot: this.activeSlot,
      slots: this.loadout.map((key, index) => {
        const entry = this.catalog.get(key);
        return {
          slot: index + 1,
          key,
          name: entry.cfg.name,
          role: entry.cfg.role,
          ammoType: entry.cfg.ammoType,
          magazine: entry.state.ammo,
          magazineSize: entry.cfg.magazineSize,
          reserve: this.ammoPool[entry.cfg.ammoType] ?? 0,
          color: entry.cfg.color
        };
      }),
      ammoPool: { ...this.ammoPool }
    };
  }

  get scopeUnstable() {
    if (!this.scoped) return false;
    return !this.player.grounded || this.player.horizontalSpeed() > 1.5 || this.state.sinceShot < 0.42;
  }

  get crosshairGap() {
    const spread = this.currentSpread();
    const normalized = Math.min(1, spread / Math.max(0.001, this.cfg.hipBloom * 1.8));
    return THREE.MathUtils.lerp(this.cfg.reticleMinGap, this.cfg.reticleMaxGap, normalized);
  }

  updateSelection() {
    if (!this.blocked) this.processWeaponSwitch();
  }

  update(dt) {
    for (const entry of this.entries) {
      const s = entry.state;
      s.fireCooldown = Math.max(0, s.fireCooldown - dt);
      s.sinceShot += dt;
      s.dynamicBloom = THREE.MathUtils.damp(s.dynamicBloom, 0, entry.cfg.bloomDecay, dt);
      s.visualKick = THREE.MathUtils.damp(s.visualKick, 0, 14 / entry.cfg.mass, dt);

      if (s.sinceShot > 0.6) s.shotIndex = 0;

      if (s.flashTimer > 0) {
        s.flashTimer -= dt;
        if (s.flashTimer <= 0) entry.model.muzzleFlash.visible = false;
      }
    }

    const state = this.state;
    const cfg = this.cfg;

    if (state.isReloading) {
      state.reloadTimer -= dt;
      if (state.reloadTimer <= 0) {
        const needed = cfg.magazineSize - state.ammo;
        const available = this.ammoPool[cfg.ammoType] ?? 0;
        const loaded = Math.min(needed, available);
        state.ammo += loaded;
        this.ammoPool[cfg.ammoType] = available - loaded;
        state.isReloading = false;
        this.emitInventory();
      }
    } else if (!this.blocked && this.input.consume('reload') && state.ammo < cfg.magazineSize) {
      this.beginReload();
    }

    const wantsFire = this.firing;
    if (wantsFire && !state.isReloading && state.fireCooldown <= 0) {
      if (state.ammo > 0) this.fire();
      else this.beginReload();
    }

    this.updateWeaponPose(dt);
  }

  updateWeaponPose(dt) {
    const cfg = this.cfg;
    const state = this.state;
    const model = this.active.model.group;
    const speed = this.player.horizontalSpeed();
    const moving = Math.min(1, speed / 5.2);

    state.bobTime += dt * (3.5 + speed * 1.4);
    const bobScale = cfg.bob * moving * (this.aiming ? 0.22 : 0.55);
    const bobX = Math.cos(state.bobTime) * bobScale;
    const bobY = Math.abs(Math.sin(state.bobTime * 2)) * bobScale * 0.55;

    const swayScale = cfg.sway * (this.aiming ? 0.30 : 0.62);
    const swayX = THREE.MathUtils.clamp(-this.cameraRig.lookX * swayScale, -0.045, 0.045);
    const swayY = THREE.MathUtils.clamp(this.cameraRig.lookY * swayScale * 0.45, -0.025, 0.025);

    const handWorld = this.handMounted
      ? this.player.getHandWorldPosition?.('right', this.tmpHandWorld)
      : null;

    if (handWorld) {
      // Weapon origin follows the real VRM hand. The firearm still aims along
      // the character/camera forward direction, avoiding unpredictable hand
      // bone local axes while visually staying in the hand.
      this.tmpHandLocal.copy(handWorld);
      this.player.group.worldToLocal(this.tmpHandLocal);

      const targetX = this.tmpHandLocal.x + (this.aiming ? -0.015 : 0.018) + bobX + swayX;
      const targetY = this.tmpHandLocal.y + 0.015 + bobY + swayY;
      const targetZ = this.tmpHandLocal.z - (this.aiming ? 0.16 : 0.12) + state.visualKick;

      model.position.x = THREE.MathUtils.damp(model.position.x, targetX, 28 / cfg.mass, dt);
      model.position.y = THREE.MathUtils.damp(model.position.y, targetY, 28 / cfg.mass, dt);
      model.position.z = THREE.MathUtils.damp(model.position.z, targetZ, 30 / cfg.mass, dt);

      const targetPitch = THREE.MathUtils.clamp(this.camera.rotation.x * 0.78, -0.62, 0.58);
      model.rotation.x = THREE.MathUtils.damp(
        model.rotation.x,
        targetPitch - 0.05 - state.visualKick * 0.70,
        22 / cfg.mass,
        dt
      );
      const aimYaw = this.aiming
        ? (this.player.aimYawOffset ?? 0)
        : 0;
      model.rotation.y = THREE.MathUtils.damp(
        model.rotation.y,
        aimYaw,
        24 / cfg.mass,
        dt
      );
      model.rotation.z = THREE.MathUtils.damp(model.rotation.z, -0.05 - swayX * 0.7, 20 / cfg.mass, dt);
      return;
    }

    // Fallback positioning used only before/without the VRM hand.
    const targetX = (this.aiming ? 0.28 : 0.34) + bobX + swayX;
    const targetY = 1.05 + bobY + swayY;
    const targetZ = (this.aiming ? -0.60 : -0.48) + state.visualKick;

    model.position.x = THREE.MathUtils.damp(model.position.x, targetX, 18 / cfg.mass, dt);
    model.position.y = THREE.MathUtils.damp(model.position.y, targetY, 18 / cfg.mass, dt);
    model.position.z = THREE.MathUtils.damp(model.position.z, targetZ, 22 / cfg.mass, dt);
    model.rotation.x = THREE.MathUtils.damp(model.rotation.x, -0.04 - state.visualKick * 0.75, 18 / cfg.mass, dt);
    model.rotation.y = THREE.MathUtils.damp(
      model.rotation.y,
      this.aiming ? (this.player.aimYawOffset ?? 0) : 0,
      18 / cfg.mass,
      dt
    );
    model.rotation.z = THREE.MathUtils.damp(model.rotation.z, -swayX * 0.9, 16 / cfg.mass, dt);
  }

  currentSpread() {
    const cfg = this.cfg;
    const state = this.state;
    let spread = (this.aiming ? cfg.adsBloom : cfg.hipBloom) + state.dynamicBloom;

    const speed = this.player.horizontalSpeed();
    if (speed > 0.35) spread *= cfg.moveSpreadMult;
    if (!this.player.grounded) spread *= cfg.airSpreadMult;
    if (this.player.crouching && this.player.grounded) spread *= cfg.crouchSpreadMult;

    const firstShotReady =
      cfg.firstShotAccuracy &&
      this.aiming &&
      this.player.grounded &&
      speed < 0.25 &&
      state.sinceShot > 0.42;

    if (firstShotReady) spread *= 0.22;
    return spread;
  }

  processWeaponSwitch() {
    if (this.input.consume('slot1')) {
      this.equipSlot(0);
      return;
    }

    if (this.input.consume('slot2')) {
      this.equipSlot(1);
      return;
    }

    const wheel = this.input.consumeWeaponWheel();
    if (wheel !== 0) {
      // With exactly two firearm slots, next/previous both switch to the other gun.
      this.equipSlot(this.activeSlot === 0 ? 1 : 0);
    }
  }

  equipSlot(index) {
    if (index < 0 || index > 1 || index === this.activeSlot) return;
    const previous = this.active;
    previous.model.group.visible = false;
    previous.model.muzzleFlash.visible = false;
    previous.state.isReloading = false;
    previous.state.reloadTimer = 0;

    this.activeSlot = index;
    this.active.model.group.visible = !this.visualHidden;
    this.emitSwitch();
    this.emitInventory();
  }

  swapActiveWithPickup(weaponKey, magazineAmmo) {
    if (!this.catalog.has(weaponKey)) return { accepted: false, reason: 'UNKNOWN' };

    const otherSlot = this.activeSlot === 0 ? 1 : 0;
    if (this.loadout[otherSlot] === weaponKey) {
      this.equipSlot(otherSlot);
      return { accepted: false, reason: 'ALREADY EQUIPPED' };
    }

    const oldKey = this.loadout[this.activeSlot];
    const oldEntry = this.catalog.get(oldKey);
    const newEntry = this.catalog.get(weaponKey);
    const dropped = { weaponKey: oldKey, magazineAmmo: oldEntry.state.ammo };

    oldEntry.model.group.visible = false;
    oldEntry.model.muzzleFlash.visible = false;
    oldEntry.state.isReloading = false;
    oldEntry.state.reloadTimer = 0;

    this.loadout[this.activeSlot] = weaponKey;
    newEntry.state.ammo = THREE.MathUtils.clamp(
      Number.isFinite(magazineAmmo) ? magazineAmmo : newEntry.cfg.magazineSize,
      0,
      newEntry.cfg.magazineSize
    );
    newEntry.state.isReloading = false;
    newEntry.state.reloadTimer = 0;
    newEntry.model.group.visible = !this.visualHidden;

    this.emitSwitch();
    this.emitInventory();
    return { accepted: true, dropped };
  }

  addAmmo(type, amount) {
    if (!(type in this.ammoPool) || amount <= 0) return 0;
    const before = this.ammoPool[type];
    this.ammoPool[type] = Math.min(this.ammoCaps[type], before + amount);
    const added = this.ammoPool[type] - before;
    if (added > 0) this.emitInventory();
    return added;
  }

  emitInventory() {
    this.onInventoryChange?.(this.getLoadoutState());
  }

  emitSwitch() {
    this.onSwitch?.({
      index: this.activeSlot,
      slot: this.activeSlot + 1,
      name: this.cfg.name,
      role: this.cfg.role,
      damage: this.cfg.damage,
      magazineSize: this.cfg.magazineSize,
      fireRate: this.cfg.fireRate,
      reticle: this.cfg.reticle,
      scoped: Boolean(this.cfg.scope),
      ammoType: this.cfg.ammoType
    });
  }

  beginReload() {
    const state = this.state;
    if (
      this.blocked ||
      state.isReloading ||
      state.ammo === this.cfg.magazineSize ||
      (this.ammoPool[this.cfg.ammoType] ?? 0) <= 0
    ) return;
    state.isReloading = true;
    state.reloadTimer = this.cfg.reloadTime;
  }

  reset() {
    this.ammoPool = { ...this.startingAmmo };
    for (const entry of this.entries) {
      entry.state.ammo = entry.cfg.magazineSize;
      entry.state.fireCooldown = 0;
      entry.state.reloadTimer = 0;
      entry.state.flashTimer = 0;
      entry.state.isReloading = false;
      entry.state.dynamicBloom = 0;
      entry.state.visualKick = 0;
      entry.state.shotIndex = 0;
      entry.state.sinceShot = 999;
      entry.model.muzzleFlash.visible = false;
    }
    this.emitInventory();
  }

  fire() {
    const cfg = this.cfg;
    const state = this.state;
    const spread = this.currentSpread();

    state.ammo -= 1;
    this.emitInventory();
    state.fireCooldown = 1 / cfg.fireRate;
    state.flashTimer = cfg.pellets > 1 ? 0.07 : 0.045;
    state.sinceShot = 0;
    state.visualKick = Math.max(state.visualKick, cfg.visualKick);

    const pattern = cfg.recoilPattern[state.shotIndex % cfg.recoilPattern.length];
    state.shotIndex += 1;
    this.cameraRig.kick(pattern[0], pattern[1], cfg.recoilRecovery);

    this.active.model.muzzleFlash.visible = true;
    this.audio.playShot(cfg.sound);
    this.onFire?.({ name: cfg.name });

    if (cfg.pellets > 1) this.fireShotgun(spread);
    else this.fireSingle(spread);

    state.dynamicBloom = Math.min(
      cfg.hipBloom * 1.65,
      state.dynamicBloom + cfg.bloomPerShot
    );
  }

  fireSingle(spread) {
    const cfg = this.cfg;
    const shot = this.traceShot(spread, cfg.range);

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

    this.spawnTracer(shot.muzzlePos, shot.impactPoint, cfg.scope ? 0.55 : 1);
  }

  fireShotgun(spread) {
    const cfg = this.cfg;
    const pelletDamage = cfg.damage / cfg.pellets;
    let totalDamage = 0;
    let anyHeadshot = false;
    let eliminated = false;
    let firstMuzzle = null;
    const tracerPoints = [];

    for (let i = 0; i < cfg.pellets; i++) {
      const shot = this.traceShot(spread, cfg.range);
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
      tracerPoints.forEach((point) => this.spawnTracer(firstMuzzle, point, 0.65));
    }

    if (totalDamage > 0) {
      this.onHit?.({
        damage: Math.round(totalDamage),
        headshot: anyHeadshot,
        eliminated
      });
    }
  }

  traceShot(spread, range) {
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

    if (this.scoped) {
      muzzlePos.copy(this.camera.position);
    } else {
      this.active.model.muzzle.getWorldPosition(muzzlePos);
    }

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

    const barrelLength = cfg.scope ? 0.78 : cfg.pellets > 1 ? 0.54 : 0.44;
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
        new THREE.BoxGeometry(cfg.scope ? 0.16 : 0.10, cfg.scope ? 0.11 : 0.08, cfg.scope ? 0.34 : 0.16),
        accent
      );
      sight.position.set(0, 0.15, -0.16);
      group.add(sight);
    }

    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0, -(cfg.modelLength / 2 + barrelLength + 0.04));
    group.add(muzzle);

    const muzzleFlash = new THREE.Mesh(
      new THREE.SphereGeometry(cfg.pellets > 1 ? 0.12 : cfg.scope ? 0.10 : 0.075, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd466 })
    );
    muzzleFlash.position.copy(muzzle.position);
    muzzleFlash.visible = false;
    group.add(muzzleFlash);

    group.position.set(0.34, 1.05, -0.48);
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
