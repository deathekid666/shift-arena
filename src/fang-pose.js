import * as THREE from 'three';
import {
  sampleKnifeSlash
} from './knife-slash-motion.js';

const UP = new THREE.Vector3(0, 1, 0);
const smooth = (v) => { const t = THREE.MathUtils.clamp(v, 0, 1); return t * t * (3 - 2 * t); };

// An isolated visual layer: no capsule, weapon IK or ballistic state is changed.
// Targets are in arm-length units in a camera-facing frame; the elbow pole
// defines the bend plane instead of composing extreme Euler arm rotations.
export function createFangPoseLayer(character) {
  const { bones: b, baseRotations, root } = character;
  const chest = b.upperChest ?? b.chest;
  const nodes = [
    ...new Set([
      chest,
      b.rightShoulder,
      b.rightUpperArm,
      b.rightLowerArm,
      b.rightHand
    ].filter(Boolean))
  ];
  const underlying = new Map();
  let compactBlend = 0;
  const position = (node) => node.getWorldPosition(new THREE.Vector3());

  function restore() {
    for (const [node, q] of underlying) node.quaternion.copy(q);
    underlying.clear();
  }

  function apply(fang, dt) {
    if (!fang || !b.head || !b.rightUpperArm || !b.rightLowerArm || !b.rightHand) return;
    restore();
    for (const node of nodes) underlying.set(node, node.quaternion.clone());
    compactBlend = THREE.MathUtils.damp(
      compactBlend,
      fang.compact ? 1 : 0,
      22,
      dt
    );

    if (fang.mode === 'slash') {
      applySlashPose(
        fang
      );
      return;
    }

    const c = compactBlend;
    const releasing = fang.mode === 'release';
    const t = THREE.MathUtils.clamp(fang.t ?? 0, 0, 1);
    const release = fang.releaseMoment ?? 0.42;
    const wind = releasing ? smooth(t / (release * 0.43)) : 0;
    const drive = releasing ? smooth((t - release * 0.43) / (release * 0.57)) : 0;
    const follow = releasing ? smooth((t - release) / (0.74 - release)) : 0;
    const recover = releasing ? smooth((t - 0.74) / 0.26) : 0;
    const weight = releasing ? 1 - recover : smooth(fang.draw ?? 1);

    const forward = (fang.direction?.clone() ?? new THREE.Vector3(0, 0, -1)).normalize();
    const right = forward.clone().cross(UP).normalize();
    if (right.lengthSq() < 0.001) right.set(1, 0, 0);
    const horizontal = UP.clone().cross(right).normalize();
    const pitch = Math.asin(THREE.MathUtils.clamp(forward.y, -1, 1));
    const yaw = THREE.MathUtils.clamp(fang.aimYaw ?? 0, -1.18, 1.18);
    // Small clavicle lift and torso coil; solve the arm after these transforms.
    setOffset(chest, -pitch * 0.16, yaw * 0.42 + (0.16 + wind * 0.08) * (1 - drive) - follow * 0.12, 0.035 * (1 - drive));
    setOffset(b.rightShoulder, -0.06, -0.08 * (1 - drive), -0.16 * (1 - c * 0.65) * (1 - follow));
    root.updateWorldMatrix(true, true);

    const shoulder = position(b.rightUpperArm);
    const head = position(b.head);
    const upperLength = shoulder.distanceTo(position(b.rightLowerArm));
    const lowerLength = position(b.rightLowerArm).distanceTo(position(b.rightHand));
    const reach = upperLength + lowerLength;
    // Above/right/behind the head at rest. Compact stays beside the shoulder.
    const ready = head.clone().addScaledVector(right, reach * 0.38)
      .addScaledVector(UP, reach * 0.48)
      .addScaledVector(horizontal, -reach * 0.18);
    const tucked = shoulder.clone().addScaledVector(right, reach * 0.22)
      .addScaledVector(UP, reach * 0.12).addScaledVector(horizontal, -reach * 0.12);
    ready.lerp(tucked, c);
    // Pitch tracks the camera without lowering the open-space hand below head.
    ready.addScaledVector(forward.clone().sub(horizontal), reach * 0.12);
    const cocked = ready.clone().addScaledVector(horizontal, -reach * 0.12 * wind)
      .addScaledVector(UP, reach * 0.035 * wind * (1 - c));
    const releaseTarget = shoulder.clone().addScaledVector(forward, reach * 0.76)
      .addScaledVector(UP, reach * 0.24 * (1 - c)).addScaledVector(right, reach * 0.08);
    const end = shoulder.clone().addScaledVector(horizontal, reach * 0.61)
      .addScaledVector(UP, -reach * 0.46).addScaledVector(right, -reach * 0.12);
    const target = cocked.lerp(releaseTarget, drive).lerp(end, follow);
    // Elbow leads out/forward while the hand is still cocked, then extends.
    const pole = shoulder.clone().addScaledVector(right, reach * (0.72 - drive * 0.22))
      .addScaledVector(UP, reach * (0.64 * (1 - c) - follow * 0.50))
      .addScaledVector(horizontal, reach * (-0.06 + drive * 0.52));

    // Reset only this arm to a stable reference to avoid accumulated axial twist.
    for (const node of [b.rightUpperArm, b.rightLowerArm, b.rightHand]) {
      node.quaternion.copy(baseRotations.get(node) ?? new THREE.Quaternion());
    }
    root.updateWorldMatrix(true, true);
    solveArm(b.rightUpperArm, b.rightLowerArm, b.rightHand, target, pole, upperLength, lowerLength);

    // The attached Fang's blade points down local -Z (including its grip offset).
    const blade = forward.clone().addScaledVector(UP, 0.38 * (1 - drive) - follow * 0.75).normalize();
    const bladeRight = blade.clone().cross(UP).normalize();
    if (bladeRight.lengthSq() < 0.001) bladeRight.copy(right);
    const bladeUp = bladeRight.clone().cross(blade).normalize();
    const worldQ = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(bladeRight, bladeUp, blade.clone().negate())
    );
    const gripInverse = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.10, 0, Math.PI * 0.52)).invert();
    worldQ.multiply(gripInverse);
    setWorldQuaternion(b.rightHand, worldQ);
    // Fade to the current locomotion pose, not a frozen idle at throw end.
    for (const node of nodes) {
      const solved = node.quaternion.clone();
      node.quaternion.copy(underlying.get(node)).slerp(solved, weight);
    }
    root.updateWorldMatrix(true, true);
  }

  function applySlashPose(fang) {
    const slash =
      sampleKnifeSlash(
        fang.t ?? 0
      );

    const forward =
      (
        fang.direction?.clone() ??
        new THREE.Vector3(
          0,
          0,
          -1
        )
      );

    forward.y =
      THREE.MathUtils.clamp(
        forward.y,
        -0.45,
        0.45
      );

    forward.normalize();

    const right =
      forward
        .clone()
        .cross(UP)
        .normalize();

    if (
      right.lengthSq() <
      0.001
    ) {
      right.set(
        1,
        0,
        0
      );
    }

    const horizontal =
      UP
        .clone()
        .cross(right)
        .normalize();

    const underlyingChest =
      underlying.get(chest);

    if (
      chest &&
      underlyingChest
    ) {
      setRelativeOffset(
        chest,
        underlyingChest,
        slash.chest.x,
        slash.chest.y,
        slash.chest.z
      );
    }

    const underlyingShoulder =
      underlying.get(
        b.rightShoulder
      );

    if (
      b.rightShoulder &&
      underlyingShoulder
    ) {
      setRelativeOffset(
        b.rightShoulder,
        underlyingShoulder,
        slash.shoulder.x,
        slash.shoulder.y,
        slash.shoulder.z
      );
    }

    root.updateWorldMatrix(
      true,
      true
    );

    const shoulder =
      position(
        b.rightUpperArm
      );

    const upperLength =
      shoulder.distanceTo(
        position(
          b.rightLowerArm
        )
      );

    const lowerLength =
      position(
        b.rightLowerArm
      ).distanceTo(
        position(
          b.rightHand
        )
      );

    const reach =
      upperLength +
      lowerLength;

    const target =
      shoulder
        .clone()
        .addScaledVector(
          right,
          reach *
            slash.hand.right
        )
        .addScaledVector(
          UP,
          reach *
            slash.hand.up
        )
        .addScaledVector(
          horizontal,
          reach *
            slash.hand.forward
        );

    const pole =
      shoulder
        .clone()
        .addScaledVector(
          right,
          reach *
            slash.pole.right
        )
        .addScaledVector(
          UP,
          reach *
            slash.pole.up
        )
        .addScaledVector(
          horizontal,
          reach *
            slash.pole.forward
        );

    // Start from the locomotion pose for this frame, then solve the arm to the
    // slash target. No moving Euler target and no second damping spring.
    for (const node of [
      b.rightUpperArm,
      b.rightLowerArm,
      b.rightHand
    ]) {
      const base =
        underlying.get(node);

      if (base) {
        node.quaternion.copy(
          base
        );
      }
    }

    root.updateWorldMatrix(
      true,
      true
    );

    solveArm(
      b.rightUpperArm,
      b.rightLowerArm,
      b.rightHand,
      target,
      pole,
      upperLength,
      lowerLength
    );

    // Point the physical blade through the cut instead of twisting the wrist
    // around the knife's long axis.
    const blade =
      horizontal
        .clone()
        .multiplyScalar(
          slash.blade.forward
        )
        .addScaledVector(
          right,
          slash.blade.right
        )
        .addScaledVector(
          UP,
          slash.blade.up
        )
        .normalize();

    const bladeSide =
      right
        .clone()
        .addScaledVector(
          blade,
          -right.dot(blade)
        );

    if (
      bladeSide.lengthSq() <
      0.001
    ) {
      bladeSide
        .copy(
          blade
        )
        .cross(UP);
    }

    bladeSide.normalize();

    bladeSide.applyAxisAngle(
      blade,
      slash.edgeRoll
    );

    const bladeUp =
      bladeSide
        .clone()
        .cross(
          blade
        )
        .normalize();

    const worldQ =
      new THREE.Quaternion()
        .setFromRotationMatrix(
          new THREE.Matrix4()
            .makeBasis(
              bladeSide,
              bladeUp,
              blade
                .clone()
                .negate()
            )
        );

    const gripInverse =
      new THREE.Quaternion()
        .setFromEuler(
          new THREE.Euler(
            -0.10,
            0,
            Math.PI * 0.52
          )
        )
        .invert();

    worldQ.multiply(
      gripInverse
    );

    setWorldQuaternion(
      b.rightHand,
      worldQ
    );

    const weight =
      slash.attackWeight;

    for (const node of nodes) {
      const base =
        underlying.get(node);

      if (!base) continue;

      const solved =
        node.quaternion.clone();

      node.quaternion
        .copy(base)
        .slerp(
          solved,
          weight
        );
    }

    root.updateWorldMatrix(
      true,
      true
    );
  }

  function setRelativeOffset(
    node,
    base,
    x,
    y,
    z
  ) {
    if (!node || !base) return;

    node.quaternion
      .copy(base)
      .multiply(
        new THREE.Quaternion()
          .setFromEuler(
            new THREE.Euler(
              x,
              y,
              z,
              'XYZ'
            )
          )
      );
  }

  function setOffset(node, x, y, z) {
    if (!node) return;
    node.quaternion.copy(baseRotations.get(node) ?? new THREE.Quaternion())
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)));
  }

  return { apply, restore };
}

function setWorldQuaternion(node, worldQ) {
  const parentQ = node.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
  node.quaternion.copy(parentQ.invert().multiply(worldQ));
  node.updateWorldMatrix(false, true);
}

function pointBone(node, child, target) {
  const origin = node.getWorldPosition(new THREE.Vector3());
  const from = child.getWorldPosition(new THREE.Vector3()).sub(origin).normalize();
  const to = target.clone().sub(origin).normalize();
  const delta = new THREE.Quaternion().setFromUnitVectors(from, to);
  setWorldQuaternion(node, delta.multiply(node.getWorldQuaternion(new THREE.Quaternion())));
}

function solveArm(upper, lower, hand, target, pole, a, b) {
  const shoulder = upper.getWorldPosition(new THREE.Vector3());
  const direction = target.clone().sub(shoulder).normalize();
  // Keep a slight elbow bend, even at release; never stretch the skeleton.
  const distance = THREE.MathUtils.clamp(target.distanceTo(shoulder), Math.abs(a - b) + 0.002, (a + b) * 0.97);
  const reachable = shoulder.clone().addScaledVector(direction, distance);
  const bend = pole.clone().sub(shoulder);
  bend.addScaledVector(direction, -bend.dot(direction)).normalize();
  const along = (a * a + distance * distance - b * b) / (2 * distance);
  const elbow = shoulder.clone().addScaledVector(direction, along)
    .addScaledVector(bend, Math.sqrt(Math.max(0, a * a - along * along)));
  pointBone(upper, lower, elbow);
  pointBone(lower, hand, reachable);
}
