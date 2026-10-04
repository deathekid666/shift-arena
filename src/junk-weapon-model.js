import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

// Procedural scavenged-weapon kit.
// Art direction: welded plumbing, bent sheet metal, tape, exposed wire,
// springs, improvised wood/plastic and mismatched repair parts.

function applyWeaponVisualScale(
  group,
  baseScale,
  cfg
) {
  group.scale.set(
    baseScale * (cfg.visualWidthScale ?? 1),
    baseScale * (cfg.visualHeightScale ?? 1),
    baseScale * (cfg.visualLengthScale ?? 1)
  );
}

export function buildJunkWeaponVisual(cfg, { pickup = false } = {}) {
  const group = new THREE.Group();
  group.name = `JunkWeapon_${cfg.junkStyle ?? 'scrap'}`;

  const mats = createMaterials(cfg);
  const style = cfg.junkStyle ?? inferStyle(cfg);
  const scale = pickup
    ? (cfg.pickupScale ?? 0.92)
    : (cfg.heldScale ?? 0.72);

  // Dedicated simple silhouettes for hero scavenged weapons.
  if (style === 'stapleSlinger') {
    return buildStapleSlingerAR(cfg, mats, scale);
  }

  if (style === 'tapeRattler') {
    return buildTapeRattlerSMG(cfg, mats, scale);
  }

  if (style === 'bugSprayer') {
    return buildBugSprayerShotgun(cfg, mats, scale);
  }

  if (style === 'antenna') {
    return buildScrapEyeSniper(cfg, mats, scale);
  }

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

  applyWeaponVisualScale(group, scale, cfg);

  return {
    group,
    rightGrip,
    leftGrip,
    muzzle,
    barrelLength,
    primaryMesh: group.children.find((child) => child.isMesh) ?? null
  };
}

function buildStapleSlingerAR(cfg, mats, scale) {
  const group = new THREE.Group();
  group.name = 'JunkWeapon_StapleSlingerAR';

  const add = (mesh, pos, rot = null, parent = group) => {
    mesh.position.set(pos[0], pos[1], pos[2]);
    if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
    parent.add(mesh);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  // Simple cockroach-world palette matching the concept sketch.
  const red = mat(0xb84b3d, 0.86, 0.28);
  const redDark = mat(0x74352d, 0.92, 0.20);
  const steel = mat(0x6f716d, 0.64, 0.72);
  const brightSteel = mat(0xa1a39d, 0.48, 0.78);
  const ruler = mat(0xb58a49, 0.90, 0.08);
  const rulerDark = mat(0x4f4331, 0.92, 0.08);
  const wrap = mat(0xc4aa78, 0.98, 0.01);

  // === 1. STAPLER BODY ===
  // Lower chassis: a single chunky red office-stapler base.
  add(
    box(0.21, 0.15, 0.58, red),
    [0, 0.035, -0.055]
  );

  // Silver staple channel inside the stapler.
  add(
    box(0.145, 0.065, 0.43, brightSteel),
    [0, 0.125, -0.095]
  );

  // Hero stapler arm: six-sided low-poly prism for a cleaner molded silhouette.
  const staplerTop = cylinder(0.092, 0.104, 0.50, 6, red);
  staplerTop.scale.x = 1.28;
  add(staplerTop, [0, 0.195, -0.025], [Math.PI / 2, 0, 0]);
  add(box(0.165, 0.030, 0.405, redDark), [0, 0.132, -0.055]);

  // Front hinge and rear hinge blocks.
  add(
    box(0.255, 0.16, 0.075, steel),
    [0, 0.115, -0.315]
  );
  add(
    box(0.24, 0.16, 0.085, steel),
    [0, 0.115, 0.245]
  );

  // Large hinge bolts visible from both sides.
  for (const x of [-0.132, 0.132]) {
    add(
      cylinder(0.027, 0.027, 0.028, 8, mats.bolt),
      [x, 0.125, 0.245],
      [0, 0, Math.PI / 2]
    );
  }

  // === 2. EXPOSED SPRING ===
  // One continuous helix reads as a real spring instead of floating rings.
  add(coilSpring(0.38, 0.052, 7.2, 0.010, brightSteel, 52), [0, 0.270, 0.015]);
  add(
    cylinder(0.014, 0.014, 0.43, 8, steel),
    [0, 0.270, 0.015],
    [Math.PI / 2, 0, 0]
  );
  add(box(0.145, 0.095, 0.045, steel), [0, 0.270, -0.195]);
  add(box(0.145, 0.095, 0.045, steel), [0, 0.270, 0.225]);

  // === 3. PEN / PIPE BARREL ===
  add(
    cylinder(0.043, 0.048, 0.54, 10, steel),
    [0, 0.050, -0.58],
    [Math.PI / 2, 0, 0]
  );

  // Black marker-cap style muzzle.
  add(
    cylinder(0.060, 0.060, 0.135, 10, mats.dark),
    [0, 0.050, -0.915],
    [Math.PI / 2, 0, 0]
  );

  // Brass clamp where the pen barrel meets the stapler.
  add(
    cylinder(0.057, 0.057, 0.070, 10, mats.brass),
    [0, 0.050, -0.335],
    [Math.PI / 2, 0, 0]
  );

  // Paperclip front sight.
  const frontSight = new THREE.Mesh(
    new THREE.TorusGeometry(
      0.050,
      0.008,
      5,
      10,
      Math.PI
    ),
    brightSteel
  );
  add(
    frontSight,
    [0, 0.120, -0.880],
    [0, 0, Math.PI / 2]
  );

  // === 4. STAPLE-STRIP MAGAZINE ===
  const magRoot = new THREE.Group();
  magRoot.position.set(0, -0.155, -0.055);
  magRoot.rotation.x = -0.05;
  group.add(magRoot);

  add(
    box(0.15, 0.33, 0.145, redDark),
    [0, 0, 0],
    null,
    magRoot
  );

  // Visible silver staples stacked inside the magazine.
  for (let i = 0; i < 8; i++) {
    add(
      box(0.122, 0.022, 0.105, brightSteel),
      [0, 0.115 - i * 0.035, -0.006],
      null,
      magRoot
    );
  }

  // Thin brass guide rails along the mag.
  for (const x of [-0.066, 0.066]) {
    add(
      box(0.010, 0.30, 0.118, mats.brass),
      [x, 0, 0],
      null,
      magRoot
    );
  }

  // === 5. TAPED PISTOL GRIP ===
  add(
    box(0.115, 0.30, 0.14, mats.rubber),
    [0, -0.215, 0.205],
    [-0.12, 0, 0]
  );

  for (let i = 0; i < 4; i++) {
    add(
      box(0.126, 0.034, 0.152, wrap),
      [0, -0.135 - i * 0.052, 0.205 + i * 0.006],
      [-0.12, 0, i % 2 ? 0.035 : -0.03]
    );
  }

  // Trigger guard.
  const guard = new THREE.Mesh(
    new THREE.TorusGeometry(
      0.070,
      0.010,
      5,
      10,
      Math.PI * 1.45
    ),
    mats.bolt
  );
  add(
    guard,
    [0, -0.115, 0.115],
    [Math.PI / 2, 0, -0.40]
  );

  // === 6. RULER STOCK ===
  // Long ruler spine.
  add(
    box(0.135, 0.080, 0.50, ruler),
    [0, 0.040, 0.505]
  );

  // Rear butt plate.
  add(
    box(0.175, 0.29, 0.070, rulerDark),
    [0, -0.010, 0.760]
  );

  // Lower cut-out effect: two short rails instead of a solid military stock.
  add(
    box(0.055, 0.050, 0.34, ruler),
    [0, -0.075, 0.545],
    [0.10, 0, 0]
  );

  // Ruler tick marks kept intentionally chunky/readable.
  for (let i = 0; i < 9; i++) {
    const longTick = i % 2 === 0;
    add(
      box(
        longTick ? 0.060 : 0.040,
        0.012,
        0.012,
        rulerDark
      ),
      [
        0,
        0.086,
        0.315 + i * 0.050
      ]
    );
  }

  // Rear ruler mounting clamp.
  add(
    box(0.22, 0.16, 0.080, steel),
    [0, 0.045, 0.270]
  );

  // Controlled side depth instead of random scrap clutter.
  add(box(0.024, 0.125, 0.300, redDark), [-0.122, 0.040, -0.055], [0.01, 0, 0.02]);
  add(box(0.055, 0.038, 0.105, mats.dark), [0, 0.125, 0.165]);

  // Third-person silhouette polish: compact rear aperture + cheek pad.
  const rearSight = new THREE.Mesh(
    new THREE.TorusGeometry(0.036, 0.008, 5, 10),
    mats.dark
  );
  add(rearSight, [0, 0.225, 0.185]);
  add(box(0.145, 0.055, 0.22, redDark), [0, 0.085, 0.520], [-0.03, 0, 0]);

  // Gameplay sockets line up with visible modeled grips.
  const rightGrip = new THREE.Object3D();
  rightGrip.name = 'RightGripSocket';
  rightGrip.position.set(
    cfg.rightGripX ?? 0,
    cfg.rightGripY ?? -0.205,
    cfg.rightGripZ ?? 0.185
  );
  group.add(rightGrip);

  const leftGrip = new THREE.Object3D();
  leftGrip.name = 'LeftForegripSocket';
  leftGrip.position.set(
    cfg.leftGripX ?? 0,
    cfg.leftGripY ?? -0.045,
    cfg.foregripZ ?? -0.345
  );
  group.add(leftGrip);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'MuzzleSocket';
  muzzle.position.set(0, 0.050, -0.990);
  group.add(muzzle);

  applyWeaponVisualScale(group, scale, cfg);

  return {
    group,
    rightGrip,
    leftGrip,
    muzzle,
    barrelLength: 0.54,
    primaryMesh:
      group.children.find((child) => child.isMesh) ?? null
  };
}

function buildTapeRattlerSMG(cfg, mats, scale) {
  const group = new THREE.Group();
  group.name = 'JunkWeapon_TapeRattlerSMG';

  const add = (mesh, pos, rot = null, parent = group) => {
    mesh.position.set(pos[0], pos[1], pos[2]);
    if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
    parent.add(mesh);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  // Palette taken from the supplied concept sheet.
  const orange = mat(0xd8892f, 0.88, 0.12);
  const orangeDark = mat(0x9c5528, 0.92, 0.16);
  const creamTape = mat(0xd9c99b, 0.94, 0.02);
  const creamEdge = mat(0xbba979, 0.92, 0.04);
  const steel = mat(0x6c706c, 0.62, 0.72);
  const blackMetal = mat(0x252a29, 0.82, 0.58);
  const wrap = mat(0xb29a69, 0.98, 0.01);
  const redWire = mat(0x9d4937, 0.88, 0.18);
  const tapeFilm = new THREE.MeshStandardMaterial({
    color: 0xe7d9ad,
    roughness: 0.48,
    metalness: 0.01,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide
  });

  // === 1. TAPE-DISPENSER BODY ===
  // One chunky orange plastic shell is the main receiver.
  add(
    box(0.25, 0.23, 0.48, orange),
    [0, 0.035, -0.02]
  );

  // Lower dark insert and front clamp keep the body readable from distance.
  add(
    box(0.19, 0.10, 0.36, blackMetal),
    [0, -0.030, -0.055]
  );
  add(
    box(0.27, 0.18, 0.070, steel),
    [0, 0.040, -0.275]
  );

  // Slanted top cap approximates the dispenser silhouette.
  add(
    box(0.255, 0.075, 0.34, orangeDark),
    [0, 0.170, 0.015],
    [-0.10, 0, 0]
  );

  add(
    box(0.018, 0.145, 0.270, orangeDark),
    [-0.134, 0.045, -0.005],
    [0, 0, 0.02]
  );

  // Big exposed body screws.
  for (const x of [-0.135, 0.135]) {
    for (const z of [-0.14, 0.12]) {
      add(
        cylinder(0.020, 0.020, 0.028, 8, mats.bolt),
        [x, 0.065, z],
        [0, 0, Math.PI / 2]
      );
    }
  }

  // === 2. SIGNATURE TAPE WHEEL ===
  // Side-mounted moving tape roll. One assembly can spin during fire.
  const tapeWheel = new THREE.Group();
  tapeWheel.name = 'TapeRattlerWheel';
  tapeWheel.position.set(0.145, 0.205, 0.085);
  tapeWheel.rotation.y = Math.PI / 2;
  group.add(tapeWheel);

  const tapeRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.180, 0.055, 8, 18),
    creamTape
  );
  tapeRing.castShadow = true;
  tapeWheel.add(tapeRing);

  const tapeHub = cylinder(
    0.055,
    0.055,
    0.070,
    10,
    steel
  );
  tapeHub.rotation.x = Math.PI / 2;
  tapeWheel.add(tapeHub);

  // Three simple hub spokes.
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    const spoke = box(0.028, 0.120, 0.030, steel);
    spoke.position.set(
      Math.cos(a) * 0.060,
      Math.sin(a) * 0.060,
      0
    );
    spoke.rotation.z = a;
    tapeWheel.add(spoke);
  }

  // Slight outer tape edge gives the wheel a thick cartoon silhouette.
  const outerEdge = new THREE.Mesh(
    new THREE.TorusGeometry(0.182, 0.012, 5, 18),
    creamEdge
  );
  outerEdge.castShadow = true;
  tapeWheel.add(outerEdge);

  const hubCap = cylinder(0.070, 0.070, 0.026, 12, orangeDark);
  hubCap.rotation.x = Math.PI / 2;
  hubCap.position.z = 0.043;
  tapeWheel.add(hubCap);

  const hubBolt = cylinder(0.022, 0.022, 0.034, 10, mats.bolt);
  hubBolt.rotation.x = Math.PI / 2;
  hubBolt.position.z = 0.060;
  tapeWheel.add(hubBolt);

  // Translucent tape visibly feeds toward the cutter.
  add(
    box(0.014, 0.075, 0.355, tapeFilm),
    [0.153, 0.105, -0.190],
    [-0.08, 0, 0.015]
  );

  // === 3. SHORT PEN / PIPE BARREL ===
  add(
    cylinder(0.045, 0.050, 0.42, 10, steel),
    [0, 0.050, -0.480],
    [Math.PI / 2, 0, 0]
  );

  add(
    cylinder(0.066, 0.066, 0.070, 10, orangeDark),
    [0, 0.050, -0.300],
    [Math.PI / 2, 0, 0]
  );

  // Dark marker-tube section.
  add(
    cylinder(0.052, 0.052, 0.18, 10, blackMetal),
    [0, 0.050, -0.740],
    [Math.PI / 2, 0, 0]
  );

  // === 4. CUTTER-LIKE MUZZLE ===
  // Compact cylindrical end plus four chunky cutter teeth.
  add(
    cylinder(0.067, 0.067, 0.105, 10, blackMetal),
    [0, 0.050, -0.885],
    [Math.PI / 2, 0, 0]
  );

  for (let i = 0; i < 4; i++) {
    const angle = i / 4 * Math.PI * 2;
    const tooth = box(0.030, 0.065, 0.065, steel);
    tooth.position.set(
      Math.cos(angle) * 0.060,
      0.050 + Math.sin(angle) * 0.060,
      -0.935
    );
    tooth.rotation.z = angle;
    group.add(tooth);
  }

  // Front tape-cutter strip under the pipe.
  for (let i = 0; i < 5; i++) {
    const tooth = box(0.030, 0.032, 0.028, steel);
    tooth.position.set(
      (i - 2) * 0.034,
      -0.020,
      -0.655
    );
    tooth.rotation.z = (i % 2 ? 0.18 : -0.18);
    group.add(tooth);
  }

  // === 5. DISPENSER HANDLE / GRIP ===
  add(
    box(0.120, 0.32, 0.145, mats.rubber),
    [0, -0.225, 0.150],
    [-0.11, 0, 0]
  );

  for (let i = 0; i < 4; i++) {
    add(
      box(0.132, 0.038, 0.155, wrap),
      [0, -0.135 - i * 0.058, 0.150 + i * 0.006],
      [-0.11, 0, i % 2 ? 0.035 : -0.030]
    );
  }

  // Minimal trigger guard.
  const guard = new THREE.Mesh(
    new THREE.TorusGeometry(
      0.068,
      0.010,
      5,
      10,
      Math.PI * 1.45
    ),
    mats.bolt
  );
  add(
    guard,
    [0, -0.110, 0.060],
    [Math.PI / 2, 0, -0.40]
  );

  // === 6. BENT-WIRE REAR BRACE ===
  // Two simple rails with a wrapped rear pad, matching the supplied turnaround.
  const stockRoot = new THREE.Group();
  stockRoot.position.set(0, 0.010, 0.300);
  group.add(stockRoot);

  for (const x of [-0.072, 0.072]) {
    add(
      box(0.026, 0.026, 0.36, steel),
      [x, 0.010, 0.180],
      [0.02, 0, 0],
      stockRoot
    );
  }

  add(
    box(0.19, 0.18, 0.065, steel),
    [0, -0.005, 0.380],
    [0.02, 0, 0],
    stockRoot
  );

  for (let i = 0; i < 3; i++) {
    add(
      box(0.205, 0.035, 0.080, wrap),
      [0, -0.050 + i * 0.050, 0.380],
      [0, 0, i % 2 ? 0.035 : -0.025],
      stockRoot
    );
  }

  // Small spring/wire repair at the rear hinge.
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.032, 0.006, 5, 10),
      redWire
    );
    add(
      ring,
      [0, 0.030, 0.300 + i * 0.018],
      [0, Math.PI / 2, 0]
    );
  }

  // === 7. SMALL SIDE DETAILS ===
  // Simple switch and bottle-cap pivot; no military rails or scopes.
  add(
    box(0.035, 0.050, 0.060, blackMetal),
    [0.142, 0.100, -0.055]
  );
  add(
    cylinder(0.038, 0.038, 0.030, 10, mats.brass),
    [-0.145, 0.090, 0.080],
    [0, 0, Math.PI / 2]
  );

  // Compact top sights + front hand stop; detail without extra overall length.
  add(box(0.075, 0.060, 0.045, blackMetal), [0, 0.230, 0.115]);
  add(box(0.060, 0.075, 0.040, blackMetal), [0, 0.210, -0.255]);
  add(box(0.115, 0.085, 0.050, orangeDark), [0, -0.075, -0.330], [0.10, 0, 0]);

  // Gameplay sockets align to visible grip/support geometry.
  const rightGrip = new THREE.Object3D();
  rightGrip.name = 'RightGripSocket';
  rightGrip.position.set(
    cfg.rightGripX ?? 0,
    cfg.rightGripY ?? -0.205,
    cfg.rightGripZ ?? 0.165
  );
  group.add(rightGrip);

  const leftGrip = new THREE.Object3D();
  leftGrip.name = 'LeftForegripSocket';
  leftGrip.position.set(
    cfg.leftGripX ?? 0,
    cfg.leftGripY ?? -0.040,
    cfg.foregripZ ?? -0.285
  );
  group.add(leftGrip);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'MuzzleSocket';
  muzzle.position.set(0, 0.050, -0.955);
  group.add(muzzle);

  applyWeaponVisualScale(group, scale, cfg);

  return {
    group,
    rightGrip,
    leftGrip,
    muzzle,
    tapeWheel,
    barrelLength: 0.42,
    primaryMesh:
      group.children.find((child) => child.isMesh) ?? null
  };
}

function buildBugSprayerShotgun(cfg, mats, scale) {
  const group = new THREE.Group();
  group.name = 'JunkWeapon_BugSprayerShotgun';

  const add = (mesh, pos, rot = null, parent = group) => {
    mesh.position.set(pos[0], pos[1], pos[2]);
    if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
    parent.add(mesh);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  // Small, readable cartoon palette: faded red sprayer paint,
  // cream tank label, dark plumbing, dirty wrap and one yellow hose.
  const red = mat(0xb84c38, 0.84, 0.30);
  const redDark = mat(0x73362d, 0.90, 0.24);
  const cream = mat(0xc9b58b, 0.96, 0.02);
  const yellow = mat(0xc58a32, 0.82, 0.18);
  const wood = mat(0x6b482f, 0.95, 0.04);
  const gaugeFace = new THREE.MeshStandardMaterial({
    color: 0xd9d1b7,
    roughness: 0.32,
    metalness: 0.08
  });

  // === 1. BUG-SPRAYER TANK ===
  // One big canister is the whole receiver: deliberately simple.
  add(
    cylinder(0.145, 0.145, 0.42, 12, red),
    [0, 0.035, 0.00],
    [Math.PI / 2, 0, 0]
  );

  for (const z of [-0.222, 0.222]) {
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.146, 12, 6),
      redDark
    );
    cap.scale.set(1, 1, 0.33);
    add(cap, [0, 0.035, z]);
  }

  // Cream center band makes the tank read like a repurposed household sprayer.
  add(
    cylinder(0.151, 0.151, 0.18, 12, cream),
    [0, 0.035, -0.015],
    [Math.PI / 2, 0, 0]
  );

  // Simple crossed warning badge keeps the household bug-sprayer identity.
  add(cylinder(0.052, 0.052, 0.015, 12, redDark), [-0.154, 0.035, -0.015], [0, 0, Math.PI / 2]);
  add(box(0.014, 0.075, 0.012, cream), [-0.166, 0.035, -0.015], [0.65, 0, 0]);
  add(box(0.014, 0.075, 0.012, cream), [-0.166, 0.035, -0.015], [-0.65, 0, 0]);

  // Two crude metal tank straps.
  for (const z of [-0.165, 0.165]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.151, 0.014, 5, 12),
      mats.iron
    );
    add(ring, [0, 0.035, z]);
  }

  // === 2. SHORT PIPE BARREL ===
  add(
    cylinder(0.055, 0.060, 0.52, 10, mats.pipe),
    [0, 0.035, -0.46],
    [Math.PI / 2, 0, 0]
  );

  // One clamp joining tank to pipe.
  const frontClamp = new THREE.Mesh(
    new THREE.TorusGeometry(0.067, 0.014, 5, 10),
    mats.rust
  );
  add(frontClamp, [0, 0.035, -0.23]);

  // === 3. WIDE CARTOON SCATTER NOZZLE ===
  // Flared like a bug-sprayer horn, immediately readable as this weapon.
  add(
    new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.075,
        0.155,
        0.22,
        10,
        1,
        true
      ),
      red
    ),
    [0, 0.035, -0.83],
    [Math.PI / 2, 0, 0]
  );

  // Dark lip around the nozzle.
  const nozzleLip = new THREE.Mesh(
    new THREE.TorusGeometry(0.155, 0.018, 5, 12),
    redDark
  );
  add(nozzleLip, [0, 0.035, -0.945]);

  // Dark inner horn gives the nozzle visible depth.
  add(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.054, 0.125, 0.145, 10, 1, true),
      mats.dark
    ),
    [0, 0.035, -0.865],
    [Math.PI / 2, 0, 0]
  );

  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    add(
      cylinder(0.012, 0.012, 0.018, 7, mats.dark),
      [Math.cos(a) * 0.105, 0.035 + Math.sin(a) * 0.105, -0.958],
      [Math.PI / 2, 0, 0]
    );
  }

  // === 4. PUMP HANDLE ===
  // This is a real moving assembly. The support-hand target is parented to it,
  // so the left hand naturally racks with the pump.
  const pumpRoot = new THREE.Group();
  pumpRoot.name = 'BugSprayerPump';
  group.add(pumpRoot);

  add(
    cylinder(0.074, 0.078, 0.25, 10, wood),
    [0, -0.105, -0.505],
    [Math.PI / 2, 0, 0],
    pumpRoot
  );

  for (let i = 0; i < 4; i++) {
    const wrap = new THREE.Mesh(
      new THREE.TorusGeometry(0.080, 0.008, 5, 10),
      cream
    );
    add(
      wrap,
      [0, -0.105, -0.585 + i * 0.055],
      null,
      pumpRoot
    );
  }

  // === 5. SIMPLE PISTOL GRIP ===
  add(
    box(0.11, 0.30, 0.13, mats.rubber),
    [0, -0.215, 0.205],
    [-0.12, 0, 0]
  );
  for (let i = 0; i < 3; i++) {
    add(
      box(0.12, 0.035, 0.14, cream),
      [0, -0.145 - i * 0.060, 0.205 + i * 0.006],
      [-0.12, 0, i % 2 ? 0.035 : -0.025]
    );
  }

  // Tiny trigger guard only.
  const guard = new THREE.Mesh(
    new THREE.TorusGeometry(0.070, 0.010, 5, 10, Math.PI * 1.45),
    mats.bolt
  );
  add(guard, [0, -0.118, 0.120], [Math.PI / 2, 0, -0.40]);

  // === 6. ONE PRESSURE GAUGE ===
  const gaugeRoot = new THREE.Group();
  gaugeRoot.position.set(0.115, 0.175, -0.02);
  group.add(gaugeRoot);

  add(
    cylinder(0.058, 0.058, 0.025, 12, mats.iron),
    [0, 0, 0],
    [0, 0, Math.PI / 2],
    gaugeRoot
  );
  add(
    cylinder(0.047, 0.047, 0.028, 12, gaugeFace),
    [0.014, 0, 0],
    [0, 0, Math.PI / 2],
    gaugeRoot
  );

  const gaugeGlass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.044, 0.044, 0.008, 14),
    new THREE.MeshStandardMaterial({
      color: 0xa9d5df,
      roughness: 0.08,
      metalness: 0.02,
      transparent: true,
      opacity: 0.34
    })
  );
  add(gaugeGlass, [0.030, 0, 0], [0, 0, Math.PI / 2], gaugeRoot);

  // Simple needle on visible gauge face.
  add(
    box(0.010, 0.060, 0.008, redDark),
    [0.030, 0.012, 0],
    [0, 0, -0.55],
    gaugeRoot
  );

  // === 7. ONE YELLOW HOSE ===
  const hoseCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.105, 0.105, 0.10),
    new THREE.Vector3(-0.155, 0.155, -0.08),
    new THREE.Vector3(-0.145, 0.080, -0.36),
    new THREE.Vector3(-0.090, -0.005, -0.58)
  ]);
  const hose = new THREE.Mesh(
    new THREE.TubeGeometry(hoseCurve, 12, 0.013, 5, false),
    yellow
  );
  hose.castShadow = true;
  group.add(hose);

  // Small rear handle/brace from the original sprayer body.
  add(
    box(0.15, 0.055, 0.22, redDark),
    [0, 0.160, 0.155],
    [0.03, 0, 0]
  );

  // Heavier shotgun silhouette: shoulder stock + rubber butt pad.
  add(box(0.120, 0.090, 0.42, wood), [0, 0.035, 0.385], [-0.04, 0, 0]);
  add(box(0.185, 0.245, 0.075, mats.rubber), [0, -0.005, 0.620], [-0.02, 0, 0]);

  // Pump ribs make the moving support section visually clearer.
  for (let i = 0; i < 3; i++) {
    add(
      box(0.165, 0.024, 0.035, cream),
      [0, -0.176, -0.585 + i * 0.062],
      [0.04, 0, 0],
      pumpRoot
    );
  }

  // Gameplay sockets line up with visible grip geometry.
  const rightGrip = new THREE.Object3D();
  rightGrip.name = 'RightGripSocket';
  rightGrip.position.set(
    cfg.rightGripX ?? 0,
    cfg.rightGripY ?? -0.205,
    cfg.rightGripZ ?? 0.205
  );
  group.add(rightGrip);

  const leftGrip = new THREE.Object3D();
  leftGrip.name = 'LeftForegripSocket';
  leftGrip.position.set(
    cfg.leftGripX ?? 0,
    cfg.leftGripY ?? -0.095,
    cfg.foregripZ ?? -0.515
  );
  pumpRoot.add(leftGrip);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'MuzzleSocket';
  muzzle.position.set(0, 0.035, -0.965);
  group.add(muzzle);

  applyWeaponVisualScale(group, scale, cfg);

  return {
    group,
    rightGrip,
    leftGrip,
    muzzle,
    pumpRoot,
    barrelLength: 0.52,
    primaryMesh: group.children.find((child) => child.isMesh) ?? null
  };
}

function buildScrapEyeSniper(cfg, mats, scale) {
  const group = new THREE.Group();
  group.name = 'JunkWeapon_ScrapEyeSniper';

  const add = (mesh, pos, rot = null, parent = group) => {
    mesh.position.set(pos[0], pos[1], pos[2]);
    if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
    parent.add(mesh);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  const redPaint = mat(0xa94c37, 0.84, 0.34);
  const redDark = mat(0x713427, 0.90, 0.28);
  const warmSteel = mat(0x574c42, 0.78, 0.64);
  const bronze = mat(0x9a6a35, 0.66, 0.58);
  const blueGlass = new THREE.MeshStandardMaterial({
    color: 0x2f8ed0,
    emissive: 0x082b4c,
    emissiveIntensity: 0.55,
    roughness: 0.10,
    metalness: 0.12,
    transparent: true,
    opacity: 0.88
  });
  const creamWrap = mat(0xc5ad7c, 0.98, 0.01);

  // --- Receiver: layered, mismatched scrap plates ---
  add(box(0.25, 0.22, 0.58, mats.iron), [0, 0.015, -0.03]);
  add(box(0.268, 0.080, 0.48, redPaint), [0.012, 0.115, -0.065], [0.015, 0, -0.018]);
  add(box(0.030, 0.155, 0.36, warmSteel), [-0.142, 0.030, -0.06], [0.02, 0, 0.03]);
  add(box(0.032, 0.135, 0.28, redDark), [0.145, 0.015, -0.115], [-0.02, 0, -0.025]);

  // Patch plates and large bolts like the concept art.
  const plateA = add(box(0.032, 0.135, 0.17, bronze), [0.147, 0.020, 0.125], [0, 0, 0.04]);
  const plateB = add(box(0.032, 0.115, 0.19, redPaint), [-0.147, 0.045, -0.15], [0, 0, -0.035]);
  for (const z of [-0.22, -0.06, 0.10, 0.22]) {
    add(cylinder(0.018, 0.018, 0.035, 8, mats.bolt), [0.158, 0.073, z], [0, 0, Math.PI / 2]);
  }

  // Vent holes on the red receiver plate.
  for (const z of [-0.14, -0.04, 0.06]) {
    add(cylinder(0.022, 0.022, 0.035, 10, mats.dark), [0.153, 0.105, z], [0, 0, Math.PI / 2]);
  }

  // --- Pistol grip + taped field wrap ---
  add(box(0.115, 0.30, 0.135, mats.rubber), [0, -0.215, 0.195], [-0.12, 0, 0]);
  for (let i = 0; i < 5; i++) {
    add(
      box(0.128, 0.032, 0.148, i % 2 ? creamWrap : mats.tapeDark),
      [0, -0.118 - i * 0.050, 0.194 + i * 0.006],
      [-0.12, 0, i % 2 ? 0.035 : -0.03]
    );
  }

  // Trigger guard.
  const guard = new THREE.Mesh(
    new THREE.TorusGeometry(0.082, 0.012, 5, 12, Math.PI * 1.55),
    mats.bolt
  );
  add(guard, [0, -0.118, 0.105], [Math.PI / 2, 0, -0.40]);

  // --- Box magazine with scrap bands ---
  add(box(0.145, 0.255, 0.17, mats.dark), [0, -0.185, -0.055], [-0.10, 0, 0.01]);
  add(box(0.156, 0.050, 0.182, redPaint), [0, -0.095, -0.055], [-0.10, 0, 0.01]);
  add(box(0.156, 0.038, 0.182, bronze), [0, -0.265, -0.055], [-0.10, 0, 0.01]);

  // --- Long pipe barrel, visibly assembled from sections ---
  const barrelCenterZ = -0.93;
  add(cylinder(0.047, 0.051, 1.20, 10, mats.pipe), [0, 0.035, barrelCenterZ], [Math.PI / 2, 0, 0]);

  // Receiver-to-barrel collar.
  add(cylinder(0.075, 0.075, 0.09, 10, bronze), [0, 0.035, -0.37], [Math.PI / 2, 0, 0]);

  // Pipe couplers along the barrel.
  for (const z of [-0.58, -0.87, -1.12]) {
    add(cylinder(0.067, 0.067, 0.060, 10, z === -0.87 ? bronze : mats.rust), [0, 0.035, z], [Math.PI / 2, 0, 0]);
  }

  // Cloth wraps around the front half.
  for (let i = 0; i < 5; i++) {
    const wrap = cylinder(
      0.058 + (i % 2) * 0.004,
      0.058 + (i % 2) * 0.004,
      0.060,
      8,
      i === 2 ? redPaint : creamWrap
    );
    add(wrap, [0, 0.035, -1.24 - i * 0.055], [Math.PI / 2, 0, (i - 2) * 0.05]);
  }

  // Chunky rectangular muzzle brake with three visible vent slots.
  const muzzleZ = -1.59;
  add(box(0.18, 0.135, 0.23, warmSteel), [0, 0.035, muzzleZ]);
  add(box(0.150, 0.095, 0.055, mats.dark), [0, 0.035, muzzleZ - 0.118]);
  for (const x of [-0.050, 0, 0.050]) {
    add(box(0.030, 0.070, 0.245, mats.dark), [x, 0.035, muzzleZ], [0, 0, 0]);
  }
  // Side plates keep the brake from becoming a solid dark block.
  add(box(0.024, 0.145, 0.225, bronze), [0.100, 0.035, muzzleZ]);
  add(box(0.024, 0.145, 0.225, redDark), [-0.100, 0.035, muzzleZ]);

  // --- Skeletal stock: frame rather than a generic wooden block ---
  const stockRoot = new THREE.Group();
  stockRoot.position.set(0, 0, 0.34);
  group.add(stockRoot);

  // Rear spine and lower brace.
  add(box(0.090, 0.085, 0.54, warmSteel), [0, 0.055, 0.18], [-0.03, 0, 0], stockRoot);
  add(box(0.075, 0.070, 0.42, bronze), [0, -0.095, 0.17], [0.34, 0, 0], stockRoot);

  // Triangular open frame side rails.
  add(box(0.040, 0.040, 0.42, mats.iron), [0.105, 0.010, 0.20], [0.12, 0.08, 0], stockRoot);
  add(box(0.040, 0.040, 0.42, mats.iron), [-0.105, 0.010, 0.20], [0.12, -0.08, 0], stockRoot);

  // Butt plate / rubber pad.
  add(box(0.20, 0.30, 0.095, mats.rubber), [0, -0.005, 0.48], [0.02, 0, 0], stockRoot);
  add(box(0.165, 0.235, 0.035, redPaint), [0, -0.005, 0.423], [0.02, 0, 0], stockRoot);

  // Stock strap.
  add(box(0.235, 0.040, 0.11, creamWrap), [0, 0.015, 0.34], [0, 0, -0.10], stockRoot);

  add(
    box(0.18, 0.075, 0.30, redDark),
    [0, 0.120, 0.225],
    [-0.04, 0, 0],
    stockRoot
  );

  // Raised cheek rest makes the long rifle feel properly shouldered.
  add(
    box(0.165, 0.065, 0.26, mats.rubber),
    [0, 0.165, 0.205],
    [-0.035, 0, 0],
    stockRoot
  );

  // --- Oversized scavenged camera-lens scope ---
  const scopeRoot = new THREE.Group();
  scopeRoot.position.set(0, 0.245, -0.10);
  group.add(scopeRoot);

  // Mount rail.
  add(box(0.105, 0.045, 0.58, mats.dark), [0, -0.085, 0.00], [0.01, 0, 0], scopeRoot);

  // Main lens tube from mismatched cylinders.
  add(cylinder(0.082, 0.088, 0.33, 12, mats.dark), [0, 0, 0.02], [Math.PI / 2, 0, 0], scopeRoot);
  add(cylinder(0.105, 0.095, 0.18, 12, bronze), [0, 0, -0.22], [Math.PI / 2, 0, 0], scopeRoot);
  add(cylinder(0.075, 0.068, 0.16, 12, mats.dark), [0, 0, 0.25], [Math.PI / 2, 0, 0], scopeRoot);

  // Giant red camera-lens hood at the front.
  add(cylinder(0.155, 0.120, 0.17, 10, redPaint), [0, 0, -0.405], [Math.PI / 2, 0, 0], scopeRoot);
  add(cylinder(0.122, 0.122, 0.040, 16, mats.dark), [0, 0, -0.500], [Math.PI / 2, 0, 0], scopeRoot);
  add(cylinder(0.104, 0.104, 0.018, 18, blueGlass), [0, 0, -0.526], [Math.PI / 2, 0, 0], scopeRoot);

  const lensBezel = new THREE.Mesh(
    new THREE.TorusGeometry(0.112, 0.009, 6, 18),
    bronze
  );
  add(lensBezel, [0, 0, -0.540], [0, 0, 0], scopeRoot);

  const lensGlint = new THREE.Mesh(
    new THREE.PlaneGeometry(0.085, 0.018),
    new THREE.MeshBasicMaterial({
      color: 0xbde8ff,
      transparent: true,
      opacity: 0.58,
      depthWrite: false
    })
  );
  lensGlint.position.set(-0.020, 0.028, -0.548);
  lensGlint.rotation.z = -0.42;
  scopeRoot.add(lensGlint);

  // Small rear eyepiece glass.
  add(cylinder(0.058, 0.058, 0.015, 14, blueGlass), [0, 0, 0.340], [Math.PI / 2, 0, 0], scopeRoot);

  // Clamp rings.
  for (const z of [-0.12, 0.12, -0.30]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(z === -0.30 ? 0.113 : 0.092, 0.013, 6, 14),
      z === -0.30 ? redDark : bronze
    );
    add(ring, [0, 0, z], [0, 0, 0], scopeRoot);
  }

  // Scope mounting brackets.
  for (const z of [-0.16, 0.12]) {
    add(box(0.150, 0.055, 0.045, warmSteel), [0, -0.085, z], [0, 0, 0], scopeRoot);
    add(box(0.050, 0.080, 0.042, mats.bolt), [0, -0.045, z], [0, 0, 0], scopeRoot);
  }

  // Adjustment turret + little side knob.
  add(cylinder(0.040, 0.040, 0.070, 10, bronze), [0, 0.105, -0.02], [0, 0, 0], scopeRoot);
  add(cylinder(0.032, 0.032, 0.060, 10, mats.bolt), [0.105, 0.020, -0.02], [0, 0, Math.PI / 2], scopeRoot);

  // --- Folded bipod/support rod like the concept ---
  const bipodRoot = new THREE.Group();
  bipodRoot.position.set(0, -0.075, -0.56);
  group.add(bipodRoot);

  for (const side of [-1, 1]) {
    const rail = box(0.030, 0.030, 0.78, warmSteel);
    rail.position.set(side * 0.055, -0.055, -0.26);
    rail.rotation.set(-0.13, side * 0.035, side * 0.03);
    bipodRoot.add(rail);

    const foot = box(0.085, 0.045, 0.085, mats.rubber);
    foot.position.set(side * 0.075, -0.110, -0.66);
    foot.rotation.z = side * 0.08;
    bipodRoot.add(foot);
  }

  // Front pivot hardware.
  add(cylinder(0.048, 0.048, 0.16, 10, mats.bolt), [0, -0.01, 0.04], [0, 0, Math.PI / 2], bipodRoot);

  // --- Exposed junk cable ---
  const cablePoints = [
    new THREE.Vector3(-0.13, 0.10, 0.12),
    new THREE.Vector3(-0.16, 0.04, -0.08),
    new THREE.Vector3(-0.14, -0.02, -0.24),
    new THREE.Vector3(-0.10, 0.02, -0.38)
  ];
  const cableCurve = new THREE.CatmullRomCurve3(cablePoints);
  const cable = new THREE.Mesh(
    new THREE.TubeGeometry(cableCurve, 14, 0.009, 5, false),
    mats.rubber
  );
  cable.castShadow = true;
  group.add(cable);

  // --- Gameplay sockets: preserve existing weapon/IK contract ---
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
    cfg.foregripZ ?? -0.405
  );
  group.add(leftGrip);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'MuzzleSocket';
  muzzle.position.set(0, 0.035, muzzleZ - 0.135);
  group.add(muzzle);

  applyWeaponVisualScale(group, scale, cfg);

  return {
    group,
    rightGrip,
    leftGrip,
    muzzle,
    barrelLength: 1.20,
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
  if (name.includes('TAPE-RATTLER')) return 'tapeRattler';
  if (name.includes('COMPACT')) return 'canSMG';
  if (name.includes('LONG')) return 'railSMG';
  if (name.includes('STAPLE')) return 'stapleSlinger';
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
    metalness,
    flatShading: true
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

function coilSpring(length, radius, turns, thickness, material, segments = 48) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const a = t * turns * Math.PI * 2;
    points.push(new THREE.Vector3(
      Math.cos(a) * radius,
      Math.sin(a) * radius,
      -length * 0.5 + length * t
    ));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const mesh = new THREE.Mesh(
    new THREE.TubeGeometry(curve, segments, thickness, 5, false),
    material
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
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
