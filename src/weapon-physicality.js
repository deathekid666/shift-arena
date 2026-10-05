// Convert real-world weapon mass (kg) into bounded gameplay handling values.
// Mass is data; this module only controls visual inertia/response. It does not
// slow the player or change weapon damage.
const DEFAULT_MASS_KG = 3.5;
const KG_PER_HANDLING_UNIT = 3.0;
const MIN_HANDLING_MASS = 0.72;
const MAX_HANDLING_MASS = 1.95;

function finitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

export function getWeaponMassKg(cfg = {}) {
  return finitePositive(cfg.massKg, DEFAULT_MASS_KG);
}

export function handlingMassFromKg(massKg) {
  const kg = finitePositive(massKg, DEFAULT_MASS_KG);
  return Math.min(
    MAX_HANDLING_MASS,
    Math.max(
      MIN_HANDLING_MASS,
      kg / KG_PER_HANDLING_UNIT
    )
  );
}

export function getWeaponHandlingMass(cfg = {}) {
  return handlingMassFromKg(
    getWeaponMassKg(cfg)
  );
}

export function responseScaleFromKg(massKg) {
  // Weight must be readable in third person, not merely measurable in data.
  // An inverse-mass response makes a 9.5 kg precision rifle roughly half as
  // responsive as an AR while keeping compact weapons quick.
  return 1 /
    handlingMassFromKg(massKg);
}

export function followResponseFromKg(massKg) {
  const handlingMass =
    handlingMassFromKg(massKg);

  // This spring is used only while raising/lowering the weapon. At the fully
  // shouldered firing endpoint the weapon remains exact to the crosshair.
  return Math.min(
    48,
    Math.max(
      9,
      40 /
        (handlingMass * handlingMass)
    )
  );
}

export function getWeaponResponseScale(cfg = {}) {
  return responseScaleFromKg(
    getWeaponMassKg(cfg)
  );
}

export function getWeaponFollowResponse(cfg = {}) {
  return followResponseFromKg(
    getWeaponMassKg(cfg)
  );
}

export function getWeaponPhysicalSize(cfg = {}) {
  const size = cfg.physicalSizeM ?? {};
  return {
    width: finitePositive(size.width, 0.12),
    height: finitePositive(size.height, 0.26),
    length: finitePositive(size.length, 0.84)
  };
}


export function computePhysicalScale(
  sourceSize,
  targetSize,
  presentationScale = 1
) {
  const source = {
    width: finitePositive(sourceSize?.width, 1),
    height: finitePositive(sourceSize?.height, 1),
    length: finitePositive(sourceSize?.length, 1)
  };
  const target = {
    width: finitePositive(targetSize?.width, 0.12),
    height: finitePositive(targetSize?.height, 0.26),
    length: finitePositive(targetSize?.length, 0.84)
  };
  const presentation =
    finitePositive(presentationScale, 1);

  return {
    x: target.width / source.width * presentation,
    y: target.height / source.height * presentation,
    z: target.length / source.length * presentation
  };
}
