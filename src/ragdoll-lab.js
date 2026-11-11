import * as THREE from 'three';
import { World } from './world.js';
import { PhysicsWorld } from './physics.js';
import { Humanoid } from './humanoid.js';
import { FX } from './fx.js';
import { Debris } from './debris.js';
import { createOrgans } from './organs.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.45;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x172430);
const camera = new THREE.PerspectiveCamera(52, 1, 0.05, 120);

const world = new World(scene, 'pit');
const physics = new PhysicsWorld();
physics.boxes = world.boxes;
const fx = new FX(scene, world);
const debris = new Debris(scene, world, 90);
const organs = createOrgans();

// Bright neutral floor pad for reading foot contact and joint silhouettes.
const pad = new THREE.Mesh(new THREE.BoxGeometry(9, 0.035, 9), new THREE.MeshLambertMaterial({ color: 0x6d7478 }));
pad.position.set(0, 0.018, 0);
pad.receiveShadow = true;
scene.add(pad);
const grid = new THREE.GridHelper(9, 18, 0xa9b8c0, 0x4e5d66);
grid.position.y = 0.04;
scene.add(grid);

const hemi = new THREE.HemisphereLight(0xd9e8ff, 0x554b40, 3.2);
scene.add(hemi);
const ambient = new THREE.AmbientLight(0xffffff, 1.05);
scene.add(ambient);
const key = new THREE.DirectionalLight(0xfff4df, 4.4);
key.position.set(4, 7, 5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -8;
key.shadow.camera.right = 8;
key.shadow.camera.top = 8;
key.shadow.camera.bottom = -8;
key.shadow.camera.near = 0.5;
key.shadow.camera.far = 30;
scene.add(key);
const rim = new THREE.DirectionalLight(0x9fc7ff, 2.2);
rim.position.set(-5, 4, -5);
scene.add(rim);
const fill = new THREE.PointLight(0xffe0ba, 45, 20, 2);
fill.position.set(0, 3.2, 3.2);
scene.add(fill);

let subject = null;
let orbit = 0.72;
let distance = 4.1;
let cameraY = 1.75;
let drag = null;
const playerPos = new THREE.Vector3(6, 0, 6);
const params = new URLSearchParams(location.search);

function makeSubject(armour = false) {
  if (subject) subject.dispose();
  subject = new Humanoid({
    scene,
    world,
    physics,
    fx,
    debris,
    organs,
    position: new THREE.Vector3(0, 0, 0),
    yaw: 0.25,
    armour: !!armour,
  });
  subject.aggressive = false;
  subject.fear = 0;
  subject.state = 'idle';
  subject.stateTimer = 999;
  subject.health = subject.maxHealth;
  subject.gunMesh && (subject.gunMesh.visible = false);
  if (window.__lab) window.__lab.subject = subject;
  return subject;
}

function part(name) {
  return subject.parts.find((p) => p.name === name);
}

function snapshot() {
  if (!subject) return {};
  return {
    mode: subject.physicalMode,
    speed: +subject.speed.toFixed(3),
    pelvis: +subject.bones.pelvis.position.y.toFixed(3),
    chest: +subject.bones.chest.position.y.toFixed(3),
    balance: +subject.balanceError.toFixed(3),
    rise: +subject.recoveryRise.toFixed(3),
    settle: +subject.stableT.toFixed(3),
    startle: +subject.nervous.startle.toFixed(3),
    bodySpeed: +subject.bodySpeed.toFixed(3),
    down: subject.physicalDown,
    canSelfRight: subject.canSelfRight(),
    health: +subject.health.toFixed(1),
    gaitSteps: subject.gaitStepCount,
    footL: subject.bones.lFoot.position.toArray().map((v) => +v.toFixed(3)),
    footR: subject.bones.rFoot.position.toArray().map((v) => +v.toFixed(3)),
    dead: subject.dead,
    elapsed: +subject.time.toFixed(2),
    x: +subject.position.x.toFixed(3),
    z: +subject.position.z.toFixed(3),
  };
}

function run(name) {
  if (name === 'reset') makeSubject();
  if (!subject) return;
  // Every scenario except WALK is an in-place physics test. Freeze AI intent
  // (not the physical controller) so idle wandering cannot contaminate the
  // measured pose. WALK keeps the real AI path.
  if (name !== 'walk') {
    subject.target.copy(subject.position);
    subject.think = () => {};
  }
  subject.fear = 0;
  subject.aggressive = false;
  subject.state = 'idle';
  subject.stateTimer = 999;
  subject.speed = 0;
  subject.attackT = 0;
  if (name === 'stand') {
    subject.target.copy(subject.position);
  } else if (name === 'walk') {
    subject.state = 'walk';
    subject.stateTimer = 999;
    subject.target.set(subject.position.x + 5.5, 0, subject.position.z + 0.8);
  } else if (name === 'run') {
    subject.think = () => {};
    subject.state = 'walk';
    subject.stateTimer = 999;
    subject.yaw = Math.PI / 2;
    subject.forward.set(1, 0, 0);
    subject.right.set(0, 0, -1);
    subject.moveDir.set(1, 0, 0);
    subject.speed = 3.4;
  } else if (name === 'push') {
    const from = new THREE.Vector3(subject.bones.chest.position);
    const dir = new THREE.Vector3(1, 0, 0.2).normalize();
    subject.react(dir, 4, 1.45, from, 'torso');
    subject.nervous.startle = 0.55;
  } else if (name === 'fall') {
    // Exercise the same wound/reflex path as a live rifle round. A physical
    // impulse alone bypasses damage and unfairly lets the body recover.
    const torso = part('torso');
    const from = new THREE.Vector3(subject.bones.chest.position);
    const dir = new THREE.Vector3(1, 0, 0.2).normalize();
    subject.hit(torso, from, dir, 62, 0, 5.6, { velocity: 540, weapon: 'rifle' });
  } else if (name === 'armour') {
    makeSubject(true);
    subject.think = () => {};
    const torso = part('torso');
    const from = new THREE.Vector3(subject.bones.chest.position);
    const dir = new THREE.Vector3(1, 0, 0.2).normalize();
    subject.hit(torso, from, dir, 18, 0.2, 1.8, { velocity: 380, weapon: 'pistol' });
  } else if (name === 'weak') {
    const torso = part('torso');
    const from = new THREE.Vector3(subject.bones.chest.position);
    const dir = new THREE.Vector3(1, 0, 0.2).normalize();
    subject.hit(torso, from, dir, 9, 0, 0.8, { velocity: 360, weapon: 'pistol' });
  } else if (name === 'ground') {
    // Applied while the body is already down: tests secondary impacts without
    // allowing the AI or a scripted reaction to stand it back up.
    const torso = part('torso');
    const from = new THREE.Vector3(subject.bones.chest.position);
    const dir = new THREE.Vector3(-0.8, 0.05, 0.6).normalize();
    subject.hit(torso, from, dir, 16, 0, 2.2, { velocity: 420, weapon: 'pistol' });
  } else if (name === 'crawl1' || name === 'crawl0') {
    const names = name === 'crawl1' ? ['thighR'] : ['thighL', 'thighR'];
    for (const n of names) {
      const p = part(n);
      if (!p || p.destroyed) continue;
      p.mesh.updateMatrixWorld(true);
      subject.breakPart(p, new THREE.Vector3(1, 0, 0), p.mesh.localToWorld(new THREE.Vector3(0, -0.12, 0)));
    }
  } else if (name === 'dead') {
    const chest = new THREE.Vector3(subject.bones.chest.position);
    subject.die(new THREE.Vector3(-0.7, 0.2, 0.4).normalize(), chest, 2.2, 'torso');
  }
}

makeSubject();
document.querySelectorAll('[data-run]').forEach((button) => {
  button.addEventListener('click', () => run(button.dataset.run));
});

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

canvas.addEventListener('pointerdown', (event) => {
  drag = { x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (!drag) return;
  orbit += (event.clientX - drag.x) * 0.008;
  cameraY = Math.max(0.7, Math.min(3.4, cameraY + (event.clientY - drag.y) * 0.006));
  drag = { x: event.clientX, y: event.clientY };
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('wheel', (event) => {
  distance = Math.max(2.2, Math.min(8, distance + event.deltaY * 0.003));
}, { passive: true });

const step = 1 / 60;
let last = performance.now();
let acc = 0;
let statsClock = 0;
const stats = document.getElementById('stats');

function frame(now) {
  const real = Math.min(0.05, (now - last) / 1000);
  last = now;
  acc += real;
  while (acc >= step) {
    subject.update(step, playerPos);
    physics.step(step);
    subject.afterPhysics();
    fx.update(step);
    debris.update(step);
    world.update(step);
    acc -= step;
  }
  const target = subject.bones.chest.position;
  camera.position.set(
    target.x + Math.cos(orbit) * distance,
    cameraY,
    target.z + Math.sin(orbit) * distance,
  );
  camera.lookAt(target.x, target.y + 0.08, target.z);
  key.position.set(target.x + 4, 7, target.z + 5);
  key.target.position.copy(target);
  key.target.updateMatrixWorld();
  statsClock -= real;
  if (statsClock <= 0) {
    statsClock = 0.1;
    const s = snapshot();
    stats.innerHTML = `MODE <b>${s.mode}</b><br>PELVIS <b>${s.pelvis.toFixed(2)}m</b> · SPEED <b>${s.speed.toFixed(2)}</b><br>BALANCE <b>${s.balance.toFixed(2)}</b> · STEPS <b>${s.gaitSteps}</b><br>POS <b>${s.x.toFixed(2)}, ${s.z.toFixed(2)}</b> · DEAD <b>${s.dead}</b>`;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function setCamera(nextOrbit, nextDistance, nextY) {
  orbit = nextOrbit;
  distance = nextDistance;
  cameraY = nextY;
}
window.__lab = { subject, physics, world, run, snapshot, setCamera, setSubject: makeSubject };
const initial = params.get('scenario');
if (initial) run(initial);
requestAnimationFrame(frame);
