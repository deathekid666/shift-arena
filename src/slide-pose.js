import * as THREE from 'three';

// Deterministic two-knee combat slide for normalized VRM humanoid bones.
// We intentionally do NOT solve the slide through foot-target IK: that solver
// could re-straighten one leg depending on target distance. The normalized VRM
// leg axes let us author the silhouette directly and guarantee both knees flex.
export function createSlidePoseLayer(character) {
  const { bones: b, root } = character;
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
      target > blend ? 22 : 11,
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

    const progress = THREE.MathUtils.clamp(state?.slideProgress ?? 0, 0, 1);

    // Snap into the readable silhouette quickly, hold it through the middle,
    // then blend out only near the end of the skid.
    const enter = smooth01(
      THREE.MathUtils.clamp(progress / 0.085, 0, 1)
    );
    const exit = smooth01(
      THREE.MathUtils.clamp((1 - progress) / 0.15, 0, 1)
    );
    const poseBlend = THREE.MathUtils.clamp(
      blend * Math.min(enter, exit + 0.10),
      0,
      1
    );

    const baseHip = underlyingP.get(b.hips);
    b.hips.position.copy(baseHip);
    b.hips.position.x += 0.025 * poseBlend;
    b.hips.position.y -= 0.39 * poseBlend;
    b.hips.position.z += 0.035 * poseBlend;

    // Pelvis and torso stay compact but weapon-ready.
    offsetLocal(b.hips, underlyingQ.get(b.hips), 0.13, 0, -0.045, poseBlend);
    offsetLocal(b.spine, underlyingQ.get(b.spine), -0.085, 0, 0.035, poseBlend);
    offsetLocal(b.chest, underlyingQ.get(b.chest), -0.035, 0, 0.020, poseBlend);

    // Lead / left leg: visibly bent, never near-locked.
    // Upper leg comes forward while the shin folds back under the knee.
    offsetLocal(
      b.leftUpperLeg,
      underlyingQ.get(b.leftUpperLeg),
      -0.92,
      -0.035,
      -0.12,
      poseBlend
    );
    offsetLocal(
      b.leftLowerLeg,
      underlyingQ.get(b.leftLowerLeg),
      0.94,
      0,
      0.035,
      poseBlend
    );
    offsetLocal(
      b.leftFoot,
      underlyingQ.get(b.leftFoot),
      -0.08,
      0.025,
      -0.025,
      poseBlend
    );

    // Rear / right leg: deep knee fold under the body. This is deliberately
    // stronger than the lead knee so the side/front silhouette reads clearly.
    offsetLocal(
      b.rightUpperLeg,
      underlyingQ.get(b.rightUpperLeg),
      -0.74,
      0.045,
      0.17,
      poseBlend
    );
    offsetLocal(
      b.rightLowerLeg,
      underlyingQ.get(b.rightLowerLeg),
      1.50,
      0,
      -0.055,
      poseBlend
    );
    offsetLocal(
      b.rightFoot,
      underlyingQ.get(b.rightFoot),
      -0.58,
      -0.055,
      0.07,
      poseBlend
    );

    root.updateWorldMatrix(true, true);
  }

  return { apply, restore };
}

function offsetLocal(node, baseQ, x, y, z, blend) {
  if (!node || !baseQ) return;

  const targetQ = baseQ.clone().multiply(
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(x, y, z, 'XYZ')
    )
  );

  node.quaternion.copy(baseQ).slerp(targetQ, blend);
}

function smooth01(t) {
  return t * t * (3 - 2 * t);
}
