import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { InputController } from './input.js';
import { TestWorld } from './world.js';
import { PlayerController } from './player.js';
import { ThirdPersonCamera } from './camera.js';
import { TargetRange } from './targets.js';
import { TacticalAR } from './weapon.js';

const root = document.querySelector('#app');
root.innerHTML = `
  <div id="hud">
    <div id="crosshair"><span></span></div>
    <div id="hit-marker"></div>
    <div id="damage-pop"></div>
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
        <div class="build-tag">BUILD 002</div>
        <h1>SHIFT Arena</h1>
        <p>Third-person aiming + Tactical AR test range. Targets have separate body and head hit zones.</p>
        <button type="button">ENTER TEST RANGE</button>
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

const weapon = new TacticalAR({
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

  const combatFacing = input.pointerLocked && (input.mouseDown(2) || input.mouseDown(0));
  player.update(dt, thirdCam.yaw, combatFacing);
  thirdCam.update(dt, weapon.aiming);
  weapon.update(dt);
  targets.update(dt);
  renderer.render(scene, camera);

  crosshair.classList.toggle('ads', weapon.aiming);
  ammo.textContent = String(weapon.ammo);
  reloadState.textContent = weapon.isReloading
    ? `RELOADING ${Math.round(weapon.reloadProgress * 100)}%`
    : '';

  frames += 1;
  fpsTimer += dt;
  if (fpsTimer > 0.5) {
    fps = Math.round(frames / fpsTimer);
    frames = 0;
    fpsTimer = 0;
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    stats.innerHTML = `FPS <b>${fps}</b><br>Speed <b>${speed.toFixed(1)}</b><br>Grounded <b>${player.grounded ? 'YES' : 'NO'}</b><br>State <b>${player.sliding ? 'SLIDE' : player.crouching ? 'CROUCH' : weapon.aiming ? 'ADS' : 'NORMAL'}</b>`;
  }
}
requestAnimationFrame(loop);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
});
