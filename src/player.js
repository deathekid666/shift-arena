import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { GAME_CONFIG } from './config.js';

export class PlayerController {
  constructor(world, input) {
    this.world = world;
    this.input = input;
    this.group = new THREE.Group();
    this.velocity = new THREE.Vector3();
    this.grounded = true;
    this.crouching = false;
    this.sliding = false;
    this.slideTimer = 0;

    const mat = new THREE.MeshStandardMaterial({ color: 0xf6b84a, roughness: 0.55 });
    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.43, 0.94, 8, 16), mat);
    this.body.castShadow = true;
    this.body.position.y = 0.9;
    this.group.add(this.body);

    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.18, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x16283a, metalness: 0.35, roughness: 0.28 })
    );
    visor.position.set(0, 1.28, -0.37);
    this.group.add(visor);
    this.resetAt(world.spawnPoint);
    world.scene.add(this.group);
  }

  resetAt(position) {
    this.group.position.copy(position);
    this.group.visible = true;
    this.velocity.set(0, 0, 0);
    this.grounded = true;
    this.crouching = false;
    this.sliding = false;
    this.slideTimer = 0;
    this.body.scale.set(1, 1, 1);
    this.body.position.y = GAME_CONFIG.movement.standingHeight / 2;
  }

  update(dt, cameraYaw, combatFacing = false) {
    const cfg = GAME_CONFIG.movement;
    const supportY = this.supportHeightAt(this.group.position.x, this.group.position.z);
    this.grounded = supportY !== null && this.group.position.y <= supportY + 0.04 && this.velocity.y <= 0;
    if (this.grounded) {
      this.group.position.y = supportY;
      this.velocity.y = 0;
    }

    const forward = (this.input.down('forward') ? 1 : 0) - (this.input.down('back') ? 1 : 0);
    const strafe = (this.input.down('right') ? 1 : 0) - (this.input.down('left') ? 1 : 0);
    const move = new THREE.Vector3(strafe, 0, -forward);
    if (move.lengthSq() > 1) move.normalize();
    move.applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraYaw);

    const crouchDown = this.input.down('crouch');
    if (crouchDown && !this.crouching && this.grounded && this.horizontalSpeed() > cfg.walkSpeed * 1.05) {
      this.sliding = true;
      this.slideTimer = cfg.slideDuration;
      if (move.lengthSq() > 0) {
        this.velocity.x = move.x * cfg.slideInitialSpeed;
        this.velocity.z = move.z * cfg.slideInitialSpeed;
      }
    }
    this.crouching = crouchDown;

    if (this.sliding) {
      this.slideTimer -= dt;
      const hs = this.horizontalSpeed();
      const next = Math.max(0, hs - cfg.slideFriction * dt);
      if (hs > 0) {
        const ratio = next / hs;
        this.velocity.x *= ratio;
        this.velocity.z *= ratio;
      }
      if (this.slideTimer <= 0 || !crouchDown || next < cfg.crouchSpeed) this.sliding = false;
    } else {
      const targetSpeed = this.crouching
        ? cfg.crouchSpeed
        : (this.input.down('sprint') ? cfg.sprintSpeed : cfg.walkSpeed);
      const target = move.multiplyScalar(targetSpeed);
      const accel = this.grounded
        ? (target.lengthSq() > 0 ? cfg.acceleration : cfg.deceleration)
        : cfg.airAcceleration;
      this.velocity.x = THREE.MathUtils.damp(this.velocity.x, target.x, accel, dt);
      this.velocity.z = THREE.MathUtils.damp(this.velocity.z, target.z, accel, dt);
    }

    if (this.input.consume('jump') && this.grounded && !this.sliding) {
      this.velocity.y = cfg.jumpVelocity;
      this.grounded = false;
    }
    if (!this.grounded) this.velocity.y -= cfg.gravity * dt;

    const displacement = this.velocity.clone().multiplyScalar(dt);
    this.moveHorizontal(displacement.x, 0);
    this.moveHorizontal(0, displacement.z);
    this.moveVertical(displacement.y);

    if (this.group.position.y < -15) {
      this.resetAt(this.world.spawnPoint);
    }

    if (combatFacing) {
      this.group.rotation.y = dampAngle(this.group.rotation.y, cameraYaw, 22, dt);
    } else if (targetIsMoving(this.velocity)) {
      const facing = Math.atan2(this.velocity.x, this.velocity.z) + Math.PI;
      if (Number.isFinite(facing)) {
        this.group.rotation.y = dampAngle(this.group.rotation.y, facing, 14, dt);
      }
    }

    const height = this.crouching ? cfg.crouchHeight : cfg.standingHeight;
    this.body.scale.y = THREE.MathUtils.damp(this.body.scale.y, height / cfg.standingHeight, 18, dt);
    this.body.position.y = height / 2;
  }

  supportHeightAt(x, z) {
    const cfg = GAME_CONFIG.movement;
    let supportY = this.world.groundHeightAt(x, z);
    let found = true;

    for (const c of this.world.colliders) {
      const b = c.box;
      const overlapsXZ =
        x + cfg.radius > b.min.x &&
        x - cfg.radius < b.max.x &&
        z + cfg.radius > b.min.z &&
        z - cfg.radius < b.max.z;

      if (!overlapsXZ) continue;

      const top = b.max.y;
      if (top <= this.group.position.y + 0.06 && top > supportY) {
        supportY = top;
      }
    }

    if (supportY > this.group.position.y + 0.06) found = false;
    return found ? supportY : null;
  }

  moveVertical(dy) {
    const cfg = GAME_CONFIG.movement;
    const height = this.crouching ? cfg.crouchHeight : cfg.standingHeight;
    const x = this.group.position.x;
    const z = this.group.position.z;
    const oldY = this.group.position.y;
    const newY = oldY + dy;

    if (dy <= 0) {
      let landingY = this.world.groundHeightAt(x, z);

      for (const c of this.world.colliders) {
        const b = c.box;
        const overlapsXZ =
          x + cfg.radius > b.min.x &&
          x - cfg.radius < b.max.x &&
          z + cfg.radius > b.min.z &&
          z - cfg.radius < b.max.z;

        if (!overlapsXZ) continue;

        const top = b.max.y;
        const crossedTop = oldY >= top - 0.04 && newY <= top;
        if (crossedTop) landingY = Math.max(landingY, top);
      }

      if (newY <= landingY) {
        this.group.position.y = landingY;
        this.velocity.y = 0;
        this.grounded = true;
        return;
      }

      this.group.position.y = newY;
      this.grounded = false;
      return;
    }

    const oldHead = oldY + height;
    const newHead = newY + height;

    for (const c of this.world.colliders) {
      const b = c.box;
      const overlapsXZ =
        x + cfg.radius > b.min.x &&
        x - cfg.radius < b.max.x &&
        z + cfg.radius > b.min.z &&
        z - cfg.radius < b.max.z;

      if (!overlapsXZ) continue;

      const underside = b.min.y;
      const crossedUnderside = oldHead <= underside + 0.04 && newHead >= underside;
      if (crossedUnderside) {
        this.group.position.y = underside - height - 0.001;
        this.velocity.y = 0;
        this.grounded = false;
        return;
      }
    }

    this.group.position.y = newY;
    this.grounded = false;
  }

  moveHorizontal(dx, dz) {
    const cfg = GAME_CONFIG.movement;
    const p = this.group.position.clone();
    p.x += dx;
    p.z += dz;
    const height = this.crouching ? cfg.crouchHeight : cfg.standingHeight;

    for (const c of this.world.colliders) {
      const b = c.box;
      const overlapsY = p.y < b.max.y && p.y + height > b.min.y;
      if (!overlapsY) continue;
      const hit = p.x + cfg.radius > b.min.x && p.x - cfg.radius < b.max.x && p.z + cfg.radius > b.min.z && p.z - cfg.radius < b.max.z;
      if (hit) {
        if (dx !== 0) this.velocity.x = 0;
        if (dz !== 0) this.velocity.z = 0;
        return;
      }
    }
    this.group.position.x = p.x;
    this.group.position.z = p.z;
  }

  horizontalSpeed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }
}

function targetIsMoving(velocity) {
  return Math.hypot(velocity.x, velocity.z) > 0.25;
}

function dampAngle(current, target, lambda, dt) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * (1 - Math.exp(-lambda * dt));
}
