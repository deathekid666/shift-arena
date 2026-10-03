import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

export class TestWorld {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.ramps = [];
    this.cameraObstacles = [];
    this.damageZones = [];

    this.spawnPoint = new THREE.Vector3(0, 0, 22);
    this.botSpawnPoint = new THREE.Vector3(-10, 0, 12);

    this.build();
  }

  material(color, roughness = 0.76, metalness = 0.04) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
  }

  addBox(x, y, z, w, h, d, color, options = {}) {
    const { collidable = true, blocksSight = collidable, roughness = 0.76, metalness = 0.04 } = options;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      this.material(color, roughness, metalness)
    );
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    mesh.updateMatrixWorld(true);

    if (collidable) {
      this.colliders.push({ mesh, box: new THREE.Box3().setFromObject(mesh) });
    }
    if (blocksSight) this.cameraObstacles.push(mesh);
    return mesh;
  }

  addCylinder(x, y, z, radiusTop, radiusBottom, height, color, options = {}) {
    const { collidable = true, blocksSight = collidable, segments = 20 } = options;
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
      this.material(color, 0.65, 0.06)
    );
    mesh.position.set(x, y + height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    mesh.updateMatrixWorld(true);

    if (collidable) {
      this.colliders.push({ mesh, box: new THREE.Box3().setFromObject(mesh) });
    }
    if (blocksSight) this.cameraObstacles.push(mesh);
    return mesh;
  }

  addRamp(x, z, width, length, height, direction, color) {
    // Render ramps as actual cutting-board/plank geometry instead of a
    // paper-thin custom triangle surface. Collision still uses the analytical
    // slope data below, so visual thickness does not turn the ramp into a wedge.
    const thickness = 0.24;
    const slopedLength = Math.hypot(length, height);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, thickness, slopedLength),
      this.material(color, 0.66, 0.025)
    );

    let axis = 'z';
    let dir = 1;
    let minX;
    let maxX;
    let minZ;
    let maxZ;

    if (direction === '+z') {
      minX = x - width/2; maxX = x + width/2;
      minZ = z - length/2; maxZ = z + length/2;
      axis = 'z'; dir = 1;
    } else if (direction === '-z') {
      minX = x - width/2; maxX = x + width/2;
      minZ = z - length/2; maxZ = z + length/2;
      axis = 'z'; dir = -1;
    } else if (direction === '+x') {
      minX = x - length/2; maxX = x + length/2;
      minZ = z - width/2; maxZ = z + width/2;
      axis = 'x'; dir = 1;
    } else {
      minX = x - length/2; maxX = x + length/2;
      minZ = z - width/2; maxZ = z + width/2;
      axis = 'x'; dir = -1;
    }

    // Build an orthonormal basis for the plank:
    // local Z = uphill direction, local X = board width, local Y = top normal.
    const rise = height / slopedLength;
    const run = length / slopedLength;
    const uphill = axis === 'z'
      ? new THREE.Vector3(0, rise, dir * run)
      : new THREE.Vector3(dir * run, rise, 0);

    let across = axis === 'z'
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 0, 1);

    let normal = uphill.clone().cross(across).normalize();
    if (normal.y < 0) {
      across.multiplyScalar(-1);
      normal = uphill.clone().cross(across).normalize();
    }

    const basis = new THREE.Matrix4().makeBasis(across, normal, uphill);
    mesh.quaternion.setFromRotationMatrix(basis);

    // Shift the board down by half its vertical top-normal thickness so the
    // analytical walking surface still runs exactly from baseY=0 to topY=height.
    mesh.position.set(
      x,
      height / 2 - normal.y * thickness / 2,
      z
    );

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.cameraObstacles.push(mesh);

    // A slightly darker underside accent makes the board thickness readable
    // from the cockroach's low camera angle.
    const underside = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.985, 0.035, slopedLength * 0.992),
      this.material(0x7b5133, 0.78, 0.01)
    );
    underside.quaternion.copy(mesh.quaternion);
    underside.position.copy(mesh.position).addScaledVector(normal, -thickness * 0.52);
    underside.castShadow = true;
    underside.receiveShadow = true;
    this.scene.add(underside);

    this.ramps.push({
      minX, maxX, minZ, maxZ,
      baseY: 0,
      topY: height,
      axis,
      direction: dir,
      thickness,
      mesh
    });

    return mesh;
  }

  build() {
    // Kitchen floor.
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(64, 54),
      this.material(0xc8bda8, 0.92, 0)
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.cameraObstacles.push(floor);

    // Room shell: enough to define the graybox without adding a ceiling.
    this.addBox(0, 0, -27, 64, 9, 1, 0xe4ded2);
    this.addBox(-32, 0, 0, 1, 9, 54, 0xe4ded2);
    this.addBox(32, 0, 0, 1, 9, 54, 0xe4ded2);

    // Central island: main combat landmark and high ground.
    this.addBox(0, 0, 0, 14, 3.0, 6, 0x7e8b92);
    this.addBox(0, 3.0, 0, 14.5, 0.28, 6.5, 0x3f4c54, { roughness: 0.42, metalness: 0.12 });

    // Cutting-board style access ramp from floor to island.
    this.addRamp(0, 7, 3.2, 8, 3.2, '-z', 0xb78354);

    // Giant dining table: top is aligned with island high ground.
    this.addBox(16, 2.55, 5, 12, 0.45, 8, 0x8f6846);
    this.addBox(11.3, 0, 2.2, 0.9, 2.55, 0.9, 0x6d4f37);
    this.addBox(20.7, 0, 2.2, 0.9, 2.55, 0.9, 0x6d4f37);
    this.addBox(11.3, 0, 7.8, 0.9, 2.55, 0.9, 0x6d4f37);
    this.addBox(20.7, 0, 7.8, 0.9, 2.55, 0.9, 0x6d4f37);

    // Spoon bridge: narrow high-risk route from island to table.
    this.addBox(8.55, 2.76, 1.2, 3.5, 0.24, 1.15, 0xb9bec3, { roughness: 0.28, metalness: 0.52 });
    this.addCylinder(10.15, 2.76, 1.2, 0.9, 0.9, 0.24, 0xb9bec3, { segments: 24 });

    // Sink counter: raised slab with a wide tunnel underneath.
    this.addBox(-15, 3.0, -20, 15, 0.6, 4.5, 0x98a5aa);
    this.addBox(-20.2, 0, -20, 4.0, 3.0, 4.5, 0x66757b);
    this.addBox(-9.8, 0, -20, 4.0, 3.0, 4.5, 0x66757b);

    // Sink basin (visual landmark; does not block traversal on the counter).
    this.addBox(-15, 3.58, -20, 4.5, 0.22, 2.8, 0x4f86a2, { collidable: false, blocksSight: false, roughness: 0.35, metalness: 0.18 });

    // Cutting-board ramp to the sink counter.
    this.addRamp(-15, -14.25, 3.2, 7.0, 3.9, '-z', 0xc38c58);

    // Stove counter and simple burner markers.
    this.addBox(2, 0, -20, 16, 3.0, 4.5, 0x565f66);
    this.addBox(2, 3.0, -20, 16.4, 0.28, 4.8, 0x262d33, { roughness: 0.38, metalness: 0.18 });
    this.addCylinder(-1.0, 3.27, -20.7, 1.05, 1.05, 0.08, 0x13171a, { collidable: false, blocksSight: false });
    this.addCylinder(3.3, 3.27, -19.3, 1.05, 1.05, 0.08, 0x13171a, { collidable: false, blocksSight: false });

    // Fridge landmark. Roof access is intentionally not implemented in graybox 005.
    this.addBox(22.5, 0, -20, 6.0, 8.0, 5.0, 0xc6d0d5, { roughness: 0.38, metalness: 0.2 });
    this.addBox(19.0, 0, -14.2, 2.8, 1.0, 2.8, 0x89969e);
    this.addBox(20.0, 0, -11.0, 2.8, 2.0, 2.8, 0x78878f);

    // Oversized pantry objects for readable cover.
    this.addBox(-22.5, 0, 7.0, 2.8, 5.2, 1.6, 0xe5a949);
    this.addBox(-18.3, 0, 9.0, 3.2, 3.9, 1.8, 0xd86452);
    this.addCylinder(-11.5, 0, 10.0, 1.45, 1.25, 3.1, 0xe7e1d3);

    // Giant pan on the floor.
    this.addCylinder(20.0, 0, -4.8, 2.6, 2.6, 0.34, 0x30383e);
    this.addBox(23.5, 0.14, -4.8, 4.8, 0.34, 0.75, 0x30383e);

    // Dish-rack silhouette on the sink counter. Visual only for this graybox.
    for (let i = 0; i < 5; i++) {
      this.addBox(-20.2 + i * 0.9, 3.6, -19.4, 0.12, 1.7, 2.0, 0xc2c9cd, {
        collidable: false,
        blocksSight: false,
        roughness: 0.32,
        metalness: 0.5
      });
    }

    // Tile/grid scale reference.
    const grid = new THREE.GridHelper(64, 32, 0x8f877b, 0xb2a895);
    grid.position.y = 0.012;
    this.scene.add(grid);
  }

  rampSurfaceAt(x, z, padding = 0) {
    let best = null;

    for (const r of this.ramps) {
      if (
        x < r.minX - padding || x > r.maxX + padding ||
        z < r.minZ - padding || z > r.maxZ + padding
      ) continue;

      // When testing a capsule near an edge, clamp to the physical board so
      // the player's radius cannot ghost through the side of the ramp.
      const sampleX = THREE.MathUtils.clamp(x, r.minX, r.maxX);
      const sampleZ = THREE.MathUtils.clamp(z, r.minZ, r.maxZ);

      const t = r.axis === 'z'
        ? (sampleZ - r.minZ) / (r.maxZ - r.minZ)
        : (sampleX - r.minX) / (r.maxX - r.minX);

      const k = r.direction === 1 ? t : 1 - t;
      const height = r.baseY + (r.topY - r.baseY) * k;
      const surface = {
        height,
        underside: Math.max(r.baseY, height - r.thickness),
        ramp: r
      };

      if (!best || surface.height > best.height) best = surface;
    }

    return best;
  }

  rampHeightAt(x, z) {
    return this.rampSurfaceAt(x, z)?.height ?? null;
  }

  groundHeightAt(x, z) {
    const rampY = this.rampHeightAt(x, z);
    return rampY === null ? 0 : Math.max(0, rampY);
  }
}
