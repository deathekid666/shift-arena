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
    this.group.position.set(0, 0, 12);
    world.scene.add(this.group);
  }

  update(dt, cameraYaw) {
    const cfg = GAME_CONFIG.movement;
    const ground = this.world.groundHeightAt(this.group.position.x, this.group.position.z);
    this.grounded = this.group.position.y <= ground + 0.04 && this.velocity.y <= 0;
    if (this.grounded) {
      this.group.position.y = ground;
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
    this.group.position.y += displacement.y;

    const newGround = this.world.groundHeightAt(this.group.position.x, this.group.position.z);
    if (this.group.position.y < newGround) {
      this.group.position.y = newGround;
      this.velocity.y = 0;
      this.grounded = true;
    }
    if (this.group.position.y < -15) {
      this.group.position.set(0, 0, 12);
      this.velocity.set(0, 0, 0);
    }

    if (targetIsMoving(this.velocity)) {
      const facing = Math.atan2(this.velocity.x, this.velocity.z) + Math.PI;
      if (Number.isFinite(facing)) {
        this.group.rotation.y = dampAngle(this.group.rotation.y, facing, 14, dt);
      }
    }

    const height = this.crouching ? cfg.crouchHeight : cfg.standingHeight;
    this.body.scale.y = THREE.MathUtils.damp(this.body.scale.y, height / cfg.standingHeight, 18, dt);
    this.body.position.y = height / 2;
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
