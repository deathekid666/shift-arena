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
  retintAvatar(vrm.scene);
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
    rightUpperLeg: bone(vrm, 'rightUpperLeg'),
    leftLowerLeg: bone(vrm, 'leftLowerLeg'),
    rightLowerLeg: bone(vrm, 'rightLowerLeg'),
    leftFoot: bone(vrm, 'leftFoot'),
    rightFoot: bone(vrm, 'rightFoot')
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
