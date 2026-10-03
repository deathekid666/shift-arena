import * as THREE from 'three';

// Lower-body-only layer. Weapon/Fang layers retain control of the torso/arms.
export function createJumpPoseLayer(character) {
  const { bones: b, baseRotations } = character;
  const saved = new Map();
  const airPose = new Map();
  const groundPose = new Map();
  const legs = [b.leftUpperLeg, b.rightUpperLeg, b.leftLowerLeg, b.rightLowerLeg, b.leftFoot, b.rightFoot];
  let hipPosition = null;
  let wasAirborne = false;
  let recovery = 1;
  let leadLeft = true;
  let stride = 0;
  const clamp = THREE.MathUtils.clamp;
  const lerp = THREE.MathUtils.lerp;
  const smooth = (v) => { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t); };
  function restore() {
    for (const [node, q] of saved) node.quaternion.copy(q);
    saved.clear();
    if (hipPosition && b.hips) b.hips.position.copy(hipPosition);
    hipPosition = null;
  }
  function apply(state, dt) {
    const airborne = state.grounded === false;
    if (airborne && !wasAirborne) {
      // Latch the takeoff gait: releasing sprint or steering cannot swap legs midair.
      stride = smooth((state.speed ?? 0) / 8.4);
      leadLeft = Math.sin(character.locomotion?.phase ?? 0) >= 0;
      for (const node of legs) if (node) airPose.set(node, (groundPose.get(node) ?? node.quaternion).clone());
      recovery = 0;
    }
    if (!airborne && wasAirborne) recovery = 0;
    const specialGroundPose = state.sliding || state.crouching || (state.crouchBlend ?? 0) > 0.01;
    const land = !airborne && !specialGroundPose
      ? Math.sin(Math.PI * clamp((state.landingTime ?? 1) / 0.18, 0, 1)) * (state.landingImpact ?? 0) : 0;
    if (!airborne) recovery = Math.min(1, recovery + dt / (specialGroundPose ? 0.08 : 0.16));

    const lift = smooth((state.airTime ?? 0) / 0.18);
    // Hold the split through the apex, then reach down progressively on descent.
    const reach = smooth((-(state.verticalSpeed ?? 0) - 1.5) / 11);
    const leadHip = lerp(lerp(-0.30, -0.62 - stride * 0.58, lift), -0.14, reach);
    const trailHip = lerp(lerp(0.12, 0.12 + stride * 0.42, lift), 0.05, reach);
    const leadKnee = lerp(lerp(0.30, 0.78 + stride * 0.30, lift), 0.23, reach);
    const trailKnee = lerp(lerp(0.22, 0.58 + stride * 0.42, lift), 0.18, reach);
    const spread = (0.07 + stride * 0.045) * (1 - reach * 0.5);
    const angles = [
      [leadLeft ? leadHip : trailHip, -spread],
      [leadLeft ? trailHip : leadHip, spread],
      [leadLeft ? leadKnee : trailKnee, 0],
      [leadLeft ? trailKnee : leadKnee, 0],
      [lerp(leadLeft ? -0.16 : -0.30, 0.03, reach), 0],
      [lerp(leadLeft ? -0.30 : -0.16, 0.03, reach), 0]
    ];
    legs.forEach((node, index) => {
      if (!node) return;
      if (!airborne) groundPose.set(node, node.quaternion.clone());
      if (!airborne && recovery >= 1 && land < 0.001) return;
      saved.set(node, node.quaternion.clone());
      if (airborne) {
        const [x, z] = angles[index];
        const target = (baseRotations.get(node) ?? new THREE.Quaternion()).clone()
          .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, 0, z)));
        const pose = airPose.get(node);
        pose.slerp(target, 1 - Math.exp(-22 * dt));
        node.quaternion.copy(pose);
      } else {
        const bend = index < 2 ? -0.24 : index < 4 ? 0.42 : -0.06;
        const target = node.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), bend * land));
        // Blend the final airborne pose into the moving gait, including early landings.
        node.quaternion.copy(airPose.get(node) ?? target).slerp(target, smooth(recovery));
      }
    });
    if (b.hips && land > 0) {
      hipPosition = b.hips.position.clone();
      b.hips.position.y -= 0.055 * land;
    }
    wasAirborne = airborne;
  }
  return { apply, restore };
}
