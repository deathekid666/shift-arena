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
    this.projectile = null;
    this.stuckPosition = null;
    this.raycaster = new THREE.Raycaster();
    this.tmpA = new THREE.Vector3();
    this.tmpB = new THREE.Vector3();
    this.tmpC = new THREE.Vector3();

    this.handRig = new THREE.Group();
    this.handRig.position.set(0.54, 0.86, 0.22);
    this.handRig.visible = false;
    this.player.group.add(this.handRig);

    this.handFang = buildFangModel();
    this.handRig.add(this.handFang);

    this.sheath = buildSheath();
    this.sheath.position.set(0.49, 0.67, 0.18);
    this.sheath.rotation.set(-0.15, 0.05, 0.42);
    this.player.group.add(this.sheath);

    this.slashArc = buildSlashArc();
    this.slashArc.visible = false;
    this.player.group.add(this.slashArc);

    this.emitState();
  }

  get blocksWeapons() {
    return ['PRIMING', 'CHARGING', 'SLASH', 'CLAW'].includes(this.state);
  }

  get hasFang() {
    return !['THROWN', 'STUCK', 'LOST'].includes(this.state);
  }

  get chargeRatio() {
    if (this.state !== 'CHARGING') return 0;
    return THREE.MathUtils.clamp(
      (this.holdTime - this.cfg.primeThreshold) /
      Math.max(0.001, this.cfg.fullChargeTime - this.cfg.primeThreshold),
      0,
      1
    );
  }

  reset() {
    this.removeProjectile();
    this.state = 'READY';
    this.holdTime = 0;
    this.actionTime = 0;
    this.stuckPosition = null;
    this.handRig.visible = false;
    this.sheath.visible = true;
    this.slashArc.visible = false;
    this.emitState();
  }

  update(dt, canUse = true) {
    if (!canUse) {
      if (this.state === 'PRIMING' || this.state === 'CHARGING' || this.state === 'SLASH' || this.state === 'CLAW') {
        this.cancelHandAction();
      }
      this.updateProjectile(dt);
      this.emitState();
      return;
    }

    this.updateProjectile(dt);

    if ((this.state === 'STUCK') && this.stuckPosition) {
      const distance = this.player.group.position.distanceTo(this.stuckPosition);
      if (distance <= this.cfg.recoveryRadius) this.recover();
    }

    if (this.state === 'READY' && this.input.consume('melee')) {
      this.beginPrime();
    } else if ((this.state === 'THROWN' || this.state === 'STUCK' || this.state === 'LOST') && this.input.consume('melee')) {
      this.beginClaw();
    }

    if (this.state === 'PRIMING' || this.state === 'CHARGING') {
      this.holdTime += dt;

      if (this.state === 'PRIMING' && this.holdTime >= this.cfg.primeThreshold) {
        this.state = 'CHARGING';
        this.audio?.playFang?.('charge');
      }

      if (this.input.consumeReleased('melee')) {
        if (this.state === 'CHARGING') this.throwFang();
        else this.beginSlash();
      }
    } else {
      // Consume stale releases so a prior V release cannot trigger later.
      this.input.consumeReleased('melee');
    }

    if (this.state === 'SLASH') this.updateSlash(dt);
    if (this.state === 'CLAW') this.updateClaw(dt);
    if (this.state === 'PRIMING' || this.state === 'CHARGING') this.updatePrimePose(dt);

    this.emitState();
  }

  beginPrime() {
    this.state = 'PRIMING';
    this.holdTime = 0;
    this.actionTime = 0;
    this.handRig.visible = true;
    this.sheath.visible = false;
    this.handRig.position.set(0.50, 0.72, 0.22);
    this.handRig.rotation.set(0.45, -0.25, 0.45);
    this.audio?.playFang?.('draw');
  }

  updatePrimePose(dt) {
    const charging = this.state === 'CHARGING';
    const charge = charging ? this.chargeRatio : THREE.MathUtils.clamp(this.holdTime / this.cfg.primeThreshold, 0, 1);
    const pulse = charging ? Math.sin(performance.now() * 0.014) * 0.035 * (0.35 + charge) : 0;

    const targetX = charging ? 0.44 : 0.52;
    const targetY = charging ? 1.48 + pulse : 1.10;
    const targetZ = charging ? 0.18 : -0.05;
    this.handRig.position.x = THREE.MathUtils.damp(this.handRig.position.x, targetX, 18, dt);
    this.handRig.position.y = THREE.MathUtils.damp(this.handRig.position.y, targetY, 18, dt);
    this.handRig.position.z = THREE.MathUtils.damp(this.handRig.position.z, targetZ, 18, dt);

    const targetRotX = charging ? -1.02 : -0.35;
    const targetRotY = charging ? -0.18 : 0.20;
    const targetRotZ = charging ? 0.56 + pulse * 2 : 0.35;
    this.handRig.rotation.x = THREE.MathUtils.damp(this.handRig.rotation.x, targetRotX, 16, dt);
    this.handRig.rotation.y = THREE.MathUtils.damp(this.handRig.rotation.y, targetRotY, 16, dt);
    this.handRig.rotation.z = THREE.MathUtils.damp(this.handRig.rotation.z, targetRotZ, 16, dt);

    const glow = charging ? 0.12 + charge * 0.45 : 0.04;
    setFangGlow(this.handFang, glow);
  }

  beginSlash() {
    this.state = 'SLASH';
    this.actionTime = 0;
    this.actionDuration = 0.36;
    this.handRig.visible = true;
    this.slashArc.visible = true;
    this.slashArc.material.opacity = 0;
    this.audio?.playFang?.('slash');
    this.slashDidHit = false;
  }

  updateSlash(dt) {
    this.actionTime += dt;
    const t = THREE.MathUtils.clamp(this.actionTime / this.actionDuration, 0, 1);

    if (t < 0.18) {
      const k = easeOut(t / 0.18);
      this.handRig.position.set(
        THREE.MathUtils.lerp(0.52, 0.68, k),
        THREE.MathUtils.lerp(0.92, 1.28, k),
        THREE.MathUtils.lerp(0.12, 0.20, k)
      );
      this.handRig.rotation.set(
        THREE.MathUtils.lerp(-0.2, -0.9, k),
        THREE.MathUtils.lerp(0.15, -0.55, k),
        THREE.MathUtils.lerp(0.3, 0.95, k)
      );
    } else if (t < 0.66) {
      const k = easeInOut((t - 0.18) / 0.48);
      this.handRig.position.set(
        THREE.MathUtils.lerp(0.68, -0.62, k),
        THREE.MathUtils.lerp(1.28, 1.02, k),
        THREE.MathUtils.lerp(0.20, -0.70, k)
      );
      this.handRig.rotation.set(
        THREE.MathUtils.lerp(-0.9, 0.35, k),
        THREE.MathUtils.lerp(-0.55, 0.82, k),
        THREE.MathUtils.lerp(0.95, -0.75, k)
      );

      const swing = Math.sin(k * Math.PI);
      this.slashArc.visible = true;
      this.slashArc.position.set(0, 1.05, -0.5);
      this.slashArc.rotation.set(Math.PI / 2, 0, THREE.MathUtils.lerp(-1.15, 0.85, k));
      this.slashArc.scale.setScalar(0.9 + swing * 0.18);
      this.slashArc.material.opacity = swing * 0.62;

      if (!this.slashDidHit && k >= 0.36) {
        this.slashDidHit = true;
        this.performMeleeHit(this.cfg.meleeDamage, false);
      }
    } else {
      const k = easeInOut((t - 0.66) / 0.34);
      this.handRig.position.lerp(new THREE.Vector3(0.50, 0.72, 0.22), k);
      this.handRig.rotation.x = THREE.MathUtils.lerp(this.handRig.rotation.x, 0.45, k);
      this.handRig.rotation.y = THREE.MathUtils.lerp(this.handRig.rotation.y, -0.25, k);
      this.handRig.rotation.z = THREE.MathUtils.lerp(this.handRig.rotation.z, 0.45, k);
      this.slashArc.material.opacity = Math.max(0, this.slashArc.material.opacity - dt * 5);
    }

    if (t >= 1) this.finishHandAction();
  }

  beginClaw() {
    this.state = 'CLAW';
    this.actionTime = 0;
    this.actionDuration = 0.28;
    this.clawDidHit = false;
    this.slashArc.visible = true;
    this.slashArc.material.opacity = 0;
    this.audio?.playFang?.('claw');
  }

  updateClaw(dt) {
    this.actionTime += dt;
    const t = THREE.MathUtils.clamp(this.actionTime / this.actionDuration, 0, 1);
    const swing = Math.sin(t * Math.PI);
    this.slashArc.visible = true;
    this.slashArc.position.set(0, 1.02, -0.48);
    this.slashArc.rotation.set(Math.PI / 2, 0, THREE.MathUtils.lerp(-0.75, 0.75, easeInOut(t)));
    this.slashArc.scale.setScalar(0.72 + swing * 0.12);
    this.slashArc.material.opacity = swing * 0.42;

    if (!this.clawDidHit && t >= 0.36) {
      this.clawDidHit = true;
      this.performMeleeHit(this.cfg.clawDamage, true);
    }

    if (t >= 1) {
      this.slashArc.visible = false;
      this.state = this.stuckPosition ? 'STUCK' : (this.projectile ? 'THROWN' : 'LOST');
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
      if (mesh.userData.disabled) continue;
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

  throwFang() {
    const charge = this.chargeRatio;
    const speed = THREE.MathUtils.lerp(this.cfg.minThrowSpeed, this.cfg.maxThrowSpeed, charge);

    const origin = new THREE.Vector3();
    this.handFang.getWorldPosition(origin);

    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    direction.normalize();

    const model = buildFangModel();
    model.position.copy(origin);
    this.scene.add(model);
    orientAlongDirection(model, direction);

    const trailGeometry = new THREE.BufferGeometry().setFromPoints([
      origin.clone(), origin.clone(), origin.clone(), origin.clone(), origin.clone(), origin.clone()
    ]);
    const trailMaterial = new THREE.LineBasicMaterial({
      color: 0xffc77d,
      transparent: true,
      opacity: 0.58
    });
    const trail = new THREE.Line(trailGeometry, trailMaterial);
    this.scene.add(trail);

    this.projectile = {
      model,
      trail,
      trailGeometry,
      trailMaterial,
      trailPoints: Array.from({ length: 6 }, () => origin.clone()),
      velocity: direction.multiplyScalar(speed),
      age: 0,
      spin: 0
    };

    this.state = 'THROWN';
    this.stuckPosition = null;
    this.handRig.visible = false;
    this.sheath.visible = true;
    setFangGlow(this.handFang, 0);
    this.audio?.playFang?.('throw');
    this.onToast?.('TIN FANG THROWN');
  }

  updateProjectile(dt) {
    if (!this.projectile || this.state !== 'THROWN') {
      if (this.state === 'STUCK' && this.projectile?.model) {
        const pulse = 1 + Math.sin(performance.now() * 0.008) * 0.025;
        this.projectile.model.scale.setScalar(pulse);
      }
      return;
    }

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
      this.raycaster.far = distance + 0.04;

      const objects = [...this.targets.hitMeshes, ...this.world.cameraObstacles];
      const hit = this.raycaster.intersectObjects(objects, false)
        .find((entry) => !entry.object.userData.disabled);

      if (hit) {
        p.model.position.copy(hit.point);
        orientAlongDirection(p.model, direction);
        this.stickProjectile(hit, direction);
        return;
      }
    }

    p.model.position.copy(newPos);
    p.spin += dt * 23;
    orientAlongDirection(p.model, p.velocity.clone().normalize());
    p.model.children[0].rotation.z = p.spin;

    p.trailPoints.pop();
    p.trailPoints.unshift(newPos.clone());
    p.trailGeometry.setFromPoints(p.trailPoints);

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

  stickProjectile(hit, direction) {
    const p = this.projectile;
    if (!p) return;

    p.velocity.set(0, 0, 0);
    p.model.position.copy(hit.point).addScaledVector(direction, 0.03);
    p.model.scale.setScalar(1);
    this.stuckPosition = p.model.position.clone();

    this.scene.remove(p.trail);
    p.trailGeometry.dispose();
    p.trailMaterial.dispose();
    p.trail = null;

    if (hit.object.userData.combatTarget) {
      const result = this.targets.applyTinFangDamage(hit.object, this.cfg.throwBodyDamage);
      if (result) {
        result.tinFang = true;
        this.onHit?.(result);
        this.audio?.playFang?.(result.headshot ? 'head' : 'hit');
        if (result.headshot) this.onToast?.('TIN FANG HEADSHOT · ELIMINATED');
        else if (result.eliminated) this.onToast?.('TIN FANG · ELIMINATED');
        else this.onToast?.(`TIN FANG HIT · ${result.damage}`);
      }
    } else {
      this.audio?.playFang?.('hit');
    }

    this.state = 'STUCK';
  }

  recover() {
    this.removeProjectile();
    this.stuckPosition = null;
    this.state = 'READY';
    this.sheath.visible = true;
    this.handRig.visible = false;
    this.audio?.playFang?.('recover');
    this.onToast?.('TIN FANG RECOVERED');
  }

  loseFang() {
    this.removeProjectile();
    this.stuckPosition = null;
    this.state = 'LOST';
    this.onToast?.('TIN FANG LOST · RETURNS ON RESPAWN');
  }

  removeProjectile() {
    if (!this.projectile) return;
    if (this.projectile.model) {
      this.scene.remove(this.projectile.model);
      disposeGroup(this.projectile.model);
    }
    if (this.projectile.trail) {
      this.scene.remove(this.projectile.trail);
      this.projectile.trailGeometry?.dispose();
      this.projectile.trailMaterial?.dispose();
    }
    this.projectile = null;
  }

  finishHandAction() {
    this.handRig.visible = false;
    this.sheath.visible = true;
    this.slashArc.visible = false;
    setFangGlow(this.handFang, 0);
    this.state = 'READY';
    this.holdTime = 0;
  }

  cancelHandAction() {
    this.handRig.visible = false;
    this.sheath.visible = true;
    this.slashArc.visible = false;
    setFangGlow(this.handFang, 0);
    this.state = 'READY';
    this.holdTime = 0;
  }

  emitState() {
    let distance = null;
    let bearing = 0;

    if (this.stuckPosition) {
      distance = this.player.group.position.distanceTo(this.stuckPosition);
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
      distance,
      bearing
    });
  }
}

function buildFangModel() {
  const group = new THREE.Group();
  const spinRoot = new THREE.Group();
  group.add(spinRoot);

  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0xdce8ee,
    roughness: 0.3,
    metalness: 0.7,
    emissive: 0x000000
  });
  const edgeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.2,
    metalness: 0.8,
    emissive: 0x000000
  });
  const wrapMat = new THREE.MeshStandardMaterial({
    color: 0x6f4028,
    roughness: 0.85,
    metalness: 0.02
  });

  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.095, 0);
  bladeShape.lineTo(0.095, 0);
  bladeShape.lineTo(0.02, -0.56);
  bladeShape.lineTo(-0.055, -0.45);
  bladeShape.closePath();

  const blade = new THREE.Mesh(
    new THREE.ExtrudeGeometry(bladeShape, { depth: 0.035, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.01, bevelSegments: 1 }),
    bladeMat
  );
  blade.rotation.x = Math.PI / 2;
  blade.position.set(0, 0.18, -0.12);
  blade.castShadow = true;
  spinRoot.add(blade);

  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.065, 0.34, 8),
    wrapMat
  );
  handle.rotation.x = Math.PI / 2;
  handle.position.z = 0.24;
  handle.castShadow = true;
  spinRoot.add(handle);

  const guard = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.04, 0.07),
    edgeMat
  );
  guard.position.z = 0.055;
  guard.castShadow = true;
  spinRoot.add(guard);

  group.scale.setScalar(0.78);
  return group;
}

function buildSheath() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.42, 0.10),
    new THREE.MeshStandardMaterial({ color: 0x382b24, roughness: 0.88 })
  );
  body.castShadow = true;
  group.add(body);
  const wrap = new THREE.Mesh(
    new THREE.BoxGeometry(0.20, 0.075, 0.12),
    new THREE.MeshStandardMaterial({ color: 0xb47b4b, roughness: 0.75 })
  );
  wrap.position.y = 0.08;
  group.add(wrap);
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

function setFangGlow(group, strength) {
  group.traverse((child) => {
    if (!child.material?.emissive) return;
    child.material.emissive.setRGB(strength * 0.9, strength * 0.38, strength * 0.08);
  });
}

function orientAlongDirection(object, direction) {
  const dir = direction.clone().normalize();
  const from = new THREE.Vector3(0, 0, -1);
  object.quaternion.setFromUnitVectors(from, dir);
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
