import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { GAME_CONFIG } from './config.js';
import { buildRoachScoutCharacter, updateRoachScoutCharacter } from './character.js';

export class PlayerController {
  constructor(world, input) {
    this.world = world;
    this.input = input;
    this.group = new THREE.Group();
    this.velocity = new THREE.Vector3();
    this.grounded = true;
    this.crouching = false;
    this.crouchVisual = 0;
    this.sliding = false;
    this.slideTimer = 0;
    this.slideDirection = new THREE.Vector3(0, 0, -1);
    this.localMotion = new THREE.Vector3();

    // The gameplay capsule remains implicit in movement/collision values.
    // This pivot contains only the visible character and animation attachments.
    this.body = new THREE.Group();
    this.body.name = 'PlayerVisualPivot';
    this.body.position.y = GAME_CONFIG.movement.standingHeight / 2;
    this.group.add(this.body);

    // Procedural Build 009 model is now fallback-only.
    this.fallbackCharacter = buildRoachScoutCharacter();
    this.fallbackVisualRoot = this.fallbackCharacter.root;
    this.fallbackVisualRoot.visible = false;
    this.body.add(this.fallbackVisualRoot);

    this.character = this.fallbackCharacter;
    this.visualRoot = this.fallbackVisualRoot;
    this.vrmCharacter = null;
    this.characterLoadState = 'loading';
    this.characterLoadError = null;

    this.weaponVisualActive = true;
    this.fangArmOverride = false;
    this.fangAnimation = null;
    this.aimYawOffset = 0;
    this.aimPitch = 0;
    this.weaponAiming = false;

    // Start the real anime/VRM pipeline immediately. The old geometry only
    // reappears if the external development avatar genuinely fails to load.
    this.characterReady = this.loadVrmVisual();
    this.resetAt(world.spawnPoint);
    world.scene.add(this.group);
  }

  resetAt(position) {
    this.group.position.copy(position);
    this.group.visible = true;
    this.velocity.set(0, 0, 0);
    this.grounded = true;
    this.crouching = false;
    this.crouchVisual = 0;
    this.sliding = false;
    this.slideTimer = 0;
    this.slideDirection.set(0, 0, -1);
    this.body.scale.set(1, 1, 1);
    this.body.rotation.set(0, 0, 0);
    this.body.position.y = GAME_CONFIG.movement.standingHeight / 2;
    if (this.visualRoot) this.visualRoot.visible = true;
    this.fangArmOverride = false;
  }

  update(dt, cameraYaw, combatFacing = false, aimPitch = 0, weaponAiming = false) {
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
    const crouchPressed = this.input.consume('crouch');
    const sprintPressed = this.input.consume('sprint');
    const jumpPressed = this.input.consume('jump');

    // Use both the input controller's pressed edge and the player's own state
    // edge. This makes slide entry robust even if Ctrl and Shift arrive in the
    // same browser frame.
    const crouchJustPressed = crouchDown && !this.crouching;
    let startedSlide = false;

    if (
      (crouchPressed || crouchJustPressed) &&
      !this.sliding &&
      this.grounded &&
      this.horizontalSpeed() >= cfg.slideMinStartSpeed
    ) {
      this.beginSlide(move);
      startedSlide = true;
    }

    this.crouching = crouchDown;

    // Visual crouch remains separate from slide; the slide gets its own pose layer.
    const crouchTarget = this.crouching && !this.sliding ? 1 : 0;
    this.crouchVisual = THREE.MathUtils.damp(
      this.crouchVisual,
      crouchTarget,
      crouchTarget > this.crouchVisual ? 11.5 : 8.5,
      dt
    );
    if (Math.abs(this.crouchVisual - crouchTarget) < 0.002) {
      this.crouchVisual = crouchTarget;
    }

    if (this.sliding) {
      this.updateSlide(dt, move);

      // Fortnite-style early cancels. Jump keeps the existing jump impulse;
      // sprint simply exits the skid and returns control to normal movement.
      if (jumpPressed && this.grounded) {
        this.sliding = false;
        this.velocity.y = cfg.jumpVelocity;
        this.grounded = false;
      } else if (sprintPressed && !startedSlide) {
        this.sliding = false;
      } else if (
        this.slideTimer <= 0 ||
        !crouchDown ||
        this.horizontalSpeed() < cfg.slideExitSpeed
      ) {
        this.sliding = false;
      }
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

    if (jumpPressed && this.grounded && !this.sliding) {
      this.velocity.y = cfg.jumpVelocity;
      this.grounded = false;
    }
    if (!this.grounded) this.velocity.y -= cfg.gravity * dt;

    const displacement = this.velocity.clone().multiplyScalar(dt);
    this.moveHorizontal(displacement.x, 0);
    this.moveHorizontal(0, displacement.z);
    this.moveVertical(displacement.y, Math.hypot(displacement.x, displacement.z));

    if (this.group.position.y < -15) {
      this.resetAt(this.world.spawnPoint);
    }

    const moving = targetIsMoving(this.velocity);
    const movementFacing = moving
      ? Math.atan2(this.velocity.x, this.velocity.z) + Math.PI
      : this.group.rotation.y;

    if (combatFacing) {
      if (moving && Number.isFinite(movementFacing)) {
        const desiredTwist = angleDelta(movementFacing, cameraYaw);
        const allowedTwist = THREE.MathUtils.clamp(desiredTwist, -1.15, 1.15);
        const rootTarget = cameraYaw - allowedTwist;
        this.group.rotation.y = dampAngle(
          this.group.rotation.y,
          rootTarget,
          16,
          dt
        );
      } else {
        this.group.rotation.y = dampAngle(
          this.group.rotation.y,
          cameraYaw,
          20,
          dt
        );
      }
    } else if (moving && Number.isFinite(movementFacing)) {
      this.group.rotation.y = dampAngle(
        this.group.rotation.y,
        movementFacing,
        14,
        dt
      );
    }

    this.aimYawOffset = combatFacing
      ? THREE.MathUtils.clamp(
          angleDelta(this.group.rotation.y, cameraYaw),
          -1.18,
          1.18
        )
      : 0;
    this.aimPitch = THREE.MathUtils.clamp(aimPitch, -0.68, 0.86);
    this.weaponAiming = Boolean(weaponAiming);

    // Collider height still changes when crouching, but a real humanoid must
    // crouch with bones instead of being vertically squashed like the old capsule.
    this.body.scale.y = THREE.MathUtils.damp(this.body.scale.y, 1, 18, dt);
    this.body.position.y = cfg.standingHeight / 2;

    this.localMotion
      .set(this.velocity.x, 0, this.velocity.z)
      .applyAxisAngle(Y_AXIS, -this.group.rotation.y);

    const characterState = {
      dt,
      speed: this.horizontalSpeed(),
      localX: this.localMotion.x,
      localZ: this.localMotion.z,
      verticalSpeed: this.velocity.y,
      sprinting: this.input.down('sprint') && !this.crouching && !this.sliding,
      sliding: this.sliding,
      slideProgress: this.sliding
        ? 1 - THREE.MathUtils.clamp(this.slideTimer / cfg.slideDuration, 0, 1)
        : 0,
      combat: this.weaponVisualActive && combatFacing,
      aiming: this.weaponVisualActive && this.weaponAiming,
      aimPitch: this.aimPitch,
      aimYawOffset: this.aimYawOffset,
      crouching: this.crouching,
      crouchBlend: this.crouchVisual,
      grounded: this.grounded,
      rightArmOverride: this.fangArmOverride,
      fangAnimation: this.fangAnimation
    };

    if (this.vrmCharacter) {
      this.vrmCharacter.update(dt, characterState);
    } else if (this.characterLoadState === 'error') {
      updateRoachScoutCharacter(this.fallbackCharacter, characterState);
    }
  }

  async loadVrmVisual() {
    try {
      // Dynamic import means a slow/failing external VRM dependency can never
      // block the game itself from booting and rendering.
      const avatar = await withTimeout(
        (async () => {
          const { loadRoachScoutVrmBase } = await import('./vrm-character.js');
          return loadRoachScoutVrmBase();
        })(),
        12000,
        'VRM character load timed out'
      );

      if (this.vrmCharacter?.root?.parent) {
        this.vrmCharacter.root.parent.remove(this.vrmCharacter.root);
      }

      this.vrmCharacter = avatar;
      this.character = avatar;
      this.body.add(avatar.root);

      this.fallbackVisualRoot.visible = false;
      this.visualRoot = avatar.root;
      this.visualRoot.visible = true;

      this.characterLoadState = 'ready';
      this.characterLoadError = null;
      return avatar;
    } catch (error) {
      console.error('VRM character load failed:', error);
      this.vrmCharacter = null;
      this.character = this.fallbackCharacter;
      this.visualRoot = this.fallbackVisualRoot;
      this.visualRoot.visible = true;
      this.characterLoadState = 'error';
      this.characterLoadError = error;
      return null;
    }
  }

  getCharacterStatus() {
    return {
      state: this.characterLoadState,
      usingVrm: Boolean(this.vrmCharacter),
      error: this.characterLoadError ? String(this.characterLoadError) : null
    };
  }

  beginSlide(move) {
    const cfg = GAME_CONFIG.movement;
    this.sliding = true;
    this.slideTimer = cfg.slideDuration;

    const hs = this.horizontalSpeed();

    if (hs > 0.05) {
      this.slideDirection.set(this.velocity.x, 0, this.velocity.z).normalize();
    } else if (move.lengthSq() > 0.001) {
      this.slideDirection.copy(move).normalize();
    } else {
      this.slideDirection.set(0, 0, -1)
        .applyAxisAngle(Y_AXIS, this.group.rotation.y);
    }

    // Preserve sprint momentum and add a small entry push rather than
    // teleporting every valid slide to the same speed.
    const boostedSpeed = Math.max(
      hs,
      Math.min(cfg.slideInitialSpeed, hs + cfg.slideEntryBoost)
    );
    const startSpeed = Math.min(cfg.slideMaxSpeed, boostedSpeed);

    this.velocity.x = this.slideDirection.x * startSpeed;
    this.velocity.z = this.slideDirection.z * startSpeed;
  }

  updateSlide(dt, move) {
    const cfg = GAME_CONFIG.movement;
    this.slideTimer -= dt;

    let speed = this.horizontalSpeed();
    if (speed < 0.001) return;

    this.slideDirection
      .set(this.velocity.x, 0, this.velocity.z)
      .normalize();

    // Steering redirects existing momentum; it does not create speed.
    // Opposite input acts as a brake instead of letting the character pivot
    // 180 degrees while still sliding at full speed.
    if (move.lengthSq() > 0.001) {
      const desired = move.clone().normalize();
      const alignment = THREE.MathUtils.clamp(
        this.slideDirection.dot(desired),
        -1,
        1
      );

      if (alignment < 0) {
        speed = Math.max(
          0,
          speed - cfg.slideReverseBrake * (-alignment) * dt
        );
      }

      const steerStrength =
        cfg.slideSteering *
        THREE.MathUtils.lerp(0.22, 1, Math.max(0, alignment));
      const steer = 1 - Math.exp(-steerStrength * dt);
      this.slideDirection.lerp(desired, steer).normalize();
    }

    const rampSurface = this.world.rampSurfaceAt(
      this.group.position.x,
      this.group.position.z,
      GAME_CONFIG.movement.radius * 0.25
    );

    let slopeDrive = 0;

    if (rampSurface) {
      const r = rampSurface.ramp;
      const run = r.axis === 'z'
        ? new THREE.Vector3(0, 0, r.direction)
        : new THREE.Vector3(r.direction, 0, 0);

      const downhill = run.multiplyScalar(-1);
      const slopeStrength = THREE.MathUtils.clamp(
        (r.topY - r.baseY) /
          Math.max(
            0.001,
            r.axis === 'z' ? r.maxZ - r.minZ : r.maxX - r.minX
          ),
        0,
        1
      );

      const alongDownhill = this.slideDirection.dot(downhill);

      if (alongDownhill > 0) {
        slopeDrive =
          cfg.slideDownhillAcceleration *
          slopeStrength *
          alongDownhill;
      } else if (alongDownhill < 0) {
        slopeDrive =
          cfg.slideUphillBrake *
          slopeStrength *
          alongDownhill;
      }

      speed += slopeDrive * dt;
    }

    // Flat terrain settles toward normal running speed, matching Fortnite's
    // documented behavior. Downhill drive can keep the slide faster.
    if (speed > cfg.slideFlatTargetSpeed) {
      const frictionScale = slopeDrive > 0 ? cfg.slideDownhillFrictionScale : 1;
      speed = Math.max(
        cfg.slideFlatTargetSpeed,
        speed - cfg.slideFriction * frictionScale * dt
      );
    } else if (slopeDrive <= 0) {
      speed = Math.max(
        0,
        speed - cfg.slideLowSpeedFriction * dt
      );
    }

    speed = THREE.MathUtils.clamp(speed, 0, cfg.slideMaxSpeed);

    this.velocity.x = this.slideDirection.x * speed;
    this.velocity.z = this.slideDirection.z * speed;
  }

  supportHeightAt(x, z) {
    const cfg = GAME_CONFIG.movement;
    const feetY = this.group.position.y;
    const rampY = this.world.rampHeightAt(x, z);
    let supportY = 0;

    // A ramp is valid support only when its surface is already at the player's
    // feet (or just a small step above). This prevents walking underneath a
    // ramp from snapping the player onto its top surface.
    if (rampY !== null && rampY <= feetY + 0.12) {
      supportY = Math.max(supportY, rampY);
    }

    for (const c of this.world.colliders) {
      const b = c.box;
      const overlapsXZ =
        x + cfg.radius > b.min.x &&
        x - cfg.radius < b.max.x &&
        z + cfg.radius > b.min.z &&
        z - cfg.radius < b.max.z;

      if (!overlapsXZ) continue;

      const top = b.max.y;
      if (top <= feetY + 0.06 && top > supportY) {
        supportY = top;
      }
    }

    return supportY <= feetY + 0.12 ? supportY : null;
  }

  moveVertical(dy, horizontalTravel = 0) {
    const cfg = GAME_CONFIG.movement;
    const height = this.crouching ? cfg.crouchHeight : cfg.standingHeight;
    const x = this.group.position.x;
    const z = this.group.position.z;
    const oldY = this.group.position.y;
    const newY = oldY + dy;

    if (dy <= 0) {
      let landingY = 0;

      const rampY = this.world.rampHeightAt(x, z);
      if (rampY !== null) {
        // Walking up a ramp can raise the floor slightly between frames.
        // Landing from above is also allowed. Being well below the surface is not.
        const rampStepTolerance = Math.max(0.12, horizontalTravel * 0.7 + 0.04);
        const canReachRampFromAbove =
          oldY >= rampY - rampStepTolerance &&
          newY <= rampY + 0.001;

        if (canReachRampFromAbove) {
          landingY = Math.max(landingY, rampY);
        }
      }

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

    const rampSurface = this.world.rampSurfaceAt(x, z, cfg.radius * 0.7);
    if (rampSurface) {
      const underside = rampSurface.underside;
      const crossedRampUnderside =
        oldHead <= underside + 0.04 &&
        newHead >= underside;

      if (crossedRampUnderside) {
        this.group.position.y = Math.max(0, underside - height - 0.001);
        this.velocity.y = 0;
        this.grounded = false;
        return;
      }
    }

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

    // Ramps are thin boards rather than solid wedges. The player may travel
    // underneath when the head clears the underside, may step onto the top
    // from the low edge, but may never pass through the board itself.
    const rampSurface = this.world.rampSurfaceAt(p.x, p.z, cfg.radius * 0.85);
    if (rampSurface) {
      const feetY = this.group.position.y;
      const headY = feetY + height;
      const travel = Math.hypot(dx, dz);
      const stepAllowance = Math.max(0.14, travel * 0.85 + 0.05);
      const canStepOntoTop =
        feetY >= rampSurface.height - stepAllowance;
      const fullyUnder =
        headY <= rampSurface.underside - 0.025;
      const fullyAbove =
        feetY >= rampSurface.height - 0.035;

      if (!fullyUnder && !fullyAbove && !canStepOntoTop) {
        if (dx !== 0) this.velocity.x = 0;
        if (dz !== 0) this.velocity.z = 0;
        return;
      }
    }

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

  setCameraBodyHidden(hidden) {
    // Keep weapon / Fang animation attachments visible. Only hide the actual
    // character mesh when the camera is forced very close by kitchen geometry.
    this.visualRoot.visible = !hidden;
  }

  setFangArmOverride(active) {
    // With a VRM character we animate the real arm instead of hiding it and
    // spawning a duplicate. This flag is still used by the fallback model.
    this.fangArmOverride = Boolean(active);

    if (!this.vrmCharacter && !active && this.fallbackCharacter?.rightArm?.root) {
      this.fallbackCharacter.rightArm.root.visible = true;
    }
  }

  setFangAnimation(animation) {
    this.fangAnimation = animation ? { ...animation } : null;
  }

  applyFangPose(animation, dt) {
    this.vrmCharacter?.applyFangPose(animation, dt);
  }

  getWeaponSocket() {
    return this.vrmCharacter?.weaponSocket ?? null;
  }

  getFangSocket() {
    return this.vrmCharacter?.fangSocket ?? null;
  }

  getHandWorldPosition(side = 'right', target = new THREE.Vector3()) {
    const key = side === 'left' ? 'leftHand' : 'rightHand';
    const hand = this.vrmCharacter?.bones?.[key];
    if (!hand) return null;
    hand.getWorldPosition(target);
    return target;
  }

  getBoneWorldPosition(name, target = new THREE.Vector3()) {
    const bone = this.vrmCharacter?.bones?.[name];
    if (!bone) return null;
    bone.getWorldPosition(target);
    return target;
  }

  applyWeaponIK(gripPose, dt) {
    if (!this.vrmCharacter || !gripPose?.aiming) return;
    this.vrmCharacter.applyWeaponIK?.(gripPose, dt);
  }

  getCharacterVisualRoot() {
    return this.visualRoot ?? null;
  }

  getAnimationState() {
    return this.vrmCharacter?.locomotion?.state ?? 'FALLBACK';
  }

  setWeaponVisualActive(active) {
    this.weaponVisualActive = Boolean(active);
  }

  horizontalSpeed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);

function withTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function targetIsMoving(velocity) {
  return Math.hypot(velocity.x, velocity.z) > 0.25;
}

function angleDelta(current, target) {
  return Math.atan2(
    Math.sin(target - current),
    Math.cos(target - current)
  );
}

function dampAngle(current, target, lambda, dt) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * (1 - Math.exp(-lambda * dt));
}
