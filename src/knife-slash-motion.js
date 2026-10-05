const clamp01 = (value) =>
  Math.min(
    1,
    Math.max(0, value)
  );

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
    forward: mix(
      a.forward,
      b.forward,
      t
    )
  };
}

function mixEuler(a, b, t) {
  return {
    x: mix(a.x, b.x, t),
    y: mix(a.y, b.y, t),
    z: mix(a.z, b.z, t)
  };
}

const READY_HAND = {
  right: 0.20,
  up: 0.10,
  forward: 0.24
};

const WINDUP_HAND = {
  right: 0.46,
  up: 0.42,
  forward: -0.05
};

const CONTACT_HAND = {
  right: -0.08,
  up: 0.04,
  forward: 0.73
};

const FOLLOW_HAND = {
  right: -0.39,
  up: -0.18,
  forward: 0.55
};

const RECOVER_HAND = {
  right: 0.16,
  up: 0.08,
  forward: 0.28
};

const READY_POLE = {
  right: 0.54,
  up: 0.42,
  forward: 0.12
};

const WINDUP_POLE = {
  right: 0.76,
  up: 0.56,
  forward: 0.02
};

const CONTACT_POLE = {
  right: 0.30,
  up: 0.24,
  forward: 0.52
};

const FOLLOW_POLE = {
  right: 0.02,
  up: 0.06,
  forward: 0.55
};

const RECOVER_POLE = {
  right: 0.42,
  up: 0.30,
  forward: 0.22
};

const ZERO_EULER = {
  x: 0,
  y: 0,
  z: 0
};

const WINDUP_CHEST = {
  x: -0.025,
  y: 0.105,
  z: 0.035
};

const CONTACT_CHEST = {
  x: -0.020,
  y: -0.155,
  z: -0.030
};

const FOLLOW_CHEST = {
  x: 0.015,
  y: -0.205,
  z: -0.045
};

const WINDUP_SHOULDER = {
  x: -0.055,
  y: -0.065,
  z: 0.135
};

const CONTACT_SHOULDER = {
  x: 0.015,
  y: 0.105,
  z: -0.075
};

const FOLLOW_SHOULDER = {
  x: 0.040,
  y: 0.135,
  z: -0.110
};

const READY_BLADE = {
  right: 0.12,
  up: 0.18,
  forward: 0.96
};

const WINDUP_BLADE = {
  right: 0.28,
  up: 0.32,
  forward: 0.90
};

const CONTACT_BLADE = {
  right: -0.38,
  up: -0.20,
  forward: 0.90
};

const FOLLOW_BLADE = {
  right: -0.56,
  up: -0.34,
  forward: 0.74
};

const RECOVER_BLADE = {
  right: 0.06,
  up: 0.08,
  forward: 0.99
};

function segmentSample(
  t,
  start,
  end,
  from,
  to,
  easing
) {
  const k =
    easing(
      (t - start) /
      Math.max(
        0.0001,
        end - start
      )
    );

  return {
    hand:
      mixVector(
        from.hand,
        to.hand,
        k
      ),
    pole:
      mixVector(
        from.pole,
        to.pole,
        k
      ),
    chest:
      mixEuler(
        from.chest,
        to.chest,
        k
      ),
    shoulder:
      mixEuler(
        from.shoulder,
        to.shoulder,
        k
      ),
    blade:
      mixVector(
        from.blade,
        to.blade,
        k
      ),
    edgeRoll:
      mix(
        from.edgeRoll,
        to.edgeRoll,
        k
      )
  };
}

const READY = {
  hand: READY_HAND,
  pole: READY_POLE,
  chest: ZERO_EULER,
  shoulder: ZERO_EULER,
  blade: READY_BLADE,
  edgeRoll: 0
};

const WINDUP = {
  hand: WINDUP_HAND,
  pole: WINDUP_POLE,
  chest: WINDUP_CHEST,
  shoulder: WINDUP_SHOULDER,
  blade: WINDUP_BLADE,
  edgeRoll: 0.28
};

const CONTACT = {
  hand: CONTACT_HAND,
  pole: CONTACT_POLE,
  chest: CONTACT_CHEST,
  shoulder: CONTACT_SHOULDER,
  blade: CONTACT_BLADE,
  edgeRoll: -0.18
};

const FOLLOW = {
  hand: FOLLOW_HAND,
  pole: FOLLOW_POLE,
  chest: FOLLOW_CHEST,
  shoulder: FOLLOW_SHOULDER,
  blade: FOLLOW_BLADE,
  edgeRoll: -0.30
};

const RECOVER = {
  hand: RECOVER_HAND,
  pole: RECOVER_POLE,
  chest: ZERO_EULER,
  shoulder: ZERO_EULER,
  blade: RECOVER_BLADE,
  edgeRoll: 0
};

export function sampleKnifeSlash(
  progress
) {
  const t =
    clamp01(progress);

  let pose;
  let phase;

  if (t < 0.18) {
    phase = 'anticipation';
    pose =
      segmentSample(
        t,
        0,
        0.18,
        READY,
        WINDUP,
        smooth
      );
  } else if (t < 0.46) {
    phase = 'strike';
    pose =
      segmentSample(
        t,
        0.18,
        0.46,
        WINDUP,
        CONTACT,
        easeIn
      );
  } else if (t < 0.64) {
    phase = 'follow';
    pose =
      segmentSample(
        t,
        0.46,
        0.64,
        CONTACT,
        FOLLOW,
        easeOut
      );
  } else {
    phase = 'recovery';
    pose =
      segmentSample(
        t,
        0.64,
        1,
        FOLLOW,
        RECOVER,
        smooth
      );
  }

  const attackWeight =
    t < 0.10
      ? smooth(t / 0.10)
      : t < 0.70
        ? 1
        : 1 -
          smooth(
            (t - 0.70) /
              0.30
          );

  const contactStrength =
    t < 0.24 ||
    t > 0.62
      ? 0
      : Math.sin(
          (
            (t - 0.24) /
            (0.62 - 0.24)
          ) *
            Math.PI
        );

  return {
    t,
    phase,
    attackWeight,
    hitActive:
      t >= 0.28 &&
      t <= 0.60,
    contactStrength:
      Math.max(
        0,
        contactStrength
      ),
    ...pose
  };
}
