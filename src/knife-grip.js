// Shared knife-to-hand calibration.
//
// The Fang model's handle runs along local +Z and the blade runs local -Z.
// Keep this transform in one place so the rendered knife and the hand-pose
// solver can never disagree about how the character is gripping the weapon.
export const KNIFE_HAND_GRIP = Object.freeze({
  position: Object.freeze({
    x: 0.0,
    y: 0.012,
    // Centers the physical handle in the fist instead of placing the palm
    // near the guard/pommel. The Fang socket itself is +0.055 on hand Z.
    z: -0.145
  }),
  rotation: Object.freeze({
    // Small natural wrist pitch and only a slight roll. The old ~94 degree
    // roll made the palm look twisted around the handle.
    x: -0.08,
    y: 0.0,
    z: 0.18
  }),
  scale: 0.46
});
