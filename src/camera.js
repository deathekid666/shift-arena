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
    this.recoilTargetPitch = 0;
    this.recoilTargetYaw = 0;
    this.recoilAttack = 34;
    this.recoilRecovery = 12;
    this.recoilMaxPitch = 0.20;
    this.recoilMaxYaw = 0.12;
    this.lookX = 0;
    this.lookY = 0;

    this.raycaster = new THREE.Raycaster();
    this.target = new THREE.Vector3();
    this.hidePlayerBody = false;
    this.compressed = false;
    this.resolvedDistance = GAME_CONFIG.camera.distance;
    this.aimFallbackSide = 1;
  }

  update(dt, options = {}) {
    const cfg = GAME_CONFIG.camera;
    const {
      aiming = false,
      adsFov = null,
      adsDistance = 3.15,
      adsShoulderOffset = 0.92,
      scoped = false,
      smartAimCollision = false,
      compactAim = false,
      sprintBlend = 0,
      sliding = false
    } = options;

    const look = this.input.consumeLook();
    this.yaw -= look.yaw * cfg.sensitivity;
    this.pitch -= look.pitch * cfg.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, cfg.pitchMin, cfg.pitchMax);

    this.lookX = THREE.MathUtils.damp(
      this.lookX,
      THREE.MathUtils.clamp(look.yaw, -28, 28),
      20,
      dt
    );
    this.lookY = THREE.MathUtils.damp(
      this.lookY,
      THREE.MathUtils.clamp(look.pitch, -28, 28),
      20,
      dt
    );
    // Two-stage recoil envelope:
    // 1) the visible camera catches the shot target quickly;
    // 2) the target itself returns to zero more slowly.
    // This gives a crisp shooter kick without the under-damped bounce that can
    // make automatic weapons feel floaty or oscillatory.
    this.recoilPitch = THREE.MathUtils.damp(
      this.recoilPitch,
      this.recoilTargetPitch,
      this.recoilAttack,
      dt
    );
    this.recoilYaw = THREE.MathUtils.damp(
      this.recoilYaw,
      this.recoilTargetYaw,
      this.recoilAttack * 0.92,
      dt
    );

    this.recoilTargetPitch = THREE.MathUtils.damp(
      this.recoilTargetPitch,
      0,
      this.recoilRecovery,
      dt
    );
    this.recoilTargetYaw = THREE.MathUtils.damp(
      this.recoilTargetYaw,
      0,
      this.recoilRecovery * 1.12,
      dt
    );

    if (
      Math.abs(this.recoilTargetPitch) < 0.00003 &&
      Math.abs(this.recoilPitch) < 0.00003
    ) {
      this.recoilTargetPitch = 0;
      this.recoilPitch = 0;
    }

    if (
      Math.abs(this.recoilTargetYaw) < 0.00003 &&
      Math.abs(this.recoilYaw) < 0.00003
    ) {
      this.recoilTargetYaw = 0;
      this.recoilYaw = 0;
    }

    const movementBlend = aiming || scoped
      ? 0
      : Math.max(
          THREE.MathUtils.clamp(sprintBlend, 0, 1),
          sliding ? cfg.slideFovBlend : 0
        );

    const targetDistance = scoped
      ? 0.10
      : aiming
        ? adsDistance
        : cfg.distance + cfg.sprintDistanceBoost * movementBlend;
    const targetShoulder = scoped ? 0 : aiming ? adsShoulderOffset : cfg.shoulderOffset;

    if (!aiming) {
      this.aimFallbackSide = Math.sign(cfg.shoulderOffset) || 1;
    }
    const targetFov = aiming
      ? (adsFov ?? 57)
      : THREE.MathUtils.lerp(
          cfg.normalFov,
          cfg.sprintFov,
          movementBlend
        );

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

    const requested = this.target.clone().add(backward).add(shoulder);
    let resolved = scoped
      ? { position: requested, collided: false, distance: requested.distanceTo(this.target) }
      : this.resolveCandidate(requested, cfg.collisionPadding);

    if (!scoped && smartAimCollision && resolved.collided) {
      const fallback = this.findAimFallback({
        viewYaw,
        targetDistance,
        targetShoulder,
        compactAim,
        padding: cfg.collisionPadding
      });

      if (
        fallback &&
        (
          !fallback.collided ||
          fallback.distance > resolved.distance + 0.18
        )
      ) {
        resolved = fallback;
      }
    }

    const desired = resolved.position;
    this.resolvedDistance = desired.distanceTo(this.target);
    this.compressed =
      !scoped &&
      resolved.collided &&
      this.resolvedDistance < Math.max(1.35, targetDistance * 0.46);

    // If geometry leaves no useful third-person shoulder position, hide only
    // the player's main body/visor. Fang arm/knife visuals stay visible.
    this.hidePlayerBody =
      !scoped &&
      aiming &&
      this.resolvedDistance < 2.15;

    const smooth = 1 - Math.exp(-(scoped ? 28 : smartAimCollision ? 20 : 18) * dt);
    this.camera.position.lerp(desired, smooth);
    this.camera.fov = THREE.MathUtils.damp(
      this.camera.fov,
      targetFov,
      scoped
        ? 20
        : smartAimCollision
          ? 17
          : movementBlend > 0.01
            ? cfg.motionFovResponse
            : 13,
      dt
    );
    this.camera.updateProjectionMatrix();

    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.x = viewPitch;
    this.camera.rotation.y = viewYaw;
    this.camera.rotation.z = 0;
  }

  resolveCandidate(candidate, padding) {
    const direction = candidate.clone().sub(this.target);
    const maxDist = direction.length();

    if (maxDist <= 0.001) {
      return {
        position: this.target.clone(),
        collided: false,
        distance: 0
      };
    }

    direction.normalize();
    this.raycaster.set(this.target, direction);
    this.raycaster.near = 0.03;
    this.raycaster.far = maxDist;

    const hit = this.raycaster
      .intersectObjects(this.world.cameraObstacles, false)
      .find((entry) => !entry.object.userData.disabled);

    if (!hit) {
      return {
        position: candidate.clone(),
        collided: false,
        distance: maxDist
      };
    }

    const distance = Math.max(0.96, hit.distance - padding);
    return {
      position: this.target.clone().addScaledVector(direction, distance),
      collided: true,
      distance
    };
  }

  findAimFallback({ viewYaw, targetDistance, targetShoulder, compactAim, padding }) {
    const distances = compactAim
      ? [Math.min(2.25, targetDistance), 1.85, 1.45]
      : [Math.min(2.65, targetDistance), 2.15, 1.65];

    const shoulderMag = Math.max(0.58, Math.min(1.05, Math.abs(targetShoulder)));
    const preferred = this.aimFallbackSide >= 0 ? shoulderMag : -shoulderMag;
    const opposite = -preferred;

    // Try the already-selected shoulder first. A bias below makes the camera
    // stay there unless the other side is meaningfully clearer.
    const shoulderOffsets = [
      preferred,
      targetShoulder,
      preferred * 0.72,
      0,
      opposite * 0.72,
      opposite
    ];

    let best = null;
    let bestScore = -Infinity;

    for (const distance of distances) {
      for (const shoulderOffset of shoulderOffsets) {
        const back = new THREE.Vector3(0, compactAim ? -0.08 : 0.02, distance)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), viewYaw);
        const shoulder = new THREE.Vector3(shoulderOffset, 0, 0)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), viewYaw);

        const candidate = this.target.clone().add(back).add(shoulder);
        const resolved = this.resolveCandidate(candidate, padding);

        const requestedDistance = candidate.distanceTo(this.target);
        const clearance = requestedDistance > 0
          ? resolved.distance / requestedDistance
          : 0;
        const side = Math.sign(shoulderOffset) || this.aimFallbackSide;
        const sameSide = side === this.aimFallbackSide;

        const score =
          (resolved.collided ? 0 : 100) +
          clearance * 22 +
          resolved.distance * 4 +
          (sameSide ? 8 : 0) +
          (shoulderOffset === targetShoulder ? 2 : 0);

        if (score > bestScore) {
          bestScore = score;
          best = { ...resolved, shoulderSide: side };
        }
      }
    }

    if (best && !best.collided) {
      this.aimFallbackSide = best.shoulderSide;
    }

    return best;
  }

  kick(
    pitchAmount,
    yawAmount = 0,
    {
      recovery = 12,
      attack = 34,
      maxPitch = 0.20,
      maxYaw = 0.12
    } = {}
  ) {
    this.recoilRecovery = recovery;
    this.recoilAttack = attack;
    this.recoilMaxPitch = maxPitch;
    this.recoilMaxYaw = maxYaw;

    this.recoilTargetPitch = THREE.MathUtils.clamp(
      this.recoilTargetPitch + pitchAmount,
      -maxPitch * 0.30,
      maxPitch
    );
    this.recoilTargetYaw = THREE.MathUtils.clamp(
      this.recoilTargetYaw + yawAmount,
      -maxYaw,
      maxYaw
    );
  }
}
