import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

export function buildRoachScoutCharacter() {
  const root = new THREE.Group();
  root.name = 'RoachScoutCharacter';

  const mats = createMaterials();

  // Core body silhouette — compact, human-like and intentionally cute.
  const torso = roundedCapsule(0.28, 0.38, mats.outfit);
  torso.scale.set(1.02, 1.0, 0.72);
  torso.position.set(0, 0.08, 0);
  root.add(torso);

  const chestPanel = new THREE.Mesh(
    new THREE.SphereGeometry(0.235, 18, 12),
    mats.cream
  );
  chestPanel.scale.set(1.0, 0.78, 0.22);
  chestPanel.position.set(0, 0.10, -0.245);
  chestPanel.castShadow = true;
  root.add(chestPanel);

  const belt = new THREE.Mesh(
    new THREE.TorusGeometry(0.245, 0.045, 8, 22),
    mats.darkBrown
  );
  belt.rotation.x = Math.PI / 2;
  belt.position.set(0, -0.15, 0);
  root.add(belt);

  const beltBuckle = new THREE.Mesh(
    new THREE.BoxGeometry(0.13, 0.09, 0.06),
    mats.gold
  );
  beltBuckle.position.set(0, -0.15, -0.255);
  beltBuckle.castShadow = true;
  root.add(beltBuckle);

  // Shorts / hip shape.
  const hips = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 16, 12),
    mats.chitin
  );
  hips.scale.set(1.0, 0.62, 0.74);
  hips.position.set(0, -0.22, 0);
  hips.castShadow = true;
  root.add(hips);

  // Head is deliberately larger than realistic human proportions.
  const headRoot = new THREE.Group();
  headRoot.position.set(0, 0.57, -0.015);
  root.add(headRoot);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.345, 24, 18),
    mats.skin
  );
  head.scale.set(0.96, 1.02, 0.92);
  head.castShadow = true;
  headRoot.add(head);

  // Soft cheek/muzzle plane gives the face the same friendly anime read as the sketch.
  const muzzle = new THREE.Mesh(
    new THREE.SphereGeometry(0.205, 18, 12),
    mats.lightSkin
  );
  muzzle.scale.set(1.15, 0.58, 0.24);
  muzzle.position.set(0, -0.075, -0.292);
  headRoot.add(muzzle);

  const eyeL = buildAnimeEye(mats);
  eyeL.position.set(-0.125, 0.055, -0.300);
  eyeL.rotation.y = -0.08;
  headRoot.add(eyeL);

  const eyeR = buildAnimeEye(mats);
  eyeR.position.set(0.125, 0.055, -0.300);
  eyeR.rotation.y = 0.08;
  headRoot.add(eyeR);

  // Tiny smile — readable without turning the face insect-realistic.
  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.065, 0.012, 5, 14, Math.PI),
    mats.faceDark
  );
  smile.rotation.set(Math.PI / 2, 0, Math.PI);
  smile.position.set(0, -0.105, -0.330);
  headRoot.add(smile);

  // Hair/roach crest from overlapping rounded clumps.
  const crest = new THREE.Group();
  crest.position.set(0, 0.23, -0.015);
  headRoot.add(crest);

  const hairPieces = [
    [-0.18, 0.01, -0.02, 0.16, 0.22, 0.18, -0.38],
    [-0.06, 0.05, -0.08, 0.19, 0.26, 0.20, -0.14],
    [0.08, 0.05, -0.08, 0.19, 0.26, 0.20, 0.12],
    [0.20, 0.00, -0.01, 0.15, 0.22, 0.17, 0.34],
    [0.00, 0.11, 0.02, 0.18, 0.22, 0.18, 0.02]
  ];
  for (const [x,y,z,sx,sy,sz,rz] of hairPieces) {
    const tuft = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 14, 10),
      mats.hair
    );
    tuft.scale.set(sx, sy, sz);
    tuft.position.set(x,y,z);
    tuft.rotation.z = rz;
    tuft.castShadow = true;
    crest.add(tuft);
  }

  // Antennae are smooth curves, expressive and clearly cartoony.
  const antennaL = buildAntenna(-1, mats.antenna);
  antennaL.position.set(-0.13, 0.78, -0.03);
  root.add(antennaL);
  const antennaR = buildAntenna(1, mats.antenna);
  antennaR.position.set(0.13, 0.78, -0.03);
  root.add(antennaR);

  // Small ear/chitin tabs.
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(
      new THREE.SphereGeometry(0.10, 12, 8),
      mats.chitin
    );
    ear.scale.set(0.55, 0.9, 0.45);
    ear.position.set(side * 0.325, 0.55, 0.005);
    ear.castShadow = true;
    root.add(ear);
  }

  // Back shell plates. Decorative shell only — deliberately no wings.
  const shellRoot = new THREE.Group();
  shellRoot.position.set(0, 0.08, 0.19);
  root.add(shellRoot);
  const shellTop = shellPlate(0.26, 0.34, mats.shell);
  shellTop.position.y = 0.10;
  shellRoot.add(shellTop);
  const shellBottom = shellPlate(0.245, 0.31, mats.shellDark);
  shellBottom.position.y = -0.14;
  shellBottom.scale.set(0.96, 0.88, 1);
  shellRoot.add(shellBottom);

  // Arms.
  const leftArm = buildArm(-1, mats);
  const rightArm = buildArm(1, mats);
  root.add(leftArm.root, rightArm.root);

  // Legs.
  const leftLeg = buildLeg(-1, mats);
  const rightLeg = buildLeg(1, mats);
  root.add(leftLeg.root, rightLeg.root);

  // Exposed sockets for later fully-rigged animations and weapons.
  const weaponSocket = new THREE.Object3D();
  weaponSocket.name = 'weaponSocket';
  weaponSocket.position.set(0.30, 0.13, -0.46);
  root.add(weaponSocket);

  const fangSocket = new THREE.Object3D();
  fangSocket.name = 'fangSocket';
  fangSocket.position.set(0.37, 0.28, -0.18);
  root.add(fangSocket);

  const headSocket = new THREE.Object3D();
  headSocket.name = 'headSocket';
  headSocket.position.set(0, 0.60, -0.02);
  root.add(headSocket);

  root.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });

  return {
    root,
    torso,
    headRoot,
    rightArm,
    leftArm,
    rightLeg,
    leftLeg,
    weaponSocket,
    fangSocket,
    headSocket,
    materials: mats
  };
}

export function updateRoachScoutCharacter(character, {
  dt,
  speed = 0,
  combat = false,
  crouching = false,
  grounded = true,
  rightArmOverride = false
}) {
  if (!character) return;

  const move = Math.min(1, speed / 6.5);
  character.root.position.y = Math.sin(performance.now() * 0.0045) * 0.012 * (1 - move * 0.5);

  // Tiny breathing/head motion only. Full locomotion animation comes in Build 010.
  character.headRoot.rotation.z = THREE.MathUtils.damp(
    character.headRoot.rotation.z,
    Math.sin(performance.now() * 0.0027) * 0.018,
    7,
    dt
  );

  const crouch = crouching ? 1 : 0;

  if (combat) {
    // Human-like two-hand shooter silhouette around the existing weapon model.
    character.leftArm.root.rotation.x = THREE.MathUtils.damp(character.leftArm.root.rotation.x, 1.12, 15, dt);
    character.leftArm.root.rotation.z = THREE.MathUtils.damp(character.leftArm.root.rotation.z, -0.28, 15, dt);
    character.leftArm.elbow.rotation.x = THREE.MathUtils.damp(character.leftArm.elbow.rotation.x, 0.76, 15, dt);

    if (!rightArmOverride) {
      character.rightArm.root.rotation.x = THREE.MathUtils.damp(character.rightArm.root.rotation.x, 1.18, 15, dt);
      character.rightArm.root.rotation.z = THREE.MathUtils.damp(character.rightArm.root.rotation.z, 0.20, 15, dt);
      character.rightArm.elbow.rotation.x = THREE.MathUtils.damp(character.rightArm.elbow.rotation.x, 0.52, 15, dt);
    }
  } else {
    character.leftArm.root.rotation.x = THREE.MathUtils.damp(character.leftArm.root.rotation.x, 0.08 + move * 0.12, 10, dt);
    character.leftArm.root.rotation.z = THREE.MathUtils.damp(character.leftArm.root.rotation.z, -0.08, 10, dt);
    character.leftArm.elbow.rotation.x = THREE.MathUtils.damp(character.leftArm.elbow.rotation.x, 0.12, 10, dt);

    if (!rightArmOverride) {
      character.rightArm.root.rotation.x = THREE.MathUtils.damp(character.rightArm.root.rotation.x, 0.08 + move * 0.12, 10, dt);
      character.rightArm.root.rotation.z = THREE.MathUtils.damp(character.rightArm.root.rotation.z, 0.08, 10, dt);
      character.rightArm.elbow.rotation.x = THREE.MathUtils.damp(character.rightArm.elbow.rotation.x, 0.12, 10, dt);
    }
  }

  character.rightArm.root.visible = !rightArmOverride;

  const legBend = crouch * 0.34;
  character.leftLeg.root.rotation.x = THREE.MathUtils.damp(character.leftLeg.root.rotation.x, -legBend, 14, dt);
  character.rightLeg.root.rotation.x = THREE.MathUtils.damp(character.rightLeg.root.rotation.x, -legBend, 14, dt);
  character.leftLeg.knee.rotation.x = THREE.MathUtils.damp(character.leftLeg.knee.rotation.x, crouch * 0.56, 14, dt);
  character.rightLeg.knee.rotation.x = THREE.MathUtils.damp(character.rightLeg.knee.rotation.x, crouch * 0.56, 14, dt);

  const airLean = grounded ? 0 : -0.08;
  character.root.rotation.x = THREE.MathUtils.damp(character.root.rotation.x, airLean, 9, dt);
}

function createMaterials() {
  const toon = (color) => new THREE.MeshToonMaterial({ color });

  return {
    skin: toon(0xc78553),
    lightSkin: toon(0xe0aa78),
    chitin: toon(0x8b4d2e),
    shell: toon(0x6d3424),
    shellDark: toon(0x4d271f),
    hair: toon(0x633421),
    antenna: toon(0x3d241f),
    outfit: toon(0xd7b27b),
    cream: toon(0xf0d8ad),
    glove: toon(0xf1d7aa),
    boot: toon(0x5a3126),
    darkBrown: toon(0x4b2a22),
    gold: toon(0xcf943f),
    faceDark: new THREE.MeshBasicMaterial({ color: 0x311f21 }),
    eye: new THREE.MeshToonMaterial({ color: 0x24191a }),
    eyeWarm: new THREE.MeshBasicMaterial({ color: 0xb8653b }),
    eyeWhite: new THREE.MeshBasicMaterial({ color: 0xfff7e8 })
  };
}

function roundedCapsule(radius, length, material) {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, length, 8, 16),
    material
  );
  mesh.castShadow = true;
  return mesh;
}

function buildAnimeEye(mats) {
  const group = new THREE.Group();

  const outer = new THREE.Mesh(
    new THREE.SphereGeometry(0.105, 16, 12),
    mats.eye
  );
  outer.scale.set(0.78, 1.08, 0.18);
  group.add(outer);

  const iris = new THREE.Mesh(
    new THREE.SphereGeometry(0.060, 14, 10),
    mats.eyeWarm
  );
  iris.scale.set(0.82, 1.0, 0.16);
  iris.position.z = -0.078;
  iris.position.y = -0.005;
  group.add(iris);

  const shine = new THREE.Mesh(
    new THREE.SphereGeometry(0.022, 10, 8),
    mats.eyeWhite
  );
  shine.scale.z = 0.28;
  shine.position.set(-0.018, 0.032, -0.095);
  group.add(shine);

  return group;
}

function buildAntenna(side, material) {
  const points = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(side * 0.05, 0.13, -0.01),
    new THREE.Vector3(side * 0.16, 0.27, -0.04),
    new THREE.Vector3(side * 0.26, 0.38, -0.11),
    new THREE.Vector3(side * 0.34, 0.46, -0.16)
  ];
  const curve = new THREE.CatmullRomCurve3(points);
  const mesh = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 20, 0.018, 7, false),
    material
  );
  mesh.castShadow = true;
  return mesh;
}

function shellPlate(width, height, material) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 18, 12),
    material
  );
  mesh.scale.set(width * 1.55, height, 0.16);
  mesh.castShadow = true;
  return mesh;
}

function buildArm(side, mats) {
  const root = new THREE.Group();
  root.position.set(side * 0.31, 0.27, -0.005);

  const shoulderPad = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 12, 10),
    mats.chitin
  );
  shoulderPad.scale.set(1.05, 0.85, 0.95);
  root.add(shoulderPad);

  const upper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.105, 0.31, 9),
    mats.skin
  );
  upper.position.y = -0.17;
  root.add(upper);

  const elbow = new THREE.Group();
  elbow.position.y = -0.33;
  root.add(elbow);

  const joint = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    mats.chitin
  );
  elbow.add(joint);

  const forearm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.073, 0.088, 0.29, 9),
    mats.skin
  );
  forearm.position.y = -0.16;
  elbow.add(forearm);

  const gloveCuff = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.085, 0.10, 9),
    mats.darkBrown
  );
  gloveCuff.position.y = -0.31;
  elbow.add(gloveCuff);

  const hand = new THREE.Mesh(
    new THREE.SphereGeometry(0.115, 11, 9),
    mats.glove
  );
  hand.scale.set(1.05, 0.82, 0.92);
  hand.position.y = -0.39;
  elbow.add(hand);

  return { root, elbow, hand };
}

function buildLeg(side, mats) {
  const root = new THREE.Group();
  root.position.set(side * 0.14, -0.31, 0.01);

  const thigh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.105, 0.125, 0.34, 9),
    mats.outfit
  );
  thigh.position.y = -0.18;
  root.add(thigh);

  const knee = new THREE.Group();
  knee.position.y = -0.36;
  root.add(knee);

  const kneeGuard = new THREE.Mesh(
    new THREE.SphereGeometry(0.105, 10, 8),
    mats.chitin
  );
  kneeGuard.scale.set(1, 0.72, 0.82);
  knee.add(kneeGuard);

  const shin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.078, 0.095, 0.30, 9),
    mats.skin
  );
  shin.position.y = -0.17;
  knee.add(shin);

  const boot = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 12, 9),
    mats.boot
  );
  boot.scale.set(0.78, 0.62, 1.35);
  boot.position.set(0, -0.35, -0.06);
  knee.add(boot);

  const toe = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 10, 8),
    mats.cream
  );
  toe.scale.set(0.8, 0.45, 1.35);
  toe.position.set(0, -0.37, -0.16);
  knee.add(toe);

  return { root, knee };
}
