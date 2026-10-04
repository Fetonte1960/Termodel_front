import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/*
 * CENED Bridge 3D Viewer
 * Derivato selettivamente dal renderer Three.js di Termodel Web:
 * camera prospettica, OrbitControls, raycasting, fit scena e spigoli.
 * Nessuna funzione CAD/editing viene riutilizzata.
 */

let active = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function disposeActive() {
  if (!active) return;
  try { active.ro?.disconnect(); } catch (_) {}
  try { active.controls?.dispose(); } catch (_) {}
  try { active.renderer?.dispose(); } catch (_) {}
  if (active.raf) cancelAnimationFrame(active.raf);
  active = null;
}

function toThreePoint(p) {
  // gbXML: X Est, Y Nord, Z alto.
  // Three.js: X orizzontale, Y alto, Z profondità.
  return new THREE.Vector3(p.x, p.z, -p.y);
}

function polygonArea(points) {
  if (!points || points.length < 3) return 0;
  const origin = new THREE.Vector3(points[0].x, points[0].y, points[0].z);
  let area = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const a = new THREE.Vector3(points[i].x, points[i].y, points[i].z).sub(origin);
    const b = new THREE.Vector3(points[i + 1].x, points[i + 1].y, points[i + 1].z).sub(origin);
    area += a.cross(b).length() * 0.5;
  }
  return area;
}

function materialFor(entity) {
  if (entity.kind === 'opening') {
    return new THREE.MeshPhysicalMaterial({
      color: 0x68bde7,
      transparent: true,
      opacity: 0.76,
      roughness: 0.2,
      metalness: 0,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3
    });
  }

  if (entity.kind === 'shade') {
    const color = entity.classification === 'Ostruzione esterna remota'
      ? 0xc24b3a
      : entity.classification === 'Setto verticale'
        ? 0xd7aa35
        : 0xdf7f32;
    return new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity: entity.classification === 'Ostruzione esterna remota' ? 0.56 : 0.82,
      roughness: 0.72,
      side: THREE.DoubleSide
    });
  }

  if (entity.surfaceType === 'Roof') {
    return new THREE.MeshStandardMaterial({
      color: 0x9ca7ae,
      transparent: true,
      opacity: 0.52,
      roughness: 0.85,
      side: THREE.DoubleSide
    });
  }

  if (entity.surfaceType === 'SlabOnGrade') {
    return new THREE.MeshStandardMaterial({
      color: 0xb8b2a5,
      transparent: true,
      opacity: 0.62,
      roughness: 0.92,
      side: THREE.DoubleSide
    });
  }

  return new THREE.MeshStandardMaterial({
    color: 0xc7d0d5,
    transparent: true,
    opacity: 0.42,
    roughness: 0.82,
    side: THREE.DoubleSide
  });
}

function createPolygonGeometry(points) {
  const verts = points.map(toThreePoint);
  const positions = [];
  for (const p of verts) positions.push(p.x, p.y, p.z);

  const indices = [];
  for (let i = 1; i < verts.length - 1; i++) indices.push(0, i, i + 1);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function detailsHtml(entity) {
  if (!entity) return '<div class="viewer-empty">Seleziona una superficie o una finestra.</div>';
  const rows = [];
  const add = (k, v) => {
    if (v !== undefined && v !== null && v !== '') {
      rows.push('<div class="viewer-row"><span>' + escapeHtml(k) + '</span><b>' + escapeHtml(v) + '</b></div>');
    }
  };

  add('ID', entity.id);
  add('Fonte', entity.source || 'gbXML');
  add('Tipo', entity.kind === 'shade' ? 'Shade' : entity.kind === 'opening' ? 'Opening' : entity.surfaceType || 'Surface');
  add('Classificazione Bridge', entity.classification);
  add('Nome', entity.name);
  add('Superficie host', entity.hostSurfaceId);
  if (entity.area != null) add('Area geometrica', entity.area.toFixed(2) + ' m²');
  if (entity.depth != null) add('Profondità', entity.depth.toFixed(2) + ' m');
  if (entity.height != null) add('Altezza', entity.height.toFixed(2) + ' m');
  if (entity.width != null) add('Larghezza', entity.width.toFixed(2) + ' m');
  if (entity.distance != null) add('Distanza involucro', entity.distance.toFixed(2) + ' m');
  if (entity.affectedOpenings?.length) add('Aperture associate', entity.affectedOpenings.join(', '));

  return rows.join('');
}

function mount(containerId, geometryModel) {
  disposeActive();

  const container = document.getElementById(containerId);
  if (!container) return;

  if (!geometryModel || !geometryModel.entities?.length) {
    container.innerHTML = '<div class="viewer-placeholder">Importa un file gbXML per visualizzare la geometria 3D. L’XML nazionale non genera geometria mancante.</div>';
    const details = document.getElementById('viewerDetails');
    if (details) details.innerHTML = detailsHtml(null);
    return;
  }

  container.innerHTML = '';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b2228);

  const camera = new THREE.PerspectiveCamera(44, 1, 0.05, 2000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = false;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 0.5;
  controls.maxDistance = 500;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x33404a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.position.set(10, 18, 12);
  scene.add(sun);

  const root = new THREE.Group();
  scene.add(root);

  const pickables = [];
  const edges = [];
  const bbox = new THREE.Box3();

  for (const entity of geometryModel.entities) {
    if (!entity.points || entity.points.length < 3) continue;
    const geometry = createPolygonGeometry(entity.points);
    const material = materialFor(entity);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.entity = entity;
    mesh.renderOrder = entity.kind === 'opening' ? 3 : entity.kind === 'shade' ? 2 : 1;
    root.add(mesh);
    pickables.push(mesh);

    const line = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0x27333b, transparent: true, opacity: 0.78 })
    );
    line.renderOrder = 4;
    root.add(line);
    edges.push(line);

    geometry.computeBoundingBox();
    if (geometry.boundingBox) bbox.union(geometry.boundingBox);
  }

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  bbox.getSize(size);
  bbox.getCenter(center);
  const span = Math.max(size.x, size.y, size.z, 1);

  const gridSize = Math.max(20, Math.ceil(span * 2.5));
  const grid = new THREE.GridHelper(gridSize, Math.min(80, Math.max(20, gridSize * 2)), 0x52606a, 0x333f47);
  grid.position.y = bbox.min.y - 0.02;
  scene.add(grid);

  const details = document.getElementById('viewerDetails');
  if (details) details.innerHTML = detailsHtml(null);

  function fitIso() {
    camera.up.set(0, 1, 0);
    controls.target.copy(center);
    camera.position.set(center.x + span * 1.25, center.y + span * 0.9, center.z + span * 1.25);
    camera.near = Math.max(0.02, span / 500);
    camera.far = Math.max(200, span * 40);
    camera.updateProjectionMatrix();
    controls.update();
  }

  function fitTop() {
    camera.up.set(0, 0, -1);
    controls.target.copy(center);
    camera.position.set(center.x, center.y + span * 2.2, center.z + 0.01);
    camera.updateProjectionMatrix();
    controls.update();
  }

  fitIso();

  let selected = null;
  function clearSelection() {
    if (selected?.material?.emissive) selected.material.emissive.setHex(0x000000);
    selected = null;
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  renderer.domElement.addEventListener('pointerdown', (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];

    clearSelection();
    if (!hit) {
      if (details) details.innerHTML = detailsHtml(null);
      return;
    }

    selected = hit.object;
    if (selected.material?.emissive) selected.material.emissive.setHex(0x294c62);
    if (details) details.innerHTML = detailsHtml(selected.userData.entity);
  });

  let wireVisible = true;
  const btnIso = document.getElementById('viewerIso');
  const btnTop = document.getElementById('viewerTop');
  const btnWire = document.getElementById('viewerWire');
  const btnReset = document.getElementById('viewerReset');
  if (btnIso) btnIso.onclick = fitIso;
  if (btnTop) btnTop.onclick = fitTop;
  if (btnWire) btnWire.onclick = () => {
    wireVisible = !wireVisible;
    for (const e of edges) e.visible = wireVisible;
  };
  if (btnReset) btnReset.onclick = () => {
    clearSelection();
    if (details) details.innerHTML = detailsHtml(null);
    fitIso();
  };

  function resize() {
    const w = Math.max(container.clientWidth, 1);
    const h = Math.max(container.clientHeight, 1);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  let raf = 0;
  function animate() {
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(animate);
    if (active) active.raf = raf;
  }

  active = { renderer, controls, ro, raf: 0 };
  animate();
}

window.Cened3D = {
  mount,
  dispose: disposeActive,
  polygonArea
};
