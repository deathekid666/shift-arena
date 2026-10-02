import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { InputController } from './input.js';
import { TestWorld } from './world.js';
import { PlayerController } from './player.js';
import { ThirdPersonCamera } from './camera.js';

const root = document.querySelector('#app');
root.innerHTML = `
  <div id="hud">
    <div id="crosshair"></div>
    <div id="stats"></div>
    <div id="controls">WASD move · Shift sprint · Ctrl crouch/slide · Space jump · Mouse look · Esc unlock</div>
    <div id="touch-note">Touch device detected. Mobile controls arrive after desktop controller validation.</div>
    <div id="start">
      <div id="start-card">
        <h1>SHIFT Arena — Build 001</h1>
        <p>Movement + third-person camera sandbox. No weapons, bots, accounts or multiplayer yet.</p>
        <button type="button">ENTER TEST ARENA</button>
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

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  player.update(dt, thirdCam.yaw);
  thirdCam.update(dt);
  renderer.render(scene, camera);

  frames += 1;
  fpsTimer += dt;
  if (fpsTimer > 0.5) {
    fps = Math.round(frames / fpsTimer);
    frames = 0;
    fpsTimer = 0;
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    stats.innerHTML = `FPS <b>${fps}</b><br>Speed <b>${speed.toFixed(1)}</b><br>Grounded <b>${player.grounded ? 'YES' : 'NO'}</b><br>State <b>${player.sliding ? 'SLIDE' : player.crouching ? 'CROUCH' : 'NORMAL'}</b>`;
  }
}
requestAnimationFrame(loop);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
});
