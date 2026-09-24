import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { partsData } from './parts.js';

const canvas = document.querySelector('#webgl-canvas');
const ui = {
  status: document.querySelector('#model-status'), loading: document.querySelector('#loading-overlay'),
  loadingText: document.querySelector('#loading-text'), loadingDetail: document.querySelector('#loading-detail'), progress: document.querySelector('#progress-bar'),
  list: document.querySelector('#parts-list'), count: document.querySelector('#part-count'), title: document.querySelector('#part-name'),
  description: document.querySelector('#part-description'), specs: document.querySelector('#part-specs'), note: document.querySelector('#match-note'), viewMode: document.querySelector('#view-mode'),
  autoRotate: document.querySelector('#auto-rotate-button'), reset: document.querySelector('#reset-view-button')
};

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x07111f, 0.025);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.01, 1000);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.06; controls.enablePan = true; controls.minDistance = 1.8; controls.maxDistance = 30; controls.autoRotateSpeed = 1.1;

// GLB 没有携带 Blender 灯光时，以下补光依然能让 PBR 材质清晰可见。
scene.add(new THREE.HemisphereLight(0x8bc7ff, 0x071018, 2.5));
const keyLight = new THREE.DirectionalLight(0xb7e7ff, 3.5); keyLight.position.set(5, 8, 10); scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0xff4964, 2.3); rimLight.position.set(-8, 4, -6); scene.add(rimLight);

const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
const originalMaterials = new Map(); const partObjects = new Map(); const partButtons = new Map();
let modelRoot = null, selectedMeshes = [], initialView = null, focusAnimation = null, pointerDown = null, isolatedPart = null;

function updateLoading(percent, message, detail) {
  ui.progress.style.width = `${Math.max(4, Math.min(100, percent))}%`;
  if (message) ui.loadingText.textContent = message;
  if (detail) ui.loadingDetail.textContent = detail;
}
function showError(message, error) { updateLoading(100, '模型加载失败', message); ui.status.textContent = '错误'; console.error(message, error); }

function buildPartsList() {
  ui.list.replaceChildren(); ui.count.textContent = `${partsData.length} 个模块`;
  partsData.forEach(part => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'part-button';
    button.innerHTML = `${part.displayName}<small>${part.name}</small>`;
    // 索引用于检视单个模块；重复点击同一项则切回全机预览。
    button.addEventListener('click', () => isolatedPart === part ? clearSelection() : selectPart(part, { isolate: true })); ui.list.append(button); partButtons.set(part, button);
  });
}

// 为 MeshStandardMaterial 保存原始自发光参数。材质数组也会逐一处理。
function tintMesh(mesh, enabled) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach(material => {
    if (!material || !('emissive' in material)) return;
    if (!originalMaterials.has(material)) originalMaterials.set(material, { emissive: material.emissive.clone(), intensity: material.emissiveIntensity });
    const original = originalMaterials.get(material);
    // 低强度发光保留原始 PBR 材质层次，避免白色装甲在隔离展示时过曝成纯色。
    if (enabled) material.emissive.copy(original.emissive).lerp(new THREE.Color(0x00bfff), 0.58);
    else material.emissive.copy(original.emissive);
    material.emissiveIntensity = enabled ? Math.max(0.32, original.intensity) : original.intensity;
  });
}
function clearHighlight() { selectedMeshes.forEach(mesh => tintMesh(mesh, false)); selectedMeshes = []; }
function updatePanel(part, matchCount) {
  ui.title.textContent = part.displayName; ui.description.textContent = part.description; ui.specs.replaceChildren();
  Object.entries(part.specs).forEach(([key, value]) => { const item = document.createElement('div'); item.innerHTML = `<dt>${key}</dt><dd>${value}</dd>`; ui.specs.append(item); });
  ui.note.textContent = matchCount ? `已关联 ${matchCount} 个模型网格` : `未找到“${part.name}”。请在 parts.js 修改 name / nodeNames。`;
}
function setActiveButton(part) { partButtons.forEach((button, item) => button.classList.toggle('active', item === part)); }

function focusObject(objects) {
  const box = new THREE.Box3(); objects.forEach(object => box.expandByObject(object)); if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3()); const size = box.getSize(new THREE.Vector3()); const distance = Math.max(size.length() * 1.35, 3.1);
  const direction = camera.position.clone().sub(controls.target).normalize();
  focusAnimation = { fromPosition: camera.position.clone(), fromTarget: controls.target.clone(), toTarget: center, toPosition: center.clone().add(direction.multiplyScalar(distance)), start: performance.now(), duration: 700 };
}
function restoreModelVisibility() {
  if (!modelRoot) return;
  modelRoot.traverse(node => { if (node.isMesh) node.visible = true; });
  isolatedPart = null;
}
function isolateMeshes(objects) {
  const selectedSet = new Set(objects);
  modelRoot.traverse(node => { if (node.isMesh) node.visible = selectedSet.has(node); });
}
function selectPart(part, { isolate = false } = {}) {
  const objects = partObjects.get(part) || []; clearHighlight();
  if (isolate && objects.length) { isolateMeshes(objects); isolatedPart = part; ui.viewMode.textContent = `单独展示：${part.displayName}`; }
  else { restoreModelVisibility(); ui.viewMode.textContent = '全机预览模式'; }
  objects.forEach(mesh => { if (mesh.isMesh) { tintMesh(mesh, true); selectedMeshes.push(mesh); } });
  updatePanel(part, objects.length); setActiveButton(part); if (objects.length) focusObject(objects);
}
function resetView() {
  if (!initialView) return;
  focusAnimation = { fromPosition: camera.position.clone(), fromTarget: controls.target.clone(), toPosition: initialView.position.clone(), toTarget: initialView.target.clone(), start: performance.now(), duration: 800 };
}
function clearSelection() {
  clearHighlight(); restoreModelVisibility(); setActiveButton(null); ui.title.textContent = '等待选择部件'; ui.description.textContent = '点击机体或下方部件列表，查看模块说明、装备与性能数据。';
  ui.specs.innerHTML = '<div><dt>状态</dt><dd>待机</dd></div>'; ui.note.textContent = ''; resetView();
  ui.viewMode.textContent = '全机预览模式';
}
function findPartFromObject(object) {
  let node = object;
  while (node && node !== modelRoot) {
    const found = partsData.find(part => (part.nodeNames || [part.name]).includes(node.name)); if (found) return found;
    node = node.parent;
  }
  return null;
}

function onPointerDown(event) { pointerDown = { x: event.clientX, y: event.clientY }; }
function onPointerUp(event) {
  // 只有移动距离很小的指针操作才视为点击，避免拖动旋转后误选部件。
  if (!pointerDown || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 6 || event.button !== 0 || !modelRoot) return;
  const rect = canvas.getBoundingClientRect(); pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1; pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObject(modelRoot, true)[0];
  if (!hit) return clearSelection(); const part = findPartFromObject(hit.object);
  if (part) selectPart(part); else console.info(`未登记的模型节点：${hit.object.name}。可将它加入 parts.js 的 nodeNames。`);
}

function frameModel(root) {
  const box = new THREE.Box3().setFromObject(root); const center = box.getCenter(new THREE.Vector3()); const size = box.getSize(new THREE.Vector3());
  const distance = Math.max(size.x, size.y, size.z) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.3;
  camera.position.copy(center).add(new THREE.Vector3(distance * .72, distance * .95, distance * 1.42)); controls.target.copy(center); controls.update();
  controls.minDistance = Math.max(1, distance * .25); controls.maxDistance = distance * 4; initialView = { position: camera.position.clone(), target: controls.target.clone() };
}
function registerModel(root) {
  const nodesByName = new Map();
  root.traverse(node => { if (node.name) nodesByName.set(node.name, node); if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
  console.group('GLB 模型节点名称（请用这些名称更新 parts.js）'); [...nodesByName.keys()].forEach(name => console.log(name)); console.groupEnd();
  partsData.forEach(part => {
    // Blender 导出的 glTF 会将空格转为下划线；规范化后仍能兼容手动填写的原始对象名。
    const normalizeNodeName = name => name.replace(/[ _.-]/g, '').toLowerCase();
    const matchedRoots = (part.nodeNames || [part.name]).map(name => nodesByName.get(name) || [...nodesByName.entries()].find(([nodeName]) => normalizeNodeName(nodeName) === normalizeNodeName(name))?.[1]).filter(Boolean); const meshes = [];
    matchedRoots.forEach(rootNode => rootNode.traverse(node => { if (node.isMesh && !meshes.includes(node)) meshes.push(node); }));
    partObjects.set(part, meshes); partButtons.get(part).classList.toggle('unmatched', meshes.length === 0);
    if (!meshes.length) console.warn(`parts.js 未匹配：${part.displayName}，期待节点名 “${part.name}”。请按控制台名称修改。`);
  });
}
function loadModel() {
  updateLoading(5, '正在加载机体模型…', '读取 assets/model.glb');
  new GLTFLoader().load('assets/model.glb', gltf => {
    modelRoot = gltf.scene; scene.add(modelRoot); frameModel(modelRoot); registerModel(modelRoot); ui.status.textContent = '机体在线';
    updateLoading(100, '机体档案已就绪', '点击任意已登记部件开始浏览'); setTimeout(() => ui.loading.classList.add('hidden'), 450);
  }, event => {
    const percent = event.total ? event.loaded / event.total * 100 : 45;
    updateLoading(percent, '正在装配机体数据…', event.total ? `${Math.round(percent)}% / ${Math.round(event.total / 1024)} KB` : '正在接收模型数据');
  }, error => showError('无法读取 assets/model.glb。请确认文件存在，并通过 VSCode Live Server 访问页面；file:// 协议不能加载模块与 GLB。', error));
}
function animate() {
  requestAnimationFrame(animate);
  if (focusAnimation) { const t = Math.min(1, (performance.now() - focusAnimation.start) / focusAnimation.duration); const eased = 1 - Math.pow(1 - t, 3); camera.position.lerpVectors(focusAnimation.fromPosition, focusAnimation.toPosition, eased); controls.target.lerpVectors(focusAnimation.fromTarget, focusAnimation.toTarget, eased); if (t === 1) focusAnimation = null; }
  controls.update(); renderer.render(scene, camera);
}
canvas.addEventListener('pointerdown', onPointerDown); canvas.addEventListener('pointerup', onPointerUp); canvas.addEventListener('contextmenu', event => event.preventDefault());
ui.autoRotate.addEventListener('click', () => { controls.autoRotate = !controls.autoRotate; ui.autoRotate.setAttribute('aria-pressed', String(controls.autoRotate)); ui.autoRotate.textContent = `自动旋转：${controls.autoRotate ? '开' : '关'}`; });
ui.reset.addEventListener('click', clearSelection);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
buildPartsList(); loadModel(); animate();
