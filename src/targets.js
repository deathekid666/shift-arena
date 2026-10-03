import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

export class TargetRange {
  constructor(scene) {
    this.scene = scene;
    this.targets = [];
    this.hitMeshes = [];
    this.build();
  }

  build() {
    // Kitchen weapon-test targets: floor, table high ground, stove high ground.
    this.createDummy(-25.0, 0, 2.0);
    this.createDummy(16.0, 3.0, 5.0);
    this.createDummy(2.0, 3.28, -20.0);
  }

  createDummy(x, y, z) {
    const group = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xe6edf4,
      roughness: 0.62,
      emissive: 0x000000
    });
    const headMaterial = new THREE.MeshStandardMaterial({
      color: 0xf0a04b,
      roughness: 0.55,
      emissive: 0x000000
    });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.65, 8, 16), bodyMaterial);
    body.position.y = 0.82;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.30, 18, 14), headMaterial);
    head.position.y = 1.78;
    head.castShadow = true;
    group.add(head);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.68, 0.76, 0.16, 20),
      new THREE.MeshStandardMaterial({ color: 0x273746, roughness: 0.8 })
    );
    base.position.y = 0.08;
    base.receiveShadow = true;
    group.add(base);

    group.position.set(x, y, z);
    this.scene.add(group);

    const target = {
      group,
      body,
      head,
      health: 100,
      maxHealth: 100,
      alive: true,
      flashTimer: 0,
      respawnTimer: 0
    };

    for (const mesh of [body, head]) {
      mesh.userData.combatTarget = target;
      mesh.userData.hitZone = mesh === head ? 'head' : 'body';
      mesh.userData.disabled = false;
      this.hitMeshes.push(mesh);
    }

    this.targets.push(target);
  }

  registerHitMeshes(meshes) {
    for (const mesh of meshes) {
      if (!this.hitMeshes.includes(mesh)) this.hitMeshes.push(mesh);
    }
  }

  applyTinFangDamage(mesh, bodyDamage) {
    const target = mesh.userData.combatTarget;
    if (!target) return null;

    const hitZone = mesh.userData.hitZone;
    if (typeof target.takeTinFangDamage === 'function') {
      return target.takeTinFangDamage(hitZone, bodyDamage);
    }

    if (!target.alive) return null;

    const headshot = hitZone === 'head';
    const healthBefore = target.health;
    const damage = headshot ? healthBefore : Math.min(bodyDamage, healthBefore);
    target.health = headshot ? 0 : Math.max(0, target.health - bodyDamage);
    target.flashTimer = 0.12;
    target.body.material.emissive.setHex(headshot ? 0xffb14d : 0xffffff);
    target.head.material.emissive.setHex(headshot ? 0xffb14d : 0xffffff);

    let eliminated = false;
    if (target.health <= 0) {
      eliminated = true;
      target.alive = false;
      target.respawnTimer = 1.35;
      target.body.userData.disabled = true;
      target.head.userData.disabled = true;
      target.group.visible = false;
    }

    return {
      damage,
      headshot,
      instantElimination: headshot,
      eliminated,
      health: target.health
    };
  }

  applyDamage(mesh, baseDamage, headshotMultiplier) {
    const target = mesh.userData.combatTarget;
    if (!target) return null;

    if (typeof target.takeWeaponDamage === 'function') {
      return target.takeWeaponDamage(mesh.userData.hitZone, baseDamage, headshotMultiplier);
    }

    if (!target.alive) return null;

    const headshot = mesh.userData.hitZone === 'head';
    const damage = Math.round(baseDamage * (headshot ? headshotMultiplier : 1));
    target.health = Math.max(0, target.health - damage);
    target.flashTimer = 0.09;
    target.body.material.emissive.setHex(headshot ? 0xff7a2f : 0xffffff);
    target.head.material.emissive.setHex(headshot ? 0xff7a2f : 0xffffff);

    let eliminated = false;
    if (target.health <= 0) {
      eliminated = true;
      target.alive = false;
      target.respawnTimer = 1.35;
      target.body.userData.disabled = true;
      target.head.userData.disabled = true;
      target.group.visible = false;
    }

    return {
      damage,
      headshot,
      eliminated,
      health: target.health
    };
  }

  update(dt) {
    for (const target of this.targets) {
      if (target.flashTimer > 0) {
        target.flashTimer -= dt;
        if (target.flashTimer <= 0) {
          target.body.material.emissive.setHex(0x000000);
          target.head.material.emissive.setHex(0x000000);
        }
      }

      if (!target.alive) {
        target.respawnTimer -= dt;
        if (target.respawnTimer <= 0) {
          target.health = target.maxHealth;
          target.alive = true;
          target.body.userData.disabled = false;
          target.head.userData.disabled = false;
          target.body.material.emissive.setHex(0x000000);
          target.head.material.emissive.setHex(0x000000);
          target.group.visible = true;
        }
      }
    }
  }
}
