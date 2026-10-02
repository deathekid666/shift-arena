import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

export class TestWorld {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.ramps = [];
    this.cameraObstacles = [];
    this.damageZones = [];
    this.spawnPoint = new THREE.Vector3(0, 0, 12);
    this.build();
  }

  material(color) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.76, metalness: 0.04 });
  }

  addBox(x, y, z, w, h, d, color) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.material(color));
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    mesh.updateMatrixWorld(true);
    this.colliders.push({ mesh, box: new THREE.Box3().setFromObject(mesh) });
    this.cameraObstacles.push(mesh);
    return mesh;
  }

  addDamageZone(x, z, w, d, damage, color) {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.4,
      metalness: 0.08,
      emissive: color,
      emissiveIntensity: 0.26
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), material);
    mesh.position.set(x, 0.04, z);
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    this.damageZones.push({
      mesh,
      damage,
      minX: x - w / 2,
      maxX: x + w / 2,
      minZ: z - d / 2,
      maxZ: z + d / 2,
      source: new THREE.Vector3(x, 0, z)
    });
  }

  build() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), this.material(0x27455b));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.cameraObstacles.push(ground);

    this.addBox(0, 0, -9, 12, 3, 1, 0x536f7f);
    this.addBox(-8, 0, -1, 2, 2, 8, 0x7a8f9d);
    this.addBox(8, 0, 3, 3, 1.2, 3, 0xc19454);
    this.addBox(2.5, 0, 7, 5, 2.4, 2, 0x5c7180);
    this.addBox(-2, 0, 3, 2, 0.65, 2, 0xa9b7c2);
    this.addBox(12, 0, -8, 8, 5, 1.3, 0x3e5567);

    // Build 003 controlled damage validation pads.
    this.addDamageZone(-4.2, 10.0, 2.4, 2.4, 30, 0xf0a13a);
    this.addDamageZone(4.2, 10.0, 2.4, 2.4, 80, 0xd94a4a);

    const rampW = 4;
    const rampD = 8;
    const rampH = 3;
    const geom = new THREE.BufferGeometry();
    const verts = new Float32Array([
      -rampW/2,0,-rampD/2,  rampW/2,0,-rampD/2, -rampW/2,0,rampD/2,
       rampW/2,0,-rampD/2,  rampW/2,0,rampD/2,  -rampW/2,0,rampD/2,
      -rampW/2,0,-rampD/2, -rampW/2,rampH,rampD/2, rampW/2,0,-rampD/2,
       rampW/2,0,-rampD/2, -rampW/2,rampH,rampD/2, rampW/2,rampH,rampD/2,
      -rampW/2,0,rampD/2,   rampW/2,0,rampD/2, -rampW/2,rampH,rampD/2,
       rampW/2,0,rampD/2,   rampW/2,rampH,rampD/2, -rampW/2,rampH,rampD/2
    ]);
    geom.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geom.computeVertexNormals();
    const ramp = new THREE.Mesh(geom, this.material(0xc65f4b));
    ramp.position.set(-13, 0, 8);
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    this.scene.add(ramp);
    this.cameraObstacles.push(ramp);
    this.ramps.push({ minX: -15, maxX: -11, minZ: 4, maxZ: 12, baseY: 0, topY: 3, axis: 'z', direction: 1, mesh: ramp });

    const grid = new THREE.GridHelper(80, 80, 0x6b8394, 0x36566e);
    grid.position.y = 0.012;
    this.scene.add(grid);
  }

  groundHeightAt(x, z) {
    let y = 0;
    for (const r of this.ramps) {
      if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) {
        const t = r.axis === 'z'
          ? (z - r.minZ) / (r.maxZ - r.minZ)
          : (x - r.minX) / (r.maxX - r.minX);
        const k = r.direction === 1 ? t : 1 - t;
        y = Math.max(y, r.baseY + (r.topY - r.baseY) * k);
      }
    }
    return y;
  }
}
