import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { GAME_CONFIG, WEAPON_ORDER } from './config.js';
import { buildJunkWeaponVisual } from './junk-weapon-model.js';

const AMMO_LABELS = {
  light: 'LIGHT AMMO',
  medium: 'MEDIUM AMMO',
  shells: 'SHELLS',
  heavy: 'HEAVY AMMO'
};

const AMMO_AMOUNTS = {
  light: 36,
  medium: 30,
  shells: 8,
  heavy: 4
};

export class PickupSystem {
  constructor({ scene, player, input, weapons, armor, onPrompt, onToast }) {
    this.scene = scene;
    this.player = player;
    this.input = input;
    this.weapons = weapons;
    this.armor = armor;
    this.onPrompt = onPrompt;
    this.onToast = onToast;
    this.weaponPickups = [];
    this.ammoPickups = [];
    this.armorPickups = [];
    this.time = 0;
    this.buildTestArea();
  }

  buildTestArea() {
    // Testing phase: exactly four permanent weapon stations, one per
    // hero weapon. They stay fixed even after the player equips from them.
    const xs = [-6, -2, 2, 6];
    WEAPON_ORDER.forEach((key, i) => {
      this.createWeaponPickup(
        key,
        new THREE.Vector3(xs[i], 0.32, 16.2)
      );
    });

    const ammo = [
      ['medium', -7.5],
      ['light', -2.5],
      ['shells', 2.5],
      ['heavy', 7.5]
    ];
    ammo.forEach(([type, x]) => this.createAmmoPickup(type, new THREE.Vector3(x, 0.28, 19.1)));
    this.createArmorPickup(new THREE.Vector3(12.2, 0.35, 19.1));
  }

  createWeaponPickup(key, position) {
    const cfg = GAME_CONFIG.weapons[key];
    const group = new THREE.Group();

    const glow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.72, 0.72, 0.05, 24),
      new THREE.MeshBasicMaterial({
        color: cfg.color,
        transparent: true,
        opacity: 0.24
      })
    );
    group.add(glow);

    const weaponGroup = new THREE.Group();
    const visual = buildJunkWeaponVisual(cfg, { pickup: true });
    visual.group.position.y = 0.34;
    visual.group.rotation.z = 0.04;
    weaponGroup.add(visual.group);
    group.add(weaponGroup);

    group.position.copy(position);
    this.scene.add(group);

    this.weaponPickups.push({
      kind: 'weapon',
      group,
      glow,
      weaponGroup,
      visual,
      weaponKey: key,
      magazineAmmo: cfg.magazineSize,
      baseY: position.y
    });
  }

  createAmmoPickup(type, position) {
    const color = type === 'light' ? 0xe1c74a : type === 'medium' ? 0x8bbd66 : type === 'shells' ? 0xd35e4e : 0x8266bb;
    const group = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.48, 0.62),
      new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.12 })
    );
    box.position.y = 0.24;
    group.add(box);

    for (let i = -1; i <= 1; i++) {
      const round = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.055, 0.32, 8),
        new THREE.MeshStandardMaterial({ color: 0xe7b63d, metalness: 0.45, roughness: 0.3 })
      );
      round.position.set(i * 0.16, 0.55, 0);
      group.add(round);
    }

    group.position.copy(position);
    this.scene.add(group);
    this.ammoPickups.push({ kind: 'ammo', type, group, respawnTimer: 0, baseY: position.y });
  }

  createArmorPickup(position) {
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.44, 0),
      new THREE.MeshStandardMaterial({ color: 0xaec6d4, roughness: 0.28, metalness: 0.62 })
    );
    mesh.position.copy(position);
    this.scene.add(mesh);
    this.armorPickups.push({ mesh, respawnTimer: 0, baseY: position.y });
  }

  update(dt) {
    this.time += dt;
    const p = this.player.group.position;

    let nearest = null;
    let nearestDistance = Infinity;

    for (const pickup of this.weaponPickups) {
      const d = flatDistance(p, pickup.group.position);
      pickup.weaponGroup.rotation.y += dt * 0.8;
      pickup.weaponGroup.position.y = 0.04 + Math.sin(this.time * 2.2 + pickup.group.position.x) * 0.05;

      if (d < 2.2 && d < nearestDistance) {
        nearest = pickup;
        nearestDistance = d;
      }
    }

    if (nearest) {
      const cfg = GAME_CONFIG.weapons[nearest.weaponKey];
      this.onPrompt?.({
        show: true,
        key: 'E',
        title: cfg.name,
        subtitle:
          `PERMANENT TEST SPAWN · ${AMMO_LABELS[cfg.ammoType]} · ` +
          `MAG ${nearest.magazineAmmo}/${cfg.magazineSize}`,
        action: 'EQUIP FOR TEST'
      });

      if (this.input.consume('interact')) {
        const result = this.weapons.swapActiveWithPickup(
          nearest.weaponKey,
          nearest.magazineAmmo
        );

        // Do not mutate the pedestal. During testing each station must
        // always keep its assigned hero weapon available.
        if (result.accepted) {
          this.onToast?.(`${cfg.name} EQUIPPED`);
        } else if (result.reason === 'ALREADY EQUIPPED') {
          this.onToast?.('ALREADY EQUIPPED');
        }
      }
    } else {
      this.onPrompt?.({ show: false });
      this.input.consume('interact');
    }

    for (const pickup of this.ammoPickups) {
      if (pickup.respawnTimer > 0) {
        pickup.respawnTimer -= dt;
        if (pickup.respawnTimer <= 0) pickup.group.visible = true;
        continue;
      }

      pickup.group.rotation.y += dt * 0.7;
      pickup.group.position.y = pickup.baseY + Math.sin(this.time * 2.5 + pickup.group.position.x) * 0.05;
      if (pickup.group.visible && flatDistance(p, pickup.group.position) < 1.1) {
        const added = this.weapons.addAmmo(pickup.type, AMMO_AMOUNTS[pickup.type]);
        if (added > 0) {
          pickup.group.visible = false;
          pickup.respawnTimer = 7;
          this.onToast?.(`+${added} ${AMMO_LABELS[pickup.type]}`);
        }
      }
    }

    for (const pickup of this.armorPickups) {
      if (pickup.respawnTimer > 0) {
        pickup.respawnTimer -= dt;
        if (pickup.respawnTimer <= 0) pickup.mesh.visible = true;
        continue;
      }

      pickup.mesh.rotation.y += dt;
      pickup.mesh.position.y = pickup.baseY + Math.sin(this.time * 2.2) * 0.05;
      if (pickup.mesh.visible && flatDistance(p, pickup.mesh.position) < 1.1) {
        const added = this.armor.addCharge(1);
        if (added > 0) {
          pickup.mesh.visible = false;
          pickup.respawnTimer = 10;
          this.onToast?.('+1 SHELL ARMOR');
        }
      }
    }
  }

}

function flatDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
