import * as THREE from 'three';

// Lower-body-only layer. Weapon/Fang layers retain control of the torso/arms.
export function createJumpPoseLayer(character) {
  const { bones: b, baseRotations } = character;
  const saved = new Map();
  const airPose = new Map();
  let hipPosition = null;
  let wasAirborne = false;
  const clamp = THREE.MathUtils.clamp;
  const smooth = (v) => { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t); };
  function restore() {
    for (const [node, q] of saved) node.quaternion.copy(q);
    saved.clear();
    if (hipPosition && b.hips) b.hips.position.copy(hipPosition);
    hipPosition = null;
  }
  function apply(state, dt) {
    const airborne = state.grounded === false;
    const land = !airborne && !state.sliding && !state.crouching && (state.crouchBlend ?? 0) < 0.01 ? Math.sin(Math.PI * clamp((state.landingTime ?? 1) / 0.18, 0, 1)) * (state.landingImpact ?? 0) : 0;
    if (!airborne && land < 0.001) { wasAirborne = false; airPose.clear(); return; }
    const tuck = smooth((state.airTime ?? 0) / 0.14);
    const extend = smooth(-(state.verticalSpeed ?? 0) / 7.5);
    const targets = [
      [b.leftUpperLeg, THREE.MathUtils.lerp(-0.24 - tuck * 0.66, -0.18, extend), -0.035],
      [b.rightUpperLeg, THREE.MathUtils.lerp(-0.10 - tuck * 0.44, -0.10, extend), 0.035],
      [b.leftLowerLeg, THREE.MathUtils.lerp(0.32 + tuck * 0.98, 0.25, extend), 0],
      [b.rightLowerLeg, THREE.MathUtils.lerp(0.22 + tuck * 0.76, 0.20, extend), 0],
      [b.leftFoot, -0.10 + extend * 0.12, 0],
      [b.rightFoot, -0.08 + extend * 0.10, 0]
    ];
    for (const [node, x, z] of targets) {
      if (!node) continue;
      saved.set(node, node.quaternion.clone());
      if (airborne) {
        const target = (baseRotations.get(node) ?? new THREE.Quaternion()).clone()
          .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, 0, z)));
        const pose = wasAirborne && airPose.has(node) ? airPose.get(node) : node.quaternion.clone();
        pose.slerp(target, 1 - Math.exp(-24 * dt));
        airPose.set(node, pose);
        node.quaternion.copy(pose);
      } else {
        const bend = node === b.leftLowerLeg || node === b.rightLowerLeg ? 0.42 :
          node === b.leftUpperLeg || node === b.rightUpperLeg ? -0.24 : -0.06;
        node.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), bend * land));
      }
    }
    if (b.hips && land > 0) {
      hipPosition = b.hips.position.clone();
      b.hips.position.y -= 0.055 * land;
    }
    wasAirborne = airborne;
  }
  return { apply, restore };
}
