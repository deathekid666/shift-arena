import * as THREE from 'three';
import { VRMHumanoid } from '@pixiv/three-vrm';

// Adapt the generated Mixamo skeleton to the same normalized humanoid interface
// used by the existing locomotion, weapon, jump and slide layers.
export function createMeshyHumanoid(scene) {
  const names = {
    hips: 'Hips', spine: 'Spine', chest: 'Spine1', upperChest: 'Spine2',
    neck: 'Neck', head: 'Head'
  };
  for (const [side, prefix] of [['left', 'Left'], ['right', 'Right']]) {
    for (const [part, source] of Object.entries({
      Shoulder: 'Shoulder', UpperArm: 'Arm', LowerArm: 'ForeArm', Hand: 'Hand',
      UpperLeg: 'UpLeg', LowerLeg: 'Leg', Foot: 'Foot', Toes: 'ToeBase'
    })) names[side + part] = prefix + source;
    for (const finger of ['Thumb', 'Index', 'Middle', 'Ring', 'Little']) {
      const source = finger === 'Little' ? 'Pinky' : finger;
      const segments = finger === 'Thumb'
        ? ['Metacarpal', 'Proximal', 'Distal'] : ['Proximal', 'Intermediate', 'Distal'];
      segments.forEach((segment, i) => { names[side + finger + segment] = `${prefix}Hand${source}${i + 1}`; });
    }
  }
  const humanBones = {};
  for (const [name, source] of Object.entries(names)) {
    const node = scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName('mixamorig:' + source));
    if (!node) throw new Error(`Scout rig is missing ${source}`);
    humanBones[name] = { node };
  }
  // Three.js renders four influences. Retain the strongest from both GLB sets
  // and normalize, rather than silently dropping the second set.
  scene.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const g = mesh.geometry;
    const joints = g.getAttribute('skinIndex');
    const weights = g.getAttribute('skinWeight');
    const extraJoints = g.getAttribute('joints_1');
    const extraWeights = g.getAttribute('weights_1');
    if (extraJoints && extraWeights) {
      for (let v = 0; v < weights.count; v++) {
        const influences = [];
        // GLTFLoader normalizes WEIGHTS_0 on load; restore its share first.
        let extraSum = 0;
        for (let c = 0; c < 4; c++) extraSum += extraWeights.getComponent(v, c);
        for (let c = 0; c < 4; c++) {
          influences.push([joints.getComponent(v, c), weights.getComponent(v, c) * Math.max(0, 1 - extraSum)]);
          influences.push([extraJoints.getComponent(v, c), extraWeights.getComponent(v, c)]);
        }
        influences.sort((a, b) => b[1] - a[1]);
        const sum = influences.slice(0, 4).reduce((s, x) => s + x[1], 0);
        if (!(sum > 0)) throw new Error('Scout has an unweighted vertex');
        for (let c = 0; c < 4; c++) {
          joints.setComponent(v, c, influences[c][0]);
          weights.setComponent(v, c, influences[c][1] / sum);
        }
      }
      g.deleteAttribute('joints_1');
      g.deleteAttribute('weights_1');
      joints.needsUpdate = weights.needsUpdate = true;
    }
    mesh.normalizeSkinWeights();
  });
  // Establish a T-pose before capturing normalized rest transforms. The source
  // is A-posed; its original inverse bind matrices continue deforming the mesh.
  scene.updateMatrixWorld(true);
  for (const side of ['left', 'right']) {
    const direction = new THREE.Vector3(side === 'left' ? 1 : -1, 0, 0);
    for (const [joint, child] of [['UpperArm', 'LowerArm'], ['LowerArm', 'Hand']]) {
      const node = humanBones[side + joint].node;
      const end = humanBones[side + child].node;
      const from = end.getWorldPosition(new THREE.Vector3()).sub(node.getWorldPosition(new THREE.Vector3())).normalize();
      const delta = new THREE.Quaternion().setFromUnitVectors(from, direction);
      const world = node.getWorldQuaternion(new THREE.Quaternion());
      const parent = node.parent.getWorldQuaternion(new THREE.Quaternion());
      node.quaternion.copy(parent.invert().multiply(delta).multiply(world));
      scene.updateMatrixWorld(true);
    }
  }
  const humanoid = new VRMHumanoid(humanBones);
  scene.add(humanoid.normalizedHumanBonesRoot);
  return { scene, humanoid, meta: { metaVersion: '1' } };
}
