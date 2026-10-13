/**
 * 3D 沙盘（Three.js + GLTFLoader）
 *
 * 坐标换算（README 已给定义）：
 *   Blender/JSON 平面坐标 (x 向东, y 向北)  →  模型单位 = 米 ÷ 500
 *   Three.js 坐标 = [ x/500, 高度, -y/500 ]   （glTF 中 Z 轴朝南）
 *
 * 职责边界：只负责场景渲染、点选拾取与路线可视化；
 * 不读写数据、不修改 DOM 结构（只操作自己的容器与画布）。
 */
import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/three/loaders/GLTFLoader.js';
import { OrbitControls } from '../../vendor/three/controls/OrbitControls.js';
import { CONFIG } from '../config.js';

const { scale: S, markerHeight: MARKER_Y, routeHeight: ROUTE_Y, url: MODEL_URL } = CONFIG.MODEL;

/** 米坐标 → Three.js 坐标 */
export const toScene = (x, y, height = MARKER_Y) => new THREE.Vector3(x / S, height, -y / S);

const PIN_STYLE = {
  poi:      { color: 0xE0B863, emissive: 0x6B4B12, radius: 0.013 },
  junction: { color: 0x2C5C93, emissive: 0x0E2540, radius: 0.0095 },
  entry:    { color: 0x0F2E5C, emissive: 0x081729, radius: 0.0115 },
};

/** 生成一个圆形徽标贴图：type 决定内部图形，颜色按节点类型区分 */
function badgeSprite(type, color) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 9;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  if (type === 'poi') {
    // 五角星
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const ang = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 === 0 ? r * 0.62 : r * 0.27;
      const x = cx + Math.cos(ang) * rad;
      const y = cy + Math.sin(ang) * rad;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  } else if (type === 'junction') {
    // 菱形
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.62);
    ctx.lineTo(cx + r * 0.62, cy);
    ctx.lineTo(cx, cy + r * 0.62);
    ctx.lineTo(cx - r * 0.62, cy);
    ctx.closePath();
    ctx.fill();
  } else {
    // 方形（出入口）
    const s = r * 0.52;
    ctx.fillRect(cx - s, cy - s, s * 2, s * 2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** 生成序号标牌贴图（CanvasTexture，避免引入字体资源） */
function numberSprite(text, color = '#C8102E') {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 66px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(text), size / 2, size / 2 + 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class Map3D {
  constructor(container) {
    this.container = container;
    this.nodes = [];
    this.roads = [];
    this.onPick = null;
    this.pins = new Map();      // node_id → Object3D
    this.pickables = [];        // 参与拾取的对象
    this.routeGroup = null;
    this.highlighted = null;
    this.ready = false;
    this.disposed = false;
    this._focusTarget = null;
    this._raf = null;
  }

  /** 初始化场景并加载 GLB；失败时抛出错误，由调用方决定兜底策略 */
  async init({ nodes, roads, onPick }) {
    this.nodes = nodes;
    this.roads = roads;
    this.onPick = onPick;

    // 容器可能尚处于 hidden（display:none）状态，宽高为 0；
    // 此时必须给出兜底尺寸，否则画布会被建成 1×1 像素而完全看不见。
    const w = Math.max(this.container.clientWidth || 0, 320);
    const h = Math.max(this.container.clientHeight || 0, 240);
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      throw Object.assign(new Error('当前浏览器或设备不支持 WebGL，已切换为平面图。'), { code: 'NO_WEBGL' });
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xE9F1F8);

    this.camera = new THREE.PerspectiveCamera(45, Math.max(w, 1) / Math.max(h, 1), 0.01, 200);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.4;
    this.controls.maxDistance = 5;
    this.controls.minPolarAngle = 0.05;
    this.controls.maxPolarAngle = 1.36;   // 不允许钻到地面以下
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = false;

    // 光照：半球光打底 + 主方向光定形，暗部再补一盏反向弱光
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8FA6BE, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.45);
    key.position.set(1.4, 2.2, 1.2);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.45);
    fill.position.set(-1.4, 1.2, -1.4);
    this.scene.add(fill);

    // 加载 GLB
    const gltf = await new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(
        MODEL_URL,
        resolve,
        undefined,
        (err) => reject(Object.assign(new Error('三维模型加载失败，已切换为平面图。'), { code: 'MODEL_FAIL', cause: err })),
      );
    });

    this.model = gltf.scene;
    this.model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
        if (o.userData?.node_id || o.userData?.from) this.pickables.push(o);
        // 让路网与地面稍微抬离底座，避免 z-fighting
        if (typeof o.material?.polygonOffsetFactor === 'number') o.material.polygonOffset = true;
      }
    });
    this.scene.add(this.model);

    this._buildPins();
    this.setView('iso', 0);
    this.ready = true;

    this._bindResize();
    this._bindPick();
    this._loop();
    return this;
  }

  /** 在节点位置放可点选的三维标记：立杆 + 始终朝向相机、不被建筑遮挡的圆形徽标 */
  _buildPins() {
    this.pinGroup = new THREE.Group();
    this.pinGroup.name = 'pins';
    this.scene.add(this.pinGroup);

    // 标记抬到示意沙盘里被夸大的建筑之上，保证一眼可见
    const PIN_H = 0.07;
    const stemGeo = new THREE.CylinderGeometry(0.0022, 0.0022, PIN_H, 6);
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x46617F, roughness: 0.6, transparent: true, opacity: 0.85 });

    for (const n of this.nodes) {
      const style = PIN_STYLE[n.type] ?? PIN_STYLE.poi;
      const g = new THREE.Group();
      g.position.copy(toScene(n.x_m, n.y_m, MARKER_Y));   // 组原点落在地面
      g.userData.node_id = n.node_id;

      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.y = PIN_H / 2;
      g.add(stem);

      // 地面投影环，帮助判断标记落在哪条路上
      const base = new THREE.Mesh(
        new THREE.RingGeometry(style.radius * 0.9, style.radius * 1.6, 20),
        new THREE.MeshBasicMaterial({ color: style.color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }),
      );
      base.rotation.x = -Math.PI / 2;
      base.position.y = 0.0012;
      g.add(base);

      // 徽标：depthTest 关闭 + 高 renderOrder，确保不被沙盘建筑遮挡
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: badgeSprite(n.type, `#${style.color.toString(16).padStart(6, '0')}`),
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }));
      sprite.position.y = PIN_H;
      sprite.scale.setScalar(0.07);
      sprite.renderOrder = 20;
      sprite.userData.node_id = n.node_id;
      g.add(sprite);

      // 透明碰撞体：手指/鼠标点击更容易命中
      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(0.028, 10, 8),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      hit.position.y = PIN_H;
      hit.userData.node_id = n.node_id;
      g.add(hit);

      this.pins.set(n.node_id, { group: g, head: sprite, base, style });
      this.pinGroup.add(g);
      this.pickables.push(sprite, hit);
    }
  }

  /** 绘制推荐路线：管状折线 + 方向箭头 + 序号标牌 */
  setRoute(route) {
    this.clearRoute();
    if (!route?.geometry?.length) return;

    const g = new THREE.Group();
    g.name = 'route';
    this.routeGroup = g;
    this.scene.add(g);

    // 1) 管状路线（比 Line 更粗、更容易看清）
    const pts = route.geometry.map((p) => toScene(p[0], p[1], ROUTE_Y));
    if (pts.length >= 2) {
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, Math.max(32, pts.length * 10), 0.0085, 10, false),
        new THREE.MeshStandardMaterial({ color: 0xC8102E, emissive: 0x4A0A12, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.1 }),
      );
      g.add(tube);
      const glow = new THREE.Mesh(
        new THREE.TubeGeometry(curve, Math.max(32, pts.length * 10), 0.0135, 10, false),
        new THREE.MeshBasicMaterial({ color: 0xFF5A6E, transparent: true, opacity: 0.18 }),
      );
      g.add(glow);
    }

    // 2) 每段中点放方向箭头（用 ConeGeometry 指向行进方向）
    for (const leg of route.legs ?? []) {
      const seg = leg.geometry ?? [];
      if (seg.length < 2) continue;
      const mid = seg[Math.floor(seg.length / 2)];
      const next = seg[Math.min(seg.length - 1, Math.floor(seg.length / 2) + 1)];
      const a = toScene(mid[0], mid[1], ROUTE_Y + 0.006);
      const b = toScene(next[0], next[1], ROUTE_Y + 0.006);
      const dir = b.clone().sub(a);
      if (dir.lengthSq() < 1e-9) continue;
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.014, 0.032, 12),
        new THREE.MeshStandardMaterial({ color: 0xFFFFFF, emissive: 0x8a8a8a, emissiveIntensity: 0.3, roughness: 0.5 }),
      );
      cone.position.copy(a);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      g.add(cone);
    }

    // 3) 景点序号标牌
    for (const stop of route.stops ?? []) {
      const n = this.nodes.find((x) => x.node_id === stop.node_id);
      if (!n) continue;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: numberSprite(stop.seq),
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }));
      sprite.position.copy(toScene(n.x_m, n.y_m, MARKER_Y + 0.14));   // 叠在类型徽标之上
      sprite.scale.set(0.058, 0.058, 1);
      sprite.renderOrder = 10;
      g.add(sprite);
    }
  }

  clearRoute() {
    if (!this.routeGroup) return;
    this.scene.remove(this.routeGroup);
    this.routeGroup.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material) {
        o.material.map?.dispose?.();
        o.material.dispose?.();
      }
    });
    this.routeGroup = null;
  }

  /** 高亮节点（徽标放大 + 地面环加深）；传 null 取消全部高亮 */
  highlight(nodeId) {
    for (const [id, pin] of this.pins) {
      const on = id === nodeId;
      pin.head.scale.setScalar(on ? 0.115 : 0.07);
      pin.head.material.opacity = on ? 1 : 0.9;
      pin.base.material.opacity = on ? 0.95 : 0.45;
      pin.base.scale.setScalar(on ? 1.6 : 1);
    }
    this.highlighted = nodeId;
  }

  /** 视角切换：iso 斜视 / top 俯视 */
  setView(kind = 'iso', duration = 600) {
    const W = 862.6432 / S;
    const H = 834.8962 / S;
    const radius = (Math.max(W, H) / 2) * 1.08;
    const dist = (radius / Math.tan((this.camera.fov * Math.PI) / 360)) * 1.03;
    const dir = kind === 'top' ? new THREE.Vector3(0, 1, 0.0001) : new THREE.Vector3(0, 0.80, 0.60);
    const target = new THREE.Vector3(0, 0.01, 0);
    const position = target.clone().add(dir.normalize().multiplyScalar(dist));
    this._animateTo(target, position, duration);
  }

  /** 相机对准某个节点 */
  focusNode(nodeId, duration = 700) {
    const pin = this.pins.get(nodeId);
    if (!pin) return;
    const target = pin.group.position.clone();
    const offset = this.camera.position.clone().sub(this.controls.target);
    const len = Math.max(0.55, Math.min(offset.length(), 1.0));
    const position = target.clone().add(offset.normalize().multiplyScalar(len));
    this._animateTo(target, position, duration);
  }

  _animateTo(target, position, duration) {
    if (!duration) {
      this.controls.target.copy(target);
      this.camera.position.copy(position);
      this.controls.update();
      return;
    }
    this._focus = {
      t0: performance.now(),
      duration,
      fromTarget: this.controls.target.clone(),
      toTarget: target,
      fromPos: this.camera.position.clone(),
      toPos: position,
    };
  }

  _bindResize() {
    this._onResize = () => {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      if (!w || !h) return;   // 仍处于隐藏状态（切到其它页面），切回时会再次触发
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      // updateStyle 保持默认 true：容器从隐藏恢复显示后，画布样式尺寸必须同步刷新
      this.renderer.setSize(w, h);
    };
    window.addEventListener('resize', this._onResize);
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(this._onResize);
      this._ro.observe(this.container);
    }
  }

  _bindPick() {
    const el = this.renderer.domElement;
    let down = null;
    el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    el.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const elapsed = performance.now() - down.t;
      down = null;
      if (moved > 6 || elapsed > 700) return;   // 拖动旋转 / 长按不算点击
      this._pick(e);
    });
    el.style.touchAction = 'none';
  }

  _pick(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster = this.raycaster ?? new THREE.Raycaster();
    this.raycaster.setFromCamera(pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, true);
    for (const h of hits) {
      let o = h.object;
      while (o) {
        if (o.userData?.node_id) { this.onPick?.(o.userData.node_id); return; }
        o = o.parent;
      }
    }
    this.onPick?.(null);
  }

  _loop() {
    const tick = () => {
      if (this.disposed) return;
      this._raf = requestAnimationFrame(tick);
      if (this._focus) {
        const { t0, duration, fromTarget, toTarget, fromPos, toPos } = this._focus;
        const k = Math.min(1, (performance.now() - t0) / duration);
        const ease = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;   // easeInOutQuad
        this.controls.target.lerpVectors(fromTarget, toTarget, ease);
        this.camera.position.lerpVectors(fromPos, toPos, ease);
        if (k >= 1) this._focus = null;
      }
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  dispose() {
    this.disposed = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    this._ro?.disconnect?.();
    this.scene?.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { m.map?.dispose?.(); m.dispose?.(); });
      }
    });
    this.controls?.dispose?.();
    this.renderer?.dispose?.();
    this.renderer?.domElement?.remove?.();
  }
}
