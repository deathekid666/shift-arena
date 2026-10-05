import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GAME_CONFIG,
  WEAPON_ORDER
} from '../src/config.js';

test('Tin Fang is lighter than every firearm', () => {
  const knifeMass =
    GAME_CONFIG.tinFang.massKg;

  assert.ok(
    Number.isFinite(knifeMass) &&
    knifeMass > 0
  );

  for (const key of WEAPON_ORDER) {
    assert.ok(
      knifeMass <
        GAME_CONFIG.weapons[key].massKg,
      `${key} should remain heavier than Tin Fang`
    );
  }
});

test('Tin Fang keeps full baseline mobility', () => {
  assert.deepEqual(
    GAME_CONFIG.tinFang.mobility,
    {
      walkSpeedMultiplier: 1,
      sprintSpeedMultiplier: 1,
      accelerationMultiplier: 1,
      turnResponseMultiplier: 1
    }
  );

  assert.equal(
    GAME_CONFIG.movement.sprintSpeed,
    8.4
  );
});
