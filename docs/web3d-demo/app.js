import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const viewer = document.getElementById('viewer');
const statusEl = document.getElementById('status');
const detailsEl = document.getElementById('details');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x171c22);

const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewer.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.target.set(0, 1.1, 0);
controls.minDistance = 3;
controls.maxDistance = 22;
controls.maxPolarAngle = Math.PI * 0.49;

scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.55));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(4, 8, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(18, 18),
  new THREE.MeshStandardMaterial({ color: 0x20262d, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.035;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(18, 36, 0x58616b, 0x343b43);
grid.position.y = -0.025;
scene.add(grid);

const entities = new Map();
const pickables = [];
const edgeObjects = [];
let selectedEntityId = null;
let model = null;
let edgesVisible = true;

function materialFor(type) {
  if (type === 'window') {
    return new THREE.MeshPhysicalMaterial({
      color: 0x80cfff,
      transparent: true,
      opacity: 0.42,
      roughness: 0.12,
      metalness: 0,
      transmission: 0.15
    });
  }
  if (type === 'door') {
    return new THREE.MeshStandardMaterial({ color: 0xa87c53, roughness: 0.72 });
  }
  if (type === 'floor') {
    return new THREE.MeshStandardMaterial({ color: 0xc7c2b8, roughness: 0.9 });
  }
  return new THREE.MeshStandardMaterial({ color: 0xe8e5dd, roughness: 0.82 });
}

function registerMesh(mesh, entity, extra = {}) {
  mesh.castShadow = entity.type !== 'window';
  mesh.receiveShadow = true;
  mesh.userData.entityId = entity.id;
  mesh.userData.entityType = entity.type;
  mesh.userData.baseColor = mesh.material.color?.getHex?.();
  Object.assign(mesh.userData, extra);

  if (!entities.has(entity.id)) {
    entities.set(entity.id, { data: entity, meshes: [] });
  }
  entities.get(entity.id).meshes.push(mesh);
  pickables.push(mesh);
  scene.add(mesh);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color: 0x2f3740, transparent: true, opacity: 0.55 })
  );
  edges.position.copy(mesh.position);
  edges.rotation.copy(mesh.rotation);
  edges.scale.copy(mesh.scale);
  edges.userData.follow = mesh;
  edgeObjects.push(edges);
  scene.add(edges);
}

function addWallBlock(side, centerU, span, yCenter, blockHeight, wall) {
  if (span <= 0.001 || blockHeight <= 0.001) return;

  const room = model.room;
  const t = room.wallThickness;
  let geometry;
  const mesh = new THREE.Mesh(undefined, materialFor('wall'));

  if (side === 'north' || side === 'south') {
    geometry = new THREE.BoxGeometry(span, blockHeight, t);
    mesh.geometry = geometry;
    mesh.position.set(centerU, yCenter, side === 'north' ? -room.depth / 2 : room.depth / 2);
  } else {
    geometry = new THREE.BoxGeometry(t, blockHeight, span);
    mesh.geometry = geometry;
    mesh.position.set(side === 'east' ? room.width / 2 : -room.width / 2, yCenter, centerU);
  }

  registerMesh(mesh, wall, { side });
}

function addOpeningMesh(side, opening, wall) {
  const room = model.room;
  const thickness = opening.type === 'window' ? 0.045 : 0.055;
  const material = materialFor(opening.type);
  let geometry;
  const mesh = new THREE.Mesh(undefined, material);
  const y = opening.sill + opening.height / 2;

  if (side === 'north' || side === 'south') {
    geometry = new THREE.BoxGeometry(opening.width, opening.height, thickness);
    mesh.geometry = geometry;
    const z = side === 'north' ? -room.depth / 2 : room.depth / 2;
    mesh.position.set(opening.center, y, z);
  } else {
    geometry = new THREE.BoxGeometry(thickness, opening.height, opening.width);
    mesh.geometry = geometry;
    const x = side === 'east' ? room.width / 2 : -room.width / 2;
    mesh.position.set(x, y, opening.center);
  }

  const entity = {
    ...opening,
    wallId: wall.id,
    side,
    parentLabel: wall.label
  };
  registerMesh(mesh, entity, { side, wallId: wall.id });
}

function buildWall(wall) {
  const room = model.room;
  const side = wall.side;
  const length = (side === 'north' || side === 'south') ? room.width : room.depth;
  const H = room.height;
  const openings = wall.openings || [];

  if (openings.length === 0) {
    addWallBlock(side, 0, length, H / 2, H, wall);
    return;
  }

  // Demo: supporto generale per aperture non sovrapposte lungo la parete.
  const sorted = [...openings].sort((a, b) => a.center - b.center);
  let cursor = -length / 2;

  for (const op of sorted) {
    const left = op.center - op.width / 2;
    const right = op.center + op.width / 2;

    if (left > cursor) {
      addWallBlock(side, (cursor + left) / 2, left - cursor, H / 2, H, wall);
    }

    if (op.sill > 0) {
      addWallBlock(side, op.center, op.width, op.sill / 2, op.sill, wall);
    }

    const topStart = op.sill + op.height;
    if (topStart < H) {
      addWallBlock(side, op.center, op.width, (topStart + H) / 2, H - topStart, wall);
    }

    addOpeningMesh(side, op, wall);
    cursor = Math.max(cursor, right);
  }

  if (cursor < length / 2) {
    addWallBlock(side, (cursor + length / 2) / 2, length / 2 - cursor, H / 2, H, wall);
  }
}

function buildFloor(entity) {
  const room = model.room;
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(room.width, 0.08, room.depth),
    materialFor('floor')
  );
  floor.position.y = -0.04;
  registerMesh(floor, entity);
}

function buildModel() {
  for (const entity of model.entities) {
    if (entity.type === 'wall') buildWall(entity);
    if (entity.type === 'floor') buildFloor(entity);
  }
}

function setIsometric() {
  camera.up.set(0, 1, 0);
  camera.position.set(7.2, 5.8, 7.2);
  controls.target.set(0, 1.1, 0);
  controls.update();
}

function setTop() {
  camera.up.set(0, 0, -1);
  camera.position.set(0, 11.5, 0.01);
  controls.target.set(0, 0, 0);
  controls.update();
}

function clearSelection() {
  for (const entry of entities.values()) {
    for (const mesh of entry.meshes) {
      if (mesh.material.emissive) mesh.material.emissive.setHex(0x000000);
    }
  }
  selectedEntityId = null;
}

function selectEntity(id) {
  clearSelection();
  const entry = entities.get(id);
  if (!entry) return;
  selectedEntityId = id;

  for (const mesh of entry.meshes) {
    if (mesh.material.emissive) mesh.material.emissive.setHex(0x31506b);
  }

  const d = entry.data;
  const rows = [];
  const add = (k, v) => {
    if (v !== undefined && v !== null && v !== '') rows.push(`<div class="row"><span class="key">${k}</span><strong>${v}</strong></div>`);
  };

  add('ID', d.id);
  add('Tipo', d.type);
  add('Nome', d.label || d.name);
  add('Parete', d.wallId);
  add('Lato', d.side);
  add('Stratigrafia', d.stratigraphy);
  if (d.width) add('Larghezza', `${d.width.toFixed(2)} m`);
  if (d.height) add('Altezza', `${d.height.toFixed(2)} m`);
  if (d.sill !== undefined) add('Davanzale', `${d.sill.toFixed(2)} m`);

  detailsEl.innerHTML = rows.join('');
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(pickables, false)[0];
  if (hit?.object?.userData?.entityId) selectEntity(hit.object.userData.entityId);
});

function resize() {
  const w = viewer.clientWidth;
  const h = viewer.clientHeight;
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

window.addEventListener('resize', resize);
document.getElementById('btnIso').addEventListener('click', setIsometric);
document.getElementById('btnTop').addEventListener('click', setTop);
document.getElementById('btnReset').addEventListener('click', () => {
  clearSelection();
  detailsEl.textContent = 'Tocca una parete, il pavimento, una porta o una finestra.';
  setIsometric();
});
document.getElementById('btnWire').addEventListener('click', () => {
  edgesVisible = !edgesVisible;
  for (const e of edgeObjects) e.visible = edgesVisible;
});

async function init() {
  try {
    const response = await fetch('./project.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`project.json: HTTP ${response.status}`);
    model = await response.json();
    buildModel();
    setIsometric();
    resize();
    statusEl.textContent = `${model.project} · ${model.entities.length} entità`;
  } catch (error) {
    console.error(error);
    statusEl.textContent = 'errore caricamento';
    detailsEl.textContent = error.message;
  }
}

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

init();
