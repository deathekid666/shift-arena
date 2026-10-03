import * as THREE from 'three';

// Fortnite-style low skid pose applied after locomotion.
// Lower body only: weapon/Fang upper-body layers remain free to aim/fire.
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
      target > blend ? 18 : 11,
      dt
    );

    if (blend < 0.003) return;

    restore();
    for (const node of nodes) {
      underlyingQ.set(node, node.quaternion.clone());
      underlyingP.set(node, node.position.clone());
    }

    root.updateWorldMatrix(true, true);

    const rootQ = root.getWorldQuaternion(new THREE.Quaternion());
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(rootQ).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rootQ).normalize();

    const leftFootBase = b.leftFoot.getWorldPosition(new THREE.Vector3());
    const rightFootBase = b.rightFoot.getWorldPosition(new THREE.Vector3());
    const leftFootQ = b.leftFoot.getWorldQuaternion(new THREE.Quaternion());
    const rightFootQ = b.rightFoot.getWorldQuaternion(new THREE.Quaternion());

    // Pelvis drops hard and shifts backward. This creates the low-profile slide
    // silhouette instead of looking like a crouch that happens to move fast.
    const baseHip = underlyingP.get(b.hips);
    b.hips.position.copy(baseHip);
    b.hips.position.y -= 0.34 * blend;
    b.hips.position.z += 0.13 * blend;

    rotateLocal(b.hips, underlyingQ.get(b.hips), 0.16 * blend, 0, 0);
    if (b.spine) {
      rotateLocal(b.spine, underlyingQ.get(b.spine), -0.16 * blend, 0, 0);
    }
    if (b.chest) {
      rotateLocal(b.chest, underlyingQ.get(b.chest), -0.06 * blend, 0, 0);
    }

    root.updateWorldMatrix(true, true);

    // Character slides with right leg extended forward and left leg tucked.
    // Targets are world-space so this works regardless of VRM bone axes.
    const rightTarget = rightFootBase.clone()
      .addScaledVector(forward, 0.31 * blend)
      .addScaledVector(right, 0.035 * blend);
    rightTarget.y += 0.012 * blend;

    const leftTarget = leftFootBase.clone()
      .addScaledVector(forward, -0.15 * blend)
      .addScaledVector(right, -0.10 * blend);
    leftTarget.y += 0.065 * blend;

    solveLeg(
      root,
      b.rightUpperLeg,
      b.rightLowerLeg,
      b.rightFoot,
      rightTarget,
      1,
      0.18
    );
    solveLeg(
      root,
      b.leftUpperLeg,
      b.leftLowerLeg,
      b.leftFoot,
      leftTarget,
      -1,
      0.44
    );

    // Extended leg stays flatter; tucked leg's toe rotates slightly inward.
    setWorldQuaternion(b.rightFoot, rightFootQ);
    const tuckedQ = leftFootQ.clone().multiply(
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-0.10 * blend, 0.10 * blend, 0)
      )
    );
    setWorldQuaternion(b.leftFoot, tuckedQ);

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
  node.quaternion.copy(baseQ).multiply(
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(x, y, z, 'XYZ')
    )
  );
}

function solveLeg(root, upper, lower, foot, targetFoot, side, tuck) {
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
    (a + b) * (0.96 - tuck * 0.12)
  );

  const rootQ = root.getWorldQuaternion(new THREE.Quaternion());
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(rootQ).normalize();
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rootQ).normalize();

  // Tucked leg gets a much stronger forward/outward knee pole.
  const pole = hip.clone()
    .addScaledVector(forward, 0.30 + tuck * 0.46)
    .addScaledVector(right, side * (0.12 + tuck * 0.12))
    .addScaledVector(new THREE.Vector3(0, -1, 0), 0.02 + tuck * 0.08);

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
  const current = child.getWorldPosition(new THREE.Vector3()).sub(origin).normalize();
  const desired = target.clone().sub(origin).normalize();

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
