import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sampleKnifeSlash
} from '../src/knife-slash-motion.js';

test('knife slash has anticipation strike follow and recovery phases', () => {
  assert.equal(
    sampleKnifeSlash(0.08).phase,
    'anticipation'
  );
  assert.equal(
    sampleKnifeSlash(0.30).phase,
    'strike'
  );
  assert.equal(
    sampleKnifeSlash(0.54).phase,
    'follow'
  );
  assert.equal(
    sampleKnifeSlash(0.82).phase,
    'recovery'
  );
});

test('knife slash keeps a multi-frame contact window', () => {
  assert.equal(
    sampleKnifeSlash(0.20).hitActive,
    false
  );
  assert.equal(
    sampleKnifeSlash(0.32).hitActive,
    true
  );
  assert.equal(
    sampleKnifeSlash(0.50).hitActive,
    true
  );
  assert.equal(
    sampleKnifeSlash(0.63).hitActive,
    false
  );
});

test('strike travels across the body and forward', () => {
  const windup =
    sampleKnifeSlash(0.18);
  const contact =
    sampleKnifeSlash(0.46);
  const follow =
    sampleKnifeSlash(0.64);

  assert.ok(
    windup.hand.right > 0.35
  );
  assert.ok(
    contact.hand.forward > 0.65
  );
  assert.ok(
    follow.hand.right < -0.30
  );
});

test('slash fades cleanly back into locomotion', () => {
  assert.ok(
    sampleKnifeSlash(0.45)
      .attackWeight >
      0.95
  );
  assert.ok(
    sampleKnifeSlash(0.95)
      .attackWeight <
      0.10
  );
  assert.equal(
    sampleKnifeSlash(1)
      .attackWeight,
    0
  );
});
