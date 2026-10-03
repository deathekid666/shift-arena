import * as THREE from 'three';

// Tactical one-knee combat slide inspired by modern third-person shooters.
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
      target > blend ? 19 : 10,
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
    const forward = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(rootQ)
      .normalize();
    const right = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(rootQ)
      .normalize();

    const leftFootBase = b.leftFoot.getWorldPosition(new THREE.Vector3());
    const rightFootBase = b.rightFoot.getWorldPosition(new THREE.Vector3());
    const leftFootQ = b.leftFoot.getWorldQuaternion(new THREE.Quaternion());
    const rightFootQ = b.rightFoot.getWorldQuaternion(new THREE.Quaternion());

    const progress = THREE.MathUtils.clamp(state?.slideProgress ?? 0, 0, 1);

    // Fast drop into the knee slide, stable middle, softer recovery.
    const enter = smooth01(THREE.MathUtils.clamp(progress / 0.18, 0, 1));
    const exit = smooth01(
      THREE.MathUtils.clamp((1 - progress) / 0.20, 0, 1)
    );
    const phaseBlend = Math.min(enter, exit + 0.08);
    const poseBlend = THREE.MathUtils.clamp(blend * phaseBlend, 0, 1);

    // Low pelvis, but centered over the kneeling/right leg rather than thrown
    // far backward like the old skid pose.
    const baseHip = underlyingP.get(b.hips);
    b.hips.position.copy(baseHip);
    b.hips.position.y -= 0.31 * poseBlend;
    b.hips.position.z += 0.045 * poseBlend;
    b.hips.position.x += 0.035 * poseBlend;

    // Torso stays upright enough to keep a weapon-ready silhouette.
    rotateLocal(
      b.hips,
      underlyingQ.get(b.hips),
      0.08 * poseBlend,
      0,
      -0.03 * poseBlend
    );
    if (b.spine) {
      rotateLocal(
        b.spine,
        underlyingQ.get(b.spine),
        -0.055 * poseBlend,
        0,
        0.025 * poseBlend
      );
    }
    if (b.chest) {
      rotateLocal(
        b.chest,
        underlyingQ.get(b.chest),
        -0.025 * poseBlend,
        0,
        0.015 * poseBlend
      );
    }

    root.updateWorldMatrix(true, true);

    // Reference-style silhouette:
    // - right knee under the body, close to the floor
    // - right lower leg/foot trails backward
    // - left leg reaches forward-left with a strong but not locked knee bend
    const rightTarget = rightFootBase.clone()
      .addScaledVector(forward, -0.24 * poseBlend)
      .addScaledVector(right, 0.055 * poseBlend);
    rightTarget.y += 0.018 * poseBlend;

    const leftTarget = leftFootBase.clone()
      .addScaledVector(forward, 0.11 * poseBlend)
      .addScaledVector(right, -0.13 * poseBlend);
    leftTarget.y += 0.020 * poseBlend;

    solveLeg(
      root,
      b.rightUpperLeg,
      b.rightLowerLeg,
      b.rightFoot,
      rightTarget,
      1,
      {
        compression: 0.58,
        poleForward: 0.56,
        poleOut: 0.14,
        poleDown: 0.20
      }
    );

    solveLeg(
      root,
      b.leftUpperLeg,
      b.leftLowerLeg,
      b.leftFoot,
      leftTarget,
      -1,
      {
        compression: 0.48,
        poleForward: 0.50,
        poleOut: 0.20,
        poleDown: 0.12
      }
    );

    // Kneeling leg foot points backward naturally. Lead foot stays flatter.
    const kneelFootQ = rightFootQ.clone().multiply(
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          -0.18 * poseBlend,
          -0.05 * poseBlend,
          0.05 * poseBlend
        )
      )
    );
    setWorldQuaternion(b.rightFoot, kneelFootQ);

    const leadFootQ = leftFootQ.clone().multiply(
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          -0.04 * poseBlend,
          0.02 * poseBlend,
          -0.03 * poseBlend
        )
      )
    );
    setWorldQuaternion(b.leftFoot, leadFootQ);

    // Blend solved knee-slide over the underlying locomotion pose.
    for (const node of nodes) {
      const solvedQ = node.quaternion.clone();
      const baseQ = underlyingQ.get(node);
      if (baseQ) node.quaternion.copy(baseQ).slerp(solvedQ, poseBlend);

      if (node === b.hips) {
        const solvedP = node.position.clone();
        const baseP = underlyingP.get(node);
        if (baseP) node.position.copy(baseP).lerp(solvedP, poseBlend);
      }
    }

    root.updateWorldMatrix(true, true);
  }

  return { apply, restore };
}

function solveLeg(root, upper, lower, foot, targetFoot, side, options) {
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
  const compression = THREE.MathUtils.clamp(options.compression ?? 0.25, 0, 0.65);

  d = THREE.MathUtils.clamp(
    d,
    Math.abs(a - b) + 0.003,
    (a + b) * (0.97 - compression * 0.24)
  );

  const rootQ = root.getWorldQuaternion(new THREE.Quaternion());
  const forward = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(rootQ)
    .normalize();
  const right = new THREE.Vector3(1, 0, 0)
    .applyQuaternion(rootQ)
    .normalize();

  const pole = hip.clone()
    .addScaledVector(forward, options.poleForward ?? 0.36)
    .addScaledVector(right, side * (options.poleOut ?? 0.14))
    .addScaledVector(
      new THREE.Vector3(0, -1, 0),
      options.poleDown ?? 0.08
    );

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

function rotateLocal(node, baseQ, x, y, z) {
  if (!node || !baseQ) return;
  node.quaternion.copy(baseQ).multiply(
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(x, y, z, 'XYZ')
    )
  );
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

function smooth01(t) {
  return t * t * (3 - 2 * t);
}
