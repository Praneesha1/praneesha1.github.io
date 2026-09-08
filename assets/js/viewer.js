// CadViewer: browser CAD-style viewer built on three.js.
// Orbit, view presets, explode, section cut, part list, motion playback, hover labels.
import * as THREE from 'three';
import { OrbitControls } from '../../vendor/three/OrbitControls.js';
import { GLTFLoader } from '../../vendor/three/GLTFLoader.js';
import { RoomEnvironment } from '../../vendor/three/RoomEnvironment.js';

const $ = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ACCENT = 0xE0521A;

const VIEWS = {
  iso:   null, // model default
  front: [0, 0, 1],
  back:  [0, 0, -1],
  top:   [0, 1, 0.0001],
  right: [1, 0, 0],
  left:  [-1, 0, 0],
};

export class CadViewer {
  constructor(container, options) {
    this.el = container;
    this.o = Object.assign({
      ui: true, autoRotate: false, playing: false, speed: null, edges: true,
      background: 0x22252B, grid: true, base: '', explode: 0, onTick: null, compact: false,
    }, options);
    this.model = this.o.model;
    this.parts = new Map();
    this.groups = new Map();
    this.theta = 0;
    this.playing = this.o.playing;
    this.speed = this.o.speed ?? (this.model.motion ? this.model.motion.speed : 1);
    this.explodeT = this.o.explode;
    this.section = { axis: 'x', t: 1, on: false };
    this.hover = null; this.selected = null;
    this.visibleInViewport = true;
    this._tickHandlers = [];
    this._buildScene();
    if (this.o.ui) this._buildUI(); else this._buildMinimalUI();
    this._load();
    this._observe();
    this._loop = this._loop.bind(this);
    this._last = performance.now();
    requestAnimationFrame(this._loop);
  }

  /* ------------------------------------------------------------ scene */
  _buildScene() {
    const el = this.el;
    el.classList.add('cv');
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.localClippingEnabled = true;
    renderer.domElement.className = 'cv-canvas';
    el.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(this.o.background);
    this.scene = scene;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 1000);
    this.camera = camera;
    const hemi = new THREE.HemisphereLight(0xffffff, 0x3a3d44, 0.55);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(1, 2, 1.5); scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35); fill.position.set(-2, 0.5, -1); scene.add(fill);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.autoRotate = this.o.autoRotate; controls.autoRotateSpeed = 0.9;
    controls.addEventListener('start', () => { controls.autoRotate = false; this._hideHint(); });
    this.controls = controls;

    this.root = new THREE.Group();
    scene.add(this.root);
    this.plane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1e9);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2(-2, -2);

    const ro = new ResizeObserver(() => this._resize());
    ro.observe(el);
    this._resize();
    renderer.domElement.addEventListener('pointermove', (e) => this._onPointer(e));
    renderer.domElement.addEventListener('pointerleave', () => { this.pointer.set(-2, -2); this._setHover(null); });
    renderer.domElement.addEventListener('click', (e) => this._onClick(e));
  }

  _resize() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (w > 20 && h > 20 && this.loaded && this._needsFit) { this._needsFit = false; this.setView('iso', false); }
  }

  _observe() {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((ents) => { this.visibleInViewport = ents[0].isIntersecting; }, { threshold: 0.02 });
    io.observe(this.el);
  }

  /* ------------------------------------------------------------- load */
  _load() {
    const loader = new GLTFLoader();
    const url = this.o.base + this.model.url;
    loader.load(url, (gltf) => this._onLoaded(gltf), (ev) => {
      if (this.loadBar) {
        const pct = ev.total ? ev.loaded / ev.total : 0.5;
        this.loadBar.style.width = (pct * 100).toFixed(0) + '%';
        this.loadText.textContent = `Loading model ${(ev.loaded / 1e6).toFixed(1)} MB`;
      }
    }, (err) => {
      console.error(err);
      if (this.loadText) this.loadText.textContent = 'Could not load the model. Open this page through a web server, not as a file.';
    });
  }

  _onLoaded(gltf) {
    const nodes = gltf.scene.children.slice();
    const bboxAll = new THREE.Box3();
    // GLTFLoader sanitises node names (spaces become underscores); map back to config keys
    const san = (t) => t.replace(/\s/g, '_').replace(/[\[\]\.:\/]/g, '');
    const keyBySan = new Map(Object.keys(this.model.parts || {}).map((k) => [san(k), k]));
    for (const node of nodes) {
      const name = keyBySan.get(node.name) || keyBySan.get(san(node.name)) || node.name.replace(/_/g, ' ');
      const cfg = (this.model.parts && this.model.parts[name]) || {};
      const bbox = new THREE.Box3().setFromObject(node);
      bboxAll.union(bbox);
      const center = bbox.getCenter(new THREE.Vector3());
      const pivotPoint = center.clone();
      if (cfg.pivot) {
        if (cfg.pivot[0] != null) pivotPoint.x = cfg.pivot[0];
        if (cfg.pivot[1] != null) pivotPoint.y = cfg.pivot[1];
        if (cfg.pivot[2] != null) pivotPoint.z = cfg.pivot[2];
      }
      const meshes = [];
      node.traverse((m) => { if (m.isMesh) meshes.push(m); });
      const color = new THREE.Color(cfg.color != null ? cfg.color : (meshes[0]?.material?.color || 0xbbbbbb));
      const part = { name, cfg, node, meshes, bbox, center, pivotPoint, pos: new THREE.Vector3(), rot: new THREE.Euler(), visible: true, edges: [], caps: [] };
      for (const m of meshes) {
        const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.48, envMapIntensity: 0.85, side: THREE.FrontSide });
        mat.clippingPlanes = [this.plane];
        m.material = mat; m.userData.part = part;
        // shaded-with-edges look
        const eg = new THREE.EdgesGeometry(m.geometry, 30);
        const edges = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x0c0d10, transparent: true, opacity: 0.5, clippingPlanes: [this.plane] }));
        edges.visible = this.o.edges; edges.raycast = () => {};
        m.add(edges); part.edges.push(edges);
        // section cap illusion: back faces drawn flat in a cut colour
        const cap = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({ color: 0xC24A19, side: THREE.BackSide, clippingPlanes: [this.plane] }));
        cap.visible = false; cap.raycast = () => {};
        m.add(cap); part.caps.push(cap);
      }
      node.position.copy(pivotPoint).negate();
      const pivot = new THREE.Group(); pivot.name = name + '_pivot';
      pivot.position.copy(pivotPoint); pivot.add(node);
      part.pivot = pivot;
      this.root.add(pivot);
      this.parts.set(name, part);
      const g = cfg.group || 'Parts';
      if (!this.groups.has(g)) this.groups.set(g, []);
      this.groups.get(g).push(part);
    }
    this.bbox = bboxAll;
    this.center = bboxAll.getCenter(new THREE.Vector3());
    this.radius = bboxAll.getSize(new THREE.Vector3()).length() / 2;
    this.camera.near = this.radius / 200; this.camera.far = this.radius * 40; this.camera.updateProjectionMatrix();
    this.controls.minDistance = this.radius * 0.15; this.controls.maxDistance = this.radius * 8;
    if (this.o.grid) this._addGrid();
    this.loaded = true;
    if (this.el.clientWidth < 20 || this.el.clientHeight < 20) this._needsFit = true; else this.setView('iso', false);
    if (this.loadWrap) this.loadWrap.classList.add('done');
    if (this.o.ui) this._buildPartsList();
    this._applyAll();
    this.el.dispatchEvent(new CustomEvent('cv:loaded', { detail: this }));
  }

  _addGrid() {
    const size = this.radius * 4;
    const grid = new THREE.GridHelper(size, 40, 0x3a3e47, 0x2c3037);
    grid.position.set(this.center.x, this.bbox.min.y - this.radius * 0.04, this.center.z);
    grid.material.transparent = true; grid.material.opacity = 0.55;
    grid.raycast = () => {};
    this.scene.add(grid);
    this.grid = grid;
  }

  /* --------------------------------------------------------- transforms */
  setTheta(theta) { this.theta = theta; }

  _applyAll() {
    if (!this.loaded) return;
    for (const p of this.parts.values()) { p.pos.set(0, 0, 0); p.rot.set(0, 0, 0); }
    if (this.model.kinematics) {
      this.model.kinematics(this.theta, (name, tr) => {
        const p = this.parts.get(name); if (!p) return;
        if (tr.pos) p.pos.set(tr.pos[0], tr.pos[1], tr.pos[2]);
        if (tr.rot) p.rot.set(tr.rot[0], tr.rot[1], tr.rot[2]);
      });
    }
    for (const p of this.parts.values()) {
      const ex = p.cfg.explode;
      p.pivot.position.copy(p.pivotPoint).add(p.pos);
      if (ex && this.explodeT > 0) p.pivot.position.add(new THREE.Vector3(ex[0], ex[1], ex[2]).multiplyScalar(this.explodeT));
      p.pivot.rotation.copy(p.rot);
      p.pivot.visible = p.visible;
    }
    this._applySection();
  }

  _applySection() {
    const s = this.section;
    if (!this.bbox) return;
    if (!s.on) { this.plane.constant = 1e9; this.plane.normal.set(-1, 0, 0); }
    else {
      const ax = s.axis; const n = new THREE.Vector3(0, 0, 0); n[ax] = -1;
      // explode enlarges the model; widen the cut range accordingly
      const pad = this.radius * (0.05 + this.explodeT * 0.9);
      const min = this.bbox.min[ax] - pad, max = this.bbox.max[ax] + pad;
      this.plane.normal.copy(n); this.plane.constant = min + s.t * (max - min);
    }
    for (const p of this.parts.values()) {
      for (const m of p.meshes) m.material.side = s.on ? THREE.DoubleSide : THREE.FrontSide;
      for (const c of p.caps) c.visible = s.on;
    }
  }

  setExplode(t) { this.explodeT = clamp(t, 0, 1); this._applyAll(); }
  setSection(on, axis, t) {
    this.section.on = on; if (axis) this.section.axis = axis; if (t != null) this.section.t = t; this._applySection();
  }
  setEdges(on) { for (const p of this.parts.values()) for (const e of p.edges) e.visible = on; }
  setPartVisible(name, v) { const p = this.parts.get(name); if (p) { p.visible = v; p.pivot.visible = v; } this._syncList(); }
  isolate(name) { for (const p of this.parts.values()) p.visible = (p.name === name); this._applyAll(); this._syncList(); }
  showAll() { for (const p of this.parts.values()) p.visible = true; this._applyAll(); this._syncList(); }
  play(v) { this.playing = v; if (this.playBtn) this.playBtn.textContent = v ? 'Pause' : 'Play'; }

  setView(name, animate = true) {
    if (!this.bbox) return;
    let dir = VIEWS[name] || this.model.defaultView || [1, 1, 1];
    if (name === 'iso') dir = this.model.defaultView || [1, 0.8, 1];
    const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
    const up = new THREE.Vector3(0, 1, 0); if (Math.abs(d.y) > 0.999) up.set(0, 0, -1);
    const right = new THREE.Vector3().crossVectors(up, d).normalize();
    const camUp = new THREE.Vector3().crossVectors(d, right).normalize();
    const b = this.bbox, c = this.center;
    let hw = 0, hh = 0, depth = 0;
    const v = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).sub(c);
      hw = Math.max(hw, Math.abs(v.dot(right)));
      hh = Math.max(hh, Math.abs(v.dot(camUp)));
      depth = Math.max(depth, v.dot(d));
    }
    const tanH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const tanW = tanH * this.camera.aspect;
    const pad = this.o.compact ? 0.92 : 1.12;
    const dist = Math.max(hw / tanW, hh / tanH) * pad + depth;
    const target = c.clone();
    const pos = target.clone().addScaledVector(d, dist);
    if (!animate) { this.camera.position.copy(pos); this.controls.target.copy(target); this.controls.update(); return; }
    this._anim = { from: this.camera.position.clone(), to: pos, tFrom: this.controls.target.clone(), tTo: target, t: 0 };
  }

  onTick(fn) { this._tickHandlers.push(fn); }

  /* ------------------------------------------------------------ picking */
  _onPointer(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this._ptrPx = [e.clientX - r.left, e.clientY - r.top];
    this._pickDirty = true;
  }
  _onClick() {
    if (this.hover) this.select(this.hover.name);
  }
  select(name) {
    this.selected = name === this.selected ? null : name;
    this._syncList();
    this._applyHighlight();
  }
  _pick() {
    if (!this.loaded || !this._pickDirty) return;
    this._pickDirty = false;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const objs = [];
    for (const p of this.parts.values()) if (p.visible) objs.push(...p.meshes);
    const hits = this.raycaster.intersectObjects(objs, false);
    let hit = null;
    for (const h of hits) {
      // respect the section plane
      if (this.section.on && this.plane.distanceToPoint(h.point) < 0) continue;
      hit = h.object.userData.part; break;
    }
    this._setHover(hit);
  }
  _setHover(part) {
    if (this.hover === part) { if (part && this.label && this._ptrPx) this._placeLabel(); return; }
    this.hover = part;
    this._applyHighlight();
    if (this.label) {
      if (part) { this.label.textContent = part.name; this.label.classList.add('on'); if (this._ptrPx) this._placeLabel(); }
      else this.label.classList.remove('on');
    }
    this.renderer.domElement.style.cursor = part ? 'pointer' : '';
  }
  _placeLabel() {
    const [x, y] = this._ptrPx;
    this.label.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
  }
  _applyHighlight() {
    for (const p of this.parts.values()) {
      const on = (p === this.hover) || (p.name === this.selected);
      for (const m of p.meshes) { m.material.emissive.setHex(on ? ACCENT : 0x000000); m.material.emissiveIntensity = on ? (p.name === this.selected ? 0.45 : 0.28) : 0; }
    }
  }

  /* --------------------------------------------------------------- loop */
  _loop(now) {
    requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, (now - this._last) / 1000); this._last = now;
    if (document.hidden) return;
    const onScreen = this.visibleInViewport && this.el.clientWidth > 0;
    if (this.playing && this.loaded && this.model.kinematics) {
      this.theta = (this.theta + dt * this.speed) % (this.model.motion?.period || Math.PI * 2);
      if (this.angleSlider && !this._scrubbing) this.angleSlider.value = ((this.theta / (Math.PI * 2)) * 360).toFixed(0);
      if (this.angleOut) this.angleOut.textContent = ((this.theta / (Math.PI * 2)) * 360).toFixed(0) + '°';
    }
    if (this.loaded) this._applyAll();
    for (const fn of this._tickHandlers) fn(this.theta);
    if (this._anim) {
      const a = this._anim; a.t = Math.min(1, a.t + dt * 2.2);
      const k = 1 - Math.pow(1 - a.t, 3);
      this.camera.position.lerpVectors(a.from, a.to, k);
      this.controls.target.lerpVectors(a.tFrom, a.tTo, k);
      if (a.t >= 1) this._anim = null;
    }
    if (!onScreen) return;
    this.controls.update();
    this._pick();
    this.renderer.render(this.scene, this.camera);
  }

  /* ----------------------------------------------------------------- UI */
  _buildMinimalUI() {
    this._buildLoading();
    this.label = $('div', 'cv-label'); this.el.appendChild(this.label);
    this.hint = $('div', 'cv-hint', 'Drag to rotate'); this.el.appendChild(this.hint);
  }
  _hideHint() { if (this.hint) this.hint.classList.add('off'); }
  _buildLoading() {
    this.loadWrap = $('div', 'cv-loading');
    this.loadText = $('div', 'cv-loading-text', 'Loading model');
    const bar = $('div', 'cv-loading-bar'); this.loadBar = $('div', 'cv-loading-fill'); bar.appendChild(this.loadBar);
    this.loadWrap.append(this.loadText, bar); this.el.appendChild(this.loadWrap);
  }
  _btn(text, cls, fn, title) { const b = $('button', 'cv-btn ' + (cls || ''), text); b.type = 'button'; if (title) b.title = title; b.addEventListener('click', fn); return b; }

  _buildUI() {
    this._buildLoading();
    const el = this.el;
    el.classList.add('cv-has-ui');
    // top toolbar
    const tb = $('div', 'cv-toolbar');
    const views = $('div', 'cv-group');
    views.appendChild($('span', 'cv-grp-label', 'View'));
    for (const v of ['iso', 'front', 'top', 'right']) views.appendChild(this._btn(v[0].toUpperCase() + v.slice(1), 'cv-view', () => this.setView(v)));
    views.appendChild(this._btn('Fit', '', () => this.setView('iso')));
    tb.appendChild(views);
    const disp = $('div', 'cv-group');
    disp.appendChild($('span', 'cv-grp-label', 'Display'));
    const edgesBtn = this._btn('Edges', 'on', () => { const on = !edgesBtn.classList.contains('on'); edgesBtn.classList.toggle('on', on); this.setEdges(on); });
    disp.appendChild(edgesBtn);
    const partsBtn = this._btn('Parts', '', () => { el.classList.toggle('cv-parts-open'); partsBtn.classList.toggle('on'); });
    disp.appendChild(partsBtn);
    const fsBtn = this._btn('Full screen', '', () => this._fullscreen());
    disp.appendChild(fsBtn);
    tb.appendChild(disp);
    el.appendChild(tb);

    // bottom controls
    const bb = $('div', 'cv-bottom');
    if (this.model.kinematics) {
      const g = $('div', 'cv-ctl cv-ctl-motion');
      g.appendChild($('span', 'cv-ctl-label', 'Motion'));
      this.playBtn = this._btn(this.playing ? 'Pause' : 'Play', 'cv-play', () => this.play(!this.playing));
      g.appendChild(this.playBtn);
      const sl = $('input', 'cv-slider'); sl.type = 'range'; sl.min = 0; sl.max = 360; sl.step = 1; sl.value = 0;
      sl.setAttribute('aria-label', 'Crank angle');
      sl.addEventListener('input', () => { this.play(false); this.theta = (sl.value / 360) * Math.PI * 2; if (this.angleOut) this.angleOut.textContent = sl.value + '°'; });
      sl.addEventListener('pointerdown', () => { this._scrubbing = true; }); sl.addEventListener('pointerup', () => { this._scrubbing = false; });
      this.angleSlider = sl; g.appendChild(sl);
      this.angleOut = $('output', 'cv-out', '0°'); g.appendChild(this.angleOut);
      const sp = $('input', 'cv-slider cv-speed'); sp.type = 'range'; sp.min = 0.2; sp.max = 4; sp.step = 0.1; sp.value = this.speed; sp.title = 'Speed'; sp.setAttribute('aria-label', 'Speed');
      sp.addEventListener('input', () => { this.speed = parseFloat(sp.value); });
      g.appendChild($('span', 'cv-ctl-sub', 'Speed')); g.appendChild(sp);
      bb.appendChild(g);
    }
    {
      const g = $('div', 'cv-ctl');
      g.appendChild($('span', 'cv-ctl-label', 'Explode'));
      const sl = $('input', 'cv-slider'); sl.type = 'range'; sl.min = 0; sl.max = 1; sl.step = 0.01; sl.value = this.explodeT; sl.setAttribute('aria-label', 'Explode');
      sl.addEventListener('input', () => this.setExplode(parseFloat(sl.value)));
      g.appendChild(sl); bb.appendChild(g);
    }
    {
      const g = $('div', 'cv-ctl');
      g.appendChild($('span', 'cv-ctl-label', 'Section'));
      const on = this._btn('Off', '', () => { this.section.on = !this.section.on; on.textContent = this.section.on ? 'On' : 'Off'; on.classList.toggle('on', this.section.on); this._applySection(); });
      g.appendChild(on);
      const ax = $('select', 'cv-select'); for (const a of ['x', 'y', 'z']) { const o = $('option', '', a.toUpperCase()); o.value = a; ax.appendChild(o); }
      ax.setAttribute('aria-label', 'Section axis');
      ax.addEventListener('change', () => { this.section.axis = ax.value; this._applySection(); });
      g.appendChild(ax);
      const sl = $('input', 'cv-slider'); sl.type = 'range'; sl.min = 0.02; sl.max = 1; sl.step = 0.005; sl.value = 1; sl.setAttribute('aria-label', 'Section position');
      sl.addEventListener('input', () => { if (!this.section.on) { this.section.on = true; on.textContent = 'On'; on.classList.add('on'); } this.section.t = parseFloat(sl.value); this._applySection(); });
      g.appendChild(sl); bb.appendChild(g);
    }
    el.appendChild(bb);

    // parts panel
    this.partsPanel = $('div', 'cv-panel');
    el.appendChild(this.partsPanel);
    this.label = $('div', 'cv-label'); el.appendChild(this.label);
    this.hint = $('div', 'cv-hint', 'Drag to rotate · Scroll to zoom · Right drag to pan · Click a part to select');
    el.appendChild(this.hint);
    setTimeout(() => this._hideHint(), 7000);
  }

  _buildPartsList() {
    const pp = this.partsPanel; pp.innerHTML = '';
    const head = $('div', 'cv-panel-head');
    head.appendChild($('span', '', `Parts <em>${this.parts.size}</em>`));
    const all = this._btn('Show all', 'cv-mini', () => { this.selected = null; this.showAll(); this._applyHighlight(); });
    head.appendChild(all); pp.appendChild(head);
    const list = $('div', 'cv-list');
    this.rows = new Map();
    for (const [g, parts] of this.groups) {
      const gh = $('div', 'cv-list-group');
      const cb = $('input'); cb.type = 'checkbox'; cb.checked = true; cb.setAttribute('aria-label', 'Toggle ' + g);
      cb.addEventListener('change', () => { for (const p of parts) p.visible = cb.checked; this._applyAll(); this._syncList(); });
      gh.append(cb, $('span', '', g)); list.appendChild(gh);
      for (const p of parts) {
        const row = $('div', 'cv-row');
        const c = $('input'); c.type = 'checkbox'; c.checked = true; c.setAttribute('aria-label', 'Toggle ' + p.name);
        c.addEventListener('change', () => this.setPartVisible(p.name, c.checked));
        const nm = $('button', 'cv-row-name', p.name); nm.type = 'button';
        nm.addEventListener('click', () => this.select(p.name));
        nm.addEventListener('mouseenter', () => { this._setHover(p); });
        nm.addEventListener('mouseleave', () => { this._setHover(null); });
        const iso = $('button', 'cv-row-iso', 'only'); iso.type = 'button'; iso.title = 'Show only this part';
        iso.addEventListener('click', () => { this.isolate(p.name); this.selected = p.name; this._applyHighlight(); this._syncList(); });
        row.append(c, nm, iso); list.appendChild(row);
        this.rows.set(p.name, { row, cb: c, group: cb });
      }
    }
    pp.appendChild(list);
  }
  _syncList() {
    if (!this.rows) return;
    for (const [name, r] of this.rows) {
      const p = this.parts.get(name);
      r.cb.checked = p.visible;
      r.row.classList.toggle('sel', name === this.selected);
    }
  }
  _fullscreen() {
    const el = this.el;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.();
  }
}

/* --------------------------------------------------- 2D linkage diagram */
export class LinkageDiagram {
  constructor(svg, model, viewer) {
    this.svg = svg; this.d = model.diagram; this.items = [];
    const vb = this.d.viewBox;
    svg.setAttribute('viewBox', vb.join(' '));
    this.g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    if (this.d.flipY) this.g.setAttribute('transform', `scale(1,-1) translate(0, ${-(2 * vb[1] + vb[3])})`);
    svg.appendChild(this.g);
    if (viewer) viewer.onTick((t) => this.draw(t)); else this.draw(0);
  }
  draw(theta) {
    const list = this.d.draw(theta);
    const NS = 'http://www.w3.org/2000/svg';
    const vb = this.d.viewBox;
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      let el = this.items[i];
      const tag = it.t === 'text' ? 'text' : it.t;
      if (!el || el.tagName !== tag) {
        if (el) el.remove();
        el = document.createElementNS(NS, tag); this.items[i] = el; this.g.appendChild(el);
      }
      el.setAttribute('class', it.cls || '');
      if (it.t === 'line') { el.setAttribute('x1', it.x1); el.setAttribute('y1', it.y1); el.setAttribute('x2', it.x2); el.setAttribute('y2', it.y2); }
      else if (it.t === 'circle') { el.setAttribute('cx', it.cx); el.setAttribute('cy', it.cy); el.setAttribute('r', it.r); }
      else if (it.t === 'rect') { el.setAttribute('x', it.x); el.setAttribute('y', it.y); el.setAttribute('width', it.w); el.setAttribute('height', it.h); }
      else if (it.t === 'text') {
        // text must not be mirrored: undo the flip locally
        const ty = this.d.flipY ? -it.y : it.y;
        el.setAttribute('transform', this.d.flipY ? `scale(1,-1)` : '');
        el.setAttribute('x', it.x); el.setAttribute('y', ty); el.textContent = it.s;
        if (it.anchor) el.setAttribute('text-anchor', it.anchor);
      }
    }
    for (let i = list.length; i < this.items.length; i++) this.items[i].remove();
    this.items.length = list.length;
  }
}
