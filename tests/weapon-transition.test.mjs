import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clamp01,
  weaponRaiseBlend,
  weaponTransitionArc,
  getWeaponTransitionProfile
} from '../src/weapon-transition.js';

test('weapon raise blend clamps and preserves endpoints', () => {
  assert.equal(clamp01(-2), 0);
  assert.equal(clamp01(2), 1);
  assert.equal(weaponRaiseBlend(0), 0);
  assert.equal(weaponRaiseBlend(1), 1);
});

test('weapon raise blend is monotonic', () => {
  let previous = -1;
  for (let i = 0; i <= 100; i += 1) {
    const value = weaponRaiseBlend(i / 100);
    assert.ok(value >= previous);
    previous = value;
  }
});

test('transition arc is zero at endpoints and peaks at mid transition', () => {
  assert.ok(Math.abs(weaponTransitionArc(0)) < 1e-12);
  assert.ok(Math.abs(weaponTransitionArc(1)) < 1e-12);
  assert.ok(weaponTransitionArc(0.5) > 0.999);
});

test('weapon classes keep distinct transition weights', () => {
  const ar = getWeaponTransitionProfile('ar');
  const smg = getWeaponTransitionProfile('smg');
  const shotgun = getWeaponTransitionProfile('shotgun');
  const sniper = getWeaponTransitionProfile('sniper');

  assert.ok(smg.lift < ar.lift);
  assert.ok(shotgun.lift > ar.lift);
  assert.ok(sniper.lift > shotgun.lift);
  assert.equal(getWeaponTransitionProfile('unknown'), ar);
});
