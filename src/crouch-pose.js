import * as THREE from 'three';

// World-space crouch layer. Feet are treated as planted targets, pelvis moves
// down/back, and each thigh/knee chain is solved back to the foot target.
// This avoids rig-axis-specific Euler guesses that can leave legs visually straight.
export function createCrouchPoseLayer(character) {
  const { bones: b, root } = character;
  const nodes = [...new Set([
    b.hips, b.spine, b.chest,
    b.leftUpperLeg, b.leftLowerLeg, b.leftFoot,
    b.rightUpperLeg, b.rightLowerLeg, b.rightFoot
  ].filter(Boolean))];

  const underlyingQ = new Map();
  const underlyingP = new Map();

  const tmp = {
    leftFoot: new THREE.Vector3(),
    rightFoot: new THREE.Vector3(),
    leftFootQ: new THREE.Quaternion(),
    rightFootQ: new THREE.Quaternion(),
    hipsBase: new THREE.Vector3(),
    rootQ: new THREE.Quaternion(),
    forward: new THREE.Vector3(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0)
  };

  function restore() {
    for (const [node, q] of underlyingQ) node.quaternion.copy(q);
    for (const [node, p] of underlyingP) node.position.copy(p);
    underlyingQ.clear();
    underlyingP.clear();
  }

  function apply(state, dt) {
    const blend = THREE.MathUtils.clamp(state?.crouchBlend ?? 0, 0, 1);
    const authoredState = character.authoredLocomotion?.state;
    const authoredCrouch =
      character.authoredLocomotion?.ready &&
      character.authoredLocomotion?.active &&
      (authoredState === 'CROUCH' || authoredState === 'CROUCH_WALK');

    // The authored Quaternius crouch clips are the primary path. Keep this
    // procedural IK layer only as a fallback if authored locomotion failed.
    if (
      authoredCrouch ||
      blend <= 0.001 ||
      state?.sliding ||
      state?.grounded === false ||
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

    root.updateWorldMatrix(true, true);

    // Capture standing/current foot positions before lowering the pelvis.
    b.leftFoot.getWorldPosition(tmp.leftFoot);
    b.rightFoot.getWorldPosition(tmp.rightFoot);
    b.leftFoot.getWorldQuaternion(tmp.leftFootQ);
    b.rightFoot.getWorldQuaternion(tmp.rightFootQ);

    root.getWorldQuaternion(tmp.rootQ);
    tmp.forward.set(0, 0, -1).applyQuaternion(tmp.rootQ).normalize();
    tmp.right.set(1, 0, 0).applyQuaternion(tmp.rootQ).normalize();

    const speed = Math.max(0, state.speed ?? 0);
    const moving = speed > 0.32;
    const phase = character.locomotion?.phase ?? 0;
    const localStrafe = THREE.MathUtils.clamp(state.localX ?? 0, -1, 1);

    // Keep feet apart like a real athletic crouch.
    const stance = 0.035 * blend;
    tmp.leftFoot.addScaledVector(tmp.right, -stance);
    tmp.rightFoot.addScaledVector(tmp.right, stance);

    // Real crouch gait: alternating planted steps with visible knee travel,
    // heel/toe roll and lateral weight transfer. This replaces the old tiny
    // 5 cm foot shuffle that looked like the character was gliding.
    let leftStep = 0;
    let rightStep = 0;
    let leftLift = 0;
    let rightLift = 0;
    let stridePhase = 0;

    if (moving) {
      const speed01 = THREE.MathUtils.clamp(speed / 2.8, 0, 1);
      const stride = THREE.MathUtils.lerp(0.10, 0.16, speed01) * blend;
      const lift = THREE.MathUtils.lerp(0.030, 0.055, speed01) * blend;
      const s = Math.sin(phase);
      const c = Math.cos(phase);

      leftStep = s * stride;
      rightStep = -s * stride;
      leftLift = Math.max(0, -c) * lift;
      rightLift = Math.max(0, c) * lift;
      stridePhase = c;

      tmp.leftFoot.addScaledVector(tmp.forward, leftStep);
      tmp.rightFoot.addScaledVector(tmp.forward, rightStep);
      tmp.leftFoot.y += leftLift;
      tmp.rightFoot.y += rightLift;

      // Natural crouch strafe: widen the outside foot and let the inside foot
      // cross less, rather than translating both feet equally.
      const strafeStep = localStrafe * 0.045 * blend;
      tmp.leftFoot.addScaledVector(tmp.right, strafeStep - localStrafe * 0.018 * s);
      tmp.rightFoot.addScaledVector(tmp.right, strafeStep + localStrafe * 0.018 * s);
    }

    // Lower pelvis substantially, but feet remain planted by IK.
    const baseHipPos = underlyingP.get(b.hips);
    b.hips.position.copy(baseHipPos);

    const crouchStepBob = moving
      ? Math.abs(Math.sin(phase * 2)) * 0.014 * blend
      : 0;
    const crouchHipSway = moving
      ? Math.sin(phase) * 0.018 * blend
      : 0;

    b.hips.position.y -= 0.325 * blend;
    b.hips.position.y += crouchStepBob;
    b.hips.position.z += 0.070 * blend;
    b.hips.position.x += crouchHipSway;

    // Slight pelvis tuck and torso counter-lean for balance.
    rotateLocal(b.hips, underlyingQ.get(b.hips), -0.10 * blend, 0, 0);
    if (b.spine) {
      rotateLocal(
        b.spine,
        underlyingQ.get(b.spine),
        0.18 * blend,
        0,
        -localStrafe * 0.018 * blend +
          (moving ? Math.sin(phase) * 0.018 * blend : 0)
      );
    }
    if (b.chest) {
      rotateLocal(
        b.chest,
        underlyingQ.get(b.chest),
        0.07 * blend,
        0,
        -localStrafe * 0.012 * blend -
          (moving ? Math.sin(phase) * 0.012 * blend : 0)
      );
    }

    root.updateWorldMatrix(true, true);

    solveLeg(
      root,
      b.leftUpperLeg,
      b.leftLowerLeg,
      b.leftFoot,
      tmp.leftFoot,
      -1
    );
    solveLeg(
      root,
      b.rightUpperLeg,
      b.rightLowerLeg,
      b.rightFoot,
      tmp.rightFoot,
      1
    );

    // Heel/toe roll during crouch-walk. Stationary crouch remains planted flat.
    if (moving) {
      const leftRoll = THREE.MathUtils.clamp(leftStep * 1.4, -0.16, 0.16);
      const rightRoll = THREE.MathUtils.clamp(rightStep * 1.4, -0.16, 0.16);

      setWorldQuaternion(
        b.leftFoot,
        tmp.leftFootQ.clone().multiply(
          new THREE.Quaternion().setFromEuler(
            new THREE.Euler(leftRoll, 0, 0)
          )
        )
      );
      setWorldQuaternion(
        b.rightFoot,
        tmp.rightFootQ.clone().multiply(
          new THREE.Quaternion().setFromEuler(
            new THREE.Euler(rightRoll, 0, 0)
          )
        )
      );
    } else {
      setWorldQuaternion(b.leftFoot, tmp.leftFootQ);
      setWorldQuaternion(b.rightFoot, tmp.rightFootQ);
    }

    // Blend solved crouch over the underlying locomotion pose.
    for (const node of nodes) {
      const solvedQ = node.quaternion.clone();
      const baseQ = underlyingQ.get(node);
      if (baseQ) node.quaternion.copy(baseQ).slerp(solvedQ, blend);

      if (node === b.hips) {
        const solvedP = node.position.clone();
        const baseP = underlyingP.get(node);
        if (baseP) node.position.copy(baseP).lerp(solvedP, blend);
      }
    }

    root.updateWorldMatrix(true, true);
  }

  return { apply, restore };
}

function rotateLocal(node, baseQ, x, y, z) {
  if (!node || !baseQ) return;
  node.quaternion
    .copy(baseQ)
    .multiply(
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(x, y, z, 'XYZ')
      )
    );
}

function solveLeg(root, upper, lower, foot, targetFoot, side) {
  root.updateWorldMatrix(true, true);

  const hip = upper.getWorldPosition(new THREE.Vector3());
  const kneeNow = lower.getWorldPosition(new THREE.Vector3());
  const footNow = foot.getWorldPosition(new THREE.Vector3());

  const a = Math.max(0.001, hip.distanceTo(kneeNow));
  const b = Math.max(0.001, kneeNow.distanceTo(footNow));

  const toTarget = targetFoot.clone().sub(hip);
  let d = toTarget.length();
  if (d < 0.001) return;

  const dir = toTarget.normalize();
  d = THREE.MathUtils.clamp(
    d,
    Math.abs(a - b) + 0.003,
    (a + b) * 0.965
  );

  // Knee pole: forward and slightly outward, like an athletic game crouch.
  const rootQ = root.getWorldQuaternion(new THREE.Quaternion());
  const forward = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(rootQ)
    .normalize();
  const right = new THREE.Vector3(1, 0, 0)
    .applyQuaternion(rootQ)
    .normalize();

  const pole = hip.clone()
    .addScaledVector(forward, 0.45)
    .addScaledVector(right, side * 0.16)
    .addScaledVector(new THREE.Vector3(0, -1, 0), 0.06);

  const bend = pole.sub(hip);
  bend.addScaledVector(dir, -bend.dot(dir));
  if (bend.lengthSq() < 1e-6) bend.copy(forward);
  bend.normalize();

  const along = (a * a + d * d - b * b) / (2 * d);
  const height = Math.sqrt(Math.max(0, a * a - along * along));
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

  if (current.lengthSq() < 1e-6 || desired.lengthSq() < 1e-6) return;

  const delta = new THREE.Quaternion().setFromUnitVectors(current, desired);
  const worldQ = node.getWorldQuaternion(new THREE.Quaternion());
  setWorldQuaternion(node, delta.multiply(worldQ));
}

function setWorldQuaternion(node, worldQ) {
  const parentQ = node.parent
    ? node.parent.getWorldQuaternion(new THREE.Quaternion())
    : new THREE.Quaternion();
  node.quaternion.copy(parentQ.invert().multiply(worldQ));
  node.updateWorldMatrix(false, true);
}
