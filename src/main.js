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
import { GAME_CONFIG } from './config.js';

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
        <span class="fang-action"><kbd>V</kbd> <b id="fang-state">KNIFE HOLSTERED</b></span>
      </div>
      <i id="armor-progress"></i>
    </div>

    <div id="elimination">
      <strong>ELIMINATED</strong>
      <span>Respawning in <b id="respawn-countdown">2.5</b>s</span>
    </div>

    <div id="damage-test-hint">BUILD 010.28I · SEPARATED KNIFE STANCE</div>
    <div id="bot-debug">BOT <b id="bot-state">IDLE</b> · SH <b id="bot-shield">100</b> · HP <b id="bot-health">100</b></div>
    <div id="stats"></div>
    <div id="jitter-lab" hidden>
      <div class="jitter-title">JITTER LAB · F6</div>
      <div id="jitter-readout">Waiting for character…</div>
      <div id="jitter-switches">F7 ANIM · F8 IK · F9 CAM · F10 PIVOT</div>
    </div>

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
      <span>HOLD AIM · CLICK FIRE TO THROW</span>
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
    <div id="controls">WASD move · Shift sprint · Ctrl / C crouch & slide · Esc fullscreen · Wheel / 1 / 2 guns · V knife · LMB 3-swing combo · RMB hold aim + LMB throw · 3 armor · E swap · B toggle bots</div>
    <div id="touch-note">Touch controls will be added in the dedicated mobile-input phase.</div>

    <div id="start">
      <div id="start-card">
        <div class="build-tag">BUILD 010.28I · SEPARATED KNIFE STANCE</div>
        <h1>SHIFT Arena</h1>
        <p>SHIFT now checks for the production Roach Scout asset first: local VRM, then local rigged GLB, then the temporary development VRM. A standard Mixamo/Meshy-style humanoid GLB can drive the existing gun, Fang and pose systems without another character-code rewrite.</p>
        <div id="character-load-status" style="margin:10px 0 14px;font-size:12px;letter-spacing:.08em;opacity:.82">MAIN CHARACTER · LOADING AUTOMATICALLY…</div>
        <div class="opponent-setup">
          <div class="opponent-heading">
            <strong>OPPONENTS</strong>
            <small>Choose before entering the arena</small>
          </div>

          <div class="opponent-choice" role="group" aria-label="Opponent mode">
            <button type="button" class="setup-choice" data-opponents="off">
              NO OPPONENTS
            </button>
            <button type="button" class="setup-choice" data-opponents="on">
              ADD OPPONENTS
            </button>
          </div>

          <div id="opponent-options" class="opponent-options" hidden>
            <div class="setup-row">
              <span>BOT COUNT</span>
              <div class="setup-segments" id="bot-count-options">
                <button type="button" data-bot-count="1">1</button>
                <button type="button" data-bot-count="2" class="selected">2</button>
                <button type="button" data-bot-count="3">3</button>
                <button type="button" data-bot-count="4">4</button>
              </div>
            </div>

            <div class="setup-row">
              <span>DIFFICULTY</span>
              <div class="setup-segments" id="bot-difficulty-options">
                <button type="button" data-bot-difficulty="easy">EASY</button>
                <button type="button" data-bot-difficulty="normal" class="selected">NORMAL</button>
                <button type="button" data-bot-difficulty="hard">HARD</button>
              </div>
            </div>
          </div>

          <div id="opponent-choice-status" class="opponent-choice-status">
            CHOOSE OPPONENTS: YES OR NO
          </div>
        </div>

        <button id="enter-arena" type="button" disabled>ENTER LOADOUT TEST</button>
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

function syncAimHudToCanvas() {
  const rect =
    renderer.domElement.getBoundingClientRect();

  const aimX =
    rect.left + rect.width * 0.5;
  const aimY =
    rect.top + rect.height * 0.5;

  hud?.style.setProperty(
    '--aim-x',
    `${aimX}px`
  );
  hud?.style.setProperty(
    '--aim-y',
    `${aimY}px`
  );
}

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

const hud = document.querySelector('#hud');
const crosshair = document.querySelector('#crosshair');
const scopeOverlay = document.querySelector('#scope-overlay');

syncAimHudToCanvas();
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
const botDebug = document.querySelector('#bot-debug');
const opponentModeButtons = [
  ...document.querySelectorAll('[data-opponents]')
];
const opponentOptions =
  document.querySelector('#opponent-options');
const opponentChoiceStatus =
  document.querySelector('#opponent-choice-status');
const botCountButtons = [
  ...document.querySelectorAll('[data-bot-count]')
];
const botDifficultyButtons = [
  ...document.querySelectorAll('[data-bot-difficulty]')
];
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
const jitterLab = document.querySelector('#jitter-lab');
const jitterReadout = document.querySelector('#jitter-readout');
const jitterSwitches = document.querySelector('#jitter-switches');

let weapon = null;
let armor = null;
let fang = null;
const bots = [];
let opponentsChosen = false;
let opponentsEnabled = false;
let selectedBotCount = 2;
let selectedBotDifficulty = 'normal';

const jitterDebug = {
  visible: false,
  freezeAuthored: false,
  disableIK: false,
  freezeCamera: false,
  lockPivot: false,
  previous: null,
  smooth: {
    rootPos: 0, rootY: 0, rootRot: 0,
    pivotPos: 0, pivotRot: 0,
    normHipsPos: 0, normHipsRot: 0,
    rawHipsPos: 0, rawHipsRot: 0,
    cameraPos: 0, cameraRot: 0
  }
};

const DEBUG_POS = new THREE.Vector3();
const DEBUG_QUAT = new THREE.Quaternion();

function captureDebugTransform(object) {
  if (!object) return null;
  object.updateWorldMatrix?.(true, false);
  return {
    p: object.getWorldPosition(new THREE.Vector3()),
    q: object.getWorldQuaternion(new THREE.Quaternion())
  };
}

function quaternionDeltaDegrees(a, b) {
  if (!a || !b) return 0;
  const dot = THREE.MathUtils.clamp(Math.abs(a.dot(b)), 0, 1);
  return THREE.MathUtils.radToDeg(2 * Math.acos(dot));
}

function smoothDebugMetric(key, value) {
  jitterDebug.smooth[key] = THREE.MathUtils.lerp(
    jitterDebug.smooth[key] ?? 0,
    Number.isFinite(value) ? value : 0,
    0.18
  );
}

function updateJitterLab() {
  if (!jitterDebug.visible || !jitterReadout) return;

  const vrmCharacter = player.vrmCharacter;
  if (!vrmCharacter) {
    jitterReadout.textContent = 'VRM character not ready';
    return;
  }

  player.group.updateWorldMatrix(true, true);
  camera.updateWorldMatrix(true, false);
  vrmCharacter.root.updateWorldMatrix(true, true);

  const current = {
    root: captureDebugTransform(player.group),
    pivot: captureDebugTransform(player.body),
    normHips: captureDebugTransform(vrmCharacter.bones?.hips),
    rawHips: captureDebugTransform(vrmCharacter.rawBones?.hips),
    camera: captureDebugTransform(camera)
  };

  const previous = jitterDebug.previous;
  jitterDebug.previous = current;
  if (!previous) return;

  for (const key of ['root', 'pivot', 'normHips', 'rawHips', 'camera']) {
    const nowT = current[key];
    const oldT = previous[key];
    if (!nowT || !oldT) continue;

    const posMm = nowT.p.distanceTo(oldT.p) * 1000;
    const rotDeg = quaternionDeltaDegrees(nowT.q, oldT.q);

    if (key === 'root') {
      smoothDebugMetric('rootPos', posMm);
      smoothDebugMetric(
        'rootY',
        Math.abs(nowT.p.y - oldT.p.y) * 1000
      );
      smoothDebugMetric('rootRot', rotDeg);
    } else if (key === 'pivot') {
      smoothDebugMetric('pivotPos', posMm);
      smoothDebugMetric('pivotRot', rotDeg);
    } else if (key === 'normHips') {
      smoothDebugMetric('normHipsPos', posMm);
      smoothDebugMetric('normHipsRot', rotDeg);
    } else if (key === 'rawHips') {
      smoothDebugMetric('rawHipsPos', posMm);
      smoothDebugMetric('rawHipsRot', rotDeg);
    } else if (key === 'camera') {
      smoothDebugMetric('cameraPos', posMm);
      smoothDebugMetric('cameraRot', rotDeg);
    }
  }

  const s = jitterDebug.smooth;
  const speed = player.horizontalSpeed();
  const still = speed < 0.18 && player.grounded && !player.sliding;
  const flags = [
    jitterDebug.freezeAuthored ? 'ANIM OFF' : 'ANIM ON',
    jitterDebug.disableIK ? 'IK OFF' : 'IK ON',
    jitterDebug.freezeCamera ? 'CAM FROZEN' : 'CAM LIVE',
    jitterDebug.lockPivot ? 'PIVOT LOCK' : 'PIVOT LIVE'
  ].join(' · ');

  jitterReadout.innerHTML =
    `STATE <b>${still ? 'STILL' : 'MOVING'}</b> · SPEED ${speed.toFixed(2)}<br>` +
    `ROOT Δ ${s.rootPos.toFixed(2)}mm · Y ${s.rootY.toFixed(2)}mm · R ${s.rootRot.toFixed(3)}°<br>` +
    `PIVOT Δ ${s.pivotPos.toFixed(2)}mm · R ${s.pivotRot.toFixed(3)}°<br>` +
    `N-HIPS Δ ${s.normHipsPos.toFixed(2)}mm · R ${s.normHipsRot.toFixed(3)}°<br>` +
    `R-HIPS Δ ${s.rawHipsPos.toFixed(2)}mm · R ${s.rawHipsRot.toFixed(3)}°<br>` +
    `CAM Δ ${s.cameraPos.toFixed(2)}mm · R ${s.cameraRot.toFixed(3)}°`;

  jitterSwitches.textContent =
    `F7 ${jitterDebug.freezeAuthored ? 'ANIM OFF' : 'ANIM ON'} · ` +
    `F8 ${jitterDebug.disableIK ? 'IK OFF' : 'IK ON'} · ` +
    `F9 ${jitterDebug.freezeCamera ? 'CAM FROZEN' : 'CAM LIVE'} · ` +
    `F10 ${jitterDebug.lockPivot ? 'PIVOT LOCK' : 'PIVOT LIVE'}`;
}

addEventListener('keydown', (event) => {
  if (!['F6', 'F7', 'F8', 'F9', 'F10'].includes(event.code)) return;
  event.preventDefault();

  if (event.code === 'F6') {
    jitterDebug.visible = !jitterDebug.visible;
    jitterLab.hidden = !jitterDebug.visible;
    jitterDebug.previous = null;
  }

  if (event.code === 'F7') {
    jitterDebug.freezeAuthored = !jitterDebug.freezeAuthored;
    jitterDebug.previous = null;
  }

  if (event.code === 'F8') {
    jitterDebug.disableIK = !jitterDebug.disableIK;
    jitterDebug.previous = null;
  }

  if (event.code === 'F9') {
    jitterDebug.freezeCamera = !jitterDebug.freezeCamera;
    jitterDebug.previous = null;
  }

  if (event.code === 'F10') {
    jitterDebug.lockPivot = !jitterDebug.lockPivot;
    jitterDebug.previous = null;
  }

  if (player.vrmCharacter) {
    player.vrmCharacter.debugFreezeAuthored =
      jitterDebug.freezeAuthored;
  }
});

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

const baseBotSpawn =
  world.botSpawnPoint?.clone() ??
  new THREE.Vector3(-10, 0, 12);

const botSpawnOffsets = [
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(5.5, 0, -1.5),
  new THREE.Vector3(-4.5, 0, -4.5),
  new THREE.Vector3(6.5, 0, -7.0)
];

for (let i = 0; i < 4; i++) {
  const spawn = baseBotSpawn
    .clone()
    .add(botSpawnOffsets[i]);

  const bot = new CombatBot({
    scene,
    world,
    player,
    playerHealth: health,
    targets,
    spawnPoint: spawn,
    difficulty: selectedBotDifficulty,
    index: i
  });

  bot.setEnabled(false);
  bots.push(bot);
}

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
const button = document.querySelector('#enter-arena');
let startupReady = false;

function updateEnterAvailability() {
  button.disabled = !(startupReady && opponentsChosen);
}

function selectOpponentMode(enabled) {
  opponentsChosen = true;
  opponentsEnabled = Boolean(enabled);

  opponentModeButtons.forEach((choice) => {
    const active =
      (choice.dataset.opponents === 'on') ===
      opponentsEnabled;
    choice.classList.toggle('selected', active);
    choice.setAttribute(
      'aria-pressed',
      String(active)
    );
  });

  opponentOptions.hidden = !opponentsEnabled;

  opponentChoiceStatus.textContent =
    opponentsEnabled
      ? `✓ ${selectedBotCount} BOT${selectedBotCount === 1 ? '' : 'S'} · ${selectedBotDifficulty.toUpperCase()}`
      : '✓ NO OPPONENTS';

  // Critical safety rule: pre-match selection never activates a bot.
  setBotsEnabled(false);
  updateEnterAvailability();
}

function selectBotCount(count) {
  selectedBotCount = THREE.MathUtils.clamp(
    Number(count) || 1,
    1,
    4
  );

  botCountButtons.forEach((choice) => {
    const active =
      Number(choice.dataset.botCount) === selectedBotCount;
    choice.classList.toggle('selected', active);
    choice.setAttribute(
      'aria-pressed',
      String(active)
    );
  });

  if (opponentsEnabled) {
    opponentChoiceStatus.textContent =
      `${selectedBotCount} BOT${selectedBotCount === 1 ? '' : 'S'} · ${selectedBotDifficulty.toUpperCase()}`;
  }
}

function selectBotDifficulty(difficulty) {
  selectedBotDifficulty =
    ['easy', 'normal', 'hard'].includes(difficulty)
      ? difficulty
      : 'normal';

  botDifficultyButtons.forEach((choice) => {
    const active =
      choice.dataset.botDifficulty ===
        selectedBotDifficulty;
    choice.classList.toggle('selected', active);
    choice.setAttribute(
      'aria-pressed',
      String(active)
    );
  });

  if (opponentsEnabled) {
    opponentChoiceStatus.textContent =
      `${selectedBotCount} BOT${selectedBotCount === 1 ? '' : 'S'} · ${selectedBotDifficulty.toUpperCase()}`;
  }
}

opponentModeButtons.forEach((choice) => {
  choice.setAttribute('aria-pressed', 'false');
  choice.addEventListener('click', () => {
    selectOpponentMode(
      choice.dataset.opponents === 'on'
    );
  });
});

botCountButtons.forEach((choice) => {
  choice.setAttribute(
    'aria-pressed',
    String(
      Number(choice.dataset.botCount) === selectedBotCount
    )
  );
  choice.addEventListener('click', () => {
    selectBotCount(choice.dataset.botCount);
  });
});

botDifficultyButtons.forEach((choice) => {
  choice.setAttribute(
    'aria-pressed',
    String(
      choice.dataset.botDifficulty ===
        selectedBotDifficulty
    )
  );
  choice.addEventListener('click', () => {
    selectBotDifficulty(
      choice.dataset.botDifficulty
    );
  });
});

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
    updateEnterAvailability();
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
  updateEnterAvailability();
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

let arenaEntered = false;
let immersiveRequestBusy = false;

async function enterImmersiveArena({
  quiet = false
} = {}) {
  if (input.isTouch) {
    input.lockPointer();
    return;
  }

  // Request Pointer Lock first from the active user gesture, then fullscreen.
  // The game itself never depends on either API succeeding.
  input.lockPointer();

  let fullscreenActive =
    Boolean(document.fullscreenElement);

  if (
    !fullscreenActive &&
    document.fullscreenEnabled &&
    document.documentElement.requestFullscreen
  ) {
    try {
      await document.documentElement.requestFullscreen({
        navigationUI: 'hide'
      });
      fullscreenActive =
        Boolean(document.fullscreenElement);
    } catch {
      fullscreenActive = false;
    }
  }

  const keyboardLocked =
    fullscreenActive
      ? await input.lockGameKey()
      : false;

  if (quiet) return;

  if (fullscreenActive && keyboardLocked) {
    showToast('FULLSCREEN · CTRL+W PROTECTED');
  } else if (!fullscreenActive) {
    showToast('WINDOWED · ESC TO RETRY FULLSCREEN');
  } else {
    showToast('CTRL+W MAY BE RESERVED · C ALSO CROUCHES');
  }
}

function restoreFullscreenFromEscape(event) {
  if (
    !arenaEntered ||
    input.isTouch ||
    event.code !== 'Escape' ||
    document.fullscreenElement ||
    immersiveRequestBusy
  ) {
    return;
  }

  // The first Esc is left completely to the browser so it can exit fullscreen.
  // A later Esc while windowed is a fresh user gesture and toggles immersive
  // play back on without pausing or resetting the match.
  event.preventDefault();
  event.stopPropagation();

  immersiveRequestBusy = true;

  enterImmersiveArena({
    quiet: true
  })
    .finally(() => {
      immersiveRequestBusy = false;
    });
}

window.addEventListener(
  'keydown',
  restoreFullscreenFromEscape,
  true
);

document.addEventListener(
  'fullscreenchange',
  () => {
    requestAnimationFrame(
      () => {
        syncAimHudToCanvas();
        requestAnimationFrame(
          syncAimHudToCanvas
        );
      }
    );

    if (!document.fullscreenElement) {
      input.unlockGameKeys();
      return;
    }

    // Reapply the narrow KeyW lock whenever fullscreen is regained.
    input.lockGameKey();
  }
);

button.addEventListener('click', () => {
  if (!startupReady || !opponentsChosen) return;

  applyOpponentSetup();
  weapon.unlockAudio();
  arenaEntered = true;
  start.style.display = 'none';

  // Arena entry remains immediate. Fullscreen, keyboard lock and pointer lock
  // are all best-effort enhancements around the already-running match.
  enterImmersiveArena().catch(() => {
    input.lockPointer();
  });
});
renderer.domElement.addEventListener('click', () => {
  weapon.unlockAudio();

  if (
    arenaEntered &&
    !input.isTouch &&
    (
      !document.fullscreenElement ||
      document.pointerLockElement !== renderer.domElement
    )
  ) {
    enterImmersiveArena({
      quiet: true
    }).catch(() => {
      input.lockPointer();
    });
    return;
  }

  input.lockPointer();

  if (document.fullscreenElement) {
    input.lockGameKey();
  }
});

const stats = document.querySelector('#stats');
let last = performance.now();
let fps = 60;
let frames = 0;
let fpsTimer = 0;

function rebuildBotDifficulty() {
  // Difficulty is selected pre-match. Recreate the tiny procedural bot pool
  // so each instance owns an independent config copy.
  bots.forEach((bot, index) => {
    bot.difficulty = selectedBotDifficulty;
    const profile = {
      easy: {
        moveSpeed: 0.82,
        fireRate: 0.68,
        damage: 0.72,
        reactionDelay: 0.72,
        hitChance: 0.46,
        missRadius: 1.35
      },
      normal: {
        moveSpeed: 1,
        fireRate: 1,
        damage: 1,
        reactionDelay: 0.30,
        hitChance: 0.72,
        missRadius: 0.82
      },
      hard: {
        moveSpeed: 1.14,
        fireRate: 1.24,
        damage: 1.12,
        reactionDelay: 0.12,
        hitChance: 0.90,
        missRadius: 0.42
      }
    }[selectedBotDifficulty];

    const base = GAME_CONFIG.bot;
    bot.cfg = {
      ...base,
      moveSpeed: base.moveSpeed * profile.moveSpeed,
      fireRate: base.fireRate * profile.fireRate,
      damage: base.damage * profile.damage,
      reactionDelay: profile.reactionDelay,
      hitChance: profile.hitChance,
      missRadius: profile.missRadius
    };
  });
}

function applyOpponentSetup() {
  rebuildBotDifficulty();

  bots.forEach((bot, index) => {
    bot.setEnabled(
      opponentsEnabled &&
      index < selectedBotCount
    );
  });

  updateBotDebug();
}

function setBotsEnabled(enabled) {
  bots.forEach((bot, index) => {
    bot.setEnabled(
      Boolean(enabled) &&
      opponentsEnabled &&
      index < selectedBotCount
    );
  });
  updateBotDebug();
}

function updateBotDebug() {
  const active = bots.filter((bot) => bot.enabled);
  const living = active.filter((bot) => bot.alive);

  botDebug.classList.toggle(
    'bot-off',
    active.length === 0
  );

  if (!active.length) {
    botState.textContent = 'OFF';
    botShield.textContent = '—';
    botHealth.textContent = '—';
    return;
  }

  const attacking = active.filter(
    (bot) => bot.state === 'ATTACK'
  ).length;

  botState.textContent =
    `${living.length}/${active.length} · ${selectedBotDifficulty.toUpperCase()}${attacking ? ` · ${attacking} ATK` : ''}`;

  botShield.textContent = String(
    Math.round(
      active.reduce((sum, bot) => sum + bot.shield, 0) /
      active.length
    )
  );

  botHealth.textContent = String(
    Math.round(
      active.reduce((sum, bot) => sum + bot.health, 0) /
      active.length
    )
  );
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
    READY:
      state.equipped
        ? 'KNIFE EQUIPPED · 0.45 KG'
        : 'KNIFE HOLSTERED',
    PRIMING: 'THROW AIM',
    AIMING: 'THROW AIM',
    RELEASE: 'THROW',
    SLASH: 'KNIFE SLASH',
    THROWN: 'KNIFE THROWN',
    STUCK: 'KNIFE EMBEDDED',
    FALLING: 'KNIFE FALLING',
    DROPPED: 'PICK UP KNIFE',
    LOST: 'KNIFE LOST',
    CLAW: 'CLAW'
  };

  fangState.textContent =
    state.state === 'AIMING' &&
    state.compactAim
      ? 'THROW AIM · LOW'
      : (
          labels[state.state] ??
          state.state
        );
  fangState.classList.toggle('missing', !state.hasFang);

  const fangMode =
    state.state === 'PRIMING'
      ? 'fang-draw'
      : state.state === 'AIMING'
        ? 'fang-aim'
        : state.state === 'RELEASE'
          ? 'fang-release'
          : (
              state.state === 'SLASH' ||
              state.equipped
            )
            ? 'melee'
            : 'gun';

  crosshair.dataset.mode = fangMode;

  const charge = Math.max(0, Math.min(1, state.charge || 0));
  crosshair.style.setProperty('--fang-charge', String(charge));
  crosshair.style.setProperty('--fang-charge-angle', `${charge * 360}deg`);
  crosshair.classList.toggle('fang-full', fangMode === 'fang-aim' && charge >= 0.985);

  const aiming =
    state.state === 'PRIMING' ||
    state.state === 'AIMING' ||
    state.state === 'RELEASE';
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

    // Resolve mouse look and recoil first. Player upper-body aim, weapon pose
    // and final rendered camera will now share one exact yaw/pitch sample.
    thirdCam.prepareLook(dt);

    const combatFacing =
      input.pointerLocked &&
      !armor.using &&
      (
        weaponCombatPose ||
        fang.combatFacing
      );

    if (player.vrmCharacter) {
      player.vrmCharacter.debugFreezeAuthored =
        jitterDebug.freezeAuthored;
    }

    player.update(
      dt,
      thirdCam.yaw,
      combatFacing,
      thirdCam.pitch,
      weapon.aiming,
      weapon.aimPoseBlend,
      weapon.shoulderPoseBlend,
      weapon.poseClass
    );

    if (jitterDebug.lockPivot) {
      player.turnLean = 0;
      player.body.rotation.x = 0;
      player.body.rotation.z = 0;
    }

    const selectedGun =
      weapon.updateSelection(
        fang.equipped
      );

    if (selectedGun) {
      fang.unequipForGunSwitch();
    }

    const fangAiming = fang.aiming;
    const frozenCameraPose = jitterDebug.freezeCamera
      ? {
          position: camera.position.clone(),
          quaternion: camera.quaternion.clone(),
          fov: camera.fov
        }
      : null;

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

    if (frozenCameraPose) {
      camera.position.copy(frozenCameraPose.position);
      camera.quaternion.copy(frozenCameraPose.quaternion);
      camera.fov = frozenCameraPose.fov;
      camera.updateProjectionMatrix();
      camera.updateWorldMatrix(true, false);
    }

    fang.update(dt, !armor.using);

    const fangBlocking = fang.blocksWeapons;
    weapon.setBlocked(armor.using || fangBlocking);
    weapon.setVisualHidden(fangBlocking);
    weapon.update(dt);

    // Final support-hand placement happens after the weapon pose is resolved.
    // Master-hand weapons keep the right hand authoritative; only the support
    // hand is IK-solved to the weapon.
    if (
      !jitterDebug.disableIK &&
      !armor.using &&
      !fangBlocking &&
      weapon.holdPoseActive
    ) {
      player.applyWeaponIK(weapon.getGripPose(), dt);
    }

    // One final render-skeleton commit after ALL animation/IK writers.
    player.finalizeCharacterPose();
    updateJitterLab();

    if (!armor.using && !fangBlocking) pickups.update(dt);
    else updatePickupPrompt({ show: false });
  }

  if (input.consume('toggleBot') && opponentsChosen) {
    const anyEnabled = bots.some((bot) => bot.enabled);
    setBotsEnabled(!anyEnabled);
  }

  health.update(dt);
  targets.update(dt);
  bots.forEach((bot) => bot.update(dt, camera));

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

  updateBotDebug();
  if (!health.alive) respawnCountdown.textContent = health.respawnTimer.toFixed(1);

  frames += 1;
  fpsTimer += dt;
  if (fpsTimer > 0.5) {
    fps = Math.round(frames / fpsTimer);
    frames = 0;
    fpsTimer = 0;
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    stats.innerHTML = `FPS <b>${fps}</b><br>Speed <b>${speed.toFixed(1)}</b><br>Grounded <b>${player.grounded ? 'YES' : 'NO'}</b><br>Anim <b>${player.getAnimationState()}</b><br>State <b>${!health.alive ? 'ELIMINATED' : armor?.using ? 'ARMOR' : fang?.equipped ? 'KNIFE' : fang?.blocksWeapons ? fang.state : weapon.scoped ? 'SCOPED' : player.sliding ? 'SLIDE' : player.crouching ? 'CROUCH' : weapon.aiming ? 'ADS' : 'NORMAL'}</b>`;
  }
}
requestAnimationFrame(loop);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));

  requestAnimationFrame(
    syncAimHudToCanvas
  );
});
