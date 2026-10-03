import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_CONFIG } from '../src/config.js';
import { createJumpState, requestJump, steerInAir, integrateJump } from '../src/jump-motion.js';
const cfg = GAME_CONFIG.movement;

test('the arc has a stable apex and a quicker descent at different frame rates', () => {
  for (const fps of [15, 30, 60, 120, 144]) {
    let y = 0, velocity = cfg.jumpVelocity, peak = 0, time = 0;
    do {
      const step = integrateJump(velocity, 1 / fps, cfg);
      velocity = step.velocity; y += step.displacement; time += 1 / fps;
      peak = Math.max(y, peak);
    } while (y > 0 && time < 2);
    assert(Math.abs(peak - 1.6) < 0.015, `${fps}: ${peak}`);
    assert(time >= 0.59 && time <= 0.67, `${fps}: ${time}`);
  }
});

test('analytical integration remains consistent through apex and terminal fall', () => {
  const one = integrateJump(10, 2, cfg);
  let velocity = 10, displacement = 0;
  for (let i = 0; i < 240; i++) {
    const step = integrateJump(velocity, 1 / 120, cfg);
    velocity = step.velocity; displacement += step.displacement;
  }
  assert(Math.abs(one.displacement - displacement) < 1e-9);
  assert.equal(velocity, -cfg.maxFallSpeed);
});

test('ledge grace is consumed once, with no midair double jump', () => {
  const s = createJumpState();
  assert.equal(requestJump(s, false, true, false, 0.01, cfg), false);
  assert.equal(requestJump(s, true, false, false, 0.06, cfg), true);
  assert.equal(requestJump(s, true, false, false, 0.01, cfg), false);
  assert.equal(s.coyote, 0);
});

test('landing buffers recent presses, expires older presses, and respects slide lock', () => {
  const s = createJumpState();
  assert.equal(requestJump(s, true, false, false, 0.01, cfg), false);
  assert.equal(requestJump(s, false, true, false, 0.06, cfg), true);
  const expired = createJumpState();
  requestJump(expired, true, false, false, 0.01, cfg);
  assert.equal(requestJump(expired, false, true, false, 0.13, cfg), false);
  assert.equal(requestJump(createJumpState(), true, true, true, 0.01, cfg), false);
});

test('air steering preserves released momentum and limits reversal acceleration', () => {
  const velocity = { x: 0, z: -8.4 };
  steerInAir(velocity, { x: 0, z: 0 }, 8.4, 0.3, cfg.airAcceleration);
  assert.equal(velocity.z, -8.4);
  steerInAir(velocity, { x: 0, z: 1 }, 8.4, 0.1, cfg.airAcceleration);
  assert(Math.abs(velocity.z + 7) < 1e-9);
  for (let i = 0; i < 120; i++) steerInAir(velocity, { x: 1, z: 0 }, 8.4, 1 / 60, cfg.airAcceleration);
  assert(Math.hypot(velocity.x, velocity.z) <= 8.4 + 1e-9);
});
