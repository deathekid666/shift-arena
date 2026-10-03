import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

// Procedural scavenged-weapon kit.
// Art direction: welded plumbing, bent sheet metal, tape, exposed wire,
// springs, improvised wood/plastic and mismatched repair parts.
export function buildJunkWeaponVisual(cfg, { pickup = false } = {}) {
  const group = new THREE.Group();
  group.name = `JunkWeapon_${cfg.junkStyle ?? 'scrap'}`;

  const mats = createMaterials(cfg);
  const style = cfg.junkStyle ?? inferStyle(cfg);
  const scale = pickup
    ? (cfg.pickupScale ?? 0.92)
    : (cfg.heldScale ?? 0.72);

  const receiverLength = Math.max(0.36, cfg.modelLength * 0.72);
  const barrelLength =
    cfg.scope ? 0.78 :
    cfg.pellets > 1 ? Math.max(0.46, cfg.modelLength * 0.56) :
    Math.max(0.34, cfg.modelLength * 0.48);

  const add = (mesh, pos, rot = null) => {
    mesh.position.set(pos[0], pos[1], pos[2]);
    if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
    group.add(mesh);
    return mesh;
  };

  // Core is deliberately asymmetric: overlapping plates look repaired rather
  // than manufactured.
  add(box(0.19, 0.19, receiverLength, mats.iron), [0, 0, -0.08]);
  add(box(0.205, 0.075, receiverLength * 0.78, mats.paint), [0.012, 0.092, -0.11], [0.015, 0, 0.012]);
  add(box(0.035, 0.14, receiverLength * 0.70, mats.rust), [0.112, 0.005, -0.055], [0, 0, -0.045]);
  add(box(0.025, 0.11, receiverLength * 0.44, mats.dark), [-0.112, 0.012, -0.11], [0, 0, 0.035]);

  // Rivets / bolts on visible side plates.
  const rivetZ = [-0.22, -0.04, 0.14];
  for (const z of rivetZ) {
    add(cylinder(0.018, 0.018, 0.03, 8, mats.bolt), [0.126, 0.055, z], [0, 0, Math.PI / 2]);
  }

  // Main pipe barrel.
  add(
    cylinder(
      cfg.pellets > 1 ? 0.052 : 0.041,
      cfg.pellets > 1 ? 0.058 : 0.047,
      barrelLength,
      10,
      mats.pipe
    ),
    [0, 0.018, -(receiverLength / 2 + barrelLength / 2 + 0.055)],
    [Math.PI / 2, 0, 0]
  );

  // Muzzle collar made from a larger scrap pipe.
  const muzzleZ = -(receiverLength / 2 + barrelLength + 0.06);
  add(
    cylinder(
      cfg.pellets > 1 ? 0.071 : 0.058,
      cfg.pellets > 1 ? 0.071 : 0.058,
      0.095,
      9,
      mats.rust
    ),
    [0, 0.018, muzzleZ + 0.045],
    [Math.PI / 2, 0, 0]
  );

  // Rear stock / brace.
  buildStock(group, mats, cfg, style);

  // Grip and taped wrapping.
  const gripZ = 0.12;
  add(box(0.105, 0.29, 0.12, mats.rubber), [0, -0.22, gripZ], [-0.12, 0, 0]);
  for (let i = 0; i < 4; i++) {
    add(box(0.118, 0.035, 0.132, i % 2 ? mats.tapeDark : mats.tape), [0, -0.135 - i * 0.055, gripZ + i * 0.006], [-0.12, 0, i % 2 ? 0.035 : -0.025]);
  }

  buildMagazine(group, mats, cfg, style);
  buildTopHardware(group, mats, cfg, style, receiverLength);
  buildSideDetails(group, mats, cfg, style, receiverLength);

  // Weapon-specific silhouette changes.
  if (style === 'doublePipe') {
    // second barrel and crude joining straps
    add(
      cylinder(0.041, 0.047, barrelLength * 0.96, 10, mats.pipe),
      [0.087, 0.018, -(receiverLength / 2 + barrelLength * 0.48 + 0.05)],
      [Math.PI / 2, 0, 0]
    );
    add(
      cylinder(0.041, 0.047, barrelLength * 0.96, 10, mats.pipe),
      [-0.087, 0.018, -(receiverLength / 2 + barrelLength * 0.48 + 0.05)],
      [Math.PI / 2, 0, 0]
    );
    add(box(0.24, 0.032, 0.10, mats.tape), [0, 0.018, -(receiverLength / 2 + 0.20)]);
  }

  if (style === 'drainPump') {
    const pumpZ = -(receiverLength / 2 + barrelLength * 0.42);
    add(cylinder(0.082, 0.086, 0.26, 10, mats.rubber), [0, -0.01, pumpZ], [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 5; i++) {
      add(new THREE.Mesh(new THREE.TorusGeometry(0.086, 0.008, 5, 12), mats.tapeDark), [0, -0.01, pumpZ - 0.10 + i * 0.05]);
    }
  }

  if (style === 'antenna') {
    // Long improvised scope from cans plus antenna wire.
    const scope = cylinder(0.066, 0.071, 0.34, 10, mats.dark);
    add(scope, [0, 0.185, -0.13], [Math.PI / 2, 0, 0]);
    add(cylinder(0.077, 0.077, 0.055, 10, mats.brass), [0, 0.185, -0.31], [Math.PI / 2, 0, 0]);
    const lens = cylinder(0.058, 0.058, 0.012, 12, mats.glass);
    add(lens, [0, 0.185, -0.344], [Math.PI / 2, 0, 0]);
    add(box(0.025, 0.025, 0.42, mats.bolt), [0.095, 0.205, 0.01], [-0.42, 0, 0.04]);
  }

  if (style === 'canSMG') {
    // Main body gains a visibly repurposed tin-cylinder housing.
    add(cylinder(0.105, 0.105, 0.33, 12, mats.can), [0, 0.012, -0.13], [Math.PI / 2, 0, 0]);
    add(new THREE.Mesh(new THREE.TorusGeometry(0.107, 0.009, 5, 14), mats.rust), [0, 0.012, -0.28]);
    add(new THREE.Mesh(new THREE.TorusGeometry(0.107, 0.009, 5, 14), mats.rust), [0, 0.012, 0.02]);
  }

  if (style === 'railSMG') {
    // Offset side rail assembled from perforated scrap tabs.
    for (let i = 0; i < 5; i++) {
      add(box(0.035, 0.04, 0.09, mats.iron), [0.118, 0.085, -0.28 + i * 0.11], [0, 0, (i - 2) * 0.018]);
    }
  }

  if (style === 'clockwork') {
    // Exposed spring and flywheel visually sell the "mechanical" AR.
    for (let i = 0; i < 7; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.048, 0.009, 5, 12),
        mats.spring
      );
      add(ring, [0.115, 0.055, -0.25 + i * 0.045], [0, Math.PI / 2, 0]);
    }
    add(cylinder(0.075, 0.075, 0.035, 12, mats.brass), [-0.123, 0.015, -0.07], [0, 0, Math.PI / 2]);
    for (let i = 0; i < 8; i++) {
      const tooth = box(0.025, 0.018, 0.05, mats.brass);
      const a = i / 8 * Math.PI * 2;
      add(tooth, [-0.145, 0.015 + Math.sin(a) * 0.084, -0.07 + Math.cos(a) * 0.084], [a, 0, 0]);
    }
  }

  if (style === 'roachCarbine') {
    // Bent top shield, bottle-cap side plate and a dangling cable.
    add(box(0.23, 0.035, receiverLength * 0.55, mats.paint), [0, 0.135, -0.08], [0.035, 0, -0.025]);
    add(cylinder(0.062, 0.062, 0.028, 16, mats.cap), [-0.125, 0.01, -0.17], [0, 0, Math.PI / 2]);
  }

  // Exposed cable appears on every gun, with family-specific routing.
  const cable = buildCable(style, mats);
  group.add(cable);

  // Hand sockets remain compatible with existing IK.
  const rightGrip = new THREE.Object3D();
  rightGrip.name = 'RightGripSocket';
  rightGrip.position.set(
    cfg.rightGripX ?? 0,
    cfg.rightGripY ?? -0.09,
    cfg.rightGripZ ?? 0.105
  );
  group.add(rightGrip);

  const leftGrip = new THREE.Object3D();
  leftGrip.name = 'LeftForegripSocket';
  leftGrip.position.set(
    cfg.leftGripX ?? 0,
    cfg.leftGripY ?? -0.025,
    cfg.foregripZ ??
      -Math.min(0.36, Math.max(0.20, cfg.modelLength * 0.34))
  );
  group.add(leftGrip);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'MuzzleSocket';
  muzzle.position.set(0, 0.018, muzzleZ - 0.015);
  group.add(muzzle);

  group.scale.setScalar(scale);

  return {
    group,
    rightGrip,
    leftGrip,
    muzzle,
    barrelLength,
    primaryMesh: group.children.find((child) => child.isMesh) ?? null
  };
}

export function disposeJunkWeaponVisual(root) {
  root?.traverse?.((node) => {
    if (!node.isMesh) return;
    node.geometry?.dispose?.();
    const materials = Array.isArray(node.material)
      ? node.material
      : [node.material];
    for (const material of materials) material?.dispose?.();
  });
}

function inferStyle(cfg) {
  const name = cfg.name.toUpperCase();
  if (cfg.scope) return 'antenna';
  if (name.includes('PUMP')) return 'drainPump';
  if (name.includes('SHOTGUN')) return 'doublePipe';
  if (name.includes('COMPACT')) return 'canSMG';
  if (name.includes('LONG')) return 'railSMG';
  if (name.includes('MECHANICAL')) return 'clockwork';
  return 'roachCarbine';
}

function createMaterials(cfg) {
  const paintColor = new THREE.Color(cfg.junkPaint ?? cfg.color);
  paintColor.offsetHSL(0, -0.18, -0.08);

  return {
    iron: mat(0x575752, 0.88, 0.66),
    pipe: mat(0x343733, 0.79, 0.78),
    dark: mat(0x202421, 0.92, 0.52),
    rust: mat(0x7d4026, 0.94, 0.37),
    bolt: mat(0x8b8d87, 0.55, 0.76),
    brass: mat(0x9b7134, 0.59, 0.70),
    spring: mat(0x777b72, 0.62, 0.82),
    wood: mat(0x65462d, 0.96, 0.06),
    rubber: mat(0x24211f, 1, 0.02),
    tape: mat(0xb49c69, 0.98, 0.01),
    tapeDark: mat(0x3a403d, 0.96, 0.02),
    paint: mat(paintColor, 0.82, 0.40),
    cap: mat(cfg.color, 0.72, 0.45),
    can: mat(0x8a918b, 0.66, 0.66),
    glass: new THREE.MeshStandardMaterial({
      color: 0x78969a,
      roughness: 0.14,
      metalness: 0.18,
      transparent: true,
      opacity: 0.72
    })
  };
}

function mat(color, roughness, metalness) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness
  });
}

function box(x, y, z, material) {
  return new THREE.Mesh(new THREE.BoxGeometry(x, y, z), material);
}

function cylinder(r1, r2, h, segments, material) {
  return new THREE.Mesh(
    new THREE.CylinderGeometry(r1, r2, h, segments),
    material
  );
}

function buildStock(group, mats, cfg, style) {
  const short = style === 'canSMG' || style === 'railSMG';
  const stockLength = short ? 0.20 : cfg.scope ? 0.38 : 0.31;
  const z = cfg.modelLength * 0.43;

  const plank = box(
    short ? 0.12 : 0.155,
    short ? 0.10 : 0.16,
    stockLength,
    style === 'clockwork' ? mats.iron : mats.wood
  );
  plank.position.set(0, -0.005, z);
  plank.rotation.x = short ? 0.05 : -0.035;
  plank.rotation.z = style === 'roachCarbine' ? -0.035 : 0.015;
  group.add(plank);

  // Brace plates make it look bolted on rather than factory-built.
  const brace = box(0.19, 0.035, 0.08, mats.rust);
  brace.position.set(0, 0.052, z - stockLength * 0.28);
  brace.rotation.z = 0.035;
  group.add(brace);
}

function buildMagazine(group, mats, cfg, style) {
  if (cfg.pellets > 1) {
    // Shell pouch / crude feed box.
    const pouch = box(0.15, 0.16, 0.15, mats.tapeDark);
    pouch.position.set(0, -0.15, -0.01);
    pouch.rotation.x = -0.12;
    group.add(pouch);
    return;
  }

  if (style === 'canSMG') {
    const drum = cylinder(0.11, 0.11, 0.095, 14, mats.can);
    drum.position.set(0.09, -0.15, -0.02);
    drum.rotation.z = Math.PI / 2;
    group.add(drum);
    return;
  }

  const mag = box(
    style === 'antenna' ? 0.10 : 0.115,
    style === 'antenna' ? 0.19 : 0.27,
    0.14,
    mats.dark
  );
  mag.position.set(0, style === 'antenna' ? -0.16 : -0.21, 0.015);
  mag.rotation.x = style === 'roachCarbine' ? -0.21 : -0.12;
  mag.rotation.z = style === 'railSMG' ? 0.05 : -0.02;
  group.add(mag);

  for (let i = 0; i < 3; i++) {
    const band = box(0.13, 0.028, 0.155, i % 2 ? mats.tape : mats.tapeDark);
    band.position.set(0, mag.position.y + 0.065 - i * 0.065, 0.015);
    band.rotation.copy(mag.rotation);
    group.add(band);
  }
}

function buildTopHardware(group, mats, cfg, style, receiverLength) {
  if (cfg.scope || style === 'antenna') return;

  if (style === 'clockwork') {
    const rail = box(0.075, 0.055, receiverLength * 0.58, mats.dark);
    rail.position.set(0, 0.145, -0.11);
    group.add(rail);
    return;
  }

  const rear = box(0.055, 0.075, 0.045, mats.bolt);
  rear.position.set(0, 0.15, 0.12);
  group.add(rear);

  const front = box(0.045, 0.095, 0.035, mats.bolt);
  front.position.set(0, 0.155, -receiverLength * 0.42);
  front.rotation.z = 0.03;
  group.add(front);
}

function buildSideDetails(group, mats, cfg, style, receiverLength) {
  // Heat shield / patch plate.
  const patch = box(0.028, 0.13, receiverLength * 0.36, mats.rust);
  patch.position.set(-0.116, 0.04, -receiverLength * 0.18);
  patch.rotation.x = 0.025;
  group.add(patch);

  // Trigger guard from bent-looking torus section.
  const guard = new THREE.Mesh(
    new THREE.TorusGeometry(0.075, 0.011, 5, 10, Math.PI * 1.45),
    mats.bolt
  );
  guard.position.set(0, -0.112, 0.09);
  guard.rotation.x = Math.PI / 2;
  guard.rotation.z = -0.4;
  group.add(guard);

  if (style !== 'doublePipe') {
    // Tape straps tying barrel/receiver together.
    for (let i = 0; i < 2; i++) {
      const strap = box(0.225, 0.028, 0.055, i ? mats.tapeDark : mats.tape);
      strap.position.set(0, 0.018, -receiverLength * 0.48 - i * 0.10);
      strap.rotation.z = i ? -0.035 : 0.035;
      group.add(strap);
    }
  }
}

function buildCable(style, mats) {
  const x = style === 'antenna' ? -0.10 : 0.12;
  const points = [
    new THREE.Vector3(x, 0.08, 0.10),
    new THREE.Vector3(x * 1.35, 0.03, -0.04),
    new THREE.Vector3(x * 1.20, -0.04, -0.22),
    new THREE.Vector3(x * 0.85, 0.01, -0.34)
  ];
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, 12, 0.008, 5, false),
    style === 'clockwork' ? mats.brass : mats.rubber
  );
}
