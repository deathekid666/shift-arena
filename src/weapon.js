import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { GAME_CONFIG, WEAPON_ORDER } from './config.js';
import { buildJunkWeaponVisual } from './junk-weapon-model.js';
import { WeaponAudio } from './audio.js';
import {
  weaponRaiseBlend,
  weaponTransitionArc,
  weaponTransitionSettle,
  dampTransitionDirection,
  getWeaponTransitionProfile
} from './weapon-transition.js';
import {
  getWeaponHandlingMass,
  getWeaponResponseScale
} from './weapon-physicality.js';
import {
  createWeaponNaturalMotionState,
  resetWeaponNaturalMotion,
  stepWeaponNaturalMotion
} from './weapon-natural-motion.js';

const SHOTGUN_PATTERN_10 = [
  [0.00, 0.00],

  [0.38, 0.00],
  [-0.19, 0.329],
  [-0.19, -0.329],

  [0.675, 0.390],
  [0.00, 0.780],
  [-0.675, 0.390],
  [-0.675, -0.390],
  [0.00, -0.780],
  [0.675, -0.390]
];

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
    this.reticleRay = new THREE.Raycaster();
    this.reticleDirection = new THREE.Vector3();
    this.center = new THREE.Vector2(0, 0);
    this.activeSlot = 0;
    this.loadout = ['mechanicalAR', 'compactSMG'];
    this.blocked = false;
    this.visualHidden = false;
    this.ammoPool = { light: 90, medium: 90, shells: 24, heavy: 8 };
    this.ammoCaps = { light: 180, medium: 180, shells: 48, heavy: 20 };
    this.startingAmmo = { ...this.ammoPool };
    this.handMounted = false;
    this.tmpHandWorld = new THREE.Vector3();
    this.tmpHandLocal = new THREE.Vector3();
    this.tmpShoulderWorld = new THREE.Vector3();
    this.tmpChestWorld = new THREE.Vector3();
    this.tmpAimForward = new THREE.Vector3();
    this.tmpAimRight = new THREE.Vector3();
    this.tmpAimUp = new THREE.Vector3();
    this.tmpGripWorld = new THREE.Vector3();
    this.tmpGripLocal = new THREE.Vector3();
    this.tmpParentWorldQ = new THREE.Quaternion();
    this.tmpParentWorldQInv = new THREE.Quaternion();
    this.tmpDesiredWorldQ = new THREE.Quaternion();
    this.tmpDesiredLocalQ = new THREE.Quaternion();
    this.tmpGripRight = new THREE.Vector3();
    this.tmpGripUp = new THREE.Vector3();
    this.tmpGripForwardWorld = new THREE.Vector3();
    this.tmpCarryCorrectionQ = new THREE.Quaternion();
    this.tmpGripOffset = new THREE.Vector3();
    this.gripPose = {
      aiming: false,
      rightGrip: new THREE.Vector3(),
      leftGrip: new THREE.Vector3(),
      muzzle: new THREE.Vector3(),
      forward: new THREE.Vector3(),
      weaponQuaternion: new THREE.Quaternion(),
      rightHandIK: false,
      rightHandOrient: false,
      rightHandIKBlend: 0,
      leftHandLambda: 30,
      adsBlend: 0,
      shoulderBlend: 0,
      poseClass: 'ar'
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
        recoilPitch: 0,
        recoilYaw: 0,
        recoilRoll: 0,
        sustainedFire: 0,
        shotIndex: 0,
        sinceShot: 999,
        burstShots: 0,
        shoulderBlend: 0,
        adsBlend: 0,
        wasShoulderRequested: false,
        raiseAnchorActive: false,
        raiseAnchorPosition: new THREE.Vector3(),
        raiseAnchorQuaternion: new THREE.Quaternion(),
        bodyGripReady: false,
        bodyGripLocal: new THREE.Vector3(),
        slideCarryActive: false,
        bobTime: 0,
        pumpSoundPlayed: true,
        transitionDirection: -1,
        naturalMotion:
          createWeaponNaturalMotionState()
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
  get weaponKey() { return this.loadout[this.activeSlot]; }
  get poseClass() { return this.cfg.poseClass ?? 'ar'; }
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

  get shoulderRequested() {
    if (
      this.blocked ||
      this.visualHidden ||
      !this.input.pointerLocked
    ) {
      return false;
    }

    const firingNow = this.input.mouseDown(0);
    const recentShot =
      this.state.sinceShot <
      (this.cfg.shoulderHoldTime ?? 0.28);

    return this.aiming || firingNow || recentShot;
  }

  get combatPoseActive() {
    // Keep the upper body in the firing pose during the short lower-out blend,
    // but never use this value as the target for shoulderBlend itself.
    return (
      this.shoulderRequested ||
      (this.state.shoulderBlend ?? 0) > 0.06
    );
  }

  get shoulderPoseBlend() {
    return THREE.MathUtils.clamp(
      this.state.shoulderBlend ?? 0,
      0,
      1
    );
  }

  get aimPoseBlend() {
    return THREE.MathUtils.clamp(
      this.state.adsBlend ?? 0,
      0,
      1
    );
  }

  get holdPoseActive() {
    return (
      !this.blocked &&
      !this.visualHidden &&
      this.input.pointerLocked
    );
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
          massKg: entry.cfg.massKg,
          physicalSizeM: entry.cfg.physicalSizeM,
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

  get firstShotReady() {
    return this.isFirstShotReady();
  }

  get spreadRatio() {
    const spread = this.currentSpread();
    return THREE.MathUtils.clamp(
      spread / Math.max(0.001, this.cfg.hipBloom * 1.8),
      0,
      1
    );
  }

  get targetUnderReticle() {
    if (
      this.blocked ||
      this.visualHidden ||
      !this.input.pointerLocked
    ) {
      return false;
    }

    this.camera.getWorldDirection(this.reticleDirection);

    const hit = firstValidHit(
      this.reticleRay,
      this.camera.position,
      this.reticleDirection,
      [...this.targets.hitMeshes, ...this.world.cameraObstacles],
      this.cfg.range
    );

    return Boolean(
      hit &&
      hit.object?.userData?.combatTarget &&
      !hit.object.userData.disabled
    );
  }

  get crosshairGap() {
    return THREE.MathUtils.lerp(
      this.cfg.reticleMinGap,
      this.cfg.reticleMaxGap,
      this.spreadRatio
    );
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

      if (
        s.sinceShot >
          (entry.cfg.bloomSettleDelay ?? 0.24) &&
        s.dynamicBloom <
          (entry.cfg.bloomSettleSnap ?? 0.00018)
      ) {
        s.dynamicBloom = 0;
      }

      // Critically damped-ish weapon recoil spring. Physical kg is converted
      // to a bounded handling mass so a 9.5 kg sniper genuinely feels heavier
      // without turning the visual spring into slow-motion.
      const handlingMass =
        getWeaponHandlingMass(entry.cfg);
      const handlingResponse =
        getWeaponResponseScale(entry.cfg);
      const kickStiffness =
        92 / Math.max(0.55, handlingMass);
      const kickDamping =
        18 /
        Math.max(
          0.72,
          Math.sqrt(handlingMass)
        );
      s.visualKickVelocity += -s.visualKick * kickStiffness * dt;
      s.visualKickVelocity *= Math.exp(-kickDamping * dt);
      s.visualKick += s.visualKickVelocity * dt;
      if (Math.abs(s.visualKick) < 0.0002 && Math.abs(s.visualKickVelocity) < 0.001) {
        s.visualKick = 0;
        s.visualKickVelocity = 0;
      }

      const poseRecovery =
        (
          entry.cfg.weaponRecoilRecovery ??
          Math.max(8, entry.cfg.recoilRecovery * 1.35)
        ) *
        Math.pow(handlingResponse, 0.35);

      s.recoilPitch = THREE.MathUtils.damp(
        s.recoilPitch,
        0,
        poseRecovery,
        dt
      );
      s.recoilYaw = THREE.MathUtils.damp(
        s.recoilYaw,
        0,
        poseRecovery * 1.12,
        dt
      );
      s.recoilRoll = THREE.MathUtils.damp(
        s.recoilRoll,
        0,
        poseRecovery * 1.20,
        dt
      );

      if (Math.abs(s.recoilPitch) < 0.00008) s.recoilPitch = 0;
      if (Math.abs(s.recoilYaw) < 0.00008) s.recoilYaw = 0;
      if (Math.abs(s.recoilRoll) < 0.00008) s.recoilRoll = 0;

      s.sustainedFire = THREE.MathUtils.damp(
        s.sustainedFire,
        0,
        entry.cfg.sustainedFireRecovery ?? 3.8,
        dt
      );

      this.updateMuzzleFx(entry, dt);
      this.updatePumpCycle(entry, dt);
      this.updateTapeRattler(entry, dt);

      if (
        s.sinceShot >
        (entry.cfg.recoilResetDelay ?? 0.6)
      ) {
        s.shotIndex = 0;
        s.burstShots = 0;
      }

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

  updatePumpCycle(entry, dt) {
    const { cfg, state, model } = entry;
    const pump = model.pumpRoot;

    if (!cfg.pumpAction || !pump) return;

    const t = state.sinceShot;
    const travel = cfg.pumpTravel ?? 0.15;

    let targetZ = 0;
    let targetPitch = 0;

    // Let recoil read first, then rack the pump sharply back and return.
    if (t >= 0.16 && t < 0.36) {
      const p = THREE.MathUtils.smoothstep(t, 0.16, 0.36);
      targetZ = travel * p;
      targetPitch = -0.045 * p;
    } else if (t >= 0.36 && t < 0.68) {
      const p = THREE.MathUtils.smoothstep(t, 0.36, 0.68);
      targetZ = travel * (1 - p);
      targetPitch = -0.045 * (1 - p);
    }

    // Very high response: this is a mechanical slide, not soft weapon sway.
    pump.position.z = THREE.MathUtils.damp(
      pump.position.z,
      targetZ,
      42,
      dt
    );
    pump.rotation.x = THREE.MathUtils.damp(
      pump.rotation.x,
      targetPitch,
      38,
      dt
    );

    if (
      !state.pumpSoundPlayed &&
      t >= 0.20
    ) {
      if (entry === this.active) this.audio.playPump?.();
      state.pumpSoundPlayed = true;
    }
  }

  updateTapeRattler(entry, dt) {
    const { cfg, state, model } = entry;
    const wheel = model.tapeWheel;

    if (!cfg.tapeWheelSpin || !wheel) return;

    const active = entry === this.active;
    const firingWindow =
      active &&
      !state.isReloading &&
      state.sinceShot < 0.12;

    const targetSpeed = firingWindow ? 24 : 0;
    wheel.userData.spinSpeed = THREE.MathUtils.damp(
      wheel.userData.spinSpeed ?? 0,
      targetSpeed,
      firingWindow ? 18 : 7,
      dt
    );

    // Wheel plane is rotated to the side; local Z is its spin axis.
    wheel.rotation.z +=
      (wheel.userData.spinSpeed ?? 0) * dt;
  }

  updateWeaponPose(dt) {
    const cfg = this.cfg;
    const state = this.state;
    const modelData = this.active.model;
    const model = modelData.group;
    const speed = this.player.horizontalSpeed();
    const moving = Math.min(1, speed / 5.2);

    state.bobTime += dt * (3.5 + speed * 1.4);

    const shoulderRequested = this.shoulderRequested;

    const shoulderJustRaised =
      shoulderRequested &&
      !state.wasShoulderRequested;
    const shoulderJustLowered =
      !shoulderRequested &&
      state.wasShoulderRequested;

    if (shoulderJustRaised) {
      // Freeze the exact weapon pose at the start of the raise. From this
      // point onward the weapon must NOT read the right hand while that hand
      // is being IK-solved toward the weapon, or the two systems feed back
      // into each other and visibly vibrate.
      state.raiseAnchorPosition.copy(
        model.position
      );
      state.raiseAnchorQuaternion.copy(
        model.quaternion
      );
      state.raiseAnchorActive = true;
    }

    if (shoulderJustLowered) {
      // Lowering gives ownership back to the hand. Right-arm IK is disabled
      // below before the weapon begins following the live carry hand again.
      state.raiseAnchorActive = false;
    }

    state.wasShoulderRequested =
      shoulderRequested;

    const shoulderTarget = shoulderRequested ? 1 : 0;
    const handlingMass =
      getWeaponHandlingMass(cfg);
    const handlingResponse =
      getWeaponResponseScale(cfg);
    const shoulderResponse =
      (
        shoulderRequested
          ? (cfg.shoulderRaiseSpeed ?? 26)
          : (cfg.shoulderLowerSpeed ?? 12)
      ) *
      handlingResponse;

    state.shoulderBlend = THREE.MathUtils.damp(
      state.shoulderBlend ?? 0,
      shoulderTarget,
      shoulderResponse,
      dt
    );

    if (
      Math.abs(state.shoulderBlend - shoulderTarget) <
      0.004
    ) {
      state.shoulderBlend = shoulderTarget;
    }

    const adsTarget = this.aiming ? 1 : 0;
    const adsResponse =
      (
        this.aiming
          ? (cfg.adsPoseInSpeed ?? 28)
          : (cfg.adsPoseOutSpeed ?? 20)
      ) *
      handlingResponse;

    state.adsBlend = THREE.MathUtils.damp(
      state.adsBlend ?? 0,
      adsTarget,
      adsResponse,
      dt
    );

    if (
      Math.abs(state.adsBlend - adsTarget) <
      0.004
    ) {
      state.adsBlend = adsTarget;
    }

    const shoulderBlend =
      weaponRaiseBlend(
        state.shoulderBlend
      );

    const transitionArc =
      weaponTransitionArc(
        state.shoulderBlend
      );

    const transitionSettle =
      weaponTransitionSettle(
        state.shoulderBlend
      );

    const transitionProfile =
      getWeaponTransitionProfile(
        this.poseClass
      );

    // Never hard-flip the raise/lower arc when the player releases input in
    // the middle of the motion. Direction carries momentum for a few frames,
    // producing a tiny anticipation on raise and a weighted hang before lower.
    state.transitionDirection =
      dampTransitionDirection(
        state.transitionDirection,
        shoulderRequested,
        transitionProfile.directionResponse *
          handlingResponse,
        dt
      );

    const transitionDirection =
      state.transitionDirection;

    const directedArc =
      transitionArc *
      transitionDirection;

    const adsBlend =
      THREE.MathUtils.smoothstep(
        state.adsBlend,
        0,
        1
      );

    const adsPoseMotionScale =
      THREE.MathUtils.lerp(
        1,
        cfg.adsPoseMotionScale ?? 0.05,
        adsBlend
      );

    const bobScale =
      cfg.bob *
      moving *
      THREE.MathUtils.lerp(
        0.55,
        0.10,
        shoulderBlend
      ) *
      adsPoseMotionScale;

    const bobX =
      Math.cos(state.bobTime) *
      bobScale;
    const bobY =
      Math.abs(Math.sin(state.bobTime * 2)) *
      bobScale *
      0.45;

    const swayScale =
      cfg.sway *
      THREE.MathUtils.lerp(
        0.62,
        0.18,
        shoulderBlend
      ) *
      adsPoseMotionScale;
    const poseLookDeadzone =
      THREE.MathUtils.lerp(
        0.045,
        0.20,
        adsBlend
      );

    const poseLookX =
      Math.abs(this.cameraRig.lookX) < poseLookDeadzone
        ? 0
        : this.cameraRig.lookX;
    const poseLookY =
      Math.abs(this.cameraRig.lookY) < poseLookDeadzone
        ? 0
        : this.cameraRig.lookY;

    const swayX = THREE.MathUtils.clamp(
      -poseLookX * swayScale,
      -0.032,
      0.032
    );
    const swayY = THREE.MathUtils.clamp(
      poseLookY * swayScale * 0.38,
      -0.020,
      0.020
    );

    const authoredLocomotion =
      this.player.vrmCharacter?.authoredLocomotion ??
      null;

    const slideCarryActive = Boolean(
      this.player.sliding ||
      authoredLocomotion?.slideExitActive ||
      (authoredLocomotion?.slideExitTail ?? 0) > 0.015 ||
      authoredLocomotion?.state === 'SLIDE_START' ||
      authoredLocomotion?.state === 'SLIDE_LOOP' ||
      authoredLocomotion?.state === 'SLIDE_EXIT'
    );

    // When authored slide recovery has completely finished, release hand
    // ownership and recapture the Fortnite body-space anchor from the now
    // upright avatar. Reusing the pre-slide anchor is what makes the gun appear
    // to float after the character stands back up.
    if (
      state.slideCarryActive &&
      !slideCarryActive
    ) {
      state.bodyGripReady = false;
    }

    state.slideCarryActive =
      slideCarryActive;

    // During authored slide, restore the exact ownership model used by the
    // last confirmed-good slide build (010.20J): the authored RIGHT hand owns
    // the weapon and only the LEFT support hand follows via IK. Do not force
    // the slide arms toward the body-space rifle target.
    if (
      slideCarryActive &&
      cfg.masterHandCarry &&
      this.handMounted
    ) {
      // Slide keeps the known-good authored-hand ownership. Procedural
      // carry inertia is disabled here so it cannot fight the slide animation.
      resetWeaponNaturalMotion(
        state.naturalMotion
      );

      const handWorld =
        this.player.getHandWorldPosition?.(
          'right',
          this.tmpHandWorld
        ) ??
        null;

      if (handWorld) {
        this.tmpGripLocal.copy(
          handWorld
        );
        this.player.group.worldToLocal(
          this.tmpGripLocal
        );

        // Same fixed carry orientation used by the working 010.20J slide.
        // The authored hand controls position; gameplay owns only weapon local
        // orientation and recoil.
        const recoilPose =
          cfg.recoilPoseScale
            ? Math.max(
                0,
                state.visualKick
              ) *
              cfg.recoilPoseScale
            : 0;

        this.tmpDesiredLocalQ.setFromEuler(
          new THREE.Euler(
            (cfg.carryPitch ?? -0.11) +
              recoilPose,
            cfg.carryYaw ?? 0,
            cfg.carryRoll ?? -0.055,
            'YXZ'
          )
        );

        this.tmpGripOffset
          .copy(
            modelData.rightGrip.position
          )
          .multiply(model.scale)
          .applyQuaternion(
            this.tmpDesiredLocalQ
          );

        const slideTargetPosition =
          this.tmpGripLocal
            .clone()
            .sub(
              this.tmpGripOffset
            );

        // Rigid attachment is intentional: damping makes the gun chase the
        // authored hand and creates visible separation during the fast slide.
        model.position.copy(
          slideTargetPosition
        );
        model.quaternion.copy(
          this.tmpDesiredLocalQ
        );

        model.updateWorldMatrix(
          true,
          true
        );

        this.updateGripPose(
          false,
          false,
          cfg.supportHandIKLambda ?? 150,
          0,
          0,
          0
        );

        return;
      }
    }

    // Fortnite-like weapon stack:
    // body/chest defines a stable rifle-ready grip target,
    // aim direction rotates that target toward the crosshair,
    // then BOTH hands are solved to the weapon as a final IK layer.
    // The target never comes from either hand, so there is no feedback loop.
    if (
      cfg.masterHandCarry &&
      this.handMounted
    ) {
      const chest =
        this.player.getBoneWorldPosition?.(
          'upperChest',
          this.tmpChestWorld
        ) ??
        this.player.getBoneWorldPosition?.(
          'chest',
          this.tmpChestWorld
        );

      const shoulder =
        this.player.getBoneWorldPosition?.(
          'rightShoulder',
          this.tmpShoulderWorld
        ) ??
        chest;

      if (chest && shoulder) {
        const readyToAim =
          shoulderBlend;

        // Capture a stable body-space anchor once. The old build sampled the
        // animated chest/shoulder every frame; any clip or IK micro-motion was
        // therefore injected straight back into the gun and sleeves.
        if (!state.bodyGripReady) {
          this.tmpGripLocal.copy(chest);
          this.player.group.worldToLocal(
            this.tmpGripLocal
          );

          this.tmpHandLocal.copy(shoulder);
          this.player.group.worldToLocal(
            this.tmpHandLocal
          );

          state.bodyGripLocal
            .copy(this.tmpGripLocal)
            .lerp(
              this.tmpHandLocal,
              0.48
            );

          state.bodyGripReady = true;
        }

        // Ready pose follows character facing. Firing/ADS progressively align
        // the whole weapon with the camera aim instead of rotating only an arm.
        this.player.group.getWorldQuaternion(
          this.tmpParentWorldQ
        );

        this.tmpDesiredWorldQ
          .copy(this.tmpParentWorldQ)
          .slerp(
            this.camera.quaternion,
            readyToAim
          );

        const posePitch =
          THREE.MathUtils.lerp(
            cfg.carryPitch ?? -0.105,
            THREE.MathUtils.lerp(
              cfg.hipFireAimPitch ?? -0.045,
              cfg.adsAimPitch ?? -0.012,
              adsBlend
            ),
            readyToAim
          );

        const poseYaw =
          THREE.MathUtils.lerp(
            cfg.carryYaw ?? 0,
            0,
            readyToAim
          );

        const poseRoll =
          THREE.MathUtils.lerp(
            cfg.carryRoll ?? -0.055,
            THREE.MathUtils.lerp(
              cfg.hipFireAimRoll ?? -0.030,
              cfg.adsAimRoll ?? -0.006,
              adsBlend
            ),
            readyToAim
          );

        const naturalMotion =
          stepWeaponNaturalMotion(
            state.naturalMotion,
            {
              dt,
              massKg: cfg.massKg,
              lengthM:
                cfg.physicalSizeM?.length,
              lookX:
                this.cameraRig.lookX,
              lookY:
                this.cameraRig.lookY,
              speed,
              grounded:
                this.player.grounded,
              adsBlend,
              shoulderBlend,
              bobBase: cfg.bob,
              swayBase: cfg.sway,
              scoped:
                Boolean(cfg.scope)
            }
          );

        const aimCorrection =
          new THREE.Quaternion().setFromEuler(
            new THREE.Euler(
              posePitch +
                naturalMotion.pitch +
                transitionProfile.pitch *
                  directedArc +
                transitionProfile.settlePitch *
                  transitionSettle -
                state.visualKick * 0.18 -
                state.recoilPitch * 0.20,
              poseYaw +
                naturalMotion.yaw +
                state.recoilYaw * 0.18 +
                transitionProfile.yaw *
                  directedArc,
              poseRoll +
                naturalMotion.roll +
                transitionProfile.roll *
                  directedArc +
                transitionProfile.settleRoll *
                  transitionSettle +
                state.recoilRoll * 0.16,
              'YXZ'
            )
          );

        this.tmpDesiredWorldQ.multiply(
          aimCorrection
        );

        // Fortnite-style stable root-space grip. The weapon sits across the
        // chest at rest, rises slightly for hip-fire, then moves inward/up for
        // ADS. Position does not inherit per-frame chest animation noise.
        const readyGripX =
          cfg.stanceReadyX ?? 0.010;
        const readyGripY =
          cfg.stanceReadyY ?? -0.090;
        const readyGripZ =
          cfg.stanceReadyZ ?? -0.105;

        const fireGripX =
          THREE.MathUtils.lerp(
            cfg.stanceHipX ?? 0.006,
            cfg.stanceAdsX ?? -0.006,
            adsBlend
          );
        const fireGripY =
          THREE.MathUtils.lerp(
            cfg.stanceHipY ?? -0.045,
            cfg.stanceAdsY ?? -0.010,
            adsBlend
          );
        const fireGripZ =
          THREE.MathUtils.lerp(
            cfg.stanceHipZ ?? -0.155,
            cfg.stanceAdsZ ?? -0.185,
            adsBlend
          );

        const crouchDrop =
          (this.player.crouchVisual ?? 0) *
          0.235;

        this.tmpGripLocal
          .copy(state.bodyGripLocal);

        this.tmpGripLocal.x +=
          THREE.MathUtils.lerp(
            readyGripX,
            fireGripX,
            readyToAim
          );

        this.tmpGripLocal.y +=
          THREE.MathUtils.lerp(
            readyGripY,
            fireGripY,
            readyToAim
          ) -
          crouchDrop;

        this.tmpGripLocal.z +=
          THREE.MathUtils.lerp(
            readyGripZ,
            fireGripZ,
            readyToAim
          );

        // Small class-specific transition arc. It is exactly zero at both
        // endpoints, so existing carry/hip/ADS calibration remains unchanged.
        this.tmpGripLocal.x +=
          transitionProfile.right *
          directedArc;
        this.tmpGripLocal.y +=
          transitionProfile.lift *
            directedArc +
          transitionProfile.settleLift *
            transitionSettle;
        this.tmpGripLocal.z +=
          transitionProfile.forward *
            directedArc +
          transitionProfile.settleForward *
            transitionSettle;

        // Battlefield-style passive carry response: hands/body drive the
        // target while the weapon's mass contributes restrained lag, step
        // rhythm, acceleration reaction and breathing. IK follows this final
        // weapon pose, so arms react as a unit rather than waving separately.
        this.tmpGripLocal.x +=
          naturalMotion.positionX;
        this.tmpGripLocal.y +=
          naturalMotion.positionY;
        this.tmpGripLocal.z +=
          naturalMotion.positionZ;

        // Convert the independent grip target into the weapon group's local
        // transform. rightGrip is the exact modeled pistol-grip pivot.
        this.tmpParentWorldQInv
          .copy(this.tmpParentWorldQ)
          .invert();

        this.tmpDesiredLocalQ
          .copy(
            this.tmpParentWorldQInv
          )
          .multiply(
            this.tmpDesiredWorldQ
          );

        this.tmpGripOffset
          .copy(
            modelData.rightGrip.position
          )
          .multiply(model.scale)
          .applyQuaternion(
            this.tmpDesiredLocalQ
          );

        const targetPosition =
          this.tmpGripLocal
            .clone()
            .sub(
              this.tmpGripOffset
            );

        // Keep the final attachment exact. The perceived weight now lives in
        // the additive spring layer above, so the weapon never rubber-bands
        // away from the IK hands or crosshair target.
        model.position.copy(
          targetPosition
        );
        model.quaternion.copy(
          this.tmpDesiredLocalQ
        );

        model.updateWorldMatrix(
          true,
          true
        );

        this.updateGripPose(
          true,
          false,
          THREE.MathUtils.lerp(
            72,
            86,
            adsBlend
          ),
          adsBlend,
          Math.max(
            0.42,
            shoulderBlend
          ),
          1
        );

        return;
      }
    }

    // Long weapons such as the Scrap Eye are torso/shoulder owned in carry.
    // Both hands follow weapon sockets via IK; no hand drives the weapon.
    if (cfg.shoulderOwnedCarry && this.handMounted) {
      const shoulder =
        this.player.getBoneWorldPosition?.('rightShoulder', this.tmpShoulderWorld) ??
        this.player.getBoneWorldPosition?.('upperChest', this.tmpShoulderWorld);

      if (shoulder) {
        this.player.group.getWorldQuaternion(this.tmpParentWorldQ);

        this.tmpAimForward
          .set(0, 0, -1)
          .applyQuaternion(this.tmpParentWorldQ)
          .normalize();
        this.tmpAimRight
          .set(1, 0, 0)
          .applyQuaternion(this.tmpParentWorldQ)
          .normalize();
        this.tmpAimUp
          .set(0, 1, 0)
          .applyQuaternion(this.tmpParentWorldQ)
          .normalize();

        this.tmpGripWorld
          .copy(shoulder)
          .addScaledVector(
            this.tmpAimForward,
            cfg.carryShoulderForward ?? 0.31
          )
          .addScaledVector(
            this.tmpAimRight,
            (cfg.carryShoulderRight ?? -0.05) +
              bobX * 0.28 +
              swayX * 0.30
          )
          .addScaledVector(
            this.tmpAimUp,
            (cfg.carryShoulderUp ?? -0.18) +
              bobY * 0.35 +
              swayY * 0.25
          );

        this.tmpGripLocal.copy(this.tmpGripWorld);
        this.player.group.worldToLocal(this.tmpGripLocal);

        this.tmpDesiredLocalQ.setFromEuler(
          new THREE.Euler(
            cfg.carryPitch ?? -0.11,
            cfg.carryYaw ?? 0,
            (cfg.carryRoll ?? -0.055) - swayX * 0.24,
            'YXZ'
          )
        );

        this.tmpGripOffset
          .copy(modelData.rightGrip.position)
          .multiply(model.scale)
          .applyQuaternion(this.tmpDesiredLocalQ);

        const targetPosition = this.tmpGripLocal
          .clone()
          .sub(this.tmpGripOffset);

        model.position.x = THREE.MathUtils.damp(
          model.position.x,
          targetPosition.x,
          28 / handlingMass,
          dt
        );
        model.position.y = THREE.MathUtils.damp(
          model.position.y,
          targetPosition.y,
          28 / handlingMass,
          dt
        );
        model.position.z = THREE.MathUtils.damp(
          model.position.z,
          targetPosition.z,
          30 / handlingMass,
          dt
        );

        model.quaternion.slerp(
          this.tmpDesiredLocalQ,
          1 - Math.exp(-(24 / handlingMass) * dt)
        );

        model.updateWorldMatrix(true, true);
        this.updateGripPose(false, false);
        return;
      }
    }

    // Normal equipped stance: anchor the pistol grip to the character's
    // dedicated right-hand socket. The gun center no longer decides placement.
    const weaponSocket = this.player.getWeaponSocket?.();
    let handWorld = null;

    if (cfg.handOwnedCarry && this.handMounted) {
      handWorld =
        this.player.getHandWorldPosition?.('right', this.tmpHandWorld) ??
        null;
    } else if (weaponSocket) {
      weaponSocket.getWorldPosition(this.tmpHandWorld);
      handWorld = this.tmpHandWorld;
    } else if (this.handMounted) {
      handWorld =
        this.player.getHandWorldPosition?.('right', this.tmpHandWorld) ??
        null;
    }

    if (handWorld) {
      this.tmpGripLocal.copy(handWorld);
      this.player.group.worldToLocal(this.tmpGripLocal);

      this.tmpGripLocal.x +=
        (cfg.carryGripX ?? 0) +
        bobX +
        swayX;
      this.tmpGripLocal.y +=
        (cfg.carryGripY ?? 0.005) +
        bobY +
        swayY;
      this.tmpGripLocal.z +=
        (cfg.carryGripZ ?? -0.015) +
        state.visualKick;

      this.tmpDesiredLocalQ.setFromEuler(
        new THREE.Euler(
          cfg.carryPitch ?? -0.11,
          cfg.carryYaw ?? 0,
          (cfg.carryRoll ?? -0.055) - swayX * 0.45,
          'YXZ'
        )
      );

      this.tmpGripOffset
        .copy(modelData.rightGrip.position)
        .multiply(model.scale)
        .applyQuaternion(this.tmpDesiredLocalQ);

      const targetPosition = this.tmpGripLocal
        .clone()
        .sub(this.tmpGripOffset);

      model.position.x = THREE.MathUtils.damp(
        model.position.x,
        targetPosition.x,
        30 / handlingMass,
        dt
      );
      model.position.y = THREE.MathUtils.damp(
        model.position.y,
        targetPosition.y,
        30 / handlingMass,
        dt
      );
      model.position.z = THREE.MathUtils.damp(
        model.position.z,
        targetPosition.z,
        32 / handlingMass,
        dt
      );

      model.quaternion.slerp(
        this.tmpDesiredLocalQ,
        1 - Math.exp(-(26 / handlingMass) * dt)
      );

      model.updateWorldMatrix(true, true);
      this.updateGripPose(false, false);
      return;
    }

    const targetX = 0.34 + bobX + swayX;
    const targetY = 1.05 + bobY + swayY;
    const targetZ = -0.48 + state.visualKick;

    model.position.x = THREE.MathUtils.damp(model.position.x, targetX, 18 / handlingMass, dt);
    model.position.y = THREE.MathUtils.damp(model.position.y, targetY, 18 / handlingMass, dt);
    model.position.z = THREE.MathUtils.damp(model.position.z, targetZ, 22 / handlingMass, dt);
    model.rotation.x = THREE.MathUtils.damp(model.rotation.x, -0.04 - state.visualKick * 0.75, 18 / handlingMass, dt);
    model.rotation.y = THREE.MathUtils.damp(model.rotation.y, 0, 18 / handlingMass, dt);
    model.rotation.z = THREE.MathUtils.damp(model.rotation.z, -swayX * 0.9, 16 / handlingMass, dt);

    model.updateWorldMatrix(true, true);
    this.updateGripPose(false, false);
  }

  updateGripPose(
    rightHandIK = false,
    rightHandOrient = false,
    leftHandLambda = 30,
    adsBlend = 0,
    shoulderBlend = 0,
    rightHandIKBlend = 0
  ) {
    const model = this.active.model;
    model.rightGrip.getWorldPosition(this.gripPose.rightGrip);
    model.leftGrip.getWorldPosition(this.gripPose.leftGrip);
    model.muzzle.getWorldPosition(this.gripPose.muzzle);
    model.group.getWorldQuaternion(this.gripPose.weaponQuaternion);

    this.tmpGripForwardWorld
      .set(0, 0, -1)
      .applyQuaternion(this.gripPose.weaponQuaternion)
      .normalize();
    this.tmpGripRight
      .set(1, 0, 0)
      .applyQuaternion(this.gripPose.weaponQuaternion)
      .normalize();
    this.tmpGripUp
      .set(0, 1, 0)
      .applyQuaternion(this.gripPose.weaponQuaternion)
      .normalize();

    this.gripPose.forward.copy(this.tmpGripForwardWorld);

    // Grip socket is a weapon anchor; the hand bone is at the wrist.
    // Offset the IK target so the palm wraps the handle naturally instead of
    // putting the wrist joint inside the center of the pistol grip.
    this.gripPose.rightGrip
      .addScaledVector(
        this.tmpGripUp,
        this.cfg.rightWristGripUp ?? 0.050
      )
      .addScaledVector(
        this.tmpGripForwardWorld,
        -(this.cfg.rightWristGripBack ?? 0.018)
      )
      .addScaledVector(
        this.tmpGripRight,
        this.cfg.rightWristGripRight ?? 0.010
      );

    this.gripPose.leftGrip
      .addScaledVector(
        this.tmpGripUp,
        this.cfg.leftWristGripUp ?? 0.016
      )
      .addScaledVector(
        this.tmpGripForwardWorld,
        -(this.cfg.leftWristGripBack ?? 0.006)
      );

    this.gripPose.aiming =
      this.holdPoseActive &&
      !this.visualHidden &&
      !this.blocked;
    this.gripPose.rightHandIK = Boolean(rightHandIK);
    this.gripPose.rightHandOrient = Boolean(rightHandOrient);
    this.gripPose.rightHandIKBlend =
      THREE.MathUtils.clamp(
        rightHandIKBlend,
        0,
        1
      );
    this.gripPose.leftHandLambda = leftHandLambda;
    this.gripPose.adsBlend =
      THREE.MathUtils.clamp(adsBlend, 0, 1);
    this.gripPose.shoulderBlend =
      THREE.MathUtils.clamp(shoulderBlend, 0, 1);
    this.gripPose.poseClass =
      this.cfg.poseClass ?? 'ar';
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

  isFirstShotReady() {
    return (
      this.cfg.firstShotAccuracy &&
      this.aiming &&
      this.player.grounded &&
      this.player.horizontalSpeed() < 0.25 &&
      this.state.sinceShot >
        (this.cfg.firstShotResetTime ?? 0.42)
    );
  }

  currentSpread() {
    const cfg = this.cfg;
    const state = this.state;
    let spread = (this.aiming ? cfg.adsBloom : cfg.hipBloom) + state.dynamicBloom;

    const speed = this.player.horizontalSpeed();
    if (speed > 0.35) spread *= cfg.moveSpreadMult;
    if (!this.player.grounded) spread *= cfg.airSpreadMult;
    if (this.player.crouching && this.player.grounded) spread *= cfg.crouchSpreadMult;

    if (this.isFirstShotReady()) {
      spread =
        this.cfg.firstShotAccuracySpread ?? 0;
    }
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

    const nextState = this.active.state;
    nextState.shoulderBlend = 0;
    nextState.adsBlend = 0;
    nextState.wasShoulderRequested = false;
    nextState.raiseAnchorActive = false;
    nextState.bodyGripReady = false;
    nextState.bodyGripLocal.set(0, 0, 0);
    nextState.slideCarryActive = false;
    nextState.transitionDirection = -1;
    resetWeaponNaturalMotion(
      nextState.naturalMotion
    );

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
    newEntry.state.transitionDirection = -1;
    resetWeaponNaturalMotion(
      newEntry.state.naturalMotion
    );
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
      ammoType: this.cfg.ammoType,
      massKg: this.cfg.massKg,
      physicalSizeM: this.cfg.physicalSizeM
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
      entry.state.visualKickVelocity = 0;
      entry.state.recoilPitch = 0;
      entry.state.recoilYaw = 0;
      entry.state.recoilRoll = 0;
      entry.state.sustainedFire = 0;
      entry.state.shotIndex = 0;
      entry.state.burstShots = 0;
      entry.state.shoulderBlend = 0;
      entry.state.adsBlend = 0;
      entry.state.wasShoulderRequested = false;
      entry.state.raiseAnchorActive = false;
      entry.state.bodyGripReady = false;
      entry.state.bodyGripLocal.set(0, 0, 0);
      entry.state.slideCarryActive = false;
      resetWeaponNaturalMotion(
        entry.state.naturalMotion
      );
      entry.state.raiseAnchorPosition.copy(
        entry.model.group.position
      );
      entry.state.raiseAnchorQuaternion.copy(
        entry.model.group.quaternion
      );
      entry.state.sinceShot = 999;
      entry.state.pumpSoundPlayed = true;
      if (entry.model.pumpRoot) {
        entry.model.pumpRoot.position.z = 0;
        entry.model.pumpRoot.rotation.x = 0;
      }
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
    state.pumpSoundPlayed = !cfg.pumpAction;
    state.visualKick = Math.max(state.visualKick, cfg.visualKick);

    const shotNumber = state.shotIndex;
    state.shotIndex += 1;

    const recoil = getFortniteStyleRecoil(
      cfg,
      shotNumber,
      state.burstShots
    );
    state.burstShots += 1;

    // Fortnite separates bloom/spread from recoil. The recoil impulse stays
    // weapon-specific while ADS mainly improves accuracy rather than deleting
    // camera movement.
    const cameraRecoilMul = this.aiming
      ? (cfg.adsRecoilMultiplier ?? 0.90)
      : 1;

    this.cameraRig.kick(
      recoil.pitch * cameraRecoilMul,
      recoil.yaw * cameraRecoilMul,
      {
        recovery: cfg.recoilRecovery,
        attack: cfg.recoilAttack ?? 40,
        maxPitch: cfg.recoilMaxPitch ?? 0.10,
        maxYaw: cfg.recoilMaxYaw ?? 0.08,
        aimPitchFraction:
          cfg.aimRecoilPitchFraction ?? 0.72,
        aimYawFraction:
          cfg.aimRecoilYawFraction ?? 0.72,
        visualFraction:
          cfg.visualRecoilFraction ?? 0.28,
        aimAttack:
          cfg.aimRecoilAttack ?? 58
      }
    );

    state.visualKickVelocity +=
      cfg.visualKick *
      (this.aiming
        ? (cfg.adsWeaponKickImpulse ?? 12.5)
        : (cfg.weaponKickImpulse ?? 17.0)) /
      Math.max(
        0.72,
        getWeaponHandlingMass(cfg)
      );

    const posePitch =
      (cfg.weaponRecoilPitch ??
        Math.max(0.006, recoil.pitch * 1.35)) *
      (this.aiming ? 0.82 : 1);

    const poseYaw =
      (cfg.weaponRecoilYaw ??
        Math.abs(recoil.yaw) * 1.20) *
      Math.sign(recoil.yaw || 1) *
      (this.aiming ? 0.82 : 1);

    const poseRoll =
      (cfg.weaponRecoilRoll ?? 0.006) *
      -Math.sign(recoil.yaw || ((shotNumber & 1) ? -1 : 1)) *
      (this.aiming ? 0.78 : 1);

    state.recoilPitch = THREE.MathUtils.clamp(
      state.recoilPitch + posePitch,
      -0.04,
      cfg.weaponRecoilMaxPitch ?? 0.16
    );
    state.recoilYaw = THREE.MathUtils.clamp(
      state.recoilYaw + poseYaw,
      -(cfg.weaponRecoilMaxYaw ?? 0.055),
      cfg.weaponRecoilMaxYaw ?? 0.055
    );
    state.recoilRoll = THREE.MathUtils.clamp(
      state.recoilRoll + poseRoll,
      -(cfg.weaponRecoilMaxRoll ?? 0.05),
      cfg.weaponRecoilMaxRoll ?? 0.05
    );

    state.sustainedFire = Math.min(
      1,
      state.sustainedFire +
        (cfg.sustainedFirePerShot ??
          (cfg.automatic ? 0.18 : 0.45))
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
    let shieldDamage = 0;
    let healthDamage = 0;
    let shieldBroken = false;
    let startedOnShield = false;
    let pelletsHit = 0;
    let anyHeadshot = false;
    let eliminated = false;
    let firstMuzzle = null;
    const tracerPoints = [];

    for (let i = 0; i < cfg.pellets; i++) {
      const pelletOffset =
        SHOTGUN_PATTERN_10[i % SHOTGUN_PATTERN_10.length];

      const shot = this.traceShot(
        spread,
        cfg.range,
        pelletOffset
      );

      if (!firstMuzzle) firstMuzzle = shot.muzzlePos.clone();

      if (!cfg.hidePelletTracers && i % 3 === 0) {
        tracerPoints.push(shot.impactPoint.clone());
      }

      if (!shot.actualHit?.object?.userData?.combatTarget) continue;

      const multiplier = damageFalloff(shot.distance, cfg);
      const result = this.targets.applyDamage(
        shot.actualHit.object,
        pelletDamage * multiplier,
        cfg.headshotMultiplier
      );

      if (!result) continue;
      pelletsHit += 1;
      totalDamage += result.damage;
      shieldDamage += result.shieldDamage ?? 0;
      healthDamage += result.healthDamage ?? 0;
      shieldBroken = shieldBroken || Boolean(result.shieldBroken);
      startedOnShield =
        startedOnShield ||
        Boolean(result.startedOnShield);
      anyHeadshot = anyHeadshot || result.headshot;
      eliminated = eliminated || result.eliminated;
    }

    if (firstMuzzle) {
      tracerPoints.forEach((point) => this.spawnTracer(firstMuzzle, point, 0.65));
    }

    if (totalDamage > 0) {
      this.onHit?.({
        damage: Math.round(totalDamage),
        shieldDamage: Math.round(shieldDamage),
        healthDamage: Math.round(healthDamage),
        shieldBroken,
        startedOnShield,
        headshot: anyHeadshot,
        eliminated,
        pelletsHit,
        pelletsTotal: cfg.pellets
      });
    }
  }

  traceShot(spread, range, spreadOffset = null) {
    this.cameraRay.setFromCamera(this.center, this.camera);

    const cameraDirection = this.cameraRay.ray.direction.clone();

    if (spreadOffset) {
      applyPatternSpread(
        cameraDirection,
        this.camera,
        spread,
        spreadOffset
      );
    } else {
      applySpread(cameraDirection, this.camera, spread);
    }

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
    const model = buildJunkWeaponVisual(cfg, { pickup: false });
    const { group, muzzle, rightGrip, leftGrip } = model;

    const muzzleFx = buildMuzzleFx(cfg);
    muzzleFx.group.position.copy(muzzle.position);
    muzzleFx.group.visible = false;
    group.add(muzzleFx.group);

    // Preserve the existing hand/aim placement contract.
    group.position.set(0.34, 1.05, -0.48);
    group.rotation.x = -0.04;

    return {
      ...model,
      muzzleFlash: muzzleFx.group,
      muzzleFx,
      rightGrip,
      leftGrip
    };
  }}

function getFortniteStyleRecoil(
  cfg,
  shotNumber,
  burstShots = 0
) {
  const profile = cfg.fortniteRecoil;

  if (!profile) {
    const pattern =
      cfg.recoilPattern[
        shotNumber % cfg.recoilPattern.length
      ];
    return {
      pitch: pattern[0],
      yaw: pattern[1]
    };
  }

  const cameraScale = profile.cameraScale ?? 1;

  const earlyRampShots =
    profile.earlyRampShots ?? 0;
  const earlyRampPerShot =
    profile.earlyRampPerShot ?? 0;

  const ramp =
    1 +
    Math.min(burstShots, earlyRampShots) *
      earlyRampPerShot;

  const verticalPattern =
    profile.verticalPattern ?? [1];

  const verticalStep =
    verticalPattern[
      shotNumber % verticalPattern.length
    ] ?? 1;

  // Fortnite-style spray should not feel like a memorized left/right recoil
  // ladder. Use a deterministic pseudo-random sample so each weapon has
  // bounded lateral deviation without producing a mechanical zig-zag.
  const seed =
    (profile.seed ?? 17) +
    shotNumber * 12.9898 +
    burstShots * 78.233;

  const random01 =
    fract(
      Math.sin(seed) * 43758.5453
    );

  const randomSigned =
    random01 * 2 - 1;

  const horizontalBias =
    profile.horizontalBias ?? 0;

  const horizontalSample =
    THREE.MathUtils.clamp(
      randomSigned +
        horizontalBias,
      -1,
      1
    );

  const burstSideScale =
    1 +
    Math.min(
      burstShots,
      profile.horizontalRampShots ?? 0
    ) *
      (profile.horizontalRampPerShot ?? 0);

  return {
    pitch:
      THREE.MathUtils.degToRad(
        profile.vertical
      ) *
      cameraScale *
      ramp *
      verticalStep,
    yaw:
      THREE.MathUtils.degToRad(
        profile.horizontal
      ) *
      cameraScale *
      horizontalSample *
      burstSideScale
  };
}

function fract(value) {
  return value - Math.floor(value);
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

function applyPatternSpread(
  direction,
  camera,
  amount,
  [x, y]
) {
  if (amount <= 0) return;

  const right = new THREE.Vector3(1, 0, 0)
    .applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(camera.quaternion);

  direction.addScaledVector(right, x * amount);
  direction.addScaledVector(up, y * amount);
}

function damageFalloff(distance, cfg) {
  if (distance <= cfg.falloffStart) return 1;
  if (distance >= cfg.falloffEnd) return cfg.minDamageMultiplier;
  const t = (distance - cfg.falloffStart) / (cfg.falloffEnd - cfg.falloffStart);
  return 1 - (1 - cfg.minDamageMultiplier) * t;
}
