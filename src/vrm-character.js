import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { createVrmLocomotionController } from './vrm-locomotion.js';
import { createFangPoseLayer } from './fang-pose.js';

// Temporary development avatar used only to validate the real VRM pipeline.
// Source: norio/vrm-game-starter (their README states the bundled VRoid sample
// avatars are redistributed under their own VRM metadata terms).
export const FINAL_VRM_URL = '/assets/characters/roach-scout.vrm';
export const FINAL_GLB_URL = '/assets/characters/roach-scout.glb';

// Temporary rig remains the safety fallback only.
export const DEVELOPMENT_VRM_URL =
  'https://cdn.jsdelivr.net/gh/norio/vrm-game-starter@b14c236fd8150855348ad085b7820c298eac4b30/src/assets/sample2.vrm';

export async function loadRoachScoutVrmBase() {
  const candidates = [
    { type: 'vrm', url: FINAL_VRM_URL, final: true },
    { type: 'glb', url: FINAL_GLB_URL, final: true },
    { type: 'vrm', url: DEVELOPMENT_VRM_URL, final: false }
  ];

  let lastError = null;

  for (const candidate of candidates) {
    try {
      const avatar = candidate.type === 'vrm'
        ? await loadVrmAvatar(candidate.url)
        : await loadHumanoidGlb(candidate.url);

      avatar.sourceUrl = candidate.url;
      avatar.finalAsset = candidate.final;
      avatar.assetType = candidate.type;
      return avatar;
    } catch (error) {
      lastError = error;
      if (candidate.final) {
        console.info(
          `Roach Scout final ${candidate.type.toUpperCase()} unavailable; trying next source.`,
          error
        );
      }
    }
  }

  throw lastError ?? new Error('No character source could be loaded.');
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
  const character = buildCharacterInterface({
    root,
    modelRoot,
    scene: vrm.scene,
    bones,
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

function buildCharacterInterface({
  root,
  modelRoot,
  scene,
  bones,
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

  const accessories = applyScoutAccessories
    ? attachRoachAccessories(bones)
    : {};

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
    scene,
    vrm,
    bones,
    weaponSocket,
    fangSocket,
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
    authoredLocomotion: null,
    authoredLocomotionReady: null,
    update(dt, state = {}) {
      this.fangPoseLayer?.restore();
      this.authoredLocomotion?.update(dt, state);
      updatePose(this, dt, state);
      vrm?.update?.(dt);
    },
    setVisible(visible) {
      root.visible = Boolean(visible);
    },
    setRightArmHidden() {},
    getHandWorldPosition(side = 'right', target = new THREE.Vector3()) {
      const hand = side === 'left' ? bones.leftHand : bones.rightHand;
      if (!hand) return null;
      hand.getWorldPosition(target);
      return target;
    },
    applyFangPose(fang, dt) {
      this.fangPoseLayer ??= createFangPoseLayer(this);
      this.fangPoseLayer.apply(fang, dt);
      vrm?.update?.(0);
    },
    applyWeaponIK(gripPose, dt) {
      applyTwoHandWeaponIK(this, gripPose, dt);
      vrm?.update?.(0);
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
    shell: new THREE.MeshToonMaterial({ color: 0x5c2e20 }),
    shellLight: new THREE.MeshToonMaterial({ color: 0x7e4028 }),
    orange: new THREE.MeshToonMaterial({ color: 0xc76f34 }),
    orangeBright: new THREE.MeshToonMaterial({ color: 0xe58a43 }),
    cream: new THREE.MeshToonMaterial({ color: 0xf0ddbd }),
    creamDark: new THREE.MeshToonMaterial({ color: 0xc8aa7d }),
    dark: new THREE.MeshToonMaterial({ color: 0x2f2522 }),
    leather: new THREE.MeshToonMaterial({ color: 0x4a3026 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x8f673f, roughness: 0.42, metalness: 0.55 }),
    lens: new THREE.MeshStandardMaterial({
      color: 0x29221f,
      roughness: 0.14,
      metalness: 0.68,
      emissive: 0x120d0a,
      emissiveIntensity: 0.12
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

    // Extra stylized hair crest to push the temporary base toward our sheet.
    const crest = new THREE.Group();
    crest.name = 'RoachScoutHairCrest';
    crest.position.set(0, 0.10, 0.005);
    bones.head.add(crest);

    const tuftData = [
      [-0.060, 0.020, 0.025, 0.040, 0.085, -0.32],
      [-0.020, 0.040, 0.030, 0.050, 0.105, -0.10],
      [0.025, 0.044, 0.028, 0.052, 0.112, 0.08],
      [0.066, 0.020, 0.018, 0.043, 0.090, 0.30]
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
    refs.scarf = scarf;
  }

  const chest = bones.upperChest ?? bones.chest;
  if (chest) {
    const torsoGear = new THREE.Group();
    torsoGear.name = 'RoachScoutTorsoGear';
    chest.add(torsoGear);

    // Cream chest bib.
    const bib = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 18, 12),
      mats.cream
    );
    bib.scale.set(0.155, 0.205, 0.035);
    bib.position.set(0, -0.055, 0.105);
    bib.castShadow = true;
    torsoGear.add(bib);

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
      boneNode.add(cap);
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
    refs.belt = belt;
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
    handNode.add(cuff);
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
    legNode.add(cap);
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
    boot.add(sole);
  }

  return refs;
}

function retintAvatar(scene) {
  const warmSkin = new THREE.Color(0xd99866);
  const hairBrown = new THREE.Color(0x5f3324);
  const cream = new THREE.Color(0xe6d0aa);
  const dark = new THREE.Color(0x3b2a24);

  scene.traverse((object) => {
    if (!object.isMesh && !object.isSkinnedMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];

    for (const material of materials) {
      if (!material?.color) continue;
      const name = `${object.name} ${material.name ?? ''}`.toLowerCase();

      if (/hair|bang|fringe/.test(name)) {
        material.color.lerp(hairBrown, 0.68);
      } else if (/face|skin|body|head/.test(name) && !/eye|brow|lash|mouth/.test(name)) {
        material.color.lerp(warmSkin, 0.18);
      } else if (/cloth|shirt|top|bottom|pants|short|uniform|dress|outfit/.test(name)) {
        material.color.lerp(cream, 0.34);
      } else if (/shoe|boot|belt|strap/.test(name)) {
        material.color.lerp(dark, 0.38);
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

function updatePose(character, dt, state) {
  const { bones, baseRotations } = character;
  const combat = Boolean(state.combat);
  // Throw IK is applied by Fang after camera update, before projectile release.
  const fang = state.fangAnimation?.mode === 'slash' ? state.fangAnimation : null;

  const locomotion = updateLocomotionLayer(character, dt, state);
  const { cycle, moveBlend, stateName, authored } = locomotion;

  const time = performance.now() * 0.001;
  const breathe = Math.sin(time * 2.4) * 0.025;

  // Upper-body weapon layer runs after locomotion.
  if (state.aiming && !fang) {
    applyWeaponAimPose(bones, baseRotations, state, dt);
  } else if (combat && !fang) {
    applyHipFirePose(bones, baseRotations, state, dt);
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
    hipDrop = 0.19;
    dampBoneEuler(bones.leftUpperLeg, baseRotations, -0.82, -0.08, -0.05, 18, dt);
    dampBoneEuler(bones.leftLowerLeg, baseRotations, 1.10, 0, 0.04, 18, dt);
    dampBoneEuler(bones.leftFoot, baseRotations, -0.24, 0, 0, 18, dt);
    dampBoneEuler(bones.rightUpperLeg, baseRotations, 0.24, 0.08, 0.08, 18, dt);
    dampBoneEuler(bones.rightLowerLeg, baseRotations, 0.30, 0, -0.04, 18, dt);
    dampBoneEuler(bones.rightFoot, baseRotations, 0.12, 0, 0, 18, dt);
    dampBoneEuler(bones.hips, baseRotations, 0.18, 0, localStrafe * -0.06, 16, dt);
    dampBoneEuler(bones.spine, baseRotations, -0.12, 0, 0, 14, dt);
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
    const targetX =
      locomotion.stateName === 'RUN'
        ? -0.10 + Math.cos(character.locomotion.phase) * 0.035
        : locomotion.stateName === 'WALK'
          ? -0.045 + Math.cos(character.locomotion.phase) * 0.018
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
    const target = -0.055 +
      (locomotion.stateName === 'RUN'
        ? Math.cos(character.locomotion.phase * 2) * 0.018
        : 0);

    shell.rotation.x = THREE.MathUtils.damp(
      shell.rotation.x,
      target,
      7,
      dt
    );
  }
}

function applyWeaponAimPose(bones, baseRotations, state, dt) {
  const pitch = THREE.MathUtils.clamp(state.aimPitch ?? 0, -0.68, 0.86);
  const yaw = THREE.MathUtils.clamp(state.aimYawOffset ?? 0, -1.18, 1.18);

  // Mesh-space-like aim offset. Locomotion owns the lower body; torso bones
  // progressively turn toward the camera aim before the hands are solved by IK.
  dampBoneEuler(
    bones.spine,
    baseRotations,
    -pitch * 0.20,
    yaw * 0.24,
    -yaw * 0.020,
    20,
    dt
  );
  dampBoneEuler(
    bones.chest,
    baseRotations,
    -pitch * 0.27,
    yaw * 0.34,
    -yaw * 0.030,
    22,
    dt
  );
  dampBoneEuler(
    bones.upperChest,
    baseRotations,
    -pitch * 0.23,
    yaw * 0.28,
    0,
    22,
    dt
  );
  dampBoneEuler(
    bones.neck,
    baseRotations,
    -pitch * 0.09,
    yaw * 0.07,
    0,
    18,
    dt
  );
  dampBoneEuler(
    bones.head,
    baseRotations,
    -pitch * 0.07,
    yaw * 0.05,
    0,
    18,
    dt
  );

  // Shoulders rise a little under ADS, but the two-bone solver owns upper arm,
  // forearm and hand placement from here.
  dampBoneEuler(
    bones.leftShoulder,
    baseRotations,
    -0.08,
    0.06,
    -0.14,
    24,
    dt
  );
  dampBoneEuler(
    bones.rightShoulder,
    baseRotations,
    -0.07,
    -0.05,
    0.13,
    24,
    dt
  );
}

function applyHipFirePose(bones, baseRotations, state, dt) {
  const pitch = THREE.MathUtils.clamp(state.aimPitch ?? 0, -0.55, 0.55);
  const yaw = THREE.MathUtils.clamp(state.aimYawOffset ?? 0, -0.92, 0.92);

  dampBoneEuler(bones.spine, baseRotations, -pitch * 0.12, yaw * 0.18, 0, 14, dt);
  dampBoneEuler(bones.chest, baseRotations, -pitch * 0.16, yaw * 0.22, 0, 16, dt);

  dampBoneEuler(bones.leftUpperArm, baseRotations, -0.72, 0.12, -0.66, 18, dt);
  dampBoneEuler(bones.leftLowerArm, baseRotations, -0.82, -0.04, -0.18, 18, dt);
  dampBoneEuler(bones.rightUpperArm, baseRotations, -0.62, -0.08, 0.68, 18, dt);
  dampBoneEuler(bones.rightLowerArm, baseRotations, -0.80, 0.03, 0.16, 18, dt);
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
    !bones.rightUpperArm ||
    !bones.rightLowerArm ||
    !bones.rightHand ||
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

  // Right elbow stays slightly out/down from the body; left elbow opens the
  // opposite way so the support hand reaches the foregrip naturally.
  bones.rightUpperArm.getWorldPosition(IK_TMP.shoulder);
  IK_TMP.pole
    .copy(IK_TMP.shoulder)
    .addScaledVector(IK_TMP.right, 0.34)
    .addScaledVector(IK_TMP.down, 0.24)
    .addScaledVector(IK_TMP.forward, 0.05);

  solveTwoBoneIK(
    character.root,
    bones.rightUpperArm,
    bones.rightLowerArm,
    bones.rightHand,
    gripPose.rightGrip,
    IK_TMP.pole,
    34,
    dt
  );

  character.root.updateWorldMatrix(true, true);

  bones.leftUpperArm.getWorldPosition(IK_TMP.shoulder);
  IK_TMP.pole
    .copy(IK_TMP.shoulder)
    .addScaledVector(IK_TMP.right, -0.34)
    .addScaledVector(IK_TMP.down, 0.22)
    .addScaledVector(IK_TMP.forward, 0.08);

  solveTwoBoneIK(
    character.root,
    bones.leftUpperArm,
    bones.leftLowerArm,
    bones.leftHand,
    gripPose.leftGrip,
    IK_TMP.pole,
    34,
    dt
  );
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
