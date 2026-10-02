import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

export class TargetRange {
  constructor(scene) {
    this.scene = scene;
    this.targets = [];
    this.hitMeshes = [];
    this.build();
  }

  build() {
    this.createDummy(-5.2, 3.5);
    this.createDummy(0.2, 1.0);
    this.createDummy(5.0, -1.8);
    this.createDummy(-4.0, -5.4);
  }

  createDummy(x, z) {
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

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.48, 0.92, 8, 16), bodyMaterial);
    body.position.y = 1.02;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 18, 14), headMaterial);
    head.position.y = 1.94;
    head.castShadow = true;
    group.add(head);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.68, 0.76, 0.16, 20),
      new THREE.MeshStandardMaterial({ color: 0x273746, roughness: 0.8 })
    );
    base.position.y = 0.08;
    base.receiveShadow = true;
    group.add(base);

    group.position.set(x, 0, z);
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

  applyDamage(mesh, baseDamage, headshotMultiplier) {
    const target = mesh.userData.combatTarget;
    if (!target || !target.alive) return null;

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
