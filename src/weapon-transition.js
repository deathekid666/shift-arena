// Shared deterministic timing for weapon carry <-> combat transitions.
const TRANSITION_PROFILES = Object.freeze({
  ar: Object.freeze({ lift: 0.020, forward: -0.012, right: -0.004, pitch: -0.014, yaw: 0.006, roll: -0.020 }),
  smg: Object.freeze({ lift: 0.016, forward: -0.010, right: -0.003, pitch: -0.012, yaw: 0.008, roll: -0.018 }),
  shotgun: Object.freeze({ lift: 0.027, forward: -0.018, right: -0.005, pitch: -0.020, yaw: 0.004, roll: -0.024 }),
  sniper: Object.freeze({ lift: 0.032, forward: -0.022, right: -0.006, pitch: -0.018, yaw: 0.003, roll: -0.018 })
});

export function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function weaponRaiseBlend(value) {
  const x = clamp01(value);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

export function weaponTransitionArc(value) {
  return Math.sin(Math.PI * clamp01(value));
}

export function getWeaponTransitionProfile(poseClass = 'ar') {
  return TRANSITION_PROFILES[poseClass] ?? TRANSITION_PROFILES.ar;
}
