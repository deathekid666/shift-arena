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
    this.tmpShoulderWorld = new THREE.Vector3();
    this.tmpAimForward = new THREE.Vector3();
    this.tmpAimRight = new THREE.Vector3();
    this.tmpAimUp = new THREE.Vector3();
    this.tmpGripWorld = new THREE.Vector3();
    this.tmpGripLocal = new THREE.Vector3();
    this.tmpParentWorldQ = new THREE.Quaternion();
    this.tmpParentWorldQInv = new THREE.Quaternion();
    this.tmpDesiredWorldQ = new THREE.Quaternion();
    this.tmpDesiredLocalQ = new THREE.Quaternion();
    this.tmpGripOffset = new THREE.Vector3();
    this.gripPose = {
      aiming: false,
      rightGrip: new THREE.Vector3(),
      leftGrip: new THREE.Vector3(),
      muzzle: new THREE.Vector3(),
      forward: new THREE.Vector3(),
      weaponQuaternion: new THREE.Quaternion()
    };

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
        visualKickVelocity: 0,
        sustainedFire: 0,
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

  get combatPoseActive() {
    if (this.blocked || !this.input.pointerLocked) return false;
    const firingNow = this.input.mouseDown(0);
    const recentShot = this.state.sinceShot < 0.30;
    return this.aiming || firingNow || recentShot;
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
      s.dynamicBloom = THREE.MathUtils.damp(
        s.dynamicBloom,
        0,
        entry.cfg.bloomDecay,
        dt
      );

      // Critically damped-ish weapon recoil spring. The gun physically kicks
      // rearward then settles instead of teleporting to a Z offset.
      const kickStiffness = 92 / Math.max(0.55, entry.cfg.mass);
      const kickDamping = 18 / Math.max(0.72, Math.sqrt(entry.cfg.mass));
      s.visualKickVelocity += -s.visualKick * kickStiffness * dt;
      s.visualKickVelocity *= Math.exp(-kickDamping * dt);
      s.visualKick += s.visualKickVelocity * dt;
      if (Math.abs(s.visualKick) < 0.0002 && Math.abs(s.visualKickVelocity) < 0.001) {
        s.visualKick = 0;
        s.visualKickVelocity = 0;
      }

      s.sustainedFire = THREE.MathUtils.damp(
        s.sustainedFire,
        0,
        3.8,
        dt
      );

      this.updateMuzzleFx(entry, dt);

      if (s.sinceShot > 0.6) s.shotIndex = 0;

      if (s.flashTimer > 0) {
        s.flashTimer = Math.max(0, s.flashTimer - dt);
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
    const modelData = this.active.model;
    const model = modelData.group;
    const speed = this.player.horizontalSpeed();
    const moving = Math.min(1, speed / 5.2);

    state.bobTime += dt * (3.5 + speed * 1.4);
    const shoulderPose = this.combatPoseActive;
    const bobScale = cfg.bob * moving * (shoulderPose ? 0.10 : 0.55);
    const bobX = Math.cos(state.bobTime) * bobScale;
    const bobY = Math.abs(Math.sin(state.bobTime * 2)) * bobScale * 0.45;

    const swayScale = cfg.sway * (shoulderPose ? 0.18 : 0.62);
    const swayX = THREE.MathUtils.clamp(
      -this.cameraRig.lookX * swayScale,
      -0.032,
      0.032
    );
    const swayY = THREE.MathUtils.clamp(
      this.cameraRig.lookY * swayScale * 0.38,
      -0.020,
      0.020
    );

    if (shoulderPose && this.handMounted) {
      // Shooter architecture: crosshair/camera owns the weapon transform.
      // Hands follow the weapon sockets via IK after this pose is resolved.
      const shoulder =
        this.player.getBoneWorldPosition?.('rightShoulder', this.tmpShoulderWorld) ??
        this.player.getBoneWorldPosition?.('upperChest', this.tmpShoulderWorld);

      if (shoulder) {
        this.tmpAimForward
          .set(0, 0, -1)
          .applyQuaternion(this.camera.quaternion)
          .normalize();
        this.tmpAimRight
          .set(1, 0, 0)
          .applyQuaternion(this.camera.quaternion)
          .normalize();
        this.tmpAimUp
          .set(0, 1, 0)
          .applyQuaternion(this.camera.quaternion)
          .normalize();

        // The rear/pistol grip sits just forward and slightly inward from the
        // firing shoulder, which visibly raises the rifle to a shooter stance.
        const ads = this.aiming;
        this.tmpGripWorld
          .copy(shoulder)
          .addScaledVector(this.tmpAimForward, ads ? 0.23 : 0.20)
          .addScaledVector(
            this.tmpAimRight,
            (ads ? -0.035 : 0.010) + bobX + swayX
          )
          .addScaledVector(
            this.tmpAimUp,
            (ads ? -0.035 : -0.075) + bobY + swayY
          );

        this.tmpDesiredWorldQ.copy(this.camera.quaternion);

        // Small visual recoil around the camera-aligned aim axis.
        const recoilQ = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(
            -0.035 - state.visualKick * 0.72,
            0,
            -0.035 - swayX * 0.45,
            'YXZ'
          )
        );
        this.tmpDesiredWorldQ.multiply(recoilQ);

        this.player.group.getWorldQuaternion(this.tmpParentWorldQ);
        this.tmpParentWorldQInv
          .copy(this.tmpParentWorldQ)
          .invert();

        this.tmpDesiredLocalQ
          .copy(this.tmpParentWorldQInv)
          .multiply(this.tmpDesiredWorldQ);

        this.tmpGripLocal.copy(this.tmpGripWorld);
        this.player.group.worldToLocal(this.tmpGripLocal);

        this.tmpGripOffset
          .copy(modelData.rightGrip.position)
          .applyQuaternion(this.tmpDesiredLocalQ);

        const targetPosition = this.tmpGripLocal
          .clone()
          .sub(this.tmpGripOffset);

        model.position.x = THREE.MathUtils.damp(
          model.position.x,
          targetPosition.x,
          30 / cfg.mass,
          dt
        );
        model.position.y = THREE.MathUtils.damp(
          model.position.y,
          targetPosition.y,
          30 / cfg.mass,
          dt
        );
        model.position.z = THREE.MathUtils.damp(
          model.position.z,
          targetPosition.z,
          32 / cfg.mass,
          dt
        );

        model.quaternion.slerp(
          this.tmpDesiredLocalQ,
          1 - Math.exp(-(28 / cfg.mass) * dt)
        );

        model.updateWorldMatrix(true, true);
        this.updateGripPose();
        return;
      }
    }

    // Non-ADS remains hand-led/relaxed.
    const handWorld = this.handMounted
      ? this.player.getHandWorldPosition?.('right', this.tmpHandWorld)
      : null;

    if (handWorld) {
      this.tmpHandLocal.copy(handWorld);
      this.player.group.worldToLocal(this.tmpHandLocal);

      const targetX = this.tmpHandLocal.x + 0.018 + bobX + swayX;
      const targetY = this.tmpHandLocal.y + 0.015 + bobY + swayY;
      const targetZ = this.tmpHandLocal.z - 0.12 + state.visualKick;

      model.position.x = THREE.MathUtils.damp(
        model.position.x,
        targetX,
        28 / cfg.mass,
        dt
      );
      model.position.y = THREE.MathUtils.damp(
        model.position.y,
        targetY,
        28 / cfg.mass,
        dt
      );
      model.position.z = THREE.MathUtils.damp(
        model.position.z,
        targetZ,
        30 / cfg.mass,
        dt
      );

      model.rotation.x = THREE.MathUtils.damp(
        model.rotation.x,
        -0.08 - state.visualKick * 0.70,
        22 / cfg.mass,
        dt
      );
      model.rotation.y = THREE.MathUtils.damp(
        model.rotation.y,
        0,
        24 / cfg.mass,
        dt
      );
      model.rotation.z = THREE.MathUtils.damp(
        model.rotation.z,
        -0.08 - swayX * 0.7,
        20 / cfg.mass,
        dt
      );

      model.updateWorldMatrix(true, true);
      this.updateGripPose();
      return;
    }

    const targetX = 0.34 + bobX + swayX;
    const targetY = 1.05 + bobY + swayY;
    const targetZ = -0.48 + state.visualKick;

    model.position.x = THREE.MathUtils.damp(model.position.x, targetX, 18 / cfg.mass, dt);
    model.position.y = THREE.MathUtils.damp(model.position.y, targetY, 18 / cfg.mass, dt);
    model.position.z = THREE.MathUtils.damp(model.position.z, targetZ, 22 / cfg.mass, dt);
    model.rotation.x = THREE.MathUtils.damp(model.rotation.x, -0.04 - state.visualKick * 0.75, 18 / cfg.mass, dt);
    model.rotation.y = THREE.MathUtils.damp(model.rotation.y, 0, 18 / cfg.mass, dt);
    model.rotation.z = THREE.MathUtils.damp(model.rotation.z, -swayX * 0.9, 16 / cfg.mass, dt);

    model.updateWorldMatrix(true, true);
    this.updateGripPose();
  }

  updateGripPose() {
    const model = this.active.model;
    model.rightGrip.getWorldPosition(this.gripPose.rightGrip);
    model.leftGrip.getWorldPosition(this.gripPose.leftGrip);
    model.muzzle.getWorldPosition(this.gripPose.muzzle);
    model.group.getWorldQuaternion(this.gripPose.weaponQuaternion);

    this.gripPose.forward
      .set(0, 0, -1)
      .applyQuaternion(this.gripPose.weaponQuaternion)
      .normalize();

    this.gripPose.aiming =
      this.combatPoseActive &&
      !this.visualHidden &&
      !this.blocked;
  }

  getGripPose() {
    return this.gripPose;
  }

  triggerMuzzleFx(entry) {
    const fx = entry.model.muzzleFx;
    if (!fx) return;

    fx.group.visible = true;
    fx.age = 0;
    fx.seed = (fx.seed + 1) % 997;
    fx.group.rotation.z = ((fx.seed * 1.618) % 1) * Math.PI * 2;

    const shotgun = entry.cfg.pellets > 1;
    const sniper = Boolean(entry.cfg.scope);
    fx.life = shotgun ? 0.050 : sniper ? 0.032 : 0.026;

    fx.core.scale.setScalar(shotgun ? 1.30 : sniper ? 1.10 : 0.92);
    fx.flareA.scale.set(shotgun ? 1.35 : 1, shotgun ? 1.15 : 1, 1);
    fx.flareB.scale.set(shotgun ? 1.20 : 0.88, shotgun ? 1.05 : 0.88, 1);
    fx.cone.scale.set(shotgun ? 1.35 : 1, shotgun ? 1.18 : 1, shotgun ? 1.55 : 1);

    fx.light.intensity = shotgun ? 4.8 : sniper ? 4.2 : 3.4;

    for (let i = 0; i < fx.sparks.length; i++) {
      const spark = fx.sparks[i];
      const angle =
        ((i / fx.sparks.length) * Math.PI * 2) +
        (((fx.seed * 0.73) % 1) - 0.5) * 0.7;
      const radius = shotgun ? 0.13 : 0.09;
      spark.position.set(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        -0.055 - i * 0.012
      );
      spark.rotation.z = angle;
      spark.scale.setScalar(shotgun ? 1.15 : 0.92);
      spark.visible = true;
    }

    const smokeOpacity =
      entry.state.sustainedFire > 0.34
        ? THREE.MathUtils.lerp(0.05, 0.18, entry.state.sustainedFire)
        : 0;
    fx.smoke.material.opacity = smokeOpacity;
    fx.smoke.visible = smokeOpacity > 0.001;
    fx.smoke.scale.setScalar(
      THREE.MathUtils.lerp(0.78, 1.18, entry.state.sustainedFire)
    );
  }

  updateMuzzleFx(entry, dt) {
    const fx = entry.model.muzzleFx;
    if (!fx) return;

    if (entry.state.flashTimer > 0) {
      fx.age += dt;
      const t = THREE.MathUtils.clamp(
        fx.age / Math.max(0.001, fx.life),
        0,
        1
      );
      const flash = 1 - t;

      fx.core.material.opacity = flash;
      fx.flareA.material.opacity = flash * 0.92;
      fx.flareB.material.opacity = flash * 0.72;
      fx.cone.material.opacity = flash * 0.74;
      fx.light.intensity *= Math.exp(-28 * dt);

      fx.core.scale.multiplyScalar(1 + dt * 7);
      fx.cone.scale.z *= 1 + dt * 11;

      for (const spark of fx.sparks) {
        spark.material.opacity = flash * 0.9;
        spark.position.z -= dt * 1.8;
        spark.scale.multiplyScalar(1 + dt * 3);
      }
    } else {
      fx.core.material.opacity = 0;
      fx.flareA.material.opacity = 0;
      fx.flareB.material.opacity = 0;
      fx.cone.material.opacity = 0;
      fx.light.intensity = THREE.MathUtils.damp(
        fx.light.intensity,
        0,
        28,
        dt
      );
      for (const spark of fx.sparks) spark.visible = false;
    }

    if (fx.smoke.visible) {
      fx.smoke.position.z -= dt * 0.10;
      fx.smoke.position.y += dt * 0.05;
      fx.smoke.scale.multiplyScalar(1 + dt * 0.75);
      fx.smoke.material.opacity = THREE.MathUtils.damp(
        fx.smoke.material.opacity,
        0,
        5.5,
        dt
      );
      if (fx.smoke.material.opacity < 0.005) {
        fx.smoke.visible = false;
        fx.smoke.position.set(0, 0, -0.03);
      }
    }

    if (
      entry.state.flashTimer <= 0 &&
      !fx.smoke.visible &&
      fx.light.intensity < 0.01
    ) {
      fx.group.visible = false;
    }
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
    state.flashTimer = cfg.pellets > 1 ? 0.050 : cfg.scope ? 0.032 : 0.026;
    state.sinceShot = 0;
    state.visualKick = Math.max(state.visualKick, cfg.visualKick);

    const pattern = cfg.recoilPattern[state.shotIndex % cfg.recoilPattern.length];
    state.shotIndex += 1;

    // ADS should feel steadier visually, not recoil-free.
    const cameraRecoilMul = this.aiming ? 0.62 : 1;
    this.cameraRig.kick(
      pattern[0] * cameraRecoilMul,
      pattern[1] * cameraRecoilMul,
      cfg.recoilRecovery
    );

    state.visualKickVelocity +=
      cfg.visualKick *
      (this.aiming ? 13.5 : 17.5) /
      Math.max(0.72, cfg.mass);
    state.sustainedFire = Math.min(
      1,
      state.sustainedFire + (cfg.automatic ? 0.24 : 0.48)
    );

    this.triggerMuzzleFx(this.active);
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

    const rightGrip = new THREE.Object3D();
    rightGrip.name = 'RightGripSocket';
    rightGrip.position.set(0, -0.090, 0.105);
    group.add(rightGrip);

    const leftGrip = new THREE.Object3D();
    leftGrip.name = 'LeftForegripSocket';
    leftGrip.position.set(
      0,
      -0.025,
      -Math.min(0.34, Math.max(0.20, cfg.modelLength * 0.34))
    );
    group.add(leftGrip);

    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0, -(cfg.modelLength / 2 + barrelLength + 0.04));
    group.add(muzzle);

    const muzzleFx = buildMuzzleFx(cfg);
    muzzleFx.group.position.copy(muzzle.position);
    muzzleFx.group.visible = false;
    group.add(muzzleFx.group);

    group.position.set(0.34, 1.05, -0.48);
    group.rotation.x = -0.04;

    return {
      group,
      muzzle,
      muzzleFlash: muzzleFx.group,
      muzzleFx,
      rightGrip,
      leftGrip
    };
  }
}

function buildMuzzleFx(cfg) {
  const group = new THREE.Group();

  const additive = (color, opacity = 1) =>
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.052, 8, 6),
    additive(0xfff3b0, 1)
  );
  group.add(core);

  const flareA = new THREE.Mesh(
    new THREE.PlaneGeometry(0.27, 0.050),
    additive(0xffc24d, 0.92)
  );
  flareA.rotation.z = Math.PI * 0.25;
  group.add(flareA);

  const flareB = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.040),
    additive(0xff8f32, 0.72)
  );
  flareB.rotation.z = -Math.PI * 0.25;
  group.add(flareB);

  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(
      cfg.pellets > 1 ? 0.13 : 0.085,
      cfg.pellets > 1 ? 0.38 : 0.28,
      8,
      1,
      true
    ),
    additive(0xffa33a, 0.74)
  );
  cone.rotation.x = -Math.PI / 2;
  cone.position.z = -0.15;
  group.add(cone);

  const sparks = [];
  for (let i = 0; i < 4; i++) {
    const spark = new THREE.Mesh(
      new THREE.PlaneGeometry(0.075, 0.012),
      additive(0xffd675, 0.9)
    );
    group.add(spark);
    sparks.push(spark);
  }

  const smoke = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 8, 6),
    new THREE.MeshBasicMaterial({
      color: 0x59606a,
      transparent: true,
      opacity: 0,
      depthWrite: false
    })
  );
  smoke.position.set(0, 0, -0.03);
  smoke.visible = false;
  group.add(smoke);

  const light = new THREE.PointLight(
    0xffb45a,
    0,
    cfg.pellets > 1 ? 2.2 : 1.5,
    2
  );
  light.position.z = -0.06;
  group.add(light);

  group.visible = false;

  return {
    group,
    core,
    flareA,
    flareB,
    cone,
    sparks,
    smoke,
    light,
    age: 0,
    life: 0.03,
    seed: 1
  };
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
