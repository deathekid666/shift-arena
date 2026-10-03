import * as THREE from 'three';

// Hybrid crouch layer:
// - authored Quaternius clips provide the real step timing / foot travel
// - this layer lowers the pelvis and re-solves the legs to those authored feet
// - procedural foot shuffling is used only if authored locomotion is unavailable
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
    rootQ: new THREE.Quaternion(),
    forward: new THREE.Vector3(),
    right: new THREE.Vector3()
  };

  function restore() {
    for (const [node, q] of underlyingQ) node.quaternion.copy(q);
    for (const [node, p] of underlyingP) node.position.copy(p);
    underlyingQ.clear();
    underlyingP.clear();
  }

  function apply(state, dt) {
    const blend = THREE.MathUtils.clamp(state?.crouchBlend ?? 0, 0, 1);

    if (
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

    // Capture the ACTUAL animated foot locations before changing the pelvis.
    // When authored crouch is active, these are the real Quaternius step targets.
    b.leftFoot.getWorldPosition(tmp.leftFoot);
    b.rightFoot.getWorldPosition(tmp.rightFoot);
    b.leftFoot.getWorldQuaternion(tmp.leftFootQ);
    b.rightFoot.getWorldQuaternion(tmp.rightFootQ);

    root.getWorldQuaternion(tmp.rootQ);
    tmp.forward.set(0, 0, -1).applyQuaternion(tmp.rootQ).normalize();
    tmp.right.set(1, 0, 0).applyQuaternion(tmp.rootQ).normalize();

    const authoredState = character.authoredLocomotion?.state;
    if (String(authoredState ?? '').startsWith('SLIDE_')) return;

    const authoredCrouch =
      character.authoredLocomotion?.ready &&
      character.authoredLocomotion?.active &&
      blend > 0.025;

    const speed = Math.max(0, state.speed ?? 0);
    const moving = speed > 0.32;
    const phase = character.authoredLocomotion?.phase ??
      character.locomotion?.phase ??
      0;
    const localStrafe = THREE.MathUtils.clamp(state.localX ?? 0, -1, 1);

    // Keep a slightly wider athletic base. For authored crouch this is subtle:
    // the animation already owns the actual step path.
    const stance = authoredCrouch ? 0.018 : 0.035;
    tmp.leftFoot.addScaledVector(tmp.right, -stance);
    tmp.rightFoot.addScaledVector(tmp.right, stance);

    let leftStep = 0;
    let rightStep = 0;

    // Only synthesize a gait if the authored controller failed. Do NOT add
    // procedural stepping on top of a real animation.
    if (!authoredCrouch && moving) {
      const speed01 = THREE.MathUtils.clamp(speed / 2.8, 0, 1);
      const stride = THREE.MathUtils.lerp(0.10, 0.16, speed01);
      const lift = THREE.MathUtils.lerp(0.030, 0.055, speed01);
      const s = Math.sin(phase);
      const c = Math.cos(phase);

      leftStep = s * stride;
      rightStep = -s * stride;

      tmp.leftFoot.addScaledVector(tmp.forward, leftStep);
      tmp.rightFoot.addScaledVector(tmp.forward, rightStep);
      tmp.leftFoot.y += Math.max(0, -c) * lift;
      tmp.rightFoot.y += Math.max(0, c) * lift;

      const strafeStep = localStrafe * 0.045;
      tmp.leftFoot.addScaledVector(
        tmp.right,
        strafeStep - localStrafe * 0.018 * s
      );
      tmp.rightFoot.addScaledVector(
        tmp.right,
        strafeStep + localStrafe * 0.018 * s
      );
    }

    const baseHipPos = underlyingP.get(b.hips);
    b.hips.position.copy(baseHipPos);

    // 010.8C proved the authored clip was playing, but the recording showed
    // the pelvis still far too high. Lower the animated pelvis, then solve both
    // legs back to the animated feet. This forces visible knee flex without
    // replacing the animation's natural cadence.
    const extraDrop = authoredCrouch ? 0.205 : 0.305;
    const forwardShift = authoredCrouch ? 0.035 : 0.065;

    b.hips.position.y -= extraDrop;
    b.hips.position.z += forwardShift;

    // Subtle weight transfer only; the authored clip already contains its own.
    if (moving && !authoredCrouch) {
      b.hips.position.y +=
        Math.abs(Math.sin(phase * 2)) * 0.012;
      b.hips.position.x += Math.sin(phase) * 0.016;
    }

    // Add an athletic forward hinge on top of the animated pose.
    rotateLocal(
      b.hips,
      underlyingQ.get(b.hips),
      authoredCrouch ? -0.075 : -0.10,
      0,
      0
    );

    if (b.spine) {
      rotateLocal(
        b.spine,
        underlyingQ.get(b.spine),
        authoredCrouch ? 0.115 : 0.18,
        0,
        -localStrafe * 0.015
      );
    }

    if (b.chest) {
      rotateLocal(
        b.chest,
        underlyingQ.get(b.chest),
        authoredCrouch ? 0.045 : 0.07,
        0,
        -localStrafe * 0.010
      );
    }

    root.updateWorldMatrix(true, true);

    // Both legs solve to their current animated foot positions after the hip
    // drop. That is the key difference from the old fake crouch gait.
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

    // Preserve the authored foot roll exactly. Fallback keeps a small roll.
    if (authoredCrouch) {
      setWorldQuaternion(b.leftFoot, tmp.leftFootQ);
      setWorldQuaternion(b.rightFoot, tmp.rightFootQ);
    } else if (moving) {
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

    // Smooth transition into/out of the solved lower stance.
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

  const upperLen = Math.max(0.001, hip.distanceTo(kneeNow));
  const lowerLen = Math.max(0.001, kneeNow.distanceTo(footNow));

  const toTarget = targetFoot.clone().sub(hip);
  let distance = toTarget.length();
  if (distance < 0.001) return;

  const dir = toTarget.normalize();

  // Prevent the chain from ever reaching the nearly straight configuration
  // visible in the recording. A crouch leg should keep meaningful compression.
  distance = THREE.MathUtils.clamp(
    distance,
    Math.abs(upperLen - lowerLen) + 0.003,
    (upperLen + lowerLen) * 0.90
  );

  const rootQ = root.getWorldQuaternion(new THREE.Quaternion());
  const forward = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(rootQ)
    .normalize();
  const right = new THREE.Vector3(1, 0, 0)
    .applyQuaternion(rootQ)
    .normalize();

  const pole = hip.clone()
    .addScaledVector(forward, 0.48)
    .addScaledVector(right, side * 0.17)
    .addScaledVector(new THREE.Vector3(0, -1, 0), 0.045);

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
