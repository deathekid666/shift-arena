import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMHumanBoneParentMap } from '@pixiv/three-vrm';

// Real animation-state pipeline.
// UAL1 owns base locomotion/crouch; UAL2 owns advanced movement, including
// the authored three-part slide. Both packs are CC0 and pinned for stability.
const BASE_ANIMATION_LIBRARY_URL =
  'https://cdn.jsdelivr.net/gh/norio/vrm-game-starter@b14c236fd8150855348ad085b7820c298eac4b30/src/assets/AnimationLibrary.glb';

const SLIDE_ANIMATION_LIBRARY_URL =
  'https://cdn.jsdelivr.net/gh/Barbatos6669/elderforge@bb2ce469f0ab2ccfc487faef55550ba07fae2483/assets/animations/universal_animation_library_2/UAL2_Standard.glb';

const REST_POSE_CLIP = 'A_TPose';
const CLIPS = {
  IDLE: 'Idle_Loop',
  MOVE: 'Jog_Fwd_Loop',
  SPRINT: 'Sprint_Loop',
  CROUCH_IDLE: 'Crouch_Idle_Loop',
  CROUCH_MOVE: 'Crouch_Fwd_Loop',
  SLIDE_START: 'Slide_Start',
  SLIDE_LOOP: 'Slide_Loop',
  SLIDE_EXIT: 'Slide_Exit'
};

const BASE_CLIP_NAMES = [
  CLIPS.IDLE,
  CLIPS.MOVE,
  CLIPS.SPRINT,
  CLIPS.CROUCH_IDLE,
  CLIPS.CROUCH_MOVE
];

const SLIDE_CLIP_NAMES = [
  CLIPS.SLIDE_START,
  CLIPS.SLIDE_LOOP,
  CLIPS.SLIDE_EXIT
];

const UAL1_SOURCE_BONE_TO_HUMAN = {
  'DEF-hips': 'hips',
  'DEF-spine001': 'spine',
  'DEF-spine002': 'chest',
  'DEF-spine003': 'upperChest',
  'DEF-neck': 'neck',
  'DEF-head': 'head',
  'DEF-shoulderL': 'leftShoulder',
  'DEF-upper_armL': 'leftUpperArm',
  'DEF-forearmL': 'leftLowerArm',
  'DEF-handL': 'leftHand',
  'DEF-shoulderR': 'rightShoulder',
  'DEF-upper_armR': 'rightUpperArm',
  'DEF-forearmR': 'rightLowerArm',
  'DEF-handR': 'rightHand',
  'DEF-thighL': 'leftUpperLeg',
  'DEF-shinL': 'leftLowerLeg',
  'DEF-footL': 'leftFoot',
  'DEF-toeL': 'leftToes',
  'DEF-thighR': 'rightUpperLeg',
  'DEF-shinR': 'rightLowerLeg',
  'DEF-footR': 'rightFoot',
  'DEF-toeR': 'rightToes'
};

// UAL2 uses the original Quaternius / UE5 mannequin-style bone names.
const UAL2_SOURCE_BONE_TO_HUMAN = {
  pelvis: 'hips',
  spine_01: 'spine',
  spine_02: 'chest',
  spine_03: 'upperChest',
  neck_01: 'neck',
  Head: 'head',
  clavicle_l: 'leftShoulder',
  upperarm_l: 'leftUpperArm',
  lowerarm_l: 'leftLowerArm',
  hand_l: 'leftHand',
  clavicle_r: 'rightShoulder',
  upperarm_r: 'rightUpperArm',
  lowerarm_r: 'rightLowerArm',
  hand_r: 'rightHand',
  thigh_l: 'leftUpperLeg',
  calf_l: 'leftLowerLeg',
  foot_l: 'leftFoot',
  ball_l: 'leftToes',
  thigh_r: 'rightUpperLeg',
  calf_r: 'rightLowerLeg',
  foot_r: 'rightFoot',
  ball_r: 'rightToes'
};

let baseLibraryPromise = null;
let slideLibraryPromise = null;

export async function createVrmLocomotionController(character, vrm) {
  const baseLibrary = await loadBaseAnimationLibrary();

  let slideLibrary = null;
  try {
    slideLibrary = await loadSlideAnimationLibrary();
  } catch (error) {
    console.warn(
      'UAL2 slide library failed to load; keeping procedural slide fallback.',
      error
    );
  }

  const baseClips = retargetHumanoidAnimationClips(
    baseLibrary.animations,
    vrm,
    BASE_CLIP_NAMES,
    UAL1_SOURCE_BONE_TO_HUMAN,
    {
      sourcePelvisName: 'DEF-hips',
      useAnimatedRoot: true
    }
  );

  let slideClips = [];
  if (slideLibrary) {
    try {
      slideClips = retargetHumanoidAnimationClips(
        slideLibrary.animations,
        vrm,
        SLIDE_CLIP_NAMES,
        UAL2_SOURCE_BONE_TO_HUMAN,
        {
          sourcePelvisName: 'pelvis',
          useAnimatedRoot: false
        }
      );
    } catch (error) {
      console.warn(
        'UAL2 slide retarget failed; keeping UAL1 locomotion and procedural slide fallback.',
        error
      );
      slideClips = [];
    }
  }

  const clips = [...baseClips, ...slideClips];
  const mixer = new THREE.AnimationMixer(character.root);
  const actions = new Map();

  for (const clip of clips) {
    const action = mixer.clipAction(clip);
    const oneShot =
      clip.name === CLIPS.SLIDE_START ||
      clip.name === CLIPS.SLIDE_EXIT;

    action.enabled = true;
    action.setLoop(
      oneShot ? THREE.LoopOnce : THREE.LoopRepeat,
      oneShot ? 1 : Infinity
    );
    action.clampWhenFinished = oneShot;
    action.setEffectiveWeight(0);
    action.setEffectiveTimeScale(1);

    if (!oneShot) action.play();
    actions.set(clip.name, action);
  }

  const idle = actions.get(CLIPS.IDLE);
  const move = actions.get(CLIPS.MOVE);
  const sprint = actions.get(CLIPS.SPRINT);
  const crouchIdle = actions.get(CLIPS.CROUCH_IDLE);
  const crouchMove = actions.get(CLIPS.CROUCH_MOVE);
  const slideStart = actions.get(CLIPS.SLIDE_START) ?? null;
  const slideLoop = actions.get(CLIPS.SLIDE_LOOP) ?? null;
  const slideExit = actions.get(CLIPS.SLIDE_EXIT) ?? null;

  if (!idle || !move || !sprint || !crouchIdle || !crouchMove) {
    throw new Error('Authored base locomotion clips missing from UAL1.');
  }

  const hasAuthoredSlide = Boolean(
    slideStart && slideLoop && slideExit
  );

  const actionByKey = {
    idle,
    move,
    sprint,
    crouchIdle,
    crouchMove,
    slideStart,
    slideLoop,
    slideExit
  };

  const weights = {
    idle: 1,
    move: 0,
    sprint: 0,
    crouchIdle: 0,
    crouchMove: 0,
    slideStart: 0,
    slideLoop: 0,
    slideExit: 0
  };

  idle.weight = 1;

  // Overall authored-locomotion strength is separate from relative clip
  // weights. Without this, normalizing clip weights forces the first grounded
  // frame after a jump straight back to 100% authored locomotion.
  let masterWeight = 1;

  function applyWeights(intents, dt, lambda = 14) {
    let total = 0;

    for (const key of Object.keys(weights)) {
      weights[key] = THREE.MathUtils.damp(
        weights[key],
        intents[key] ?? 0,
        lambda,
        dt
      );
      total += weights[key];
    }

    const norm = total > 0.0001 ? 1 / total : 1;

    for (const [key, action] of Object.entries(actionByKey)) {
      if (!action) continue;
      action.weight =
        weights[key] * norm * masterWeight;
    }
  }

  function zeroWeights(dt) {
    applyWeights({}, dt, 18);
  }

  const controller = {
    ready: true,
    active: true,
    hasAuthoredSlide,
    state: 'IDLE',
    phase: 0,
    mixer,
    actions,
    weights,
    wasSliding: false,
    wasCrouching: false,
    wasGrounded: true,
    smoothedSpeed: 0,
    movementAmount: 0,
    smoothedSprintBlend: 0,
    moveTimeScale: 1,
    sprintTimeScale: 1,
    crouchTimeScale: 1,
    gaitDirection: 1,
    smoothedStrafe: 0,
    smoothedForward: 1,
    slideExitTail: 0,
    slideStage: 'none',
    slideExitActive: false,

    update(dt, state) {
      const rawSpeed = Math.max(0, state.speed ?? 0);
      const grounded = state.grounded !== false;
      const justLanded =
        grounded && !this.wasGrounded;
      this.wasGrounded = grounded;

      this.smoothedSpeed = THREE.MathUtils.damp(
        this.smoothedSpeed,
        rawSpeed,
        rawSpeed > this.smoothedSpeed ? 17 : 11,
        dt
      );
      const speed = this.smoothedSpeed;

      // Do not bring a full gait in while the character is barely moving.
      // This significantly reduces visible foot skating during starts/stops.
      const movementTarget = grounded
        ? THREE.MathUtils.smoothstep(speed, 0.14, 1.10)
        : 0;

      this.movementAmount = THREE.MathUtils.damp(
        this.movementAmount,
        movementTarget,
        movementTarget > this.movementAmount ? 15 : 10,
        dt
      );

      const moving = this.movementAmount > 0.12;

      const directionDenom = Math.max(rawSpeed, 0.001);
      const strafeTarget = rawSpeed > 0.05
        ? THREE.MathUtils.clamp(
            (state.localX ?? 0) / directionDenom,
            -1,
            1
          )
        : 0;
      const forwardTarget = rawSpeed > 0.05
        ? THREE.MathUtils.clamp(
            -(state.localZ ?? 0) / directionDenom,
            -1,
            1
          )
        : this.smoothedForward;

      this.smoothedStrafe = THREE.MathUtils.damp(
        this.smoothedStrafe,
        strafeTarget,
        12,
        dt
      );
      this.smoothedForward = THREE.MathUtils.damp(
        this.smoothedForward,
        forwardTarget,
        12,
        dt
      );

      if (!grounded) {
        masterWeight = THREE.MathUtils.damp(
          masterWeight,
          0,
          20,
          dt
        );
      } else {
        if (justLanded) {
          masterWeight = Math.min(masterWeight, 0.18);
        }
        masterWeight = THREE.MathUtils.damp(
          masterWeight,
          1,
          justLanded ? 10 : 16,
          dt
        );
      }

      // Dedicated whole-body slide FSM:
      // physics owns movement; animation owns Start -> Loop -> Exit.
      if (state.sliding) {
        if (!hasAuthoredSlide) {
          this.active = false;
          this.state = 'PROCEDURAL';
          zeroWeights(dt);
          this.mixer.update(dt);
          return;
        }

        if (!this.wasSliding) {
          this.wasSliding = true;
          this.slideExitActive = false;
          this.slideStage = 'start';

          slideExit.stop();
          slideStart.reset().setEffectiveTimeScale(1).play();
          slideLoop.reset().setEffectiveTimeScale(1).play();
        }

        if (
          this.slideStage === 'start' &&
          slideStart.time >=
            Math.max(0.01, slideStart.getClip().duration - 0.045)
        ) {
          this.slideStage = 'loop';
        }

        this.active = true;

        if (this.slideStage === 'start') {
          this.state = 'SLIDE_START';
          applyWeights({ slideStart: 1 }, dt, 24);
        } else {
          this.state = 'SLIDE_LOOP';
          applyWeights({ slideLoop: 1 }, dt, 22);
        }

        this.mixer.update(dt);
        return;
      }

      // On release, play a real authored exit instead of snapping to crouch.
      if (this.wasSliding) {
        this.wasSliding = false;
        this.slideStage = 'none';

        if (hasAuthoredSlide && grounded) {
          this.slideExitActive = true;
          slideExit.reset().setEffectiveTimeScale(1).play();
        } else {
          this.slideExitActive = false;
        }
      }

      this.slideExitTail = 0;

      if (this.slideExitActive && hasAuthoredSlide) {
        const duration = Math.max(
          0.001,
          slideExit.getClip().duration
        );
        const progress = THREE.MathUtils.clamp(
          slideExit.time / duration,
          0,
          1
        );

        if (
          slideExit.time >=
          Math.max(0.01, duration - 0.025)
        ) {
          this.slideExitActive = false;
          slideExit.stop();
        } else if (progress < 0.62) {
          this.active = true;
          this.state = 'SLIDE_EXIT';
          applyWeights({ slideExit: 1 }, dt, 16);
          this.mixer.update(dt);
          return;
        } else {
          // Last ~38% of the authored recovery crossfades back into the
          // current locomotion instead of snapping on the final frame.
          const tailT = THREE.MathUtils.smoothstep(
            progress,
            0.62,
            0.98
          );
          this.slideExitTail = 1 - tailT;
        }
      }

      // Jump/fall still use the existing procedural air pose.
      if (!grounded) {
        this.active = false;
        this.state = 'PROCEDURAL';
        zeroWeights(dt);
        this.mixer.update(dt);
        return;
      }

      this.active = true;

      // Gameplay can react immediately to Ctrl, but animation transitions use
      // one continuous blend so the body never snaps between unrelated poses.
      const crouchBlend = THREE.MathUtils.clamp(
        state.crouchBlend ?? (state.crouching ? 1 : 0),
        0,
        1
      );

      const sprintTarget = moving
        ? THREE.MathUtils.clamp(
            state.sprintBlend ??
              (Boolean(state.sprinting)
                ? THREE.MathUtils.smoothstep(speed, 4.8, 8.4)
                : 0),
            0,
            1
          )
        : 0;

      this.smoothedSprintBlend = THREE.MathUtils.damp(
        this.smoothedSprintBlend,
        sprintTarget,
        sprintTarget > this.smoothedSprintBlend ? 12 : 15,
        dt
      );

      const sprintBlend = this.smoothedSprintBlend;

      const standingBlend = 1 - crouchBlend;
      const backwards = this.smoothedForward < -0.12;

      const moveTargetScale =
        THREE.MathUtils.clamp(speed / 3.55, 0.34, 1.56);
      const sprintTargetScale =
        THREE.MathUtils.clamp(speed / 6.05, 0.68, 1.48);
      const crouchTargetScale =
        THREE.MathUtils.clamp(speed / 2.8, 0.32, 1.24);

      this.moveTimeScale = THREE.MathUtils.damp(
        this.moveTimeScale,
        moveTargetScale,
        12,
        dt
      );
      this.sprintTimeScale = THREE.MathUtils.damp(
        this.sprintTimeScale,
        sprintTargetScale,
        12,
        dt
      );
      this.crouchTimeScale = THREE.MathUtils.damp(
        this.crouchTimeScale,
        crouchTargetScale,
        12,
        dt
      );

      this.gaitDirection = THREE.MathUtils.damp(
        this.gaitDirection,
        backwards ? -1 : 1,
        10,
        dt
      );

      // Crossing through zero briefly plants the feet instead of instantly
      // reversing a forward cycle when the player changes direction.
      const directionScale =
        Math.abs(this.gaitDirection) < 0.06
          ? 0
          : this.gaitDirection;

      move.setEffectiveTimeScale(
        this.moveTimeScale * directionScale
      );
      sprint.setEffectiveTimeScale(
        this.sprintTimeScale * directionScale
      );
      crouchMove.setEffectiveTimeScale(
        this.crouchTimeScale * directionScale
      );

      const movementBlend = this.movementAmount;

      const locomotionShare = 1 - this.slideExitTail;
      const intents = {
        idle:
          standingBlend * (1 - movementBlend) * locomotionShare,
        move:
          standingBlend *
          movementBlend *
          (1 - sprintBlend) *
          locomotionShare,
        sprint:
          standingBlend *
          movementBlend *
          sprintBlend *
          locomotionShare,
        crouchIdle:
          crouchBlend * (1 - movementBlend) * locomotionShare,
        crouchMove:
          crouchBlend * movementBlend * locomotionShare,
        slideExit: this.slideExitTail
      };

      if (movementBlend > 0.035) {
        // All moving clips share one normalized foot phase. Because every
        // non-source action is synchronized each frame, changing the dominant
        // gait no longer causes a foot-pop when jog/sprint/crouch crossfade.
        const standingAction =
          sprintBlend > 0.56 ? sprint : move;
        const phaseSource =
          crouchBlend >= 0.56
            ? crouchMove
            : standingAction;

        const sourceDuration = Math.max(
          0.001,
          phaseSource.getClip().duration
        );
        const normalized =
          ((phaseSource.time / sourceDuration) % 1 + 1) % 1;

        const syncAction = (action) => {
          if (action === phaseSource) return;
          action.time =
            normalized *
            Math.max(0.001, action.getClip().duration);
        };

        syncAction(move);
        syncAction(sprint);
        syncAction(crouchMove);

        this.phase = normalized * Math.PI * 2;
      }

      // Targets already move smoothly through crouchBlend, so this high
      // response only makes the mixer follow that curve rather than adding a
      // second sluggish ease on top.
      applyWeights(
        intents,
        dt,
        state.combat ? 18 : 14
      );

      if (crouchBlend > 0.72) {
        this.state = moving ? 'CROUCH_WALK' : 'CROUCH';
      } else if (crouchBlend > 0.06) {
        this.state = moving ? 'CROUCH_BLEND_MOVE' : 'CROUCH_BLEND';
      } else {
        this.state = !moving
          ? 'IDLE'
          : (state.braking && speed > 4.8)
            ? 'BRAKE'
            : sprintBlend > 0.58
              ? 'SPRINT'
              : 'JOG';
      }

      this.wasCrouching = crouchBlend > 0.5;
      this.mixer.update(dt);
    },

    dispose() {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(character.root);
      this.actions.clear();
    }
  };

  return controller;
}

function loadBaseAnimationLibrary() {
  baseLibraryPromise ??= new GLTFLoader().loadAsync(
    BASE_ANIMATION_LIBRARY_URL
  );
  return baseLibraryPromise;
}

function loadSlideAnimationLibrary() {
  slideLibraryPromise ??= new GLTFLoader().loadAsync(
    SLIDE_ANIMATION_LIBRARY_URL
  );
  return slideLibraryPromise;
}

function retargetHumanoidAnimationClips(
  clips,
  vrm,
  clipNames,
  sourceBoneToHuman,
  {
    sourcePelvisName,
    useAnimatedRoot = true
  } = {}
) {
  const targetMap = createTargetMap(vrm, sourceBoneToHuman);
  const restPose = createSourceRestPoseMap(
    clips,
    sourceBoneToHuman
  );
  const sourceBones = createSourceBoneOrder(
    targetMap,
    restPose,
    sourceBoneToHuman
  );
  const targetSceneRotation = getTargetSceneRotation(vrm);

  const context = {
    restPose,
    sourceBones,
    sourceBoneToHuman,
    sourcePelvisName,
    useAnimatedRoot,
    sourceRestWorld: createSourceRestWorldMap(sourceBones, restPose),
    targetMap,
    targetRestPose: createTargetRestPoseMap(vrm, sourceBones, targetMap),
    targetSceneRotation,
    targetSceneRotationInverse: targetSceneRotation.clone().invert()
  };

  const selected = new Set(clipNames);
  return clips
    .filter((clip) => selected.has(clip.name))
    .map((clip) => retargetClip(clip, context));
}

function retargetClip(clip, context) {
  const tracks = retargetQuaternionTracks(clip, context);

  for (const track of clip.tracks) {
    const retargeted = retargetPositionTrack(track, context);
    if (retargeted) tracks.push(retargeted);
  }

  if (!tracks.length) {
    throw new Error(`No humanoid tracks after retarget: ${clip.name}`);
  }

  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

function retargetPositionTrack(track, context) {
  const parsed = THREE.PropertyBinding.parseTrackName(track.name);

  if (
    parsed.propertyName !== 'position' ||
    parsed.nodeName !== context.sourcePelvisName
  ) {
    return null;
  }

  const target = context.targetMap.get(context.sourcePelvisName);
  const sourceRestPosition =
    context.restPose.positions.get(context.sourcePelvisName);

  if (!target || !sourceRestPosition) return null;

  const values = new Float32Array(track.values.length);
  const framePosition = new THREE.Vector3();
  const sourceDelta = new THREE.Vector3();

  for (let i = 0; i < track.values.length; i += 3) {
    sourceDelta
      .fromArray(track.values, i)
      .sub(sourceRestPosition)
      .applyQuaternion(context.restPose.rootQuaternion)
      .applyQuaternion(context.targetSceneRotationInverse);

    sourceDelta.x = 0;
    sourceDelta.z = 0;

    framePosition
      .copy(target.node.position)
      .add(sourceDelta)
      .toArray(values, i);
  }

  const result = new THREE.VectorKeyframeTrack(
    `${target.trackName}.position`,
    track.times,
    values
  );

  result.setInterpolation(track.getInterpolation());
  return result;
}

function retargetQuaternionTracks(clip, context) {
  const trackMap = createQuaternionTrackMap(clip, context.targetMap);
  if (!trackMap.size) return [];

  const firstTrack = trackMap.values().next().value;
  const rootTrack = context.useAnimatedRoot
    ? findRootQuaternionTrack(clip)
    : null;

  const sourceFrameWorld = createQuaternionMap(context.sourceBones);
  const targetFrameWorld = createQuaternionMap(context.sourceBones);
  const outputValues = new Map();

  for (const sourceBone of context.sourceBones) {
    outputValues.set(
      sourceBone.sourceName,
      new Float32Array(firstTrack.values.length)
    );
  }

  const frameRootQuaternion = new THREE.Quaternion();
  const frameLocal = new THREE.Quaternion();
  const sourceDeltaWorld = new THREE.Quaternion();
  const sourceRestInverse = new THREE.Quaternion();
  const targetFrameLocal = new THREE.Quaternion();
  const targetNormalized = new THREE.Quaternion();
  const targetParentFrameInverse = new THREE.Quaternion();
  const targetRawLocalInverse = new THREE.Quaternion();
  const targetParentRestInverse = new THREE.Quaternion();

  for (let frame = 0; frame < firstTrack.times.length; frame += 1) {
    if (rootTrack) {
      frameRootQuaternion.fromArray(rootTrack.values, frame * 4);
    } else {
      frameRootQuaternion.copy(context.restPose.rootQuaternion);
    }

    for (const sourceBone of context.sourceBones) {
      const sourceTrack = trackMap.get(sourceBone.sourceName);
      if (!sourceTrack) continue;

      const restWorld =
        context.sourceRestWorld.get(sourceBone.sourceName);
      const sourceParentFrameWorld = sourceBone.parentSourceName
        ? sourceFrameWorld.get(sourceBone.parentSourceName)
        : frameRootQuaternion;

      frameLocal.fromArray(sourceTrack.values, frame * 4);

      const frameWorld = sourceFrameWorld
        .get(sourceBone.sourceName)
        .copy(sourceParentFrameWorld ?? frameRootQuaternion)
        .multiply(frameLocal);

      sourceDeltaWorld
        .copy(frameWorld)
        .multiply(sourceRestInverse.copy(restWorld).invert())
        .premultiply(context.targetSceneRotationInverse)
        .multiply(context.targetSceneRotation);

      const targetRestWorld =
        context.targetRestPose.rawWorld.get(sourceBone.sourceName);
      const targetParentRestWorld =
        context.targetRestPose.parentRawWorld.get(sourceBone.sourceName);
      const targetRawRestLocal =
        context.targetRestPose.rawLocal.get(sourceBone.sourceName);
      const targetParentFrameWorld = sourceBone.parentSourceName
        ? targetFrameWorld.get(sourceBone.parentSourceName)
        : targetParentRestWorld;

      const targetWorld = targetFrameWorld
        .get(sourceBone.sourceName)
        .copy(sourceDeltaWorld)
        .multiply(targetRestWorld);

      targetFrameLocal
        .copy(
          targetParentFrameInverse
            .copy(targetParentFrameWorld)
            .invert()
        )
        .multiply(targetWorld);

      targetNormalized
        .copy(targetParentRestWorld)
        .multiply(targetFrameLocal)
        .multiply(
          targetRawLocalInverse.copy(targetRawRestLocal).invert()
        )
        .multiply(
          targetParentRestInverse
            .copy(targetParentRestWorld)
            .invert()
        )
        .toArray(
          outputValues.get(sourceBone.sourceName),
          frame * 4
        );
    }
  }

  const tracks = [];
  for (const [sourceName, values] of outputValues) {
    const target = context.targetMap.get(sourceName);
    const sourceTrack = trackMap.get(sourceName);
    if (!target || !sourceTrack) continue;

    const track = new THREE.QuaternionKeyframeTrack(
      `${target.trackName}.quaternion`,
      firstTrack.times,
      values
    );
    track.setInterpolation(sourceTrack.getInterpolation());
    tracks.push(track);
  }

  return tracks;
}

function createTargetMap(vrm, sourceBoneToHuman) {
  const targetMap = new Map();

  for (const [sourceName, humanBoneName] of Object.entries(
    sourceBoneToHuman
  )) {
    const node = vrm.humanoid.getNormalizedBoneNode(humanBoneName);
    const rawNode = vrm.humanoid.getRawBoneNode(humanBoneName);

    if (!node || !rawNode) continue;

    targetMap.set(sourceName, {
      humanBoneName,
      node,
      rawNode,
      trackName: node.uuid
    });
  }

  const mappedHumanBones = new Set(
    [...targetMap.values()].map((item) => item.humanBoneName)
  );

  for (const required of [
    'hips',
    'leftUpperLeg',
    'leftLowerLeg',
    'leftFoot',
    'rightUpperLeg',
    'rightLowerLeg',
    'rightFoot'
  ]) {
    if (!mappedHumanBones.has(required)) {
      throw new Error(`VRM missing locomotion target: ${required}`);
    }
  }

  return targetMap;
}

function createQuaternionTrackMap(clip, targetMap) {
  const map = new Map();

  for (const track of clip.tracks) {
    const parsed = THREE.PropertyBinding.parseTrackName(track.name);
    if (
      parsed.nodeName &&
      parsed.propertyName === 'quaternion' &&
      targetMap.has(parsed.nodeName)
    ) {
      map.set(parsed.nodeName, track);
    }
  }

  return map;
}

function findRootQuaternionTrack(clip) {
  for (const track of clip.tracks) {
    const parsed = THREE.PropertyBinding.parseTrackName(track.name);
    if (
      parsed.nodeName === 'root' &&
      parsed.propertyName === 'quaternion'
    ) {
      return track;
    }
  }

  return null;
}

function createSourceBoneOrder(
  targetMap,
  restPose,
  sourceBoneToHuman
) {
  const sourceNameByHumanBone = new Map();
  for (const [sourceName, humanBoneName] of Object.entries(
    sourceBoneToHuman
  )) {
    sourceNameByHumanBone.set(humanBoneName, sourceName);
  }

  const sourceBones = [];

  for (const [sourceName, target] of targetMap) {
    if (!restPose.quaternions.has(sourceName)) continue;

    const parentSourceName = resolveParentSourceName(
      target.humanBoneName,
      sourceNameByHumanBone,
      targetMap,
      restPose
    );

    sourceBones.push({
      humanBoneName: target.humanBoneName,
      parentSourceName,
      sourceName
    });
  }

  return sourceBones.sort(
    (a, b) =>
      getHumanBoneDepth(a.humanBoneName) -
      getHumanBoneDepth(b.humanBoneName)
  );
}

function resolveParentSourceName(
  humanBoneName,
  sourceNameByHumanBone,
  targetMap,
  restPose
) {
  let parent = VRMHumanBoneParentMap[humanBoneName];

  while (parent) {
    const sourceName = sourceNameByHumanBone.get(parent);

    if (
      sourceName &&
      targetMap.has(sourceName) &&
      restPose.quaternions.has(sourceName)
    ) {
      return sourceName;
    }

    parent = VRMHumanBoneParentMap[parent];
  }

  return null;
}

function getHumanBoneDepth(humanBoneName) {
  let depth = 0;
  let parent = VRMHumanBoneParentMap[humanBoneName];

  while (parent) {
    depth += 1;
    parent = VRMHumanBoneParentMap[parent];
  }

  return depth;
}

function createQuaternionMap(sourceBones) {
  const map = new Map();

  for (const sourceBone of sourceBones) {
    map.set(sourceBone.sourceName, new THREE.Quaternion());
  }

  return map;
}

function createSourceRestWorldMap(sourceBones, restPose) {
  const map = new Map();

  for (const sourceBone of sourceBones) {
    const restLocal = restPose.quaternions.get(sourceBone.sourceName);
    if (!restLocal) continue;

    const parentWorld = sourceBone.parentSourceName
      ? map.get(sourceBone.parentSourceName)
      : restPose.rootQuaternion;

    map.set(
      sourceBone.sourceName,
      new THREE.Quaternion()
        .copy(parentWorld ?? restPose.rootQuaternion)
        .multiply(restLocal)
    );
  }

  return map;
}

function createSourceRestPoseMap(
  clips,
  sourceBoneToHuman
) {
  const clip = clips.find((item) => item.name === REST_POSE_CLIP);
  if (!clip) {
    throw new Error(`Animation library missing ${REST_POSE_CLIP}`);
  }

  const restPose = {
    positions: new Map(),
    quaternions: new Map(),
    rootQuaternion: new THREE.Quaternion()
  };

  for (const track of clip.tracks) {
    const parsed = THREE.PropertyBinding.parseTrackName(track.name);

    if (
      parsed.nodeName === 'root' &&
      parsed.propertyName === 'quaternion'
    ) {
      restPose.rootQuaternion.fromArray(track.values, 0);
      continue;
    }

    if (
      !parsed.nodeName ||
      !(parsed.nodeName in sourceBoneToHuman)
    ) {
      continue;
    }

    if (parsed.propertyName === 'quaternion') {
      restPose.quaternions.set(
        parsed.nodeName,
        new THREE.Quaternion().fromArray(track.values, 0)
      );
    }

    if (parsed.propertyName === 'position') {
      restPose.positions.set(
        parsed.nodeName,
        new THREE.Vector3().fromArray(track.values, 0)
      );
    }
  }

  return restPose;
}

function createTargetRestPoseMap(vrm, sourceBones, targetMap) {
  const restoreSceneRotation = neutralizeVrm0SceneRotation(vrm);

  const restPose = {
    parentRawWorld: new Map(),
    rawLocal: new Map(),
    rawWorld: new Map()
  };

  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  try {
    for (const sourceBone of sourceBones) {
      const rawNode = targetMap.get(sourceBone.sourceName).rawNode;

      rawNode.matrixWorld.decompose(position, rotation, scale);
      restPose.rawLocal.set(
        sourceBone.sourceName,
        rawNode.quaternion.clone()
      );
      restPose.rawWorld.set(
        sourceBone.sourceName,
        rotation.clone()
      );

      if (rawNode.parent) {
        rawNode.parent.matrixWorld.decompose(
          position,
          rotation,
          scale
        );
        restPose.parentRawWorld.set(
          sourceBone.sourceName,
          rotation.clone()
        );
      } else {
        restPose.parentRawWorld.set(
          sourceBone.sourceName,
          new THREE.Quaternion()
        );
      }
    }
  } finally {
    restoreSceneRotation();
  }

  return restPose;
}

function getTargetSceneRotation(vrm) {
  return vrm.meta?.metaVersion === '0'
    ? vrm.scene.quaternion.clone()
    : new THREE.Quaternion();
}

function neutralizeVrm0SceneRotation(vrm) {
  const rotationY = vrm.scene.rotation.y;

  if (vrm.meta?.metaVersion === '0') {
    vrm.scene.rotation.y = 0;
  }

  vrm.scene.updateWorldMatrix(true, true);

  return () => {
    vrm.scene.rotation.y = rotationY;
    vrm.scene.updateWorldMatrix(true, true);
  };
}
