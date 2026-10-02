import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { GAME_CONFIG } from './config.js';

export class TacticalAR {
  constructor({ scene, camera, cameraRig, player, input, world, targets, onHit, onFire }) {
    this.scene = scene;
    this.camera = camera;
    this.cameraRig = cameraRig;
    this.player = player;
    this.input = input;
    this.world = world;
    this.targets = targets;
    this.onHit = onHit;
    this.onFire = onFire;

    this.cfg = GAME_CONFIG.tacticalAR;
    this.ammo = this.cfg.magazineSize;
    this.fireCooldown = 0;
    this.reloadTimer = 0;
    this.flashTimer = 0;
    this.isReloading = false;

    this.cameraRay = new THREE.Raycaster();
    this.muzzleRay = new THREE.Raycaster();
    this.center = new THREE.Vector2(0, 0);
    this.model = this.buildModel();
    this.player.group.add(this.model);
  }

  buildModel() {
    const group = new THREE.Group();
    const shell = new THREE.MeshStandardMaterial({ color: 0x3a8fd8, roughness: 0.42, metalness: 0.22 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x152434, roughness: 0.5, metalness: 0.28 });
    const accent = new THREE.MeshStandardMaterial({ color: 0xeef7ff, roughness: 0.34, metalness: 0.08 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.76), shell);
    body.position.z = -0.12;
    group.add(body);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.30), accent);
    stock.position.z = 0.39;
    group.add(stock);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.52, 10), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -0.76;
    group.add(barrel);

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.34, 0.18), dark);
    mag.position.set(0, -0.23, 0.02);
    mag.rotation.x = -0.16;
    group.add(mag);

    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.08, 0.16), accent);
    sight.position.set(0, 0.15, -0.16);
    group.add(sight);

    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0, -1.05);
    group.add(this.muzzle);

    this.muzzleFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd466 })
    );
    this.muzzleFlash.position.copy(this.muzzle.position);
    this.muzzleFlash.visible = false;
    group.add(this.muzzleFlash);

    group.position.set(0.48, 1.02, -0.46);
    group.rotation.x = -0.04;
    return group;
  }

  get aiming() {
    return this.input.pointerLocked && this.input.mouseDown(2);
  }

  get firing() {
    return this.input.pointerLocked && this.input.mouseDown(0);
  }

  get reloadProgress() {
    if (!this.isReloading) return 0;
    return 1 - Math.max(0, this.reloadTimer) / this.cfg.reloadTime;
  }

  update(dt) {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.muzzleFlash.visible = false;
    }

    if (this.isReloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.ammo = this.cfg.magazineSize;
        this.isReloading = false;
      }
    } else if (this.input.consume('reload') && this.ammo < this.cfg.magazineSize) {
      this.beginReload();
    }

    if (this.firing && !this.isReloading && this.fireCooldown <= 0) {
      if (this.ammo > 0) {
        this.fire();
      } else {
        this.beginReload();
      }
    }

    const targetX = this.aiming ? 0.40 : 0.48;
    const targetZ = this.aiming ? -0.58 : -0.46;
    this.model.position.x = THREE.MathUtils.damp(this.model.position.x, targetX, 18, dt);
    this.model.position.z = THREE.MathUtils.damp(this.model.position.z, targetZ, 18, dt);
  }

  beginReload() {
    if (this.isReloading || this.ammo === this.cfg.magazineSize) return;
    this.isReloading = true;
    this.reloadTimer = this.cfg.reloadTime;
  }

  fire() {
    this.ammo -= 1;
    this.fireCooldown = 1 / this.cfg.fireRate;
    this.flashTimer = 0.045;
    this.muzzleFlash.visible = true;

    const yawKick = (Math.random() - 0.5) * 2 * this.cfg.recoilYaw;
    this.cameraRig.kick(this.cfg.recoilPitch, yawKick);
    this.onFire?.();

    const spread = this.aiming ? this.cfg.adsBloom : this.cfg.hipBloom;
    this.cameraRay.setFromCamera(this.center, this.camera);

    const cameraDirection = this.cameraRay.ray.direction.clone();
    applySpread(cameraDirection, this.camera, spread);
    cameraDirection.normalize();

    const allShotObjects = [...this.targets.hitMeshes, ...this.world.cameraObstacles];
    const aimHit = firstValidHit(this.cameraRay, this.camera.position, cameraDirection, allShotObjects, this.cfg.range);
    const aimPoint = aimHit
      ? aimHit.point.clone()
      : this.camera.position.clone().add(cameraDirection.multiplyScalar(this.cfg.range));

    const muzzlePos = new THREE.Vector3();
    this.muzzle.getWorldPosition(muzzlePos);
    const muzzleDirection = aimPoint.clone().sub(muzzlePos);
    const muzzleDistance = muzzleDirection.length();
    muzzleDirection.normalize();

    const actualHit = firstValidHit(
      this.muzzleRay,
      muzzlePos,
      muzzleDirection,
      allShotObjects,
      Math.min(this.cfg.range, muzzleDistance + 0.25)
    );

    const impactPoint = actualHit
      ? actualHit.point.clone()
      : muzzlePos.clone().add(muzzleDirection.multiplyScalar(Math.min(this.cfg.range, muzzleDistance)));

    this.spawnTracer(muzzlePos, impactPoint);

    if (actualHit?.object?.userData?.combatTarget) {
      const result = this.targets.applyDamage(
        actualHit.object,
        this.cfg.damage,
        this.cfg.headshotMultiplier
      );
      if (result) this.onHit?.(result);
    }
  }

  spawnTracer(from, to) {
    const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
    const material = new THREE.LineBasicMaterial({ color: 0xffe39a, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geometry, material);
    this.scene.add(line);
    setTimeout(() => {
      this.scene.remove(line);
      geometry.dispose();
      material.dispose();
    }, 55);
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
