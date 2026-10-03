import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { InputController } from './input.js';
import { TestWorld } from './world.js';
import { PlayerController } from './player.js';
import { ThirdPersonCamera } from './camera.js';
import { TargetRange } from './targets.js';
import { WeaponSystem } from './weapon.js';
import { PlayerHealth } from './health.js';
import { CombatBot } from './bot.js';
import { ShellArmorSystem } from './loadout.js';
import { PickupSystem } from './pickups.js';
import { TinFangSystem } from './fang.js';

// Deploy trigger for Build 010.18C.

const root = document.querySelector('#app');
root.innerHTML = `
  <div id="hud">
    <div id="crosshair" data-type="rifle" data-mode="gun">
      <i class="arm top"></i><i class="arm right"></i><i class="arm bottom"></i><i class="arm left"></i>
      <span class="reticle-ring"></span><span class="reticle-dot"></span>
      <span class="weapon-shape primary" aria-hidden="true"></span>
      <span class="weapon-shape secondary" aria-hidden="true"></span>
      <span class="pellet-feedback" aria-hidden="true"></span>
      <div class="fang-reticle" aria-hidden="true">
        <i class="fang-charge-ring"></i>
        <i class="fang-blade-mark"></i>
        <i class="fang-center-pip"></i>
        <i class="fang-melee-a"></i>
        <i class="fang-melee-b"></i>
      </div>
    </div>

    <div id="scope-overlay">
      <div class="scope-reticle">
        <i class="scope-h"></i><i class="scope-v"></i>
        <span class="mil m1"></span><span class="mil m2"></span><span class="mil m3"></span><span class="mil m4"></span>
        <b></b>
      </div>
    </div>

    <div id="hit-marker"></div>
    <div id="damage-pop"></div>
    <div id="player-damage-vignette"></div>
    <div id="damage-direction">▲</div>
    <div id="shield-break">ARMOR BROKEN</div>

    <div id="player-status" class="bf-status">
      <div class="armor-line">
        <span class="armor-label">ARMOR</span>
        <div class="armor-plates" aria-label="Two armor plates">
          <span class="armor-plate"><i id="armor-plate-1"></i></span>
          <span class="armor-plate"><i id="armor-plate-2"></i></span>
        </div>
        <b id="shield-value">100</b>
      </div>
      <div class="health-line">
        <span class="health-label">HP</span>
        <div class="status-bar health-bar"><i id="health-fill"></i></div>
        <b id="health-value">100</b>
      </div>
      <div class="status-actions">
        <span><kbd>3</kbd> PLATE <b id="armor-count">×2</b></span>
        <span class="fang-action"><kbd>V</kbd> <b id="fang-state">FANG READY</b></span>
      </div>
      <i id="armor-progress"></i>
    </div>

    <div id="elimination">
      <strong>ELIMINATED</strong>
      <span>Respawning in <b id="respawn-countdown">2.5</b>s</span>
    </div>

    <div id="damage-test-hint">BUILD 010.18D · FAST CHARACTER START</div>
    <div id="bot-debug">BOT <b id="bot-state">IDLE</b> · SH <b id="bot-shield">100</b> · HP <b id="bot-health">100</b></div>
    <div id="stats"></div>

    <div id="pickup-prompt">
      <span id="pickup-key">E</span>
      <div>
        <strong id="pickup-title">STAPLE-SLINGER AR</strong>
        <small id="pickup-subtitle">MEDIUM AMMO</small>
      </div>
      <b id="pickup-action">EQUIP FOR TEST</b>
    </div>

    <div id="pickup-toast"></div>

    <div id="fang-charge">
      <div class="fang-charge-track"><i id="fang-charge-fill"></i></div>
      <span>HOLD V · RELEASE TO THROW</span>
    </div>

    <div id="fang-marker">
      <i id="fang-marker-arrow">▲</i>
      <b>FANG</b>
      <span id="fang-marker-distance"></span>
    </div>

    <div id="combat-hotbar" class="two-slot-hotbar">
      <div class="combat-slot gun-slot active" data-loadout-slot="0">
        <span class="slot-accent"></span>
        <span class="slot-key">1</span>
        <small>PRIMARY</small>
        <strong id="slot1-name">STAPLE-SLINGER AR</strong>
        <b id="slot1-ammo">30 / 90</b>
      </div>
      <div class="combat-slot gun-slot" data-loadout-slot="1">
        <span class="slot-accent"></span>
        <span class="slot-key">2</span>
        <small>SECONDARY</small>
        <strong id="slot2-name">TAPE-RATTLER SMG</strong>
        <b id="slot2-ammo">30 / 90</b>
      </div>
    </div>

    <div id="reload-state"></div>
    <div id="controls">Wheel / 1 / 2 guns · V tap melee · hold V aim / release throw · shoot stuck Fang loose · 3 armor · E swap · B bot</div>
    <div id="touch-note">Touch controls will be added in the dedicated mobile-input phase.</div>

    <div id="start">
      <div id="start-card">
        <div class="build-tag">BUILD 010.18B · CLEAN CHARACTER START</div>
        <h1>SHIFT Arena</h1>
        <p>SHIFT now checks for the production Roach Scout asset first: local VRM, then local rigged GLB, then the temporary development VRM. A standard Mixamo/Meshy-style humanoid GLB can drive the existing gun, Fang and pose systems without another character-code rewrite.</p>
        <div id="character-load-status" style="margin:10px 0 14px;font-size:12px;letter-spacing:.08em;opacity:.82">MAIN CHARACTER · LOADING AUTOMATICALLY…</div>
        <label class="bot-toggle">
          <span class="bot-toggle-copy">
            <strong>COMBAT BOT</strong>
            <small>Can also be toggled in-game with B</small>
          </span>
          <input id="bot-enabled" type="checkbox" checked>
          <span class="bot-toggle-track"><i></i></span>
          <b id="bot-toggle-label">ON</b>
        </label>
        <button type="button" disabled>ENTER LOADOUT TEST</button>
      </div>
    </div>
  </div>`;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ec8e3);
scene.fog = new THREE.Fog(0x9ec8e3, 38, 78);

const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.05, 180);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
root.prepend(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xdaf0ff, 0x5c4937, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(18, 28, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -35;
sun.shadow.camera.right = 35;
sun.shadow.camera.top = 35;
sun.shadow.camera.bottom = -35;
scene.add(sun);

const world = new TestWorld(scene);
const input = new InputController(renderer.domElement);
const player = new PlayerController(world, input);
const thirdCam = new ThirdPersonCamera(camera, player, input, world);
const targets = new TargetRange(scene);

const crosshair = document.querySelector('#crosshair');
const scopeOverlay = document.querySelector('#scope-overlay');
const hitMarker = document.querySelector('#hit-marker');
const damagePop = document.querySelector('#damage-pop');
const reloadState = document.querySelector('#reload-state');
const healthValue = document.querySelector('#health-value');
const shieldValue = document.querySelector('#shield-value');
const healthFill = document.querySelector('#health-fill');
const armorPlate1 = document.querySelector('#armor-plate-1');
const armorPlate2 = document.querySelector('#armor-plate-2');
const damageVignette = document.querySelector('#player-damage-vignette');
const damageDirection = document.querySelector('#damage-direction');
const shieldBreak = document.querySelector('#shield-break');
const elimination = document.querySelector('#elimination');
const respawnCountdown = document.querySelector('#respawn-countdown');
const botState = document.querySelector('#bot-state');
const botShield = document.querySelector('#bot-shield');
const botHealth = document.querySelector('#bot-health');
const botToggle = document.querySelector('#bot-enabled');
const botToggleLabel = document.querySelector('#bot-toggle-label');
const botDebug = document.querySelector('#bot-debug');
const pickupPrompt = document.querySelector('#pickup-prompt');
const pickupKey = document.querySelector('#pickup-key');
const pickupTitle = document.querySelector('#pickup-title');
const pickupSubtitle = document.querySelector('#pickup-subtitle');
const pickupAction = document.querySelector('#pickup-action');
const pickupToast = document.querySelector('#pickup-toast');
const gunSlots = [...document.querySelectorAll('.gun-slot')];
const slot1Name = document.querySelector('#slot1-name');
const slot1Ammo = document.querySelector('#slot1-ammo');
const slot2Name = document.querySelector('#slot2-name');
const slot2Ammo = document.querySelector('#slot2-ammo');
const armorCount = document.querySelector('#armor-count');
const armorProgress = document.querySelector('#armor-progress');
const fangState = document.querySelector('#fang-state');
const fangCharge = document.querySelector('#fang-charge');
const fangChargeFill = document.querySelector('#fang-charge-fill');
const fangMarker = document.querySelector('#fang-marker');
const fangMarkerArrow = document.querySelector('#fang-marker-arrow');
const fangMarkerDistance = document.querySelector('#fang-marker-distance');
const characterLoadStatus = document.querySelector('#character-load-status');

let weapon = null;
let armor = null;
let fang = null;
let bot = null;

const health = new PlayerHealth({
  player, world, cameraRig: thirdCam,
  onChange: updateHealthHud,
  onDamage: showPlayerDamage,
  onShieldBreak: showShieldBreak,
  onEliminated: () => {
    elimination.classList.add('show');
    crosshair.classList.add('disabled');
    weapon?.reset();
    armor?.reset();
    fang?.reset();
  },
  onRespawn: () => {
    elimination.classList.remove('show');
    crosshair.classList.remove('disabled');
    weapon?.reset();
    armor?.reset();
    fang?.reset();
  }
});

bot = new CombatBot({ scene, world, player, playerHealth: health, targets });
setBotEnabled(botToggle.checked);
botToggle.addEventListener('change', () => setBotEnabled(botToggle.checked));

weapon = new WeaponSystem({
  scene, camera, cameraRig: thirdCam, player, input, world, targets,
  onFire: () => pulse(crosshair, 'shot'),
  onHit: (result) => showHit(result),
  onSwitch: updateWeaponPresentation,
  onInventoryChange: updateHotbar
});

armor = new ShellArmorSystem({
  input,
  health,
  onChange: updateArmorHud
});

fang = new TinFangSystem({
  scene,
  camera,
  cameraRig: thirdCam,
  player,
  input,
  world,
  targets,
  audio: weapon.audio,
  onHit: (result) => showHit(result),
  onState: updateFangHud,
  onToast: showToast
});

const pickups = new PickupSystem({
  scene,
  player,
  input,
  weapons: weapon,
  armor,
  onPrompt: updatePickupPrompt,
  onToast: showToast
});

const start = document.querySelector('#start');
const button = start.querySelector('button');
let startupReady = false;

async function prewarmGameBeforeEntry() {
  button.disabled = true;
  characterLoadStatus.textContent =
    'MAIN CHARACTER · LOADING…';

  // Only the visible main character is part of the critical path.
  const avatar = await player.characterReady;

  if (!avatar) {
    characterLoadStatus.textContent =
      'MAIN CHARACTER FAILED · FALLBACK READY';
    startupReady = true;
    button.disabled = false;
    return;
  }

  characterLoadStatus.textContent =
    'MAIN CHARACTER · READY';

  // The normal render loop is already running behind the start overlay.
  // One frame is enough to touch the freshly attached avatar materials without
  // blocking on the full world, weapon shaders, or remote animation packs.
  await new Promise((resolve) =>
    requestAnimationFrame(resolve)
  );

  startupReady = true;
  button.disabled = false;
  showToast('MAIN CHARACTER READY');

  // Authored locomotion continues loading in the background. It is deliberately
  // not awaited here because its remote animation libraries are much larger
  // than the startup UI should ever block on.
  avatar.authoredLocomotionReady?.then((controller) => {
    if (!controller) return;
    characterLoadStatus.textContent =
      controller.hasAuthoredSlide
        ? 'MAIN CHARACTER · READY · ANIMATIONS READY'
        : 'MAIN CHARACTER · READY';
  });
}
prewarmGameBeforeEntry().catch((error) => {
  console.error('Startup prewarm failed:', error);
  characterLoadStatus.textContent =
    'STARTUP PREWARM FAILED · RETRY PAGE';
  button.disabled = true;
  button.textContent = 'RELOAD REQUIRED';
});

button.addEventListener('click', () => {
  if (!startupReady) return;
  weapon.unlockAudio();
  start.style.display = 'none';
  input.lockPointer();
});
renderer.domElement.addEventListener('click', () => {
  weapon.unlockAudio();
  input.lockPointer();
});

const stats = document.querySelector('#stats');
let last = performance.now();
let fps = 60;
let frames = 0;
let fpsTimer = 0;

function setBotEnabled(enabled) {
  bot.setEnabled(enabled);
  botToggle.checked = enabled;
  botToggleLabel.textContent = enabled ? 'ON' : 'OFF';
  botDebug.classList.toggle('bot-off', !enabled);
  botState.textContent = enabled ? bot.state : 'OFF';
  botHealth.textContent = enabled ? String(Math.round(bot.health)) : '—';
}

function updateWeaponPresentation(info) {
  crosshair.dataset.type = info.reticle;
}

function updateHotbar(state) {
  if (!state?.slots?.length) return;
  const nodes = [
    { name: slot1Name, ammo: slot1Ammo },
    { name: slot2Name, ammo: slot2Ammo }
  ];

  state.slots.forEach((slot, index) => {
    nodes[index].name.textContent = slot.name;
    nodes[index].ammo.textContent = `${slot.magazine} / ${slot.reserve}`;
    gunSlots[index].classList.toggle('active', index === state.activeSlot);
    gunSlots[index].style.setProperty('--accent', colorHex(slot.color));
  });
}

function updateArmorHud(state) {
  if (!state) return;
  armorCount.textContent = `×${state.charges}`;
  armorProgress.style.width = `${state.using ? state.progress * 100 : 0}%`;
  document.querySelector('#player-status').classList.toggle('using-armor', state.using);
}

function updateFangHud(state) {
  if (!state) return;

  const labels = {
    READY: 'FANG READY',
    PRIMING: 'DRAWING',
    AIMING: 'FANG AIM',
    RELEASE: 'THROW',
    SLASH: 'MELEE',
    THROWN: 'FANG THROWN',
    STUCK: 'FANG EMBEDDED',
    FALLING: 'FANG FALLING',
    DROPPED: 'PICK UP FANG',
    LOST: 'FANG LOST',
    CLAW: 'CLAW'
  };

  fangState.textContent = state.state === 'AIMING' && state.compactAim
    ? 'FANG AIM · LOW'
    : (labels[state.state] ?? state.state);
  fangState.classList.toggle('missing', !state.hasFang);

  const fangMode =
    state.state === 'PRIMING'
      ? 'fang-draw'
      : state.state === 'AIMING'
        ? 'fang-aim'
        : state.state === 'RELEASE'
          ? 'fang-release'
          : (state.state === 'SLASH' || state.state === 'CLAW')
            ? 'melee'
            : 'gun';

  crosshair.dataset.mode = fangMode;

  const charge = Math.max(0, Math.min(1, state.charge || 0));
  crosshair.style.setProperty('--fang-charge', String(charge));
  crosshair.style.setProperty('--fang-charge-angle', `${charge * 360}deg`);
  crosshair.classList.toggle('fang-full', fangMode === 'fang-aim' && charge >= 0.985);

  const aiming = state.state === 'AIMING' || state.state === 'RELEASE';
  fangCharge.classList.toggle('show', aiming);
  fangChargeFill.style.width = `${charge * 100}%`;

  const showMarker =
    (state.state === 'STUCK' || state.state === 'DROPPED') &&
    Number.isFinite(state.distance);

  fangMarker.classList.toggle('show', showMarker);
  if (showMarker) {
    fangMarkerArrow.style.transform = `rotate(${state.bearing}deg)`;
    fangMarkerDistance.textContent = `${state.distance.toFixed(1)}m`;
  }
}

function updatePickupPrompt(info) {
  pickupPrompt.classList.toggle('show', Boolean(info?.show));
  if (!info?.show) return;
  pickupKey.textContent = info.key;
  pickupTitle.textContent = info.title;
  pickupSubtitle.textContent = info.subtitle;
  pickupAction.textContent = info.action;
}

function showToast(message) {
  pickupToast.textContent = message;
  pickupToast.classList.remove('show');
  void pickupToast.offsetWidth;
  pickupToast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => pickupToast.classList.remove('show'), 950);
}

function updateHealthHud(state) {
  if (!healthValue) return;
  healthValue.textContent = String(Math.round(state.health));
  shieldValue.textContent = String(Math.round(state.shield));
  healthFill.style.width = `${Math.max(0, state.health / state.maxHealth) * 100}%`;
  const armor = Math.max(0, Math.min(state.maxShield, state.shield));
  const firstPlate = Math.min(1, armor / 50);
  const secondPlate = Math.min(1, Math.max(0, armor - 50) / 50);
  armorPlate1.style.width = `${firstPlate * 100}%`;
  armorPlate2.style.width = `${secondPlate * 100}%`;
}

function showPlayerDamage(result) {
  damageVignette.classList.remove('show', 'shield-only');
  void damageVignette.offsetWidth;
  damageVignette.classList.add('show');
  if (result.healthDamage === 0) damageVignette.classList.add('shield-only');

  damageDirection.style.transform = `translate(-50%, -50%) rotate(${result.direction}deg)`;
  damageDirection.classList.remove('show');
  void damageDirection.offsetWidth;
  damageDirection.classList.add('show');

  clearTimeout(showPlayerDamage.vignetteTimer);
  clearTimeout(showPlayerDamage.directionTimer);
  showPlayerDamage.vignetteTimer = setTimeout(() => damageVignette.classList.remove('show', 'shield-only'), 190);
  showPlayerDamage.directionTimer = setTimeout(() => damageDirection.classList.remove('show'), 280);
}

function showShieldBreak() {
  shieldBreak.classList.remove('show');
  void shieldBreak.offsetWidth;
  shieldBreak.classList.add('show');
  clearTimeout(showShieldBreak.timer);
  showShieldBreak.timer = setTimeout(() => shieldBreak.classList.remove('show'), 650);
}

function showHit(result) {
  const shieldDamage = Math.max(
    0,
    Math.round(result.shieldDamage ?? 0)
  );
  const healthDamage = Math.max(
    0,
    Math.round(result.healthDamage ?? 0)
  );
  const totalDamage = Math.max(
    0,
    Math.round(result.damage ?? shieldDamage + healthDamage)
  );

  const markerClasses = ['show'];
  if (result.headshot) markerClasses.push('headshot');
  else if (shieldDamage > 0) markerClasses.push('shield-hit');
  if (result.shieldBroken) markerClasses.push('shield-break-hit');
  hitMarker.className = markerClasses.join(' ');

  if (Number.isFinite(result.pelletsHit) && Number.isFinite(result.pelletsTotal)) {
    const pelletRatio = Math.max(
      0,
      Math.min(1, result.pelletsHit / Math.max(1, result.pelletsTotal))
    );
    crosshair.style.setProperty(
      '--pellet-hit-angle',
      `${Math.max(28, pelletRatio * 360).toFixed(0)}deg`
    );
    crosshair.classList.remove('pellet-confirm');
    void crosshair.offsetWidth;
    crosshair.classList.add('pellet-confirm');
    clearTimeout(showHit.pelletTimer);
    showHit.pelletTimer = setTimeout(
      () => crosshair.classList.remove('pellet-confirm'),
      150
    );
  }

  if (result.tinFang && result.headshot) {
    damagePop.textContent = 'FANG HEAD · DOWN';
    damagePop.className = 'show headshot';
  } else {
    const parts = [];

    if (shieldDamage > 0 && healthDamage > 0) {
      parts.push(
        `<span class="shield-damage">${shieldDamage}</span>`
      );
      parts.push(
        `<span class="${result.headshot ? 'critical-damage' : 'health-damage'}">${healthDamage}</span>`
      );
    } else if (result.headshot) {
      parts.push(
        `<span class="critical-damage">${totalDamage}</span>`
      );
    } else if (shieldDamage > 0) {
      parts.push(
        `<span class="shield-damage">${shieldDamage}</span>`
      );
    } else {
      parts.push(
        `<span class="health-damage">${healthDamage || totalDamage}</span>`
      );
    }

    if (result.shieldBroken && !result.eliminated) {
      parts.push('<small class="enemy-crack">CRACK</small>');
    }
    if (result.eliminated) {
      parts.push('<small class="enemy-down">DOWN</small>');
    }

    damagePop.innerHTML = parts.join('');
    damagePop.className =
      'show fortnite-damage' +
      (result.headshot ? ' headshot' : '') +
      (result.shieldBroken ? ' cracked' : '');
  }

  clearTimeout(showHit.markerTimer);
  clearTimeout(showHit.damageTimer);
  showHit.markerTimer = setTimeout(() => {
    hitMarker.className = '';
  }, 105);
  showHit.damageTimer = setTimeout(() => {
    damagePop.className = '';
    damagePop.textContent = '';
  }, 520);
}

function pulse(element, className) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  clearTimeout(pulse.timer);
  pulse.timer = setTimeout(() => element.classList.remove(className), 70);
}

function colorHex(value) {
  return `#${Number(value).toString(16).padStart(6, '0')}`;
}

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  if (health.alive) {
    armor.update(dt);

    const preFangBlock = armor.using || fang.blocksWeapons;
    weapon.setBlocked(preFangBlock);
    weapon.setVisualHidden(fang.blocksWeapons);

    const weaponCombatPose =
      !fang.blocksWeapons &&
      weapon.combatPoseActive;

    const combatFacing =
      input.pointerLocked &&
      !armor.using &&
      (weaponCombatPose || fang.blocksWeapons);

    player.update(
      dt,
      thirdCam.yaw,
      combatFacing,
      thirdCam.pitch,
      weaponCombatPose
    );
    weapon.updateSelection();

    const fangAiming = fang.aiming;
    thirdCam.update(dt, {
      aiming: fangAiming || weapon.aiming,
      adsFov: fangAiming ? fang.cfg.aimFov : weapon.adsFov,
      adsDistance: fangAiming ? fang.cfg.aimDistance : weapon.adsDistance,
      adsShoulderOffset: fangAiming
        ? (fang.compactAim ? fang.cfg.compactAimShoulderOffset : fang.cfg.aimShoulderOffset)
        : weapon.adsShoulderOffset,
      scoped: !fangAiming && weapon.scoped,
      smartAimCollision: fangAiming || weapon.aiming,
      compactAim: fangAiming && fang.compactAim,
      sprintBlend: player.sprintBlend,
      sliding: player.sliding
    });

    fang.update(dt, !armor.using);

    const fangBlocking = fang.blocksWeapons;
    weapon.setBlocked(armor.using || fangBlocking);
    weapon.setVisualHidden(fangBlocking);
    weapon.update(dt);

    // Final support-hand placement happens after the weapon pose is resolved.
    // Master-hand weapons keep the right hand authoritative; only the support
    // hand is IK-solved to the weapon.
    if (!armor.using && !fangBlocking && weapon.holdPoseActive) {
      player.applyWeaponIK(weapon.getGripPose(), dt);
    }

    if (!armor.using && !fangBlocking) pickups.update(dt);
    else updatePickupPrompt({ show: false });
  }

  if (input.consume('toggleBot')) setBotEnabled(!bot.enabled);

  health.update(dt);
  targets.update(dt);
  bot.update(dt, camera);

  player.group.visible = health.alive && !weapon.scoped;
  player.setCameraBodyHidden(
    health.alive &&
    !weapon.scoped &&
    thirdCam.hidePlayerBody
  );
  renderer.render(scene, camera);

  const fangAiming = health.alive && fang.aiming;
  const scoped = health.alive && !fangAiming && weapon.scoped;
  crosshair.dataset.type = weapon.reticleType;
  crosshair.dataset.weapon = weapon.weaponKey;
  crosshair.style.setProperty('--gap', `${weapon.crosshairGap.toFixed(1)}px`);
  crosshair.style.setProperty(
    '--spread-ratio',
    weapon.spreadRatio.toFixed(3)
  );
  crosshair.classList.toggle('ads', health.alive && (weapon.aiming || fangAiming));
  crosshair.classList.toggle(
    'gun-ads',
    health.alive && !fangAiming && weapon.aiming && !scoped
  );
  const targetHot =
    health.alive &&
    !fangAiming &&
    weapon.targetUnderReticle;

  crosshair.classList.toggle(
    'target-hot',
    targetHot && !scoped
  );
  crosshair.classList.toggle(
    'air-spread',
    health.alive && !player.grounded && !fangAiming
  );
  crosshair.classList.toggle('scoped-hidden', scoped);
  scopeOverlay.classList.toggle('show', scoped);
  scopeOverlay.classList.toggle('target-hot', targetHot && scoped);
  scopeOverlay.classList.toggle('unstable', scoped && weapon.scopeUnstable);
  scopeOverlay.classList.toggle(
    'stable',
    scoped && !weapon.scopeUnstable
  );

  reloadState.textContent = health.alive && weapon.isReloading
    ? `RELOADING · ${Math.round(weapon.reloadProgress * 100)}%`
    : armor?.using
      ? `APPLYING SHELL ARMOR · ${Math.round(armor.progress * 100)}%`
      : fang?.state === 'AIMING'
        ? `TIN FANG AIM · ${Math.round(fang.chargeRatio * 100)}%`
        : fang?.state === 'RELEASE'
          ? 'TIN FANG THROW'
          : '';

  botState.textContent = bot.enabled ? bot.state : 'OFF';
  botShield.textContent = bot.enabled ? String(Math.round(bot.shield)) : '—';
  botHealth.textContent = bot.enabled ? String(Math.round(bot.health)) : '—';
  if (!health.alive) respawnCountdown.textContent = health.respawnTimer.toFixed(1);

  frames += 1;
  fpsTimer += dt;
  if (fpsTimer > 0.5) {
    fps = Math.round(frames / fpsTimer);
    frames = 0;
    fpsTimer = 0;
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    stats.innerHTML = `FPS <b>${fps}</b><br>Speed <b>${speed.toFixed(1)}</b><br>Grounded <b>${player.grounded ? 'YES' : 'NO'}</b><br>Anim <b>${player.getAnimationState()}</b><br>State <b>${!health.alive ? 'ELIMINATED' : armor?.using ? 'ARMOR' : fang?.blocksWeapons ? fang.state : weapon.scoped ? 'SCOPED' : player.sliding ? 'SLIDE' : player.crouching ? 'CROUCH' : weapon.aiming ? 'ADS' : 'NORMAL'}</b>`;
  }
}
requestAnimationFrame(loop);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
});
