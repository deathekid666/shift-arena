// Original controller logic inspired by Epic's documented movement controls
// and public third-person motors. Values are tuned for SHIFT's metre scale.
export function createJumpState() {
  return { buffer: 0, coyote: 0, airTime: 0, landingTime: 1, landingImpact: 0, airSpeed: 0 };
}

export function requestJump(state, pressed, grounded, blocked, dt, cfg) {
  state.buffer = pressed ? cfg.jumpBuffer : Math.max(0, state.buffer - dt);
  state.coyote = grounded ? cfg.coyoteTime : Math.max(0, state.coyote - dt);
  if (blocked || state.buffer <= 0 || state.coyote <= 0) return false;
  state.buffer = 0;
  state.coyote = 0; // Consumed once: never re-arm the grace window in midair.
  state.airTime = 0;
  state.landingImpact = 0;
  return true;
}

export function steerInAir(velocity, direction, speed, dt, acceleration) {
  // Releasing movement keeps takeoff momentum. Steering has bounded acceleration
  // and cannot acquire sprint speed by toggling sprint after leaving the floor.
  if (direction.x * direction.x + direction.z * direction.z < 0.00001) return;
  const dx = direction.x * speed - velocity.x;
  const dz = direction.z * speed - velocity.z;
  const distance = Math.hypot(dx, dz);
  const blend = distance > 0 ? Math.min(1, acceleration * dt / distance) : 0;
  velocity.x += dx * blend;
  velocity.z += dz * blend;
}

export function integrateJump(velocity, dt, cfg) {
  // Exact constant-acceleration segments, split at apex/terminal velocity.
  // Collision sweeps still own the resulting displacement.
  let displacement = 0;
  if (velocity > 0) {
    const rise = Math.min(dt, velocity / cfg.gravity);
    displacement += velocity * rise - 0.5 * cfg.gravity * rise * rise;
    velocity = Math.max(0, velocity - cfg.gravity * rise);
    dt -= rise;
  }
  if (dt > 0) {
    const fall = Math.min(dt, Math.max(0, (cfg.maxFallSpeed + velocity) / cfg.fallGravity));
    displacement += velocity * fall - 0.5 * cfg.fallGravity * fall * fall;
    velocity = Math.max(-cfg.maxFallSpeed, velocity - cfg.fallGravity * fall);
    displacement += velocity * (dt - fall);
  }
  return { velocity, displacement };
}
