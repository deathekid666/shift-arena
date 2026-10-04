import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { createVrmLocomotionController } from './vrm-locomotion.js';
import { createFangPoseLayer } from './fang-pose.js';
import { createCrouchPoseLayer } from './crouch-pose.js';
import { createSlidePoseLayer } from './slide-pose.js';
import { createJumpPoseLayer } from './jump-pose.js';

// Temporary development avatar used only to validate the real VRM pipeline.
// Source: norio/vrm-game-starter (their README states the bundled VRoid sample
// avatars are redistributed under their own VRM metadata terms).
export const FINAL_VRM_URL = '/assets/characters/roach-scout.vrm';
export const FINAL_GLB_URL = '/assets/characters/roach-scout.glb';

// Current working main-character source. When a local production VRM/GLB is
// actually added to assets/characters, this can switch back to the local URL.
export const DEVELOPMENT_VRM_URL =
  'https://cdn.jsdelivr.net/gh/norio/vrm-game-starter@b14c236fd8150855348ad085b7820c298eac4b30/src/assets/sample2.vrm';

export async function loadRoachScoutVrmBase() {
  // Fast-start path: the repository currently has no local roach-scout.vrm
  // or roach-scout.glb, so probing those URLs only adds two failed requests.
  // Load the actual working main character immediately.
  const avatar = await loadVrmAvatar(DEVELOPMENT_VRM_URL);
  avatar.sourceUrl = DEVELOPMENT_VRM_URL;
  avatar.finalAsset = false;
  avatar.activeMainCharacter = true;
  avatar.assetType = 'vrm';
  return avatar;
}

async function loadVrmAvatar(url) {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));

  const gltf = await loader.loadAsync(url);
  const vrm = gltf.userData.vrm;
  if (!vrm) throw new Error(`No VRM metadata in ${url}`);

  if (vrm.meta?.metaVersion === '0') VRMUtils.rotateVRM0(vrm);

  const root = new THREE.Group();
  root.name = 'RoachScoutVrmRoot';

  const modelRoot = new THREE.Group();
  modelRoot.name = 'RoachScoutVrmModel';
  root.add(modelRoot);
  modelRoot.add(vrm.scene);

  prepareAvatar(vrm.scene);

  const isFinal = url === FINAL_VRM_URL;
  if (!isFinal) retintAvatar(vrm.scene);

  fitAvatar(vrm.scene, modelRoot, 1.72);
  modelRoot.rotation.y = Math.PI;

  const bones = vrmBones(vrm);
  const rawBones = vrmRawBones(vrm);
  const character = buildCharacterInterface({
    root,
    modelRoot,
    scene: vrm.scene,
    bones,
    rawBones,
    vrm,
    applyScoutAccessories: !isFinal
  });

  character.authoredLocomotionReady =
    createVrmLocomotionController(character, vrm)
      .then((controller) => {
        character.authoredLocomotion = controller;
        return controller;
      })
      .catch((error) => {
        console.warn('Authored VRM locomotion failed; using procedural fallback.', error);
        character.authoredLocomotion = null;
        return null;
      });

  return character;
}

async function loadHumanoidGlb(url) {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  const scene = gltf.scene;

  prepareAvatar(scene);

  const bones = glbBones(scene);
  const required = [
    'head',
    'leftHand',
    'rightHand',
    'hips',
    'leftUpperArm',
    'rightUpperArm'
  ];
  const missing = required.filter((key) => !bones[key]);

  if (missing.length) {
    throw new Error(
      `Final GLB loaded but is not a usable humanoid rig. Missing: ${missing.join(', ')}`
    );
  }

  const root = new THREE.Group();
  root.name = 'RoachScoutGlbRoot';

  const modelRoot = new THREE.Group();
  modelRoot.name = 'RoachScoutGlbModel';
  root.add(modelRoot);
  modelRoot.add(scene);

  fitAvatar(scene, modelRoot, 1.72);

  return buildCharacterInterface({
    root,
    modelRoot,
    scene,
    bones,
    rawBones: bones,
    vrm: null,
    applyScoutAccessories: false
  });
}

function vrmBones(vrm) {
  return {
    head: bone(vrm, 'head'),
    neck: bone(vrm, 'neck'),
    spine: bone(vrm, 'spine'),
    chest: bone(vrm, 'chest') ?? bone(vrm, 'upperChest'),
    upperChest: bone(vrm, 'upperChest') ?? bone(vrm, 'chest'),
    leftShoulder: bone(vrm, 'leftShoulder'),
    rightShoulder: bone(vrm, 'rightShoulder'),
    leftUpperArm: bone(vrm, 'leftUpperArm'),
    rightUpperArm: bone(vrm, 'rightUpperArm'),
    leftLowerArm: bone(vrm, 'leftLowerArm'),
    rightLowerArm: bone(vrm, 'rightLowerArm'),
    leftHand: bone(vrm, 'leftHand'),
    rightHand: bone(vrm, 'rightHand'),
    hips: bone(vrm, 'hips'),
    leftUpperLeg: bone(vrm, 'leftUpperLeg'),
    rightUpperLeg: bone(vrm, 'rightUpperLeg'),
    leftLowerLeg: bone(vrm, 'leftLowerLeg'),
    rightLowerLeg: bone(vrm, 'rightLowerLeg'),
    leftFoot: bone(vrm, 'leftFoot'),
    rightFoot: bone(vrm, 'rightFoot'),
    leftToes: bone(vrm, 'leftToes'),
    rightToes: bone(vrm, 'rightToes')
  };
}

function vrmRawBones(vrm) {
  const raw = (name) =>
    vrm.humanoid?.getRawBoneNode?.(name) ?? null;

  return {
    head: raw('head'),
    neck: raw('neck'),
    spine: raw('spine'),
    chest: raw('chest') ?? raw('upperChest'),
    upperChest: raw('upperChest') ?? raw('chest'),
    leftShoulder: raw('leftShoulder'),
    rightShoulder: raw('rightShoulder'),
    leftUpperArm: raw('leftUpperArm'),
    rightUpperArm: raw('rightUpperArm'),
    leftLowerArm: raw('leftLowerArm'),
    rightLowerArm: raw('rightLowerArm'),
    leftHand: raw('leftHand'),
    rightHand: raw('rightHand'),
    hips: raw('hips'),
    leftUpperLeg: raw('leftUpperLeg'),
    rightUpperLeg: raw('rightUpperLeg'),
    leftLowerLeg: raw('leftLowerLeg'),
    rightLowerLeg: raw('rightLowerLeg'),
    leftFoot: raw('leftFoot'),
    rightFoot: raw('rightFoot'),
    leftToes: raw('leftToes'),
    rightToes: raw('rightToes')
  };
}

function glbBones(scene) {
  const aliases = {
    head: ['head', 'head_end'],
    neck: ['neck'],
    spine: ['spine', 'spine1', 'spine_01', 'mixamorigspine'],
    chest: ['upperchest', 'chest', 'spine2', 'spine_02', 'mixamorigspine1'],
    upperChest: ['upperchest', 'spine2', 'spine_02', 'chest', 'mixamorigspine2'],
    leftShoulder: ['leftshoulder', 'shoulder_l', 'mixamorigleftshoulder'],
    rightShoulder: ['rightshoulder', 'shoulder_r', 'mixamorigrightshoulder'],
    leftUpperArm: ['leftupperarm', 'leftarm', 'upperarm_l', 'mixamorigleftarm'],
    rightUpperArm: ['rightupperarm', 'rightarm', 'upperarm_r', 'mixamorigrightarm'],
    leftLowerArm: ['leftlowerarm', 'leftforearm', 'lowerarm_l', 'mixamorigleftforearm'],
    rightLowerArm: ['rightlowerarm', 'rightforearm', 'lowerarm_r', 'mixamorigrightforearm'],
    leftHand: ['lefthand', 'hand_l', 'mixamoriglefthand'],
    rightHand: ['righthand', 'hand_r', 'mixamorigrighthand'],
    hips: ['hips', 'pelvis', 'mixamorigHips'],
    leftUpperLeg: ['leftupperleg', 'leftupleg', 'thigh_l', 'mixamorigleftupleg'],
    rightUpperLeg: ['rightupperleg', 'rightupleg', 'thigh_r', 'mixamorigrightupleg'],
    leftLowerLeg: ['leftlowerleg', 'leftleg', 'calf_l', 'mixamorigleftleg'],
    rightLowerLeg: ['rightlowerleg', 'rightleg', 'calf_r', 'mixamorigrightleg'],
    leftFoot: ['leftfoot', 'foot_l', 'mixamorigleftfoot'],
    rightFoot: ['rightfoot', 'foot_r', 'mixamorigrightfoot'],
    leftToes: ['lefttoes', 'lefttoe', 'toe_l', 'mixamoriglefttoebase'],
    rightToes: ['righttoes', 'righttoe', 'toe_r', 'mixamorigrighttoebase']
  };

  const nodes = [];
  scene.traverse((node) => {
    if (node.isBone || node.type === 'Bone') nodes.push(node);
  });

  const normalize = (value) =>
    String(value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

  const byName = new Map(nodes.map((node) => [normalize(node.name), node]));
  const result = {};

  for (const [key, names] of Object.entries(aliases)) {
    result[key] = names
      .map(normalize)
      .map((name) => byName.get(name))
      .find(Boolean) ?? null;
  }

  return result;
}

function createRenderAttachmentBones(
  root,
  normalizedBones,
  rawBones
) {
  const anchors = {};

  // First author all attachment roots in normalized-bone local space so the
  // existing hero offsets keep the exact same intended placement.
  for (const [key, normalizedBone] of Object.entries(
    normalizedBones
  )) {
    if (!normalizedBone) {
      anchors[key] = null;
      continue;
    }

    const anchor = new THREE.Group();
    anchor.name = `RenderAttachment_${key}`;
    normalizedBone.add(anchor);
    anchors[key] = anchor;
  }

  root.updateWorldMatrix(true, true);

  // Reparent each anchor to the matching raw/render bone while preserving its
  // current world transform. From this point on visible hero pieces follow the
  // same skeleton that skins the VRM mesh, not the normalized proxy hierarchy.
  for (const [key, anchor] of Object.entries(anchors)) {
    if (!anchor) continue;

    const rawBone = rawBones?.[key];
    if (!rawBone) {
      root.attach(anchor);
      continue;
    }

    rawBone.attach(anchor);
  }

  root.updateWorldMatrix(true, true);
  return anchors;
}

function buildCharacterInterface({
  root,
  modelRoot,
  scene,
  bones,
  rawBones = bones,
  vrm,
  applyScoutAccessories
}) {
  const baseRotations = new Map();
  const basePositions = new Map();
  for (const node of Object.values(bones)) {
    if (!node) continue;
    baseRotations.set(node, node.quaternion.clone());
    basePositions.set(node, node.position.clone());
  }

  // Normalized bones are animation proxies in three-vrm. Visible geometry
  // must ultimately follow raw/render bones. We build the hero parts in the
  // normalized coordinate system (where all current offsets are authored),
  // then reparent the anchor groups to raw bones while preserving world pose.
  const attachmentBones =
    vrm
      ? createRenderAttachmentBones(
          root,
          bones,
          rawBones
        )
      : rawBones;

  const accessories = applyScoutAccessories
    ? attachRoachAccessories(attachmentBones)
    : {};

  const weaponSocket = new THREE.Object3D();
  weaponSocket.name = 'weaponSocket';
  if (attachmentBones.rightHand) {
    weaponSocket.position.set(0, 0.025, 0.08);
    weaponSocket.rotation.set(-0.18, Math.PI, 0.12);
    attachmentBones.rightHand.add(weaponSocket);
  } else {
    weaponSocket.position.set(0.28, 0.18, -0.42);
    root.add(weaponSocket);
  }

  const fangSocket = new THREE.Object3D();
  fangSocket.name = 'fangSocket';
  if (attachmentBones.rightHand) {
    fangSocket.position.set(0, 0.02, 0.055);
    attachmentBones.rightHand.add(fangSocket);
  } else {
    root.add(fangSocket);
  }

  // Left-hip storage: the knife is worn on the character's left side while
  // the active Fang stays attached to the right hand for draw/throw attacks.
  const holsterSocket = new THREE.Object3D();
  holsterSocket.name = 'holsterSocket';
  if (attachmentBones.hips) {
    holsterSocket.position.set(-0.120, -0.025, -0.112);
    holsterSocket.rotation.set(0.02, 0.46, 0.42);
    attachmentBones.hips.add(holsterSocket);
  } else {
    holsterSocket.position.set(-0.16, -0.12, -0.055);
    root.add(holsterSocket);
  }

  const headSocket = new THREE.Object3D();
  headSocket.name = 'headSocket';
  if (attachmentBones.head) attachmentBones.head.add(headSocket);
  else root.add(headSocket);

  applyIdlePose(bones, baseRotations, 1);

  return {
    root,
    modelRoot,
    scene,
    vrm,
    bones,
    rawBones,
    attachmentBones,
    weaponSocket,
    fangSocket,
    holsterSocket,
    headSocket,
    accessories,
    baseRotations,
    basePositions,
    locomotion: {
      phase: 0,
      state: 'IDLE',
      previousGrounded: true,
      landing: 0,
      moveBlend: 0
    },
    stablePelvis: {
      slideBlend: 0
    },
    coreRotationStabilizer: {
      active: false,
      filtered: new Map()
    },
    authoredLocomotion: null,
    authoredLocomotionReady: null,
    debugFreezeAuthored: false,
    update(dt, state = {}) {
      this.fangPoseLayer?.restore();
      this.jumpPoseLayer?.restore();
      this.slidePoseLayer?.restore();
      this.crouchPoseLayer?.restore();

      if (!this.debugFreezeAuthored) {
        this.authoredLocomotion?.update(dt, state);
      }

      // Diagnostic freeze intentionally stops only the authored mixer. The
      // gameplay root, procedural layers and final normalized->raw sync remain
      // active so Jitter Lab can isolate the source without changing physics.

      // Retargeted base clips still contain tiny frame-to-frame core rotations.
      // On this VRM those micro corrections can read as whole-body vibration.
      // Filter only base standing/walk/sprint core rotation; crouch, jump and
      // the confirmed-good authored slide remain completely untouched.
      stabilizeBaseCoreRotation(this, dt, state);

      // Build 010.9A's authored UAL2 slide needs its retargeted pelvis-height
      // track. Keep normal locomotion locked to a stable pelvis, but do not
      // overwrite the authored Slide_Start/Loop/Exit vertical motion.
      const authoredSlideActive = Boolean(
        this.authoredLocomotion?.hasAuthoredSlide &&
        (state.sliding || this.authoredLocomotion?.slideExitActive)
      );

      if (!authoredSlideActive) {
        applyStablePelvis(this);
      }

      updatePose(this, dt, state);

      this.crouchPoseLayer ??= createCrouchPoseLayer(this);
      this.crouchPoseLayer.apply(
        {
          ...state,
          speed: state.speed ?? 0,
          localX: state.localX ?? 0,
          localZ: state.localZ ?? 0
        },
        dt
      );

      // Restore the last confirmed-good slide architecture: when UAL2 is
      // available it owns the whole slide pose. The procedural two-knee layer
      // remains only as the fallback if the authored slide library cannot load.
      if (!this.authoredLocomotion?.hasAuthoredSlide) {
        this.slidePoseLayer ??= createSlidePoseLayer(this);
        this.slidePoseLayer.apply(state, dt);
      }

      this.jumpPoseLayer ??= createJumpPoseLayer(this);
      this.jumpPoseLayer.apply(state, dt);
    },
    setVisible(visible) {
      root.visible = Boolean(visible);
    },
    setRightArmHidden() {},
    getHandWorldPosition(side = 'right', target = new THREE.Vector3()) {
      const hand =
        side === 'left'
          ? bones.leftHand
          : bones.rightHand;
      if (!hand) return null;
      hand.getWorldPosition(target);
      return target;
    },
    applyFangPose(fang, dt) {
      this.fangPoseLayer ??= createFangPoseLayer(this);
      this.fangPoseLayer.apply(fang, dt);
    },
    applyWeaponIK(gripPose, dt) {
      applyTwoHandWeaponIK(this, gripPose, dt);
    },
    finalizePose() {
      // Shooter-style late update:
      // mixer/procedural layers/IK all write normalized bones first, then the
      // humanoid is committed to the rendered raw skeleton exactly once.
      // We intentionally do not call vrm.update() here because this gameplay
      // avatar does not need spring-bone simulation, and the model is scaled.
      vrm?.humanoid?.update?.();
      root.updateWorldMatrix(true, true);
    }
  };
}

function bone(vrm, name) {
  return (
    vrm.humanoid?.getNormalizedBoneNode?.(name) ??
    vrm.humanoid?.getRawBoneNode?.(name) ??
    null
  );
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

function attachRoachAccessories(bones) {
  const mats = {
    // Shell is the hero material: richer highlights than the temporary toon
    // primitives, but still low-poly/cartoon through flatShading.
    shell: new THREE.MeshPhysicalMaterial({
      color: 0x4d251d,
      roughness: 0.30,
      metalness: 0.04,
      clearcoat: 0.52,
      clearcoatRoughness: 0.32,
      flatShading: true
    }),
    shellLight: new THREE.MeshPhysicalMaterial({
      color: 0x7b3d28,
      roughness: 0.27,
      metalness: 0.03,
      clearcoat: 0.44,
      clearcoatRoughness: 0.30,
      flatShading: true
    }),
    shellHighlight: new THREE.MeshPhysicalMaterial({
      color: 0xb45a31,
      roughness: 0.24,
      metalness: 0.02,
      clearcoat: 0.38,
      clearcoatRoughness: 0.26,
      emissive: 0x1b0803,
      emissiveIntensity: 0.14,
      flatShading: true
    }),
    orange: new THREE.MeshStandardMaterial({
      color: 0xc96d32,
      roughness: 0.44,
      metalness: 0.04,
      flatShading: true
    }),
    orangeBright: new THREE.MeshStandardMaterial({
      color: 0xea9146,
      roughness: 0.38,
      metalness: 0.03,
      emissive: 0x241006,
      emissiveIntensity: 0.12,
      flatShading: true
    }),
    cream: new THREE.MeshStandardMaterial({
      color: 0xead7b7,
      roughness: 0.88,
      metalness: 0.0,
      flatShading: true
    }),
    creamDark: new THREE.MeshStandardMaterial({
      color: 0xc6a878,
      roughness: 0.82,
      metalness: 0.0,
      flatShading: true
    }),
    dark: new THREE.MeshStandardMaterial({
      color: 0x2a2321,
      roughness: 0.76,
      metalness: 0.08,
      flatShading: true
    }),
    leather: new THREE.MeshStandardMaterial({
      color: 0x493126,
      roughness: 0.92,
      metalness: 0.0,
      flatShading: true
    }),
    metal: new THREE.MeshStandardMaterial({
      color: 0x9b7448,
      roughness: 0.34,
      metalness: 0.62,
      flatShading: true
    }),
    lens: new THREE.MeshStandardMaterial({
      color: 0x1b2426,
      roughness: 0.08,
      metalness: 0.74,
      emissive: 0x0c1516,
      emissiveIntensity: 0.20
    })
  };

  const refs = {};

  if (bones.head) {
    // Forehead goggles matching the reference silhouette.
    const goggles = new THREE.Group();
    goggles.name = 'RoachScoutGoggles';
    goggles.position.set(0, 0.092, 0.092);
    goggles.rotation.x = -0.10;
    bones.head.add(goggles);

    for (const side of [-1, 1]) {
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.046, 0.010, 8, 20),
        mats.orange
      );
      rim.position.x = side * 0.052;
      rim.castShadow = true;
      goggles.add(rim);

      const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.037, 0.037, 0.012, 18),
        mats.lens
      );
      lens.rotation.x = Math.PI / 2;
      lens.position.set(side * 0.052, 0, -0.006);
      goggles.add(lens);
    }

    const bridge = new THREE.Mesh(
      new THREE.BoxGeometry(0.028, 0.012, 0.012),
      mats.metal
    );
    goggles.add(bridge);
    refs.goggles = goggles;

    // Cockroach-hero brow shell: frames the face without covering the eyes.
    const browShell = new THREE.Group();
    browShell.name = 'RoachScoutBrowShell';
    browShell.position.set(0, 0.052, 0.045);
    bones.head.add(browShell);

    const browPlate = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 16, 10),
      mats.shell
    );
    browPlate.scale.set(0.155, 0.050, 0.085);
    browPlate.position.set(0, 0.058, -0.018);
    browPlate.rotation.x = -0.16;
    browPlate.castShadow = true;
    browPlate.receiveShadow = true;
    browShell.add(browPlate);

    const browRidge = new THREE.Mesh(
      new THREE.BoxGeometry(0.205, 0.016, 0.020),
      mats.shellHighlight
    );
    browRidge.position.set(0, 0.048, 0.058);
    browRidge.rotation.x = -0.12;
    browShell.add(browRidge);

    for (const side of [-1, 1]) {
      const temple = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 12, 8),
        mats.shellLight
      );
      temple.scale.set(0.050, 0.075, 0.052);
      temple.position.set(side * 0.102, -0.006, 0.018);
      temple.rotation.z = side * -0.18;
      temple.castShadow = true;
      temple.receiveShadow = true;
      browShell.add(temple);

      const cheekGuard = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 12, 8),
        mats.shell
      );
      cheekGuard.scale.set(0.035, 0.060, 0.028);
      cheekGuard.position.set(side * 0.092, -0.072, 0.070);
      cheekGuard.rotation.z = side * 0.24;
      cheekGuard.castShadow = true;
      browShell.add(cheekGuard);
    }
    // Crown cap carries the shell material over the top of the skull so the
    // head reads as one designed roach silhouette, not goggles on a human head.
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 16, 10),
      mats.shellLight
    );
    crown.name = 'RoachScoutCrownShell';
    crown.scale.set(0.135, 0.070, 0.115);
    crown.position.set(0, 0.105, -0.008);
    crown.rotation.x = -0.10;
    crown.castShadow = true;
    crown.receiveShadow = true;
    browShell.add(crown);

    for (const side of [-1, 1]) {
      const socket = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.032, 0.045, 8),
        mats.metal
      );
      socket.name =
        side < 0 ? 'LeftAntennaSocket' : 'RightAntennaSocket';
      socket.position.set(side * 0.072, 0.112, -0.012);
      socket.rotation.z = side * -0.28;
      socket.rotation.x = 0.14;
      socket.castShadow = true;
      browShell.add(socket);
    }

    refs.browShell = browShell;

    // Extra stylized hair crest to push the temporary base toward our sheet.
    const crest = new THREE.Group();
    crest.name = 'RoachScoutHairCrest';
    crest.position.set(0, 0.10, 0.005);
    bones.head.add(crest);

    const tuftData = [
      [-0.055, 0.016, 0.018, 0.030, 0.072, -0.28],
      [-0.018, 0.032, 0.022, 0.038, 0.088, -0.08],
      [0.022, 0.034, 0.020, 0.040, 0.094, 0.07],
      [0.058, 0.015, 0.014, 0.032, 0.074, 0.27]
    ];
    for (const [x,y,z,r,h,rz] of tuftData) {
      const tuft = new THREE.Mesh(
        new THREE.ConeGeometry(r, h, 8),
        mats.shellLight
      );
      tuft.position.set(x,y,z);
      tuft.rotation.z = rz;
      tuft.rotation.x = -0.16;
      tuft.castShadow = true;
      crest.add(tuft);
    }

    // Segmented long antennae with orange tips/bands.
    const antennaRoot = new THREE.Group();
    antennaRoot.name = 'Antennae';
    antennaRoot.position.set(0, 0.115, 0.010);
    bones.head.add(antennaRoot);

    for (const side of [-1, 1]) {
      const points = [
        new THREE.Vector3(side * 0.046, 0.00, 0.00),
        new THREE.Vector3(side * 0.078, 0.095, 0.010),
        new THREE.Vector3(side * 0.132, 0.190, 0.025),
        new THREE.Vector3(side * 0.200, 0.270, 0.060),
        new THREE.Vector3(side * 0.235, 0.325, 0.105)
      ];
      const curve = new THREE.CatmullRomCurve3(points);
      const antenna = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 28, 0.0085, 7, false),
        mats.dark
      );
      antenna.castShadow = true;
      antennaRoot.add(antenna);

      for (let i = 1; i <= 3; i++) {
        const p = curve.getPoint(i / 4);
        const band = new THREE.Mesh(
          new THREE.TorusGeometry(0.012, 0.004, 5, 12),
          mats.orangeBright
        );
        band.position.copy(p);
        band.rotation.x = Math.PI / 2;
        antennaRoot.add(band);
      }

      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.012, 10, 8),
        mats.orangeBright
      );
      tip.position.copy(curve.getPoint(1));
      antennaRoot.add(tip);
    }
    refs.antennaRoot = antennaRoot;
  }

  if (bones.neck) {
    // Thick cream scarf collar.
    const scarf = new THREE.Group();
    scarf.name = 'RoachScoutScarf';
    bones.neck.add(scarf);

    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.105, 0.030, 8, 20),
      mats.cream
    );
    collar.rotation.x = Math.PI / 2;
    collar.position.y = -0.018;
    collar.castShadow = true;
    scarf.add(collar);

    const flap = new THREE.Mesh(
      new THREE.ConeGeometry(0.070, 0.135, 4),
      mats.cream
    );
    flap.scale.z = 0.42;
    flap.rotation.x = Math.PI;
    flap.rotation.z = Math.PI / 4;
    flap.position.set(0, -0.090, 0.080);
    flap.castShadow = true;
    scarf.add(flap);
    for (const side of [-1, 1]) {
      const collarPlate = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 12, 8),
        mats.shell
      );
      collarPlate.scale.set(0.060, 0.035, 0.070);
      collarPlate.position.set(side * 0.070, -0.006, 0.015);
      collarPlate.rotation.z = side * 0.28;
      collarPlate.castShadow = true;
      scarf.add(collarPlate);
    }

    refs.scarf = scarf;
  }

  const chest = bones.upperChest ?? bones.chest;
  if (chest) {
    const torsoGear = new THREE.Group();
    torsoGear.name = 'RoachScoutTorsoGear';
    chest.add(torsoGear);

    // Layered front carapace: large enough to define the hero torso, with a
    // soft cream under-panel so the shell does not become one muddy mass.
    const chestUnderlay = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 18, 12),
      mats.cream
    );
    chestUnderlay.scale.set(0.168, 0.225, 0.040);
    chestUnderlay.position.set(0, -0.060, 0.102);
    chestUnderlay.castShadow = true;
    chestUnderlay.receiveShadow = true;
    torsoGear.add(chestUnderlay);

    const chestPlate = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 16, 10),
      mats.shellLight
    );
    chestPlate.scale.set(0.145, 0.125, 0.047);
    chestPlate.position.set(0, 0.020, 0.135);
    chestPlate.castShadow = true;
    chestPlate.receiveShadow = true;
    torsoGear.add(chestPlate);

    const abdomenPlate = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 14, 9),
      mats.shell
    );
    abdomenPlate.scale.set(0.120, 0.092, 0.044);
    abdomenPlate.position.set(0, -0.118, 0.132);
    abdomenPlate.castShadow = true;
    abdomenPlate.receiveShadow = true;
    torsoGear.add(abdomenPlate);

    const sternum = new THREE.Mesh(
      new THREE.BoxGeometry(0.026, 0.245, 0.020),
      mats.shellHighlight
    );
    sternum.position.set(0, -0.045, 0.168);
    torsoGear.add(sternum);

    for (const side of [-1, 1]) {
      const ribPlate = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 12, 8),
        mats.orange
      );
      ribPlate.scale.set(0.052, 0.115, 0.030);
      ribPlate.position.set(side * 0.122, -0.050, 0.120);
      ribPlate.rotation.z = side * 0.15;
      ribPlate.castShadow = true;
      torsoGear.add(ribPlate);
    }

    // Clavicle shell plates visually connect chest armor to the shoulder caps.
    for (const side of [-1, 1]) {
      const clavicle = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 12, 8),
        mats.shell
      );
      clavicle.scale.set(0.082, 0.040, 0.034);
      clavicle.position.set(side * 0.085, 0.095, 0.128);
      clavicle.rotation.z = side * -0.18;
      clavicle.castShadow = true;
      torsoGear.add(clavicle);
    }

    // Crossed dark harness straps.
    for (const side of [-1, 1]) {
      const strap = new THREE.Mesh(
        new THREE.BoxGeometry(0.025, 0.30, 0.018),
        mats.leather
      );
      strap.position.set(side * 0.045, -0.035, 0.132);
      strap.rotation.z = side * 0.30;
      strap.castShadow = true;
      torsoGear.add(strap);
    }

    // Shoulder armor.
    for (const [boneNode, side] of [[bones.leftUpperArm, -1], [bones.rightUpperArm, 1]]) {
      if (!boneNode) continue;
      const pad = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 14, 10),
        mats.orange
      );
      pad.name = side < 0 ? 'LeftShoulderArmor' : 'RightShoulderArmor';
      pad.scale.set(0.110, 0.070, 0.120);
      pad.position.set(side * 0.015, -0.010, 0.005);
      pad.castShadow = true;
      boneNode.add(pad);

      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 12, 8),
        mats.shell
      );
      cap.scale.set(0.080, 0.048, 0.088);
      cap.position.set(side * 0.016, 0.006, -0.010);
      cap.castShadow = true;
      cap.receiveShadow = true;
      boneNode.add(cap);

      const flare = new THREE.Mesh(
        new THREE.ConeGeometry(0.065, 0.115, 6),
        mats.shellHighlight
      );
      flare.scale.z = 0.55;
      flare.position.set(side * 0.045, 0.020, -0.015);
      flare.rotation.z = side * -1.10;
      flare.rotation.x = -0.18;
      flare.castShadow = true;
      boneNode.add(flare);
    }

    // Segmented shell backpack — broad top, tapered bottom, visible seams.
    const shellRoot = new THREE.Group();
    shellRoot.name = 'BackShell';
    shellRoot.position.set(0, -0.045, -0.125);
    shellRoot.rotation.x = -0.055;
    chest.add(shellRoot);

    const rows = [
      { y: 0.155, w: 0.205, h: 0.120 },
      { y: 0.060, w: 0.235, h: 0.125 },
      { y: -0.040, w: 0.245, h: 0.128 },
      { y: -0.142, w: 0.225, h: 0.122 },
      { y: -0.235, w: 0.180, h: 0.105 }
    ];

    rows.forEach((row, index) => {
      for (const side of [-1, 1]) {
        const plate = new THREE.Mesh(
          new THREE.SphereGeometry(0.5, 16, 11),
          index % 2 ? mats.shell : mats.shellLight
        );
        plate.scale.set(row.w * 0.58, row.h, 0.055);
        plate.position.set(side * row.w * 0.28, row.y, -0.015);
        plate.rotation.z = side * (0.05 + index * 0.018);
        plate.castShadow = true;
        shellRoot.add(plate);
      }

      const seam = new THREE.Mesh(
        new THREE.BoxGeometry(row.w * 0.95, 0.008, 0.010),
        mats.orange
      );
      seam.position.set(0, row.y - row.h * 0.55, -0.070);
      shellRoot.add(seam);
    });

    const centerRidge = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 0.50, 0.026),
      mats.orangeBright
    );
    centerRidge.position.set(0, -0.045, -0.082);
    shellRoot.add(centerRidge);

    // Compact elytra: short, broad wing-cases that sit high on the back.
    // They should read as shell covers, not long hanging wings.
    for (const side of [-1, 1]) {
      const elytron = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.115, 0.18, 7, 12),
        side < 0 ? mats.shell : mats.shellLight
      );
      elytron.name =
        side < 0 ? 'LeftElytron' : 'RightElytron';

      elytron.scale.set(0.88, 0.72, 0.48);
      elytron.position.set(side * 0.072, 0.015, -0.078);

      elytron.rotation.z = side * 0.085;
      elytron.rotation.x = -0.10;
      elytron.rotation.y = side * 0.03;

      elytron.castShadow = true;
      elytron.receiveShadow = true;
      shellRoot.add(elytron);

      const elytraStripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.010, 0.205, 0.014),
        mats.shellHighlight
      );
      elytraStripe.position.set(side * 0.076, 0.010, -0.118);
      elytraStripe.rotation.z = side * 0.045;
      shellRoot.add(elytraStripe);
    }

    // Shared shoulder-back plate visually roots both wing-cases into the
    // carapace and removes the "two separate objects glued on" look.
    const wingBasePlate = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 14, 10),
      mats.shellLight
    );
    wingBasePlate.name = 'WingBasePlate';
    wingBasePlate.scale.set(0.18, 0.08, 0.10);
    wingBasePlate.position.set(0, 0.055, -0.060);
    wingBasePlate.rotation.x = -0.08;
    wingBasePlate.castShadow = true;
    wingBasePlate.receiveShadow = true;
    shellRoot.add(wingBasePlate);
    // Bright perimeter accents stop the backpack from reading as a brown blob.
    for (const side of [-1, 1]) {
      const shellRail = new THREE.Mesh(
        new THREE.BoxGeometry(0.018, 0.430, 0.018),
        mats.shellHighlight
      );
      shellRail.position.set(side * 0.142, -0.035, -0.060);
      shellRail.rotation.z = side * 0.055;
      shellRoot.add(shellRail);
    }

    const shellTip = new THREE.Mesh(
      new THREE.ConeGeometry(0.080, 0.145, 7),
      mats.shell
    );
    shellTip.position.set(0, -0.335, -0.025);
    shellTip.rotation.x = Math.PI;
    shellTip.scale.z = 0.58;
    shellTip.castShadow = true;
    shellRoot.add(shellTip);

    refs.shellRoot = shellRoot;
  }

  if (bones.hips) {
    const belt = new THREE.Group();
    belt.name = 'RoachScoutBelt';
    bones.hips.add(belt);

    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.155, 0.020, 7, 22),
      mats.leather
    );
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.035;
    belt.add(band);

    const buckle = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.040, 0.020),
      mats.metal
    );
    buckle.position.set(0, 0.035, 0.150);
    belt.add(buckle);

    for (const side of [-1, 1]) {
      const pouch = new THREE.Mesh(
        new THREE.BoxGeometry(0.070, 0.090, 0.045),
        mats.leather
      );
      pouch.position.set(side * 0.135, -0.015, 0.070);
      pouch.rotation.y = side * 0.18;
      pouch.castShadow = true;
      belt.add(pouch);

      const flap = new THREE.Mesh(
        new THREE.BoxGeometry(0.073, 0.022, 0.049),
        mats.orange
      );
      flap.position.set(side * 0.135, 0.025, 0.074);
      flap.rotation.y = side * 0.18;
      belt.add(flap);
    }
    for (const side of [-1, 1]) {
      const hipPlate = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 14, 9),
        mats.shellLight
      );
      hipPlate.scale.set(0.070, 0.105, 0.045);
      hipPlate.position.set(side * 0.160, -0.055, 0.015);
      hipPlate.rotation.z = side * 0.16;
      hipPlate.castShadow = true;
      hipPlate.receiveShadow = true;
      belt.add(hipPlate);

      const hipEdge = new THREE.Mesh(
        new THREE.BoxGeometry(0.018, 0.120, 0.020),
        mats.orangeBright
      );
      hipEdge.position.set(side * 0.196, -0.055, 0.022);
      hipEdge.rotation.z = side * 0.10;
      belt.add(hipEdge);
    }

    refs.belt = belt;
  }

  // Forearm carapace makes the arms match the chest/leg visual weight.
  for (const [armNode, side] of [
    [bones.leftLowerArm, -1],
    [bones.rightLowerArm, 1]
  ]) {
    if (!armNode) continue;

    const forearmShell = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 14, 9),
      mats.shellLight
    );
    forearmShell.name =
      side < 0 ? 'LeftForearmShell' : 'RightForearmShell';
    forearmShell.scale.set(0.055, 0.115, 0.040);
    forearmShell.position.set(side * 0.008, -0.100, 0.040);
    forearmShell.rotation.z = side * 0.035;
    forearmShell.castShadow = true;
    forearmShell.receiveShadow = true;
    armNode.add(forearmShell);

    const forearmRidge = new THREE.Mesh(
      new THREE.BoxGeometry(0.016, 0.160, 0.018),
      mats.orangeBright
    );
    forearmRidge.position.set(side * 0.045, -0.100, 0.068);
    forearmRidge.rotation.z = side * 0.030;
    armNode.add(forearmRidge);

    const wrap = new THREE.Mesh(
      new THREE.TorusGeometry(0.050, 0.010, 6, 14),
      mats.creamDark
    );
    wrap.rotation.y = Math.PI / 2;
    wrap.position.set(0, -0.185, 0.005);
    armNode.add(wrap);
  }

  // Wrist cuffs / bracers.
  for (const [handNode, side] of [[bones.leftHand, -1], [bones.rightHand, 1]]) {
    if (!handNode) continue;
    const cuff = new THREE.Mesh(
      new THREE.TorusGeometry(0.050, 0.014, 6, 16),
      mats.cream
    );
    cuff.name = side < 0 ? 'LeftWristCuff' : 'RightWristCuff';
    cuff.rotation.y = Math.PI / 2;
    cuff.position.set(side * -0.015, 0, 0);
    cuff.castShadow = true;
    handNode.add(cuff);

    const gauntlet = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 12, 8),
      mats.shellLight
    );
    gauntlet.name =
      side < 0 ? 'LeftGauntletPlate' : 'RightGauntletPlate';
    gauntlet.scale.set(0.048, 0.030, 0.070);
    gauntlet.position.set(0, 0.018, 0.035);
    gauntlet.rotation.x = -0.18;
    gauntlet.castShadow = true;
    handNode.add(gauntlet);
  }

  // Thigh armor gives the lower body a deliberate hero silhouette instead of
  // leaving all visual weight on the torso.
  for (const [legNode, side] of [
    [bones.leftUpperLeg, -1],
    [bones.rightUpperLeg, 1]
  ]) {
    if (!legNode) continue;

    const thighPlate = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 14, 9),
      mats.shell
    );
    thighPlate.name =
      side < 0 ? 'LeftThighArmor' : 'RightThighArmor';
    thighPlate.scale.set(0.075, 0.125, 0.040);
    thighPlate.position.set(side * 0.010, -0.110, 0.055);
    thighPlate.rotation.z = side * 0.055;
    thighPlate.castShadow = true;
    thighPlate.receiveShadow = true;
    legNode.add(thighPlate);

    const thighStripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.018, 0.165, 0.016),
      mats.orangeBright
    );
    thighStripe.position.set(side * 0.050, -0.110, 0.078);
    thighStripe.rotation.z = side * 0.04;
    legNode.add(thighStripe);
  }

  // Long shin guards balance the large forearms and make the lower-body
  // silhouette read clearly during sprint/crouch.
  for (const [legNode, side] of [
    [bones.leftLowerLeg, -1],
    [bones.rightLowerLeg, 1]
  ]) {
    if (!legNode) continue;

    const shin = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 14, 9),
      mats.shellLight
    );
    shin.name =
      side < 0 ? 'LeftShinShell' : 'RightShinShell';
    shin.scale.set(0.060, 0.145, 0.036);
    shin.position.set(0, -0.155, 0.045);
    shin.castShadow = true;
    shin.receiveShadow = true;
    legNode.add(shin);

    const shinRidge = new THREE.Mesh(
      new THREE.BoxGeometry(0.018, 0.195, 0.015),
      mats.orangeBright
    );
    shinRidge.position.set(side * 0.043, -0.155, 0.073);
    shinRidge.rotation.z = side * 0.025;
    legNode.add(shinRidge);
  }

  // Knee armor.
  for (const [legNode, side] of [[bones.leftLowerLeg, -1], [bones.rightLowerLeg, 1]]) {
    if (!legNode) continue;
    const pad = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 12, 9),
      mats.orange
    );
    pad.name = side < 0 ? 'LeftKneeArmor' : 'RightKneeArmor';
    pad.scale.set(0.075, 0.060, 0.038);
    pad.position.set(0, -0.035, 0.060);
    pad.castShadow = true;
    legNode.add(pad);

    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 10, 8),
      mats.shell
    );
    cap.scale.set(0.050, 0.038, 0.025);
    cap.position.set(0, -0.032, 0.083);
    cap.castShadow = true;
    legNode.add(cap);

    const kneeEdge = new THREE.Mesh(
      new THREE.BoxGeometry(0.090, 0.015, 0.018),
      mats.shellHighlight
    );
    kneeEdge.position.set(0, -0.010, 0.102);
    kneeEdge.rotation.z = side * 0.03;
    legNode.add(kneeEdge);
  }

  // Cream/orange boot armor overlays.
  for (const [footNode, side] of [[bones.leftFoot, -1], [bones.rightFoot, 1]]) {
    if (!footNode) continue;
    const boot = new THREE.Group();
    boot.name = side < 0 ? 'LeftBootArmor' : 'RightBootArmor';
    footNode.add(boot);

    const toe = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 14, 10),
      mats.cream
    );
    toe.scale.set(0.070, 0.040, 0.115);
    toe.position.set(0, 0.006, 0.055);
    toe.castShadow = true;
    boot.add(toe);

    const toeShell = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 12, 8),
      mats.shellLight
    );
    toeShell.scale.set(0.060, 0.030, 0.082);
    toeShell.position.set(0, 0.026, 0.090);
    toeShell.castShadow = true;
    toeShell.receiveShadow = true;
    boot.add(toeShell);

    const ankle = new THREE.Mesh(
      new THREE.BoxGeometry(0.090, 0.075, 0.060),
      mats.orange
    );
    ankle.position.set(0, 0.042, 0.005);
    ankle.castShadow = true;
    boot.add(ankle);

    const sole = new THREE.Mesh(
      new THREE.BoxGeometry(0.095, 0.020, 0.155),
      mats.dark
    );
    sole.position.set(0, -0.020, 0.045);
    sole.castShadow = true;
    boot.add(sole);

    const heel = new THREE.Mesh(
      new THREE.BoxGeometry(0.085, 0.055, 0.055),
      mats.shell
    );
    heel.position.set(0, 0.010, -0.040);
    heel.castShadow = true;
    boot.add(heel);

    const bootCuff = new THREE.Mesh(
      new THREE.TorusGeometry(0.050, 0.012, 6, 14),
      mats.orangeBright
    );
    bootCuff.rotation.x = Math.PI / 2;
    bootCuff.position.set(0, 0.070, -0.005);
    boot.add(bootCuff);

    const bootEdge = new THREE.Mesh(
      new THREE.BoxGeometry(0.014, 0.050, 0.120),
      mats.shellHighlight
    );
    bootEdge.position.set(side * 0.052, 0.018, 0.050);
    boot.add(bootEdge);
  }

  return refs;
}

function retintAvatar(scene) {
  const warmSkin = new THREE.Color(0xd79a72);
  const hairBrown = new THREE.Color(0x4f2b22);
  const cream = new THREE.Color(0xe8d5b6);
  const dark = new THREE.Color(0x332824);
  const shellBrown = new THREE.Color(0x6b3526);

  scene.traverse((object) => {
    if (!object.isMesh && !object.isSkinnedMesh) return;

    object.castShadow = true;
    object.receiveShadow = true;

    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];

    for (const material of materials) {
      if (!material?.color) continue;

      const name =
        `${object.name} ${material.name ?? ''}`.toLowerCase();

      if (/hair|bang|fringe/.test(name)) {
        material.color.lerp(hairBrown, 0.76);
        if ('roughness' in material) material.roughness = 0.48;
      } else if (
        /face|skin|body|head/.test(name) &&
        !/eye|brow|lash|mouth/.test(name)
      ) {
        material.color.lerp(warmSkin, 0.16);
        if ('roughness' in material) material.roughness = 0.62;
      } else if (
        /cloth|shirt|top|bottom|pants|short|uniform|dress|outfit/.test(name)
      ) {
        material.color.lerp(cream, 0.42);
        if ('roughness' in material) material.roughness = 0.88;
      } else if (/shoe|boot|belt|strap/.test(name)) {
        material.color.lerp(dark, 0.52);
        if ('roughness' in material) material.roughness = 0.76;
      } else if (/armor|shell|plate|guard/.test(name)) {
        material.color.lerp(shellBrown, 0.38);
        if ('roughness' in material) material.roughness = 0.36;
      }

      if ('metalness' in material && !/eye|skin|face/.test(name)) {
        material.metalness = Math.min(material.metalness ?? 0, 0.12);
      }

      material.needsUpdate = true;
    }
  });
}

function applyIdlePose(bones, baseRotations, blend = 1) {
  // Normalized VRM humanoid bones have consistent axes. Lower the T-pose arms
  // into a relaxed game-ready silhouette while keeping the face/body authored.
  setBoneEuler(bones.leftUpperArm, baseRotations, 0.05, 0.05, -1.08, blend);
  setBoneEuler(bones.rightUpperArm, baseRotations, 0.05, -0.05, 1.08, blend);
  setBoneEuler(bones.leftLowerArm, baseRotations, 0.10, 0.0, -0.12, blend);
  setBoneEuler(bones.rightLowerArm, baseRotations, 0.10, 0.0, 0.12, blend);
}

function stabilizeBaseCoreRotation(character, dt, state) {
  const stabilizer = character.coreRotationStabilizer;
  const authored = character.authoredLocomotion;

  if (!stabilizer) return;

  const crouchBlend = THREE.MathUtils.clamp(
    state?.crouchBlend ?? (state?.crouching ? 1 : 0),
    0,
    1
  );

  const shouldStabilize = Boolean(
    authored?.ready &&
    authored.active &&
    state?.grounded !== false &&
    !state?.sliding &&
    !authored.slideExitActive &&
    crouchBlend < 0.02
  );

  if (!shouldStabilize) {
    stabilizer.active = false;
    stabilizer.filtered.clear();
    return;
  }

  const entries = [
    [character.bones?.hips, 24],
    [character.bones?.spine, 30],
    [character.bones?.chest, 34],
    [character.bones?.upperChest, 36]
  ];

  for (const [node, lambda] of entries) {
    if (!node) continue;

    let filtered = stabilizer.filtered.get(node);

    if (!stabilizer.active || !filtered) {
      filtered = node.quaternion.clone();
      stabilizer.filtered.set(node, filtered);
      continue;
    }

    filtered.slerp(
      node.quaternion,
      1 - Math.exp(-lambda * dt)
    );

    node.quaternion.copy(filtered);
  }

  stabilizer.active = true;
}

function applyStablePelvis(character) {
  const hips = character.bones?.hips;
  const base = hips
    ? character.basePositions?.get(hips)
    : null;

  if (!hips || !base) return;

  // Authored locomotion is rotation-only. Keep idle/run pelvis translation
  // fixed; crouch/jump/slide layers apply their deliberate offsets later.
  hips.position.copy(base);
}

function updatePose(character, dt, state) {
  const { bones, baseRotations } = character;
  const combat = Boolean(state.combat);
  // Throw IK is applied by Fang after camera update, before projectile release.
  const fang = state.fangAnimation?.mode === 'slash' ? state.fangAnimation : null;

  const locomotion = updateLocomotionLayer(character, dt, state);
  const { cycle, moveBlend, stateName, authored } = locomotion;

  const time = performance.now() * 0.001;
  const breathe = Math.sin(time * 2.4) * 0.025;

  // Fortnite-like upper-body weapon state:
  // - equipped but not fighting: stable low-ready two-hand carry
  // - firing OR ADS: same shouldered aim architecture
  // Lower-body locomotion remains authored underneath.
  if (combat && !fang) {
    applyWeaponAimPose(
      bones,
      baseRotations,
      state,
      dt
    );
  } else if (
    state.weaponEquipped &&
    !fang
  ) {
    applyWeaponCarryPose(
      bones,
      baseRotations,
      dt
    );
  } else if (!fang && !authored) {
    const armAmplitude =
      stateName === 'RUN' ? 0.58 :
      stateName === 'WALK' ? 0.36 :
      stateName === 'CROUCH_WALK' ? 0.22 :
      0.04;

    const swing = cycle * armAmplitude * moveBlend;

    dampBoneEuler(
      bones.leftUpperArm,
      baseRotations,
      0.06 - swing,
      0.04,
      -1.08,
      12,
      dt
    );
    dampBoneEuler(
      bones.rightUpperArm,
      baseRotations,
      0.06 + swing,
      -0.04,
      1.08,
      12,
      dt
    );
    dampBoneEuler(bones.leftLowerArm, baseRotations, 0.10, 0, -0.12, 11, dt);
    dampBoneEuler(bones.rightLowerArm, baseRotations, 0.10, 0, 0.12, 11, dt);
    dampBoneEuler(bones.rightHand, baseRotations, 0, 0, 0, 10, dt);
  }

  if (fang) applyRealFangPose(bones, baseRotations, fang, dt);

  if (!authored) {
    dampBoneEuler(
      bones.head,
      baseRotations,
      breathe * 0.18,
      Math.sin(time * 1.5) * 0.025,
      Math.sin(time * 1.1) * 0.018,
      7,
      dt
    );
  }

  animateScoutAccessories(character, locomotion, dt);
}

function updateLocomotionLayer(character, dt, state) {
  const { bones, baseRotations, basePositions, locomotion } = character;
  const speed = Math.max(0, state.speed ?? 0);
  const grounded = state.grounded !== false;
  const crouching = Boolean(state.crouching);
  const crouchBlend = THREE.MathUtils.clamp(
    state.crouchBlend ?? (crouching ? 1 : 0),
    0,
    1
  );
  const sliding = Boolean(state.sliding);
  const sprinting = Boolean(state.sprinting);
  const verticalSpeed = state.verticalSpeed ?? 0;

  const speedForDirection = Math.max(0.001, speed);
  const localForward = speed > 0.05
    ? THREE.MathUtils.clamp(-(state.localZ ?? 0) / speedForDirection, -1, 1)
    : 1;
  const localStrafe = speed > 0.05
    ? THREE.MathUtils.clamp((state.localX ?? 0) / speedForDirection, -1, 1)
    : 0;

  const authored = character.authoredLocomotion;
  if (authored?.ready && authored.active) {
    locomotion.state = authored.state;
    locomotion.phase = authored.phase;
    locomotion.moveBlend = THREE.MathUtils.damp(
      locomotion.moveBlend,
      authored.state === 'IDLE' ? 0 : 1,
      14,
      dt
    );

    return {
      cycle: Math.sin(authored.phase),
      moveBlend: locomotion.moveBlend,
      stateName: authored.state,
      localForward,
      localStrafe,
      authored: true
    };
  }

  const stateName = resolveLocomotionState({
    speed,
    grounded,
    crouching,
    sliding,
    sprinting,
    verticalSpeed
  });

  // Fortnite-like crouch silhouette: pelvis drops, hips hinge, knees flex,
  // ankles counter-rotate and torso leans forward while the feet stay visually
  // planted. This layer remains active through the blend-out after key release.
  if (grounded && !sliding && crouchBlend > 0.01) {
    return applyCrouchLocomotion(
      character,
      dt,
      state,
      {
        speed,
        crouchBlend,
        localForward,
        localStrafe
      }
    );
  }

  if (!locomotion.previousGrounded && grounded) {
    locomotion.landing = 1;
  }
  locomotion.previousGrounded = grounded;
  locomotion.landing = Math.max(0, locomotion.landing - dt * 6.5);
  locomotion.state = stateName;

  const targetMoveBlend =
    stateName === 'WALK' ||
    stateName === 'RUN' ||
    stateName === 'CROUCH_WALK'
      ? 1
      : 0;
  locomotion.moveBlend = THREE.MathUtils.damp(
    locomotion.moveBlend,
    targetMoveBlend,
    12,
    dt
  );

  let cadence = 0;
  if (stateName === 'WALK') cadence = 7.6;
  if (stateName === 'RUN') cadence = 12.4;
  if (stateName === 'CROUCH_WALK') cadence = 6.2;

  const reverse = localForward < -0.25 ? -1 : 1;

  if (cadence > 0) locomotion.phase += dt * cadence * reverse;

  const cycle = Math.sin(locomotion.phase);
  const cycleOpposite = -cycle;
  const liftL = Math.max(0, cycle);
  const liftR = Math.max(0, cycleOpposite);
  const landing = locomotion.landing;

  let stride = 0;
  let knee = 0;
  let lean = 0;
  let hipDrop = 0;
  let hipRoll = 0;
  let footCounter = 0;
  let baseThigh = 0;
  let baseKnee = 0;

  if (stateName === 'WALK') {
    stride = 0.54;
    knee = 0.58;
    lean = 0.035;
    hipRoll = 0.035;
    footCounter = 0.22;
  } else if (stateName === 'RUN') {
    stride = 0.88;
    knee = 0.94;
    lean = 0.13;
    hipRoll = 0.055;
    footCounter = 0.34;
  } else if (stateName === 'CROUCH_WALK') {
    stride = 0.31;
    knee = 0.42;
    lean = 0.10;
    hipDrop = 0.14;
    baseThigh = -0.34;
    baseKnee = 0.58;
    footCounter = 0.16;
  } else if (stateName === 'CROUCH') {
    lean = 0.08;
    hipDrop = 0.15;
    baseThigh = -0.42;
    baseKnee = 0.72;
  }

  if (stateName === 'SLIDE') {
    // Actual lower-body skid pose is applied after locomotion by slide-pose.js.
  } else if (stateName === 'JUMP' || stateName === 'FALL') {
    const rising = stateName === 'JUMP';
    dampBoneEuler(
      bones.leftUpperLeg,
      baseRotations,
      rising ? -0.36 : -0.14,
      0,
      -0.045,
      13,
      dt
    );
    dampBoneEuler(
      bones.rightUpperLeg,
      baseRotations,
      rising ? -0.20 : -0.08,
      0,
      0.045,
      13,
      dt
    );
    dampBoneEuler(
      bones.leftLowerLeg,
      baseRotations,
      rising ? 0.62 : 0.42,
      0,
      0,
      13,
      dt
    );
    dampBoneEuler(
      bones.rightLowerLeg,
      baseRotations,
      rising ? 0.48 : 0.36,
      0,
      0,
      13,
      dt
    );
    dampBoneEuler(bones.leftFoot, baseRotations, -0.18, 0, 0, 12, dt);
    dampBoneEuler(bones.rightFoot, baseRotations, -0.12, 0, 0, 12, dt);
    dampBoneEuler(bones.hips, baseRotations, rising ? -0.10 : 0.04, 0, 0, 10, dt);
    dampBoneEuler(bones.spine, baseRotations, rising ? 0.07 : -0.03, 0, 0, 9, dt);
  } else {
    const moveBlend = locomotion.moveBlend;
    const swingL = cycle * stride * moveBlend;
    const swingR = cycleOpposite * stride * moveBlend;
    const strafeLeg = localStrafe * 0.08 * moveBlend;

    const kneeL = baseKnee + liftR * knee * moveBlend + landing * 0.24;
    const kneeR = baseKnee + liftL * knee * moveBlend + landing * 0.24;

    dampBoneEuler(
      bones.leftUpperLeg,
      baseRotations,
      baseThigh + swingL - landing * 0.12,
      localStrafe * -0.035,
      strafeLeg,
      14,
      dt
    );
    dampBoneEuler(
      bones.rightUpperLeg,
      baseRotations,
      baseThigh + swingR - landing * 0.12,
      localStrafe * 0.035,
      -strafeLeg,
      14,
      dt
    );
    dampBoneEuler(bones.leftLowerLeg, baseRotations, kneeL, 0, 0, 15, dt);
    dampBoneEuler(bones.rightLowerLeg, baseRotations, kneeR, 0, 0, 15, dt);

    dampBoneEuler(
      bones.leftFoot,
      baseRotations,
      -swingL * footCounter - liftL * 0.10,
      0,
      0,
      15,
      dt
    );
    dampBoneEuler(
      bones.rightFoot,
      baseRotations,
      -swingR * footCounter - liftR * 0.10,
      0,
      0,
      15,
      dt
    );

    const roll = Math.cos(locomotion.phase * 2) * hipRoll * moveBlend;
    dampBoneEuler(
      bones.hips,
      baseRotations,
      -lean - landing * 0.08,
      localStrafe * 0.035,
      roll + localStrafe * -0.035,
      12,
      dt
    );
    dampBoneEuler(
      bones.spine,
      baseRotations,
      lean * 0.52 + landing * 0.05,
      localStrafe * -0.028,
      -roll * 0.40,
      10,
      dt
    );
  }

  const stepBob =
    cadence > 0
      ? Math.abs(Math.sin(locomotion.phase * 2)) *
        (stateName === 'RUN' ? 0.018 : 0.010) *
        locomotion.moveBlend
      : 0;

  dampBonePosition(
    bones.hips,
    basePositions,
    0,
    -hipDrop - landing * 0.055 + stepBob,
    0,
    15,
    dt
  );

  return {
    cycle,
    moveBlend: locomotion.moveBlend,
    stateName,
    localForward,
    localStrafe,
    authored: false
  };
}

function applyCrouchLocomotion(
  character,
  dt,
  state,
  { speed, crouchBlend, localForward, localStrafe }
) {
  const { locomotion } = character;
  const moving = speed > 0.32;

  locomotion.moveBlend = THREE.MathUtils.damp(
    locomotion.moveBlend,
    moving ? 1 : 0,
    10,
    dt
  );

  if (moving) {
    const reverse = localForward < -0.25 ? -1 : 1;
    locomotion.phase += dt * 6.3 * reverse;
  }

  locomotion.state = moving ? 'CROUCH_WALK' : 'CROUCH';

  // Actual body deformation is applied later by crouch-pose.js in world space,
  // after locomotion, so the feet stay planted and knees are forced to bend.
  return {
    cycle: Math.sin(locomotion.phase),
    moveBlend: locomotion.moveBlend,
    stateName: locomotion.state,
    localForward,
    localStrafe,
    authored: false,
    crouchBlend
  };
}

function resolveLocomotionState({
  speed,
  grounded,
  crouching,
  sliding,
  sprinting,
  verticalSpeed
}) {
  if (!grounded) return verticalSpeed > 0.15 ? 'JUMP' : 'FALL';
  if (sliding) return 'SLIDE';
  if (crouching) return speed > 0.35 ? 'CROUCH_WALK' : 'CROUCH';
  if (speed < 0.28) return 'IDLE';
  if (sprinting || speed > 6.15) return 'RUN';
  return 'WALK';
}

function animateScoutAccessories(character, locomotion, dt) {
  const antennae = character.accessories?.antennaRoot;
  if (antennae) {
    const fast =
      locomotion.stateName === 'RUN' ||
      locomotion.stateName === 'SPRINT';
    const moving =
      fast ||
      locomotion.stateName === 'WALK' ||
      locomotion.stateName === 'JOG' ||
      locomotion.stateName === 'CROUCH_WALK' ||
      locomotion.stateName === 'CROUCH_BLEND_MOVE';

    const targetX = fast
      ? -0.10 +
        Math.cos(character.locomotion.phase) * 0.035
      : moving
        ? -0.045 +
          Math.cos(character.locomotion.phase) * 0.018
        : 0;

    antennae.rotation.x = THREE.MathUtils.damp(
      antennae.rotation.x,
      targetX,
      7,
      dt
    );
    antennae.rotation.z = THREE.MathUtils.damp(
      antennae.rotation.z,
      -locomotion.localStrafe * 0.055,
      8,
      dt
    );
  }

  const shell = character.accessories?.shellRoot;
  if (shell) {
    // The shell also carries the short elytra/wings. Driving this entire
    // assembly at twice the gait frequency made the hero silhouette look like
    // it was vibrating even after the actual skeleton had been stabilized.
    // Keep the authored body animation responsible for gait motion and let the
    // shell settle to one stable mount angle.
    shell.rotation.x = THREE.MathUtils.damp(
      shell.rotation.x,
      -0.055,
      7,
      dt
    );

    if (Math.abs(shell.rotation.x + 0.055) < 0.0005) {
      shell.rotation.x = -0.055;
    }
  }
}

function applyWeaponAimPose(
  bones,
  baseRotations,
  state,
  dt
) {
  const pitch = THREE.MathUtils.clamp(
    state.aimPitch ?? 0,
    -0.68,
    0.86
  );
  const yaw = THREE.MathUtils.clamp(
    state.aimYawOffset ?? 0,
    -1.18,
    1.18
  );

  const ads = THREE.MathUtils.clamp(
    state.weaponAimBlend ??
      (state.aiming ? 1 : 0),
    0,
    1
  );

  const shoulder = THREE.MathUtils.clamp(
    state.weaponShoulderBlend ?? 1,
    0,
    1
  );

  // Hip-fire already uses the camera direction, but ADS pulls the rifle
  // tighter into the shoulder and distributes more of the aim through the
  // chest/upper chest. This behaves like a small additive aim-space layered
  // over authored locomotion rather than replacing the lower body.
  const spinePitch =
    THREE.MathUtils.lerp(0.13, 0.20, ads);
  const spineYaw =
    THREE.MathUtils.lerp(0.19, 0.24, ads);
  const chestPitch =
    THREE.MathUtils.lerp(0.19, 0.28, ads);
  const chestYaw =
    THREE.MathUtils.lerp(0.27, 0.34, ads);
  const upperPitch =
    THREE.MathUtils.lerp(0.15, 0.23, ads);
  const upperYaw =
    THREE.MathUtils.lerp(0.20, 0.28, ads);

  dampBoneEuler(
    bones.spine,
    baseRotations,
    -pitch * spinePitch * shoulder,
    yaw * spineYaw * shoulder,
    -yaw * 0.018 * shoulder,
    21,
    dt
  );
  dampBoneEuler(
    bones.chest,
    baseRotations,
    -pitch * chestPitch * shoulder,
    yaw * chestYaw * shoulder,
    -yaw * 0.026 * shoulder,
    23,
    dt
  );
  dampBoneEuler(
    bones.upperChest,
    baseRotations,
    -pitch * upperPitch * shoulder,
    yaw * upperYaw * shoulder,
    -yaw * 0.010 * shoulder,
    24,
    dt
  );
  dampBoneEuler(
    bones.neck,
    baseRotations,
    -pitch *
      THREE.MathUtils.lerp(0.06, 0.09, ads) *
      shoulder,
    yaw *
      THREE.MathUtils.lerp(0.045, 0.07, ads) *
      shoulder,
    0,
    20,
    dt
  );
  dampBoneEuler(
    bones.head,
    baseRotations,
    -pitch *
      THREE.MathUtils.lerp(0.045, 0.07, ads) *
      shoulder,
    yaw *
      THREE.MathUtils.lerp(0.035, 0.05, ads) *
      shoulder,
    0,
    20,
    dt
  );

  // Narrower shoulder pocket in ADS; hip-fire remains athletic but relaxed.
  dampBoneEuler(
    bones.leftShoulder,
    baseRotations,
    THREE.MathUtils.lerp(-0.045, -0.085, ads),
    THREE.MathUtils.lerp(0.035, 0.060, ads),
    THREE.MathUtils.lerp(-0.095, -0.135, ads),
    26,
    dt
  );
  dampBoneEuler(
    bones.rightShoulder,
    baseRotations,
    THREE.MathUtils.lerp(-0.040, -0.075, ads),
    THREE.MathUtils.lerp(-0.030, -0.050, ads),
    THREE.MathUtils.lerp(0.090, 0.120, ads),
    26,
    dt
  );
}

function applyWeaponCarryPose(
  bones,
  baseRotations,
  dt
) {
  // Low-ready Fortnite-style carry: both hands stay on the weapon and the
  // upper body remains stable while locomotion continues underneath.
  dampBoneEuler(
    bones.spine,
    baseRotations,
    -0.025,
    0,
    0,
    16,
    dt
  );
  dampBoneEuler(
    bones.chest,
    baseRotations,
    -0.045,
    0,
    0,
    17,
    dt
  );
  dampBoneEuler(
    bones.upperChest,
    baseRotations,
    -0.025,
    0,
    0,
    17,
    dt
  );

  dampBoneEuler(
    bones.leftShoulder,
    baseRotations,
    -0.035,
    0.035,
    -0.08,
    18,
    dt
  );
  dampBoneEuler(
    bones.rightShoulder,
    baseRotations,
    -0.03,
    -0.03,
    0.08,
    18,
    dt
  );

  dampBoneEuler(
    bones.leftUpperArm,
    baseRotations,
    -0.50,
    0.10,
    -0.60,
    19,
    dt
  );
  dampBoneEuler(
    bones.leftLowerArm,
    baseRotations,
    -0.68,
    -0.035,
    -0.16,
    19,
    dt
  );
  dampBoneEuler(
    bones.rightUpperArm,
    baseRotations,
    -0.40,
    -0.06,
    0.60,
    19,
    dt
  );
  dampBoneEuler(
    bones.rightLowerArm,
    baseRotations,
    -0.66,
    0.025,
    0.15,
    19,
    dt
  );
}

const IK_TMP = {
  shoulder: new THREE.Vector3(),
  elbow: new THREE.Vector3(),
  hand: new THREE.Vector3(),
  target: new THREE.Vector3(),
  toTarget: new THREE.Vector3(),
  dir: new THREE.Vector3(),
  poleDir: new THREE.Vector3(),
  elbowTarget: new THREE.Vector3(),
  currentDir: new THREE.Vector3(),
  desiredDir: new THREE.Vector3(),
  rootQ: new THREE.Quaternion(),
  right: new THREE.Vector3(),
  forward: new THREE.Vector3(),
  down: new THREE.Vector3(0, -1, 0),
  pole: new THREE.Vector3(),
  boneWorldQ: new THREE.Quaternion(),
  parentWorldQ: new THREE.Quaternion(),
  parentWorldQInv: new THREE.Quaternion(),
  deltaWorldQ: new THREE.Quaternion(),
  desiredWorldQ: new THREE.Quaternion(),
  desiredLocalQ: new THREE.Quaternion()
};

function applyTwoHandWeaponIK(character, gripPose, dt) {
  const { bones } = character;
  if (
    !gripPose?.aiming ||
    !bones.leftUpperArm ||
    !bones.leftLowerArm ||
    !bones.leftHand
  ) {
    return;
  }

  character.root.updateWorldMatrix(true, true);
  character.root.getWorldQuaternion(IK_TMP.rootQ);

  IK_TMP.right
    .set(1, 0, 0)
    .applyQuaternion(IK_TMP.rootQ)
    .normalize();
  IK_TMP.forward
    .set(0, 0, -1)
    .applyQuaternion(IK_TMP.rootQ)
    .normalize();

  // In normal carry the right hand OWNS the weapon via weaponSocket.
  // Solving that same hand back to a grip on the weapon creates a circular
  // dependency and visible jitter. Right-arm IK is only enabled when the
  // camera/shoulder owns the weapon transform (ADS / active combat pose).
  if (
    gripPose.rightHandIK &&
    bones.rightUpperArm &&
    bones.rightLowerArm &&
    bones.rightHand
  ) {
    const ads = THREE.MathUtils.clamp(
      gripPose.adsBlend ?? 0,
      0,
      1
    );

    bones.rightUpperArm.getWorldPosition(IK_TMP.shoulder);
    IK_TMP.pole
      .copy(IK_TMP.shoulder)
      .addScaledVector(
        IK_TMP.right,
        THREE.MathUtils.lerp(0.25, 0.18, ads)
      )
      .addScaledVector(
        IK_TMP.down,
        THREE.MathUtils.lerp(0.20, 0.16, ads)
      )
      .addScaledVector(
        IK_TMP.forward,
        THREE.MathUtils.lerp(0.050, 0.030, ads)
      );

    solveTwoBoneIK(
      character.root,
      bones.rightUpperArm,
      bones.rightLowerArm,
      bones.rightHand,
      gripPose.rightGrip,
      IK_TMP.pole,
      THREE.MathUtils.lerp(40, 50, ads),
      dt
    );

    character.root.updateWorldMatrix(true, true);
  }

  if (
    gripPose.rightHandOrient &&
    bones.rightHand
  ) {
    alignWeaponHandToSocket(
      character,
      bones.rightHand,
      gripPose.weaponQuaternion,
      gripPose.rightHandIK ? 30 : 24,
      dt
    );
    character.root.updateWorldMatrix(true, true);
  }

  // The support elbow drops slightly and tucks inward as ADS tightens,
  // matching a shouldered rifle silhouette instead of a wide T-pose bend.
  const supportAds = THREE.MathUtils.clamp(
    gripPose.adsBlend ?? 0,
    0,
    1
  );

  bones.leftUpperArm.getWorldPosition(IK_TMP.shoulder);
  IK_TMP.pole
    .copy(IK_TMP.shoulder)
    .addScaledVector(
      IK_TMP.right,
      THREE.MathUtils.lerp(-0.24, -0.19, supportAds)
    )
    .addScaledVector(
      IK_TMP.down,
      THREE.MathUtils.lerp(0.18, 0.22, supportAds)
    )
    .addScaledVector(
      IK_TMP.forward,
      THREE.MathUtils.lerp(0.070, 0.090, supportAds)
    );

  solveTwoBoneIK(
    character.root,
    bones.leftUpperArm,
    bones.leftLowerArm,
    bones.leftHand,
    gripPose.leftGrip,
    IK_TMP.pole,
    Math.max(
      gripPose.leftHandLambda ?? 30,
      THREE.MathUtils.lerp(42, 54, supportAds)
    ),
    dt
  );
}

function alignWeaponHandToSocket(
  character,
  hand,
  weaponWorldQuaternion,
  lambda,
  dt
) {
  const socket = character.weaponSocket;
  if (!socket || !hand?.parent || !weaponWorldQuaternion) return;

  // weaponWorldQ = handWorldQ * socketLocalQ
  // => handWorldQ = weaponWorldQ * inverse(socketLocalQ)
  IK_TMP.deltaWorldQ
    .copy(socket.quaternion)
    .invert();

  IK_TMP.desiredWorldQ
    .copy(weaponWorldQuaternion)
    .multiply(IK_TMP.deltaWorldQ);

  hand.parent.getWorldQuaternion(IK_TMP.parentWorldQ);
  IK_TMP.parentWorldQInv
    .copy(IK_TMP.parentWorldQ)
    .invert();

  IK_TMP.desiredLocalQ
    .copy(IK_TMP.parentWorldQInv)
    .multiply(IK_TMP.desiredWorldQ);

  hand.quaternion.slerp(
    IK_TMP.desiredLocalQ,
    1 - Math.exp(-lambda * dt)
  );

  character.root.updateWorldMatrix(true, true);
}

function solveTwoBoneIK(
  root,
  upper,
  lower,
  hand,
  targetWorld,
  poleWorld,
  lambda,
  dt
) {
  root.updateWorldMatrix(true, true);

  upper.getWorldPosition(IK_TMP.shoulder);
  lower.getWorldPosition(IK_TMP.elbow);
  hand.getWorldPosition(IK_TMP.hand);

  const upperLen = Math.max(
    0.001,
    IK_TMP.shoulder.distanceTo(IK_TMP.elbow)
  );
  const lowerLen = Math.max(
    0.001,
    IK_TMP.elbow.distanceTo(IK_TMP.hand)
  );

  IK_TMP.toTarget
    .copy(targetWorld)
    .sub(IK_TMP.shoulder);

  let targetDist = IK_TMP.toTarget.length();
  if (targetDist < 0.001) return;

  const minReach = Math.abs(upperLen - lowerLen) + 0.003;
  const maxReach = upperLen + lowerLen - 0.003;
  targetDist = THREE.MathUtils.clamp(
    targetDist,
    minReach,
    maxReach
  );

  IK_TMP.dir
    .copy(IK_TMP.toTarget)
    .normalize();

  IK_TMP.poleDir
    .copy(poleWorld)
    .sub(IK_TMP.shoulder);

  // Remove component along the shoulder->hand direction to get the bend plane.
  IK_TMP.poleDir.addScaledVector(
    IK_TMP.dir,
    -IK_TMP.poleDir.dot(IK_TMP.dir)
  );

  if (IK_TMP.poleDir.lengthSq() < 0.000001) {
    IK_TMP.poleDir
      .copy(IK_TMP.right)
      .addScaledVector(
        IK_TMP.dir,
        -IK_TMP.right.dot(IK_TMP.dir)
      );
  }
  IK_TMP.poleDir.normalize();

  const cosShoulder = THREE.MathUtils.clamp(
    (
      upperLen * upperLen +
      targetDist * targetDist -
      lowerLen * lowerLen
    ) /
      (2 * upperLen * targetDist),
    -1,
    1
  );

  const along = cosShoulder * upperLen;
  const bend = Math.sqrt(
    Math.max(0, upperLen * upperLen - along * along)
  );

  IK_TMP.elbowTarget
    .copy(IK_TMP.shoulder)
    .addScaledVector(IK_TMP.dir, along)
    .addScaledVector(IK_TMP.poleDir, bend);

  rotateBoneChildToward(
    root,
    upper,
    lower,
    IK_TMP.elbowTarget,
    lambda,
    dt
  );

  root.updateWorldMatrix(true, true);

  // Recompute after the upper-arm correction.
  rotateBoneChildToward(
    root,
    lower,
    hand,
    targetWorld,
    lambda,
    dt
  );

  root.updateWorldMatrix(true, true);
}

function rotateBoneChildToward(
  root,
  bone,
  child,
  targetWorld,
  lambda,
  dt
) {
  bone.getWorldPosition(IK_TMP.shoulder);
  child.getWorldPosition(IK_TMP.hand);

  IK_TMP.currentDir
    .copy(IK_TMP.hand)
    .sub(IK_TMP.shoulder);

  IK_TMP.desiredDir
    .copy(targetWorld)
    .sub(IK_TMP.shoulder);

  if (
    IK_TMP.currentDir.lengthSq() < 0.000001 ||
    IK_TMP.desiredDir.lengthSq() < 0.000001
  ) {
    return;
  }

  IK_TMP.currentDir.normalize();
  IK_TMP.desiredDir.normalize();

  IK_TMP.deltaWorldQ.setFromUnitVectors(
    IK_TMP.currentDir,
    IK_TMP.desiredDir
  );

  bone.getWorldQuaternion(IK_TMP.boneWorldQ);
  IK_TMP.desiredWorldQ
    .copy(IK_TMP.deltaWorldQ)
    .multiply(IK_TMP.boneWorldQ);

  if (bone.parent) {
    bone.parent.getWorldQuaternion(IK_TMP.parentWorldQ);
    IK_TMP.parentWorldQInv
      .copy(IK_TMP.parentWorldQ)
      .invert();

    IK_TMP.desiredLocalQ
      .copy(IK_TMP.parentWorldQInv)
      .multiply(IK_TMP.desiredWorldQ);
  } else {
    IK_TMP.desiredLocalQ.copy(IK_TMP.desiredWorldQ);
  }

  bone.quaternion.slerp(
    IK_TMP.desiredLocalQ,
    1 - Math.exp(-lambda * dt)
  );

  root.updateWorldMatrix(true, true);
}

function applyRealFangPose(bones, baseRotations, fang, dt) {
  const mode = fang.mode ?? 'aim';
  const t = THREE.MathUtils.clamp(fang.t ?? 0, 0, 1);

  let upper;
  let lower;
  let hand;
  let shoulder;
  let chest;

  if (mode === 'slash') {
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
    hand = [
      THREE.MathUtils.lerp(-0.22, 0.28, swing),
      0,
      THREE.MathUtils.lerp(0.18, -0.20, swing)
    ];
    shoulder = [-0.06, 0, 0.10];
    chest = [0, THREE.MathUtils.lerp(0.10, -0.10, swing), 0];
  } else {
    return;
  }

  dampBoneEuler(
    bones.rightShoulder,
    baseRotations,
    ...shoulder,
    24,
    dt
  );
  dampBoneEuler(
    bones.rightUpperArm,
    baseRotations,
    ...upper,
    26,
    dt
  );
  dampBoneEuler(
    bones.rightLowerArm,
    baseRotations,
    ...lower,
    28,
    dt
  );
  dampBoneEuler(
    bones.rightHand,
    baseRotations,
    ...hand,
    28,
    dt
  );
  dampBoneEuler(
    bones.upperChest ?? bones.chest,
    baseRotations,
    ...chest,
    20,
    dt
  );
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

function dampBonePosition(node, basePositions, x, y, z, lambda, dt) {
  if (!node) return;
  const base = basePositions.get(node) ?? new THREE.Vector3();
  node.position.x = THREE.MathUtils.damp(node.position.x, base.x + x, lambda, dt);
  node.position.y = THREE.MathUtils.damp(node.position.y, base.y + y, lambda, dt);
  node.position.z = THREE.MathUtils.damp(node.position.z, base.z + z, lambda, dt);
}

function dampBoneEuler(node, baseRotations, x, y, z, lambda, dt) {
  if (!node) return;
  const base = baseRotations.get(node) ?? new THREE.Quaternion();
  const offset = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
  const target = base.clone().multiply(offset);
  node.quaternion.slerp(target, 1 - Math.exp(-lambda * dt));
}
