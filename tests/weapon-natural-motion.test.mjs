import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createWeaponNaturalMotionState,
  resetWeaponNaturalMotion,
  stepDampedSpring,
  stepWeaponNaturalMotion
} from '../src/weapon-natural-motion.js';

function sampleMotion({
  dt,
  seconds,
  massKg = 3.5,
  lengthM = 0.84,
  lookYawVelocity = 0,
  lookPitchVelocity = 0,
  localX = 0,
  localZ = -4.5,
  adsBlend = 0,
  shoulderBlend = 0.35,
  scoped = false
}) {
  const state =
    createWeaponNaturalMotionState();

  let out = null;
  let elapsed = 0;

  while (elapsed < seconds - 1e-9) {
    const step =
      Math.min(
        dt,
        seconds - elapsed
      );

    out =
      stepWeaponNaturalMotion(
        state,
        {
          dt: step,
          massKg,
          lengthM,
          lookYawVelocity,
          lookPitchVelocity,
          localX,
          localZ,
          speed:
            Math.hypot(
              localX,
              localZ
            ),
          grounded: true,
          gaitPhase:
            elapsed * 7.6,
          adsBlend,
          shoulderBlend,
          bobBase: 0.014,
          swayBase: 0.004,
          scoped
        }
      );

    elapsed += step;
  }

  return out;
}

test('spring approaches target without an instant snap', () => {
  let value = 0;
  let velocity = 0;

  for (let i = 0; i < 6; i += 1) {
    const next =
      stepDampedSpring(
        value,
        velocity,
        1,
        10,
        0.95,
        1 / 60
      );
    value = next.value;
    velocity = next.velocity;
  }

  assert.ok(value > 0);
  assert.ok(value < 1);
});

test('camera angular velocity drives sway', () => {
  const state =
    createWeaponNaturalMotionState();
  let out;

  for (let i = 0; i < 20; i += 1) {
    out =
      stepWeaponNaturalMotion(
        state,
        {
          dt: 1 / 60,
          massKg: 3.5,
          lengthM: 0.84,
          lookYawVelocity: 3.2,
          lookPitchVelocity: 0,
          localX: 0,
          localZ: 0,
          speed: 0,
          grounded: true,
          gaitPhase: 0,
          adsBlend: 0,
          shoulderBlend: 0,
          bobBase: 0.014,
          swayBase: 0.004,
          scoped: false
        }
      );
  }

  assert.ok(
    Math.abs(out.positionX) >
      0.004
  );
});

test('heavy long weapon retains more follow-through after release', () => {
  const light =
    createWeaponNaturalMotionState();
  const heavy =
    createWeaponNaturalMotionState();

  const common = {
    dt: 1 / 60,
    lookYawVelocity: 3.4,
    lookPitchVelocity: 0,
    localX: 0,
    localZ: 0,
    speed: 0,
    grounded: true,
    gaitPhase: 0,
    adsBlend: 0,
    shoulderBlend: 0,
    bobBase: 0.014,
    swayBase: 0.006,
    scoped: false
  };

  let lightBefore;
  let heavyBefore;

  for (let i = 0; i < 24; i += 1) {
    lightBefore =
      stepWeaponNaturalMotion(
        light,
        {
          ...common,
          massKg: 2.8,
          lengthM: 0.66
        }
      );

    heavyBefore =
      stepWeaponNaturalMotion(
        heavy,
        {
          ...common,
          massKg: 9.5,
          lengthM: 1.14
        }
      );
  }

  const lightPeak =
    Math.abs(
      lightBefore.positionX
    );

  const heavyPeak =
    Math.abs(
      heavyBefore.positionX
    );

  let lightReleased;
  let heavyReleased;

  for (let i = 0; i < 7; i += 1) {
    lightReleased =
      stepWeaponNaturalMotion(
        light,
        {
          ...common,
          lookYawVelocity: 0,
          massKg: 2.8,
          lengthM: 0.66
        }
      );

    heavyReleased =
      stepWeaponNaturalMotion(
        heavy,
        {
          ...common,
          lookYawVelocity: 0,
          massKg: 9.5,
          lengthM: 1.14
        }
      );
  }

  const lightRetention =
    Math.abs(
      lightReleased.positionX
    ) /
    lightPeak;

  const heavyRetention =
    Math.abs(
      heavyReleased.positionX
    ) /
    heavyPeak;

  assert.ok(
    heavyRetention >
      lightRetention * 1.20
  );
});

test('movement direction changes create acceleration reaction', () => {
  const state =
    createWeaponNaturalMotionState();

  for (let i = 0; i < 12; i += 1) {
    stepWeaponNaturalMotion(
      state,
      {
        dt: 1 / 60,
        massKg: 3.8,
        lengthM: 1.03,
        lookYawVelocity: 0,
        lookPitchVelocity: 0,
        localX: 0,
        localZ: -5,
        speed: 5,
        grounded: true,
        gaitPhase:
          i / 12 *
          Math.PI * 2,
        adsBlend: 0,
        shoulderBlend: 0.25,
        bobBase: 0.011,
        swayBase: 0.0035,
        scoped: false
      }
    );
  }

  const braking =
    stepWeaponNaturalMotion(
      state,
      {
        dt: 1 / 60,
        massKg: 3.8,
        lengthM: 1.03,
        lookYawVelocity: 0,
        lookPitchVelocity: 0,
        localX: 0,
        localZ: 0,
        speed: 0,
        grounded: true,
        gaitPhase: 0,
        adsBlend: 0,
        shoulderBlend: 0.25,
        bobBase: 0.011,
        swayBase: 0.0035,
        scoped: false
      }
    );

  assert.ok(
    Math.abs(braking.positionZ) >
      0.0001
  );
});

test('gait phase controls lateral step direction', () => {
  const a =
    createWeaponNaturalMotionState();
  const b =
    createWeaponNaturalMotionState();

  const base = {
    dt: 1 / 60,
    massKg: 3.5,
    lengthM: 0.84,
    lookYawVelocity: 0,
    lookPitchVelocity: 0,
    localX: 0,
    localZ: -4,
    speed: 4,
    grounded: true,
    adsBlend: 0,
    shoulderBlend: 0.2,
    bobBase: 0.014,
    swayBase: 0.004,
    scoped: false
  };

  const phaseA =
    stepWeaponNaturalMotion(
      a,
      {
        ...base,
        gaitPhase:
          Math.PI / 2
      }
    );

  const phaseB =
    stepWeaponNaturalMotion(
      b,
      {
        ...base,
        gaitPhase:
          Math.PI * 1.5
      }
    );

  assert.ok(
    phaseA.positionX *
      phaseB.positionX <
      0
  );
});

test('scoped ADS almost removes passive drift', () => {
  const hip =
    createWeaponNaturalMotionState();
  const ads =
    createWeaponNaturalMotionState();

  let hipOut;
  let adsOut;

  for (let i = 0; i < 16; i += 1) {
    const phase =
      i / 16 *
      Math.PI * 2;

    hipOut =
      stepWeaponNaturalMotion(
        hip,
        {
          dt: 1 / 60,
          massKg: 9.5,
          lengthM: 1.14,
          lookYawVelocity: 3.0,
          lookPitchVelocity: -1.2,
          localX: 1.5,
          localZ: -2,
          speed: 2.5,
          grounded: true,
          gaitPhase: phase,
          adsBlend: 0,
          shoulderBlend: 0.4,
          bobBase: 0.008,
          swayBase: 0.0027,
          scoped: true
        }
      );

    adsOut =
      stepWeaponNaturalMotion(
        ads,
        {
          dt: 1 / 60,
          massKg: 9.5,
          lengthM: 1.14,
          lookYawVelocity: 3.0,
          lookPitchVelocity: -1.2,
          localX: 1.5,
          localZ: -2,
          speed: 2.5,
          grounded: true,
          gaitPhase: phase,
          adsBlend: 1,
          shoulderBlend: 1,
          bobBase: 0.008,
          swayBase: 0.0027,
          scoped: true
        }
      );
  }

  assert.ok(
    Math.abs(adsOut.positionX) <
      Math.abs(hipOut.positionX) *
        0.02
  );
});

test('motion stays close across common frame rates', () => {
  const at30 =
    sampleMotion({
      dt: 1 / 30,
      seconds: 1,
      massKg: 9.5,
      lengthM: 1.14,
      lookYawVelocity: 2.4,
      lookPitchVelocity: -0.8
    });

  const at60 =
    sampleMotion({
      dt: 1 / 60,
      seconds: 1,
      massKg: 9.5,
      lengthM: 1.14,
      lookYawVelocity: 2.4,
      lookPitchVelocity: -0.8
    });

  const at120 =
    sampleMotion({
      dt: 1 / 120,
      seconds: 1,
      massKg: 9.5,
      lengthM: 1.14,
      lookYawVelocity: 2.4,
      lookPitchVelocity: -0.8
    });

  const maxDelta =
    Math.max(
      Math.abs(
        at30.positionX -
        at60.positionX
      ),
      Math.abs(
        at60.positionX -
        at120.positionX
      ),
      Math.abs(
        at30.roll -
        at120.roll
      )
    );

  assert.ok(
    maxDelta < 0.0035
  );
});

test('reset clears accumulated history', () => {
  const state =
    createWeaponNaturalMotionState();

  stepWeaponNaturalMotion(
    state,
    {
      dt: 1 / 60,
      massKg: 9.5,
      lengthM: 1.14,
      lookYawVelocity: 3,
      lookPitchVelocity: 1,
      localX: 2,
      localZ: -4,
      speed: 4.5,
      grounded: true,
      gaitPhase: 1.2,
      adsBlend: 0,
      shoulderBlend: 0,
      bobBase: 0.01,
      swayBase: 0.004
    }
  );

  resetWeaponNaturalMotion(
    state
  );

  assert.equal(state.lookX, 0);
  assert.equal(state.lookY, 0);
  assert.equal(state.accelX, 0);
  assert.equal(state.accelZ, 0);
  assert.equal(
    state.initialized,
    false
  );
});
