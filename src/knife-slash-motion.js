const clamp01 = (value) =>
  Math.min(1, Math.max(0, value));

const smooth = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const easeIn = (value) => {
  const t = clamp01(value);
  return t * t * t;
};

const easeOut = (value) => {
  const t = clamp01(value);
  return 1 - Math.pow(1 - t, 3);
};

function mix(a, b, t) {
  return a + (b - a) * t;
}

function mixVector(a, b, t) {
  return {
    right: mix(a.right, b.right, t),
    up: mix(a.up, b.up, t),
    forward: mix(a.forward, b.forward, t)
  };
}

function mixEuler(a, b, t) {
  return {
    x: mix(a.x, b.x, t),
    y: mix(a.y, b.y, t),
    z: mix(a.z, b.z, t)
  };
}

function mixPose(from, to, t) {
  return {
    hand: mixVector(from.hand, to.hand, t),
    pole: mixVector(from.pole, to.pole, t),
    chest: mixEuler(from.chest, to.chest, t),
    shoulder: mixEuler(from.shoulder, to.shoulder, t),
    blade: mixVector(from.blade, to.blade, t),
    edgeRoll: mix(from.edgeRoll, to.edgeRoll, t)
  };
}

const READY = {
  // Third-person knife carry: keep the weapon clearly in one hand, outside
  // the torso silhouette. The elbow stays soft and the blade points forward
  // with a slight downward cant instead of lying across the chest like a gun.
  hand: { right: 0.32, up: -0.30, forward: 0.16 },
  pole: { right: 0.66, up: -0.08, forward: 0.10 },
  chest: { x: 0.005, y: -0.015, z: 0 },
  shoulder: { x: 0.010, y: 0.015, z: -0.075 },
  blade: { right: -0.06, up: -0.20, forward: 0.98 },
  edgeRoll: -0.04
};

const SPRINT = {
  // Running lowers the knife beside the right hip while keeping the same
  // forward hammer grip. It must never migrate back into a rifle-ready pose.
  hand: { right: 0.36, up: -0.46, forward: 0.05 },
  pole: { right: 0.70, up: -0.22, forward: -0.02 },
  chest: { x: 0.025, y: -0.005, z: 0 },
  shoulder: { x: 0.035, y: 0.015, z: -0.105 },
  blade: { right: -0.02, up: -0.38, forward: 0.92 },
  edgeRoll: -0.06
};

const SWINGS = [
  {
    // Primary 1: strong right-to-left cut. The hand crosses the torso instead
    // of merely reaching forward, and the blade stays readable from behind.
    windup: {
      hand: { right: 0.58, up: 0.20, forward: 0.10 },
      pole: { right: 0.78, up: 0.42, forward: 0.02 },
      chest: { x: -0.025, y: 0.16, z: 0.035 },
      shoulder: { x: -0.055, y: -0.09, z: 0.16 },
      blade: { right: 0.56, up: 0.16, forward: 0.81 },
      edgeRoll: 0.22
    },
    contact: {
      hand: { right: -0.12, up: -0.02, forward: 0.66 },
      pole: { right: 0.24, up: 0.16, forward: 0.47 },
      chest: { x: -0.01, y: -0.18, z: -0.025 },
      shoulder: { x: 0.015, y: 0.11, z: -0.085 },
      blade: { right: -0.56, up: -0.14, forward: 0.82 },
      edgeRoll: -0.20
    },
    follow: {
      hand: { right: -0.50, up: -0.14, forward: 0.42 },
      pole: { right: -0.04, up: 0.02, forward: 0.43 },
      chest: { x: 0.015, y: -0.28, z: -0.045 },
      shoulder: { x: 0.035, y: 0.15, z: -0.12 },
      blade: { right: -0.72, up: -0.22, forward: 0.66 },
      edgeRoll: -0.30
    }
  },
  {
    // Primary 2: return cut, left-to-right, mirroring the readable screen arc.
    windup: {
      hand: { right: -0.42, up: 0.14, forward: 0.28 },
      pole: { right: 0.04, up: 0.30, forward: 0.42 },
      chest: { x: -0.015, y: -0.15, z: -0.025 },
      shoulder: { x: -0.035, y: 0.10, z: -0.08 },
      blade: { right: -0.56, up: 0.14, forward: 0.82 },
      edgeRoll: -0.22
    },
    contact: {
      hand: { right: 0.14, up: -0.02, forward: 0.67 },
      pole: { right: 0.48, up: 0.16, forward: 0.45 },
      chest: { x: -0.01, y: 0.17, z: 0.025 },
      shoulder: { x: 0.015, y: -0.10, z: 0.085 },
      blade: { right: 0.56, up: -0.14, forward: 0.82 },
      edgeRoll: 0.20
    },
    follow: {
      hand: { right: 0.50, up: -0.13, forward: 0.42 },
      pole: { right: 0.80, up: 0.02, forward: 0.28 },
      chest: { x: 0.015, y: 0.27, z: 0.045 },
      shoulder: { x: 0.035, y: -0.15, z: 0.12 },
      blade: { right: 0.72, up: -0.22, forward: 0.66 },
      edgeRoll: 0.30
    }
  },
  {
    // Primary 3: high-right to low-left diagonal finisher.
    windup: {
      hand: { right: 0.48, up: 0.43, forward: 0.10 },
      pole: { right: 0.76, up: 0.57, forward: 0.01 },
      chest: { x: -0.04, y: 0.13, z: 0.055 },
      shoulder: { x: -0.085, y: -0.07, z: 0.18 },
      blade: { right: 0.36, up: 0.50, forward: 0.78 },
      edgeRoll: 0.28
    },
    contact: {
      hand: { right: -0.10, up: -0.13, forward: 0.66 },
      pole: { right: 0.24, up: 0.10, forward: 0.49 },
      chest: { x: 0.01, y: -0.18, z: -0.05 },
      shoulder: { x: 0.04, y: 0.11, z: -0.10 },
      blade: { right: -0.40, up: -0.44, forward: 0.80 },
      edgeRoll: -0.24
    },
    follow: {
      hand: { right: -0.43, up: -0.38, forward: 0.36 },
      pole: { right: -0.02, up: -0.12, forward: 0.39 },
      chest: { x: 0.035, y: -0.26, z: -0.075 },
      shoulder: { x: 0.06, y: 0.15, z: -0.14 },
      blade: { right: -0.58, up: -0.55, forward: 0.60 },
      edgeRoll: -0.34
    }
  }
];

export function sampleKnifeReady(sprintBlend = 0) {
  return {
    phase: 'ready',
    attackWeight: 1,
    hitActive: false,
    contactStrength: 0,
    ...mixPose(
      READY,
      SPRINT,
      smooth(sprintBlend)
    )
  };
}

export function sampleKnifeSlash(progress, variant = 0) {
  const t = clamp01(progress);
  const index =
    Math.abs(Math.trunc(variant)) %
    SWINGS.length;
  const swing = SWINGS[index];

  let pose;
  let phase;

  if (t < 0.16) {
    phase = 'anticipation';
    pose = mixPose(
      READY,
      swing.windup,
      smooth(t / 0.16)
    );
  } else if (t < 0.40) {
    phase = 'strike';
    pose = mixPose(
      swing.windup,
      swing.contact,
      easeIn((t - 0.16) / 0.24)
    );
  } else if (t < 0.56) {
    phase = 'follow';
    pose = mixPose(
      swing.contact,
      swing.follow,
      easeOut((t - 0.40) / 0.16)
    );
  } else if (t < 0.72) {
    phase = 'recovery';
    pose = mixPose(
      swing.follow,
      READY,
      smooth((t - 0.56) / 0.16)
    );
  } else {
    // The combo can chain at 72%, so be exactly back at READY there.
    // This prevents the next swing from teleporting across the body.
    phase = 'ready';
    pose = READY;
  }

  const attackWeight =
    t < 0.07
      ? smooth(t / 0.07)
      : t < 0.68
        ? 1
        : 1 -
          smooth((t - 0.68) / 0.32);

  const contactStrength =
    t < 0.20 || t > 0.56
      ? 0
      : Math.sin(
          ((t - 0.20) / 0.36) *
          Math.PI
        );

  return {
    t,
    variant: index,
    phase,
    attackWeight,
    hitActive:
      t >= 0.23 &&
      t <= 0.53,
    contactStrength:
      Math.max(0, contactStrength),
    ...pose
  };
}
