import test from 'node:test';
import assert from 'node:assert/strict';
import { KNIFE_HAND_GRIP } from '../src/knife-grip.js';

test('knife uses a neutral forward grip rather than a quarter-turn wrist twist', () => {
  assert.ok(Math.abs(KNIFE_HAND_GRIP.rotation.z) < 0.35);
  assert.ok(Math.abs(KNIFE_HAND_GRIP.rotation.x) < 0.20);
});

test('knife handle center sits in the palm along the hand axis', () => {
  const fangSocketZ = 0.055;
  const modelInternalScale = 0.78;
  const handleCenterLocalZ = 0.25;
  const handleCenterOffset =
    handleCenterLocalZ *
    modelInternalScale *
    KNIFE_HAND_GRIP.scale *
    Math.cos(KNIFE_HAND_GRIP.rotation.x);

  const handleCenterFromHand =
    fangSocketZ +
    KNIFE_HAND_GRIP.position.z +
    handleCenterOffset;

  assert.ok(
    Math.abs(handleCenterFromHand) < 0.015,
    `handle center is ${handleCenterFromHand.toFixed(4)}m from palm center`
  );
});

test('knife size is unchanged by the grip correction', () => {
  assert.equal(KNIFE_HAND_GRIP.scale, 0.46);
});
