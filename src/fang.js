import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { GAME_CONFIG } from './config.js';

export class TinFangSystem {
  constructor({ scene, camera, cameraRig, player, input, world, targets, audio, onHit, onState, onToast }) {
    this.scene = scene;
    this.camera = camera;
    this.cameraRig = cameraRig;
    this.player = player;
    this.input = input;
    this.world = world;
    this.targets = targets;
    this.audio = audio;
    this.onHit = onHit;
    this.onState = onState;
    this.onToast = onToast;
    this.cfg = GAME_CONFIG.tinFang;

    this.state = 'READY';
    this.holdTime = 0;
    this.actionTime = 0;
    this.actionDuration = 0;
    this.releaseCharge = 0;
    this.releaseAimPoint = null;
    this.releaseLaunched = false;
    this.projectile = null;
    this.stuckPosition = null;

    this.raycaster = new THREE.Raycaster();
    this.center = new THREE.Vector2(0, 0);
    this.tmpA = new THREE.Vector3();
    this.tmpB = new THREE.Vector3();
    this.compactAim = false;

    this.shotProxy = {
      alive: true,
      takeWeaponDamage: () => {
        this.dislodgeFromShot();
        return null;
      }
    };

    this.buildPlayerVisuals();
    this.buildTrajectory();
    this.useRealHand = false;

    this.player.characterReady?.then((avatar) => {
      if (avatar) this.bindToRealHand();
    });

    this.emitState();
  }

  get blocksWeapons() {
    return ['PRIMING', 'AIMING', 'RELEASE', 'SLASH', 'CLAW'].includes(this.state);
  }

  get aiming() {
    return ['PRIMING', 'AIMING', 'RELEASE'].includes(this.state);
  }

  get hasFang() {
    return !this.projectile && this.state !== 'LOST';
  }

  get chargeRatio() {
    if (this.state !== 'AIMING' && this.state !== 'RELEASE') return 0;
    if (this.state === 'RELEASE') return this.releaseCharge;
    return THREE.MathUtils.clamp(
      (this.holdTime - this.cfg.primeThreshold) /
      Math.max(0.001, this.cfg.fullChargeTime - this.cfg.primeThreshold),
      0,
      1
    );
  }

  buildPlayerVisuals() {
    const bodyMat = new THREE.MeshToonMaterial({
      color: 0xc78553
    });
    const handMat = new THREE.MeshToonMaterial({
      color: 0xf1d7aa
    });

    this.armRig = new THREE.Group();
    this.armRig.position.set(0.31, 0.48, -0.02);
    this.armRig.visible = false;
    this.player.body.add(this.armRig);

    this.upperArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.095, 0.115, 0.48, 9),
      bodyMat
    );
    this.upperArm.position.y = -0.24;
    this.upperArm.castShadow = true;
    this.armRig.add(this.upperArm);

    this.elbow = new THREE.Group();
    this.elbow.position.y = -0.48;
    this.armRig.add(this.elbow);

    this.forearm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.10, 0.42, 9),
      bodyMat
    );
    this.forearm.position.y = -0.21;
    this.forearm.castShadow = true;
    this.elbow.add(this.forearm);

    this.hand = new THREE.Mesh(
      new THREE.SphereGeometry(0.115, 10, 8),
      handMat
    );
    this.hand.position.y = -0.43;
    this.hand.castShadow = true;
    this.elbow.add(this.hand);

    this.handRoot = new THREE.Group();
    this.handRoot.position.y = -0.43;
    this.elbow.add(this.handRoot);

    this.handFang = buildFangModel();
    this.handFang.scale.setScalar(0.72);
    this.handFang.position.set(0, -0.02, -0.15);
    this.handFang.rotation.set(0.12, 0, 0.08);
    this.handRoot.add(this.handFang);

    this.sheath = buildSheath();
    this.holsteredFang = this.sheath.userData.holsteredFang ?? null;

    // Temporary fallback placement before the humanoid skeleton is available.
    // Keep it close and small instead of the old oversized floating prop.
    this.sheath.position.set(-0.14, -0.11, -0.070);
    this.sheath.rotation.set(0.02, 0.36, 0.38);
    this.sheath.scale.setScalar(0.48);
    this.player.body.add(this.sheath);

    // READY means holstered. The real knife must not remain rendered in-hand.
    this.handFang.visible = false;
    if (this.holsteredFang) this.holsteredFang.visible = true;

    this.slashArc = buildSlashArc();
    this.slashArc.visible = false;
    this.player.group.add(this.slashArc);
  }

  bindToRealHand() {
    const socket = this.player.getFangSocket?.();
    if (!socket || !this.handFang) return;

    this.useRealHand = true;
    this.armRig.visible = false;
    // Active Fang always binds to the RIGHT hand. Storage is on LEFT hip.
    socket.add(this.handFang);
    this.handFang.position.set(0.0, 0.015, -0.10);
    this.handFang.rotation.set(-0.10, 0.0, Math.PI * 0.52);
    this.handFang.scale.setScalar(0.64);

    const holsterSocket = this.player.getHolsterSocket?.();
    if (holsterSocket && this.sheath) {
      holsterSocket.add(this.sheath);
      this.sheath.position.set(0, 0, 0);
      this.sheath.rotation.set(0, 0, 0);
      this.sheath.scale.setScalar(0.48);
    }

    this.player.setFangArmOverride?.(false);
    this.syncFangVisuals();
  }

  syncFangVisuals() {
    const stored =
      this.state === 'READY' &&
      !this.projectile;

    const inHand =
      (
        this.state === 'PRIMING' ||
        this.state === 'AIMING' ||
        this.state === 'SLASH' ||
        (this.state === 'RELEASE' && !this.releaseLaunched)
      ) &&
      !this.projectile;

    // The scabbard belongs to the outfit and never disappears just because
    // the knife is drawn. Only the inserted handle/guard toggles.
    if (this.sheath) this.sheath.visible = true;
    if (this.holsteredFang) this.holsteredFang.visible = stored;
    if (this.handFang) this.handFang.visible = inHand;

    if (!inHand && this.handFang) {
      setFangGlow(this.handFang, 0);
    }
  }

  buildTrajectory() {
    this.trajectoryGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(), new THREE.Vector3()
    ]);
    this.trajectoryMaterial = new THREE.LineBasicMaterial({
      color: 0xffc77d,
      transparent: true,
      opacity: 0.68,
      depthWrite: false
    });
    this.trajectoryLine = new THREE.Line(this.trajectoryGeometry, this.trajectoryMaterial);
    this.trajectoryLine.visible = false;
    this.trajectoryLine.renderOrder = 8;
    this.scene.add(this.trajectoryLine);
  }

  reset() {
    this.removeProjectile();
    this.state = 'READY';
    this.holdTime = 0;
    this.actionTime = 0;
    this.releaseAimPoint = null;
    this.releaseLaunched = false;
    this.stuckPosition = null;
    this.armRig.visible = false;
    this.player.setFangArmOverride?.(false);
    this.player.setFangAnimation?.(null);
    this.slashArc.visible = false;
    this.trajectoryLine.visible = false;
    this.resetBodyPose();
    this.syncFangVisuals();
    this.emitState();
  }

  update(dt, canUse = true) {
    this.updateProjectile(dt);

    if (!canUse) {
      if (['PRIMING', 'AIMING', 'SLASH', 'CLAW'].includes(this.state)) {
        this.cancelHandAction();
      }
      this.trajectoryLine.visible = false;
      this.syncFangVisuals();
      this.emitState();
      return;
    }

    this.tryRecover();

    if (this.state === 'READY' && this.input.consume('melee')) {
      this.beginPrime();
    } else if (
      ['THROWN', 'STUCK', 'FALLING', 'DROPPED', 'LOST'].includes(this.state) &&
      this.input.consume('melee')
    ) {
      this.beginClaw();
    }

    if (this.state === 'PRIMING' || this.state === 'AIMING') {
      const stillHolding = this.input.down('melee');

      if (stillHolding) {
        this.holdTime += dt;
        if (this.state === 'PRIMING' && this.holdTime >= this.cfg.primeThreshold) {
          this.state = 'AIMING';
          this.audio?.playFang?.('charge');
        }
      } else {
        if (this.holdTime >= this.cfg.primeThreshold) this.beginRelease();
        else this.beginSlash();
      }

      this.input.consumeReleased('melee');
    } else {
      this.input.consumeReleased('melee');
    }

    if (this.state === 'PRIMING' || this.state === 'AIMING') this.updateAimPose(dt);
    if (this.state === 'RELEASE') this.updateRelease(dt);
    if (this.state === 'SLASH') this.updateSlash(dt);
    if (this.state === 'CLAW') this.updateClaw(dt);

    this.syncFangVisuals();
    this.emitState();
  }

  beginPrime() {
    this.state = 'PRIMING';
    this.holdTime = 0;
    this.actionTime = 0;
    this.armRig.visible = !this.useRealHand;
    this.player.setFangArmOverride?.(true);
    this.player.setFangAnimation?.({
      mode: 'aim',
      t: 0,
      compact: false,
      aimPitch: this.cameraRig.pitch,
      aimYaw: angleDelta(this.player.group.rotation.y, this.cameraRig.yaw)
    });
    this.handFang.visible = true;
    this.trajectoryLine.visible = false;
    this.setArmPose({
      shoulder: [0.18, -0.12, -0.18],
      elbow: [0.20, 0, 0.25],
      hand: [0.15, 0, 0.15]
    }, 1);
    this.audio?.playFang?.('draw');
  }

  updateAimPose(dt) {
    const aiming = this.state === 'AIMING';
    const charge = aiming
      ? this.chargeRatio
      : THREE.MathUtils.clamp(this.holdTime / this.cfg.primeThreshold, 0, 1);

    this.compactAim = aiming && this.hasLowOverheadClearance();
    const breath = aiming ? Math.sin(performance.now() * 0.006) * 0.028 : 0;

    const target = !aiming
      ? {
          shoulder: [-0.72, -0.10, -0.28],
          elbow: [0.78, 0.02, 0.20],
          hand: [-0.18, 0.04, 0.24]
        }
      : this.compactAim
        ? {
            shoulder: [-0.62 + breath * 0.25, -0.30, -0.66],
            elbow: [1.02, 0.02, -0.48],
            hand: [-0.30, -0.05, 0.18]
          }
        : {
            shoulder: [-1.58 + breath, -0.18, -0.48],
            elbow: [1.48 - breath * 0.5, 0.10, 0.30],
            hand: [-0.42, 0.10, 0.42]
          };

    if (this.useRealHand) {
      this.applyRealThrowPose('aim', charge, this.compactAim, dt);
    } else {
      this.dampArmPose(target, aiming ? 16 : 20, dt);
    }

    if (!this.useRealHand) {
      this.player.body.rotation.z = THREE.MathUtils.damp(
        this.player.body.rotation.z,
        aiming ? (this.compactAim ? -0.025 : -0.065) : -0.025,
        14,
        dt
      );
      this.player.body.rotation.y = THREE.MathUtils.damp(
        this.player.body.rotation.y,
        aiming ? (this.compactAim ? 0.045 : 0.10) : 0.03,
        14,
        dt
      );
    }

    setFangGlow(this.handFang, aiming ? 0.10 + charge * 0.42 : 0.03);

    if (aiming) this.updateTrajectoryPreview();
    else this.trajectoryLine.visible = false;
  }

  hasLowOverheadClearance() {
    const origin = this.player.group.position.clone().add(new THREE.Vector3(0, 1.42, 0));
    this.raycaster.set(origin, new THREE.Vector3(0, 1, 0));
    this.raycaster.near = 0;
    this.raycaster.far = this.cfg.compactAimClearance;

    const hit = this.raycaster.intersectObjects(this.world.cameraObstacles, false)
      .find((entry) => !entry.object.userData.disabled);

    return Boolean(hit);
  }
  beginRelease() {
    this.releaseCharge = THREE.MathUtils.clamp(
      (this.holdTime - this.cfg.primeThreshold) /
      Math.max(0.001, this.cfg.fullChargeTime - this.cfg.primeThreshold),
      0,
      1
    );
    this.releaseAimPoint = this.computeAimPoint();
    this.releaseCompact = this.compactAim;
    this.releaseLaunched = false;
    this.actionTime = 0;
    this.actionDuration = this.cfg.releaseDuration;
    this.state = 'RELEASE';
    this.trajectoryLine.visible = true;
  }

  updateRelease(dt) {
    const previousTime = this.actionTime;
    this.actionTime += dt;
    // Sample the release key exactly even when a slow frame crosses it.
    const releaseTime = this.actionDuration * this.cfg.releaseMoment;
    if (!this.releaseLaunched && previousTime < releaseTime && this.actionTime >= releaseTime) {
      this.actionTime = releaseTime;
    }
    const t = THREE.MathUtils.clamp(this.actionTime / this.actionDuration, 0, 1);

    if (this.useRealHand) {
      this.applyRealThrowPose('release', t, this.releaseCompact, dt);
    }

    if (!this.useRealHand) {
      if (this.releaseCompact) {
        if (t < 0.24) {
          const k = easeInOut(t / 0.24);
          this.setArmPose({
            shoulder: [
              THREE.MathUtils.lerp(-0.62, -0.78, k),
              THREE.MathUtils.lerp(-0.30, -0.36, k),
              THREE.MathUtils.lerp(-0.66, -0.78, k)
            ],
            elbow: [
              THREE.MathUtils.lerp(1.02, 1.16, k),
              0.02,
              THREE.MathUtils.lerp(-0.48, -0.58, k)
            ],
            hand: [-0.34, -0.06, 0.22]
          }, 1);
        } else if (t < 0.68) {
          const k = easeInOut((t - 0.24) / 0.44);
          this.setArmPose({
            shoulder: [
              THREE.MathUtils.lerp(-0.78, 0.46, k),
              THREE.MathUtils.lerp(-0.36, 0.06, k),
              THREE.MathUtils.lerp(-0.78, -0.08, k)
            ],
            elbow: [
              THREE.MathUtils.lerp(1.16, -0.58, k),
              THREE.MathUtils.lerp(0.02, -0.05, k),
              THREE.MathUtils.lerp(-0.58, -0.14, k)
            ],
            hand: [
              THREE.MathUtils.lerp(-0.34, 0.24, k),
              -0.04,
              THREE.MathUtils.lerp(0.22, -0.18, k)
            ]
          }, 1);
          this.player.body.rotation.y = THREE.MathUtils.lerp(0.045, -0.045, k);
        } else {
          const k = easeOut((t - 0.68) / 0.32);
          this.setArmPose({
            shoulder: [THREE.MathUtils.lerp(0.46, 0.58, k), 0.08, -0.04],
            elbow: [THREE.MathUtils.lerp(-0.58, -0.72, k), -0.04, -0.16],
            hand: [0.22, -0.03, -0.20]
          }, 1);
          this.player.body.rotation.y = THREE.MathUtils.lerp(-0.045, 0, k);
        }
      } else {
        if (t < 0.24) {
          const k = easeInOut(t / 0.24);
          this.setArmPose({
            shoulder: [
              THREE.MathUtils.lerp(-1.58, -1.92, k),
              THREE.MathUtils.lerp(-0.18, -0.24, k),
              THREE.MathUtils.lerp(-0.48, -0.58, k)
            ],
            elbow: [
              THREE.MathUtils.lerp(1.48, 1.62, k),
              0.08,
              THREE.MathUtils.lerp(0.30, 0.38, k)
            ],
            hand: [-0.48, 0.10, 0.50]
          }, 1);
          this.player.body.rotation.z = THREE.MathUtils.lerp(-0.065, -0.10, k);
        } else if (t < 0.68) {
          const k = easeInOut((t - 0.24) / 0.44);
          this.setArmPose({
            shoulder: [
              THREE.MathUtils.lerp(-1.92, 0.34, k),
              THREE.MathUtils.lerp(-0.24, 0.10, k),
              THREE.MathUtils.lerp(-0.58, 0.24, k)
            ],
            elbow: [
              THREE.MathUtils.lerp(1.62, -0.55, k),
              THREE.MathUtils.lerp(0.08, -0.06, k),
              THREE.MathUtils.lerp(0.38, -0.18, k)
            ],
            hand: [
              THREE.MathUtils.lerp(-0.48, 0.22, k),
              0,
              THREE.MathUtils.lerp(0.50, -0.18, k)
            ]
          }, 1);
          this.player.body.rotation.z = THREE.MathUtils.lerp(-0.10, 0.055, k);
          this.player.body.rotation.y = THREE.MathUtils.lerp(0.10, -0.08, k);
        } else {
          const k = easeOut((t - 0.68) / 0.32);
          this.setArmPose({
            shoulder: [THREE.MathUtils.lerp(0.34, 0.72, k), 0.12, 0.18],
            elbow: [THREE.MathUtils.lerp(-0.55, -0.78, k), -0.08, -0.20],
            hand: [0.26, 0, -0.22]
          }, 1);
          this.player.body.rotation.z = THREE.MathUtils.lerp(0.055, 0, k);
          this.player.body.rotation.y = THREE.MathUtils.lerp(-0.08, 0, k);
        }
      }
    }

    if (!this.releaseLaunched && t >= this.cfg.releaseMoment) {
      this.releaseLaunched = true;
      this.launchFang(this.releaseCharge, this.releaseAimPoint);
      this.handFang.visible = false;
      this.trajectoryLine.visible = false;
    } else if (!this.releaseLaunched) {
      this.updateTrajectoryPreview(this.releaseAimPoint, this.releaseCharge);
    }

    if (t >= 1) {
      this.armRig.visible = false;
      this.player.setFangArmOverride?.(false);
      this.resetBodyPose();
      this.player.setFangAnimation?.(null);
      this.state = this.stateFromProjectile();
      this.syncFangVisuals();
    }
  }

  applyRealThrowPose(mode, t, compact, dt) {
    const head = this.player.getBoneWorldPosition?.('head') ?? this.player.group.position;
    const direction = mode === 'release' && this.releaseAimPoint
      ? this.releaseAimPoint.clone().sub(head).normalize()
      : this.camera.getWorldDirection(new THREE.Vector3());
    const animation = {
      mode, t, compact, direction,
      draw: this.holdTime / this.cfg.primeThreshold,
      releaseMoment: this.cfg.releaseMoment,
      aimYaw: angleDelta(this.player.group.rotation.y, Math.atan2(-direction.x, -direction.z))
    };
    this.player.setFangAnimation?.(animation);
    this.player.applyFangPose?.(animation, dt);
  }

  beginSlash() {
    this.state = 'SLASH';
    this.actionTime = 0;
    this.actionDuration = 0.38;
    this.armRig.visible = !this.useRealHand;
    this.player.setFangArmOverride?.(true);
    this.player.setFangAnimation?.({ mode: 'slash', t: 0, compact: false });
    this.handFang.visible = true;
    this.slashArc.visible = true;
    this.slashArc.material.opacity = 0;
    this.trajectoryLine.visible = false;
    this.audio?.playFang?.('slash');
    this.slashDidHit = false;
  }

  updateSlash(dt) {
    this.actionTime += dt;
    const t = THREE.MathUtils.clamp(this.actionTime / this.actionDuration, 0, 1);

    if (this.useRealHand) {
      this.player.setFangAnimation?.({ mode: 'slash', t, compact: false });
    }

    if (t < 0.20) {
      const k = easeOut(t / 0.20);
      this.setArmPose({
        shoulder: [THREE.MathUtils.lerp(-0.35, -1.10, k), -0.12, THREE.MathUtils.lerp(-0.15, -0.62, k)],
        elbow: [THREE.MathUtils.lerp(0.55, 1.30, k), 0.06, 0.26],
        hand: [-0.25, 0, 0.35]
      }, 1);
    } else if (t < 0.68) {
      const k = easeInOut((t - 0.20) / 0.48);
      this.setArmPose({
        shoulder: [THREE.MathUtils.lerp(-1.10, 0.72, k), THREE.MathUtils.lerp(-0.12, 0.28, k), THREE.MathUtils.lerp(-0.62, 0.52, k)],
        elbow: [THREE.MathUtils.lerp(1.30, -0.62, k), THREE.MathUtils.lerp(0.06, -0.10, k), THREE.MathUtils.lerp(0.26, -0.32, k)],
        hand: [THREE.MathUtils.lerp(-0.25, 0.38, k), 0, THREE.MathUtils.lerp(0.35, -0.30, k)]
      }, 1);

      const swing = Math.sin(k * Math.PI);
      this.slashArc.visible = true;
      this.slashArc.position.set(0, 1.06, -0.50);
      this.slashArc.rotation.set(Math.PI / 2, 0, THREE.MathUtils.lerp(-1.25, 0.95, k));
      this.slashArc.scale.setScalar(0.92 + swing * 0.20);
      this.slashArc.material.opacity = swing * 0.62;

      if (!this.slashDidHit && k >= 0.34) {
        this.slashDidHit = true;
        this.performMeleeHit(this.cfg.meleeDamage, false);
      }
    } else {
      const k = easeOut((t - 0.68) / 0.32);
      this.dampArmPose({
        shoulder: [0.05, 0, 0],
        elbow: [0.10, 0, 0],
        hand: [0, 0, 0]
      }, 18, dt);
      this.slashArc.material.opacity *= 1 - Math.min(1, dt * 9);
      this.player.body.rotation.z = THREE.MathUtils.lerp(this.player.body.rotation.z, 0, k);
    }

    if (t >= 1) this.finishHandAction();
  }

  beginClaw() {
    this.state = 'CLAW';
    this.actionTime = 0;
    this.actionDuration = 0.30;
    this.clawDidHit = false;
    this.armRig.visible = false;
    this.slashArc.visible = true;
    this.slashArc.material.opacity = 0;
    this.audio?.playFang?.('claw');
  }

  updateClaw(dt) {
    this.actionTime += dt;
    const t = THREE.MathUtils.clamp(this.actionTime / this.actionDuration, 0, 1);
    const k = easeInOut(t);
    const swing = Math.sin(t * Math.PI);

    this.slashArc.position.set(0, 1.02, -0.46);
    this.slashArc.rotation.set(Math.PI / 2, 0, THREE.MathUtils.lerp(-0.82, 0.82, k));
    this.slashArc.scale.setScalar(0.72 + swing * 0.13);
    this.slashArc.material.opacity = swing * 0.44;

    if (!this.clawDidHit && t >= 0.35) {
      this.clawDidHit = true;
      this.performMeleeHit(this.cfg.clawDamage, true);
    }

    if (t >= 1) {
      this.slashArc.visible = false;
      this.state = this.stateFromProjectile();
    }
  }

  performMeleeHit(damage, claw = false) {
    const origin = this.player.group.position.clone().add(new THREE.Vector3(0, 1.0, 0));
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    forward.y = 0;
    if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
    forward.normalize();

    let best = null;
    let bestScore = Infinity;

    for (const mesh of this.targets.hitMeshes) {
      if (mesh.userData.disabled || mesh.userData.combatTarget === this.shotProxy) continue;

      mesh.getWorldPosition(this.tmpA);
      const to = this.tmpA.clone().sub(origin);
      const distance = to.length();
      if (distance > this.cfg.meleeRange || distance < 0.05) continue;

      const flat = new THREE.Vector3(to.x, 0, to.z);
      if (flat.lengthSq() < 0.001) continue;
      flat.normalize();

      const facing = forward.dot(flat);
      if (facing < 0.42) continue;
      if (!this.hasClearMeleeLine(origin, this.tmpA, distance)) continue;

      const score = distance - facing * 0.55;
      if (score < bestScore) {
        bestScore = score;
        best = mesh;
      }
    }

    if (!best) return;

    const result = this.targets.applyDamage(best, damage, 1);
    if (result) {
      result.melee = true;
      result.claw = claw;
      this.onHit?.(result);
      this.audio?.playFang?.('hit');
    }
  }

  hasClearMeleeLine(origin, targetPos, targetDistance) {
    const direction = targetPos.clone().sub(origin).normalize();
    this.raycaster.set(origin, direction);
    this.raycaster.near = 0.03;
    this.raycaster.far = Math.max(0.03, targetDistance - 0.08);

    const hit = this.raycaster.intersectObjects(this.world.cameraObstacles, false)
      .find((entry) => !entry.object.userData.disabled);

    return !hit;
  }

  computeAimPoint() {
    this.raycaster.setFromCamera(this.center, this.camera);
    this.raycaster.near = 0;
    this.raycaster.far = this.cfg.aimRange;

    const objects = [...this.targets.hitMeshes, ...this.world.cameraObstacles]
      .filter((object) => !object.userData.disabled && object.userData.combatTarget !== this.shotProxy);

    const hit = this.raycaster.intersectObjects(objects, false)[0];
    return hit
      ? hit.point.clone()
      : this.raycaster.ray.origin.clone().addScaledVector(this.raycaster.ray.direction, this.cfg.aimRange);
  }

  currentHandWorldPosition() {
    const origin = new THREE.Vector3();
    this.handFang.getWorldPosition(origin);
    return origin;
  }

  updateTrajectoryPreview(forcedAimPoint = null, forcedCharge = null) {
    if ((!this.useRealHand && !this.armRig.visible) || !this.handFang.visible) {
      this.trajectoryLine.visible = false;
      return;
    }

    const origin = this.currentHandWorldPosition();
    const aimPoint = forcedAimPoint?.clone() ?? this.computeAimPoint();
    const charge = forcedCharge ?? this.chargeRatio;
    const speed = THREE.MathUtils.lerp(this.cfg.minThrowSpeed, this.cfg.maxThrowSpeed, charge);
    const velocity = solveBallisticVelocity(
      origin,
      aimPoint,
      speed,
      this.cfg.projectileGravity
    );

    const points = [origin.clone()];
    let previous = origin.clone();
    const maxTime = Math.min(2.1, Math.max(0.45, origin.distanceTo(aimPoint) / Math.max(1, speed) * 1.45));

    for (let i = 1; i <= 24; i++) {
      const t = maxTime * (i / 24);
      const point = origin.clone()
        .addScaledVector(velocity, t)
        .add(new THREE.Vector3(0, -0.5 * this.cfg.projectileGravity * t * t, 0));

      const delta = point.clone().sub(previous);
      const distance = delta.length();

      if (distance > 0.0001) {
        this.raycaster.set(previous, delta.clone().normalize());
        this.raycaster.near = 0;
        this.raycaster.far = distance;

        const objects = [...this.targets.hitMeshes, ...this.world.cameraObstacles]
          .filter((object) => !object.userData.disabled && object.userData.combatTarget !== this.shotProxy);

        const hit = this.raycaster.intersectObjects(objects, false)[0];
        if (hit) {
          points.push(hit.point.clone());
          break;
        }
      }

      points.push(point);
      previous = point;
    }

    this.trajectoryGeometry.setFromPoints(points);
    this.trajectoryLine.visible = true;
  }

  launchFang(charge, aimPoint) {
    const origin = this.currentHandWorldPosition();
    const speed = THREE.MathUtils.lerp(this.cfg.minThrowSpeed, this.cfg.maxThrowSpeed, charge);
    const velocity = solveBallisticVelocity(
      origin,
      aimPoint ?? this.computeAimPoint(),
      speed,
      this.cfg.projectileGravity
    );

    const model = buildFangModel();
    model.position.copy(origin);
    this.scene.add(model);
    orientAlongDirection(model, velocity.clone().normalize());

    const hitbox = model.userData.hitbox;
    hitbox.userData.combatTarget = this.shotProxy;
    hitbox.userData.hitZone = 'prop';
    hitbox.userData.disabled = true;

    const trailGeometry = new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 7 }, () => origin.clone())
    );
    const trailMaterial = new THREE.LineBasicMaterial({
      color: 0xffc77d,
      transparent: true,
      opacity: 0.60
    });
    const trail = new THREE.Line(trailGeometry, trailMaterial);
    this.scene.add(trail);

    this.projectile = {
      model,
      hitbox,
      spinRoot: model.userData.spinRoot,
      velocity,
      mode: 'flying',
      age: 0,
      spin: 0,
      bounces: 0,
      stuckTarget: null,
      stuckObject: null,
      stuckNormal: new THREE.Vector3(0, 1, 0),
      trail,
      trailGeometry,
      trailMaterial,
      trailPoints: Array.from({ length: 7 }, () => origin.clone())
    };

    this.stuckPosition = null;
    this.audio?.playFang?.('throw');
    this.onToast?.('TIN FANG THROWN');
  }

  updateProjectile(dt) {
    const p = this.projectile;
    if (!p) return;

    if (p.mode === 'flying') {
      this.updateFlyingProjectile(dt);
    } else if (p.mode === 'stuck' || p.mode === 'settled') {
      this.updateStuckProjectile();
    } else if (p.mode === 'falling') {
      this.updateFallingProjectile(dt);
    }

    if (!['RELEASE', 'CLAW'].includes(this.state)) {
      this.state = this.stateFromProjectile();
    }
  }

  updateFlyingProjectile(dt) {
    const p = this.projectile;
    p.age += dt;

    const oldPos = p.model.position.clone();
    p.velocity.y -= this.cfg.projectileGravity * dt;
    const newPos = oldPos.clone().addScaledVector(p.velocity, dt);
    const delta = newPos.clone().sub(oldPos);
    const distance = delta.length();

    if (distance > 0.0001) {
      const direction = delta.clone().normalize();
      this.raycaster.set(oldPos, direction);
      this.raycaster.near = 0;
      this.raycaster.far = distance + 0.05;

      const objects = [...this.targets.hitMeshes, ...this.world.cameraObstacles]
        .filter((object) => !object.userData.disabled && object.userData.combatTarget !== this.shotProxy);

      const hit = this.raycaster.intersectObjects(objects, false)[0];

      if (hit) {
        p.model.position.copy(hit.point).addScaledVector(direction, -0.035);
        orientAlongDirection(p.model, direction);
        this.stickProjectile(hit, direction);
        return;
      }
    }

    p.model.position.copy(newPos);
    p.spin += dt * 25;
    orientAlongDirection(p.model, p.velocity.clone().normalize());
    p.spinRoot.rotation.z = p.spin;
    this.updateTrail(newPos);

    if (
      p.age >= this.cfg.projectileLifetime ||
      Math.abs(newPos.x) > 42 ||
      Math.abs(newPos.z) > 38 ||
      newPos.y < -2 ||
      newPos.y > 18
    ) {
      this.loseFang();
    }
  }

  stickProjectile(hit, incomingDirection) {
    const p = this.projectile;
    if (!p) return;

    this.removeTrail();
    p.velocity.set(0, 0, 0);
    p.mode = 'stuck';
    p.stuckNormal.copy(worldHitNormal(hit, incomingDirection));
    this.stuckPosition = hit.point.clone();

    const target = hit.object.userData.combatTarget;
    if (target && target !== this.shotProxy) {
      const result = this.targets.applyTinFangDamage(hit.object, this.cfg.throwBodyDamage);

      if (result) {
        result.tinFang = true;
        this.onHit?.(result);
        this.audio?.playFang?.(result.headshot ? 'head' : 'hit');

        if (result.headshot) this.onToast?.('TIN FANG HEADSHOT · ELIMINATED');
        else if (result.eliminated) this.onToast?.('TIN FANG · ELIMINATED');
        else this.onToast?.(`TIN FANG HIT · ${result.damage}`);

        if (!result.eliminated && target.alive !== false) {
          p.stuckTarget = target;
          p.stuckObject = hit.object;
          hit.object.updateWorldMatrix(true, false);
          hit.object.attach(p.model);
        } else {
          this.startFalling(
            p.stuckNormal.clone().multiplyScalar(1.8).add(new THREE.Vector3(0, 1.6, 0))
          );
          return;
        }
      }
    } else {
      this.audio?.playFang?.('hit');
    }

    this.registerShootable();
    this.updateStuckProjectile();
  }

  updateStuckProjectile() {
    const p = this.projectile;
    if (!p) return;

    if (p.stuckTarget && p.stuckTarget.alive === false) {
      this.startFalling(
        p.stuckNormal.clone().multiplyScalar(1.5).add(new THREE.Vector3(0, 1.4, 0))
      );
      return;
    }

    p.model.getWorldPosition(this.tmpA);
    this.stuckPosition = this.tmpA.clone();

    const pulse = 0.03 + (Math.sin(performance.now() * 0.007) + 1) * 0.015;
    setFangGlow(p.model, pulse);
  }

  dislodgeFromShot() {
    const p = this.projectile;
    if (!p || !['stuck', 'settled'].includes(p.mode)) return;

    const shotDirection = new THREE.Vector3();
    this.camera.getWorldDirection(shotDirection);
    const impulse = p.stuckNormal.clone().multiplyScalar(2.7)
      .addScaledVector(shotDirection, 1.1)
      .add(new THREE.Vector3(0, 1.7, 0));

    this.startFalling(impulse);
    this.audio?.playFang?.('hit');
    this.onToast?.('TIN FANG KNOCKED LOOSE');
  }

  startFalling(initialVelocity) {
    const p = this.projectile;
    if (!p) return;

    this.unregisterShootable();

    p.model.updateWorldMatrix(true, false);
    this.scene.attach(p.model);

    p.mode = 'falling';
    p.velocity.copy(initialVelocity);
    p.bounces = 0;
    p.stuckTarget = null;
    p.stuckObject = null;
    this.stuckPosition = null;

    if (this.state !== 'RELEASE' && this.state !== 'CLAW') this.state = 'FALLING';
  }

  updateFallingProjectile(dt) {
    const p = this.projectile;
    const oldPos = p.model.position.clone();

    p.velocity.y -= this.cfg.fallGravity * dt;
    const newPos = oldPos.clone().addScaledVector(p.velocity, dt);
    const delta = newPos.clone().sub(oldPos);
    const distance = delta.length();

    if (distance > 0.0001) {
      this.raycaster.set(oldPos, delta.clone().normalize());
      this.raycaster.near = 0;
      this.raycaster.far = distance + 0.04;

      const hit = this.raycaster.intersectObjects(this.world.cameraObstacles, false)[0];
      if (hit) {
        const normal = worldHitNormal(hit, delta.clone().normalize());
        p.model.position.copy(hit.point).addScaledVector(normal, 0.045);

        const normalSpeed = p.velocity.dot(normal);
        const normalComponent = normal.clone().multiplyScalar(normalSpeed);
        const tangent = p.velocity.clone().sub(normalComponent).multiplyScalar(0.68);

        p.velocity.copy(tangent).addScaledVector(
          normal,
          -normalSpeed * this.cfg.bounceRestitution
        );

        p.bounces += 1;
        p.spin *= 0.74;
        this.audio?.playFang?.('hit');

        if (p.bounces >= 3 || p.velocity.length() < 1.0) {
          this.settleProjectile(normal, hit.point);
          return;
        }
      } else {
        p.model.position.copy(newPos);
      }
    }

    p.spin += dt * (12 + p.velocity.length() * 1.8);
    p.spinRoot.rotation.z = p.spin;

    const direction = p.velocity.lengthSq() > 0.001
      ? p.velocity.clone().normalize()
      : new THREE.Vector3(0, -1, 0);
    orientAlongDirection(p.model, direction);

    if (
      Math.abs(p.model.position.x) > 42 ||
      Math.abs(p.model.position.z) > 38 ||
      p.model.position.y < -2
    ) {
      this.loseFang();
    }
  }

  settleProjectile(normal, surfacePoint) {
    const p = this.projectile;
    if (!p) return;

    p.mode = 'settled';
    p.velocity.set(0, 0, 0);
    p.stuckNormal.copy(normal);
    p.stuckTarget = null;
    p.stuckObject = null;

    const tangent = Math.abs(normal.y) > 0.7
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0).cross(normal).normalize();

    const bitangent = normal.clone().cross(tangent).normalize();
    const basis = new THREE.Matrix4().makeBasis(tangent, normal, bitangent);
    p.model.quaternion.setFromRotationMatrix(basis);
    p.model.rotateZ(0.32);

    this.fitModelAboveSurface(p.model, normal, surfacePoint, 0.025);

    this.registerShootable();
    this.updateStuckProjectile();

    if (this.state !== 'RELEASE' && this.state !== 'CLAW') this.state = 'DROPPED';
  }

  fitModelAboveSurface(model, normal, surfacePoint, margin = 0.02) {
    model.updateWorldMatrix(true, true);

    if (normal.y > 0.65) {
      const bounds = visibleWorldBounds(model);
      if (bounds && Number.isFinite(bounds.min.y)) {
        const desiredMinY = surfacePoint.y + margin;
        const lift = desiredMinY - bounds.min.y;
        if (lift > 0) model.position.y += lift;
      }
      return;
    }

    model.position.copy(surfacePoint).addScaledVector(normal, margin + 0.06);
  }
  registerShootable() {
    const p = this.projectile;
    if (!p?.hitbox) return;
    p.hitbox.userData.disabled = false;
    this.targets.registerHitMeshes([p.hitbox]);
  }

  unregisterShootable() {
    const p = this.projectile;
    if (!p?.hitbox) return;
    p.hitbox.userData.disabled = true;
    this.targets.unregisterHitMeshes([p.hitbox]);
  }

  updateTrail(position) {
    const p = this.projectile;
    if (!p?.trail) return;

    p.trailPoints.pop();
    p.trailPoints.unshift(position.clone());
    p.trailGeometry.setFromPoints(p.trailPoints);
  }

  removeTrail() {
    const p = this.projectile;
    if (!p?.trail) return;

    this.scene.remove(p.trail);
    p.trailGeometry.dispose();
    p.trailMaterial.dispose();
    p.trail = null;
  }

  tryRecover() {
    const p = this.projectile;
    if (!p || !['stuck', 'settled'].includes(p.mode)) return;

    p.model.getWorldPosition(this.tmpA);
    this.stuckPosition = this.tmpA.clone();

    const playerPos = this.player.group.position;
    const horizontalDistance = Math.hypot(
      playerPos.x - this.stuckPosition.x,
      playerPos.z - this.stuckPosition.z
    );
    const verticalDistance = Math.abs(
      (playerPos.y + 0.9) - this.stuckPosition.y
    );

    if (
      horizontalDistance <= this.cfg.recoveryRadius &&
      verticalDistance <= this.cfg.recoveryVerticalTolerance
    ) {
      this.recover();
    }
  }

  recover() {
    this.removeProjectile();
    this.stuckPosition = null;
    this.state = 'READY';
    this.sheath.visible = true;
    this.armRig.visible = false;
    this.player.setFangArmOverride?.(false);
    this.player.setFangAnimation?.(null);
    this.resetBodyPose();
    this.syncFangVisuals();
    this.audio?.playFang?.('recover');
    this.onToast?.('TIN FANG RECOVERED');
  }

  loseFang() {
    this.removeProjectile();
    this.stuckPosition = null;
    this.state = 'LOST';
    this.sheath.visible = true;
    this.armRig.visible = false;
    this.player.setFangArmOverride?.(false);
    this.player.setFangAnimation?.(null);
    this.resetBodyPose();
    this.syncFangVisuals();
    this.onToast?.('TIN FANG LOST · RETURNS ON RESPAWN');
  }

  removeProjectile() {
    const p = this.projectile;
    if (!p) return;

    this.unregisterShootable();
    this.removeTrail();

    if (p.model) {
      p.model.updateWorldMatrix(true, false);
      this.scene.attach(p.model);
      this.scene.remove(p.model);
      disposeGroup(p.model);
    }

    this.projectile = null;
  }

  finishHandAction() {
    this.armRig.visible = false;
    this.player.setFangArmOverride?.(false);
    this.player.setFangAnimation?.(null);
    this.slashArc.visible = false;
    this.trajectoryLine.visible = false;
    this.resetBodyPose();
    this.state = 'READY';
    this.holdTime = 0;
    this.syncFangVisuals();
  }

  cancelHandAction() {
    const wasClaw = this.state === 'CLAW';
    this.armRig.visible = false;
    this.player.setFangArmOverride?.(false);
    this.player.setFangAnimation?.(null);
    this.slashArc.visible = false;
    this.trajectoryLine.visible = false;
    this.resetBodyPose();

    this.state = wasClaw ? this.stateFromProjectile() : 'READY';
    this.holdTime = 0;
    this.syncFangVisuals();
  }

  stateFromProjectile() {
    if (!this.projectile) return this.state === 'LOST' ? 'LOST' : 'READY';

    if (this.projectile.mode === 'flying') return 'THROWN';
    if (this.projectile.mode === 'stuck') return 'STUCK';
    if (this.projectile.mode === 'falling') return 'FALLING';
    if (this.projectile.mode === 'settled') return 'DROPPED';
    return 'THROWN';
  }

  setArmPose(pose, blend = 1) {
    if (this.useRealHand) return;
    this.armRig.rotation.set(
      pose.shoulder[0] * blend,
      pose.shoulder[1] * blend,
      pose.shoulder[2] * blend
    );
    this.elbow.rotation.set(
      pose.elbow[0] * blend,
      pose.elbow[1] * blend,
      pose.elbow[2] * blend
    );
    this.handRoot.rotation.set(
      pose.hand[0] * blend,
      pose.hand[1] * blend,
      pose.hand[2] * blend
    );
  }

  dampArmPose(pose, lambda, dt) {
    if (this.useRealHand) return;
    this.armRig.rotation.x = THREE.MathUtils.damp(this.armRig.rotation.x, pose.shoulder[0], lambda, dt);
    this.armRig.rotation.y = THREE.MathUtils.damp(this.armRig.rotation.y, pose.shoulder[1], lambda, dt);
    this.armRig.rotation.z = THREE.MathUtils.damp(this.armRig.rotation.z, pose.shoulder[2], lambda, dt);

    this.elbow.rotation.x = THREE.MathUtils.damp(this.elbow.rotation.x, pose.elbow[0], lambda, dt);
    this.elbow.rotation.y = THREE.MathUtils.damp(this.elbow.rotation.y, pose.elbow[1], lambda, dt);
    this.elbow.rotation.z = THREE.MathUtils.damp(this.elbow.rotation.z, pose.elbow[2], lambda, dt);

    this.handRoot.rotation.x = THREE.MathUtils.damp(this.handRoot.rotation.x, pose.hand[0], lambda, dt);
    this.handRoot.rotation.y = THREE.MathUtils.damp(this.handRoot.rotation.y, pose.hand[1], lambda, dt);
    this.handRoot.rotation.z = THREE.MathUtils.damp(this.handRoot.rotation.z, pose.hand[2], lambda, dt);
  }

  resetBodyPose() {
    this.player.body.rotation.x = 0;
    this.player.body.rotation.y = 0;
    this.player.body.rotation.z = 0;
  }

  emitState() {
    let distance = null;
    let bearing = 0;

    if (this.projectile && ['stuck', 'settled'].includes(this.projectile.mode)) {
      this.projectile.model.getWorldPosition(this.tmpA);
      this.stuckPosition = this.tmpA.clone();

      distance = Math.hypot(
        this.player.group.position.x - this.stuckPosition.x,
        this.player.group.position.z - this.stuckPosition.z
      );

      const dx = this.stuckPosition.x - this.player.group.position.x;
      const dz = this.stuckPosition.z - this.player.group.position.z;
      const worldAngle = Math.atan2(dx, -dz);
      const relative = worldAngle - this.cameraRig.yaw;
      bearing = THREE.MathUtils.radToDeg(Math.atan2(Math.sin(relative), Math.cos(relative)));
    }

    this.onState?.({
      state: this.state,
      charge: this.chargeRatio,
      hasFang: this.hasFang,
      blocksWeapons: this.blocksWeapons,
      aiming: this.aiming,
      compactAim: this.compactAim,
      distance,
      bearing
    });
  }
}

function angleDelta(current, target) {
  return Math.atan2(
    Math.sin(target - current),
    Math.cos(target - current)
  );
}

function buildFangModel() {
  const group = new THREE.Group();
  const spinRoot = new THREE.Group();
  group.add(spinRoot);

  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0xd8dde1,
    roughness: 0.22,
    metalness: 0.92
  });
  const edgeMat = new THREE.MeshStandardMaterial({
    color: 0xf7fbff,
    roughness: 0.12,
    metalness: 1.0
  });
  const spineMat = new THREE.MeshStandardMaterial({
    color: 0x7e858a,
    roughness: 0.34,
    metalness: 0.86
  });
  const wrapMat = new THREE.MeshStandardMaterial({
    color: 0x66402d,
    roughness: 0.90,
    metalness: 0.02
  });
  const threadMat = new THREE.MeshStandardMaterial({
    color: 0xb78455,
    roughness: 0.95,
    metalness: 0
  });

  // Improvised cockroach-scale can shard: asymmetric, tapered and visibly
  // sharpened rather than a generic triangular game knife.
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.075, 0.03);
  bladeShape.lineTo(0.080, 0.01);
  bladeShape.lineTo(0.058, -0.30);
  bladeShape.lineTo(0.018, -0.53);
  bladeShape.lineTo(-0.018, -0.62);
  bladeShape.lineTo(-0.060, -0.42);
  bladeShape.lineTo(-0.090, -0.16);
  bladeShape.closePath();

  const blade = new THREE.Mesh(
    new THREE.ExtrudeGeometry(bladeShape, {
      depth: 0.028,
      bevelEnabled: true,
      bevelSize: 0.010,
      bevelThickness: 0.008,
      bevelSegments: 2
    }),
    bladeMat
  );
  blade.rotation.x = Math.PI / 2;
  blade.position.set(0, 0.17, -0.13);
  blade.castShadow = true;
  spinRoot.add(blade);

  const edgeShape = new THREE.Shape();
  edgeShape.moveTo(0.050, -0.03);
  edgeShape.lineTo(0.073, -0.03);
  edgeShape.lineTo(0.050, -0.32);
  edgeShape.lineTo(0.015, -0.53);
  edgeShape.lineTo(0.000, -0.49);
  edgeShape.closePath();
  const edge = new THREE.Mesh(
    new THREE.ExtrudeGeometry(edgeShape, {
      depth: 0.032,
      bevelEnabled: false
    }),
    edgeMat
  );
  edge.rotation.x = Math.PI / 2;
  edge.position.set(0, 0.165, -0.13);
  spinRoot.add(edge);

  const spine = new THREE.Mesh(
    new THREE.BoxGeometry(0.028, 0.035, 0.34),
    spineMat
  );
  spine.position.set(-0.066, 0.0, -0.17);
  spine.rotation.x = -0.08;
  spinRoot.add(spine);

  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.050, 0.058, 0.32, 10),
    wrapMat
  );
  handle.rotation.x = Math.PI / 2;
  handle.position.z = 0.25;
  handle.castShadow = true;
  spinRoot.add(handle);

  // Individual cord wraps make the handle read like a physical improvised tool.
  for (let i = 0; i < 6; i++) {
    const wrap = new THREE.Mesh(
      new THREE.TorusGeometry(0.057, 0.009, 5, 12),
      threadMat
    );
    wrap.rotation.x = Math.PI / 2;
    wrap.position.z = 0.12 + i * 0.052;
    wrap.rotation.z = (i % 2 ? 1 : -1) * 0.10;
    spinRoot.add(wrap);
  }

  const guard = new THREE.Mesh(
    new THREE.BoxGeometry(0.135, 0.028, 0.050),
    spineMat
  );
  guard.position.z = 0.055;
  guard.castShadow = true;
  spinRoot.add(guard);

  const pommel = new THREE.Mesh(
    new THREE.TorusGeometry(0.048, 0.014, 6, 14),
    spineMat
  );
  pommel.rotation.x = Math.PI / 2;
  pommel.position.z = 0.43;
  spinRoot.add(pommel);

  const hitbox = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false
    })
  );
  hitbox.position.z = 0.02;
  hitbox.userData.disabled = true;
  hitbox.userData.fangInvisibleHitbox = true;
  spinRoot.add(hitbox);

  group.userData.hitbox = hitbox;
  group.userData.spinRoot = spinRoot;
  group.scale.setScalar(0.78);
  return group;
}

function buildSheath() {
  const group = new THREE.Group();
  group.name = 'TinFangSheath';

  const leatherMat = new THREE.MeshStandardMaterial({
    color: 0x2f2723,
    roughness: 0.94,
    metalness: 0.01
  });
  const edgeLeatherMat = new THREE.MeshStandardMaterial({
    color: 0x4a3428,
    roughness: 0.90,
    metalness: 0.01
  });
  const wrapMat = new THREE.MeshStandardMaterial({
    color: 0x8f5936,
    roughness: 0.88,
    metalness: 0.01
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x697176,
    roughness: 0.48,
    metalness: 0.72
  });
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x34393b,
    roughness: 0.58,
    metalness: 0.66
  });
  const gripMat = new THREE.MeshStandardMaterial({
    color: 0x4a3027,
    roughness: 0.95,
    metalness: 0
  });
  const cordMat = new THREE.MeshStandardMaterial({
    color: 0xa16d42,
    roughness: 0.98,
    metalness: 0
  });

  // Flat tapered leather scabbard. This silhouette sits against the body
  // instead of projecting outward like the old round tube.
  const profile = new THREE.Shape();
  profile.moveTo(-0.060, 0.155);
  profile.lineTo(0.060, 0.155);
  profile.lineTo(0.050, -0.105);
  profile.lineTo(0.020, -0.180);
  profile.lineTo(0.000, -0.205);
  profile.lineTo(-0.020, -0.180);
  profile.lineTo(-0.050, -0.105);
  profile.closePath();

  const bodyGeometry = new THREE.ExtrudeGeometry(profile, {
    depth: 0.040,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.007,
    bevelThickness: 0.006,
    curveSegments: 1
  });
  bodyGeometry.translate(0, 0, -0.020);

  const body = new THREE.Mesh(bodyGeometry, leatherMat);
  body.castShadow = true;
  group.add(body);

  // Reinforced stitched edge strips.
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(0.016, 0.285, 0.050),
      edgeLeatherMat
    );
    edge.position.set(side * 0.052, 0.005, -0.002);
    edge.rotation.z = side * -0.035;
    group.add(edge);
  }

  // Metal mouth where the blade enters.
  const mouth = new THREE.Mesh(
    new THREE.BoxGeometry(0.145, 0.038, 0.060),
    darkMetalMat
  );
  mouth.position.set(0, 0.165, -0.002);
  mouth.castShadow = true;
  group.add(mouth);

  // Two compact retention straps around the sheath body.
  for (const [y, rot] of [[0.060, 0.045], [-0.080, -0.040]]) {
    const strap = new THREE.Mesh(
      new THREE.BoxGeometry(0.135, 0.038, 0.054),
      wrapMat
    );
    strap.position.set(0, y, 0.001);
    strap.rotation.z = rot;
    group.add(strap);

    const rivet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.009, 0.009, 0.012, 8),
      metalMat
    );
    rivet.rotation.x = Math.PI / 2;
    rivet.position.set(0.052, y, 0.033);
    group.add(rivet);
  }

  // Mounting plate lies behind the scabbard and overlaps the character belt.
  const mountPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.150, 0.105, 0.026),
    darkMetalMat
  );
  mountPlate.position.set(0.020, 0.205, -0.042);
  mountPlate.rotation.z = -0.05;
  group.add(mountPlate);

  // Two short belt straps sell the physical attachment from side/rear views.
  for (const x of [0.046, -0.035]) {
    const loop = new THREE.Mesh(
      new THREE.BoxGeometry(0.038, 0.135, 0.024),
      edgeLeatherMat
    );
    loop.position.set(x, 0.245, -0.052);
    loop.rotation.z = x > 0 ? 0.08 : -0.06;
    group.add(loop);

    const buckle = new THREE.Mesh(
      new THREE.BoxGeometry(0.050, 0.025, 0.030),
      metalMat
    );
    buckle.position.set(x, 0.302, -0.052);
    group.add(buckle);
  }

  // Small lower tie keeps the sheath visually planted against the hip.
  const lowerTie = new THREE.Mesh(
    new THREE.BoxGeometry(0.095, 0.028, 0.050),
    wrapMat
  );
  lowerTie.position.set(0, -0.125, 0.004);
  lowerTie.rotation.z = -0.035;
  group.add(lowerTie);

  // Visible portion of the stored knife. It is intentionally short so the
  // holstered silhouette stays compact.
  const holsteredFang = new THREE.Group();
  holsteredFang.name = 'HolsteredFangInsert';
  group.add(holsteredFang);

  const guard = new THREE.Mesh(
    new THREE.BoxGeometry(0.130, 0.025, 0.050),
    metalMat
  );
  guard.position.y = 0.192;
  holsteredFang.add(guard);

  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.033, 0.037, 0.145, 10),
    gripMat
  );
  handle.position.y = 0.276;
  handle.castShadow = true;
  holsteredFang.add(handle);

  for (let i = 0; i < 4; i++) {
    const cord = new THREE.Mesh(
      new THREE.TorusGeometry(0.038, 0.005, 5, 12),
      cordMat
    );
    cord.rotation.x = Math.PI / 2;
    cord.position.y = 0.228 + i * 0.030;
    cord.rotation.z = (i % 2 ? 1 : -1) * 0.08;
    holsteredFang.add(cord);
  }

  const pommel = new THREE.Mesh(
    new THREE.TorusGeometry(0.032, 0.009, 6, 14),
    darkMetalMat
  );
  pommel.rotation.x = Math.PI / 2;
  pommel.position.y = 0.355;
  holsteredFang.add(pommel);

  group.userData.holsteredFang = holsteredFang;
  return group;
}

function buildSlashArc() {
  const geometry = new THREE.RingGeometry(0.68, 0.76, 28, 1, -1.05, 2.1);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffd29a,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  return new THREE.Mesh(geometry, material);
}

function solveBallisticVelocity(origin, target, speed, gravity) {
  const delta = target.clone().sub(origin);
  const horizontal = new THREE.Vector3(delta.x, 0, delta.z);
  const x = horizontal.length();
  const y = delta.y;

  if (x < 0.08) return delta.normalize().multiplyScalar(speed);

  const v2 = speed * speed;
  const discriminant = v2 * v2 - gravity * (gravity * x * x + 2 * y * v2);

  if (discriminant >= 0) {
    const tanTheta = (v2 - Math.sqrt(discriminant)) / (gravity * x);
    const cosTheta = 1 / Math.sqrt(1 + tanTheta * tanTheta);
    const sinTheta = tanTheta * cosTheta;
    return horizontal.normalize().multiplyScalar(speed * cosTheta)
      .add(new THREE.Vector3(0, speed * sinTheta, 0));
  }

  const direct = delta.normalize().multiplyScalar(speed);
  const travelTime = Math.max(0.08, delta.length() / Math.max(1, speed));
  direct.y += 0.5 * gravity * travelTime;
  return direct;
}

function worldHitNormal(hit, fallbackDirection) {
  if (hit.face?.normal) {
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
    return hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
  }
  return fallbackDirection.clone().multiplyScalar(-1).normalize();
}

function setFangGlow(group, strength) {
  group.traverse((child) => {
    if (!child.material?.emissive) return;
    child.material.emissive.setRGB(
      strength * 0.90,
      strength * 0.38,
      strength * 0.08
    );
  });
}

function orientAlongDirection(object, direction) {
  const dir = direction.clone().normalize();
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
}

function visibleWorldBounds(group) {
  const bounds = new THREE.Box3();
  let hasBounds = false;

  group.updateWorldMatrix(true, true);
  group.traverse((child) => {
    if (
      !child.isMesh ||
      child.userData.fangInvisibleHitbox ||
      !child.geometry
    ) return;

    if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
    if (!child.geometry.boundingBox) return;

    const box = child.geometry.boundingBox.clone().applyMatrix4(child.matrixWorld);
    if (!hasBounds) {
      bounds.copy(box);
      hasBounds = true;
    } else {
      bounds.union(box);
    }
  });

  return hasBounds ? bounds : null;
}

function disposeGroup(group) {
  group.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose?.());
    else child.material?.dispose?.();
  });
}

function easeOut(t) {
  return 1 - Math.pow(1 - THREE.MathUtils.clamp(t, 0, 1), 3);
}

function easeInOut(t) {
  t = THREE.MathUtils.clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}
