import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createWeaponNaturalMotionState,
  resetWeaponNaturalMotion,
  stepDampedSpring,
  stepWeaponNaturalMotion
} from '../src/weapon-natural-motion.js';

test('spring approaches target without an instant snap', () => {
  let value = 0;
  let velocity = 0;
  for (let i = 0; i < 6; i += 1) {
    const next = stepDampedSpring(
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

test('heavy long weapon carries look inertia longer than compact weapon', () => {
  const light = createWeaponNaturalMotionState();
  const heavy = createWeaponNaturalMotionState();

  const common = {
    dt: 1 / 60,
    lookX: 24,
    lookY: 0,
    speed: 0,
    grounded: true,
    adsBlend: 0,
    shoulderBlend: 0,
    bobBase: 0.014,
    swayBase: 0.006,
    scoped: false
  };

  let lightBefore;
  let heavyBefore;

  // Give both springs enough time to establish their characteristic response.
  for (let i = 0; i < 20; i += 1) {
    lightBefore = stepWeaponNaturalMotion(light, {
      ...common,
      massKg: 2.8,
      lengthM: 0.66
    });
    heavyBefore = stepWeaponNaturalMotion(heavy, {
      ...common,
      massKg: 9.5,
      lengthM: 1.14
    });
  }

  const lightPeak = Math.abs(lightBefore.positionX);
  const heavyPeak = Math.abs(heavyBefore.positionX);

  let lightReleased;
  let heavyReleased;
  for (let i = 0; i < 6; i += 1) {
    lightReleased = stepWeaponNaturalMotion(light, {
      ...common,
      lookX: 0,
      massKg: 2.8,
      lengthM: 0.66
    });
    heavyReleased = stepWeaponNaturalMotion(heavy, {
      ...common,
      lookX: 0,
      massKg: 9.5,
      lengthM: 1.14
    });
  }

  const lightRetention =
    Math.abs(lightReleased.positionX) /
    lightPeak;
  const heavyRetention =
    Math.abs(heavyReleased.positionX) /
    heavyPeak;

  assert.ok(
    Math.abs(heavyReleased.positionX) >
      Math.abs(lightReleased.positionX)
  );
  assert.ok(
    heavyRetention >
      lightRetention * 1.45
  );
});

test('scoped ADS almost removes passive weapon drift', () => {
  const hip = createWeaponNaturalMotionState();
  const ads = createWeaponNaturalMotionState();

  let hipOut;
  let adsOut;
  for (let i = 0; i < 12; i += 1) {
    hipOut = stepWeaponNaturalMotion(hip, {
      dt: 1 / 60,
      massKg: 9.5,
      lengthM: 1.14,
      lookX: 18,
      lookY: -8,
      speed: 2,
      grounded: true,
      adsBlend: 0,
      shoulderBlend: 0.4,
      bobBase: 0.008,
      swayBase: 0.0027,
      scoped: true
    });
    adsOut = stepWeaponNaturalMotion(ads, {
      dt: 1 / 60,
      massKg: 9.5,
      lengthM: 1.14,
      lookX: 18,
      lookY: -8,
      speed: 2,
      grounded: true,
      adsBlend: 1,
      shoulderBlend: 1,
      bobBase: 0.008,
      swayBase: 0.0027,
      scoped: true
    });
  }

  assert.ok(
    Math.abs(adsOut.positionX) <
      Math.abs(hipOut.positionX) * 0.03
  );
});

test('reset clears accumulated physical history', () => {
  const state = createWeaponNaturalMotionState();
  stepWeaponNaturalMotion(state, {
    dt: 1 / 60,
    massKg: 9.5,
    lengthM: 1.14,
    lookX: 20,
    lookY: 10,
    speed: 5,
    grounded: true,
    adsBlend: 0,
    shoulderBlend: 0,
    bobBase: 0.01,
    swayBase: 0.004
  });
  resetWeaponNaturalMotion(state);
  assert.equal(state.lookX, 0);
  assert.equal(state.lookY, 0);
  assert.equal(state.accelZ, 0);
  assert.equal(state.initialized, false);
});
