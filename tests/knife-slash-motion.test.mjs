import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sampleKnifeReady,
  sampleKnifeSlash
} from '../src/knife-slash-motion.js';

test('knife ready stance stays above the hanging leg pose', () => {
  const ready = sampleKnifeReady(0);
  assert.ok(ready.hand.up > -0.16);
  assert.ok(ready.hand.forward > 0.20);
  assert.ok(ready.blade.forward > 0.90);
});

test('knife sprint stance lowers but remains controlled', () => {
  const ready = sampleKnifeReady(0);
  const sprint = sampleKnifeReady(1);
  assert.ok(sprint.hand.up < ready.hand.up);
  assert.ok(sprint.hand.forward < ready.hand.forward);
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
