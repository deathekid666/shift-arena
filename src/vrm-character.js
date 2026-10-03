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
    setRightArmHidden(hidden) {
      const upper = bones.rightUpperArm;
      if (!upper) return;
      if (hidden) {
        upper.scale.copy(rightArmScale).multiplyScalar(0.001);
      } else {
        upper.scale.copy(rightArmScale);
      }
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

  const time = performance.now() * 0.001;
  const breathe = Math.sin(time * 2.4) * 0.025;
  const armSwing = Math.sin(time * (5.5 + speed * 5.5)) * 0.24 * speed;

  if (combat) {
    // Placeholder gun-ready pose until the animation-library retarget pass.
    dampBoneEuler(bones.leftUpperArm, baseRotations, -0.52, 0.10, -0.72, 14, dt);
    dampBoneEuler(bones.rightUpperArm, baseRotations, -0.45, -0.06, 0.76, 14, dt);
    dampBoneEuler(bones.leftLowerArm, baseRotations, -0.78, 0.0, -0.18, 14, dt);
    dampBoneEuler(bones.rightLowerArm, baseRotations, -0.72, 0.0, 0.18, 14, dt);
  } else {
    dampBoneEuler(bones.leftUpperArm, baseRotations, 0.06 + armSwing, 0.04, -1.08, 10, dt);
    dampBoneEuler(bones.rightUpperArm, baseRotations, 0.06 - armSwing, -0.04, 1.08, 10, dt);
    dampBoneEuler(bones.leftLowerArm, baseRotations, 0.10, 0, -0.12, 10, dt);
    dampBoneEuler(bones.rightLowerArm, baseRotations, 0.10, 0, 0.12, 10, dt);
  }

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

  if (!grounded) {
    dampBoneEuler(bones.hips, baseRotations, -0.10, 0, 0, 10, dt);
  } else {
    dampBoneEuler(bones.hips, baseRotations, 0, 0, 0, 10, dt);
  }
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
