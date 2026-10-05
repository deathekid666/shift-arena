import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isAuthoredSlideOwnershipActive
} from '../src/weapon-slide-ownership.js';

test('physics slide owns the weapon immediately', () => {
  assert.equal(
    isAuthoredSlideOwnershipActive(
      true,
      null
    ),
    true
  );
});

test('authored slide start loop and exit all retain ownership', () => {
  for (const state of [
    'SLIDE_START',
    'SLIDE_LOOP',
    'SLIDE_EXIT'
  ]) {
    assert.equal(
      isAuthoredSlideOwnershipActive(
        false,
        {
          state,
          slideExitActive: false,
          slideExitTail: 0
        }
      ),
      true,
      state
    );
  }
});

test('slide exit active flag retains ownership even after physics slide ends', () => {
  assert.equal(
    isAuthoredSlideOwnershipActive(
      false,
      {
        state: 'WALK',
        slideExitActive: true,
        slideExitTail: 0
      }
    ),
    true
  );
});

test('authored exit tail retains ownership until the tail is effectively finished', () => {
  assert.equal(
    isAuthoredSlideOwnershipActive(
      false,
      {
        state: 'WALK',
        slideExitActive: false,
        slideExitTail: 0.40
      }
    ),
    true
  );

  assert.equal(
    isAuthoredSlideOwnershipActive(
      false,
      {
        state: 'WALK',
        slideExitActive: false,
        slideExitTail: 0.01
      }
    ),
    false
  );
});

test('normal locomotion does not claim slide ownership', () => {
  assert.equal(
    isAuthoredSlideOwnershipActive(
      false,
      {
        state: 'RUN',
        slideExitActive: false,
        slideExitTail: 0
      }
    ),
    false
  );
});
