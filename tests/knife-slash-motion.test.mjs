import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sampleKnifeReady,
  sampleKnifeSlash
} from '../src/knife-slash-motion.js';

test('knife ready stance is bladed, outside the torso and forward-gripped', () => {
  const ready = sampleKnifeReady(0);
  assert.ok(ready.hand.right > 0.32);
  assert.ok(ready.hand.up < -0.22);
  assert.ok(ready.hand.forward < 0.22);
  assert.ok(Math.abs(ready.chest.y) > 0.08);
  assert.ok(ready.blade.forward > 0.97);
  assert.ok(ready.blade.up > 0);
});

test('knife sprint stance lowers and moves farther outside the torso', () => {
  const ready = sampleKnifeReady(0);
  const sprint = sampleKnifeReady(1);
  assert.ok(sprint.hand.right > ready.hand.right);
  assert.ok(sprint.hand.up < ready.hand.up);
  assert.ok(sprint.hand.forward < ready.hand.forward);
  assert.ok(sprint.blade.forward > 0.95);
});

test('primary attack has three distinct slash variants', () => {
  const a = sampleKnifeSlash(0.40, 0);
  const b = sampleKnifeSlash(0.40, 1);
  const c = sampleKnifeSlash(0.40, 2);

  assert.equal(a.variant, 0);
  assert.equal(b.variant, 1);
  assert.equal(c.variant, 2);
  assert.notEqual(
    Math.sign(a.blade.right),
    Math.sign(b.blade.right)
  );
  assert.ok(c.blade.up < a.blade.up);
});

test('primary cuts travel visibly across the torso', () => {
  const aWind = sampleKnifeSlash(0.16, 0);
  const aFollow = sampleKnifeSlash(0.56, 0);
  const bWind = sampleKnifeSlash(0.16, 1);
  const bFollow = sampleKnifeSlash(0.56, 1);

  assert.ok(aWind.hand.right - aFollow.hand.right > 0.95);
  assert.ok(bFollow.hand.right - bWind.hand.right > 0.80);
  assert.ok(Math.abs(sampleKnifeSlash(0.40, 0).blade.right) > 0.45);
  assert.ok(Math.abs(sampleKnifeSlash(0.40, 1).blade.right) > 0.45);
});

test('third slash reads as a strong diagonal finisher', () => {
  const wind = sampleKnifeSlash(0.16, 2);
  const follow = sampleKnifeSlash(0.56, 2);

  assert.ok(wind.hand.up - follow.hand.up > 0.75);
  assert.ok(wind.hand.right - follow.hand.right > 0.80);
});

test('combo chain point lands exactly on ready pose', () => {
  const ready = sampleKnifeReady(0);
  for (let variant = 0; variant < 3; variant += 1) {
    const chain = sampleKnifeSlash(0.72, variant);
    assert.equal(chain.hand.right, ready.hand.right);
    assert.equal(chain.hand.up, ready.hand.up);
    assert.equal(chain.hand.forward, ready.hand.forward);
  }
});

test('fast primary slash has a visual contact window', () => {
  assert.equal(sampleKnifeSlash(0.18, 0).hitActive, false);
  assert.equal(sampleKnifeSlash(0.30, 0).hitActive, true);
  assert.equal(sampleKnifeSlash(0.50, 0).hitActive, true);
  assert.equal(sampleKnifeSlash(0.58, 0).hitActive, false);
});

test('slash recovers cleanly into ready stance', () => {
  assert.ok(sampleKnifeSlash(0.42, 0).attackWeight > 0.95);
  assert.ok(sampleKnifeSlash(0.95, 0).attackWeight < 0.10);
  assert.equal(sampleKnifeSlash(1, 0).attackWeight, 0);
});
