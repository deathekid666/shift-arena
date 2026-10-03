import * as THREE from 'three';

// Absolute two-knee superhero slide.
// The slide is authored from the humanoid neutral pose instead of adding offsets
// on top of the current sprint frame. That prevents the sprint animation from
// cancelling knee flex and guarantees both legs stay visibly compressed.
export function createSlidePoseLayer(character) {
  const { bones: b, root, baseRotations, basePositions } = character;

  const nodes = [...new Set([
    b.hips, b.spine, b.chest,
    b.leftUpperLeg, b.leftLowerLeg, b.leftFoot,
    b.rightUpperLeg, b.rightLowerLeg, b.rightFoot
  ].filter(Boolean))];

  const underlyingQ = new Map();
  const underlyingP = new Map();
  let blend = 0;

  function restore() {
    for (const [node, q] of underlyingQ) node.quaternion.copy(q);
    for (const [node, p] of underlyingP) node.position.copy(p);
    underlyingQ.clear();
    underlyingP.clear();
  }

  function apply(state, dt) {
    const target = state?.sliding && state?.grounded !== false ? 1 : 0;

    blend = THREE.MathUtils.damp(
      blend,
      target,
      target > blend ? 28 : 12,
      dt
    );

    if (
      blend < 0.003 ||
      !b.hips ||
      !b.leftUpperLeg || !b.leftLowerLeg || !b.leftFoot ||
      !b.rightUpperLeg || !b.rightLowerLeg || !b.rightFoot
    ) {
      return;
    }

    restore();

    for (const node of nodes) {
      underlyingQ.set(node, node.quaternion.clone());
      underlyingP.set(node, node.position.clone());
    }

    const progress = THREE.MathUtils.clamp(
      state?.slideProgress ?? 0,
      0,
      1
    );

    // Reach the full readable silhouette almost immediately, then hold it.
    const enter = smooth01(
      THREE.MathUtils.clamp(progress / 0.045, 0, 1)
    );
    const exit = smooth01(
      THREE.MathUtils.clamp((1 - progress) / 0.13, 0, 1)
    );

    const poseBlend = THREE.MathUtils.clamp(
      blend * Math.min(enter, exit + 0.12),
      0,
      1
    );

    // Pelvis uses the neutral rig position, not the sprint bob position.
    const neutralHip =
      basePositions?.get(b.hips) ??
      underlyingP.get(b.hips);

    const targetHip = neutralHip.clone();
    targetHip.x += 0.035;
    targetHip.y -= 0.475;
    targetHip.z += 0.070;

    b.hips.position
      .copy(underlyingP.get(b.hips))
      .lerp(targetHip, poseBlend);

    // Compact superhero / Spider-Man-like body silhouette:
    // very low pelvis, both knees strongly flexed, asymmetric but neither leg
    // allowed to become a long straight support leg.
    applyAbsolutePose(
      b.hips,
      baseRotations?.get(b.hips),
      underlyingQ.get(b.hips),
      0.20,
      0.00,
      -0.08,
      poseBlend
    );

    applyAbsolutePose(
      b.spine,
      baseRotations?.get(b.spine),
      underlyingQ.get(b.spine),
      -0.13,
      0.00,
      0.055,
      poseBlend
    );

    applyAbsolutePose(
      b.chest,
      baseRotations?.get(b.chest),
      underlyingQ.get(b.chest),
      -0.06,
      0.00,
      0.035,
      poseBlend
    );

    // Lead / left leg:
    // thigh lifted toward torso, knee around a deep right angle, foot kept
    // relatively close instead of reaching out into a straight leg.
    applyAbsolutePose(
      b.leftUpperLeg,
      baseRotations?.get(b.leftUpperLeg),
      underlyingQ.get(b.leftUpperLeg),
      -1.20,
      -0.10,
      -0.30,
      poseBlend
    );

    applyAbsolutePose(
      b.leftLowerLeg,
      baseRotations?.get(b.leftLowerLeg),
      underlyingQ.get(b.leftLowerLeg),
      1.68,
      0.00,
      0.06,
      poseBlend
    );

    applyAbsolutePose(
      b.leftFoot,
      baseRotations?.get(b.leftFoot),
      underlyingQ.get(b.leftFoot),
      -0.42,
      0.04,
      -0.05,
      poseBlend
    );

    // Rear / right leg:
    // knee tucked under and opened slightly to the side, with even stronger
    // shin folding so it can never read as a straight trailing leg.
    applyAbsolutePose(
      b.rightUpperLeg,
      baseRotations?.get(b.rightUpperLeg),
      underlyingQ.get(b.rightUpperLeg),
      -1.02,
      0.16,
      0.40,
      poseBlend
    );

    applyAbsolutePose(
      b.rightLowerLeg,
      baseRotations?.get(b.rightLowerLeg),
      underlyingQ.get(b.rightLowerLeg),
      1.82,
      0.00,
      -0.09,
      poseBlend
    );

    applyAbsolutePose(
      b.rightFoot,
      baseRotations?.get(b.rightFoot),
      underlyingQ.get(b.rightFoot),
      -0.70,
      -0.06,
      0.09,
      poseBlend
    );

    root.updateWorldMatrix(true, true);
  }

  return { apply, restore };
}

function applyAbsolutePose(
  node,
  neutralQ,
  currentQ,
  x,
  y,
  z,
  blend
) {
  if (!node || !currentQ) return;

  const baseQ = neutralQ ?? currentQ;

  const targetQ = baseQ.clone().multiply(
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(x, y, z, 'XYZ')
    )
  );

  node.quaternion.copy(currentQ).slerp(targetQ, blend);
}

function smooth01(t) {
  return t * t * (3 - 2 * t);
}
