import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMHumanBoneParentMap } from '@pixiv/three-vrm';

// CC0 source: Quaternius Universal Animation Library, repacked by the MIT
// norio/vrm-game-starter project. Pinned for deterministic production behavior.
const ANIMATION_LIBRARY_URL =
  'https://cdn.jsdelivr.net/gh/norio/vrm-game-starter@b14c236fd8150855348ad085b7820c298eac4b30/src/assets/AnimationLibrary.glb';

const REST_POSE_CLIP = 'A_TPose';
const CLIPS = {
  IDLE: 'Idle_Loop',
  MOVE: 'Jog_Fwd_Loop',
  SPRINT: 'Sprint_Loop'
};

const SOURCE_BONE_TO_HUMAN = {
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

let libraryPromise = null;

export async function createVrmLocomotionController(character, vrm) {
  const library = await loadAnimationLibrary();
  const clips = retargetHumanoidAnimationClips(
    library.animations,
    vrm,
    Object.values(CLIPS)
  );

  const mixer = new THREE.AnimationMixer(character.root);
  const actions = new Map();

  for (const clip of clips) {
    const action = mixer.clipAction(clip);
    action.enabled = true;
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.setEffectiveWeight(0);
    action.setEffectiveTimeScale(1);
    action.play();
    actions.set(clip.name, action);
  }

  const idle = actions.get(CLIPS.IDLE);
  const move = actions.get(CLIPS.MOVE);
  const sprint = actions.get(CLIPS.SPRINT);

  if (!idle || !move || !sprint) {
    throw new Error('Authored locomotion clips missing from animation library.');
  }

  idle.weight = 1;

  const controller = {
    ready: true,
    active: true,
    state: 'IDLE',
    phase: 0,
    mixer,
    actions,
    weights: { idle: 1, move: 0, sprint: 0 },

    update(dt, state) {
      if (
        state.grounded === false ||
        state.sliding ||
        state.crouching
      ) {
        this.active = false;
        this.state = 'PROCEDURAL';

        this.weights.idle = THREE.MathUtils.damp(this.weights.idle, 0, 14, dt);
        this.weights.move = THREE.MathUtils.damp(this.weights.move, 0, 14, dt);
        this.weights.sprint = THREE.MathUtils.damp(this.weights.sprint, 0, 14, dt);

        idle.weight = this.weights.idle;
        move.weight = this.weights.move;
        sprint.weight = this.weights.sprint;
        this.mixer.update(dt);
        return;
      }

      this.active = true;

      const speed = Math.max(0, state.speed ?? 0);
      const moving = speed > 0.28;
      const sprinting = Boolean(state.sprinting) && speed > 5.9;

      const idleIntent = moving ? 0 : 1;
      const moveIntent = moving && !sprinting ? 1 : 0;
      const sprintIntent = sprinting ? 1 : 0;

      this.weights.idle = THREE.MathUtils.damp(this.weights.idle, idleIntent, 12, dt);
      this.weights.move = THREE.MathUtils.damp(this.weights.move, moveIntent, 10, dt);
      this.weights.sprint = THREE.MathUtils.damp(this.weights.sprint, sprintIntent, 10, dt);

      const total = this.weights.idle + this.weights.move + this.weights.sprint;
      const norm = total > 0.0001 ? 1 / total : 1;
      idle.weight = this.weights.idle * norm;
      move.weight = this.weights.move * norm;
      sprint.weight = this.weights.sprint * norm;

      move.setEffectiveTimeScale(
        THREE.MathUtils.clamp(speed / 3.55, 0.90, 1.62)
      );
      sprint.setEffectiveTimeScale(
        THREE.MathUtils.clamp(speed / 6.05, 0.92, 1.55)
      );

      const dominant = sprint.weight > move.weight ? sprint : move;
      const follower = dominant === sprint ? move : sprint;

      if (moving) {
        const dominantDuration = Math.max(0.001, dominant.getClip().duration);
        const followerDuration = Math.max(0.001, follower.getClip().duration);
        const normalized =
          ((dominant.time / dominantDuration) % 1 + 1) % 1;

        if (Math.min(move.weight, sprint.weight) > 0.04) {
          follower.time = normalized * followerDuration;
        }

        this.phase = normalized * Math.PI * 2;
      }

      this.state = !moving ? 'IDLE' : sprinting ? 'SPRINT' : 'JOG';
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

function loadAnimationLibrary() {
  libraryPromise ??= new GLTFLoader().loadAsync(ANIMATION_LIBRARY_URL);
  return libraryPromise;
}

function retargetHumanoidAnimationClips(clips, vrm, clipNames) {
  const targetMap = createTargetMap(vrm);
  const restPose = createSourceRestPoseMap(clips);
  const sourceBones = createSourceBoneOrder(targetMap, restPose);
  const targetSceneRotation = getTargetSceneRotation(vrm);

  const context = {
    restPose,
    sourceBones,
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
    const retargeted = retargetPositionTrack(
      track,
      context.targetMap,
      context.restPose,
      context.targetSceneRotationInverse
    );
    if (retargeted) tracks.push(retargeted);
  }

  if (!tracks.length) {
    throw new Error(`No humanoid tracks after retarget: ${clip.name}`);
  }

  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

function retargetPositionTrack(
  track,
  targetMap,
  restPose,
  targetSceneRotationInverse
) {
  const parsed = THREE.PropertyBinding.parseTrackName(track.name);
  if (
    parsed.propertyName !== 'position' ||
    parsed.nodeName !== 'DEF-hips'
  ) {
    return null;
  }

  const target = targetMap.get('DEF-hips');
  const sourceRestPosition = restPose.positions.get('DEF-hips');
  if (!target || !sourceRestPosition) return null;

  const values = new Float32Array(track.values.length);
  const framePosition = new THREE.Vector3();
  const sourceDelta = new THREE.Vector3();

  for (let i = 0; i < track.values.length; i += 3) {
    sourceDelta
      .fromArray(track.values, i)
      .sub(sourceRestPosition)
      .applyQuaternion(restPose.rootQuaternion)
      .applyQuaternion(targetSceneRotationInverse);

    // Controller physics owns horizontal translation. Keep only authored
    // vertical weight transfer/bounce from the animation.
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
  const rootTrack = findRootQuaternionTrack(clip);

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

function createTargetMap(vrm) {
  const targetMap = new Map();

  for (const [sourceName, humanBoneName] of Object.entries(
    SOURCE_BONE_TO_HUMAN
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

  for (const required of [
    'DEF-hips',
    'DEF-thighL',
    'DEF-shinL',
    'DEF-footL',
    'DEF-thighR',
    'DEF-shinR',
    'DEF-footR'
  ]) {
    if (!targetMap.has(required)) {
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

function createSourceBoneOrder(targetMap, restPose) {
  const sourceNameByHumanBone = new Map();
  for (const [sourceName, humanBoneName] of Object.entries(
    SOURCE_BONE_TO_HUMAN
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

function createSourceRestPoseMap(clips) {
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
      !(parsed.nodeName in SOURCE_BONE_TO_HUMAN)
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
