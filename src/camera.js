import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { GAME_CONFIG } from './config.js';

export class ThirdPersonCamera {
  constructor(camera, player, input, world) {
    this.camera = camera;
    this.player = player;
    this.input = input;
    this.world = world;
    this.yaw = 0;
    this.pitch = 0.18;
    this.raycaster = new THREE.Raycaster();
    this.target = new THREE.Vector3();
  }

  update(dt, aiming = false) {
    const cfg = GAME_CONFIG.camera;
    const look = this.input.consumeLook();
    this.yaw -= look.yaw * cfg.sensitivity;
    this.pitch -= look.pitch * cfg.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, cfg.pitchMin, cfg.pitchMax);

    const targetDistance = aiming ? cfg.adsDistance : cfg.distance;
    const targetShoulder = aiming ? cfg.adsShoulderOffset : cfg.shoulderOffset;
    const targetFov = aiming ? cfg.adsFov : cfg.normalFov;

    this.target.copy(this.player.group.position).add(new THREE.Vector3(0, cfg.height, 0));
    const rot = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    const backward = new THREE.Vector3(0, 0, targetDistance).applyEuler(rot);
    const shoulder = new THREE.Vector3(targetShoulder, 0, 0)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const desired = this.target.clone().add(backward).add(shoulder);

    const direction = desired.clone().sub(this.target);
    const maxDist = direction.length();
    direction.normalize();
    this.raycaster.set(this.target, direction);
    this.raycaster.far = maxDist;
    const hits = this.raycaster.intersectObjects(this.world.cameraObstacles, false);
    if (hits.length) {
      desired.copy(this.target).add(direction.multiplyScalar(Math.max(0.65, hits[0].distance - cfg.collisionPadding)));
    }

    const smooth = 1 - Math.exp(-18 * dt);
    this.camera.position.lerp(desired, smooth);
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 13, dt);
    this.camera.updateProjectionMatrix();

    // The orbit pivot positions the camera around the player, but it must not
    // look back at that pivot. The screen center/crosshair should point into
    // the world along the player's camera yaw/pitch.
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.z = 0;
  }

  kick(pitchAmount, yawAmount = 0) {
    const cfg = GAME_CONFIG.camera;
    this.pitch = THREE.MathUtils.clamp(this.pitch + pitchAmount, cfg.pitchMin, cfg.pitchMax);
    this.yaw += yawAmount;
  }
}
