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
  hand: { right: 0.20, up: -0.10, forward: 0.27 },
  pole: { right: 0.56, up: 0.02, forward: 0.12 },
  chest: { x: 0, y: -0.025, z: 0 },
  shoulder: { x: -0.025, y: 0.020, z: -0.055 },
  blade: { right: -0.08, up: -0.32, forward: 0.94 },
  edgeRoll: -0.08
};

const SPRINT = {
  hand: { right: 0.24, up: -0.23, forward: 0.12 },
  pole: { right: 0.60, up: -0.11, forward: -0.01 },
  chest: { x: 0.025, y: -0.015, z: 0 },
  shoulder: { x: 0.020, y: 0.025, z: -0.095 },
  blade: { right: -0.04, up: -0.54, forward: 0.84 },
  edgeRoll: -0.12
};

const SWINGS = [
  {
    windup: {
      hand: { right: 0.43, up: 0.25, forward: 0.08 },
      pole: { right: 0.73, up: 0.36, forward: 0.03 },
      chest: { x: -0.02, y: 0.085, z: 0.025 },
      shoulder: { x: -0.05, y: -0.05, z: 0.12 },
      blade: { right: 0.26, up: 0.24, forward: 0.93 },
      edgeRoll: 0.18
    },
    contact: {
      hand: { right: -0.04, up: 0.02, forward: 0.71 },
      pole: { right: 0.31, up: 0.18, forward: 0.51 },
      chest: { x: -0.01, y: -0.12, z: -0.02 },
      shoulder: { x: 0.01, y: 0.08, z: -0.06 },
      blade: { right: -0.35, up: -0.12, forward: 0.93 },
      edgeRoll: -0.16
    },
    follow: {
      hand: { right: -0.34, up: -0.12, forward: 0.51 },
      pole: { right: 0.03, up: 0.03, forward: 0.53 },
      chest: { x: 0.01, y: -0.17, z: -0.03 },
      shoulder: { x: 0.03, y: 0.11, z: -0.09 },
      blade: { right: -0.55, up: -0.27, forward: 0.79 },
      edgeRoll: -0.25
    }
  },
  {
    windup: {
      hand: { right: -0.18, up: 0.18, forward: 0.30 },
      pole: { right: 0.18, up: 0.31, forward: 0.42 },
      chest: { x: -0.01, y: -0.085, z: -0.02 },
      shoulder: { x: -0.02, y: 0.09, z: -0.05 },
      blade: { right: -0.42, up: 0.10, forward: 0.90 },
      edgeRoll: -0.20
    },
    contact: {
      hand: { right: 0.12, up: 0.01, forward: 0.72 },
      pole: { right: 0.47, up: 0.17, forward: 0.47 },
      chest: { x: -0.01, y: 0.105, z: 0.02 },
      shoulder: { x: 0.01, y: -0.07, z: 0.07 },
      blade: { right: 0.29, up: -0.12, forward: 0.95 },
      edgeRoll: 0.15
    },
    follow: {
      hand: { right: 0.37, up: -0.10, forward: 0.48 },
      pole: { right: 0.69, up: 0.02, forward: 0.30 },
      chest: { x: 0.01, y: 0.15, z: 0.03 },
      shoulder: { x: 0.03, y: -0.10, z: 0.10 },
      blade: { right: 0.50, up: -0.25, forward: 0.83 },
      edgeRoll: 0.23
    }
  },
  {
    windup: {
      hand: { right: 0.33, up: 0.38, forward: 0.06 },
      pole: { right: 0.66, up: 0.52, forward: 0.02 },
      chest: { x: -0.025, y: 0.07, z: 0.035 },
      shoulder: { x: -0.07, y: -0.04, z: 0.14 },
      blade: { right: 0.23, up: 0.39, forward: 0.89 },
      edgeRoll: 0.22
    },
    contact: {
      hand: { right: -0.03, up: -0.01, forward: 0.72 },
      pole: { right: 0.30, up: 0.15, forward: 0.53 },
      chest: { x: 0.00, y: -0.11, z: -0.025 },
      shoulder: { x: 0.03, y: 0.08, z: -0.07 },
      blade: { right: -0.29, up: -0.28, forward: 0.91 },
      edgeRoll: -0.17
    },
    follow: {
      hand: { right: -0.29, up: -0.22, forward: 0.49 },
      pole: { right: 0.06, up: -0.02, forward: 0.48 },
      chest: { x: 0.02, y: -0.15, z: -0.04 },
      shoulder: { x: 0.04, y: 0.10, z: -0.10 },
      blade: { right: -0.47, up: -0.46, forward: 0.76 },
      edgeRoll: -0.27
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
