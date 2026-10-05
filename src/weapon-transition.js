// Shared deterministic timing for weapon carry <-> combat transitions.
// These helpers intentionally stay independent from Three.js so they can be
// tested without the renderer.
const TRANSITION_PROFILES = Object.freeze({
  ar: Object.freeze({
    lift: 0.020,
    forward: -0.014,
    right: -0.004,
    pitch: -0.013,
    yaw: 0.005,
    roll: -0.019,
    settleLift: 0.0045,
    settleForward: -0.0040,
    settlePitch: 0.0080,
    settleRoll: 0.0060,
    bodyPitch: 0.0070,
    directionResponse: 18
  }),
  smg: Object.freeze({
    lift: 0.016,
    forward: -0.011,
    right: -0.003,
    pitch: -0.011,
    yaw: 0.007,
    roll: -0.016,
    settleLift: 0.0035,
    settleForward: -0.0030,
    settlePitch: 0.0060,
    settleRoll: 0.0050,
    bodyPitch: 0.0050,
    directionResponse: 23
  }),
  shotgun: Object.freeze({
    lift: 0.029,
    forward: -0.020,
    right: -0.005,
    pitch: -0.021,
    yaw: 0.004,
    roll: -0.025,
    settleLift: 0.0065,
    settleForward: -0.0055,
    settlePitch: 0.0110,
    settleRoll: 0.0080,
    bodyPitch: 0.0100,
    directionResponse: 14
  }),
  sniper: Object.freeze({
    lift: 0.034,
    forward: -0.024,
    right: -0.006,
    pitch: -0.019,
    yaw: 0.003,
    roll: -0.020,
    settleLift: 0.0075,
    settleForward: -0.0065,
    settlePitch: 0.0125,
    settleRoll: 0.0070,
    bodyPitch: 0.0120,
    directionResponse: 12
  })
});

export function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function weaponRaiseBlend(value) {
  const x = clamp01(value);
  // Smootherstep keeps velocity and acceleration calm at both endpoints.
  return x * x * x * (x * (x * 6 - 15) + 10);
}

export function weaponTransitionArc(value) {
  const x = clamp01(value);
  return Math.sin(Math.PI * x);
}

export function weaponTransitionSettle(value) {
  const x = clamp01(value);
  // Positive early, negative late, and exactly zero at carry/combat endpoints.
  // This adds a tiny anticipation + stock-plant settle without changing the
  // calibrated final pose.
  return Math.sin(Math.PI * x) * Math.sin(Math.PI * 2 * x);
}

export function dampTransitionDirection(
  current,
  raising,
  response,
  dt
) {
  const target = raising ? 1 : -1;
  const safeCurrent = Number.isFinite(current) ? current : target;
  const safeResponse = Math.max(0, Number.isFinite(response) ? response : 0);
  const safeDt = Math.max(0, Number.isFinite(dt) ? dt : 0);
  return target + (safeCurrent - target) * Math.exp(-safeResponse * safeDt);
}

export function getWeaponTransitionProfile(poseClass = 'ar') {
  return TRANSITION_PROFILES[poseClass] ?? TRANSITION_PROFILES.ar;
}
