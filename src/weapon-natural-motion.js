// Passive weapon motion inspired by the physical response principles used in
// grounded FPS animation: the player drives the body, while the carried mass
// follows through on springs. This module is renderer-independent for testing.

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createWeaponNaturalMotionState() {
  return {
    lookX: 0,
    lookXVelocity: 0,
    lookY: 0,
    lookYVelocity: 0,
    accelZ: 0,
    accelZVelocity: 0,
    lastSpeed: 0,
    stepPhase: 0,
    breathTime: 0,
    initialized: false
  };
}

export function resetWeaponNaturalMotion(state) {
  state.lookX = 0;
  state.lookXVelocity = 0;
  state.lookY = 0;
  state.lookYVelocity = 0;
  state.accelZ = 0;
  state.accelZVelocity = 0;
  state.lastSpeed = 0;
  state.stepPhase = 0;
  state.breathTime = 0;
  state.initialized = false;
}

export function stepDampedSpring(
  value,
  velocity,
  target,
  frequency,
  damping,
  dt
) {
  const h = clamp(
    Number.isFinite(dt) ? dt : 0,
    0,
    0.05
  );
  const omega = Math.max(
    0.001,
    Number.isFinite(frequency) ? frequency : 1
  );
  const zeta = Math.max(
    0,
    Number.isFinite(damping) ? damping : 1
  );

  const f = 1 + 2 * h * zeta * omega;
  const oo = omega * omega;
  const hoo = h * oo;
  const hhoo = h * hoo;
  const inv = 1 / (f + hhoo);

  return {
    value:
      (
        f * value +
        h * velocity +
        hhoo * target
      ) * inv,
    velocity:
      (
        velocity +
        hoo * (target - value)
      ) * inv
  };
}

export function stepWeaponNaturalMotion(
  state,
  {
    dt,
    massKg,
    lengthM,
    lookX,
    lookY,
    speed,
    grounded,
    adsBlend,
    shoulderBlend,
    bobBase,
    swayBase,
    scoped = false
  }
) {
  const safeDt = clamp(dt ?? 0, 0, 0.05);
  const kg = clamp(massKg ?? 3.5, 2.0, 12.0);
  const length = clamp(lengthM ?? 0.84, 0.5, 1.3);
  const mass01 = clamp((kg - 2.8) / (9.5 - 2.8), 0, 1);
  const length01 = clamp((length - 0.66) / (1.14 - 0.66), 0, 1);
  const ads = clamp(adsBlend ?? 0, 0, 1);
  const shouldered = clamp(shoulderBlend ?? 0, 0, 1);
  const move = grounded
    ? clamp((speed ?? 0) / 5.2, 0, 1)
    : 0;

  if (!state.initialized) {
    state.lastSpeed = speed ?? 0;
    state.initialized = true;
  }

  state.breathTime += safeDt;
  state.stepPhase +=
    safeDt *
    (3.2 + Math.max(0, speed ?? 0) * 1.42);

  // Look motion is a TARGET for a spring, not a direct weapon offset. This is
  // what makes the arms react passively instead of waving the weapon.
  const lookAmplitude =
    (0.00056 + mass01 * 0.00016) *
    (0.75 + (swayBase ?? 0.004) / 0.008 * 0.25);

  const lookTargetX = clamp(
    -(lookX ?? 0) * lookAmplitude,
    -0.026,
    0.026
  );
  const lookTargetY = clamp(
    (lookY ?? 0) * lookAmplitude * 0.62,
    -0.017,
    0.017
  );

  // Heavy/long weapons react more slowly, but are deliberately well damped:
  // weight should read as follow-through, not wobble.
  const lookFrequency =
    17.5 -
    mass01 * 6.2 -
    length01 * 1.5;

  const springX = stepDampedSpring(
    state.lookX,
    state.lookXVelocity,
    lookTargetX,
    lookFrequency,
    0.93,
    safeDt
  );
  state.lookX = springX.value;
  state.lookXVelocity = springX.velocity;

  const springY = stepDampedSpring(
    state.lookY,
    state.lookYVelocity,
    lookTargetY,
    lookFrequency * 0.94,
    0.96,
    safeDt
  );
  state.lookY = springY.value;
  state.lookYVelocity = springY.velocity;

  const acceleration =
    safeDt > 0.0001
      ? clamp(
          ((speed ?? 0) - state.lastSpeed) /
            safeDt,
          -14,
          14
        )
      : 0;
  state.lastSpeed = speed ?? 0;

  const accelTarget =
    grounded
      ? acceleration *
        (0.00048 + mass01 * 0.00072)
      : 0;

  const accelSpring = stepDampedSpring(
    state.accelZ,
    state.accelZVelocity,
    clamp(accelTarget, -0.018, 0.018),
    11.5 - mass01 * 4.0,
    1.02,
    safeDt
  );
  state.accelZ = accelSpring.value;
  state.accelZVelocity = accelSpring.velocity;

  // Two harmonics prevent the robotic left-right metronome look. The vertical
  // component is intentionally smaller than lateral shoulder travel.
  const stepAmp =
    (bobBase ?? 0.014) *
    move *
    (1 - mass01 * 0.22);

  const stepX =
    (
      Math.sin(state.stepPhase) * 0.74 +
      Math.sin(
        state.stepPhase * 2 + 0.55
      ) * 0.26
    ) *
    stepAmp *
    0.52;

  const stepY =
    (
      Math.sin(
        state.stepPhase * 2 - 0.35
      ) * 0.58 -
      Math.cos(state.stepPhase) * 0.18
    ) *
    stepAmp *
    0.34;

  // Very small, non-synchronised breathing drift at low speed. It is not
  // random and therefore cannot introduce frame-to-frame jitter.
  const idle = 1 - move;
  const breathX =
    Math.sin(
      state.breathTime * 0.91 + 0.7
    ) *
    0.00135 *
    idle;
  const breathY =
    (
      Math.sin(state.breathTime * 1.13) *
        0.00115 +
      Math.sin(
        state.breathTime * 0.47 + 1.8
      ) *
        0.00045
    ) *
    idle;

  // Preserve sight readability. Hip/carry keeps the kinetic motion, normal ADS
  // retains only a trace, and the scoped sniper becomes almost exact.
  const adsResidual = scoped ? 0.012 : 0.075;
  const adsScale =
    1 - ads * (1 - adsResidual);
  const shoulderScale =
    1 - shouldered * 0.34;
  const scale = adsScale * shoulderScale;

  const lever = 0.90 + length01 * 0.32;

  const positionX =
    (state.lookX + stepX + breathX) *
    scale;
  const positionY =
    (state.lookY + stepY + breathY) *
    scale;
  const positionZ =
    state.accelZ *
    scale;

  return {
    positionX,
    positionY,
    positionZ,
    pitch:
      (
        state.lookY * 1.38 -
        state.accelZ * 0.42 +
        stepY * 0.55
      ) *
      lever *
      scale,
    yaw:
      (
        -state.lookX * 1.42 +
        stepX * 0.48
      ) *
      lever *
      scale,
    roll:
      (
        -state.lookX * 2.05 +
        stepX * 1.20
      ) *
      lever *
      scale
  };
}
