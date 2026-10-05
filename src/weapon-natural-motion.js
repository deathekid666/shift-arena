// Connected weapon motion for third-person firearms.
//
// Locomotion owns the body/root. This module produces restrained passive
// reactions, the weapon remains exactly on its final target, and late hand IK
// solves the arms to the weapon. Inputs use rad/s and local m/s instead of raw
// mouse pixels so the result is less frame/input-rate dependent.

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createWeaponNaturalMotionState() {
  return {
    lookX: 0,
    lookXVelocity: 0,
    lookY: 0,
    lookYVelocity: 0,
    accelX: 0,
    accelXVelocity: 0,
    accelZ: 0,
    accelZVelocity: 0,
    lastLocalX: 0,
    lastLocalZ: 0,
    fallbackPhase: 0,
    breathTime: 0,
    initialized: false
  };
}

export function resetWeaponNaturalMotion(state) {
  state.lookX = 0;
  state.lookXVelocity = 0;
  state.lookY = 0;
  state.lookYVelocity = 0;
  state.accelX = 0;
  state.accelXVelocity = 0;
  state.accelZ = 0;
  state.accelZVelocity = 0;
  state.lastLocalX = 0;
  state.lastLocalZ = 0;
  state.fallbackPhase = 0;
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
    Number.isFinite(frequency)
      ? frequency
      : 1
  );

  const zeta = Math.max(
    0,
    Number.isFinite(damping)
      ? damping
      : 1
  );

  const f =
    1 + 2 * h * zeta * omega;
  const oo =
    omega * omega;
  const hoo =
    h * oo;
  const hhoo =
    h * hoo;
  const inv =
    1 / (f + hhoo);

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
    lookYawVelocity,
    lookPitchVelocity,
    localX,
    localZ,
    speed,
    grounded,
    gaitPhase,
    adsBlend,
    shoulderBlend,
    bobBase,
    swayBase,
    scoped = false
  }
) {
  const safeDt =
    clamp(dt ?? 0, 0, 0.05);

  const kg =
    clamp(
      massKg ?? 3.5,
      2.0,
      12.0
    );

  const length =
    clamp(
      lengthM ?? 0.84,
      0.5,
      1.3
    );

  const mass01 =
    clamp(
      (kg - 2.8) /
        (9.5 - 2.8),
      0,
      1
    );

  const length01 =
    clamp(
      (length - 0.66) /
        (1.14 - 0.66),
      0,
      1
    );

  const ads =
    clamp(adsBlend ?? 0, 0, 1);

  const shouldered =
    clamp(shoulderBlend ?? 0, 0, 1);

  const currentLocalX =
    Number.isFinite(localX)
      ? localX
      : 0;

  const currentLocalZ =
    Number.isFinite(localZ)
      ? localZ
      : 0;

  if (!state.initialized) {
    state.lastLocalX = currentLocalX;
    state.lastLocalZ = currentLocalZ;
    state.initialized = true;
  }

  state.breathTime += safeDt;

  // View response is driven by angular velocity, not raw pointer pixels.
  const lookYaw =
    clamp(
      lookYawVelocity ?? 0,
      -7.5,
      7.5
    );

  const lookPitch =
    clamp(
      lookPitchVelocity ?? 0,
      -7.5,
      7.5
    );

  const lookAmplitude =
    (
      0.0032 +
      mass01 * 0.0010
    ) *
    (
      0.82 +
      clamp(
        (swayBase ?? 0.004) / 0.008,
        0,
        1.5
      ) * 0.18
    );

  const lookTargetX =
    clamp(
      -lookYaw * lookAmplitude,
      -0.024,
      0.024
    );

  const lookTargetY =
    clamp(
      lookPitch *
        lookAmplitude *
        0.58,
      -0.014,
      0.014
    );

  const lookFrequency =
    18.5 -
    mass01 * 6.0 -
    length01 * 1.4;

  const lookXSpring =
    stepDampedSpring(
      state.lookX,
      state.lookXVelocity,
      lookTargetX,
      lookFrequency,
      0.96,
      safeDt
    );

  state.lookX = lookXSpring.value;
  state.lookXVelocity = lookXSpring.velocity;

  const lookYSpring =
    stepDampedSpring(
      state.lookY,
      state.lookYVelocity,
      lookTargetY,
      lookFrequency * 0.96,
      0.98,
      safeDt
    );

  state.lookY = lookYSpring.value;
  state.lookYVelocity = lookYSpring.velocity;

  // Direction changes create opposite-direction mass reaction.
  const invDt =
    safeDt > 0.0001
      ? 1 / safeDt
      : 0;

  const localAccelX =
    clamp(
      (
        currentLocalX -
        state.lastLocalX
      ) * invDt,
      -18,
      18
    );

  const localAccelZ =
    clamp(
      (
        currentLocalZ -
        state.lastLocalZ
      ) * invDt,
      -18,
      18
    );

  state.lastLocalX = currentLocalX;
  state.lastLocalZ = currentLocalZ;

  const accelScale =
    0.00031 +
    mass01 * 0.00023;

  const accelTargetX =
    grounded
      ? clamp(
          -localAccelX * accelScale,
          -0.010,
          0.010
        )
      : 0;

  const accelTargetZ =
    grounded
      ? clamp(
          -localAccelZ *
            (
              0.00025 +
              mass01 * 0.00025
            ),
          -0.011,
          0.011
        )
      : 0;

  const accelFrequency =
    13.5 -
    mass01 * 4.1;

  const accelXSpring =
    stepDampedSpring(
      state.accelX,
      state.accelXVelocity,
      accelTargetX,
      accelFrequency,
      1.02,
      safeDt
    );

  state.accelX = accelXSpring.value;
  state.accelXVelocity = accelXSpring.velocity;

  const accelZSpring =
    stepDampedSpring(
      state.accelZ,
      state.accelZVelocity,
      accelTargetZ,
      accelFrequency * 0.92,
      1.03,
      safeDt
    );

  state.accelZ = accelZSpring.value;
  state.accelZVelocity = accelZSpring.velocity;

  // Use the character's actual locomotion phase whenever available.
  const move =
    grounded
      ? clamp((speed ?? 0) / 5.2, 0, 1)
      : 0;

  if (!Number.isFinite(gaitPhase)) {
    state.fallbackPhase +=
      safeDt *
      (
        3.2 +
        Math.max(0, speed ?? 0) * 1.42
      );
  }

  const phase =
    Number.isFinite(gaitPhase)
      ? gaitPhase
      : state.fallbackPhase;

  const stepAmp =
    (bobBase ?? 0.014) *
    move *
    (1 - mass01 * 0.16);

  // Vertical travel stays intentionally small; authored locomotion already
  // supplies the main body rise/fall.
  const stepX =
    Math.sin(phase) *
    stepAmp *
    0.34;

  const stepY =
    (
      -Math.cos(phase * 2) * 0.12 +
      Math.sin(phase + 0.45) * 0.04
    ) *
    stepAmp;

  const stepRoll =
    Math.sin(phase) *
    stepAmp *
    0.62;

  // Small deterministic idle drift: no random frame noise.
  const idle = 1 - move;

  const breathX =
    (
      Math.sin(
        state.breathTime * 0.83 + 0.75
      ) * 0.00062 +
      Math.sin(
        state.breathTime * 0.37 + 2.1
      ) * 0.00022
    ) *
    idle;

  const breathY =
    (
      Math.sin(
        state.breathTime * 1.06
      ) * 0.00052 +
      Math.sin(
        state.breathTime * 0.43 + 1.5
      ) * 0.00018
    ) *
    idle;

  // ADS keeps only a trace of passive motion; magnified sniper scope becomes
  // almost exact to preserve the sight picture.
  const adsResidual =
    scoped
      ? 0.006
      : 0.055;

  const adsScale =
    1 -
    ads * (1 - adsResidual);

  const shoulderScale =
    1 -
    shouldered * 0.28;

  const scale =
    adsScale *
    shoulderScale;

  const lever =
    0.92 +
    length01 * 0.28;

  const positionX =
    (
      state.lookX +
      state.accelX +
      stepX +
      breathX
    ) *
    scale;

  const positionY =
    (
      state.lookY +
      stepY +
      breathY
    ) *
    scale;

  const positionZ =
    state.accelZ *
    scale;

  const pitch =
    (
      state.lookY * 1.00 +
      state.accelZ * 0.92 +
      stepY * 0.42
    ) *
    lever *
    scale;

  const yaw =
    (
      -state.lookX * 1.08 +
      state.accelX * 0.54 +
      stepX * 0.30
    ) *
    lever *
    scale;

  const roll =
    (
      -state.lookX * 1.48 -
      state.accelX * 0.82 +
      stepRoll
    ) *
    lever *
    scale;

  return {
    positionX,
    positionY,
    positionZ,
    pitch,
    yaw,
    roll,
    bodyPitch: pitch * 0.32,
    bodyYaw: yaw * 0.38,
    bodyRoll: roll * 0.24
  };
}
