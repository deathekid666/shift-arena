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
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.recoilRecovery = 12;
    this.lookX = 0;
    this.lookY = 0;

    this.raycaster = new THREE.Raycaster();
    this.target = new THREE.Vector3();
  }

  update(dt, options = {}) {
    const cfg = GAME_CONFIG.camera;
    const {
      aiming = false,
      adsFov = null,
      adsDistance = 3.15,
      adsShoulderOffset = 0.92,
      scoped = false
    } = options;

    const look = this.input.consumeLook();
    this.yaw -= look.yaw * cfg.sensitivity;
    this.pitch -= look.pitch * cfg.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, cfg.pitchMin, cfg.pitchMax);

    this.lookX = THREE.MathUtils.damp(this.lookX, THREE.MathUtils.clamp(look.yaw, -28, 28), 20, dt);
    this.lookY = THREE.MathUtils.damp(this.lookY, THREE.MathUtils.clamp(look.pitch, -28, 28), 20, dt);
    this.recoilPitch = THREE.MathUtils.damp(this.recoilPitch, 0, this.recoilRecovery, dt);
    this.recoilYaw = THREE.MathUtils.damp(this.recoilYaw, 0, this.recoilRecovery, dt);

    const targetDistance = scoped ? 0.10 : aiming ? adsDistance : cfg.distance;
    const targetShoulder = scoped ? 0 : aiming ? adsShoulderOffset : cfg.shoulderOffset;
    const targetFov = aiming ? (adsFov ?? 57) : cfg.normalFov;

    this.target.copy(this.player.group.position).add(new THREE.Vector3(0, cfg.height, 0));

    const viewPitch = THREE.MathUtils.clamp(
      this.pitch + this.recoilPitch,
      cfg.pitchMin,
      cfg.pitchMax
    );
    const viewYaw = this.yaw + this.recoilYaw;
    const rot = new THREE.Euler(viewPitch, viewYaw, 0, 'YXZ');

    const backward = new THREE.Vector3(0, 0, targetDistance).applyEuler(rot);
    const shoulder = new THREE.Vector3(targetShoulder, 0, 0)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), viewYaw);
    const desired = this.target.clone().add(backward).add(shoulder);

    if (!scoped) {
      const direction = desired.clone().sub(this.target);
      const maxDist = direction.length();
      if (maxDist > 0.001) {
        direction.normalize();
        this.raycaster.set(this.target, direction);
        this.raycaster.far = maxDist;
        const hits = this.raycaster.intersectObjects(this.world.cameraObstacles, false);
        if (hits.length) {
          desired.copy(this.target).add(
            direction.multiplyScalar(Math.max(0.65, hits[0].distance - cfg.collisionPadding))
          );
        }
      }
    }

    const smooth = 1 - Math.exp(-(scoped ? 28 : 18) * dt);
    this.camera.position.lerp(desired, smooth);
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, scoped ? 20 : 13, dt);
    this.camera.updateProjectionMatrix();

    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.x = viewPitch;
    this.camera.rotation.y = viewYaw;
    this.camera.rotation.z = 0;
  }

  kick(pitchAmount, yawAmount = 0, recovery = 12) {
    this.recoilPitch += pitchAmount;
    this.recoilYaw += yawAmount;
    this.recoilRecovery = recovery;
  }
}
