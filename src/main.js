import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { InputController } from './input.js';
import { TestWorld } from './world.js';
import { PlayerController } from './player.js';
import { ThirdPersonCamera } from './camera.js';
import { TargetRange } from './targets.js';
import { WeaponSystem } from './weapon.js';
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
      BUILD 006 · 7-WEAPON BALANCE TEST · KEYS <b>1–7</b>
    </div>

    <div id="bot-debug">
      BOT <b id="bot-state">IDLE</b> · HP <b id="bot-health">100</b>
    </div>

    <div id="stats"></div>

    <div id="weapon-bar">
      <div class="weapon-slot active" data-slot="1"><b>1</b><span>TAC AR</span></div>
      <div class="weapon-slot" data-slot="2"><b>2</b><span>MECH AR</span></div>
      <div class="weapon-slot" data-slot="3"><b>3</b><span>TAC SG</span></div>
      <div class="weapon-slot" data-slot="4"><b>4</b><span>PUMP</span></div>
      <div class="weapon-slot" data-slot="5"><b>5</b><span>SNIPER</span></div>
      <div class="weapon-slot" data-slot="6"><b>6</b><span>COMPACT</span></div>
      <div class="weapon-slot" data-slot="7"><b>7</b><span>LONG SMG</span></div>
    </div>

    <div id="weapon-hud">
      <div id="weapon-name" class="weapon-name">TACTICAL AR</div>
      <div id="weapon-role" class="weapon-role">FAST CLOSE–MID</div>
      <div><span id="ammo">30</span><span id="mag-size" class="reserve"> / 30</span></div>
      <div id="weapon-statline">DMG 22 · 7.0 RPS</div>
      <div id="reload-state"></div>
    </div>

    <div id="controls">1–7 weapons · WASD move · LMB fire · RMB ADS · R reload · Shift sprint · Ctrl crouch/slide · Space jump</div>
    <div id="touch-note">Touch device detected. Mobile combat controls will be added in the dedicated mobile-input phase.</div>

    <div id="start">
      <div id="start-card">
        <div class="build-tag">BUILD 006</div>
        <h1>SHIFT Arena</h1>
        <p>Seven-weapon balance test in the giant kitchen. Switch with keys 1–7 and compare damage, fire rate, recoil, range, magazine size and ADS behavior.</p>
        <button type="button">ENTER WEAPON TEST</button>
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
const hitMarker = document.querySelector('#hit-marker');
const damagePop = document.querySelector('#damage-pop');
const ammo = document.querySelector('#ammo');
const magSize = document.querySelector('#mag-size');
const weaponName = document.querySelector('#weapon-name');
const weaponRole = document.querySelector('#weapon-role');
const weaponStatline = document.querySelector('#weapon-statline');
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
const weaponSlots = [...document.querySelectorAll('.weapon-slot')];

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

weapon = new WeaponSystem({
  scene,
  camera,
  cameraRig: thirdCam,
  player,
  input,
  world,
  targets,
  onFire: () => pulse(crosshair, 'shot'),
  onHit: (result) => showHit(result),
  onSwitch: updateWeaponHud
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

function updateWeaponHud(info) {
  if (!weaponName) return;
  weaponName.textContent = info.name;
  weaponRole.textContent = info.role;
  weaponStatline.textContent = `DMG ${info.damage} · ${info.fireRate.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} RPS`;
  magSize.textContent = ` / ${info.magazineSize}`;
  weaponSlots.forEach((slot) => {
    slot.classList.toggle('active', Number(slot.dataset.slot) === info.slot);
  });
}

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
  damagePop.textContent = `${Math.round(result.damage)}${result.headshot ? ' HEAD' : ''}${result.eliminated ? ' · DOWN' : ''}`;
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
    weapon.updateSelection();
    thirdCam.update(dt, weapon.aiming, weapon.adsFov);
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

  if (!health.alive) respawnCountdown.textContent = health.respawnTimer.toFixed(1);

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
