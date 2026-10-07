/* Hermes Office 3D — Three.js renderer for Hermes Live dashboard
 * v1: menggantikan office2.js (canvas 2D). Kontrak backend sama:
 *   SSE  -> /events   (kind: session_start, tool_start/end, message, session_end, ...)
 *   POST -> /hook     (tetap di collector)
 * Layout zona & spot di-port dari office2.js (grid 30x18).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const HO3D_VER = '2026-10-07-3d1';
console.log('[ho3d] ver', HO3D_VER);

/* ============ DOM ============ */
const $ = (id) => document.getElementById(id);
const cv = $('hoCv');
const elConn = $('hoConn'), elConnText = $('hoConnText'), elCount = $('hoCount');
const elMdot = $('hoMdot'), elMtext = $('hoMtext'), elMlog = $('hoMlog');
const elAlog = $('hoAlog');

/* ============ utils ============ */
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }

/* ============ audio (beep sederhana ala office2.js) ============ */
let soundOn = true, _ac = null;
function ac() { if (!_ac) { try { _ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } } return _ac; }
function beep(freq, dur, type, vol) {
  if (!soundOn) return;
  const c = ac(); if (!c) return;
  try {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.value = freq || 440;
    g.gain.value = vol || 0.04;
    o.connect(g); g.connect(c.destination);
    o.start(); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + (dur || 0.08));
    o.stop(c.currentTime + (dur || 0.08));
  } catch (e) { }
}

/* ============ canvas texture helpers ============ */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return { tex: t, canvas: c, redraw: () => { draw(c.getContext('2d'), w, h); t.needsUpdate = true; } };
}
function textSprite(text, opt) {
  opt = opt || {};
  const fs = opt.fontSize || 44, pad = 18;
  const { tex, canvas } = canvasTex(8, 8, () => { });
  const ctx = canvas.getContext('2d');
  ctx.font = `bold ${fs}px monospace`;
  const tw = Math.ceil(ctx.measureText(text).width);
  canvas.width = tw + pad * 2; canvas.height = fs + pad * 2;
  const c2 = canvas.getContext('2d');
  if (opt.bg !== 'none') { c2.fillStyle = opt.bg || 'rgba(10,12,18,0.88)'; const r = 14; const w = canvas.width, h = canvas.height;
    c2.beginPath(); c2.moveTo(r, 0); c2.arcTo(w, 0, w, h, r); c2.arcTo(w, h, 0, h, r); c2.arcTo(0, h, 0, 0, r); c2.arcTo(0, 0, w, 0, r); c2.closePath(); c2.fill();
    if (opt.border) { c2.strokeStyle = opt.border; c2.lineWidth = 3; c2.stroke(); } }
  c2.font = `bold ${fs}px monospace`; c2.textAlign = 'center'; c2.textBaseline = 'middle';
  c2.fillStyle = opt.color || '#fff'; c2.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  const t2 = new THREE.CanvasTexture(canvas); t2.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t2, transparent: true, depthWrite: false }));
  const s = opt.scale || 1;
  sp.scale.set(canvas.width / 110 * s, canvas.height / 110 * s, 1);
  return sp;
}
function codeScreenTexture() {
  return canvasTex(256, 160, (c, w, h) => {
    c.fillStyle = '#0e1626'; c.fillRect(0, 0, w, h);
    const cols = ['#7fd8ff', '#9dff9e', '#ffd76a', '#ff9ecf', '#c9a44a'];
    for (let i = 0; i < 12; i++) {
      let x = 12; const y = 12 + i * 12;
      const segs = 1 + Math.floor(Math.random() * 3);
      for (let s2 = 0; s2 < segs; s2++) {
        const len = 20 + Math.random() * 70;
        c.fillStyle = pick(cols); c.globalAlpha = 0.85;
        c.fillRect(x, y, len, 6); x += len + 8;
      }
    }
    c.globalAlpha = 1;
  }).tex;
}
const sharedCodeTex = [];

/* ============ renderer / scene / camera ============ */
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070d);
scene.fog = new THREE.Fog(0x05070d, 55, 110);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
const CAM_HOME = { pos: new THREE.Vector3(15, 25, 34), tgt: new THREE.Vector3(15, 0, 10) };
camera.position.copy(CAM_HOME.pos);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(CAM_HOME.tgt);
controls.enableDamping = true; controls.dampingFactor = 0.06;
controls.maxPolarAngle = 1.45; controls.minDistance = 6; controls.maxDistance = 70;

function resize() {
  const wrap = cv.parentElement;
  const w = (wrap && wrap.clientWidth) || 1560, h = Math.max(420, Math.min(760, w * 0.46));
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

/* ============ lights ============ */
scene.add(new THREE.AmbientLight(0x8a9ac0, 0.35));
const hemi = new THREE.HemisphereLight(0x2a3a5e, 0x1a1208, 0.35); scene.add(hemi);
const moon = new THREE.DirectionalLight(0x9db8e8, 0.55);
moon.position.set(-18, 30, -14); moon.castShadow = true;
moon.shadow.mapSize.set(1024, 1024);
moon.shadow.camera.left = -25; moon.shadow.camera.right = 25;
moon.shadow.camera.top = 25; moon.shadow.camera.bottom = -25;
scene.add(moon);
const warmLights = [];
function warmLight(x, y, z, intensity, dist) {
  const L = new THREE.PointLight(0xffc27a, intensity || 14, dist || 16, 1.6);
  L.position.set(x, y, z); scene.add(L); warmLights.push(L); return L;
}

/* ============ sky: stars + moon + city ============ */
{
  const starGeo = new THREE.BufferGeometry();
  const N = 500, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = rnd(0, Math.PI * 2), r = rnd(120, 180), y = rnd(15, 120);
    pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Math.sin(a) * r;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 0.7, sizeAttenuation: true })));
  const moonSp = textSprite('●', { fontSize: 120, color: '#f0ecc8', bg: 'none', scale: 2.2 });
  moonSp.position.set(52, 46, -60); scene.add(moonSp);
  const halo = textSprite('●', { fontSize: 120, color: 'rgba(240,236,200,0.14)', bg: 'none', scale: 5 });
  halo.position.copy(moonSp.position); scene.add(halo);
  // city silhouette: dark boxes + lit windows
  const winTex = canvasTex(64, 96, (c, w, h) => {
    c.fillStyle = '#0a0e18'; c.fillRect(0, 0, w, h);
    for (let y = 4; y < h; y += 8) for (let x = 4; x < w; x += 8)
      if (Math.random() < 0.42) { c.fillStyle = Math.random() < 0.7 ? '#ffd678' : '#9fd8ff'; c.globalAlpha = rnd(0.4, 1); c.fillRect(x, y, 4, 5); }
    c.globalAlpha = 1;
  }).tex;
  const cityMat = new THREE.MeshBasicMaterial({ map: winTex });
  for (let i = 0; i < 46; i++) {
    const a = rnd(0, Math.PI * 2), r = rnd(70, 110);
    const w = rnd(6, 14), h = rnd(14, 46), d = rnd(6, 14);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cityMat);
    b.position.set(15 + Math.cos(a) * r, h / 2 - 2, 9 + Math.sin(a) * r);
    scene.add(b);
  }
}

/* ============ materials ============ */
const MAT = {
  wall: new THREE.MeshStandardMaterial({ color: 0xf2e7d2, roughness: 0.9 }),
  wallTrim: new THREE.MeshStandardMaterial({ color: 0xd19a4e, roughness: 0.8 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xaacde8, transparent: true, opacity: 0.28, roughness: 0.15 }),
  wood: new THREE.MeshStandardMaterial({ color: 0xe8a85c, roughness: 0.75 }),
  woodDark: new THREE.MeshStandardMaterial({ color: 0x6e4a24, roughness: 0.8 }),
  deskTop: new THREE.MeshStandardMaterial({ color: 0xe8a85c, roughness: 0.7 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x3a3e48, roughness: 0.45, metalness: 0.6 }),
  black: new THREE.MeshStandardMaterial({ color: 0x17181d, roughness: 0.6 }),
  screenOff: new THREE.MeshStandardMaterial({ color: 0x11141c, roughness: 0.4 }),
  chairMesh: new THREE.MeshStandardMaterial({ color: 0x2e3d4e, roughness: 0.85 }),
  sofa: new THREE.MeshStandardMaterial({ color: 0xd8cfc0, roughness: 0.95 }),
  rack: new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.5, metalness: 0.4 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x2f8f46, roughness: 0.9 }),
  pot: new THREE.MeshStandardMaterial({ color: 0x8a4f2c, roughness: 0.9 }),
};
function screenMat() {
  if (!sharedCodeTex.length) for (let i = 0; i < 4; i++) sharedCodeTex.push(codeScreenTexture());
  return new THREE.MeshStandardMaterial({ map: pick(sharedCodeTex), emissive: 0xffffff, emissiveMap: pick(sharedCodeTex), emissiveIntensity: 0.9, roughness: 0.4 });
}
function box(w, h, d, mat, x, y, z, ry) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); if (ry) m.rotation.y = ry;
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function cyl(rt, rb, h, mat, x, y, z, seg) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 14), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  return m;
}

/* ============ floors & zones ============ */
const GX = 30, GY = 21;
const floor1 = new THREE.Group(), floor2 = new THREE.Group();
scene.add(floor1); scene.add(floor2);
floor2.position.y = 4.6;
// pelat beton + kolom penyangga: ikut grup lantai 2 (biar ke-toggle & tidak menghalangi cahaya)
// koordinat lokal: grup floor2 ada di y=4.6
{
  const slab2 = box(GX + 1.4, 0.5, GY + 1.4, new THREE.MeshStandardMaterial({ color: 0x11141c, roughness: 1 }), GX / 2, -0.26, GY / 2);
  slab2.receiveShadow = true; floor2.add(slab2);
  const colM = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.5, metalness: 0.4 });
  [[0.7, 0.7], [GX - 0.7, 0.7], [0.7, GY - 0.7], [GX - 0.7, GY - 0.7], [GX / 2, 0.7], [GX / 2, GY - 0.7]].forEach(p => {
    floor2.add(box(0.55, 4.6, 0.55, colM, p[0], -2.3, p[1]));
  });
}
let showFloors = [0, 1], showMode = 0;

function zoneFloor(parent, x0, x1, z0, z1, c1, c2) {
  for (let gz = z0; gz < z1; gz++) for (let gx = x0; gx < x1; gx++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color: ((gx + gz) % 2) ? c1 : c2, roughness: 0.95 }));
    m.rotation.x = -Math.PI / 2; m.position.set(gx + 0.5, 0.01, gz + 0.5);
    m.receiveShadow = true; parent.add(m);
  }
}
// base slab
{
  const slab = box(GX + 1.4, 0.5, GY + 1.4, new THREE.MeshStandardMaterial({ color: 0x11141c, roughness: 1 }), GX / 2, -0.26, GY / 2);
  slab.receiveShadow = true; scene.add(slab);
}
// lantai 1
zoneFloor(floor1, 0, 12, 0, 8, 0xf5d9a8, 0xeed09e);
zoneFloor(floor1, 12, 17, 0, 8, 0xf5d9a8, 0xeed09e);
zoneFloor(floor1, 17, 23, 0, 8, 0xf5d9a8, 0xeed09e);
zoneFloor(floor1, 23, 30, 0, 8, 0xdfe9f5, 0xd3dfeb);
zoneFloor(floor1, 0, 7, 8, 18, 0xf0e6d2, 0xe5d8bf);
zoneFloor(floor1, 7, 16, 8, 18, 0xf5d9a8, 0xeed09e);
zoneFloor(floor1, 7, 11, 8, 11, 0x3d434e, 0x363b46);   // war room
zoneFloor(floor1, 16, 23, 8, 18, 0xeed09e, 0xe8c48e);
zoneFloor(floor1, 23, 30, 8, 18, 0xf0e6d2, 0xe5d8bf);
// lantai 2
zoneFloor(floor2, 0, 12, 0, 8, 0xd9e8d4, 0xcfe0c8);
zoneFloor(floor2, 12, 23, 0, 8, 0xe4ddf2, 0xd8cff0);
zoneFloor(floor2, 23, 30, 0, 8, 0xd8cfc0, 0xc9bda9);
zoneFloor(floor2, 0, 7, 8, 18, 0xcfe3c8, 0xbcd6b4);
zoneFloor(floor2, 7, 16, 8, 18, 0xe8e4f0, 0xdcd6e8);
zoneFloor(floor2, 16, 23, 8, 18, 0xf0e6d2, 0xe5d8bf);
zoneFloor(floor2, 23, 30, 8, 18, 0xe0e6ee, 0xd2dae4);
// teras outdoor (lantai 1 & 2): deck kayu
zoneFloor(floor1, 0, 30, 18, 21, 0xb98d5e, 0xa87f52);
zoneFloor(floor2, 0, 30, 18, 21, 0xb98d5e, 0xa87f52);

/* ============ walls ============ */
const WH = 3.2;
function wallRun(parent, x0, x1, z, glass) {
  const len = x1 - x0;
  if (glass) {
    const g = box(len, WH - 0.7, 0.14, MAT.glass, (x0 + x1) / 2, (WH - 0.7) / 2 + 0.35, z);
    g.castShadow = false; parent.add(g);
    parent.add(box(len, 0.35, 0.2, MAT.woodDark, (x0 + x1) / 2, WH - 0.18, z));
    parent.add(box(len, 0.12, 0.18, MAT.wallTrim, (x0 + x1) / 2, 0.32, z));
  } else {
    parent.add(box(len, WH, 0.24, MAT.wall, (x0 + x1) / 2, WH / 2, z));
    parent.add(box(len + 0.06, 0.3, 0.3, MAT.wallTrim, (x0 + x1) / 2, WH - 0.15, z));
  }
}
function wallRunZ(parent, z0, z1, x, glass) {
  const len = z1 - z0;
  if (glass) {
    const g = box(0.14, WH - 0.7, len, MAT.glass, x, (WH - 0.7) / 2 + 0.35, (z0 + z1) / 2);
    g.castShadow = false; parent.add(g);
    parent.add(box(0.2, 0.35, len, MAT.woodDark, x, WH - 0.18, (z0 + z1) / 2));
  } else {
    parent.add(box(0.24, WH, len, MAT.wall, x, WH / 2, (z0 + z1) / 2));
    parent.add(box(0.3, 0.3, len + 0.06, MAT.wallTrim, x, WH - 0.15, (z0 + z1) / 2));
  }
}
function buildWalls(parent, floorIdx) {
  // dinding luar: utara kaca (jendela), sisanya solid
  wallRun(parent, 0, GX, 0, true);
  wallRunZ(parent, 0, GY, 0, false); wallRunZ(parent, 0, GY, GX, false);
  { // dinding selatan (z=18) + 2 pintu ke teras outdoor
    wallRun(parent, 0, 6, 18, false);
    wallRun(parent, 7.2, 22, 18, false);
    wallRun(parent, 23.2, GX, 18, false);
    parent.add(makeDoorFrame(6.6, 18, false));
    parent.add(makeDoorFrame(22.6, 18, false));
  }
  // sekat zona (dengan celah pintu)
  // Lt2 (floorIdx 1): MEETING jadi SATU ruangan x12–23 (sekat x17 dihapus utk z0-8),
  // MUSHOLA x0–12 disekat tengah (x6) untuk area ikhwan/akhwat + ruang wudhu di selatan (z6-8).
  const isLt2 = floorIdx === 1;
  const vwalls = [
    { x: 12, z0: 0, z1: 8, gaps: [[3.4, 4.6]] }, { x: 17, z0: 0, z1: 8, gaps: [[3.4, 4.6]] },
    { x: 23, z0: 0, z1: 8, gaps: [[3.4, 4.6]], glass: 1 },
    { x: 7, z0: 8, z1: 18, gaps: [[12.4, 13.6]] }, { x: 16, z0: 8, z1: 18, gaps: [[12.4, 13.6]] },
    { x: 23, z0: 8, z1: 18, gaps: [[12.4, 13.6]] },
  ];
  if (isLt2) {
    // Hapus sekat x17 zona utara (MEETING menyatu 12–23); tambah sekat mushola x6 (z0-6 saja,
    // ruang wudhu z6-8 BERSAMA dipisah sekat) + dinding wudhu z6.
    vwalls.splice(1, 1);
    vwalls.push({ x: 6, z0: 0, z1: 6, gaps: [[3.4, 4.6]] });
  }
  vwalls.forEach(w => {
    let cur = w.z0;
    w.gaps.forEach(gp => { if (gp[0] > cur) wallRunZ(parent, cur, gp[0], w.x, w.glass); cur = gp[1]; });
    if (cur < w.z1) wallRunZ(parent, cur, w.z1, w.x, w.glass);
  });
  const hwalls = [
    { z: 8, x0: 0, x1: 23, gaps: [[2.5, 3.7], [9.5, 10.7], [14.5, 15.7], [19.5, 20.7]] },
    { z: 8, x0: 23, x1: 30, gaps: [[25.5, 26.7]], glass: 1 },
  ];
  if (isLt2) {
    // Dinding ruang wudhu mushola: z6, x0–12, pintu di x2.5–3.7 & x8.5–9.7 (akses tiap sisi sekat)
    hwalls.push({ z: 6, x0: 0, x1: 12, gaps: [[2.5, 3.7], [8.5, 9.7]] });
  }
  hwalls.forEach(w => {
    let cur = w.x0;
    w.gaps.forEach(gp => { if (gp[0] > cur) wallRun(parent, cur, gp[0], w.z, w.glass); cur = gp[1]; });
    if (cur < w.x1) wallRun(parent, cur, w.x1, w.z, w.glass);
  });
}
buildWalls(floor1, 0); buildWalls(floor2, 1);

/* zone labels */
function zoneLabel(parent, text, x, z) {
  const sp = textSprite(text, { fontSize: 40, color: '#e8b93c', bg: 'rgba(20,22,30,0.75)', border: '#e8b93c', scale: 1.15 });
  sp.position.set(x, 4.6, z); parent.add(sp);
}
[['DEV CLUSTER', 6, 4], ['STANDING', 14.5, 4], ['EXEC POD', 20, 4], ['SERVER', 26.5, 4],
 ['FOYER', 3.5, 13], ['CONFERENCE', 11.5, 13], ['WAR ROOM', 8.75, 9.5],
 ['LOUNGE', 19.5, 14], ['PANTRY', 26.5, 13]].forEach(s => zoneLabel(floor1, s[0], s[1], s[2]));
[['MUSHOLA IKHWAN', 3, 2.5], ['IMAM', 3, 1.0], ['MUSHOLA AKHWAT', 9, 2.5], ['WUDHU', 6, 7], ['MEETING', 17.5, 4], ['GUDANG', 26.5, 4],
 ['ROOFTOP', 3.5, 13], ['BOOTH', 11.5, 13], ['PANTRY', 19.5, 13], ['LIFT', 26.5, 13]].forEach(s => zoneLabel(floor2, s[0], s[1], s[2]));

/* ============ furniture builders ============ */
function makeMonitor(w) {
  const g = new THREE.Group();
  g.add(box(w || 0.9, 0.55, 0.06, MAT.black, 0, 0.32, 0));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry((w || 0.9) - 0.08, 0.47), screenMat());
  scr.position.set(0, 0.32, 0.035); g.add(scr);
  g.add(box(0.08, 0.3, 0.08, MAT.metal, 0, 0.02, -0.02));
  return g;
}
function makeDesk(x, z, ry, opt) {
  opt = opt || {};
  const g = new THREE.Group();
  const w = opt.w || 1.9, d = opt.d || 0.95, h = opt.h || 0.74;
  g.add(box(w, 0.09, d, MAT.deskTop, 0, h, 0));
  [[-w / 2 + 0.08, -d / 2 + 0.08], [w / 2 - 0.08, -d / 2 + 0.08], [-w / 2 + 0.08, d / 2 - 0.08], [w / 2 - 0.08, d / 2 - 0.08]]
    .forEach(o => g.add(box(0.09, h, 0.09, MAT.metal, o[0], h / 2, o[1])));
  const n = opt.monitors === 2 ? [-0.42, 0.42] : [0];
  n.forEach(mx => { const m = makeMonitor(opt.mw || 0.85); m.position.set(mx, h + 0.05, -0.12); g.add(m); });
  g.add(box(0.5, 0.03, 0.18, MAT.black, -0.1, h + 0.06, 0.22));           // keyboard
  const mug = cyl(0.05, 0.045, 0.11, new THREE.MeshStandardMaterial({ color: pick([0xc0392b, 0x3f8cff, 0x3fae5a, 0xe8b93c]), roughness: 0.6 }), 0.62, h + 0.1, 0.2);
  g.add(mug);
  g.position.set(x, 0, z); if (ry) g.rotation.y = ry;
  return g;
}
function makeChair(x, z, ry) {
  const g = new THREE.Group();
  g.add(box(0.5, 0.07, 0.5, MAT.chairMesh, 0, 0.48, 0));
  g.add(box(0.5, 0.55, 0.07, MAT.chairMesh, 0, 0.85, -0.24));
  g.add(cyl(0.04, 0.04, 0.45, MAT.metal, 0, 0.24, 0));
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const leg = box(0.3, 0.04, 0.06, MAT.metal, Math.cos(a) * 0.16, 0.03, Math.sin(a) * 0.16); leg.rotation.y = -a; g.add(leg); }
  g.position.set(x, 0, z); if (ry) g.rotation.y = ry;
  return g;
}
function makePlant(x, z, s) {
  s = s || 1;
  const g = new THREE.Group();
  g.add(cyl(0.22 * s, 0.17 * s, 0.34 * s, MAT.pot, 0, 0.17 * s, 0));
  const fol = new THREE.Mesh(new THREE.ConeGeometry(0.42 * s, 1.1 * s, 8), MAT.leaf);
  fol.position.y = 0.85 * s; fol.castShadow = true; g.add(fol);
  const fol2 = new THREE.Mesh(new THREE.SphereGeometry(0.3 * s, 8, 8), MAT.leaf);
  fol2.position.y = 1.25 * s; fol2.castShadow = true; g.add(fol2);
  g.position.set(x, 0, z); return g;
}
function makePendant(x, z, withLight, dy) {
  const g = new THREE.Group();
  g.add(cyl(0.02, 0.02, 1.6, MAT.black, 0, WH + 0.8, 0));
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.3, 14, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x2e3138, roughness: 0.6, side: THREE.DoubleSide }));
  shade.position.y = WH - 0.1; g.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0xffe6ad, emissive: 0xffd98a, emissiveIntensity: 2.2 }));
  bulb.position.y = WH - 0.22; g.add(bulb);
  g.position.set(x, 0, z);
  if (withLight) warmLight(x, WH - 0.4 + (dy || 0), z, 10, 13);
  return g;
}
function makeServerRack(x, z) {
  const g = new THREE.Group();
  g.add(box(1.1, 2.3, 1.2, MAT.rack, 0, 1.15, 0));
  g.add(box(0.94, 0.1, 0.06, MAT.metal, 0, 2.28, 0.62));
  for (let u = 0; u < 8; u++) {
    const on = Math.random() < 0.6;
    const led = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: on ? pick([0x3ddc84, 0xe05252, 0xeab308]) : 0x000000, emissiveIntensity: on ? 2.4 : 0 }));
    led.position.set(-0.32 + (u % 4) * 0.21, 0.6 + Math.floor(u / 4) * 0.5, 0.63);
    g.add(led);
    if (on && !g.userData.blinkers) g.userData.blinkers = [];
    if (on) g.userData.blinkers.push(led);
  }
  g.position.set(x, 0, z);
  return g;
}
function makeSofa(x, z, ry, color) {
  const g = new THREE.Group();
  const cm = new THREE.MeshStandardMaterial({ color: color || 0xd8cfc0, roughness: 0.95 });
  g.add(box(2.4, 0.45, 1.0, cm, 0, 0.32, 0));
  g.add(box(2.4, 0.7, 0.24, cm, 0, 0.7, -0.4));
  g.add(box(0.24, 0.62, 1.0, cm, -1.2, 0.6, 0)); g.add(box(0.24, 0.62, 1.0, cm, 1.2, 0.6, 0));
  [-0.7, 0, 0.7].forEach((px, i) => g.add(box(0.62, 0.16, 0.8, new THREE.MeshStandardMaterial({ color: pick([0xe05252, 0x3f8cff, 0x3fae5a]), roughness: 0.95 }), px, 0.62, 0.06)));
  g.position.set(x, 0, z); if (ry) g.rotation.y = ry;
  return g;
}
function makeConfTable(x, z) {
  const g = new THREE.Group();
  const top = cyl(2.1, 2.1, 0.12, MAT.woodDark, 0, 0.74, 0, 24); top.scale.z = 0.62; g.add(top);
  g.add(box(0.5, 0.68, 0.5, MAT.woodDark, 0, 0.37, 0));
  const mic = cyl(0.05, 0.07, 0.1, MAT.metal, 0, 0.85, 0); g.add(mic);
  g.add(cyl(0.012, 0.012, 0.35, MAT.metal, 0, 1.05, 0));
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xe05252, emissiveIntensity: 2 }));
  dot.position.set(0, 1.24, 0); g.add(dot); g.userData.micDot = dot;
  g.position.set(x, 0, z); return g;
}

/* neon sign: nama project */
let neonRedraw = null;
function makeNeonSign(x, z, ry) {
  const g = new THREE.Group();
  g.add(box(4.6, 1.15, 0.18, MAT.wood, 0, 0, 0));
  const ct = canvasTex(512, 128, () => { });
  neonRedraw = (txt) => {
    ct.redraw = null;
    const c = ct.canvas.getContext('2d');
    c.fillStyle = '#8a5a20'; c.fillRect(0, 0, 512, 128);
    c.fillStyle = '#a86f2e'; c.fillRect(0, 0, 512, 18);
    c.font = 'bold 56px "Trebuchet MS", sans-serif'; c.textAlign = 'center';
    c.shadowColor = '#ffb52e'; c.shadowBlur = 26;
    c.fillStyle = '#fff3d0'; c.fillText(txt || 'OFFICE', 256, 84);
    c.shadowBlur = 0;
    ct.tex.needsUpdate = true;
  };
  neonRedraw('OFFICE');
  const face = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.05),
    new THREE.MeshStandardMaterial({ map: ct.tex, emissive: 0xffffff, emissiveMap: ct.tex, emissiveIntensity: 0.55 }));
  face.position.z = 0.1; g.add(face);
  g.position.set(x, 4.4, z); if (ry !== undefined) g.rotation.y = ry;
  return g;
}
function setOfficeProject(p) { if (neonRedraw && p) neonRedraw(String(p).slice(0, 18).toUpperCase()); }

/* war room screen */
let warRedraw = null, warMesh = null;
function makeWarScreen(x, z) {
  const g = new THREE.Group();
  g.add(box(3.4, 2.0, 0.14, MAT.black, 0, 0, 0));
  const ct = canvasTex(340, 200, () => { });
  const draw = (alert, txt) => {
    const c = ct.canvas.getContext('2d');
    c.fillStyle = alert ? '#4a0e14' : '#0e1a2a'; c.fillRect(0, 0, 340, 200);
    c.textAlign = 'center'; c.fillStyle = alert ? '#ff6b6b' : '#3ddc84';
    c.font = 'bold 26px monospace';
    c.fillText(alert ? '⚠ ' + String(txt || '').slice(0, 22) : 'ALL SYSTEMS', 170, 80);
    c.fillText(alert ? 'INCIDENT RESPONSE' : 'NOMINAL', 170, 120);
    ct.tex.needsUpdate = true;
  };
  draw(false); warRedraw = draw;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.85),
    new THREE.MeshStandardMaterial({ map: ct.tex, emissive: 0xffffff, emissiveMap: ct.tex, emissiveIntensity: 0.8 }));
  face.position.z = 0.09; face.rotation.y = Math.PI; g.add(face);
  warMesh = face;
  g.position.set(x, 3.4, z);
  return g;
}

/* ============ furnish lantai 1 ============ */
const blinkers = [];
// DEV desks
[1.6, 4.1, 6.6, 9.1].forEach((dx, i) => [3.05, 6.25].forEach((cz) => {
  floor1.add(makeDesk(dx, cz - 0.95, 0, { monitors: i % 3 === 0 ? 2 : 1 }));
  floor1.add(makeChair(dx, cz, Math.PI));
}));
// STAND desks
[13.0, 14.5, 16.0].forEach(dx => {
  floor1.add(makeDesk(dx, 3.45, 0, { w: 1.2, d: 0.8, h: 1.05, monitors: 1, mw: 0.7 }));
});
// EXEC
floor1.add(makeDesk(20, 4.45, 0, { w: 2.4, d: 1.2, monitors: 1 }));
floor1.add(makeChair(20, 5.4, Math.PI));
{ // kanban board
  const ct = canvasTex(220, 130, (c, w, h) => {
    c.fillStyle = '#b08a5a'; c.fillRect(0, 0, w, h);
    const cols = ['#ffd94d', '#ff9ecf', '#9dff9e', '#9fd8ff', '#ffb35c'];
    for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) { c.fillStyle = cols[(r * 3 + q) % 5]; c.fillRect(14 + q * 66, 16 + r * 36, 56, 28); }
  });
  const bd = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.0), new THREE.MeshStandardMaterial({ map: ct.tex, roughness: 0.9 }));
  bd.position.set(20.5, 3.6, 0.16); floor1.add(bd);
  floor1.add(box(3.6, 2.2, 0.1, MAT.woodDark, 20.5, 3.6, 0.08));
}
// CONF (Lt1) — meja oval: radius meja rx=2.1 → lebar penuh 4.2, rz=2.1*0.62≈1.3.
// Kursi rapat: 8 kursi MERAPAT di tepi meja (rx 2.55 / rz 1.75), hadap ke tengah meja.
floor1.add(makeConfTable(11.5, 13));
for (let ci = 0; ci < 8; ci++) {
  const an = ci / 8 * Math.PI * 2;
  const qx = 11.5 + Math.cos(an) * 2.55, qy = 13 + Math.sin(an) * 1.75;
  floor1.add(makeChair(qx, qy, Math.atan2(11.5 - qx, 13 - qy)));
}
// WAR
floor1.add(makeWarScreen(8.75, 8.05));
floor1.add(makeDesk(8.75, 8.75, 0, { w: 2.3, d: 0.6, h: 0.74, monitors: 1 }));
[7.9, 8.75, 9.6].forEach(dx => floor1.add(makeChair(dx, 10.1, Math.PI)));
// LOUNGE
floor1.add(makeSofa(18.2, 15.8, 0));
[[20.5, 10.8, 0x9a63e8], [21.9, 15.9, 0xef7d3c], [20.2, 17.4, 0x3f8cff]].forEach(p => {
  const pouf = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), new THREE.MeshStandardMaterial({ color: p[2], roughness: 0.95 }));
  pouf.position.set(p[0], 0.32, p[1]); pouf.scale.y = 0.75; pouf.castShadow = true; floor1.add(pouf);
});
{ // arcade
  const cab = box(1.0, 1.9, 0.8, new THREE.MeshStandardMaterial({ color: 0x2a1a3a, roughness: 0.6 }), 22.3, 0.95, 16.4);
  floor1.add(cab);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x0a0a12, emissive: 0xff5ce1, emissiveIntensity: 0.9 }));
  scr.position.set(22.3, 1.35, 15.98); scr.rotation.y = Math.PI; floor1.add(scr);
}
// PANTRY
floor1.add(box(4.4, 0.95, 0.9, MAT.wood, 26.7, 0.48, 14.1));
floor1.add(box(4.4, 0.08, 1.0, MAT.deskTop, 26.7, 0.99, 14.1));
[25.7, 26.7, 27.7].forEach(dx => {
  floor1.add(cyl(0.24, 0.24, 0.07, MAT.chairMesh, dx, 0.78, 13.2));
  floor1.add(cyl(0.04, 0.04, 0.75, MAT.metal, dx, 0.4, 13.2));
});
{ // cooler + shelf
  floor1.add(box(0.7, 1.5, 0.7, new THREE.MeshStandardMaterial({ color: 0xb8bdc6, roughness: 0.4, metalness: 0.3 }), 29.2, 0.75, 16.5));
  const sh = box(1.8, 2.0, 0.4, MAT.woodDark, 24.6, 1.4, 17.6); floor1.add(sh);
}
// FOYER
floor1.add(box(2.2, 1.05, 0.7, MAT.wood, 3.0, 0.52, 15.0));
floor1.add(makeChair(3.0, 15.9, 0));
// SERVER racks
[[24.2, 2.5], [25.8, 2.5], [27.4, 2.5], [24.2, 5.2], [25.8, 5.2]].forEach(p => {
  const r = makeServerRack(p[0], p[1]); floor1.add(r);
  if (r.userData.blinkers) blinkers.push(...r.userData.blinkers);
});
// plants & lamps
[[0.7, 1.2], [11.3, 7.2], [22.4, 0.8], [6.3, 17.2], [16.8, 8.6], [29.3, 8.6], [23.5, 17.3]].forEach(p => floor1.add(makePlant(p[0], p[1], rnd(0.9, 1.3))));
[[6, 4], [11.5, 13], [19.5, 14], [26.5, 13], [3.5, 13]].forEach((p, i) => floor1.add(makePendant(p[0], p[1], i % 2 === 0)));
warmLight(6, 2.6, 4, 12, 14); warmLight(19.5, 2.6, 14, 12, 14); warmLight(26.5, 2.6, 4, 10, 14);
// neon sign di dinding utara
floor1.add(makeNeonSign(15, 0.35, 0));

/* ============ furnish lantai 2 (ringkas) ============ */
// MUSHOLA: kiblat di dinding UTARA (z=0) — semua saf menghadap ke sana.
// Ikhwan x0-6: IMAM 1 sajadah paling depan (z1.0) + 2 baris makmum @3 sajadah (z2.6, z4.2).
// Akhwat x6-12: mengikuti barisan makmum ikhwan, 2 baris @4 sajadah (z2.6, z4.2), TANPA imam.
// Ruang WUDHU z6-8: sekat x6 terus sampai z8 + deret keran tiap sisi + pintu tiap sisi.
[3].forEach(dx => {
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.3), new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 1 }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(dx, 0.025, 1.0); floor2.add(rug);
});
[1.7, 3.0, 4.3].forEach(dx => [2.6, 4.2].forEach(cz => {
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.3), new THREE.MeshStandardMaterial({ color: 0x7a9a6a, roughness: 1 }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(dx, 0.02, cz); floor2.add(rug);
}));
[7.2, 8.4, 9.6, 10.8].forEach(dx => [2.6, 4.2].forEach(cz => {
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.3), new THREE.MeshStandardMaterial({ color: 0x8a6a9a, roughness: 1 }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(dx, 0.02, cz); floor2.add(rug);
}));
// Partisi sekat mushola (x6, z0-6) — kayu setinggi 1.6m dgn list atas
floor2.add(box(0.12, 1.6, 6, MAT.wood, 6, 0.8, 3));
floor2.add(box(0.18, 0.12, 6, MAT.woodDark, 6, 1.66, 3));
// Sekat wudhu (x6, z6-8) — partisi memisahkan keran ikhwan/akhwat
floor2.add(box(0.12, 1.6, 2, MAT.wood, 6, 0.8, 7));
floor2.add(box(0.18, 0.12, 2, MAT.woodDark, 6, 1.66, 7));
// Ruang wudhu: keran air di dinding barat (ikhwan) & timur (akhwat), TANPA bak/cermin.
// 4 keran per sisi menempel dinding + talang air di bawahnya.
[6.6, 7.0, 7.4, 7.8].forEach(kz => {
  floor2.add(cyl(0.03, 0.03, 0.22, MAT.metal, 0.25, 1.0, kz));
  floor2.add(cyl(0.03, 0.03, 0.22, MAT.metal, 11.75, 1.0, kz));
});
floor2.add(box(0.25, 0.12, 1.6, MAT.teal, 0.35, 0.55, 7.2));
floor2.add(box(0.25, 0.12, 1.6, MAT.teal, 11.65, 0.55, 7.2));
floor2.add(makeConfTable(17.5, 4));
for (let i = 0; i < 8; i++) {
  const an = i / 8 * Math.PI * 2;
  floor2.add(makeChair(17.5 + Math.cos(an) * 2.55, 4 + Math.sin(an) * 1.75, Math.atan2(-Math.cos(an), -Math.sin(an))));
}
[[25.0, 5.5], [27.5, 5.5]].forEach(p => floor2.add(box(1.4, 1.0, 1.4, MAT.woodDark, p[0], 0.5, p[1])));
[2.0, 4.0, 6.0].forEach(dx => floor2.add(makeSofa(dx, 15.5, Math.PI, 0x9fd8a8)));
[9.0, 11.5, 14.0].forEach(dx => { floor2.add(box(1.1, 2.2, 1.1, MAT.glass, dx, 1.1, 13.5)); floor2.add(makeChair(dx, 13.5, 0)); });
floor2.add(box(4.4, 0.95, 0.9, MAT.wood, 19.5, 0.48, 14.1));
[18.0, 19.5, 21.0].forEach(dx => { floor2.add(cyl(0.24, 0.24, 0.07, MAT.chairMesh, dx, 0.78, 13.2)); floor2.add(cyl(0.04, 0.04, 0.75, MAT.metal, dx, 0.4, 13.2)); });
[[6, 4], [17.5, 4], [11.5, 13]].forEach((p, i) => floor2.add(makePendant(p[0], p[1], i === 0, 4.6)));

/* ============ spots & routes (di-port dari office2.js) ============ */
const S = [0.9, 13.0], D_DS = [12, 4], D_SE = [17, 4], D_ES = [23, 4];
const D_FC = [7, 13], D_CL = [16, 13], D_LP = [23, 13];
const H_DF = [3.1, 8], H_DC = [10.1, 8], H_SL = [15.1, 8], H_EL = [20.1, 8], H_SP = [26.1, 8];
const SPOTS = [];
function rt() { const a = [S]; for (let i = 0; i < arguments.length; i++) a.push(arguments[i]); return a; }
function seat(x, y, face, route, zone, fl, ang) { SPOTS.push({ x, y, face, route, zone, fl: fl || 0, taken: null, ang: ang }); }
[1.6, 4.1, 6.6, 9.1].forEach(dx => [2.0, 5.2].forEach(dy => {
  const cy = dy + 1.05; seat(dx, cy, 'back', rt(H_DF, [dx, 7.2], [dx, cy]), 'dev');
}));
[13.0, 14.5, 16.0].forEach(dx => seat(dx, 4.4, 'back', rt(H_DF, [6, 4], D_DS, [dx, 4.4]), 'stand'));
seat(20, 5.4, 'back', rt(H_DF, [6, 4], D_DS, D_SE, [20, 5.4]), 'exec');
for (let ci = 0; ci < 8; ci++) {
  const an = ci / 8 * Math.PI * 2;
  const qx = 11.5 + Math.cos(an) * 2.55, qy = 13 + Math.sin(an) * 1.75;
  seat(qx, qy, 'front', rt(D_FC, [9, 13], [qx, qy]), 'conf', 0, Math.atan2(11.5 - qx, 13 - qy));
}
[7.9, 8.75, 9.6].forEach(dx => seat(dx, 10.1, 'back', rt(D_FC, [8.3, 11], [dx, 10.1]), 'war'));
seat(17.6, 15.6, 'front', rt(D_FC, D_CL, [17.6, 15.6]), 'lounge');
seat(18.8, 15.6, 'front', rt(D_FC, D_CL, [18.8, 15.6]), 'lounge');
seat(20.5, 10.8, 'front', rt(D_FC, D_CL, [20.5, 10.8]), 'lounge');
seat(21.9, 15.9, 'front', rt(D_FC, D_CL, [21.9, 15.9]), 'lounge');
seat(20.2, 17.4, 'back', rt(D_FC, D_CL, [20.2, 17.4]), 'lounge');
seat(21.4, 17.4, 'back', rt(D_FC, D_CL, [21.4, 17.4]), 'lounge');
seat(22.6, 17.0, 'back', rt(D_FC, D_CL, [22.6, 17.0]), 'lounge');
[25.7, 26.7, 27.7].forEach(dx => seat(dx, 13.2, 'front', rt(D_FC, D_CL, D_LP, [dx, 13.2]), 'pantry'));
seat(3.0, 15.9, 'front', rt([2, 14.5], [3.0, 15.9]), 'foyer');
// lantai 2 — mushola: IMAM (x3,z1.0) + 2 baris makmum ikhwan @3 (z2.6,z4.2) +
// 2 baris makmum akhwat @4 (z2.6,z4.2, TANPA imam), wudhu z6-8
seat(3, 1.9, 'front', rt(H_DF, [3, 7.2], [3, 1.9]), 'mushola', 1);
[1.7, 3.0, 4.3].forEach(dx => [2.6, 4.2].forEach(dy => {
  seat(dx, dy + 0.9, 'back', rt(H_DF, [dx, 7.2], [dx, dy + 0.9]), 'mushola', 1);
}));
[7.2, 8.4, 9.6, 10.8].forEach(dx => [2.6, 4.2].forEach(dy => {
  seat(dx, dy + 0.9, 'back', rt(H_DF, [dx, 7.2], [dx, dy + 0.9]), 'mushola', 1);
}));
for (let mi = 0; mi < 8; mi++) {
  const an = mi / 8 * Math.PI * 2;
  const mx = 17.5 + Math.cos(an) * 2.55, my = 4 + Math.sin(an) * 1.75;
  seat(mx, my, 'front', rt(H_DF, [6, 4], D_DS, [mx, my]), 'meet2', 1, Math.atan2(17.5 - mx, 4 - my));
}
[25.0, 27.5].forEach(dx => seat(dx, 5.5, 'front', rt(H_DF, [6, 4], D_DS, D_SE, [dx, 5.5]), 'gudang', 1));
[2.0, 4.0, 6.0].forEach(dx => seat(dx, 15.5, 'front', rt([2, 14.5], [dx, 15.5]), 'roof', 1));
[9.0, 11.5, 14.0].forEach(dx => seat(dx, 13.5, 'back', rt(D_FC, [9, 13], [dx, 13.5]), 'booth', 1));
[18.0, 19.5, 21.0].forEach(dx => seat(dx, 13.2, 'front', rt(D_FC, D_CL, [dx, 13.2]), 'pantry2', 1));

function freeSpots(zone, fl) {
  return SPOTS.map((s, i) => ({ s, i })).filter(o => (zone === undefined || o.s.zone === zone) && (fl === undefined || o.s.fl === fl) && !o.s.taken);
}
function spawnWp(sp) { return sp.route.slice(1); }
function leaveWp(sp) { return sp.route.slice().reverse().slice(1); }

/* ============ agents ============ */
const KINDC = { main: 0xe8b93c, sub: 0x3f8cff, worker: 0x3ddc84 };
const SKINS = [0xf6cf9a, 0xe8b078, 0xc98d5a, 0x8d5f36];
const agents = new Map();
const bySession = {}, byAgent = {};
let agentSeq = 0, filterKind = null, followId = null;
const agentsGroup = new THREE.Group(); scene.add(agentsGroup);

class Agent {
  constructor(o) {
    this.id = 'a' + (++agentSeq);
    this.sessionId = o.sessionId || null; this.agentId = o.agentId || null;
    this.kind = o.kind || 'worker';
    this.project = o.project || null; this.lockedProj = !!o.project;
    this.label = o.label || 'Sesi';
    this.st = 'walk'; this.wp = []; this.wpi = 0; this.speed = rnd(2.6, 3.4);
    this.spot = null; this.fl = 0;
    this.bubbleUntil = 0; this.bubbleSrc = null; this.bubbleFull = ''; this.workT = 0; this.bobPh = rnd(0, 6);
    this.phase = rnd(0, 6); this.sitAmt = 0; this.seated = true; this.baseY = 0;
    this.blinkAt = performance.now() + rnd(1000, 4000); this.blinkFrom = 0;
    this.buildBody();
    this.g.scale.setScalar(rnd(0.92, 1.06));
    this.g.position.set(S[0], 0, S[1]);
    agentsGroup.add(this.g);
    agents.set(this.id, this);
  }
  buildBody() {
    const g = this.g = new THREE.Group();
    const shirtM = new THREE.MeshStandardMaterial({ color: KINDC[this.kind] || 0x3ddc84, roughness: 0.8 });
    const pantsM = new THREE.MeshStandardMaterial({ color: pick([0x2e3d63, 0x3a4a5a, 0x2f5a3a, 0x23232e]), roughness: 0.85 });
    const skinM = new THREE.MeshStandardMaterial({ color: pick(SKINS), roughness: 0.6 });
    const hairM = new THREE.MeshStandardMaterial({ color: pick([0x2b2118, 0x4a3220, 0x7a5230, 0x141414, 0xb56a2e]), roughness: 0.9 });
    // kaki dua segmen (paha + lutut)
    const mkLeg = (sx) => {
      const hip = new THREE.Group(); hip.position.set(0.11 * sx, 0.8, 0);
      hip.add(box(0.14, 0.4, 0.16, pantsM, 0, -0.2, 0));
      const knee = new THREE.Group(); knee.position.set(0, -0.4, 0); hip.add(knee);
      knee.add(box(0.12, 0.36, 0.14, pantsM, 0, -0.18, 0));
      knee.add(box(0.13, 0.09, 0.27, MAT.black, 0, -0.38, 0.05));
      hip.userData.knee = knee; g.add(hip);
      return hip;
    };
    this.legL = mkLeg(-1); this.legR = mkLeg(1);
    // torso (bisa menunduk)
    this.torsoG = new THREE.Group(); this.torsoG.position.set(0, 0.83, 0); g.add(this.torsoG);
    this.torsoG.add(box(0.44, 0.58, 0.27, shirtM, 0, 0.29, 0));
    // lengan (bahu + siku)
    const mkArm = (sx) => {
      const sh = new THREE.Group(); sh.position.set(0.29 * sx, 0.53, 0);
      sh.add(box(0.11, 0.32, 0.12, shirtM, 0, -0.16, 0));
      const el = new THREE.Group(); el.position.set(0, -0.32, 0); sh.add(el);
      el.add(box(0.1, 0.28, 0.11, skinM, 0, -0.14, 0));
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), skinM);
      hand.position.y = -0.3; hand.castShadow = true; el.add(hand);
      sh.userData.elbow = el; this.torsoG.add(sh);
      return sh;
    };
    this.armL = mkArm(-1); this.armR = mkArm(1);
    this.elbowL = this.armL.userData.elbow; this.elbowR = this.armR.userData.elbow;
    // kepala + wajah + rambut varian
    this.headG = new THREE.Group(); this.headG.position.set(0, 0.69, 0); this.torsoG.add(this.headG);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 14), skinM);
    head.castShadow = true; this.headG.add(head);
    const eyeM = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.3 });
    this.eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), eyeM);
    this.eyeL.position.set(-0.075, 0.03, 0.175); this.headG.add(this.eyeL);
    this.eyeR = this.eyeL.clone(); this.eyeR.position.x = 0.075; this.headG.add(this.eyeR);
    const hv = Math.floor(rnd(0, 4));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.215, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM);
    cap.position.y = 0.03;
    if (hv === 3) {
      const hatM = new THREE.MeshStandardMaterial({ color: pick([0xe05252, 0x3f8cff, 0x23232e]), roughness: 0.8 });
      this.headG.add(cyl(0.21, 0.215, 0.1, hatM, 0, 0.14, 0));
      this.headG.add(box(0.2, 0.03, 0.2, hatM, 0, 0.1, 0.24));
    } else {
      this.headG.add(cap);
      if (hv === 1) this.headG.add(box(0.3, 0.4, 0.14, hairM, 0, -0.12, -0.15));
      if (hv === 2) {
        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), hairM);
        bun.position.set(0, 0.22, -0.1); bun.castShadow = true; this.headG.add(bun);
      }
    }
    this.labelSp = textSprite(this.label, { fontSize: 40, scale: 0.85, border: '#e8b93c' });
    this.labelSp.position.y = 2.08; g.add(this.labelSp);
    this.bubbleSp = null;
  }
  setLabel(t) {
    this.label = t;
    const ns = textSprite(t, { fontSize: 40, scale: 0.85, border: '#e8b93c' });
    ns.position.y = 2.08; this.g.remove(this.labelSp); this.g.add(ns); this.labelSp = ns;
  }
  say(txt, ms, src) {
    // src wajib: 'event' (tool/chat/sistem) atau 'idle' (ocehan).
    // Tanpa src (undefined) = event — jangan dibuang, itu bubble tool/chat.
    const s = src || 'event';
    if (s !== 'event' && s !== 'idle') return;
    if (s === 'idle' && this.bubbleSrc === 'event' && this.bubbleUntil > performance.now()) return;
    if (this.bubbleSp) { try { this.g.remove(this.bubbleSp); } catch (e) {} this.bubbleSp = null; this.bubbleCv = null; this.bubbleTx = null; }
    let full = String(txt == null ? '' : txt).replace(/\s+/g, ' ').trim();
    if (!full) return;
    if (full.length > 220) full = full.slice(0, 220) + '…';
    this.bubbleFull = full; this.bubbleSrc = s;
    this.bubbleWin = full.length > 42; // running text kalau kepanjangan
    const shown = this.bubbleWin ? full.slice(0, 42) : full;
    const sp = textSprite(shown, { fontSize: 38, scale: 0.8, color: '#f2f4f8', border: '#e8b93c' });
    if (!sp) return;
    sp.position.y = 2.62; this.g.add(sp); this.bubbleSp = sp;
    try {
      this.bubbleCv = sp.material.map.image; this.bubbleTx = sp.material.map;
    } catch (e) { this.bubbleCv = null; this.bubbleTx = null; }
    // Durasi: cukup lama untuk dibaca + muter 1x kalau running text.
    // running text 180ms/char window → full muter butuh len*180ms; tambah baca 3.5s.
    const need = this.bubbleWin ? (full.length * 180 + 3500) : (ms || 3200);
    this.bubbleMs = Math.min(Math.max(ms || need, 2500), 30000);
    this.bubbleUntil = performance.now() + this.bubbleMs;
    this._mqStep = -1;
  }
  walkTo(wp, then) { this.wp = wp.map(p => Array.isArray(p) ? { x: p[0], z: p[1] } : { x: p.x, z: p.z }); this.wpi = 0; this.st = 'walk'; this.then = then || null; }
  update(dt, now) {
    if (this.bubbleSp && now > this.bubbleUntil) { this.g.remove(this.bubbleSp); this.bubbleSp = null; this.bubbleCv = null; this.bubbleTx = null; }
    else if (this.bubbleSp && this.bubbleWin && this.bubbleCv) {
      // running text: geser jendela 42 char tiap ~180ms, muter
      const full = this.bubbleFull || '';
      const step = Math.floor(now / 180);
      if (step !== this._mqStep && full.length > 42) {
        this._mqStep = step;
        const off = step % full.length;
        let win = (full + '   •   ' + full).slice(off, off + 42);
        const c = this.bubbleCv.getContext('2d');
        const W = this.bubbleCv.width, H = this.bubbleCv.height;
        c.clearRect(0, 0, W, H);
        c.fillStyle = 'rgba(10,12,18,0.88)';
        const r = 14;
        c.beginPath(); c.moveTo(r, 0); c.arcTo(W, 0, W, H, r); c.arcTo(W, H, 0, H, r); c.arcTo(0, H, 0, 0, r); c.arcTo(0, 0, W, 0, r); c.closePath(); c.fill();
        c.strokeStyle = '#e8b93c'; c.lineWidth = 3; c.stroke();
        c.font = 'bold 38px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#f2f4f8'; c.fillText(win, W / 2, H / 2 + 2);
        this.bubbleTx.needsUpdate = true;
      }
    }
    this.g.visible = (showFloors.includes(this.fl) || this.st === 'inlift') && (!filterKind || this.kind === filterKind);
    const walking = this.st === 'walk' && this.wp.length > 0;
    const sitTarget = (this.st === 'working' && this.seated) ? 1 : 0;
    this.sitAmt += clamp(sitTarget - this.sitAmt, -dt * 5, dt * 5);
    const s = this.sitAmt;
    const typing = (this.st === 'working' && this.seated) ? 1 : 0;
    if (walking) {
      this.phase += dt * this.speed * 4.2;
      const sw = Math.sin(this.phase);
      this.legL.rotation.x = sw * 0.62; this.legR.rotation.x = -sw * 0.62;
      this.legL.userData.knee.rotation.x = Math.max(0, Math.sin(this.phase - 0.7)) * 0.9 + 0.06;
      this.legR.userData.knee.rotation.x = Math.max(0, Math.sin(this.phase + Math.PI - 0.7)) * 0.9 + 0.06;
      this.armL.rotation.x = -sw * 0.5; this.armR.rotation.x = sw * 0.5;
      this.elbowL.rotation.x = -0.35; this.elbowR.rotation.x = -0.35;
      this.torsoG.rotation.x = 0.07; this.headG.rotation.x = 0; this.headG.rotation.y = 0;
      const t = this.wp[this.wpi];
      const dx = t.x - this.g.position.x, dz = t.z - this.g.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.14) {
        this.wpi++;
        if (this.wpi >= this.wp.length) { this.wp = []; const th = this.then; this.then = null; if (th) th(); else this.st = 'idle'; }
      } else {
        const v = Math.min(this.speed * dt, d);
        this.g.position.x += dx / d * v; this.g.position.z += dz / d * v;
        this.g.rotation.y = Math.atan2(dx, dz);
      }
      this.g.position.y = this.baseY + Math.abs(Math.cos(this.phase)) * 0.05;
    } else if (this.st === 'pray') {
      // duduk sila di sajadah: paha buka ke samping, lutut lipat penuh, badan tegak, tangan di paha
      const k = Math.min(1, dt * 5);
      this.legL.rotation.set(-1.35, 0, -1.15); this.legR.rotation.set(-1.35, 0, 1.15);
      this.legL.userData.knee.rotation.x += (2.1 - this.legL.userData.knee.rotation.x) * k;
      this.legR.userData.knee.rotation.x += (2.1 - this.legR.userData.knee.rotation.x) * k;
      this.torsoG.rotation.x += (0.02 - this.torsoG.rotation.x) * k;
      this.headG.rotation.x += ((Math.sin(now * 0.0009 + this.bobPh) * 0.06 - 0.05) - this.headG.rotation.x) * k;
      this.headG.rotation.y *= (1 - k);
      this.armL.rotation.set(-0.55, 0, -0.25); this.armR.rotation.set(-0.55, 0, 0.25);
      this.elbowL.rotation.x += (-0.35 - this.elbowL.rotation.x) * k;
      this.elbowR.rotation.x += (-0.35 - this.elbowR.rotation.x) * k;
      const yP = this.baseY - 0.52;
      this.g.position.y += (yP - this.g.position.y) * k;
      this.workT += 0; // ibadah bukan kerja — workT tidak jalan
    } else {
      const k = Math.min(1, dt * 7);
      const legT = -1.5 * s, kneeT = 0.06 + 1.42 * s;
      this.legL.rotation.x += (legT - this.legL.rotation.x) * k;
      this.legR.rotation.x += (legT - this.legR.rotation.x) * k;
      this.legL.userData.knee.rotation.x += (kneeT - this.legL.userData.knee.rotation.x) * k;
      this.legR.userData.knee.rotation.x += (kneeT - this.legR.userData.knee.rotation.x) * k;
      const armT = -0.78 * typing, elbT = -0.12 - 0.9 * typing;
      this.armL.rotation.x += (armT - this.armL.rotation.x) * k;
      this.armR.rotation.x += (armT - this.armR.rotation.x) * k;
      this.elbowL.rotation.x += (elbT - this.elbowL.rotation.x) * k;
      this.elbowR.rotation.x += (elbT - this.elbowR.rotation.x) * k;
      this.torsoG.rotation.x += ((0.15 * s) - this.torsoG.rotation.x) * k;
      this.headG.rotation.x += ((0.3 * s) - this.headG.rotation.x) * k;
      const yT = this.baseY - 0.34 * s + (this.st === 'working' ? Math.abs(Math.sin(now * 0.004 + this.bobPh)) * 0.02 : 0);
      this.g.position.y += (yT - this.g.position.y) * k;
      if (this.st === 'working') {
        this.workT += dt;
        if (typing) this.headG.rotation.y = Math.sin(now * 0.0011 + this.bobPh) * 0.14;
      }
      if (this.st === 'pray') {
        this.prayT = (this.prayT === undefined ? 14 : this.prayT) - dt;
        if (this.prayT <= 0 && this.spot) {
          const back = this.spot; this.spot.taken = null; this.spot = null;
          const fs = (typeof freeSpotFor === 'function') ? freeSpotFor(this.fl) : null;
          if (fs && this.fl === back.fl) { fs.s.taken = this; this.walkTo([{ x: fs.s.x, z: fs.s.y }], () => this.sitAt(fs.s)); }
          else if (typeof sendAgentViaLift === 'function') { this.walkTo(routeToLift(this), () => { this.st = 'waitlift'; this.g.rotation.y = Math.PI; lift.queue.push({ agent: this, toFl: 0, phase: 'board' }); }); }
          else this.st = 'working';
        }
      }
    }
    if (now > this.blinkAt) { this.blinkAt = now + rnd(2200, 5200); this.blinkFrom = now; }
    const bl = (now - this.blinkFrom < 140) ? 0.12 : 1;
    this.eyeL.scale.y = bl; this.eyeR.scale.y = bl;
  }
  sitAt(spot) {
    this.spot = spot; spot.taken = this; this.fl = spot.fl || 0;
    this.baseY = this.fl * 4.6;
    this.seated = !['stand', 'gudang', 'mushola'].includes(spot.zone);
    this.g.position.set(spot.x, this.baseY, spot.y);
    // Hadap: sudut eksplisit (kursi meeting melingkar) > face back/front.
    // Kursi meeting: agen duduk di tepi meja menghadap ke tengah meja.
    this.g.rotation.y = (spot.ang !== undefined && spot.ang !== null) ? spot.ang : (spot.face === 'back' ? Math.PI : 0);
    if (spot.zone === 'mushola') { this.st = 'pray'; this.prayT = 14; this.say('sholat dulu 🤲', 4000, 'idle'); }
    else this.st = 'working';
  }
  leave() {
    if (this.spot) { this.spot.taken = null; this.spot = null; }
    this.st = 'leave';
    this.say('bye…', 2000);
    if (this.fl === 1) this.walkTo(routeToLift(this), () => this.destroy());
    else this.walkTo([{ x: S[0], z: S[1] }], () => this.destroy());
  }
  idleAfterDone() {
    // Session selesai tapi agen tetap nongkrong: lepas status kerja,
    // jalan santai ke lounge/pantry/rooftop lalu idle (duduk santai).
    // Meja kerja dilepas supaya sesi lain bisa pakai; hangout TIDAK ambil
    // zona kerja (dev/stand/exec/conf/war) biar beneran kelihatan santai.
    if (this.spot) { this.spot.taken = null; this.spot = null; }
    this.st = 'idle'; this.workT = 0;
    this.say('beres ✓ santai dulu…', 3500, 'event');
    let hangout = null;
    if (typeof freeSpots === 'function') {
      for (const z of ['lounge', 'pantry', 'pantry2', 'roof', 'foyer']) {
        const f = freeSpots(z, 0);
        if (f.length) { hangout = f[Math.floor(Math.random() * f.length)]; break; }
      }
      if (!hangout) for (const z of ['lounge', 'pantry', 'pantry2', 'roof', 'foyer']) {
        const f = freeSpots(z, 1);
        if (f.length) { hangout = f[Math.floor(Math.random() * f.length)]; break; }
      }
    }
    const sp = hangout ? hangout.s : null;
    if (sp && sp.x != null) {
      const go = () => { this.sitAt(sp); this.st = 'idle'; };
      // route() = waypoints menuju spot; pakai spawnWp (jalur masuk), bukan mentah [x,z]
      const via = (typeof spawnWp === 'function') ? spawnWp(sp) : [{ x: sp.x, z: sp.y }];
      if (this.fl === 1 && (sp.fl || 0) === 0) this.walkTo(routeToLift(this), () => this.walkTo(routeFromLift(sp), go));
      else if (this.fl === 0 && (sp.fl || 0) === 1) this.walkTo(routeToLift(this), () => this.walkTo(routeFromLift(sp), go));
      else this.walkTo(via, go);
    }
  }
  destroy() {
    agentsGroup.remove(this.g);
    agents.delete(this.id);
    if (bySession[this.sessionId] === this.id) delete bySession[this.sessionId];
    if (this.agentId && byAgent[this.agentId] === this.id) delete byAgent[this.agentId];
    if (followId === this.id) stopFollow();
    updateCount();
  }
}
function updateCount() {
  elCount.textContent = agents.size + ' ' + T('active');
  try { renderAgentList(); } catch (e) {}
}
function freeSpotFor(fl, excludeMushola) {
  fl = (fl === undefined ? (Math.random() < 0.5 ? 0 : 1) : fl);
  const pref = ['dev', 'stand', 'exec', 'conf', 'lounge', 'pantry', 'foyer'];
  // NOTE: 'mushola' TIDAK masuk pref — musala khusus ibadah, bukan tempat kerja
  for (const z of pref) { const f = freeSpots(z, fl); if (f.length) return f[Math.floor(Math.random() * f.length)]; }
  let any = freeSpots(undefined, fl);
  if (excludeMushola !== false) any = any.filter(o => o.s.zone !== 'mushola');
  if (!any.length) any = freeSpots(undefined, fl).filter(o => o.s.zone !== 'mushola');
  return any.length ? any[Math.floor(Math.random() * any.length)] : null;
}

/* ============ activity log & HUD ============ */
const ALOG_MAX = 100, LOGPER = 10;
let LOGSTORE = [], LOGPAGE = 0;
function logEvClass(icon){
  if(icon==='🟢'||icon==='🚪') return 'ev-join';
  if(icon==='⚙') return 'ev-tool';
  if(icon==='💬') return 'ev-chat';
  if(icon==='🔴'||icon==='🚶') return 'ev-leave';
  return 'ev-sys';
}
function logActivity(icon, html) {
  const key = icon + '|' + String(html).replace(/<[^>]*>/g, '').slice(0, 60);
  const tm = new Date();
  const ts = String(tm.getHours()).padStart(2,'0') + ':' + String(tm.getMinutes()).padStart(2,'0') + ':' + String(tm.getSeconds()).padStart(2,'0');
  const f = LOGSTORE[0];
  if (f && f.key === key && (Date.now() - f.t) < 8000) { f.n++; f.ts = ts; f.t = Date.now(); }
  else LOGSTORE.unshift({ key, icon, msg: html, ts, t: Date.now(), n: 1 });
  while (LOGSTORE.length > ALOG_MAX) LOGSTORE.pop();
  LOGPAGE = 0;
  renderLogPage();
}
function renderLogPage(){
  const list = document.getElementById('hoAlog'); if(!list) return;
  list.innerHTML = '';
  const pages = Math.max(1, Math.ceil(LOGSTORE.length / LOGPER));
  if (LOGPAGE > pages - 1) LOGPAGE = pages - 1;
  LOGSTORE.slice(LOGPAGE * LOGPER, LOGPAGE * LOGPER + LOGPER).forEach(e => {
    const div = document.createElement('div');
    div.className = 'ho-arow ' + logEvClass(e.icon);
    div.title = e.ts + ' ' + String(e.msg).replace(/<[^>]*>/g, '');
    div.innerHTML = '<span class="t">' + e.ts + '</span><span class="b">' + e.icon + ' ' + e.msg + (e.n > 1 ? ' <span class="n">×' + e.n + '</span>' : '') + '</span>';
    list.appendChild(div);
  });
  const pg = document.getElementById('hoLogPage');
  if (pg) pg.textContent = (LOGPAGE + 1) + '/' + pages;
  const pv = document.getElementById('hoLogPrev'), nx = document.getElementById('hoLogNext');
  if (pv) pv.disabled = LOGPAGE <= 0;
  if (nx) nx.disabled = LOGPAGE >= pages - 1;
}
let LANG = localStorage.getItem('hoLang') || 'id';
const I18N = {
  id: { connecting:'menghubungkan…', connected:'terhubung', disconnected:'terputus — retry…', preview:'preview mode (tanpa backend)',
    waiting:'Menunggu misi…', active:'aktif', clear:'Clear', pause:'Pause', resume:'Resume', filter:'Filter:', all:'All',
    reset:'⤢ Reset', planOn:'Denah: on', planOff:'Denah: off', rainOn:'Hujan: on', rainOff:'Hujan: off',
    viewAll:'Lihat: Semua', viewLt:'Lihat: Lt ', hint:'drag: orbit • scroll: zoom • klik agen: follow',
    activityLog:'Log Activity', live:'Live', agents:'Agents', shortcut:'Shortcut', noAgents:'belum ada agen',
    online:'Hermes Office 3D online', demoOn:'demo mode on', demoOff:'demo mode off', cleared:'cleared',
    rainStart:'hujan turun…', rainStop:'hujan reda', viewAllLog:'semua lantai', viewLtLog:'lantai ',
    planLog:'POV atas (denah) ', filterLog:'filter: ', walking:'🚶 jalan', inlift:'🛗 di lift', leaving:'👋 keluar',
    coffee:'☕ ngopi', chill:'😎 santai', meeting:'🗣️ meeting', pray:'🤲 sholat', server:'🖥️ server', sitting:'🪑 duduk', working:'💻 kerja',
    proj:'Project', sess:'Session', zone:'Zona', status:'Status', caption:'Visualisasi live session (3D). Klik agen untuk detail + follow. POST event ke <code>/hook</code> • stream via SSE <code>/events</code> • contoh hook Hermes di <code>hooks-example.yaml</code>' },
  en: { connecting:'connecting…', connected:'connected', disconnected:'disconnected — retry…', preview:'preview mode (no backend)',
    waiting:'Waiting for mission…', active:'active', clear:'Clear', pause:'Pause', resume:'Resume', filter:'Filter:', all:'All',
    reset:'⤢ Reset', planOn:'Plan: on', planOff:'Plan: off', rainOn:'Rain: on', rainOff:'Rain: off',
    viewAll:'View: All', viewLt:'View: Lvl ', hint:'drag: orbit • scroll: zoom • click agent: follow',
    activityLog:'Activity Log', live:'Live', agents:'Agents', shortcut:'Shortcut', noAgents:'no agents yet',
    online:'Hermes Office 3D online', demoOn:'demo mode on', demoOff:'demo mode off', cleared:'cleared',
    rainStart:'rain started…', rainStop:'rain stopped', viewAllLog:'all floors', viewLtLog:'floor ',
    planLog:'Top POV (plan) ', filterLog:'filter: ', walking:'🚶 walking', inlift:'🛗 in lift', leaving:'👋 leaving',
    coffee:'☕ coffee', chill:'😎 chilling', meeting:'🗣️ meeting', pray:'🤲 praying', server:'🖥️ server', sitting:'🪑 seated', working:'💻 working',
    proj:'Project', sess:'Session', zone:'Zone', status:'Status', caption:'Live session visualization (3D). Click an agent for details + follow. POST events to <code>/hook</code> • stream via SSE <code>/events</code> • Hermes hook example in <code>hooks-example.yaml</code>' }
};
function T(k){ return (I18N[LANG] && I18N[LANG][k]) || I18N.id[k] || k; }
function applyLang(){
  document.querySelectorAll('[data-i18n]').forEach(n => {
    const k = n.getAttribute('data-i18n');
    if (k === 'caption') n.innerHTML = T('caption');
    else n.textContent = T(k);
  });
  const b = document.querySelector('[data-i18n-filter]');
  if (b && !filterKind) b.textContent = T('all');
  const lb = $('hoLang'); if (lb) lb.textContent = LANG.toUpperCase();
  try { localStorage.setItem('hoLang', LANG); } catch (e) {}
  // refresh label dinamis
  try { updateCount(); renderAgentList(); } catch (e) {}
  if (typeof denah !== 'undefined') $('hoTop').textContent = denah ? T('planOn') : T('planOff');
  if (typeof rainOn !== 'undefined') $('hoRain').textContent = rainOn ? T('rainOn') : T('rainOff');
  if (typeof showMode !== 'undefined') $('hoFloor').textContent = showMode === 0 ? T('viewAll') : T('viewLt') + showMode;
}
function hudMission(t, alert) {
  elMtext.innerHTML = t;
  elMdot.style.background = alert ? '#ff5a5a' : '#3ddc84';
  elMdot.style.boxShadow = `0 0 8px ${alert ? '#ff5a5a' : '#3ddc84'}`;
}
function hudLog(html) {
  const d = el('div', 'ho-lrow', html);
  elMlog.prepend(d);
  while (elMlog.children.length > 10) elMlog.lastChild.remove();
}
let officeProject = '';
function noteProject(p) {
  if (p && !officeProject) { officeProject = p; setOfficeProject(p); }
}

/* ============ incident ============ */
let incident = null, incidentLight = null;
function triggerIncident(text, by) {
  const now = performance.now();
  if (incident && now < incident.until) { incident.text = text; if (warRedraw) warRedraw(true, text); return; }
  incident = { text, until: now + 14000 };
  if (warRedraw) warRedraw(true, text);
  if (!incidentLight) { incidentLight = new THREE.PointLight(0xff3b3b, 0, 20, 1.5); incidentLight.position.set(8.75, 3, 9.5); scene.add(incidentLight); }
  hudMission('🚨 INCIDENT: ' + String(text).slice(0, 40), true);
  hudLog('<span style="color:#ff6b6b">🚨 ' + text + '</span>');
  logActivity('🚨', text);
  beep(220, 0.3, 'square', 0.05);
  const team = [];
  if (by && agents.has(by.id) && by.st === 'working' && by.fl === 0) team.push(by);
  agents.forEach(o => {
    if (team.length >= 3) return;
    if (o !== by && o.st === 'working' && o.fl === 0 && (o.spot && ['dev', 'stand', 'exec'].includes(o.spot.zone))) team.push(o);
  });
  const free = freeSpots('war', 0);
  team.forEach((a, n) => {
    if (n >= free.length) return;
    const sp = free[n].s;
    if (a.spot) { a.spot.taken = null; }
    a.spot = sp; sp.taken = a;
    a.st = 'walk';
    a.walkTo([{ x: 8.3, z: 11 }, { x: sp.x, z: sp.y }], () => { a.st = 'working'; a.g.rotation.y = Math.PI; });
    if (n !== 0) a.say('otw…', 3000);
  });
}
function endIncident() {
  if (!incident) return;
  incident = null;
  if (warRedraw) warRedraw(false);
  if (incidentLight) incidentLight.intensity = 0;
  hudMission(T('waiting'));
  hudLog('<span style="color:#3ddc84">✓ incident resolved</span>');
  logActivity('✅', 'incident resolved');
}

/* ============ hermes error bar (atas dashboard) ============ */
const HERMES_ERRORS = [];
function showHermesError(text, src) {
  const bar = $('hoErrbar'), tx = $('hoErrText');
  if (!bar || !tx) return;
  const tm = new Date();
  const ts = String(tm.getHours()).padStart(2, '0') + ':' + String(tm.getMinutes()).padStart(2, '0') + ':' + String(tm.getSeconds()).padStart(2, '0');
  HERMES_ERRORS.unshift({ ts, text: String(text).slice(0, 200), src: src || '' });
  while (HERMES_ERRORS.length > 5) HERMES_ERRORS.pop();
  tx.innerHTML = '<b>🚨 Hermes error</b> [' + ts + '] ' + escHtml(String(text).slice(0, 200)) +
    (HERMES_ERRORS.length > 1 ? ' <span style="opacity:.6">(+' + (HERMES_ERRORS.length - 1) + ' lainnya)</span>' : '') +
    '<span style="opacity:.55"> — klik ✕ untuk tutup, riwayat di Activity Log</span>';
  bar.style.display = 'flex';
  logActivity('🚨', '<b>Hermes error</b>' + (src ? ' [' + escHtml(src) + ']' : '') + ': ' + escHtml(String(text).slice(0, 140)));
}

/* ============ SSE bridge ============ */
function spawnMissing(m, kind) {
  // fallback ala 2D: tool/message tanpa session_start tetap spawn agen
  const label = m.project || 'Sesi';
  const a = new Agent({ sessionId: m.sessionId || null, agentId: m.agent_id || m.agentId || null,
    kind: kind || 'worker', project: m.project || null, label });
  if (m.sessionId) bySession[m.sessionId] = a.id;
  const aid = m.agent_id || m.agentId; if (aid) byAgent[aid] = a.id;
  const flSpawn = Math.random() < 0.5 ? 0 : 1;
  const fs = (typeof freeSpotFor === 'function') ? freeSpotFor(flSpawn) : null;
  if (fs) {
    fs.s.taken = a; a.spot = fs.s; a.fl = flSpawn;
    if (flSpawn === 1 && typeof routeFromLift === 'function') {
      a.baseY = 4.6;
      a.g.position.set(LIFT.x, 4.6, LIFT.z + 2.4);
      a.walkTo(routeFromLift(fs.s), () => a.sitAt(fs.s));
    } else if (typeof spawnWp === 'function') a.walkTo(spawnWp(fs.s), () => a.sitAt(fs.s));
    else { a.st = 'working'; }
  } else { a.st = 'working'; }
  if (m.project) { a.lockedProj = true; }
  updateCount();
  return a;
}
function findAgent(m) {
  const key = m.agentId || m.agent_id;
  if (m.sessionId && bySession[m.sessionId]) return agents.get(bySession[m.sessionId]) || null;
  if (key && byAgent[key]) return agents.get(byAgent[key]) || null;
  return null;
}
function handleEvent(m, isReplay) {
  if (!m || typeof m !== 'object') return;
  if (m.kind === 'hello') return;
  if (m.project) noteProject(m.project);
  const key = m.agentId || m.agent_id || (m.sessionId ? 'sess:' + m.sessionId : null);
  switch (m.kind) {
    case 'session_start': {
      let a = (m.sessionId && bySession[m.sessionId] && agents.get(bySession[m.sessionId])) || null;
      if (!a && m.project) {
        agents.forEach(x => { if (!a && x.kind === 'main' && x.project === m.project) a = x; });
      }
      const label = m.project || 'Sesi';
      if (!a) {
        a = new Agent({ sessionId: m.sessionId, agentId: m.agent_id || m.agentId, kind: m.sessionId === 'main' ? 'main' : (m.kind === 'main' ? 'main' : 'worker'), project: m.project || null, label });
        if (m.sessionId) bySession[m.sessionId] = a.id;
        const aid = m.agent_id || m.agentId; if (aid) byAgent[aid] = a.id;
        const flSpawn = Math.random() < 0.5 ? 0 : 1;
        const fs = freeSpotFor(flSpawn);
        if (fs) {
          fs.s.taken = a; a.spot = fs.s; a.fl = flSpawn;
          if (flSpawn === 1) {
            a.baseY = 4.6;
            a.g.position.set(LIFT.x, 4.6, LIFT.z + 2.4);
            a.walkTo(routeFromLift(fs.s), () => a.sitAt(fs.s));
          } else a.walkTo(spawnWp(fs.s), () => a.sitAt(fs.s));
        }
        else { a.g.position.set(rnd(2, 8), 0, rnd(12, 16)); a.st = 'idle'; }
        beep(520, 0.07, 'sine', 0.03);
        updateCount();
      } else {
        if (m.project && !a.lockedProj) { a.project = m.project; a.setLabel(m.project); a.lockedProj = true; }
      }
      hudMission('🟢 ' + label + ' aktif');
      break;
    }
    case 'tool_start': {
      let a = findAgent(m);
      if (!a && m.sessionId) a = spawnMissing(m, 'worker');
      const det0 = String(m.detail || m.text || '').split('\n')[0].split('|')[0].slice(0, 80).trim();
      // Bubble tampilkan tool + detail singkat; >42 char otomatis running text.
      const tb = '⚙ ' + (m.tool || m.text || 'tool') + (det0 && det0 !== (m.tool || '') ? ' › ' + det0.slice(0, 90) : '');
      if (a) { a.say(tb, Math.min(15000, 5000 + tb.length * 90), 'event'); beep(700, 0.05, 'sine', 0.02); }
      hudLog('<span style="color:#9fd8ff">⚙ ' + (m.tool || m.text || '?') + '</span> <span style="opacity:.5">' + (m.project || '') + '</span>');
      { const det = String(m.detail || m.text || '').split('\n')[0].split('|')[0].slice(0, 80).trim();
        logActivity('⚙', '<b>' + escHtml(a ? a.label : (m.project || 'Sesi')) + '</b> → ' + escHtml(m.tool || 'tool') + (det ? ' <i>' + escHtml(det) + '</i>' : '')); }
      break;
    }
    case 'tool_end': {
      let a = findAgent(m);
      if (!a && m.sessionId) a = spawnMissing(m, 'worker');
      const txt = m.text || '';
      const isErr = m.isError || m.error || m.success === false || (/err|fail|gagal/i.test(txt) && txt.length < 120);
      if (isErr) {
        const emsg = String(m.error || txt || 'tool failed').slice(0, 200);
        // Replay backlog jangan picu banner/incident — cuma error LIVE.
        if (!isReplay) {
          showHermesError('⚙ ' + (m.tool || 'tool') + ': ' + emsg, m.project || (a && a.label) || '');
          triggerIncident(emsg.slice(0, 60), a);
        } else {
          logActivity('🚨', '<b>Hermes error</b> [replay]: ' + escHtml(emsg.slice(0, 140)));
        }
      }
      else if (a) a.say('✓', 1500);
      break;
    }
    case 'message': case 'reply': case 'assistant_message': {
      let a = findAgent(m);
      if (!a && m.sessionId) a = spawnMissing(m, 'worker');
      const raw = String(m.text || m.message || m.output || m.content || '').split('\n')[0].split('|')[0].split(' -H')[0].split(' --data')[0].slice(0, 140).trim();
      if (raw && !/^(curl|hook|events|POST|GET)\b/i.test(raw)) {
        const who = m.role === 'user' ? 'kamu: ' : '';
        if (a) a.say(who + raw, Math.min(15000, 5000 + raw.length * 60), 'event');
        hudLog('<span style="opacity:.85">💬 ' + raw.slice(0, 60).replace(/</g, '&lt;') + '</span>');
        logActivity('💬', '<b>' + escHtml(a ? a.label : (m.project || 'Sesi')) + '</b>: ' + escHtml(raw.slice(0, 80)));
      }
      break;
    }
    case 'typing': break;
    case 'subagent_start': {
      const a = findAgent(m);
      if (a) { a.say('🚀 ' + String(m.text || m.agent_type || 'subagent').slice(0, 30), 3000);
        logActivity('🤖', '<b>' + escHtml(a ? a.label : (m.project || 'Sesi')) + '</b> 🚀 ' + escHtml(String(m.text || m.agent_type || 'subagent').slice(0, 60))); }
      else handleEvent({ ...m, kind: 'session_start', sessionId: m.sessionId || ('sub-' + Date.now()) });
      break;
    }
    case 'subagent_end': case 'subagent_stop': break;
    case 'hermes_error': case 'error': {
      const msg = String(m.text || m.message || m.error || 'unknown error').slice(0, 300);
      // Replay backlog (refresh) jangan nyalakan banner — cuma error LIVE yang muncul di atas.
      // Riwayat error tetap bisa dilihat di Activity Log.
      if (!isReplay) {
        showHermesError(msg, m.project || m.sessionId || '');
        triggerIncident(msg.slice(0, 60), findAgent(m));
      } else {
        logActivity('🚨', '<b>Hermes error</b>' + (m.project ? ' [' + escHtml(m.project) + ']' : '') + ': ' + escHtml(msg.slice(0, 140)));
      }
      break;
    }
    case 'session_end': case 'run_end': case 'result': {
      const a = findAgent(m);
      if (a) { a.idleAfterDone(); }
      hudMission(T('waiting'));
      break;
    }
    default: {
      if (m.text && String(m.text).length < 140) hudLog('<span style="opacity:.6">' + String(m.text).replace(/</g, '&lt;') + '</span>');
    }
  }
}
let es = null, sseReplay = false, sseReplayTimer = null;
function connectSSE() {
  try { if (es) es.close(); } catch (e) { }
  elConn.className = 'ho-conn off'; elConnText.textContent = T('connecting');
  // Backlog replay (200 event terakhir) datang beruntun saat connect/refresh —
  // tandai sebagai replay supaya banner error tidak nyala dari histori.
  sseReplay = true;
  if (sseReplayTimer) clearTimeout(sseReplayTimer);
  sseReplayTimer = setTimeout(() => { sseReplay = false; }, 2500);
  try {
    es = new EventSource('/events');
  } catch (e) { es = null; elConnText.textContent = T('preview'); return; }
  es.onopen = () => { elConn.className = 'ho-conn on'; elConnText.textContent = T('connected'); };
  es.onerror = () => { elConn.className = 'ho-conn off'; elConnText.textContent = T('disconnected'); };
  es.onmessage = (ev) => { try { handleEvent(JSON.parse(ev.data), sseReplay); } catch (e) { } };
}

/* ============ rain ============ */
let rain = null, rainOn = false;
function buildRain() {
  const N = 900, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = rnd(-4, 34); pos[i * 3 + 1] = rnd(0, 26); pos[i * 3 + 2] = rnd(-4, 25); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  rain = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8cb4dc, size: 0.12, transparent: true, opacity: 0.6 }));
  rain.visible = false; scene.add(rain);
}
buildRain();

/* ============ camera: denah / follow / zoom ============ */
let denah = false, savedCam = null;
function toggleDenah() {
  denah = !denah;
  $('hoTop').textContent = denah ? T('planOn') : T('planOff');
  if (denah) {
    savedCam = { pos: camera.position.clone(), tgt: controls.target.clone() };
    camera.position.set(15, 42, 9.02); controls.target.set(15, 0, 9);
  } else if (savedCam) { camera.position.copy(savedCam.pos); controls.target.copy(savedCam.tgt); }
  logActivity('🗺', T('planLog') + (denah ? 'on' : 'off'));
}
function startFollow(a) {
  followId = a.id;
  const chip = $('hoFollowChip');
  // Matikan denah biar sorotan follow yang pegang kamera
  if (typeof denah !== 'undefined' && denah && typeof toggleDenah === 'function') toggleDenah();
  // "Lihat" ngikutin lantai si agen (bukan dibuka Semua)
  try { if (typeof syncFloorToAgent === 'function') syncFloorToAgent(a); } catch (e) {}
  // Snap kamera: target = kepala agen, posisi = miring dekat (zoom-in menyorot)
  try {
    const tp = new THREE.Vector3(a.g.position.x, (a.baseY || a.fl * 4.6) + 1.2, a.g.position.z);
    controls.target.copy(tp);
    // Offset sorot: dari depan-atas, jarak ~7 (cukup dekat lihat bubble + ruangan)
    const off = new THREE.Vector3(3.2, 4.6, 5.2);
    camera.position.copy(tp).add(off);
  } catch (e) {}
  if (chip) {
    chip.style.display = 'flex';
    const t = $('hoFollowName');
    if (t) {
      const zn = (a.spot && a.spot.zone) ? a.spot.zone : (a.st || '');
      t.textContent = a.label + ' · Lt' + ((a.fl || 0) + 1) + (zn ? ' · ' + zn : '');
    }
  }
  try {
    const zn = (a.spot && a.spot.zone) ? a.spot.zone : (a.st || '');
    logActivity('👁', 'follow <b>' + escHtml(a.label) + '</b> · Lt' + ((a.fl || 0) + 1) + (zn ? ' · ' + escHtml(zn) : ''));
  } catch (e) {}
}
function stopFollow() {
  followId = null;
  const chip = $('hoFollowChip'); if (chip) chip.style.display = 'none';
}
function setFloorView(mode, silent) {
  showMode = mode; showFloors = [[0, 1], [0], [1]][showMode];
  try {
    if (typeof floor1 !== 'undefined') { floor1.visible = showFloors.includes(0); floor2.visible = showFloors.includes(1); }
  } catch (e) {}
  const fb = $('hoFloor'); if (fb) fb.textContent = showMode === 0 ? T('viewAll') : T('viewLt') + (showMode === 1 ? '1' : '2');
  if (!silent) logActivity('🏢', T('filterLog') + (showMode === 0 ? T('viewAllLog') : T('viewLtLog') + (showMode === 1 ? '1' : '2')));
}
function syncFloorToAgent(a) {
  // Tombol "Lihat" ngikutin lantai si agen yang difollow: Lt1 -> mode 1, Lt2 -> mode 2.
  if (!a) return;
  const want = (a.fl || 0) === 1 ? 2 : 1;
  if (showMode !== want) setFloorView(want, true);
}
function setZoom(d) {
  const dir = camera.position.clone().sub(controls.target);
  const len = clamp(dir.length() * (d > 0 ? 0.8 : 1.25), controls.minDistance, controls.maxDistance);
  dir.setLength(len); camera.position.copy(controls.target).add(dir);
}

/* ============ demo mode ============ */
let demoOn = false, demoTimer = null;
const DEMO_PROJECTS = ['hermes-office', 'toko-api', 'dashboard-v2', 'bot-wa'];
function demoTick() {
  const p = pick(DEMO_PROJECTS);
  const sid = 'demo-' + Math.floor(rnd(1000, 9999));
  handleEvent({ kind: 'session_start', sessionId: sid, project: p, text: 'demo' });
  setTimeout(() => {
    const id = bySession[sid]; const a = id && agents.get(id);
    if (a) { handleEvent({ kind: 'tool_start', sessionId: sid, tool: pick(['Read', 'Edit', 'Bash', 'Glob']) }); }
  }, rnd(1200, 3000));
  setTimeout(() => {
    const id = bySession[sid];
    if (id && agents.has(id)) handleEvent({ kind: 'message', sessionId: sid, text: pick(['sip, lanjut…', 'build sukses ✓', 'cek dulu ya', 'udah di-push']) });
  }, rnd(3500, 6000));
  setTimeout(() => { if (bySession[sid]) handleEvent({ kind: 'session_end', sessionId: sid }); }, rnd(9000, 18000));
}
function toggleDemo() {
  demoOn = !demoOn;
  $('hoRestart').innerHTML = demoOn ? '⏸ Demo' : '▶ Demo';
  if (demoOn) { demoTick(); demoTimer = setInterval(demoTick, 4200); logActivity('▶', 'demo mode on'); }
  else { clearInterval(demoTimer); logActivity('⏸', 'demo mode off'); }
}

/* ============ buttons ============ */
let paused = false;
$('hoLang').onclick = () => { LANG = (LANG === 'id') ? 'en' : 'id'; applyLang(); };
$('hoTabLog').onclick = () => { $('hoTabLog').classList.add('on'); $('hoTabLive').classList.remove('on'); $('hoPaneLog').style.display = 'flex'; $('hoPaneLive').style.display = 'none'; };
$('hoTabLive').onclick = () => { $('hoTabLive').classList.add('on'); $('hoTabLog').classList.remove('on'); $('hoPaneLive').style.display = 'flex'; $('hoPaneLog').style.display = 'none'; };
$('hoLiveClear').onclick = () => { elMlog.innerHTML = ''; };
$('hoPause').onclick = () => { paused = !paused; $('hoPause').textContent = paused ? T('resume') : T('pause'); };
$('hoRestart').onclick = toggleDemo;
$('hoClear').onclick = () => { [...agents.values()].forEach(a => a.destroy()); LOGSTORE = []; LOGPAGE = 0; renderLogPage(); elMlog.innerHTML = ''; logActivity('🧹', 'cleared'); };
$('hoSound').onclick = () => { soundOn = !soundOn; $('hoSound').textContent = 'Sound: ' + (soundOn ? 'on' : 'off'); };
$('hoBg').onclick = () => {
  const au = $('hoAudio'); const on = $('hoBg').textContent.includes('off');
  $('hoBg').textContent = 'Ambience: ' + (on ? 'on' : 'off');
  try { if (on) au.play(); else au.pause(); } catch (e) { }
};
$('hoZoomIn').onclick = () => setZoom(1);
$('hoZoomOut').onclick = () => setZoom(-1);
$('hoResetView').onclick = () => { camera.position.copy(CAM_HOME.pos); controls.target.copy(CAM_HOME.tgt); stopFollow(); if (denah) toggleDenah(); };
$('hoTop').onclick = toggleDenah;
$('hoRain').onclick = () => { rainOn = !rainOn; rain.visible = rainOn; $('hoRain').textContent = rainOn ? T('rainOn') : T('rainOff'); logActivity(rainOn ? '🌧' : '🌤️', rainOn ? T('rainStart') : T('rainStop')); };
$('hoFloor').onclick = () => {
  // Kalau lagi follow, tombol Lihat = lepas follow dulu (kamera balik ke user)
  if (typeof followId !== 'undefined' && followId) stopFollow();
  setFloorView((showMode + 1) % 3, false);
};
$('hoFollowStop').onclick = stopFollow;
$('hoLogClear').onclick = () => { LOGSTORE = []; LOGPAGE = 0; renderLogPage(); };
$('hoLogPrev').onclick = () => { if (LOGPAGE > 0) { LOGPAGE--; renderLogPage(); } };
$('hoLogNext').onclick = () => { const pages = Math.max(1, Math.ceil(LOGSTORE.length / LOGPER)); if (LOGPAGE < pages - 1) { LOGPAGE++; renderLogPage(); } };
$('hoAgentsPrev').onclick = () => { if (AGENTPAGE > 0) { AGENTPAGE--; renderAgentList(); } };
$('hoAgentsNext').onclick = () => { AGENTPAGE++; renderAgentList(); };
$('hoErrClear').onclick = () => { const b = $('hoErrbar'); if (b) b.style.display = 'none'; };
document.querySelectorAll('.ho-tools [data-f]').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('.ho-tools [data-f]').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    filterKind = b.getAttribute('data-f') || null;
    logActivity('🔎', 'filter: ' + (filterKind || 'all'));
  };
});
renderer.domElement.addEventListener('click', (ev) => {
  const r = renderer.domElement.getBoundingClientRect();
  const mx = ((ev.clientX - r.left) / r.width) * 2 - 1, my = -((ev.clientY - r.top) / r.height) * 2 + 1;
  const rc = new THREE.Raycaster(); rc.setFromCamera({ x: mx, y: my }, camera);
  const hits = rc.intersectObjects(agentsGroup.children, true);
  if (hits.length) {
    let o = hits[0].object;
    while (o && o.parent !== agentsGroup) o = o.parent;
    const a = [...agents.values()].find(x => x.g === o);
    if (a) { startFollow(a); showAgentPanel(a); }
    return;
  }
  const lh = rc.intersectObjects(liftGroup.children, true);
  if (lh.length) callLiftRandom();
});
const KINDN = { main: 'MAIN', sub: 'SUB', worker: 'WORKER' };
var AGENTPAGE = 0;
function escHtml(x) { return String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function agentStatus(a) {
  const now = performance.now();
  if (a.tool && a.toolUntil > now) return '🔧 ' + (a.tool || '');
  if (a.bubbleFull && a.bubbleUntil > now) return String(a.bubbleFull).slice(0, 34);
  if (a.st === 'walk') return T('walking');
  if (a.st === 'tolift' || a.st === 'inlift' || a.st === 'waitlift') return T('inlift');
  if (a.st === 'leave') return T('leaving');
  if (a.st === 'coffee') return T('coffee');
  if (a.st === 'chill') return T('chill');
  if (a.st === 'meeting') return T('meeting');
  if (a.st === 'pray') return T('pray');
  if (a.st === 'server') return T('server');
  if (a.st === 'arrive') return T('sitting');
  return T('working');
}
function renderAgentList() {
  const list = document.getElementById('hoAgents'); if (!list) return;
  const cnt = document.getElementById('hoAgentsCount'); if (cnt) cnt.textContent = agents.size;
  list.innerHTML = '';
  const arr = [...agents.values()];
  const ord = { main: 0, sub: 1, worker: 2 };
  arr.sort((x, y) => ((ord[x.kind] ?? 9) - (ord[y.kind] ?? 9)) || String(x.label || '').localeCompare(String(y.label || '')));
  if (!arr.length) {
    list.innerHTML = '<div style="color:#5a5e6a;font-size:11px">' + T('noAgents') + '</div>';
    const pg0 = document.getElementById('hoAgentsPage'); if (pg0) pg0.textContent = '1/1';
    const pv0 = document.getElementById('hoAgentsPrev'), nx0 = document.getElementById('hoAgentsNext');
    if (pv0) pv0.disabled = true; if (nx0) nx0.disabled = true;
    return;
  }
  const PER = 5;
  const pages = Math.max(1, Math.ceil(arr.length / PER));
  if (AGENTPAGE > pages - 1) AGENTPAGE = pages - 1;
  if (AGENTPAGE < 0) AGENTPAGE = 0;
  arr.slice(AGENTPAGE * PER, AGENTPAGE * PER + PER).forEach(a => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ho-grow';
    const kc = '#' + ((typeof KINDC !== 'undefined' && KINDC[a.kind]) || 0x8a8f9e).toString(16).padStart(6, '0');
    const kd = (typeof KINDN !== 'undefined' && KINDN[a.kind]) || a.kind;
    b.innerHTML = '<span class="dot" style="background:' + kc + '"></span>' +
      '<span class="nm">' + escHtml(a.label || a.id) + '</span>' +
      '<span class="st">' + escHtml(agentStatus(a)) + '</span>' +
      '<span class="kd">' + escHtml(kd) + '</span>';
    b.addEventListener('click', ((aa) => () => showAgentPanel(aa))(a));
    list.appendChild(b);
  });
  const pg = document.getElementById('hoAgentsPage'); if (pg) pg.textContent = (AGENTPAGE + 1) + '/' + pages;
  const pv = document.getElementById('hoAgentsPrev'), nx = document.getElementById('hoAgentsNext');
  if (pv) pv.disabled = AGENTPAGE <= 0;
  if (nx) nx.disabled = AGENTPAGE >= pages - 1;
}
function showAgentPanel(a) {
  const p = $('hoApanel'); if (!p) return;
  const kc = '#' + (KINDC[a.kind] || 0x3ddc84).toString(16).padStart(6, '0');
  const proj = a.project ? (T('proj') + ': <b>' + a.project + '</b><br>') : '';
  const sess = a.sessionId ? (T('sess') + ': ' + a.sessionId + '<br>') : '';
  const zona = a.spot ? (T('zone') + ': ' + a.spot.zone + '<br>') : '';
  p.innerHTML = '<span class="x" id="hoAx">✕</span>' +
    '<b style="color:' + kc + '">' + a.label + '</b> <span style="opacity:.55">' + a.kind + '</span><br>' +
    proj + sess + zona + T('status') + ': ' + a.st + '<br>' +
    '<button id="hoFollowBtn" type="button" style="margin-top:6px;background:#2a2e3a;color:#e8eaf0;border:1px solid #e8b93c;border-radius:6px;padding:4px 12px;cursor:pointer;font-family:inherit;font-size:11px">👁 Follow</button>';
  p.style.display = 'block';
  const x = $('hoAx'); if (x) x.addEventListener('click', hideAgentPanel);
  const fb = $('hoFollowBtn'); if (fb) fb.addEventListener('click', () => startFollow(a));
}
function hideAgentPanel() { const p = $('hoApanel'); if (p) p.style.display = 'none'; }

/* ============ shortcut bar (bawah dashboard) ============ */
function buildShortcutBar() {
  const bar = $('hoShortcut'); if (!bar) return;
  const defs = [
    { k: 'Space', label: 'Pause', run: () => $('hoPause') && $('hoPause').click() },
    { k: 'D', label: 'Demo', run: () => $('hoRestart') && $('hoRestart').click() },
    { k: 'C', label: 'Clear', run: () => $('hoClear') && $('hoClear').click() },
    { k: '1', label: 'Log', run: () => $('hoTabLog') && $('hoTabLog').click() },
    { k: '2', label: 'Live', run: () => $('hoTabLive') && $('hoTabLive').click() },
    { k: 'R', label: 'Denah', run: () => $('hoTop') && $('hoTop').click() },
    { k: 'H', label: 'Hujan', run: () => $('hoRain') && $('hoRain').click() },
    { k: 'G', label: 'Lantai', run: () => $('hoFloor') && $('hoFloor').click() },
    { k: '0', label: 'Reset view', run: () => $('hoResetView') && $('hoResetView').click() },
    { k: 'E', label: 'Error ✕', run: () => $('hoErrClear') && $('hoErrClear').click() },
    { k: '+/-', label: 'Zoom', run: null },
  ];
  bar.innerHTML = '<span class="ho-sc-label">Shortcut:</span>';
  defs.forEach(d => {
    const b = document.createElement('button'); b.type = 'button';
    b.innerHTML = '<kbd>' + d.k + '</kbd><span>' + d.label + '</span>';
    if (d.run) b.addEventListener('click', d.run);
    else { b.style.cursor = 'default'; b.style.opacity = '.75'; }
    bar.appendChild(b);
  });
  document.addEventListener('keydown', (ev) => {
    if (/INPUT|TEXTAREA/.test((ev.target && ev.target.tagName) || '')) return;
    const k = ev.key;
    const hit = { ' ': 0, d: 1, D: 1, c: 2, C: 2, 1: 3, 2: 4, r: 5, R: 5, h: 6, H: 6, g: 7, G: 7, 0: 8, e: 9, E: 9 }[k];
    if (hit == null) return;
    if (k === ' ') ev.preventDefault();
    const d = defs[hit];
    if (d && d.run) d.run();
  });
  const old = $('hoKeys'); if (old) { const wk = old.closest('.ho-keys'); if (wk) wk.style.display = 'none'; }
}
try { buildShortcutBar(); } catch (e) {}

/* ============ animate ============ */
const clock = new THREE.Clock();
let blinkT = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();
  if (!paused) {
    for (const u of updaters) { try { u(dt, now); } catch (e) { } }
    agents.forEach(a => a.update(dt, now));
    blinkT += dt;
    if (blinkT > 0.4) {
      blinkT = 0;
      blinkers.forEach(b => { if (Math.random() < 0.4) b.material.emissiveIntensity = b.material.emissiveIntensity > 1 ? 0.2 : 2.4; });
    }
    if (incident) {
      const pu = 0.5 + 0.5 * Math.sin(now * 0.012);
      if (incidentLight) incidentLight.intensity = 6 + pu * 14;
      if (now > incident.until) endIncident();
    }
    if (rainOn && rain) {
      const p = rain.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) - dt * 22;
        if (y < 0) y = 26;
        p.setY(i, y);
      }
      p.needsUpdate = true;
    }
    if (followId && agents.has(followId)) {
      const a = agents.get(followId);
      const tp = new THREE.Vector3(a.g.position.x, (a.baseY || a.fl * 4.6) + 1.2, a.g.position.z);
      // Ikuti agen jalan: geser kamera sebesar pergerakan target (orbit user tetap),
      // tapi kalau jarak kejauhan (>14) tarik mendekat biar tetap menyorot.
      const before = controls.target.clone();
      controls.target.lerp(tp, 0.12);
      const moved = controls.target.clone().sub(before);
      camera.position.add(moved);
      const dist = camera.position.distanceTo(controls.target);
      if (dist > 14) {
        const dir = camera.position.clone().sub(controls.target).setLength(dist + (14 - dist) * 0.12);
        camera.position.copy(controls.target).add(dir);
      }
      // Refresh label chip kalau pindah lantai/ruangan (throttle ~1s) + Lihat ngikutin lantai
      if (!a._chipT || now - a._chipT > 1000) {
        a._chipT = now;
        try { if (typeof syncFloorToAgent === 'function') syncFloorToAgent(a); } catch (e) {}
        const t = document.getElementById('hoFollowName');
        if (t) {
          const zn = (a.spot && a.spot.zone) ? a.spot.zone : (a.st || '');
          t.textContent = a.label + ' · Lt' + ((a.fl || 0) + 1) + (zn ? ' · ' + zn : '');
        }
      }
    }
  }
  controls.update();
  renderer.render(scene, camera);
}

/* ============ ocehan idle (agen ngedumel sendiri) ============ */
const IDLE_CHATTER = ['ngopi dulu ☕…', 'lanjut…', 'hmm…', 'cek lagi…', 'santai… 😎', 'gas…', 'bentar…', 'oke oke…', 'sip…', 'ngantuk… 🥱'];
setInterval(() => {
  try {
    if (typeof paused !== 'undefined' && paused) return;
    if (document.hidden) return;
    const cands = [...agents.values()].filter(a =>
      (a.st === 'idle' || a.st === 'working' || a.st === 'coffee' || a.st === 'chill') &&
      (!a.bubbleSp || a.bubbleSrc !== 'event' || a.bubbleUntil < performance.now()));
    if (!cands.length) return;
    if (Math.random() < 0.45) return; // tidak tiap tick bunyi
    const a = cands[Math.floor(Math.random() * cands.length)];
    a.say(IDLE_CHATTER[Math.floor(Math.random() * IDLE_CHATTER.length)], 2800, 'idle');
  } catch (e) {}
}, 9000);

/* ============ updaters (animasi ringan: jam, ayunan, dll) ============ */
const updaters = [];

/* ============ boot ============ */
resize();
connectSSE();
applyLang();
hudMission(T('waiting'));
logActivity('🏢', T('online'));
animate();

/* ============ accessories v1.1 — dekor biar cozy ala office2.js ============ */
const BOOKC = [0xb04a3a, 0x3f6fb5, 0x3fae5a, 0xc9932f, 0x7a4fa3, 0x4fa3a3, 0xd97b2e];
const GOLD = new THREE.MeshStandardMaterial({ color: 0xe8b93c, roughness: 0.3, metalness: 0.85 });

function makeBookshelf(x, z, ry, w) {
  w = w || 3.2;
  const g = new THREE.Group();
  g.add(box(w, 2.2, 0.4, MAT.woodDark, 0, 1.1, 0));
  g.add(box(w - 0.1, 0.06, 0.44, MAT.wood, 0, 2.16, 0));
  for (let s = 0; s < 4; s++) {
    const y = 0.35 + s * 0.5;
    g.add(box(w - 0.12, 0.05, 0.42, MAT.wood, 0, y - 0.02, 0));
    let bx = -w / 2 + 0.14;
    while (bx < w / 2 - 0.2) {
      const bw = rnd(0.07, 0.13), bh = rnd(0.28, 0.42);
      const bk = box(bw, bh, 0.3, new THREE.MeshStandardMaterial({ color: pick(BOOKC), roughness: 0.9 }), bx + bw / 2, y + bh / 2, 0);
      if (Math.random() < 0.12) bk.rotation.z = 0.18;
      g.add(bk); bx += bw + 0.015;
    }
  }
  g.position.set(x, 0, z); if (ry) g.rotation.y = ry;
  return g;
}
function makeWallClock(x, y, z, ry) {
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.07, 28),
    new THREE.MeshStandardMaterial({ color: 0xf4f6fa, roughness: 0.4 }));
  face.rotation.x = Math.PI / 2; g.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 10, 28), MAT.metal);
  g.add(rim);
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    g.add(box(0.035, i % 3 === 0 ? 0.09 : 0.05, 0.02, MAT.black, Math.sin(a) * 0.34, Math.cos(a) * 0.34, 0.045));
  }
  const hg = new THREE.Group(), mg = new THREE.Group(), sg = new THREE.Group();
  const hh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.015), MAT.black); hh.geometry.translate(0, 0.08, 0); hg.add(hh);
  const mh = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.3, 0.015), MAT.black); mh.geometry.translate(0, 0.12, 0); mg.add(mh);
  const sh = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.32, 0.01), new THREE.MeshStandardMaterial({ color: 0xe05252 })); sh.geometry.translate(0, 0.1, 0); sg.add(sh);
  hg.position.z = 0.05; mg.position.z = 0.06; sg.position.z = 0.07;
  g.add(hg, mg, sg);
  const tick = () => {
    const d = new Date();
    hg.rotation.z = -((d.getHours() % 12) + d.getMinutes() / 60) / 12 * Math.PI * 2;
    mg.rotation.z = -(d.getMinutes() + d.getSeconds() / 60) / 60 * Math.PI * 2;
    sg.rotation.z = -(d.getSeconds() / 60) * Math.PI * 2;
  };
  tick(); updaters.push(() => tick());
  g.position.set(x, y, z); if (ry) g.rotation.y = ry;
  return g;
}
function artTexture(kind) {
  return canvasTex(140, 100, (c, w, h) => {
    if (kind === 'sunset') {
      c.fillStyle = '#2b4a7a'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#e08a3c'; c.fillRect(0, h * 0.58, w, h * 0.42);
      c.fillStyle = '#ffd76a'; c.beginPath(); c.arc(w / 2, h * 0.55, 15, 0, 7); c.fill();
      c.fillStyle = '#3a5a3a'; c.beginPath(); c.moveTo(0, h); c.lineTo(w * 0.3, h * 0.7); c.lineTo(w * 0.6, h); c.fill();
    } else if (kind === 'wave') {
      c.fillStyle = '#e8f0f8'; c.fillRect(0, 0, w, h);
      const cols = ['#3f8cff', '#2b6fd4', '#1f5ab0'];
      for (let i = 0; i < 3; i++) { c.fillStyle = cols[i]; c.fillRect(0, h * 0.5 + i * h * 0.16, w, h * 0.09); }
      c.fillStyle = '#f4f6fa'; c.fillRect(w * 0.2, h * 0.2, 22, 12);
    } else {
      c.fillStyle = '#1c2030'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 30; i++) { c.fillStyle = '#fff'; c.globalAlpha = rnd(0.2, 1); c.fillRect(rnd(0, w), rnd(0, h * 0.7), 2, 2); }
      c.globalAlpha = 1; c.fillStyle = '#ffd76a'; c.beginPath(); c.arc(w * 0.68, h * 0.32, 11, 0, 7); c.fill();
      c.fillStyle = '#0c0e18'; c.fillRect(0, h * 0.8, w, h * 0.2);
    }
  }).tex;
}
function makeFrame(x, y, z, ry, art) {
  const g = new THREE.Group();
  g.add(box(1.5, 1.1, 0.07, MAT.woodDark, 0, 0, 0));
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(1.32, 0.94),
    new THREE.MeshStandardMaterial({ map: artTexture(art), roughness: 0.85 }));
  inner.position.z = 0.045; g.add(inner);
  g.position.set(x, y, z); g.rotation.y = ry || 0;
  return g;
}
function makeTrophyShelf(x, y, z, ry) {
  const g = new THREE.Group();
  g.add(box(0.5, 0.08, 2.0, MAT.woodDark, 0, 0, 0));
  [-0.6, 0, 0.6].forEach((oz, i) => {
    const s = i === 1 ? 1.25 : 1;
    const cup = cyl(0.09 * s, 0.06 * s, 0.16 * s, GOLD, 0, 0.2 * s, oz);
    const stem = cyl(0.025 * s, 0.025 * s, 0.12 * s, GOLD, 0, 0.08 * s, oz);
    const base = box(0.16 * s, 0.05 * s, 0.16 * s, MAT.woodDark, 0, 0.06 * s, oz);
    g.add(cup, stem, base);
  });
  const lb = textSprite('HALL OF FAME', { fontSize: 30, color: '#c9a44a', bg: 'none', scale: 0.55 });
  lb.position.set(0, -0.28, 0); g.add(lb);
  g.position.set(x, y, z); g.rotation.y = ry || 0;
  return g;
}
function makeHangingPlant(x, z, len) {
  len = len || 1.0;
  const g = new THREE.Group();
  g.add(cyl(0.015, 0.015, len, MAT.black, 0, -len / 2, 0));
  const potY = -len;
  g.add(cyl(0.16, 0.12, 0.22, new THREE.MeshStandardMaterial({ color: 0xb5651d, roughness: 0.8 }), 0, potY - 0.1, 0));
  const leaves = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const lf = new THREE.Mesh(new THREE.SphereGeometry(rnd(0.09, 0.15), 7, 6), MAT.leaf);
    lf.position.set(rnd(-0.2, 0.2), potY - 0.25 - rnd(0, 0.25), rnd(-0.2, 0.2));
    leaves.add(lf);
  }
  g.add(leaves);
  const ph = rnd(0, 6);
  updaters.push((dt, now) => { g.rotation.z = Math.sin(now * 0.001 + ph) * 0.06; g.rotation.x = Math.cos(now * 0.0008 + ph) * 0.05; });
  g.position.set(x, 4.4, z);
  return g;
}
function makeSconce(x, y, z, ry) {
  const g = new THREE.Group();
  g.add(box(0.22, 0.34, 0.1, MAT.woodDark, 0, 0, 0));
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.2),
    new THREE.MeshStandardMaterial({ color: 0xffe9b8, emissive: 0xffd98a, emissiveIntensity: 2.4 }));
  glow.position.z = 0.055; g.add(glow);
  const halo = textSprite('●', { fontSize: 60, color: 'rgba(255,190,110,0.16)', bg: 'none', scale: 1.6 });
  halo.position.z = 0.1; g.add(halo);
  g.position.set(x, y, z); g.rotation.y = ry || 0;
  return g;
}
function makeExtinguisher(x, z) {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.5 });
  g.add(cyl(0.11, 0.11, 0.5, red, 0, 0.32, 0));
  g.add(box(0.16, 0.12, 0.02, new THREE.MeshStandardMaterial({ color: 0xf2f2f2 }), 0, 0.34, 0.105));
  g.add(cyl(0.02, 0.02, 0.14, MAT.black, 0, 0.62, 0));
  const hose = cyl(0.015, 0.015, 0.3, MAT.black, 0.1, 0.5, 0); hose.rotation.z = 0.5; g.add(hose);
  g.position.set(x, 0, z); return g;
}
function makeP3K(x, y, z, ry) {
  const g = new THREE.Group();
  g.add(box(0.4, 0.4, 0.12, new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 }), 0, 0, 0));
  const rm = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6 });
  g.add(box(0.22, 0.07, 0.02, rm, 0, 0, 0.07)); g.add(box(0.07, 0.22, 0.02, rm, 0, 0, 0.07));
  g.position.set(x, y, z); g.rotation.y = ry || 0;
  return g;
}
function makeCoffeeMachine(x, z, ry) {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2e36, roughness: 0.4, metalness: 0.3 });
  g.add(box(0.55, 0.5, 0.45, dark, 0, 0.25, 0));
  g.add(box(0.4, 0.06, 0.3, MAT.black, 0, 0.53, 0));
  const btn = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x3ddc84, emissiveIntensity: 2 }));
  btn.position.set(-0.1, 0.38, 0.23); g.add(btn);
  const btn2 = btn.clone(); btn2.material = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xe05252, emissiveIntensity: 2 });
  btn2.position.x = 0.1; g.add(btn2);
  g.add(cyl(0.05, 0.04, 0.09, new THREE.MeshStandardMaterial({ color: 0xf2f2f2 }), 0.12, 0.05, 0.1));
  g.position.set(x, 0, z); if (ry) g.rotation.y = ry;
  return g;
}
function makeGlassboard(x, y, z, ry) {
  const g = new THREE.Group();
  const tex = canvasTex(220, 130, (c, w, h) => {
    c.fillStyle = 'rgba(200,225,245,0.92)'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#2b2f38'; c.lineWidth = 2;
    const cols = ['#e05252', '#3f8cff', '#3fae5a', '#e8b93c']; let an = -0.5;
    [0.35, 0.25, 0.25, 0.15].forEach((f, i) => {
      c.fillStyle = cols[i]; c.beginPath(); c.moveTo(40, 60); c.arc(40, 60, 26, an, an + f * Math.PI * 2); c.closePath(); c.fill();
      an += f * Math.PI * 2;
    });
    c.strokeStyle = '#e08a3c'; c.lineWidth = 3; c.beginPath();
    c.moveTo(90, 90); c.lineTo(120, 70); c.lineTo(150, 78); c.lineTo(190, 40); c.stroke();
    c.fillStyle = '#e08a3c'; c.fillRect(186, 36, 8, 8);
  }).tex;
  g.add(box(2.6, 1.6, 0.08, MAT.metal, 0, 0, 0));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(2.44, 1.44),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.15, metalness: 0.1 }));
  face.position.z = 0.05; g.add(face);
  g.position.set(x, y, z); g.rotation.y = ry || 0;
  return g;
}
function makeVertGarden(x0, x1, z) {
  const g = new THREE.Group();
  const w = x1 - x0;
  g.add(box(w, 1.9, 0.12, new THREE.MeshStandardMaterial({ color: 0x2e2414, roughness: 1 }), 0, 0, 0));
  for (let i = 0; i < 46; i++) {
    const lf = new THREE.Mesh(new THREE.SphereGeometry(rnd(0.09, 0.17), 7, 6),
      new THREE.MeshStandardMaterial({ color: pick([0x2a6e34, 0x379245, 0x1f5226, 0x46b355]), roughness: 0.95 }));
    lf.position.set(rnd(-w / 2 + 0.2, w / 2 - 0.2), rnd(-0.85, 0.85), 0.12);
    lf.castShadow = true; g.add(lf);
  }
  g.position.set((x0 + x1) / 2, 2.0, z);
  return g;
}
function makeAC(x, y, z) {
  const g = new THREE.Group();
  const wm = new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.4, metalness: 0.2 });
  g.add(box(1.1, 0.5, 0.35, wm, 0, 0, 0));
  for (let i = 0; i < 4; i++) g.add(box(0.95, 0.03, 0.02, MAT.metal, 0, -0.12 + i * 0.08, 0.18));
  const puff = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3),
    new THREE.MeshBasicMaterial({ color: 0xaadcF5, transparent: true, opacity: 0.25 }));
  puff.position.set(0, -0.4, 0.25); puff.rotation.x = 0.4; g.add(puff);
  g.position.set(x, y, z); return g;
}
function makeTrashBin(x, z) {
  const g = new THREE.Group();
  g.add(cyl(0.2, 0.16, 0.5, new THREE.MeshStandardMaterial({ color: 0x4e525c, roughness: 0.7, metalness: 0.3 }), 0, 0.25, 0));
  g.position.set(x, 0, z); return g;
}
function makeFloorLamp(x, z) {
  const g = new THREE.Group();
  g.add(cyl(0.16, 0.2, 0.06, MAT.metal, 0, 0.03, 0));
  g.add(cyl(0.025, 0.025, 1.7, MAT.metal, 0, 0.88, 0));
  const arm = cyl(0.02, 0.02, 0.9, MAT.metal, 0.4, 1.72, 0); arm.rotation.z = Math.PI / 2.3; g.add(arm);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.22, 14, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xe8d9b8, roughness: 0.8, side: THREE.DoubleSide }));
  shade.position.set(0.78, 1.62, 0); g.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xffe6ad, emissive: 0xffd98a, emissiveIntensity: 2.5 }));
  bulb.position.set(0.78, 1.56, 0); g.add(bulb);
  warmLight(x + 0.78, 1.5, z, 7, 9);
  g.position.set(x, 0, z); return g;
}
function makeCat(x, z) {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0xe8a33d, roughness: 0.95 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.3, 6, 10), fur);
  body.rotation.z = Math.PI / 2; body.position.y = 0.16; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), fur);
  head.position.set(0.3, 0.2, 0); head.castShadow = true; g.add(head);
  [-0.07, 0.07].forEach(ox => {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.09, 6), fur);
    ear.position.set(0.3 + ox, 0.32, 0); g.add(ear);
  });
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.045, 8, 14, Math.PI * 1.2), fur);
  tail.position.set(-0.28, 0.12, 0.05); tail.rotation.y = Math.PI / 2; g.add(tail);
  const ph = rnd(0, 6);
  updaters.push((dt, now) => { body.scale.y = 1 + Math.sin(now * 0.002 + ph) * 0.05; });
  g.position.set(x, 0.02, z); g.rotation.y = rnd(0, 6);
  return g;
}
function makeRug(x, z, w, d, color) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ color, roughness: 1 }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.015, z); m.receiveShadow = true;
  return m;
}
function makeExitSign(x, y, z, ry) {
  const tex = canvasTex(120, 44, (c, w, h) => {
    c.fillStyle = '#0e3a1e'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#3ddc84'; c.font = 'bold 30px monospace'; c.textAlign = 'center'; c.fillText('EXIT', w / 2, 32);
  }).tex;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.26),
    new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9 }));
  m.position.set(x, y, z); m.rotation.y = ry || 0;
  return m;
}
function makeSucculent(x, y, z) {
  const g = new THREE.Group();
  g.add(cyl(0.05, 0.04, 0.07, new THREE.MeshStandardMaterial({ color: 0x8a4f2c, roughness: 0.9 }), 0, 0.035, 0));
  const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), MAT.leaf);
  s.position.y = 0.1; s.castShadow = true; g.add(s);
  g.position.set(x, y, z); return g;
}
function makeDeskLamp(x, y, z) {
  const g = new THREE.Group();
  g.add(cyl(0.07, 0.09, 0.04, MAT.metal, 0, 0.02, 0));
  const arm = cyl(0.015, 0.015, 0.4, MAT.metal, 0.1, 0.2, 0); arm.rotation.z = -0.5; g.add(arm);
  const head = box(0.16, 0.05, 0.08, MAT.metal, 0.28, 0.36, 0); g.add(head);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.05),
    new THREE.MeshStandardMaterial({ color: 0xffe6ad, emissive: 0xffd98a, emissiveIntensity: 2.2 }));
  glow.position.set(0.28, 0.33, 0); glow.rotation.x = Math.PI / 2; g.add(glow);
  g.position.set(x, y, z); return g;
}
function makePatchPanel(x, y, z) {
  const g = new THREE.Group();
  g.add(box(1.4, 0.5, 0.18, MAT.rack, 0, 0, 0));
  for (let i = 0; i < 8; i++) {
    const led = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: i % 2 ? 0xe8b93c : 0x3f8cff, emissiveIntensity: 2 }));
    led.position.set(-0.56 + i * 0.16, 0.05, 0.1); g.add(led);
  }
  g.position.set(x, y, z); return g;
}
function makeSprintTV(x, y, z) {
  const tex = canvasTex(260, 120, (c, w, h) => {
    c.fillStyle = '#0e1a33'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#9fd8ff'; c.font = 'bold 22px monospace'; c.textAlign = 'center'; c.fillText('SPRINT', w / 2, 26);
    const cols = ['#3f7fc0', '#e8b93c', '#3fae5a'];
    for (let i = 0; i < 9; i++) {
      const bh = rnd(20, 70);
      c.fillStyle = cols[i % 3]; c.fillRect(24 + i * 24, h - 14 - bh, 16, bh);
    }
  }).tex;
  const g = new THREE.Group();
  g.add(box(2.7, 1.3, 0.1, MAT.black, 0, 0, 0));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(2.55, 1.18),
    new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.7 }));
  face.position.z = 0.06; g.add(face);
  g.position.set(x, y, z); return g;
}
function makeDoorFrame(x, z, alongZ) {
  const g = new THREE.Group();
  const post = (ox, oz) => g.add(box(0.16, WH, 0.16, MAT.woodDark, ox, WH / 2, oz));
  if (alongZ) { post(0, -0.65); post(0, 0.65); g.add(box(0.16, 0.18, 1.46, MAT.woodDark, 0, WH - 0.09, 0)); }
  else { post(-0.65, 0); post(0.65, 0); g.add(box(1.46, 0.18, 0.16, MAT.woodDark, 0, WH - 0.09, 0)); }
  g.position.set(x, 0, z); return g;
}
function makeBench(x, z, ry) {
  const g = new THREE.Group();
  g.add(box(1.6, 0.09, 0.45, MAT.wood, 0, 0.45, 0));
  g.add(box(1.6, 0.35, 0.08, MAT.wood, 0, 0.72, -0.2));
  g.add(box(0.08, 0.45, 0.4, MAT.metal, -0.7, 0.22, 0)); g.add(box(0.08, 0.45, 0.4, MAT.metal, 0.7, 0.22, 0));
  g.position.set(x, 0, z); if (ry) g.rotation.y = ry;
  return g;
}
function makePlanter(x, z, w) {
  w = w || 1.6;
  const g = new THREE.Group();
  g.add(box(w, 0.4, 0.5, MAT.woodDark, 0, 0.2, 0));
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.ConeGeometry(rnd(0.12, 0.2), rnd(0.4, 0.7), 7), MAT.leaf);
    b.position.set(-w / 2 + 0.2 + i * (w - 0.4) / 4, 0.6, 0); b.castShadow = true; g.add(b);
  }
  g.position.set(x, 0, z); return g;
}
function makeStringLights(x0, x1, z0, z1, y) {
  const g = new THREE.Group();
  const pts = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const sag = Math.sin(t * Math.PI) * 0.5;
    pts.push(new THREE.Vector3(x0 + (x1 - x0) * t, y - sag, z0 + (z1 - z0) * t));
  }
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x333333 }));
  g.add(line);
  pts.forEach((p, i) => {
    if (i % 2) return;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xffe6ad, emissive: 0xffd98a, emissiveIntensity: 2.6 }));
    b.position.copy(p); b.position.y -= 0.08; g.add(b);
  });
  return g;
}

/* ---- penempatan lantai 1 ---- */
floor1.add(makeBookshelf(15.4, 0.45, 0));
floor1.add(makeWallClock(14, 2.7, 8.18, 0));
floor1.add(makeFrame(0.16, 2.3, 10.5, Math.PI / 2, 'sunset'));
floor1.add(makeFrame(0.16, 2.3, 12.6, Math.PI / 2, 'wave'));
floor1.add(makeFrame(0.16, 2.3, 14.7, Math.PI / 2, 'night'));
floor1.add(makeTrophyShelf(0.35, 2.1, 16.2, Math.PI / 2));
[[5, 2], [24, 12], [10, 15.5]].forEach(p => floor1.add(makeHangingPlant(p[0], p[1], rnd(0.8, 1.3))));
floor1.add(makeSconce(8, 2.5, 17.82, Math.PI)); floor1.add(makeSconce(20, 2.5, 17.82, Math.PI));
floor1.add(makeSconce(29.82, 2.5, 10, -Math.PI / 2));
floor1.add(makeExtinguisher(22.5, 7.3));
floor1.add(makeP3K(16.6, 1.9, 7.9, 0));
floor1.add(makeCoffeeMachine(25.2, 14.1, Math.PI));
floor1.add(makeGlassboard(7.18, 1.9, 12, Math.PI / 2));
floor1.add(makeVertGarden(24.5, 28.5, 0.18));
floor1.add(makeAC(28.5, 2.6, 6.0));
[[12.5, 7.4], [22.9, 12.6], [3.5, 16.9]].forEach(p => floor1.add(makeTrashBin(p[0], p[1])));
floor1.add(makeFloorLamp(22.9, 12.2));
floor1.add(makeCat(17.6, 16.1));
floor1.add(makeRug(19.5, 14.4, 6.2, 5.9, 0x7d5a7a));
floor1.add(makeRug(11.5, 13, 6.6, 5.0, 0x5e6e8a));
floor1.add(makeExitSign(0.16, 2.9, 12.9, Math.PI / 2));
floor1.add(makeExitSign(26.1, 2.9, 7.82, 0));
[[1.6, 2.1], [4.1, 2.1], [6.6, 6.2], [9.1, 6.2]].forEach(p => floor1.add(makeSucculent(p[0] + 0.75, 0.79, p[1] - 0.95)));
floor1.add(makeDeskLamp(1.6 - 0.7, 0.79, 2.1 - 0.95));
floor1.add(makeDeskLamp(9.1 + 0.7, 0.79, 6.25 - 0.95));
floor1.add(makePatchPanel(24.2, 1.7, 5.35));
floor1.add(makeSprintTV(11.5, 2.4, 7.88));
floor1.add(makeDoorFrame(12, 4, true));
floor1.add(makeDoorFrame(7, 13, true));
floor1.add(makeDoorFrame(3.1, 8, false));
floor1.add(makeDoorFrame(26.1, 8, false));
[13.0, 14.5, 16.0].forEach(dx => floor1.add(makeRug(dx, 5.35, 1.3, 0.9, 0x3a3d46)));

/* ---- penempatan lantai 2 ---- */
floor2.add(makePlanter(1.5, 16.8, 2.2)); floor2.add(makePlanter(5.5, 16.8, 2.2));
[[1, 14], [7, 14], [1, 17.2], [7, 17.2]].forEach(p => floor2.add(cyl(0.05, 0.06, 2.6, MAT.woodDark, p[0], 1.3, p[1])));
floor2.add(makeStringLights(1, 7, 14, 14, 2.55));
floor2.add(makeStringLights(1, 7, 17.2, 17.2, 2.55));
floor2.add(makeStringLights(1, 1, 14, 17.2, 2.55));
floor2.add(makeStringLights(7, 7, 14, 17.2, 2.55));
warmLight(4, 2.4, 15.6, 8, 10);
[9.0, 11.5, 14.0].forEach(dx => {
  floor2.add(cyl(0.3, 0.3, 0.05, MAT.wood, dx + 0.55, 0.5, 13.5));
  floor2.add(box(0.22, 0.12, 0.16, MAT.black, dx + 0.55, 0.6, 13.5));
});
floor2.add(makeBookshelf(19.5, 0.45, 0, 2.4));
floor2.add(makeWallClock(17.5, 2.7, 8.18, 0));
floor2.add(makeRug(17.5, 4, 7.4, 4.6, 0x8d7fb8));
[18.0, 19.5, 21.0].forEach(dx => floor2.add(makeSucculent(dx + 0.3, 1.0, 14.1)));
[[10, 2], [20, 6]].forEach(p => floor2.add(makeHangingPlant(p[0], p[1], 1)));
// partisi mushola
for (let i = 0; i < 3; i++) {
  const pn = box(1.6, 1.7, 0.06, new THREE.MeshStandardMaterial({ color: 0xe8e4f0, roughness: 0.9 }), 2 + i * 1.7, 0.85, 6.9);
  pn.rotation.y = (i % 2 ? 0.12 : -0.12); floor2.add(pn);
}

/* ---- dust motes ---- */
{
  const N = 130, pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = rnd(0, 30); pos[i * 3 + 1] = rnd(0.5, 4); pos[i * 3 + 2] = rnd(0, 18); seed[i] = rnd(0, 10); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const motes = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xfff0c8, size: 0.05, transparent: true, opacity: 0.5 }));
  floor1.add(motes);
  updaters.push((dt, now) => {
    const p = g.attributes.position;
    for (let i = 0; i < N; i++) {
      p.array[i * 3] += Math.sin(now * 0.0004 + seed[i]) * dt * 0.12;
      p.array[i * 3 + 1] += Math.cos(now * 0.0003 + seed[i] * 2) * dt * 0.08;
    }
    p.needsUpdate = true;
  });
}
console.log('[ho3d] accessories v1.1 loaded');

/* ============ accessories v1.2 — gamepad, piala, pajangan + teras ============ */
function makeGamepad(color) {
  const g = new THREE.Group();
  const cm = new THREE.MeshStandardMaterial({ color, roughness: 0.45 });
  const dm = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
  g.add(box(0.3, 0.09, 0.15, cm, 0, 0.05, 0));
  const h1 = box(0.09, 0.15, 0.13, cm, -0.17, 0.0, 0.02); h1.rotation.z = 0.35; g.add(h1);
  const h2 = box(0.09, 0.15, 0.13, cm, 0.17, 0.0, 0.02); h2.rotation.z = -0.35; g.add(h2);
  g.add(box(0.08, 0.015, 0.03, dm, -0.07, 0.1, 0));
  const bcols = [0xe05252, 0x3fae5a, 0x3f8cff, 0xe8b93c];
  bcols.forEach((bc, i) => {
    g.add(cyl(0.016, 0.016, 0.014, new THREE.MeshStandardMaterial({ color: bc, roughness: 0.5 }),
      0.05 + (i % 2) * 0.04, 0.1, -0.025 + Math.floor(i / 2) * 0.04));
  });
  g.add(cyl(0.018, 0.022, 0.028, dm, -0.02, 0.105, 0.03));
  g.add(cyl(0.018, 0.022, 0.028, dm, 0.05, 0.105, 0.045));
  return g;
}
function makeDisplayCabinet(x, z, ry, w) {
  w = w || 2.6;
  const g = new THREE.Group();
  g.add(box(w, 0.09, 0.62, MAT.woodDark, 0, 1.92, 0));
  g.add(box(w, 0.14, 0.62, MAT.woodDark, 0, 0.07, 0));
  g.add(box(0.09, 1.98, 0.62, MAT.woodDark, -w / 2 + 0.045, 0.99, 0));
  g.add(box(0.09, 1.98, 0.62, MAT.woodDark, w / 2 - 0.045, 0.99, 0));
  g.add(box(w, 1.98, 0.07, MAT.woodDark, 0, 0.99, -0.28));
  [0.72, 1.32].forEach(y => { const sh = box(w - 0.14, 0.045, 0.54, MAT.glass, 0, y, 0); sh.castShadow = false; g.add(sh); });
  const front = box(w - 0.14, 1.76, 0.03, MAT.glass, 0, 0.99, 0.29); front.castShadow = false; g.add(front);
  g.add(box(w - 0.2, 0.035, 0.035, new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x9fd8ff, emissiveIntensity: 2.2 }), 0, 1.84, 0.18));
  g.position.set(x, 0, z); g.rotation.y = ry || 0;
  return g;
}
function makeFigurine(color) {
  const g = new THREE.Group();
  g.add(cyl(0.09, 0.11, 0.03, MAT.black, 0, 0.015, 0));
  const cm = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.1, 4, 8), cm);
  body.position.y = 0.12; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), new THREE.MeshStandardMaterial({ color: 0xf6cf9a, roughness: 0.7 }));
  head.position.y = 0.25; head.castShadow = true; g.add(head);
  return g;
}
function makeRubiks(s) {
  s = s || 0.085;
  const g = new THREE.Group();
  const cols = [0xe05252, 0x3f8cff, 0x3fae5a, 0xe8b93c, 0xf2f2f2, 0xef7d3c];
  for (let ix = 0; ix < 3; ix++) for (let iy = 0; iy < 3; iy++) for (let iz = 0; iz < 3; iz++)
    g.add(box(s * 0.94, s * 0.94, s * 0.94, new THREE.MeshStandardMaterial({ color: pick(cols), roughness: 0.35 }), (ix - 1) * s, (iy - 1) * s, (iz - 1) * s));
  g.rotation.set(0.3, 0.6, 0.15);
  return g;
}
function makeDice(s) {
  s = s || 0.1;
  const faces = [1, 2, 3, 4, 5, 6].map(n => canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = '#f4f4f4'; c.fillRect(0, 0, w, h); c.fillStyle = '#222';
    const dots = { 1: [[32, 32]], 2: [[20, 20], [44, 44]], 3: [[20, 20], [32, 32], [44, 44]], 4: [[20, 20], [44, 20], [20, 44], [44, 44]], 5: [[20, 20], [44, 20], [32, 32], [20, 44], [44, 44]], 6: [[20, 20], [44, 20], [20, 32], [44, 32], [20, 44], [44, 44]] }[n];
    dots.forEach(d => { c.beginPath(); c.arc(d[0], d[1], 6, 0, 7); c.fill(); });
  }).tex);
  const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), faces.map(t => new THREE.MeshStandardMaterial({ map: t, roughness: 0.35 })));
  m.castShadow = true; m.rotation.set(0.4, 0.6, 0.2);
  return m;
}
function makeHeadphoneStand() {
  const g = new THREE.Group();
  g.add(cyl(0.09, 0.11, 0.03, MAT.woodDark, 0, 0.015, 0));
  g.add(cyl(0.02, 0.02, 0.34, MAT.woodDark, 0, 0.2, 0));
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.018, 8, 16, Math.PI), MAT.black);
  band.position.y = 0.42; g.add(band);
  [-0.085, 0.085].forEach(x => { const cup = cyl(0.055, 0.055, 0.05, MAT.black, x, 0.35, 0); cup.rotation.z = Math.PI / 2; g.add(cup); });
  return g;
}
function makeLaptop(x, y, z, ry) {
  const g = new THREE.Group();
  g.add(box(0.36, 0.025, 0.24, MAT.metal, 0, 0.012, 0));
  const scr = new THREE.Group();
  scr.add(box(0.36, 0.24, 0.02, MAT.black, 0, 0.12, 0));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.21), screenMat());
  face.position.set(0, 0.12, 0.012); scr.add(face);
  scr.position.set(0, 0.02, -0.11); scr.rotation.x = -0.32; g.add(scr);
  g.position.set(x, y, z); if (ry) g.rotation.y = ry;
  return g;
}
function stickyNote(parent, x, y, z, ry, color) {
  const n = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12),
    new THREE.MeshStandardMaterial({ color: color || pick([0xffd94d, 0xff9ecf, 0x9dff9e, 0x9fd8ff]), roughness: 0.9, side: THREE.DoubleSide }));
  n.position.set(x, y, z); n.rotation.y = ry || 0; n.rotation.z = rnd(-0.18, 0.18);
  parent.add(n);
}
function makeBottle(x, y, z) {
  const g = new THREE.Group();
  g.add(cyl(0.035, 0.035, 0.2, new THREE.MeshPhysicalMaterial({ color: 0xaad4f0, transparent: true, opacity: 0.55, roughness: 0.1 }), 0, 0.1, 0));
  g.add(cyl(0.014, 0.02, 0.05, new THREE.MeshStandardMaterial({ color: 0x3f8cff, roughness: 0.5 }), 0, 0.22, 0));
  g.position.set(x, y, z); return g;
}
function makeWorkbench(x, z, ry) {
  const g = new THREE.Group();
  g.add(box(2.0, 0.1, 0.8, MAT.woodDark, 0, 0.9, 0));
  [[-0.9, -0.35], [0.9, -0.35], [-0.9, 0.35], [0.9, 0.35]].forEach(o => g.add(box(0.1, 0.9, 0.1, MAT.metal, o[0], 0.45, o[1])));
  g.add(box(2.0, 1.0, 0.06, MAT.woodDark, 0, 1.95, -0.36));
  for (let i = 0; i < 6; i++) {
    const t = box(0.09, rnd(0.22, 0.34), 0.05, new THREE.MeshStandardMaterial({ color: pick(BOOKC), roughness: 0.7 }), -0.8 + i * 0.32, 1.9, -0.31);
    t.rotation.z = rnd(-0.2, 0.2); g.add(t);
  }
  g.add(box(0.5, 0.4, 0.5, MAT.wood, -0.6, 0.2, 0.05));
  g.add(box(0.4, 0.3, 0.4, new THREE.MeshStandardMaterial({ color: 0x3f8cff, roughness: 0.7 }), 0.35, 0.15, 0.1));
  g.add(cyl(0.12, 0.12, 0.06, MAT.metal, 0.85, 0.98, 0.1));
  g.position.set(x, 0, z); if (ry) g.rotation.y = ry;
  return g;
}
function makeCoatRack(x, z) {
  const g = new THREE.Group();
  g.add(cyl(0.04, 0.05, 1.8, MAT.woodDark, 0, 0.9, 0));
  g.add(cyl(0.25, 0.3, 0.06, MAT.woodDark, 0, 0.03, 0));
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2;
    const peg = cyl(0.018, 0.018, 0.26, MAT.woodDark, Math.cos(a) * 0.13, 1.62, Math.sin(a) * 0.13);
    peg.rotation.z = Math.PI / 2.4; peg.rotation.y = -a; g.add(peg);
  }
  g.add(box(0.3, 0.52, 0.13, new THREE.MeshStandardMaterial({ color: 0x3f6fb5, roughness: 0.95 }), 0.2, 1.28, 0.05));
  g.position.set(x, 0, z); return g;
}
function makeUmbrellaStand(x, z) {
  const g = new THREE.Group();
  g.add(cyl(0.14, 0.11, 0.42, new THREE.MeshStandardMaterial({ color: 0x4e525c, roughness: 0.7 }), 0, 0.21, 0));
  [[0xe05252, 0.05], [0x3f8cff, -0.06]].forEach(u => {
    g.add(cyl(0.014, 0.014, 0.72, MAT.black, u[1], 0.56, 0));
    const um = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.26, 8), new THREE.MeshStandardMaterial({ color: u[0], roughness: 0.85 }));
    um.position.set(u[1], 0.86, 0); um.castShadow = true; g.add(um);
  });
  g.position.set(x, 0, z); return g;
}
function makeBulletin(x, y, z, ry) {
  const g = new THREE.Group();
  g.add(box(1.8, 1.2, 0.06, MAT.woodDark, 0, 0, 0));
  const cork = new THREE.Mesh(new THREE.PlaneGeometry(1.66, 1.06), new THREE.MeshStandardMaterial({ color: 0xc9a06a, roughness: 1 }));
  cork.position.z = 0.035; g.add(cork);
  for (let i = 0; i < 10; i++) {
    const n = new THREE.Mesh(new THREE.PlaneGeometry(rnd(0.16, 0.26), rnd(0.15, 0.24)),
      new THREE.MeshStandardMaterial({ color: pick([0xffd94d, 0xff9ecf, 0x9dff9e, 0x9fd8ff, 0xffffff]), roughness: 0.9 }));
    n.position.set(rnd(-0.68, 0.68), rnd(-0.38, 0.38), 0.045); n.rotation.z = rnd(-0.2, 0.2); g.add(n);
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 6), new THREE.MeshStandardMaterial({ color: 0xe05252, roughness: 0.4 }));
    pin.position.set(n.position.x, n.position.y + 0.08, 0.055); g.add(pin);
  }
  g.position.set(x, y, z); g.rotation.y = ry || 0;
  return g;
}
function makeMonitorWall(x, y, z, ry) {
  const g = new THREE.Group();
  g.add(box(2.7, 1.55, 0.1, MAT.black, 0, 0, 0));
  for (let ix = 0; ix < 2; ix++) for (let iy = 0; iy < 2; iy++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.7), screenMat());
    s.position.set(-0.65 + ix * 1.3, -0.37 + iy * 0.74, 0.06); g.add(s);
  }
  g.position.set(x, y, z); g.rotation.y = ry || 0;
  return g;
}
function makeSnackShelf(x, y, z, ry) {
  const g = new THREE.Group();
  for (let s = 0; s < 3; s++) {
    g.add(box(1.8, 0.05, 0.36, MAT.wood, 0, s * 0.45, 0));
    for (let i = 0; i < 6; i++) {
      const bx = -0.75 + i * 0.3;
      if (Math.random() < 0.5) g.add(box(0.2, rnd(0.2, 0.3), 0.22, new THREE.MeshStandardMaterial({ color: pick(BOOKC), roughness: 0.8 }), bx, s * 0.45 + 0.15, 0));
      else g.add(cyl(0.075, 0.075, rnd(0.18, 0.26), new THREE.MeshStandardMaterial({ color: pick(BOOKC), roughness: 0.7 }), bx, s * 0.45 + 0.13, 0));
    }
  }
  g.add(box(0.06, 1.42, 0.36, MAT.woodDark, -0.9, 0.66, 0));
  g.add(box(0.06, 1.42, 0.36, MAT.woodDark, 0.9, 0.66, 0));
  g.position.set(x, y, z); g.rotation.y = ry || 0;
  return g;
}
function makeFridge(x, z, ry) {
  const g = new THREE.Group();
  const wm = new THREE.MeshStandardMaterial({ color: 0xd8dde4, roughness: 0.35, metalness: 0.25 });
  g.add(box(0.9, 1.9, 0.8, wm, 0, 0.95, 0));
  g.add(box(0.025, 1.7, 0.7, MAT.metal, 0, 0.95, 0));
  const cols = [0xe05252, 0x3f8cff, 0x3fae5a, 0xe8b93c, 0x9a63e8];
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.09), new THREE.MeshStandardMaterial({ color: pick(cols), roughness: 0.6 }));
    m.position.set(rnd(-0.3, 0.3), rnd(0.7, 1.6), 0.41); m.rotation.z = rnd(0, 3); g.add(m);
  }
  const note = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
  note.position.set(0.12, 1.2, 0.41); note.rotation.z = 0.1; g.add(note);
  g.position.set(x, 0, z); g.rotation.y = ry || 0;
  return g;
}
function makeFruitBowl(x, y, z) {
  const g = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.12, 0.1, 16, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x8a5a20, roughness: 0.7, side: THREE.DoubleSide }));
  bowl.position.y = 0.05; g.add(bowl);
  [[0xe8a33d, -0.08, 0], [0xc0392b, 0.08, 0.02], [0x3fae5a, 0, 0.09]].forEach(f => {
    const fr = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), new THREE.MeshStandardMaterial({ color: f[0], roughness: 0.6 }));
    fr.position.set(f[1], 0.12, f[2]); fr.castShadow = true; g.add(fr);
  });
  g.position.set(x, y, z); return g;
}
function makeMicrowave(x, y, z, ry) {
  const g = new THREE.Group();
  g.add(box(0.55, 0.32, 0.4, new THREE.MeshStandardMaterial({ color: 0x2b2e36, roughness: 0.5 }), 0, 0.16, 0));
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.24),
    new THREE.MeshStandardMaterial({ color: 0x0a0e14, roughness: 0.15, metalness: 0.4 }));
  door.position.set(-0.05, 0.16, 0.205); g.add(door);
  const btn = new THREE.Mesh(new THREE.PlaneGeometry(0.045, 0.045),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x3ddc84, emissiveIntensity: 2 }));
  btn.position.set(0.21, 0.24, 0.205); g.add(btn);
  g.position.set(x, y, z); if (ry) g.rotation.y = ry;
  return g;
}
function makeMugShelf(x, y, z, ry) {
  const g = new THREE.Group();
  g.add(box(1.6, 0.05, 0.26, MAT.wood, 0, 0, 0));
  for (let i = 0; i < 5; i++)
    g.add(cyl(0.05, 0.045, 0.11, new THREE.MeshStandardMaterial({ color: pick([0xc0392b, 0x3f8cff, 0x3fae5a, 0xe8b93c, 0x9a63e8]), roughness: 0.6 }), -0.64 + i * 0.32, 0.08, 0));
  g.add(box(0.05, 0.5, 0.24, MAT.woodDark, -0.78, 0.25, 0));
  g.add(box(0.05, 0.5, 0.24, MAT.woodDark, 0.78, 0.25, 0));
  g.position.set(x, y, z); g.rotation.y = ry || 0;
  return g;
}
function posterTexture(kind) {
  return canvasTex(120, 160, (c, w, h) => {
    const bg = { space: ['#1c1030', '#3f1a5e'], race: ['#101c30', '#1a5e3f'], fant: ['#301a10', '#5e3f1a'], retro: ['#2a0a2a', '#6e1a3a'], pixel: ['#0a2a2a', '#1a6e4a'] }[kind] || ['#222', '#444'];
    const gr = c.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, bg[0]); gr.addColorStop(1, bg[1]);
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff'; c.font = 'bold 22px monospace'; c.textAlign = 'center';
    c.fillText({ space: 'STAR', race: 'TURBO', fant: 'QUEST', retro: 'RETRO', pixel: 'PIXEL' }[kind] || 'GAME', w / 2, 44);
    c.fillStyle = 'rgba(255,255,255,0.22)';
    for (let i = 0; i < 9; i++) c.fillRect(rnd(10, w - 24), rnd(62, h - 24), rnd(8, 30), 4);
    c.fillStyle = '#e8b93c'; c.font = 'bold 13px monospace'; c.fillText('★ 2P ARCADE ★', w / 2, h - 18);
  }).tex;
}
function makePoster(x, y, z, ry, kind) {
  const g = new THREE.Group();
  g.add(box(1.0, 1.34, 0.05, MAT.black, 0, 0, 0));
  const p = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 1.26), new THREE.MeshStandardMaterial({ map: posterTexture(kind), roughness: 0.7 }));
  p.position.z = 0.03; g.add(p);
  g.position.set(x, y, z); g.rotation.y = ry || 0;
  return g;
}
function makeBunting(x0, x1, z, y) {
  const g = new THREE.Group();
  const pts = [], n = 20;
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push(new THREE.Vector3(x0 + (x1 - x0) * t, y - Math.sin(t * Math.PI) * 0.35, z)); }
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x666666 })));
  const shape = new THREE.Shape();
  shape.moveTo(-0.09, 0); shape.lineTo(0.09, 0); shape.lineTo(0, -0.2); shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  const cols = [0xe05252, 0x3f8cff, 0x3fae5a, 0xe8b93c, 0x9a63e8];
  for (let i = 1; i < n; i += 2) {
    const t = i / n;
    const f = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: cols[i % 5], roughness: 0.9, side: THREE.DoubleSide }));
    f.position.set(x0 + (x1 - x0) * t, y - Math.sin(t * Math.PI) * 0.35, z);
    g.add(f);
  }
  return g;
}
function makeTelescope(x, z) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    const leg = cyl(0.03, 0.03, 1.15, MAT.metal, Math.cos(a) * 0.28, 0.55, Math.sin(a) * 0.28);
    leg.rotation.z = Math.cos(a) * 0.35; leg.rotation.x = -Math.sin(a) * 0.35; g.add(leg);
  }
  const tube = cyl(0.09, 0.11, 0.95, new THREE.MeshStandardMaterial({ color: 0x2b2e36, roughness: 0.4, metalness: 0.5 }), 0, 1.3, 0);
  tube.rotation.z = -0.65; g.add(tube);
  const eye = cyl(0.03, 0.03, 0.12, MAT.black, -0.42, 1.0, 0); eye.rotation.z = -0.65; g.add(eye);
  g.position.set(x, 0, z); return g;
}
function makeBBQ(x, z) {
  const g = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT.black);
  bowl.rotation.x = Math.PI; bowl.position.y = 0.78; bowl.castShadow = true; g.add(bowl);
  const grate = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.025, 14), MAT.metal);
  grate.position.y = 0.78; g.add(grate);
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    g.add(cyl(0.02, 0.02, 0.72, MAT.metal, Math.cos(a) * 0.19, 0.36, Math.sin(a) * 0.19));
  }
  g.add(box(0.3, 0.06, 0.2, MAT.woodDark, 0.42, 0.5, 0));
  g.position.set(x, 0, z); return g;
}
function makeAcoustic(x, y, z, ry, color) {
  const p = box(0.9, 1.4, 0.07, new THREE.MeshStandardMaterial({ color, roughness: 1 }), x, y, z);
  p.rotation.y = ry || 0; return p;
}
function makeRehal(x, z, ry) {
  const g = new THREE.Group();
  const wm = new THREE.MeshStandardMaterial({ color: 0x6e4a24, roughness: 0.8 });
  const a1 = box(0.08, 0.62, 0.3, wm, 0, 0.3, 0); a1.rotation.z = 0.5; g.add(a1);
  const a2 = box(0.08, 0.62, 0.3, wm, 0, 0.3, 0); a2.rotation.z = -0.5; g.add(a2);
  g.add(box(0.36, 0.06, 0.27, new THREE.MeshStandardMaterial({ color: 0x2f6e3a, roughness: 0.8 }), 0, 0.55, 0));
  g.position.set(x, 0, z); if (ry) g.rotation.y = ry;
  return g;
}
function makeRailing(x0, x1, z) {
  const g = new THREE.Group();
  const n = Math.max(2, Math.round((x1 - x0) / 2));
  for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * i / n;
    g.add(box(0.09, 1.1, 0.09, MAT.metal, x, 0.55, 0));
  }
  g.add(box(x1 - x0, 0.09, 0.13, MAT.woodDark, (x0 + x1) / 2, 1.13, 0));
  const gl = box(x1 - x0, 0.72, 0.04, MAT.glass, (x0 + x1) / 2, 0.68, 0);
  gl.castShadow = false; g.add(gl);
  g.position.set(0, 0, z);
  return g;
}

/* ---- penempatan lantai 1 ---- */
// lemari pajangan: gamepad + piala mini + figurine (foyer)
floor1.add(makeDisplayCabinet(6.7, 10.5, -Math.PI / 2));
[[0xe05252, 9.8], [0x3f8cff, 10.5], [0x3fae5a, 11.2]].forEach(p => {
  const gp = makeGamepad(p[0]); gp.position.set(6.7, 0.74, p[1]); gp.rotation.y = -Math.PI / 2; floor1.add(gp);
});
[10.0, 10.6].forEach((zz, i) => {
  const t = new THREE.Group(); const s = 0.85;
  t.add(cyl(0.07 * s, 0.05 * s, 0.13 * s, GOLD, 0, 0.17 * s, 0));
  t.add(cyl(0.02 * s, 0.02 * s, 0.1 * s, GOLD, 0, 0.07 * s, 0));
  t.add(box(0.14 * s, 0.045 * s, 0.14 * s, MAT.woodDark, 0, 0.05 * s, 0));
  t.position.set(6.7, 1.34, zz); floor1.add(t);
});
const fig1 = makeFigurine(0xe05252); fig1.position.set(6.7, 1.34, 11.15); floor1.add(fig1);
const rk1 = makeRubiks(0.08); rk1.position.set(6.55, 0.2, 10.85); floor1.add(rk1);
const dc1 = makeDice(0.09); dc1.position.set(6.85, 0.17, 9.95); floor1.add(dc1);
// meja makan pantry
floor1.add(box(1.8, 0.08, 1.0, MAT.wood, 26.5, 0.74, 16.3));
[[-0.8, -0.4], [0.8, -0.4], [-0.8, 0.4], [0.8, 0.4]].forEach(o => floor1.add(box(0.08, 0.74, 0.08, MAT.woodDark, 26.5 + o[0], 0.37, 16.3 + o[1])));
floor1.add(makeChair(26.0, 17.25, Math.PI)); floor1.add(makeChair(27.0, 17.25, Math.PI));
floor1.add(makeChair(26.0, 15.35, 0)); floor1.add(makeChair(27.0, 15.35, 0));
// workbench server
floor1.add(makeWorkbench(28.6, 6.9, -Math.PI / 2));
// entrance: coat rack + umbrella + bulletin
floor1.add(makeCoatRack(1.6, 13.8));
floor1.add(makeUmbrellaStand(1.15, 12.3));
floor1.add(makeBulletin(0.18, 1.9, 15.8, Math.PI / 2));
// war room: dinding monitor 2x2
floor1.add(makeMonitorWall(8.75, 2.3, 8.16, 0));
// pantry: rak snack, kulkas magnet, buah, microwave, rak mug
floor1.add(makeSnackShelf(29.78, 1.5, 15.8, -Math.PI / 2));
floor1.add(makeFridge(29.35, 15.3, -Math.PI / 2));
floor1.add(makeFruitBowl(26.0, 1.03, 14.1));
floor1.add(makeMicrowave(27.9, 1.03, 14.1, Math.PI));
floor1.add(makeMugShelf(29.82, 2.3, 14.1, -Math.PI / 2));
// poster game
floor1.add(makePoster(16.18, 2.3, 12, Math.PI / 2, 'space'));
floor1.add(makePoster(12.18, 2.3, 5, Math.PI / 2, 'race'));
floor1.add(makePoster(23.18, 2.3, 13, Math.PI / 2, 'fant'));
// figurine & mainan di meja
const fig2 = makeFigurine(0x3f8cff); fig2.position.set(1.0, 0.79, 2.4); floor1.add(fig2);
const fig3 = makeFigurine(0x3fae5a); fig3.position.set(4.7, 0.79, 5.6); floor1.add(fig3);
const fig4 = makeFigurine(0xe8b93c); fig4.position.set(20.6, 0.79, 4.0); floor1.add(fig4);
const dc2 = makeDice(0.09); dc2.position.set(20.2, 0.84, 4.9); floor1.add(dc2);
const rk2 = makeRubiks(0.08); rk2.position.set(6.0, 0.86, 2.4); floor1.add(rk2);
floor1.add(makeLaptop(20.75, 0.79, 4.45, -0.4));
const hs1 = makeHeadphoneStand(); hs1.position.set(4.85, 0.79, 2.1); floor1.add(hs1);
const hs2 = makeHeadphoneStand(); hs2.position.set(8.35, 0.79, 5.3); floor1.add(hs2);
// sticky notes
stickyNote(floor1, 7.26, 2.3, 11.4, Math.PI / 2); stickyNote(floor1, 7.26, 1.7, 12.3, Math.PI / 2);
stickyNote(floor1, 19.8, 3.2, 0.2, 0); stickyNote(floor1, 21.2, 2.9, 0.2, 0);
// botol minum di meja conference
[[10.8, 12.6], [12.2, 13.4], [11.5, 13.9]].forEach(p => floor1.add(makeBottle(p[0], 0.8, p[1])));
// bunting meriah
floor1.add(makeBunting(2, 11, 4, 3.35));
floor1.add(makeBunting(8, 15, 13, 3.35));
// fairy lights lounge
floor1.add(makeStringLights(16.5, 22.5, 17.6, 17.6, 2.9));
// kursi tunggu foyer + meja majalah
floor1.add(makeChair(5.4, 16.6, Math.PI)); floor1.add(makeChair(6.4, 16.6, Math.PI));
floor1.add(cyl(0.32, 0.32, 0.05, MAT.wood, 4.55, 0.5, 16.6));
floor1.add(cyl(0.04, 0.05, 0.5, MAT.metal, 4.55, 0.25, 16.6));
floor1.add(box(0.3, 0.04, 0.22, new THREE.MeshStandardMaterial({ color: 0xe05252, roughness: 0.8 }), 4.55, 0.55, 16.6));
floor1.add(makeRug(3.5, 14.3, 3.4, 2.2, 0x9a8a6a));
floor1.add(makePlant(27.5, 9.6, 1.1)); floor1.add(makePlant(1.6, 8.7, 1.0));
// ---- TERAS lantai 1 ----
floor1.add(makeRailing(0, 30, 21));
floor1.add(makeBench(8, 19.6, 0)); floor1.add(makeBench(12, 19.6, 0));
floor1.add(box(1.3, 0.08, 0.75, MAT.wood, 10, 0.55, 19.6));
floor1.add(box(0.08, 0.55, 0.08, MAT.metal, 9.5, 0.27, 19.6)); floor1.add(box(0.08, 0.55, 0.08, MAT.metal, 10.5, 0.27, 19.6));
floor1.add(makeBBQ(24, 19.8));
floor1.add(makePlanter(2.5, 19.6, 2.0)); floor1.add(makePlanter(27.5, 19.6, 2.0));
floor1.add(makeStringLights(2, 28, 19.5, 19.5, 3.1));
warmLight(15, 2.6, 19.5, 10, 14);

/* ---- penempatan lantai 2 ---- */
floor2.add(makeTelescope(5.5, 16.3));
floor2.add(cyl(0.35, 0.35, 0.05, MAT.wood, 4.4, 0.52, 16.3));
floor2.add(cyl(0.04, 0.05, 0.52, MAT.metal, 4.4, 0.26, 16.3));
[7.16, 15.84].forEach((px, wi) => {
  [11.5, 13, 14.5].forEach((pz, i) => {
    floor2.add(makeAcoustic(px, 1.8, pz, wi === 0 ? Math.PI / 2 : -Math.PI / 2, [0x9a63e8, 0x3f8cff, 0xe8b93c][i % 3]));
  });
});
floor2.add(makeRehal(4.2, 4.8, 0.3));
floor2.add(makeSnackShelf(19.5, 1.5, 17.82, Math.PI));
floor2.add(makeRug(17.5, 4, 7.4, 4.6, 0x8d7fb8));
// ---- TERAS lantai 2 ----
floor2.add(makeRailing(0, 30, 21));
floor2.add(makePlanter(3, 19.6, 2.0)); floor2.add(makePlanter(27, 19.6, 2.0));
floor2.add(makeBench(15, 19.6, 0));
floor2.add(makeStringLights(2, 28, 19.5, 19.5, 3.1));
warmLight(15, 7.2, 19.5, 10, 14);
console.log('[ho3d] accessories v1.2 loaded (gamepad, piala, teras)');

/* ============ LIFT antar lantai (v1.3) ============ */
const LIFT = { x: 24.5, z: 9.2, w: 1.9, d: 1.9, floors: [0, 4.6] };
const liftGroup = new THREE.Group(); scene.add(liftGroup);
const liftDoors = [[], []];
let liftCabin = null;
const lift = { y: 0, targetY: 0, state: 'idle', doors: 0, job: null, queue: [], timer: 0 };
function liftSignTexture(txt) {
  return canvasTex(96, 64, (c, w, h) => {
    c.fillStyle = '#0a0c10'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#3ddc84'; c.font = 'bold 38px monospace'; c.textAlign = 'center';
    c.fillText(txt, w / 2, 45);
  }).tex;
}
function buildLift() {
  const { x, z, w, d } = LIFT;
  const H = 7.9;
  [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]].forEach(o =>
    liftGroup.add(box(0.15, H, 0.15, MAT.metal, x + o[0], H / 2, z + o[1])));
  const back = box(w, H, 0.06, MAT.glass, x, H / 2, z - d / 2); back.castShadow = false; liftGroup.add(back);
  const gl = box(0.06, H, d, MAT.glass, x - w / 2, H / 2, z); gl.castShadow = false; liftGroup.add(gl);
  const gr = box(0.06, H, d, MAT.glass, x + w / 2, H / 2, z); gr.castShadow = false; liftGroup.add(gr);
  liftGroup.add(box(w + 0.4, 0.3, d + 0.4, MAT.metal, x, H + 0.15, z));
  liftGroup.add(box(w + 0.4, 0.22, d + 0.4, new THREE.MeshStandardMaterial({ color: 0x11141c, roughness: 1 }), x, 0.11, z));
  [0, 1].forEach(f => {
    const yb = LIFT.floors[f];
    const fh = box(w, H - yb - 2.7, 0.06, MAT.glass, x, yb + 2.7 + (H - yb - 2.7) / 2, z + d / 2);
    fh.castShadow = false; liftGroup.add(fh);
    [-1, 1].forEach(s => {
      const strip = box((w - 1.25) / 2, 2.6, 0.06, MAT.glass, x + s * (0.625 + (w - 1.25) / 4), yb + 1.3, z + d / 2);
      strip.castShadow = false; liftGroup.add(strip);
    });
    const dm = new THREE.MeshStandardMaterial({ color: 0x9aa4b5, roughness: 0.35, metalness: 0.6 });
    const dl = box(0.62, 2.5, 0.09, dm, x - 0.31, yb + 1.25, z + d / 2 + 0.02);
    const dr = box(0.62, 2.5, 0.09, dm, x + 0.31, yb + 1.25, z + d / 2 + 0.02);
    liftGroup.add(dl); liftGroup.add(dr); liftDoors[f] = [dl, dr];
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.37),
      new THREE.MeshBasicMaterial({ map: liftSignTexture(f === 0 ? '1' : '2') }));
    sign.position.set(x, yb + 2.95, z + d / 2 + 0.06); liftGroup.add(sign);
    const lbl = textSprite('LIFT', { fontSize: 40, color: '#9fd8ff', bg: 'rgba(10,12,18,0.85)', border: '#9fd8ff', scale: 0.55 });
    lbl.position.set(x, yb + 3.35, z + d / 2 + 0.05); liftGroup.add(lbl);
  });
  liftCabin = new THREE.Group();
  liftCabin.add(box(1.5, 0.1, 1.5, MAT.metal, 0, 0.05, 0));
  const wm = new THREE.MeshStandardMaterial({ color: 0x8a93a3, roughness: 0.4, metalness: 0.5 });
  liftCabin.add(box(1.5, 2.3, 0.08, wm, 0, 1.25, -0.71));
  liftCabin.add(box(0.08, 2.3, 1.5, wm, -0.71, 1.25, 0));
  liftCabin.add(box(0.08, 2.3, 1.5, wm, 0.71, 1.25, 0));
  liftCabin.add(box(1.5, 0.12, 1.5, wm, 0, 2.42, 0));
  const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7),
    new THREE.MeshStandardMaterial({ color: 0xfff3d0, emissive: 0xffedb8, emissiveIntensity: 2.2 }));
  cl.rotation.x = Math.PI / 2; cl.position.y = 2.35; liftCabin.add(cl);
  liftCabin.position.set(x, 0, z);
  scene.add(liftCabin);
  console.log('[ho3d] lift built');
}
function setLiftDoors(d) {
  [0, 1].forEach(f => {
    const p = liftDoors[f]; if (!p || !p[0]) return;
    p[0].position.x = LIFT.x - 0.31 - 0.6 * d;
    p[1].position.x = LIFT.x + 0.31 + 0.6 * d;
  });
}
function nearestGapX(x) {
  const gaps = [3.1, 10.1, 15.1, 20.1, 26.1];
  let best = gaps[0], bd = 1e9;
  for (const gx of gaps) { const d = Math.abs(gx - x); if (d < bd) { bd = d; best = gx; } }
  return best;
}
function routeToLift(a) {
  const x = a.g.position.x, z = a.g.position.z;
  const pts = [];
  if (z < 8) {
    const gx = nearestGapX(x);
    for (const wx of [12, 17]) if ((x < wx) !== (gx < wx)) pts.push([wx, 4.0]);
    pts.push([gx, 8.6], [gx, 13]);
  } else if (Math.abs(z - 13) > 0.6) pts.push([x, 13]);
  pts.push([23, 13], [LIFT.x, 11.6]);
  return pts;
}
function routeFromLift(sp) {
  const pts = [[23, 13]];
  if (sp.y < 8) {
    const gx = nearestGapX(sp.x);
    pts.push([gx, 13], [gx, 8.6]);
    for (const wx of [12, 17]) {
      const lx = pts[pts.length - 1][0];
      if ((lx < wx) !== (sp.x < wx)) pts.push([wx, 4.0]);
    }
    pts.push([sp.x, sp.y]);
  } else pts.push([sp.x, 13], [sp.x, sp.y]);
  return pts;
}
function sendAgentViaLift(a, toFl) {
  if (!a || !agents.has(a.id)) return;
  if (['inlift', 'tolift', 'waitlift'].includes(a.st)) return;
  if (a.spot) { a.spot.taken = null; a.spot = null; }
  a.st = 'tolift';
  a.say('ke lantai ' + (toFl + 1) + ' 🛗', 2600);
  a.walkTo(routeToLift(a), () => {
    a.st = 'waitlift';
    a.g.rotation.y = Math.PI;
    lift.queue.push({ agent: a, toFl, phase: 'board' });
  });
}
function callLiftRandom() {
  const cands = [...agents.values()].filter(a => a.st === 'working' && a.spot);
  if (!cands.length) { logActivity('🛗', 'lift dipanggil — belum ada agen'); return; }
  const a = pick(cands);
  sendAgentViaLift(a, a.fl === 0 ? 1 : 0);
  logActivity('🛗', '<b>' + a.label + '</b> dipanggil naik lift 🛗');
}
function pumpLift() {
  if (lift.job || !lift.queue.length) return;
  const job = lift.queue.shift();
  if (!agents.has(job.agent.id)) return;
  lift.job = job; job.phase = 'board';
  const fromY = job.agent.fl * 4.6;
  if (Math.abs(lift.y - fromY) > 0.02) { lift.targetY = fromY; lift.state = 'moving'; }
  else lift.state = 'opening';
}
function liftUpdate(dt) {
  const wantOpen = (lift.state === 'opening' || lift.state === 'open') ? 1 : 0;
  lift.doors += clamp(wantOpen - lift.doors, -dt * 1.8, dt * 1.8);
  setLiftDoors(lift.doors);
  const job = lift.job;
  if (lift.state === 'moving') {
    const dy = lift.targetY - lift.y;
    lift.y += Math.sign(dy) * Math.min(Math.abs(dy), dt * 2.6);
    liftCabin.position.y = lift.y;
    if (job && job.phase === 'riding' && agents.has(job.agent.id)) job.agent.g.position.y = lift.y;
    if (Math.abs(lift.targetY - lift.y) < 0.02) {
      lift.y = lift.targetY; liftCabin.position.y = lift.y;
      if (job && job.phase === 'riding') job.phase = 'alight';
      lift.state = 'opening';
    }
  } else if (lift.state === 'opening') {
    if (lift.doors > 0.97) { lift.state = 'open'; lift.timer = 0; }
  } else if (lift.state === 'open') {
    lift.timer += dt;
    if (job && lift.timer > 0.5) {
      if (job.phase === 'board') {
        if (!agents.has(job.agent.id)) { lift.job = null; lift.state = 'closing'; return; }
        job.phase = 'in';
        const a = job.agent;
        a.walkTo([[LIFT.x, LIFT.z]], () => {
          a.st = 'inlift'; a.sitAmt = 0;
          a.g.position.set(LIFT.x, lift.y, LIFT.z);
          a.g.rotation.y = Math.PI;
          job.phase = 'riding';
          lift.state = 'closing';
        });
      } else if (job.phase === 'alight') {
        job.phase = 'out';
        const a = job.agent;
        if (!agents.has(a.id)) { lift.job = null; lift.state = 'closing'; return; }
        a.fl = job.toFl; a.baseY = job.toFl * 4.6;
        a.g.position.set(LIFT.x, a.baseY, LIFT.z);
        a.st = 'walk';
        a.walkTo([[LIFT.x, LIFT.z + 2.4]], () => {
          const fs = freeSpotFor(job.toFl);
          if (fs) { fs.s.taken = a; a.walkTo(routeFromLift(fs.s), () => a.sitAt(fs.s)); }
          else a.st = 'idle';
          logActivity('🛗', '<b>' + a.label + '</b> tiba di lantai ' + (job.toFl + 1));
          lift.job = null; lift.state = 'closing';
        });
      }
    }
  } else if (lift.state === 'closing') {
    if (lift.doors < 0.03) {
      if (job && job.phase === 'riding') { lift.targetY = job.toFl * 4.6; lift.state = 'moving'; }
      else { lift.state = 'idle'; lift.job = null; pumpLift(); }
    }
  } else pumpLift();
}
buildLift();
updaters.push(liftUpdate);
// lift otomatis: tiap ~30 detik ada agen yang pindah lantai
let liftAutoT = 0;
updaters.push((dt) => {
  liftAutoT += dt;
  if (liftAutoT > 30) {
    liftAutoT = 0;
    if (lift.job || lift.queue.length) return;
    const cands = [...agents.values()].filter(a => a.st === 'working' && a.spot);
    if (cands.length > 3 && Math.random() < 0.75) {
      const a = pick(cands);
      const toFl = a.fl === 0 ? 1 : 0;
      sendAgentViaLift(a, toFl);
      logActivity('🛗', '<b>' + a.label + '</b> naik lift ke lantai ' + (toFl + 1));
    }
  }
});
console.log('[ho3d] lift system ready (v1.3)');

/* ============ accessories v1.4 — lantai 2 marathon ============ */
function makeShoeRack(x, z, ry) {
  const g = new THREE.Group();
  for (let s = 0; s < 3; s++) g.add(box(1.2, 0.05, 0.35, MAT.woodDark, 0, 0.15 + s * 0.32, 0));
  [-0.55, 0.55].forEach(px => g.add(box(0.05, 1.0, 0.35, MAT.woodDark, px, 0.5, 0)));
  for (let s = 0; s < 3; s++) for (let i = 0; i < 3; i++) {
    const sh = box(0.11, 0.09, 0.28, new THREE.MeshStandardMaterial({ color: pick([0x5a3a2a, 0x2b2b33, 0x7a5a3a, 0x3f3f4a]), roughness: 0.9 }), -0.4 + i * 0.4, 0.24 + s * 0.32, 0);
    sh.rotation.y = rnd(-0.15, 0.15); g.add(sh);
  }
  g.position.set(x, 0, z); if (ry) g.rotation.y = ry;
  return g;
}
function makeQuranShelf(x, y, z, ry) {
  const g = new THREE.Group();
  g.add(box(1.8, 0.06, 0.3, MAT.wood, 0, 0, 0));
  for (let i = 0; i < 7; i++) {
    const b = box(0.09, rnd(0.24, 0.32), 0.22, new THREE.MeshStandardMaterial({ color: pick([0x2f6e3a, 0x8a2f2f, 0x2f4a8a, 0xc9a227]), roughness: 0.8 }), -0.7 + i * 0.22, 0.17, 0);
    b.rotation.z = rnd(-0.08, 0.08); g.add(b);
  }
  g.add(box(0.06, 0.5, 0.26, MAT.woodDark, -0.85, -0.25, 0));
  g.add(box(0.06, 0.5, 0.26, MAT.woodDark, 0.85, -0.25, 0));
  g.position.set(x, y, z); g.rotation.y = ry || 0;
  return g;
}
function makeWaterDispenser(x, z) {
  const g = new THREE.Group();
  g.add(box(0.42, 1.05, 0.42, new THREE.MeshStandardMaterial({ color: 0xdde3ea, roughness: 0.4 }), 0, 0.53, 0));
  g.add(cyl(0.14, 0.14, 0.32, new THREE.MeshPhysicalMaterial({ color: 0xaad4f0, transparent: true, opacity: 0.5, roughness: 0.1 }), 0, 1.2, 0));
  g.add(box(0.06, 0.1, 0.08, MAT.black, 0, 0.82, 0.22));
  g.add(box(0.3, 0.04, 0.2, MAT.metal, 0, 0.72, 0.18));
  g.position.set(x, 0, z);
  return g;
}
function makeCeilingFan(x, z) {
  const g = new THREE.Group();
  g.add(cyl(0.03, 0.03, 0.5, MAT.metal, 0, 3.0, 0));
  g.add(cyl(0.12, 0.16, 0.14, new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.6 }), 0, 2.72, 0));
  const blades = new THREE.Group(); blades.position.y = 2.68;
  for (let i = 0; i < 4; i++) {
    const holder = new THREE.Group(); holder.rotation.y = i / 4 * Math.PI * 2;
    holder.add(box(0.85, 0.03, 0.16, MAT.woodDark, 0.55, 0, 0));
    blades.add(holder);
  }
  g.add(blades);
  g.position.set(x, 0, z);
  updaters.push((dt) => { blades.rotation.y += dt * 7; });
  return g;
}
function makeShelfRack(x, z, ry) {
  const g = new THREE.Group();
  const fm = new THREE.MeshStandardMaterial({ color: 0x707a88, roughness: 0.5, metalness: 0.5 });
  [[-1.1, -0.28], [1.1, -0.28], [-1.1, 0.28], [1.1, 0.28]].forEach(o => g.add(box(0.08, 2.0, 0.08, fm, o[0], 1.0, o[1])));
  for (let s = 0; s < 3; s++) {
    g.add(box(2.3, 0.06, 0.64, fm, 0, 0.35 + s * 0.65, 0));
    for (let i = 0; i < 4; i++) {
      if (Math.random() < 0.85)
        g.add(box(rnd(0.35, 0.5), rnd(0.3, 0.5), 0.45, new THREE.MeshStandardMaterial({ color: pick([0xb08d57, 0x9a7a4a, 0x8a8f96, 0x6e7a68]), roughness: 0.9 }), -0.85 + i * 0.57, 0.35 + s * 0.65 + 0.22, 0));
    }
  }
  g.position.set(x, 0, z); if (ry) g.rotation.y = ry;
  return g;
}
function makeCrateStack(x, z, n) {
  const g = new THREE.Group();
  const cm = new THREE.MeshStandardMaterial({ color: 0xa87f4e, roughness: 0.95 });
  let y = 0;
  for (let i = 0; i < n; i++) {
    const s = rnd(0.5, 0.7);
    const c = box(s, s * 0.7, s, cm, rnd(-0.05, 0.05), y + s * 0.35, rnd(-0.05, 0.05));
    c.rotation.y = rnd(-0.2, 0.2); g.add(c); y += s * 0.7;
  }
  g.position.set(x, 0, z);
  return g;
}
function makeFilingCabinet(x, z, ry) {
  const g = new THREE.Group();
  const wm = new THREE.MeshStandardMaterial({ color: 0x9aa2ae, roughness: 0.45, metalness: 0.35 });
  g.add(box(0.5, 1.35, 0.62, wm, 0, 0.68, 0));
  for (let i = 0; i < 4; i++) {
    g.add(box(0.42, 0.26, 0.02, new THREE.MeshStandardMaterial({ color: 0x7a828e, roughness: 0.5, metalness: 0.3 }), 0, 0.28 + i * 0.3, 0.32));
    g.add(box(0.14, 0.025, 0.03, MAT.black, 0, 0.28 + i * 0.3, 0.33));
  }
  g.position.set(x, 0, z); g.rotation.y = ry || 0;
  return g;
}
function makeLadder(x, z, ry) {
  const g = new THREE.Group();
  const lm = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.6 });
  [-0.3, 0.3].forEach(px => { const r = box(0.07, 2.2, 0.07, lm, px, 1.1, 0); r.rotation.x = 0.18; g.add(r); });
  for (let i = 0; i < 5; i++) g.add(box(0.6, 0.06, 0.06, lm, 0, 0.35 + i * 0.4, -0.06 - i * 0.073));
  g.position.set(x, 0, z); if (ry) g.rotation.y = ry;
  return g;
}
function makeSunLounger(x, z, ry) {
  const g = new THREE.Group();
  const fm = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.8 });
  const fab = new THREE.MeshStandardMaterial({ color: pick([0x3f8cff, 0xe05252, 0x3fae5a]), roughness: 0.9 });
  g.add(box(0.62, 0.07, 1.7, fm, 0, 0.42, 0));
  const bk = box(0.62, 0.07, 0.7, fm, 0, 0.62, -1.0); bk.rotation.x = -0.7; g.add(bk);
  g.add(box(0.56, 0.06, 1.6, fab, 0, 0.48, 0));
  [[-0.25, -0.7], [0.25, -0.7], [-0.25, 0.7], [0.25, 0.7]].forEach(o => g.add(box(0.06, 0.42, 0.06, fm, o[0], 0.21, o[1])));
  g.position.set(x, 0, z); if (ry) g.rotation.y = ry;
  return g;
}
function makeUmbrella(x, z) {
  const g = new THREE.Group();
  g.add(cyl(0.035, 0.035, 2.3, MAT.woodDark, 0, 1.15, 0));
  const top = new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.55, 10), new THREE.MeshStandardMaterial({ color: pick([0xe05252, 0x3f8cff, 0xe8b93c]), roughness: 0.85, side: THREE.DoubleSide }));
  top.position.y = 2.25; top.castShadow = true; g.add(top);
  g.add(cyl(0.3, 0.35, 0.12, MAT.metal, 0, 0.06, 0));
  g.position.set(x, 0, z);
  return g;
}
function makeDirectory(x, y, z, ry) {
  const g = new THREE.Group();
  g.add(box(1.5, 2.0, 0.08, MAT.woodDark, 0, 0, 0));
  const tex = canvasTex(180, 240, (c, w, h) => {
    c.fillStyle = '#f4f1e6'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#23232e'; c.font = 'bold 20px monospace'; c.textAlign = 'center';
    c.fillText('DIRECTORY', w / 2, 30);
    c.font = '15px monospace'; c.textAlign = 'left';
    [['Lt 1', 'Dev/Meeting'], ['Lt 2', 'Mushola/R&D'], ['Roof', 'Garden']].forEach((r, i) => {
      c.fillStyle = '#3f8cff'; c.fillText(r[0], 18, 70 + i * 44);
      c.fillStyle = '#23232e'; c.fillText(r[1], 66, 70 + i * 44);
    });
    c.fillStyle = '#e8b93c'; c.fillRect(0, h - 14, w, 14);
  }).tex;
  const p = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 1.86), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  p.position.z = 0.045; g.add(p);
  [-0.6, 0.6].forEach(px => g.add(box(0.08, 1.1, 0.08, MAT.metal, px, -1.5, 0)));
  g.position.set(x, y, z); g.rotation.y = ry || 0;
  return g;
}

/* ---- MUSHOLA ---- */
const rugCols = [0x2f6e4a, 0x7a2f3a, 0x2f4a7a, 0x6e5a2f];
[3.1, 5.5].forEach((rz, ri) => {
  [1.5, 3.9, 6.3, 8.7].forEach((rx, ci) => {
    floor2.add(box(0.72, 0.035, 1.25, new THREE.MeshStandardMaterial({ color: rugCols[(ri + ci) % 4], roughness: 1 }), rx, 0.035, rz));
    floor2.add(box(0.58, 0.02, 1.1, new THREE.MeshStandardMaterial({ color: 0xd8c98a, roughness: 1 }), rx, 0.055, rz));
  });
});
floor2.add(makeShoeRack(10.9, 7.2, Math.PI / 2));
floor2.add(makeQuranShelf(6, 2.3, 0.2, 0));
floor2.add(makeWallClock(10.5, 2.7, 0.15, 0));
floor2.add(makePendant(6, 4, true, 4.6));
floor2.add(makePlant(0.9, 7.3, 1.0)); floor2.add(makePlant(11.2, 0.9, 0.9));
{
  const tb = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.016, 6, 14), new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 0.7 }));
  tb.position.set(4.45, 0.62, 4.8); tb.rotation.x = Math.PI / 2.3; floor2.add(tb);
}

/* ---- MEET2 ---- */
floor2.add(makeConfTable(17.5, 4));
for (let mi = 0; mi < 8; mi++) {
  const an = mi / 8 * Math.PI * 2;
  const mx = 17.5 + Math.cos(an) * 2.55, my = 4 + Math.sin(an) * 1.75;
  floor2.add(makeChair(mx, my, Math.atan2(17.5 - mx, 4 - my)));
}
floor2.add(makeGlassboard(12.15, 2.0, 4, Math.PI / 2));
{ const tv = makeSprintTV(22.85, 2.2, 4); tv.rotation.y = -Math.PI / 2; floor2.add(tv); }
[[16.8, 3.6], [18.2, 4.4], [17.5, 3.4]].forEach(p => floor2.add(makeBottle(p[0], 0.85, p[1])));
floor2.add(makeWallClock(17.5, 2.8, 0.15, 0));
floor2.add(makePendant(17.5, 4, true, 4.6));
floor2.add(makeCeilingFan(15, 5.8));
floor2.add(makePlant(12.7, 7.3, 1.1)); floor2.add(makePlant(22.3, 0.9, 1.0));
floor2.add(makeFrame(17.5, 2.4, 7.85, Math.PI, 0));

/* ---- GUDANG ---- */
floor2.add(makeShelfRack(24.8, 1.2, 0));
floor2.add(makeShelfRack(27.8, 1.2, 0));
floor2.add(makeCrateStack(24.2, 6.6, 3));
floor2.add(makeCrateStack(28.6, 6.4, 4));
floor2.add(makeCrateStack(26.4, 7.2, 2));
floor2.add(makeFilingCabinet(29.4, 3.2, -Math.PI / 2));
floor2.add(makeFilingCabinet(29.4, 4.4, -Math.PI / 2));
floor2.add(makeLadder(25.5, 2.6, 0.4));
floor2.add(makeTrashBin(23.6, 7.4));

/* ---- ROOF GARDEN ---- */
floor2.add(makeSunLounger(2.2, 11.5, 0));
floor2.add(makeSunLounger(4.6, 11.5, 0));
floor2.add(makeUmbrella(4.3, 14.8));
floor2.add(cyl(0.45, 0.45, 0.05, MAT.wood, 3.4, 0.68, 14.8));
floor2.add(cyl(0.05, 0.06, 0.68, MAT.metal, 3.4, 0.34, 14.8));
floor2.add(makeChair(2.7, 14.8, Math.PI / 2)); floor2.add(makeChair(4.1, 14.8, -Math.PI / 2));
floor2.add(makePlanter(1.2, 17.3, 1.6)); floor2.add(makePlanter(5.8, 17.3, 1.6));
floor2.add(makeBunting(0.8, 6.8, 14.5, 3.2));
floor2.add(makeFrame(3.5, 2.3, 17.85, Math.PI, 2));

/* ---- BOOTH ---- */
[9, 11.5, 14].forEach(bx => {
  floor2.add(box(0.9, 0.05, 0.3, MAT.wood, bx, 1.6, 17.8));
  floor2.add(makeSucculent(bx - 0.2, 1.63, 17.8));
  const hs = makeHeadphoneStand(); hs.position.set(bx + 0.2, 1.63, 17.8); floor2.add(hs);
});
floor2.add(makeBookshelf(15.4, 9.5, -Math.PI / 2, 2.4));
floor2.add(makeRug(11.5, 13.5, 7, 3, 0x5a6a7a));
floor2.add(makeCoatRack(7.7, 16.8));
floor2.add(makeCeilingFan(13.8, 15.5));
floor2.add(makeHangingPlant(8.2, 10.5, 1));
floor2.add(makeHangingPlant(14.8, 10.5, 1));

/* ---- PANTRY 2 ---- */
floor2.add(box(3.4, 1.0, 0.7, MAT.wood, 19.5, 0.5, 8.95));
floor2.add(box(3.5, 0.06, 0.8, MAT.woodDark, 19.5, 1.03, 8.95));
{ const cm = makeCoffeeMachine(0, 0, 0); cm.position.set(18.3, 1.06, 8.95); floor2.add(cm); }
floor2.add(makeMicrowave(20.6, 1.06, 8.95, 0));
floor2.add(makeMugShelf(21.8, 2.1, 8.72, 0));
floor2.add(makeFruitBowl(19.5, 1.06, 8.95));
floor2.add(makeWaterDispenser(16.9, 9.3));
floor2.add(makeFridge(22.7, 16.3, Math.PI));
floor2.add(makePoster(19.5, 2.3, 17.85, Math.PI, 'fant'));
floor2.add(makePlant(16.7, 16.8, 1.0));
floor2.add(makeTrashBin(22.9, 9.4));
floor2.add(makeBunting(17, 22, 12, 3.1));

/* ---- LIFT LOBBY ---- */
floor2.add(makeBench(27, 12.5, Math.PI / 2));
floor2.add(makeDirectory(23.35, 1.9, 14, Math.PI / 2));
floor2.add(makeDisplayCabinet(29.55, 14.5, -Math.PI / 2, 2.2));
[[0x9a63e8, 14.0], [0xe8b93c, 14.5], [0xe05252, 15.0]].forEach(p => {
  const gp = makeGamepad(p[0]); gp.position.set(29.55, 0.74, p[1]); gp.rotation.y = -Math.PI / 2; floor2.add(gp);
});
{ const fg5 = makeFigurine(0x3f8cff); fg5.position.set(29.55, 1.34, 14.2); floor2.add(fg5); }
{ const fg6 = makeFigurine(0x3fae5a); fg6.position.set(29.55, 1.34, 14.8); floor2.add(fg6); }
floor2.add(makePlant(29, 16.8, 1.3)); floor2.add(makePlant(23.8, 17.2, 1.0));
floor2.add(makeRug(26.5, 13.5, 4.5, 3, 0x6a7a8d));
floor2.add(makeFrame(26.5, 2.4, 17.85, Math.PI, 1));
floor2.add(makeSconce(23.15, 2.4, 12, Math.PI / 2));
floor2.add(makeSconce(23.15, 2.4, 16, Math.PI / 2));
floor2.add(makeExtinguisher(23.4, 11.2));
floor2.add(makeExitSign(26.1, 2.7, 8.12, 0));

/* ---- koridor & umum lt2 ---- */
floor2.add(makePoster(5, 2.3, 8.12, 0, 'space'));
floor2.add(makePoster(20, 2.3, 8.12, 0, 'race'));
floor2.add(makeWallClock(12, 2.6, 8.12, 0));
floor2.add(makeBulletin(29.85, 1.9, 12.5, -Math.PI / 2));
floor2.add(makeTrashBin(7.4, 9.0));
floor2.add(makeTrashBin(16.4, 17.4));
console.log('[ho3d] accessories v1.4 loaded (lantai 2 marathon)');

/* ============ accessories v1.5 — dinding & lantai full rame ============ */
function makeVendingMachine(x, z, ry) {
  const g = new THREE.Group();
  g.add(box(1.1, 2.0, 0.75, new THREE.MeshStandardMaterial({ color: 0x27408b, roughness: 0.4 }), 0, 1.0, 0));
  const gl = box(0.9, 1.25, 0.04, MAT.glass, 0, 1.28, 0.36); gl.castShadow = false; g.add(gl);
  for (let s = 0; s < 3; s++) for (let i = 0; i < 4; i++)
    g.add(box(0.16, 0.2, 0.12, new THREE.MeshStandardMaterial({ color: pick(BOOKC), roughness: 0.7 }), -0.33 + i * 0.22, 0.95 + s * 0.32, 0.28));
  g.add(box(0.94, 0.05, 0.05, new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x9fd8ff, emissiveIntensity: 2 }), 0, 1.98, 0.3));
  g.add(box(0.7, 0.28, 0.05, MAT.black, 0, 0.35, 0.36));
  g.position.set(x, 0, z); g.rotation.y = ry || 0;
  return g;
}
function makeDartboard(x, y, z, ry) {
  const g = new THREE.Group();
  g.add(box(0.85, 0.85, 0.1, MAT.woodDark, 0, 0, -0.06));
  const disc = cyl(0.32, 0.32, 0.06, MAT.black, 0, 0, 0); disc.rotation.x = Math.PI / 2; g.add(disc);
  const tex = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#1c1c22'; c.fillRect(0, 0, w, h);
    ['#e8e4da', '#1c1c22', '#c0392b', '#1c1c22', '#3fae5a'].forEach((rc, i) => {
      c.fillStyle = rc; c.beginPath(); c.arc(64, 64, 56 - i * 10, 0, 7); c.fill();
    });
    c.fillStyle = '#c0392b'; c.beginPath(); c.arc(64, 64, 7, 0, 7); c.fill();
  }).tex;
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.3, 24), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
  face.position.z = 0.035; g.add(face);
  [[0.12, 0.08], [-0.1, -0.12]].forEach(p => {
    const dart = cyl(0.008, 0.008, 0.22, new THREE.MeshStandardMaterial({ color: 0xe8b93c, roughness: 0.5 }), p[0], p[1], 0.14);
    dart.rotation.x = Math.PI / 2 - 0.15; g.add(dart);
  });
  g.position.set(x, y, z); g.rotation.y = ry || 0;
  return g;
}
function makeWallShelf(x, y, z, ry, w) {
  w = w || 1.6;
  const g = new THREE.Group();
  g.add(box(w, 0.06, 0.28, MAT.wood, 0, 0, 0));
  g.add(box(0.06, 0.3, 0.24, MAT.woodDark, -w / 2 + 0.05, -0.15, 0));
  g.add(box(0.06, 0.3, 0.24, MAT.woodDark, w / 2 - 0.05, -0.15, 0));
  const n = Math.max(2, Math.floor(w / 0.45));
  for (let i = 0; i < n; i++) {
    const px = -w / 2 + 0.3 + i * ((w - 0.6) / Math.max(1, n - 1));
    const r = Math.random();
    if (r < 0.4) g.add(box(0.28, rnd(0.2, 0.3), 0.2, new THREE.MeshStandardMaterial({ color: pick(BOOKC), roughness: 0.8 }), px, 0.16, 0));
    else if (r < 0.7) { const s = makeSucculent(0, 0, 0); s.position.set(px, 0.03, 0); g.add(s); }
    else { const f = makeFigurine(pick([0xe05252, 0x3f8cff, 0x3fae5a])); f.scale.setScalar(0.8); f.position.set(px, 0.03, 0); g.add(f); }
  }
  g.position.set(x, y, z); g.rotation.y = ry || 0;
  return g;
}
function makeCertFrame(x, y, z, ry) {
  const g = new THREE.Group();
  g.add(box(0.5, 0.65, 0.04, MAT.woodDark, 0, 0, 0));
  const tex = canvasTex(100, 130, (c, w, h) => {
    c.fillStyle = '#f8f4e8'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#c9a227'; c.lineWidth = 5; c.strokeRect(6, 6, w - 12, h - 12);
    c.fillStyle = '#333'; c.font = 'bold 13px monospace'; c.textAlign = 'center';
    c.fillText('★ AWARD ★', w / 2, 40);
    c.font = '10px monospace'; c.fillText('CERTIFIED', w / 2, 62); c.fillText('AWESOME', w / 2, 78);
    c.fillStyle = '#c9a227'; c.beginPath(); c.arc(w / 2, 105, 10, 0, 7); c.fill();
  }).tex;
  const p = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.59), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  p.position.z = 0.025; g.add(p);
  g.position.set(x, y, z); g.rotation.y = ry || 0;
  return g;
}
function makeWallNeon(x, y, z, ry, text, color) {
  color = color || '#ff7ad9';
  const g = new THREE.Group();
  g.add(box(2.2, 0.7, 0.06, MAT.black, 0, 0, 0));
  const tex = canvasTex(360, 110, (c, w, h) => {
    c.fillStyle = '#0a0a10'; c.fillRect(0, 0, w, h);
    c.font = 'bold 52px "Trebuchet MS", sans-serif'; c.textAlign = 'center';
    c.shadowColor = color; c.shadowBlur = 22;
    c.fillStyle = '#ffffff'; c.fillText(text, w / 2, 74);
    c.shadowBlur = 0; c.fillStyle = color; c.fillText(text, w / 2, 74);
  }).tex;
  const p = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.62), new THREE.MeshBasicMaterial({ map: tex }));
  p.position.z = 0.04; g.add(p);
  g.position.set(x, y, z); g.rotation.y = ry || 0;
  return g;
}
function makeMirror(x, y, z, ry) {
  const g = new THREE.Group();
  g.add(box(0.9, 1.6, 0.05, MAT.woodDark, 0, 0, 0));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 1.48),
    new THREE.MeshStandardMaterial({ color: 0xcfe0ea, roughness: 0.05, metalness: 1 }));
  m.position.z = 0.03; g.add(m);
  g.position.set(x, y, z); g.rotation.y = ry || 0;
  return g;
}
function makeGuitar(x, z, ry) {
  const g = new THREE.Group();
  const gm = new THREE.MeshStandardMaterial({ color: 0x8a4a1a, roughness: 0.5 });
  const bd = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.12, 14), gm);
  bd.rotation.x = Math.PI / 2; bd.position.y = 0.35; bd.castShadow = true; g.add(bd);
  g.add(box(0.07, 0.75, 0.05, new THREE.MeshStandardMaterial({ color: 0x5a3010, roughness: 0.6 }), 0, 0.85, 0));
  g.add(box(0.12, 0.18, 0.05, MAT.black, 0, 1.28, 0));
  g.rotation.z = 0.16;
  g.position.set(x, 0, z); if (ry) g.rotation.y = ry;
  return g;
}
function makeMagRack(x, z, ry) {
  const g = new THREE.Group();
  g.add(box(0.6, 0.5, 0.3, MAT.woodDark, 0, 0.25, 0));
  for (let i = 0; i < 4; i++) {
    const m = box(0.5, 0.34, 0.03, new THREE.MeshStandardMaterial({ color: pick(BOOKC), roughness: 0.8 }), -0.18 + (i % 2) * 0.36, 0.62, -0.05 + Math.floor(i / 2) * 0.14);
    m.rotation.x = -0.25; g.add(m);
  }
  g.position.set(x, 0, z); if (ry) g.rotation.y = ry;
  return g;
}
function makeDogBed(x, z) {
  const g = new THREE.Group();
  const bed = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.13, 8, 16), new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 1 }));
  bed.rotation.x = Math.PI / 2; bed.position.y = 0.1; bed.castShadow = true; g.add(bed);
  g.add(cyl(0.34, 0.34, 0.08, new THREE.MeshStandardMaterial({ color: 0xd8b98a, roughness: 1 }), 0, 0.06, 0));
  const dogM = new THREE.MeshStandardMaterial({ color: 0xb08850, roughness: 0.95 });
  const bd = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.3, 4, 8), dogM);
  bd.rotation.z = Math.PI / 2; bd.rotation.y = 0.4; bd.position.y = 0.16; bd.castShadow = true; g.add(bd);
  const hd = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), dogM);
  hd.position.set(0.26, 0.16, 0.1); hd.castShadow = true; g.add(hd);
  const sn = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.9 }));
  sn.position.set(0.34, 0.14, 0.14); g.add(sn);
  updaters.push(() => { const t = performance.now() * 0.002; bd.scale.y = 1 + Math.sin(t) * 0.06; });
  g.position.set(x, 0, z);
  return g;
}
function makeSkateboard(x, z, ry) {
  const g = new THREE.Group();
  const deck = box(0.22, 0.03, 0.8, new THREE.MeshStandardMaterial({ color: pick([0xe05252, 0x3f8cff, 0xe8b93c]), roughness: 0.6 }), 0, 0.4, 0);
  deck.rotation.x = 0.35; g.add(deck);
  const gt = box(0.2, 0.012, 0.78, MAT.black, 0, 0.415, -0.02); gt.rotation.x = 0.35; g.add(gt);
  g.position.set(x, 0, z); if (ry) g.rotation.y = ry;
  return g;
}
function makeBigTrophy(x, z) {
  const g = new THREE.Group();
  g.add(box(0.5, 0.18, 0.5, MAT.woodDark, 0, 0.09, 0));
  g.add(cyl(0.06, 0.06, 0.3, GOLD, 0, 0.32, 0));
  g.add(cyl(0.2, 0.12, 0.22, GOLD, 0, 0.55, 0));
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.1, 0.35, 14, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xd8a920, roughness: 0.25, metalness: 0.9, side: THREE.DoubleSide }));
  cup.position.y = 0.92; cup.castShadow = true; g.add(cup);
  [-1, 1].forEach(s => {
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 6, 12, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0xd8a920, roughness: 0.25, metalness: 0.9 }));
    h.position.set(s * 0.24, 0.95, 0); h.rotation.z = s * Math.PI / 2; g.add(h);
  });
  g.position.set(x, 0, z);
  return g;
}
function makeMedalFrame(x, y, z, ry) {
  const g = new THREE.Group();
  g.add(box(1.1, 0.7, 0.05, MAT.woodDark, 0, 0, 0));
  for (let i = 0; i < 4; i++) {
    const mx = -0.36 + i * 0.24;
    g.add(box(0.07, 0.22, 0.02, new THREE.MeshStandardMaterial({ color: pick([0xc0392b, 0x3f8cff, 0x3fae5a, 0xe8b93c]), roughness: 0.7 }), mx, 0.12, 0.035));
    const med = cyl(0.06, 0.06, 0.02, GOLD, mx, -0.08, 0.035);
    med.rotation.x = Math.PI / 2; g.add(med);
  }
  g.position.set(x, y, z); g.rotation.y = ry || 0;
  return g;
}
function makeBeanbag(x, z, color) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
  b.scale.y = 0.72; b.position.y = 0.3; b.castShadow = true; g.add(b);
  g.position.set(x, 0, z);
  return g;
}

/* ---- robot vacuum keliling ---- */
const vac = new THREE.Group();
{
  vac.add(cyl(0.22, 0.24, 0.09, new THREE.MeshStandardMaterial({ color: 0x2b2e36, roughness: 0.4 }), 0, 0.06, 0));
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x3ddc84, emissiveIntensity: 2 }));
  eye.position.set(0, 0.12, 0.12); vac.add(eye);
  vac.position.set(10, 0, 13);
  floor1.add(vac);
}
const vacSt = { tx: 5, tz: 13, wt: 0 };
updaters.push((dt) => {
  if (vacSt.wt > 0) { vacSt.wt -= dt; return; }
  const dx = vacSt.tx - vac.position.x, dz = vacSt.tz - vac.position.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.2) {
    vacSt.wt = rnd(1, 3);
    vacSt.tx = Math.random() < 0.5 ? rnd(2, 7) : rnd(16, 22);
    vacSt.tz = rnd(11.5, 14.5);
    return;
  }
  const v = Math.min(1.2 * dt, d);
  vac.position.x += dx / d * v; vac.position.z += dz / d * v;
  vac.rotation.y = Math.atan2(dx, dz);
});

/* ---- DINDING lantai 1 ---- */
floor1.add(makePoster(4, 2.3, 0.12, 0, 'race'));
floor1.add(makePoster(8, 2.3, 0.12, 0, 'space'));
floor1.add(makeCertFrame(19, 2.2, 0.12, 0));
floor1.add(makeCertFrame(20.2, 2.2, 0.12, 0));
floor1.add(makeCertFrame(21.4, 2.2, 0.12, 0));
floor1.add(makeWallShelf(6.2, 2.1, 0.18, 0, 2.0));
floor1.add(makeWallNeon(0.15, 2.6, 14, Math.PI / 2, 'hermes', '#ff7ad9'));
floor1.add(makeMedalFrame(0.15, 1.9, 11.5, Math.PI / 2));
floor1.add(makeFrame(29.85, 2.4, 16, -Math.PI / 2, 1));
floor1.add(makePoster(10, 2.3, 8.12, 0, 'fant'));
floor1.add(makePoster(14, 2.3, 8.12, 0, 'space'));
floor1.add(makeWallShelf(18, 2.0, 8.12, 0, 1.8));
floor1.add(makeMirror(22, 1.9, 8.12, 0));
floor1.add(makeDartboard(22.85, 1.8, 15, -Math.PI / 2));
floor1.add(makeWallShelf(6.85, 2.0, 6, -Math.PI / 2, 1.6));
floor1.add(makeStringLights(1, 11, 0.6, 0.6, 2.95));

/* ---- LANTAI lantai 1 ---- */
floor1.add(makeVendingMachine(29.35, 11.5, -Math.PI / 2));
floor1.add(makeDogBed(17.0, 17.2));
floor1.add(makeMagRack(2.3, 16.9, 0));
floor1.add(makeGuitar(22.55, 17.3, -Math.PI / 2));
floor1.add(makeSkateboard(1.7, 14.3, 0.3));
floor1.add(makeBeanbag(19.5, 16.5, 0x9a63e8));
floor1.add(makeBeanbag(21.5, 16.2, 0xe05252));
floor1.add(makeFloorLamp(7.6, 17.0));
floor1.add(makeShoeRack(1.5, 15.2, 0));
floor1.add(makeWaterDispenser(24.0, 16.6));
floor1.add(makeBigTrophy(5.9, 12.6));
floor1.add(makePlant(1.0, 9.0, 1.0)); floor1.add(makePlant(29.0, 9.0, 1.0));
floor1.add(makePlant(12.5, 17.3, 1.1)); floor1.add(makePlant(7.5, 8.7, 0.9)); floor1.add(makePlant(21.5, 8.7, 1.0));
floor1.add(makeTrashBin(2.0, 8.7)); floor1.add(makeTrashBin(28.8, 13.5));
floor1.add(makeRug(4.5, 13, 5, 1.5, 0x7a6a8d));
floor1.add(makeRug(18.5, 13, 6, 1.5, 0x7a6a8d));
floor1.add(makeRug(26.5, 15.3, 4.5, 1.3, 0x8d7f6a));
floor1.add(makeBunting(24, 29, 16, 3.1));

/* ---- DINDING lantai 2 ---- */
floor2.add(makeCertFrame(15, 2.2, 0.12, 0));
floor2.add(makeCertFrame(16.4, 2.2, 0.12, 0));
floor2.add(makeCertFrame(17.8, 2.2, 0.12, 0));
floor2.add(makeWallShelf(10, 2.0, 8.12, 0, 1.8));
floor2.add(makeWallShelf(24, 2.0, 8.12, 0, 1.8));
floor2.add(makeMirror(7.5, 1.9, 8.12, 0));
floor2.add(makeWallNeon(29.85, 2.6, 10.5, -Math.PI / 2, 'LT 2', '#7ad9ff'));
floor2.add(makePoster(0.12, 2.3, 12, Math.PI / 2, 'space'));
floor2.add(makeFrame(7.85, 2.2, 13, Math.PI / 2, 0));
floor2.add(makeWallShelf(22.3, 2.1, 17.85, Math.PI, 1.6));
floor2.add(makeBunting(8, 15, 16.5, 3.1));

/* ---- LANTAI lantai 2 ---- */
floor2.add(makePlant(22.9, 10.0, 0.9));
floor2.add(makePlant(7.5, 8.8, 1.0)); floor2.add(makePlant(16.5, 17.5, 1.0)); floor2.add(makePlant(23.5, 2.0, 0.9));
floor2.add(makeBeanbag(8.2, 16.2, 0x3f8cff));
floor2.add(makeBeanbag(14.8, 16.2, 0x3fae5a));
floor2.add(makeMagRack(24.2, 16.6, Math.PI / 2));
floor2.add(makeFloorLamp(28.6, 10.8));
floor2.add(makeBigTrophy(24.3, 16.9));
floor2.add(makeTrashBin(16.6, 8.8)); floor2.add(makeTrashBin(23.0, 17.3));
floor2.add(makeWaterDispenser(12.5, 0.9));
floor2.add(makeWallClock(19.5, 2.6, 8.12, 0));
console.log('[ho3d] accessories v1.5 loaded (dinding & lantai rame)');

/* ============ accessories v1.6 — sisa lantai 2 (dinding & lantai) ============ */
function makeChalkMenu(x, y, z, ry) {
  const g = new THREE.Group();
  g.add(box(1.1, 1.4, 0.06, MAT.woodDark, 0, 0, 0));
  const tex = canvasTex(140, 180, (c, w, h) => {
    c.fillStyle = '#23282e'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f2f4f8'; c.font = 'bold 22px "Comic Sans MS", cursive'; c.textAlign = 'center';
    c.fillText('~ MENU ~', w / 2, 34);
    c.font = '16px "Comic Sans MS", cursive'; c.textAlign = 'left';
    ['kopi 15k', 'teh 10k', 'mie 12k', 'nasi 20k'].forEach((m, i) => c.fillText('• ' + m, 20, 70 + i * 28));
  }).tex;
  const p = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.3), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
  p.position.z = 0.035; g.add(p);
  [-0.45, 0.45].forEach(px => g.add(box(0.07, 1.6, 0.07, MAT.woodDark, px, -1.45, 0)));
  g.position.set(x, y, z); g.rotation.y = ry || 0;
  return g;
}
function makeSurfboard(x, z, ry) {
  const g = new THREE.Group();
  const bd = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.2, 4, 10),
    new THREE.MeshStandardMaterial({ color: pick([0x3f8cff, 0xe8b93c, 0xe05252]), roughness: 0.5 }));
  bd.scale.z = 0.25; bd.position.y = 1.0; bd.castShadow = true; g.add(bd);
  g.add(box(0.3, 0.06, 0.1, MAT.black, 0, 0.35, 0.05));
  g.rotation.z = 0.14;
  g.position.set(x, 0, z); if (ry) g.rotation.y = ry;
  return g;
}

/* ---- DINDING lantai 2 ---- */
floor2.add(makeSconce(3, 2.6, 0.15, 0));
floor2.add(makeSconce(9, 2.6, 0.15, 0));
floor2.add(makeFrame(1.2, 2.4, 0.15, 0, 2));
floor2.add(makeMedalFrame(20.5, 2.0, 7.85, Math.PI));
floor2.add(makeWallShelf(14, 2.0, 7.85, Math.PI, 1.8));
floor2.add(makeBulletin(29.85, 1.9, 5, -Math.PI / 2));
floor2.add(makeExtinguisher(23.4, 7.6));
floor2.add(makeWallShelf(26, 2.0, 0.2, 0, 2.0));
floor2.add(makeWallNeon(7.85, 2.6, 11, Math.PI / 2, 'FOCUS', '#7ad9ff'));
floor2.add(makeChalkMenu(22.88, 1.9, 13, -Math.PI / 2));
floor2.add(makeMirror(16.15, 1.9, 12, Math.PI / 2));
floor2.add(makeWallClock(23.15, 2.8, 13, Math.PI / 2));
floor2.add(makeFrame(24.3, 2.3, 17.85, Math.PI, 2));
floor2.add(makeFrame(25.3, 2.3, 17.85, Math.PI, 0));
floor2.add(makeSurfboard(0.45, 10.5, Math.PI / 2));

/* ---- LANTAI lantai 2 ---- */
floor2.add(makeVendingMachine(29.35, 10.8, -Math.PI / 2));
floor2.add(makeBeanbag(25.5, 15.8, 0xe8b93c));
floor2.add(makeBeanbag(28.0, 15.5, 0x3f8cff));
floor2.add(makeGuitar(23.5, 16.9, Math.PI / 2));
floor2.add(makeSkateboard(15.8, 16.8, 0.4));
floor2.add(makeCat(28.2, 14.8));
floor2.add(makeFloorLamp(7.6, 10.2));
floor2.add(makePlant(29.2, 13.8, 1.0)); floor2.add(makePlant(24.0, 8.7, 0.9));
floor2.add(makePlant(8.5, 17.8, 1.0)); floor2.add(makePlant(16.2, 8.7, 0.9));
floor2.add(makeTrashBin(29.0, 16.0));

/* ---- robot vacuum lantai 2 ---- */
const vac2 = new THREE.Group();
{
  vac2.add(cyl(0.22, 0.24, 0.09, new THREE.MeshStandardMaterial({ color: 0x7a2e2e, roughness: 0.4 }), 0, 0.06, 0));
  const eye2 = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x3ddc84, emissiveIntensity: 2 }));
  eye2.position.set(0, 0.12, 0.12); vac2.add(eye2);
  vac2.position.set(14, 0, 12.2);
  floor2.add(vac2);
}
const vacSt2 = { tx: 14, tz: 12.2, wt: 0 };
updaters.push((dt) => {
  if (vacSt2.wt > 0) { vacSt2.wt -= dt; return; }
  const dx = vacSt2.tx - vac2.position.x, dz = vacSt2.tz - vac2.position.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.2) {
    vacSt2.wt = rnd(1, 3);
    vacSt2.tx = rnd(8, 22); vacSt2.tz = rnd(11.8, 12.6);
    return;
  }
  const v = Math.min(1.2 * dt, d);
  vac2.position.x += dx / d * v; vac2.position.z += dz / d * v;
  vac2.rotation.y = Math.atan2(dx, dz);
});
console.log('[ho3d] accessories v1.6 loaded (sisa lantai 2)');

/* ============ accessories v1.7 — lantai 2 dipadatkan ============ */
function makeStool(x, z) {
  const g = new THREE.Group();
  g.add(cyl(0.24, 0.24, 0.07, MAT.chairMesh, 0, 0.78, 0));
  g.add(cyl(0.04, 0.04, 0.75, MAT.metal, 0, 0.4, 0));
  g.add(cyl(0.2, 0.22, 0.04, MAT.metal, 0, 0.02, 0));
  g.position.set(x, 0, z);
  return g;
}
function makeMukenaRack(x, z, ry) {
  const g = new THREE.Group();
  [-0.7, 0.7].forEach(px => { g.add(box(0.07, 1.7, 0.07, MAT.woodDark, px, 0.85, 0)); g.add(box(0.4, 0.06, 0.4, MAT.woodDark, px, 0.03, 0)); });
  const bar = cyl(0.035, 0.035, 1.5, MAT.woodDark, 0, 1.62, 0); bar.rotation.z = Math.PI / 2; g.add(bar);
  [0xf2ede2, 0xe8d5e8, 0xd5e8e8, 0xf2e2d5].forEach((mc, i) => {
    const m = box(0.3, 0.85, 0.06, new THREE.MeshStandardMaterial({ color: mc, roughness: 1 }), -0.55 + i * 0.36, 1.15, 0);
    m.rotation.z = rnd(-0.06, 0.06); g.add(m);
  });
  g.position.set(x, 0, z); if (ry) g.rotation.y = ry;
  return g;
}
function makeFoldScreen(x, z, ry) {
  const g = new THREE.Group();
  for (let i = -1; i <= 1; i++) {
    const p = new THREE.Group();
    p.add(box(0.75, 1.7, 0.05, MAT.woodDark, 0, 0.95, 0));
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.63, 1.5),
      new THREE.MeshStandardMaterial({ color: 0xf2ede2, roughness: 0.9, side: THREE.DoubleSide }));
    paper.position.set(0, 0.95, 0.028); p.add(paper);
    p.position.x = i * 0.72; p.rotation.y = i * 0.18;
    g.add(p);
  }
  g.position.set(x, 0, z); if (ry) g.rotation.y = ry;
  return g;
}
function makeDonationBox(x, z) {
  const g = new THREE.Group();
  g.add(box(0.3, 0.32, 0.3, MAT.metal, 0, 0.16, 0));
  g.add(box(0.35, 0.5, 0.35, MAT.woodDark, 0, 0.55, 0));
  g.add(box(0.4, 0.06, 0.4, MAT.wood, 0, 0.83, 0));
  g.add(box(0.2, 0.02, 0.04, MAT.black, 0, 0.87, 0));
  const tex = canvasTex(90, 60, (c, w, h) => {
    c.fillStyle = '#2f6e3a'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff'; c.font = 'bold 16px monospace'; c.textAlign = 'center';
    c.fillText('AMAL', w / 2, 38);
  }).tex;
  const p = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
  p.position.set(0, 0.55, 0.18); g.add(p);
  g.position.set(x, 0, z);
  return g;
}
function makePallet(x, z) {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) g.add(box(1.2, 0.03, 0.14, MAT.wood, 0, 0.12, -0.5 + i * 0.25));
  [-0.5, 0, 0.5].forEach(px => g.add(box(0.12, 0.09, 1.1, MAT.woodDark, px, 0.05, 0)));
  const bm = new THREE.MeshStandardMaterial({ color: 0xb08d57, roughness: 0.9 });
  g.add(box(0.9, 0.5, 0.8, bm, -0.1, 0.39, 0));
  g.add(box(0.7, 0.4, 0.6, bm, 0.15, 0.84, -0.05));
  g.position.set(x, 0, z);
  return g;
}
function makeHighTable(x, z) {
  const g = new THREE.Group();
  g.add(cyl(0.55, 0.55, 0.06, MAT.wood, 0, 1.02, 0));
  g.add(cyl(0.05, 0.07, 1.0, MAT.metal, 0, 0.5, 0));
  g.add(cyl(0.3, 0.35, 0.05, MAT.metal, 0, 0.03, 0));
  g.position.set(x, 0, z);
  return g;
}
function makeCredenza(x, z, ry) {
  const g = new THREE.Group();
  g.add(box(2.2, 0.75, 0.5, MAT.wood, 0, 0.45, 0));
  g.add(box(2.3, 0.05, 0.55, MAT.woodDark, 0, 0.85, 0));
  for (let i = 0; i < 3; i++) g.add(box(0.6, 0.55, 0.03, MAT.woodDark, -0.7 + i * 0.7, 0.45, 0.26));
  g.add(box(0.3, 0.35, 0.25, new THREE.MeshStandardMaterial({ color: 0x3f8cff, roughness: 0.8 }), -0.7, 1.05, 0));
  const f = makeFigurine(0xe05252); f.scale.setScalar(0.85); f.position.set(0, 0.88, 0); g.add(f);
  const s = makeSucculent(0, 0, 0); s.position.set(0.7, 0.88, 0); g.add(s);
  g.position.set(x, 0, z); if (ry) g.rotation.y = ry;
  return g;
}

/* ---- MUSHOLA padat ---- */
floor2.add(makeMukenaRack(11.4, 2.2, Math.PI / 2));
floor2.add(makeFoldScreen(10.8, 4.2, 0.3));
floor2.add(makeDonationBox(11.5, 7.6));
[1.5, 3.9, 6.3, 8.7].forEach((rx, ci) => {
  floor2.add(box(0.72, 0.035, 1.25, new THREE.MeshStandardMaterial({ color: rugCols[(ci + 2) % 4], roughness: 1 }), rx, 0.035, 1.7));
});
floor2.add(makeBeanbag(2.5, 6.8, 0x7a5a8d));
floor2.add(makeBeanbag(5.0, 6.8, 0x5a7a8d));
floor2.add(makeBeanbag(7.5, 6.8, 0x8d6a5a));
floor2.add(makeBookshelf(1.2, 0.5, 0, 1.8));

/* ---- MEET2 padat ---- */
floor2.add(makeCredenza(17.5, 7.45, Math.PI));
floor2.add(makeFloorLamp(12.8, 1.0));
floor2.add(makePlant(22.5, 7.3, 1.2));
floor2.add(makePoster(28.5, 2.7, 0.12, 0, 'race'));

/* ---- GUDANG penuh ---- */
floor2.add(makeCrateStack(23.8, 4.2, 3));
floor2.add(makeCrateStack(28.8, 4.6, 2));
floor2.add(makePallet(26.0, 3.2));
[[24.2, 5.6], [26.2, 5.7], [28.9, 5.8]].forEach(p =>
  floor2.add(box(0.45, 0.4, 0.45, new THREE.MeshStandardMaterial({ color: 0xb08d57, roughness: 0.9 }), p[0], 0.2, p[1])));

/* ---- ROOF padat ---- */
floor2.add(makeBeanbag(1.5, 16.0, 0xe8b93c));
floor2.add(makeBeanbag(5.5, 16.0, 0x3f8cff));
floor2.add(makeHighTable(1.2, 9.8));
floor2.add(makeStool(0.4, 9.8)); floor2.add(makeStool(2.0, 9.8));
floor2.add(makePlanter(0.9, 12.8, 1.4)); floor2.add(makePlanter(0.9, 15.5, 1.4));
floor2.add(makeStringLights(0.5, 6.5, 10, 10, 3.0));
floor2.add(makePoster(0.12, 2.3, 15, Math.PI / 2, 'fant'));

/* ---- BOOTH reading nook ---- */
floor2.add(makeRug(12.2, 10.3, 4.5, 3.5, 0x6a5a7a));
floor2.add(makeSofa(11.0, 10.3, Math.PI / 2, 0x8a6a9a));
floor2.add(makeSofa(13.4, 10.3, -Math.PI / 2, 0x6a8a9a));
floor2.add(cyl(0.4, 0.4, 0.05, MAT.wood, 12.2, 0.42, 10.3));
floor2.add(cyl(0.05, 0.06, 0.42, MAT.metal, 12.2, 0.21, 10.3));
floor2.add(makeBookshelf(12.5, 8.85, 0, 2.4));
floor2.add(makePlant(15.6, 11.8, 1.0)); floor2.add(makePlant(7.9, 9.2, 0.9));

/* ---- PANTRY2 padat ---- */
floor2.add(makeHighTable(19.5, 15.8));
floor2.add(makeStool(18.7, 15.8)); floor2.add(makeStool(20.3, 15.8));
floor2.add(makeRug(19.5, 13.2, 4, 2, 0x7a6a8d));
floor2.add(makeHangingPlant(18, 10, 1)); floor2.add(makeHangingPlant(21, 10, 1));

/* ---- LOBBY padat ---- */
floor2.add(cyl(0.3, 0.3, 0.05, MAT.wood, 27.9, 0.5, 12.5));
floor2.add(cyl(0.04, 0.05, 0.5, MAT.metal, 27.9, 0.25, 12.5));
floor2.add(box(0.3, 0.05, 0.22, new THREE.MeshStandardMaterial({ color: 0x3f8cff, roughness: 0.8 }), 27.9, 0.55, 12.5));
floor2.add(makePlant(28.7, 12.0, 1.3)); floor2.add(makePlant(25.2, 17.6, 1.0));
floor2.add(makeWallShelf(28.3, 2.0, 17.85, Math.PI, 1.4));

/* ---- TERAS lt2 padat ---- */
floor2.add(makeBench(22, 19.6, 0));
floor2.add(makePlanter(12, 19.6, 1.6)); floor2.add(makePlanter(18.5, 19.6, 1.6));

/* ---- umum: gantung & cahaya ---- */
floor2.add(makeHangingPlant(10, 6, 1)); floor2.add(makeHangingPlant(20, 6, 1));
floor2.add(makeHangingPlant(12, 15, 1)); floor2.add(makeHangingPlant(25, 15, 1));
floor2.add(makePendant(11.5, 11, false, 4.6));
floor2.add(makePendant(26.5, 14, true, 4.6));
console.log('[ho3d] accessories v1.7 loaded (lantai 2 padat)');

/* ============ accessories v1.8 — dinding lantai 2 full ============ */
function makeNobori(x, y, z, ry, text, color) {
  const g = new THREE.Group();
  const pole = cyl(0.025, 0.025, 0.7, MAT.woodDark, 0, 0.5, 0); pole.rotation.z = Math.PI / 2; g.add(pole);
  const tex = canvasTex(70, 200, (c, w, h) => {
    c.fillStyle = color || '#3f8cff'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff'; c.font = 'bold 26px monospace'; c.textAlign = 'center';
    text.split('').forEach((ch, i) => c.fillText(ch, w / 2, 52 + i * 34));
  }).tex;
  const f = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 1.7),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide }));
  f.position.y = -0.35; g.add(f);
  g.position.set(x, y, z); g.rotation.y = ry || 0;
  return g;
}
function makePegboard(x, y, z, ry) {
  const g = new THREE.Group();
  g.add(box(1.6, 1.2, 0.05, new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.9 }), 0, 0, 0));
  const tm = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.5, metalness: 0.5 });
  g.add(box(0.05, 0.4, 0.04, tm, -0.55, 0.1, 0.05));
  g.add(box(0.2, 0.08, 0.05, tm, -0.55, 0.32, 0.05));
  g.add(box(0.06, 0.45, 0.04, tm, -0.2, 0.05, 0.05));
  g.add(box(0.14, 0.1, 0.04, tm, -0.2, 0.3, 0.05));
  g.add(box(0.04, 0.35, 0.04, new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6 }), 0.15, 0.05, 0.05));
  const saw = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.4, 4), tm);
  saw.position.set(0.5, 0.05, 0.05); saw.rotation.y = Math.PI / 4; g.add(saw);
  g.add(box(0.12, 0.12, 0.06, new THREE.MeshStandardMaterial({ color: 0xe8b93c, roughness: 0.6 }), -0.55, -0.35, 0.05));
  g.position.set(x, y, z); g.rotation.y = ry || 0;
  return g;
}
function makeFakeWindow(x, y, z, ry) {
  const g = new THREE.Group();
  g.add(box(1.6, 1.2, 0.08, MAT.woodDark, 0, 0, 0));
  const tex = canvasTex(200, 140, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#0a1030'); gr.addColorStop(1, '#1a2a5a');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f4e8c0'; c.beginPath(); c.arc(160, 30, 14, 0, 7); c.fill();
    for (let i = 0; i < 40; i++) { c.fillStyle = '#fff'; c.fillRect(rnd(0, w), rnd(0, h * 0.5), 2, 2); }
    c.fillStyle = '#141821';
    for (let i = 0; i < 7; i++) c.fillRect(i * 29, h - rnd(30, 70), rnd(18, 34), 70);
    c.fillStyle = '#ffd23f';
    for (let i = 0; i < 25; i++) c.fillRect(rnd(0, w), rnd(h * 0.45, h - 8), 3, 4);
  }).tex;
  const p = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 1.04), new THREE.MeshBasicMaterial({ map: tex }));
  p.position.z = 0.045; g.add(p);
  g.add(box(1.6, 0.06, 0.1, MAT.woodDark, 0, 0, 0.02));
  g.add(box(0.06, 1.2, 0.1, MAT.woodDark, 0, 0, 0.02));
  g.position.set(x, y, z); g.rotation.y = ry || 0;
  return g;
}
function makeEOTM(x, y, z, ry) {
  const g = new THREE.Group();
  g.add(box(1.3, 1.0, 0.06, MAT.woodDark, 0, 0, 0));
  const tex = canvasTex(200, 150, (c, w, h) => {
    c.fillStyle = '#1c2a4a'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#e8b93c'; c.font = 'bold 17px monospace'; c.textAlign = 'center';
    c.fillText('★ EMPLOYEE', w / 2, 24); c.fillText('OF THE MONTH ★', w / 2, 44);
    ['ANA', 'BOB', 'CIT'].forEach((nm, i) => {
      const px = 45 + i * 55;
      c.fillStyle = '#8a93a3'; c.beginPath(); c.arc(px, 82, 20, 0, 7); c.fill();
      c.fillStyle = '#f6cf9a'; c.beginPath(); c.arc(px, 78, 13, 0, 7); c.fill();
      c.fillStyle = '#333'; c.beginPath(); c.arc(px, 72, 13, Math.PI, 0); c.fill();
      c.fillStyle = '#fff'; c.font = '10px monospace'; c.fillText(nm, px, 118);
    });
  }).tex;
  const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.9), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  p.position.z = 0.035; g.add(p);
  g.position.set(x, y, z); g.rotation.y = ry || 0;
  return g;
}
function makeChalkBoard(x, y, z, ry, title, lines) {
  const g = new THREE.Group();
  g.add(box(1.2, 1.0, 0.06, MAT.woodDark, 0, 0, 0));
  const tex = canvasTex(160, 130, (c, w, h) => {
    c.fillStyle = '#23282e'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f2f4f8'; c.font = 'bold 18px "Comic Sans MS", cursive'; c.textAlign = 'center';
    c.fillText(title, w / 2, 30);
    c.font = '14px "Comic Sans MS", cursive'; c.textAlign = 'left';
    lines.forEach((ln, i) => c.fillText('• ' + ln, 18, 58 + i * 24));
  }).tex;
  const p = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.9), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
  p.position.z = 0.035; g.add(p);
  g.position.set(x, y, z); g.rotation.y = ry || 0;
  return g;
}

/* ---- mushola ---- */
floor2.add(makeFrame(2.5, 2.4, 0.15, 0, 0));
floor2.add(makeFrame(10, 2.4, 0.15, 0, 1));
/* ---- meet2 ---- */
floor2.add(makeCertFrame(13.6, 2.2, 0.12, 0));
floor2.add(makeCertFrame(19.2, 2.2, 0.12, 0));
floor2.add(makeGlassboard(22.85, 1.9, 6.0, -Math.PI / 2));
floor2.add(makePoster(12.12, 2.3, 6.5, Math.PI / 2, 'retro'));
floor2.add(makeAcoustic(15.8, 1.8, 7.85, Math.PI, 0x9a63e8));
floor2.add(makeAcoustic(16.6, 1.8, 7.85, Math.PI, 0x3f8cff));
floor2.add(makeFakeWindow(21.3, 2.3, 0.12, 0));
/* ---- gudang ---- */
floor2.add(makePegboard(29.85, 1.7, 7.5, -Math.PI / 2));
floor2.add(makeWallNeon(27.5, 2.4, 7.85, Math.PI, 'SAFETY', '#ffd23f'));
floor2.add(makeFakeWindow(24.2, 2.3, 0.12, 0));
/* ---- roof ---- */
floor2.add(makePoster(0.12, 2.4, 9, Math.PI / 2, 'race'));
floor2.add(makeBunting(0.8, 6.8, 17.7, 3.0));
floor2.add(makeMirror(6.85, 1.9, 12, -Math.PI / 2));
/* ---- booth ---- */
floor2.add(makeAcoustic(7.15, 2.0, 15.5, Math.PI / 2, 0x9a63e8));
floor2.add(makePoster(14.5, 2.3, 8.12, 0, 'fant'));
floor2.add(makeDartboard(15.8, 1.8, 8.12, 0));
floor2.add(makeStringLights(7.5, 15, 17.6, 17.6, 2.9));
floor2.add(makePoster(15.85, 2.3, 10, -Math.PI / 2, 'pixel'));
floor2.add(makeNobori(16.8, 2.7, 8.12, 0, 'IDE', '#9a63e8'));
/* ---- pantry2 ---- */
floor2.add(makeChalkBoard(17, 2.0, 8.12, 0, 'QUOTE', ['ngopi dulu', 'baru ngoding']));
floor2.add(makePoster(22.88, 2.5, 15.5, -Math.PI / 2, 'retro'));
floor2.add(makeStringLights(17, 22, 17.6, 17.6, 2.9));
floor2.add(makeFrame(16.15, 2.3, 15, Math.PI / 2, 1));
floor2.add(makeNobori(22.0, 2.7, 8.12, 0, 'EAT', '#e8b93c'));
/* ---- lobby ---- */
floor2.add(makePoster(28, 2.3, 8.12, 0, 'pixel'));
floor2.add(makeEOTM(23.15, 1.9, 10.5, Math.PI / 2));
floor2.add(makeNobori(0.12, 2.7, 13.5, Math.PI / 2, 'SURF', '#3f8cff'));
console.log('[ho3d] accessories v1.8 loaded (dinding lt2 full)');
