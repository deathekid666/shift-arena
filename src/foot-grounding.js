import * as THREE from 'three';

// Lower-body terrain contact layer for normal grounded locomotion only.
// It preserves authored swing-foot motion and solves only feet that are close
// enough to the floor to be considered planted.
export function createFootGroundingLayer(character) {
  const { bones: b, root } = character;
  const nodes = [
    b.leftUpperLeg, b.leftLowerLeg, b.leftFoot,
    b.rightUpperLeg, b.rightLowerLeg, b.rightFoot
  ].filter(Boolean);

  const savedQ = new Map();
  const clearance = { left: null, right: null };
  const offset = { left: 0, right: 0 };

  function restore() {
    for (const [node, q] of savedQ) node.quaternion.copy(q);
    savedQ.clear();
  }

  function reset() {
    offset.left = 0;
    offset.right = 0;
  }

  function apply(state, dt) {
    const crouchBlend = THREE.MathUtils.clamp(
      state?.crouchBlend ?? (state?.crouching ? 1 : 0),
      0,
      1
    );

    const enabled =
      state?.grounded !== false &&
      !state?.sliding &&
      crouchBlend < 0.02 &&
      typeof state?.groundHeightAt === 'function' &&
      b.leftUpperLeg && b.leftLowerLeg && b.leftFoot &&
      b.rightUpperLeg && b.rightLowerLeg && b.rightFoot;

    if (!enabled) {
      reset();
      return;
    }

    restore();
    for (const node of nodes) {
      savedQ.set(node, node.quaternion.clone());
    }

    root.updateWorldMatrix(true, true);

    solveSide(
      'left',
      b.leftUpperLeg,
      b.leftLowerLeg,
      b.leftFoot,
      -1,
      state,
      dt
    );

    solveSide(
      'right',
      b.rightUpperLeg,
      b.rightLowerLeg,
      b.rightFoot,
      1,
      state,
      dt
    );

    root.updateWorldMatrix(true, true);
  }

  function solveSide(key, upper, lower, foot, side, state, dt) {
    const animatedFoot = foot.getWorldPosition(new THREE.Vector3());
    const animatedFootQ = foot.getWorldQuaternion(new THREE.Quaternion());
    const groundY = state.groundHeightAt(
      animatedFoot.x,
      animatedFoot.z
    );

    if (!Number.isFinite(groundY)) {
      offset[key] = THREE.MathUtils.damp(
        offset[key],
        0,
        24,
        dt
      );
      return;
    }

    if (clearance[key] === null) {
      // Calibrate the ankle/sole clearance from the live avatar rather than
      // assuming the foot bone sits exactly on the sole.
      clearance[key] = THREE.MathUtils.clamp(
        animatedFoot.y - groundY,
        0,
        0.11
      );
    }

    const plantedY = groundY + clearance[key];
    const abovePlant = animatedFoot.y - plantedY;

    // Keep swing feet animation-driven. Only blend IK in as a foot approaches
    // contact, and always correct penetration strongly.
    const plantWeight = abovePlant <= 0
      ? 1
      : 1 - THREE.MathUtils.smoothstep(
          abovePlant,
          0.035,
          0.115
        );

    let desiredOffset =
      (plantedY - animatedFoot.y) *
      THREE.MathUtils.clamp(plantWeight, 0, 1);

    // A few millimeters of animation motion is intentional and should not
    // create another micro-jitter source.
    if (Math.abs(desiredOffset) < 0.006) {
      desiredOffset = 0;
    }

    desiredOffset = THREE.MathUtils.clamp(
      desiredOffset,
      -0.055,
      0.10
    );

    offset[key] = THREE.MathUtils.damp(
      offset[key],
      desiredOffset,
      desiredOffset > offset[key] ? 30 : 24,
      dt
    );

    if (Math.abs(offset[key]) < 0.0015) {
      offset[key] = 0;
      return;
    }

    const targetFoot = animatedFoot.clone();
    targetFoot.y += offset[key];

    const originalUpper = upper.quaternion.clone();
    const originalLower = lower.quaternion.clone();
    const originalFoot = foot.quaternion.clone();

    solveLeg(
      root,
      upper,
      lower,
      foot,
      targetFoot,
      side
    );

    const solvedUpper = upper.quaternion.clone();
    const solvedLower = lower.quaternion.clone();

    upper.quaternion
      .copy(originalUpper)
      .slerp(solvedUpper, plantWeight);
    lower.quaternion
      .copy(originalLower)
      .slerp(solvedLower, plantWeight);

    // Preserve the authored ankle orientation. The leg chain handles vertical
    // contact; slope-foot tilt can be added separately after this is validated.
    foot.quaternion.copy(originalFoot);
    setWorldQuaternion(foot, animatedFootQ);
  }

  return { apply, restore };
}

function solveLeg(root, upper, lower, foot, targetFoot, side) {
  root.updateWorldMatrix(true, true);

  const hip = upper.getWorldPosition(new THREE.Vector3());
  const kneeNow = lower.getWorldPosition(new THREE.Vector3());
  const footNow = foot.getWorldPosition(new THREE.Vector3());

  const upperLen = Math.max(0.001, hip.distanceTo(kneeNow));
  const lowerLen = Math.max(0.001, kneeNow.distanceTo(footNow));

  const toTarget = targetFoot.clone().sub(hip);
  let distance = toTarget.length();
  if (distance < 0.001) return;

  const dir = toTarget.normalize();

  distance = THREE.MathUtils.clamp(
    distance,
    Math.abs(upperLen - lowerLen) + 0.003,
    (upperLen + lowerLen) * 0.985
  );

  const rootQ = root.getWorldQuaternion(new THREE.Quaternion());
  const forward = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(rootQ)
    .normalize();
  const right = new THREE.Vector3(1, 0, 0)
    .applyQuaternion(rootQ)
    .normalize();

  const pole = hip.clone()
    .addScaledVector(forward, 0.52)
    .addScaledVector(right, side * 0.12);

  const bend = pole.sub(hip);
  bend.addScaledVector(dir, -bend.dot(dir));
  if (bend.lengthSq() < 1e-6) bend.copy(forward);
  bend.normalize();

  const along =
    (upperLen * upperLen + distance * distance - lowerLen * lowerLen) /
    (2 * distance);
  const height = Math.sqrt(
    Math.max(0, upperLen * upperLen - along * along)
  );

  const kneeTarget = hip.clone()
    .addScaledVector(dir, along)
    .addScaledVector(bend, height);

  pointBone(upper, lower, kneeTarget);
  root.updateWorldMatrix(true, true);
  pointBone(lower, foot, targetFoot);
  root.updateWorldMatrix(true, true);
}

function pointBone(node, child, target) {
  const origin = node.getWorldPosition(new THREE.Vector3());
  const current = child.getWorldPosition(new THREE.Vector3())
    .sub(origin)
    .normalize();
  const desired = target.clone()
    .sub(origin)
    .normalize();

  if (
    current.lengthSq() < 1e-6 ||
    desired.lengthSq() < 1e-6
  ) {
    return;
  }

  const delta = new THREE.Quaternion().setFromUnitVectors(
    current,
    desired
  );
  const worldQ = node.getWorldQuaternion(
    new THREE.Quaternion()
  );

  setWorldQuaternion(
    node,
    delta.multiply(worldQ)
  );
}

function setWorldQuaternion(node, worldQ) {
  const parentQ = node.parent
    ? node.parent.getWorldQuaternion(new THREE.Quaternion())
    : new THREE.Quaternion();

  node.quaternion.copy(
    parentQ.invert().multiply(worldQ)
  );
  node.updateWorldMatrix(false, true);
}
