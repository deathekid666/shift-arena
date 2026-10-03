import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

// Temporary development avatar used only to validate the real VRM pipeline.
// Source: norio/vrm-game-starter (their README states the bundled VRoid sample
// avatars are redistributed under their own VRM metadata terms).
export const DEVELOPMENT_VRM_URL =
  'https://cdn.jsdelivr.net/gh/norio/vrm-game-starter@b14c236fd8150855348ad085b7820c298eac4b30/src/assets/sample2.vrm';

export async function loadRoachScoutVrmBase(url = DEVELOPMENT_VRM_URL) {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));

  const gltf = await loader.loadAsync(url);
  const vrm = gltf.userData.vrm;
  if (!vrm) throw new Error('Loaded avatar has no VRM metadata.');

  if (vrm.meta?.metaVersion === '0') VRMUtils.rotateVRM0(vrm);

  const root = new THREE.Group();
  root.name = 'RoachScoutVrmRoot';

  const modelRoot = new THREE.Group();
  modelRoot.name = 'RoachScoutVrmModel';
  root.add(modelRoot);
  modelRoot.add(vrm.scene);

  prepareAvatar(vrm.scene);
  fitAvatar(vrm.scene, modelRoot, 1.72);

  // VRM 1.x avatars use +Z as their authored front. SHIFT's weapon/camera
  // presentation uses -Z as character forward.
  modelRoot.rotation.y = Math.PI;

  const bones = {
    head: bone(vrm, 'head'),
    neck: bone(vrm, 'neck'),
    chest: bone(vrm, 'chest') ?? bone(vrm, 'upperChest'),
    upperChest: bone(vrm, 'upperChest') ?? bone(vrm, 'chest'),
    leftUpperArm: bone(vrm, 'leftUpperArm'),
    rightUpperArm: bone(vrm, 'rightUpperArm'),
    leftLowerArm: bone(vrm, 'leftLowerArm'),
    rightLowerArm: bone(vrm, 'rightLowerArm'),
    leftHand: bone(vrm, 'leftHand'),
    rightHand: bone(vrm, 'rightHand'),
    hips: bone(vrm, 'hips'),
    leftUpperLeg: bone(vrm, 'leftUpperLeg'),
    rightUpperLeg: bone(vrm, 'rightUpperLeg')
  };

  const baseRotations = new Map();
  for (const node of Object.values(bones)) {
    if (node) baseRotations.set(node, node.quaternion.clone());
  }

  const rightArmScale = bones.rightUpperArm?.scale.clone() ?? new THREE.Vector3(1, 1, 1);

  const accessories = attachRoachAccessories(bones);

  // Stable attachment points independent from the temporary avatar's mesh names.
  const weaponSocket = new THREE.Object3D();
  weaponSocket.name = 'weaponSocket';
  if (bones.rightHand) {
    weaponSocket.position.set(0, 0.025, 0.08);
    weaponSocket.rotation.set(-0.18, Math.PI, 0.12);
    bones.rightHand.add(weaponSocket);
  } else {
    weaponSocket.position.set(0.28, 0.18, -0.42);
    root.add(weaponSocket);
  }

  const fangSocket = new THREE.Object3D();
  fangSocket.name = 'fangSocket';
  if (bones.rightHand) {
    fangSocket.position.set(0, 0.02, 0.055);
    bones.rightHand.add(fangSocket);
  } else {
    root.add(fangSocket);
  }

  const headSocket = new THREE.Object3D();
  headSocket.name = 'headSocket';
  if (bones.head) bones.head.add(headSocket);
  else root.add(headSocket);

  applyIdlePose(bones, baseRotations, 1);

  return {
    root,
    modelRoot,
    vrm,
    bones,
    weaponSocket,
    fangSocket,
    headSocket,
    accessories,
    baseRotations,
    rightArmScale,
    update(dt, state = {}) {
      vrm.update(dt);
      updatePose(this, dt, state);
    },
    setVisible(visible) {
      root.visible = Boolean(visible);
    },
    setRightArmHidden() {
      // Kept for compatibility with older code. Real VRM Fang actions now use
      // the actual arm, so it is never hidden/replaced.
    },
    getHandWorldPosition(side = 'right', target = new THREE.Vector3()) {
      const hand = side === 'left' ? bones.leftHand : bones.rightHand;
      if (!hand) return null;
      hand.getWorldPosition(target);
      return target;
    }
  };
}

function prepareAvatar(scene) {
  scene.traverse((object) => {
    if (!object.isMesh && !object.isSkinnedMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = false;
  });
}

function fitAvatar(scene, modelRoot, targetHeight) {
  scene.updateWorldMatrix(true, true);
  let bounds = new THREE.Box3().setFromObject(scene);
  const height = Math.max(0.001, bounds.max.y - bounds.min.y);
  const scale = targetHeight / height;
  scene.scale.setScalar(scale);
  scene.updateWorldMatrix(true, true);

  bounds = new THREE.Box3().setFromObject(scene);
  const center = bounds.getCenter(new THREE.Vector3());

  // PlayerVisualPivot sits at +0.9, so the avatar feet should be at -0.9.
  scene.position.x -= center.x;
  scene.position.z -= center.z;
  scene.position.y += -0.90 - bounds.min.y;
  scene.updateWorldMatrix(true, true);

  // modelRoot remains separate so we can rotate the authored +Z forward model
  // without disturbing the height fitting.
  modelRoot.updateWorldMatrix(true, true);
}

function bone(vrm, name) {
  return (
    vrm.humanoid?.getNormalizedBoneNode?.(name) ??
    vrm.humanoid?.getRawBoneNode?.(name) ??
    null
  );
}

function attachRoachAccessories(bones) {
  const brown = new THREE.MeshToonMaterial({ color: 0x6f3928 });
  const dark = new THREE.MeshToonMaterial({ color: 0x43261f });
  const orange = new THREE.MeshToonMaterial({ color: 0xb96535 });

  const accessories = new THREE.Group();
  accessories.name = 'RoachScoutAccessories';

  if (bones.head) {
    const antennaRoot = new THREE.Group();
    antennaRoot.name = 'Antennae';
    antennaRoot.position.set(0, 0.105, 0.01);
    bones.head.add(antennaRoot);

    for (const side of [-1, 1]) {
      const points = [
        new THREE.Vector3(side * 0.055, 0.02, 0.0),
        new THREE.Vector3(side * 0.10, 0.11, 0.018),
        new THREE.Vector3(side * 0.16, 0.19, 0.055),
        new THREE.Vector3(side * 0.21, 0.25, 0.11)
      ];
      const curve = new THREE.CatmullRomCurve3(points);
      const antenna = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 20, 0.008, 6, false),
        dark
      );
      antenna.castShadow = true;
      antennaRoot.add(antenna);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.037, 0.012, 6, 14),
        orange
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(side * 0.055, 0.022, 0.002);
      antennaRoot.add(ring);
    }
  }

  const chest = bones.upperChest ?? bones.chest;
  if (chest) {
    const shellRoot = new THREE.Group();
    shellRoot.name = 'BackShell';
    shellRoot.position.set(0, 0.015, -0.115);
    shellRoot.rotation.x = -0.06;
    chest.add(shellRoot);

    const top = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 18, 12),
      brown
    );
    top.scale.set(0.25, 0.34, 0.09);
    top.position.y = 0.055;
    top.castShadow = true;
    shellRoot.add(top);

    const lower = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 18, 12),
      dark
    );
    lower.scale.set(0.22, 0.28, 0.08);
    lower.position.y = -0.18;
    lower.castShadow = true;
    shellRoot.add(lower);

    const ridge = new THREE.Mesh(
      new THREE.BoxGeometry(0.015, 0.48, 0.025),
      orange
    );
    ridge.position.set(0, -0.04, -0.085);
    shellRoot.add(ridge);
  }

  return accessories;
}

function applyIdlePose(bones, baseRotations, blend = 1) {
  // Normalized VRM humanoid bones have consistent axes. Lower the T-pose arms
  // into a relaxed game-ready silhouette while keeping the face/body authored.
  setBoneEuler(bones.leftUpperArm, baseRotations, 0.05, 0.05, -1.08, blend);
  setBoneEuler(bones.rightUpperArm, baseRotations, 0.05, -0.05, 1.08, blend);
  setBoneEuler(bones.leftLowerArm, baseRotations, 0.10, 0.0, -0.12, blend);
  setBoneEuler(bones.rightLowerArm, baseRotations, 0.10, 0.0, 0.12, blend);
}

function updatePose(character, dt, state) {
  const { bones, baseRotations } = character;
  const speed = Math.min(1, (state.speed ?? 0) / 6.5);
  const combat = Boolean(state.combat);
  const crouching = Boolean(state.crouching);
  const grounded = state.grounded !== false;
  const fang = state.fangAnimation ?? null;

  const time = performance.now() * 0.001;
  const breathe = Math.sin(time * 2.4) * 0.025;
  const armSwing = Math.sin(time * (5.5 + speed * 5.5)) * 0.24 * speed;

  // Left arm follows firearm stance when fighting. Right arm is overridden by
  // the Fang animation whenever V is active.
  if (combat && !fang) {
    dampBoneEuler(bones.leftUpperArm, baseRotations, -0.62, 0.16, -0.68, 16, dt);
    dampBoneEuler(bones.leftLowerArm, baseRotations, -0.82, -0.08, -0.16, 16, dt);
    dampBoneEuler(bones.rightUpperArm, baseRotations, -0.48, -0.10, 0.70, 16, dt);
    dampBoneEuler(bones.rightLowerArm, baseRotations, -0.76, 0.02, 0.18, 16, dt);
  } else {
    dampBoneEuler(bones.leftUpperArm, baseRotations, 0.06 + armSwing, 0.04, -1.08, 10, dt);
    dampBoneEuler(bones.leftLowerArm, baseRotations, 0.10, 0, -0.12, 10, dt);

    if (!fang) {
      dampBoneEuler(bones.rightUpperArm, baseRotations, 0.06 - armSwing, -0.04, 1.08, 10, dt);
      dampBoneEuler(bones.rightLowerArm, baseRotations, 0.10, 0, 0.12, 10, dt);
      dampBoneEuler(bones.rightHand, baseRotations, 0, 0, 0, 10, dt);
    }
  }

  if (fang) applyRealFangPose(bones, baseRotations, fang, dt);

  dampBoneEuler(
    bones.head,
    baseRotations,
    breathe * 0.18,
    Math.sin(time * 1.5) * 0.025,
    Math.sin(time * 1.1) * 0.018,
    7,
    dt
  );

  const crouch = crouching ? 0.24 : 0;
  dampBoneEuler(bones.leftUpperLeg, baseRotations, -crouch, 0, 0, 12, dt);
  dampBoneEuler(bones.rightUpperLeg, baseRotations, -crouch, 0, 0, 12, dt);

  dampBoneEuler(
    bones.hips,
    baseRotations,
    grounded ? 0 : -0.10,
    0,
    0,
    10,
    dt
  );
}

function applyRealFangPose(bones, baseRotations, fang, dt) {
  const mode = fang.mode ?? 'aim';
  const t = THREE.MathUtils.clamp(fang.t ?? 0, 0, 1);
  const compact = Boolean(fang.compact);
  let upper;
  let lower;
  let hand;
  let chest = [0, 0, 0];

  if (mode === 'release') {
    const snap = easeInOut(Math.min(1, t / 0.72));
    const follow = t > 0.72 ? easeOut((t - 0.72) / 0.28) : 0;
    const start = compact
      ? [-0.72, -0.42, 0.78]
      : [-1.06, -0.26, 0.96];
    const end = compact
      ? [0.18, 0.18, 0.34]
      : [0.38, 0.22, 0.28];

    upper = [
      THREE.MathUtils.lerp(start[0], end[0], snap),
      THREE.MathUtils.lerp(start[1], end[1], snap),
      THREE.MathUtils.lerp(start[2], end[2], snap)
    ];
    lower = [
      THREE.MathUtils.lerp(compact ? -0.98 : -1.22, -0.22, snap),
      THREE.MathUtils.lerp(0.02, -0.08, snap),
      THREE.MathUtils.lerp(compact ? -0.22 : 0.18, -0.12, snap)
    ];
    hand = [
      THREE.MathUtils.lerp(-0.32, 0.34, snap),
      THREE.MathUtils.lerp(0.06, -0.04, snap),
      THREE.MathUtils.lerp(0.18, -0.24, snap)
    ];
    chest = [0, THREE.MathUtils.lerp(compact ? 0.05 : 0.13, -0.08, snap) * (1 - follow * 0.7), 0];
  } else if (mode === 'slash') {
    const swing = easeInOut(t);
    upper = [
      THREE.MathUtils.lerp(-0.85, 0.52, swing),
      THREE.MathUtils.lerp(-0.18, 0.28, swing),
      THREE.MathUtils.lerp(0.92, 0.20, swing)
    ];
    lower = [
      THREE.MathUtils.lerp(-1.05, -0.28, swing),
      0,
      THREE.MathUtils.lerp(0.20, -0.26, swing)
    ];
    hand = [THREE.MathUtils.lerp(-0.22, 0.28, swing), 0, THREE.MathUtils.lerp(0.18, -0.20, swing)];
    chest = [0, THREE.MathUtils.lerp(0.10, -0.10, swing), 0];
  } else {
    upper = compact
      ? [-0.72, -0.42, 0.78]
      : [-1.06, -0.26, 0.96];
    lower = compact
      ? [-0.98, 0.02, -0.22]
      : [-1.22, 0.04, 0.18];
    hand = compact
      ? [-0.30, 0.02, 0.10]
      : [-0.38, 0.08, 0.22];
    chest = [0, compact ? 0.05 : 0.13, 0];
  }

  dampBoneEuler(bones.rightUpperArm, baseRotations, ...upper, 22, dt);
  dampBoneEuler(bones.rightLowerArm, baseRotations, ...lower, 22, dt);
  dampBoneEuler(bones.rightHand, baseRotations, ...hand, 24, dt);
  dampBoneEuler(bones.upperChest ?? bones.chest, baseRotations, ...chest, 16, dt);
}

function easeOut(t) {
  t = THREE.MathUtils.clamp(t, 0, 1);
  return 1 - Math.pow(1 - t, 3);
}

function easeInOut(t) {
  t = THREE.MathUtils.clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

function setBoneEuler(node, baseRotations, x, y, z, blend = 1) {
  if (!node) return;
  const base = baseRotations.get(node) ?? new THREE.Quaternion();
  const offset = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
  const target = base.clone().multiply(offset);
  node.quaternion.slerp(target, blend);
}

function dampBoneEuler(node, baseRotations, x, y, z, lambda, dt) {
  if (!node) return;
  const base = baseRotations.get(node) ?? new THREE.Quaternion();
  const offset = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
  const target = base.clone().multiply(offset);
  node.quaternion.slerp(target, 1 - Math.exp(-lambda * dt));
}
