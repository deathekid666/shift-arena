import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { InputController } from './input.js';
import { TestWorld } from './world.js';
import { PlayerController } from './player.js';
import { ThirdPersonCamera } from './camera.js';
import { TargetRange } from './targets.js';
import { TacticalAR } from './weapon.js';
import { PlayerHealth } from './health.js';
import { CombatBot } from './bot.js';

const root = document.querySelector('#app');
root.innerHTML = `
  <div id="hud">
    <div id="crosshair"><span></span></div>
    <div id="hit-marker"></div>
    <div id="damage-pop"></div>
    <div id="player-damage-vignette"></div>
    <div id="damage-direction">▲</div>
    <div id="shield-break">SHIELD BROKEN</div>

    <div id="player-status">
      <div class="status-row shield-row">
        <span>SHIELD</span><b id="shield-value">100</b>
      </div>
      <div class="status-bar shield-bar"><i id="shield-fill"></i></div>
      <div class="status-row health-row">
        <span>HP</span><b id="health-value">100</b>
      </div>
      <div class="status-bar health-bar"><i id="health-fill"></i></div>
    </div>

    <div id="elimination">
      <strong>ELIMINATED</strong>
      <span>Respawning in <b id="respawn-countdown">2.5</b>s</span>
    </div>

    <div id="damage-test-hint">
      BUILD 005 · GIANT KITCHEN GRAYBOX · FLOOR + HIGH ROUTES
    </div>

    <div id="bot-debug">
      BOT <b id="bot-state">IDLE</b> · HP <b id="bot-health">100</b>
    </div>

    <div id="stats"></div>
    <div id="weapon-hud">
      <div class="weapon-name">TACTICAL AR</div>
      <div><span id="ammo">30</span><span class="reserve"> / ∞</span></div>
      <div id="reload-state"></div>
    </div>
    <div id="controls">WASD move · LMB fire · RMB ADS · R reload · Shift sprint · Ctrl crouch/slide · Space jump · Esc unlock</div>
    <div id="touch-note">Touch device detected. Mobile combat controls will be added in the dedicated mobile-input phase.</div>
    <div id="start">
      <div id="start-card">
        <div class="build-tag">BUILD 005</div>
        <h1>SHIFT Arena</h1>
        <p>First real map graybox: fight through a giant kitchen with floor lanes, island high ground, a spoon bridge, under-table flanks, a sink tunnel, stove counter and fridge landmark.</p>
        <button type="button">ENTER KITCHEN</button>
      </div>
    </div>
  </div>`;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ec8e3);
scene.fog = new THREE.Fog(0x9ec8e3, 38, 78);

const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.05, 140);
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
const hitMarker = document.querySelector('#hit-marker');
const damagePop = document.querySelector('#damage-pop');
const ammo = document.querySelector('#ammo');
const reloadState = document.querySelector('#reload-state');
const healthValue = document.querySelector('#health-value');
const shieldValue = document.querySelector('#shield-value');
const healthFill = document.querySelector('#health-fill');
const shieldFill = document.querySelector('#shield-fill');
const damageVignette = document.querySelector('#player-damage-vignette');
const damageDirection = document.querySelector('#damage-direction');
const shieldBreak = document.querySelector('#shield-break');
const elimination = document.querySelector('#elimination');
const respawnCountdown = document.querySelector('#respawn-countdown');
const botState = document.querySelector('#bot-state');
const botHealth = document.querySelector('#bot-health');

let weapon = null;
let bot = null;

const health = new PlayerHealth({
  player,
  world,
  cameraRig: thirdCam,
  onChange: updateHealthHud,
  onDamage: showPlayerDamage,
  onShieldBreak: showShieldBreak,
  onEliminated: () => {
    elimination.classList.add('show');
    crosshair.classList.add('disabled');
    weapon?.reset();
  },
  onRespawn: () => {
    elimination.classList.remove('show');
    crosshair.classList.remove('disabled');
    weapon?.reset();
  }
});

bot = new CombatBot({
  scene,
  world,
  player,
  playerHealth: health,
  targets
});

weapon = new TacticalAR({
  scene,
  camera,
  cameraRig: thirdCam,
  player,
  input,
  world,
  targets,
  onFire: () => pulse(crosshair, 'shot'),
  onHit: (result) => showHit(result)
});

const start = document.querySelector('#start');
const button = start.querySelector('button');
button.addEventListener('click', () => {
  start.style.display = 'none';
  input.lockPointer();
});
renderer.domElement.addEventListener('click', () => input.lockPointer());

const stats = document.querySelector('#stats');
let last = performance.now();
let fps = 60;
let frames = 0;
let fpsTimer = 0;

function updateHealthHud(state) {
  if (!healthValue) return;
  healthValue.textContent = String(Math.round(state.health));
  shieldValue.textContent = String(Math.round(state.shield));
  healthFill.style.width = `${Math.max(0, state.health / state.maxHealth) * 100}%`;
  shieldFill.style.width = `${Math.max(0, state.shield / state.maxShield) * 100}%`;
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
  showPlayerDamage.vignetteTimer = setTimeout(() => {
    damageVignette.classList.remove('show', 'shield-only');
  }, 190);
  showPlayerDamage.directionTimer = setTimeout(() => {
    damageDirection.classList.remove('show');
  }, 280);
}

function showShieldBreak() {
  shieldBreak.classList.remove('show');
  void shieldBreak.offsetWidth;
  shieldBreak.classList.add('show');
  clearTimeout(showShieldBreak.timer);
  showShieldBreak.timer = setTimeout(() => shieldBreak.classList.remove('show'), 650);
}

function showHit(result) {
  hitMarker.className = result.headshot ? 'show headshot' : 'show';
  damagePop.textContent = `${result.damage}${result.headshot ? ' HEAD' : ''}${result.eliminated ? ' · DOWN' : ''}`;
  damagePop.className = result.headshot ? 'show headshot' : 'show';

  clearTimeout(showHit.markerTimer);
  clearTimeout(showHit.damageTimer);
  showHit.markerTimer = setTimeout(() => { hitMarker.className = ''; }, 95);
  showHit.damageTimer = setTimeout(() => { damagePop.className = ''; }, 420);
}

function pulse(element, className) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  clearTimeout(pulse.timer);
  pulse.timer = setTimeout(() => element.classList.remove(className), 70);
}

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  if (health.alive) {
    const combatFacing = input.pointerLocked && (input.mouseDown(2) || input.mouseDown(0));
    player.update(dt, thirdCam.yaw, combatFacing);
    thirdCam.update(dt, weapon.aiming);
    weapon.update(dt);
  }

  health.update(dt);
  targets.update(dt);
  bot.update(dt, camera);
  renderer.render(scene, camera);

  crosshair.classList.toggle('ads', health.alive && weapon.aiming);
  ammo.textContent = String(weapon.ammo);
  reloadState.textContent = health.alive && weapon.isReloading
    ? `RELOADING ${Math.round(weapon.reloadProgress * 100)}%`
    : '';

  botState.textContent = bot.state;
  botHealth.textContent = String(Math.round(bot.health));

  if (!health.alive) {
    respawnCountdown.textContent = health.respawnTimer.toFixed(1);
  }

  frames += 1;
  fpsTimer += dt;
  if (fpsTimer > 0.5) {
    fps = Math.round(frames / fpsTimer);
    frames = 0;
    fpsTimer = 0;
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    stats.innerHTML = `FPS <b>${fps}</b><br>Speed <b>${speed.toFixed(1)}</b><br>Grounded <b>${player.grounded ? 'YES' : 'NO'}</b><br>State <b>${!health.alive ? 'ELIMINATED' : player.sliding ? 'SLIDE' : player.crouching ? 'CROUCH' : weapon.aiming ? 'ADS' : 'NORMAL'}</b>`;
  }
}
requestAnimationFrame(loop);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
});
