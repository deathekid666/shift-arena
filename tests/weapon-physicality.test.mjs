import test from 'node:test';
import assert from 'node:assert/strict';

import { GAME_CONFIG, WEAPON_ORDER } from '../src/config.js';
import {
  getWeaponMassKg,
  handlingMassFromKg,
  responseScaleFromKg,
  getWeaponPhysicalSize,
  computePhysicalScale
} from '../src/weapon-physicality.js';

test('every firearm has explicit kg and three-dimensional meter size', () => {
  for (const key of WEAPON_ORDER) {
    const cfg = GAME_CONFIG.weapons[key];
    const size = getWeaponPhysicalSize(cfg);
    assert.ok(getWeaponMassKg(cfg) > 0, key);
    assert.ok(size.width > 0, key);
    assert.ok(size.height > 0, key);
    assert.ok(size.length > 0, key);
  }
});

test('weapon class masses are ordered from compact to heavy', () => {
  const w = GAME_CONFIG.weapons;
  assert.ok(w.compactSMG.massKg < w.mechanicalAR.massKg);
  assert.ok(w.mechanicalAR.massKg < w.pumpShotgun.massKg);
  assert.ok(w.pumpShotgun.massKg < w.marksmanSniper.massKg);
});

test('weapon class lengths keep distinct silhouettes', () => {
  const w = GAME_CONFIG.weapons;
  assert.ok(w.compactSMG.physicalSizeM.length < w.mechanicalAR.physicalSizeM.length);
  assert.ok(w.mechanicalAR.physicalSizeM.length < w.pumpShotgun.physicalSizeM.length);
  assert.ok(w.pumpShotgun.physicalSizeM.length < w.marksmanSniper.physicalSizeM.length);
});

test('heavier weapons have slower visual response', () => {
  assert.ok(responseScaleFromKg(2.8) > responseScaleFromKg(3.5));
  assert.ok(responseScaleFromKg(3.5) > responseScaleFromKg(3.8));
  assert.ok(responseScaleFromKg(3.8) > responseScaleFromKg(9.5));
});

test('handling mass is bounded for extreme data', () => {
  assert.equal(handlingMassFromKg(0.01), 0.72);
  assert.equal(handlingMassFromKg(999), 1.95);
});


test('bounding-box scaling lands exactly on configured dimensions', () => {
  const scale = computePhysicalScale(
    { width: 0.48, height: 0.60, length: 1.32 },
    { width: 0.24, height: 0.30, length: 0.66 },
    1
  );

  assert.equal(scale.x, 0.5);
  assert.equal(scale.y, 0.5);
  assert.equal(scale.z, 0.5);

  const pickup = computePhysicalScale(
    { width: 0.48, height: 0.60, length: 1.32 },
    { width: 0.24, height: 0.30, length: 0.66 },
    1.25
  );

  assert.equal(pickup.z, 0.625);
});


test('heavy sniper shoulders slower without becoming slow-motion', () => {
  const ar = responseScaleFromKg(3.5);
  const sniper = responseScaleFromKg(9.5);
  assert.ok(sniper < ar * 0.80);
  assert.ok(sniper > ar * 0.60);
});
