/**
 * Car360 Configurator — script.js
 * Three.js r128
 * FIXES: color change, spare tire excluded, door axis correct,
 *        interior free orbit+zoom, app renamed to Car360
 */

/* ══════════════════════════════════════════════
   DATA
══════════════════════════════════════════════ */
const CAR_COLORS = [
  { name: 'Arctic White',   hex: '#f0ede8', roughness: 0.10 },
  { name: 'Obsidian Black', hex: '#141414', roughness: 0.05 },
  { name: 'Phantom Navy',   hex: '#1a2a4a', roughness: 0.08 },
  { name: 'Crimson Red',    hex: '#8b0000', roughness: 0.07 },
  { name: 'Slate Grey',     hex: '#4a4e57', roughness: 0.10 },
  { name: 'Champagne',      hex: '#c8a96e', roughness: 0.06 },
  { name: 'Racing Green',   hex: '#1a3a2a', roughness: 0.08 },
  { name: 'Midnight Blue',  hex: '#0d1b2e', roughness: 0.06 },
  { name: 'Pearl Silver',   hex: '#d0d4da', roughness: 0.08 },
];

const WHEEL_OPTIONS = [
  { name: 'Apex Sport',  icon: '⊙', size: 20, color: '#b0b5bb' },
  { name: 'Carbon Aero', icon: '◎', size: 21, color: '#2a2a2a' },
  { name: 'Forged GT',   icon: '✦', size: 19, color: '#888888' },
  { name: 'Diamond Cut', icon: '◈', size: 22, color: '#d0d4da' },
];

const CAR_SPECS = [
  { label: 'Horsepower', value: '640 hp',   bar: 0.80 },
  { label: '0–100 km/h', value: '2.9 s',    bar: 0.95 },
  { label: 'Top Speed',  value: '325 km/h', bar: 0.85 },
  { label: 'Torque',     value: '720 Nm',   bar: 0.75 },
  { label: 'Range',      value: '480 km',   bar: 0.60 },
];

/* ══════════════════════════════════════════════
   STATE
══════════════════════════════════════════════ */
let state = {
  colorIdx:         0,
  wheelIdx:         0,
  finish:           'metallic',
  view:             'exterior',
  autoRotate:       true,
  doorsOpen:        false,
  configs:          [],
  currentConfigIdx: -1,
};

/* ══════════════════════════════════════════════
   THREE.JS GLOBALS
══════════════════════════════════════════════ */
let renderer, scene, camera;
let carGroup, wheelMeshes = [], doorMeshes = [];

// All body meshes collected for reliable color change
let bodyMeshList = [];

// Camera orbit (works in BOTH exterior and interior)
let isDragging   = false;
let lastMouse    = { x: 0, y: 0 };
let yaw          = 0;
let pitch        = 0.18;
let camRadius    = 9;
let camRadiusTarget = 9;

// Interior free-orbit center point
let intYaw   = 0;
let intPitch = 0.05;

// Door animation
let doorAnimProgress = 0;
let doorAnimating    = false;
let lastTime         = 0;

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
function initThree() {
  const canvas  = document.getElementById('three-canvas');
  const wrapper = canvas.parentElement;

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled   = true;
  renderer.shadowMap.type      = THREE.PCFSoftShadowMap;
  renderer.outputEncoding      = THREE.sRGBEncoding;
  renderer.toneMapping         = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(0x080a0e);
  resizeRenderer();

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x080a0e, 0.04);

  camera = new THREE.PerspectiveCamera(42, wrapper.clientWidth / wrapper.clientHeight, 0.1, 200);
  camera.position.set(0, 2.5, 9);

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));

  const key = new THREE.DirectionalLight(0xfff4e0, 2.2);
  key.position.set(-4, 8, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -8;
  key.shadow.camera.right = key.shadow.camera.top   =  8;
  key.shadow.bias = -0.002;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xb0d0ff, 0.8);
  fill.position.set(5, 3, -2);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffffff, 1.0);
  rim.position.set(0, 3, -6);
  scene.add(rim);

  scene.add(Object.assign(new THREE.PointLight(0xe8c97b, 0.4, 10), { position: new THREE.Vector3(0, -0.5, 0) }));

  buildPlatform();
  buildGrid();
  loadGLB('opel_gt_retopo.glb');
  attachInputEvents(canvas);
  window.addEventListener('resize', resizeRenderer);
  animate(0);
}

/* ══════════════════════════════════════════════
   LOAD GLB — root path, no models/ folder
══════════════════════════════════════════════ */
function loadGLB(filename) {
  const loader = new THREE.GLTFLoader();
  const draco  = new THREE.DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  loader.setDRACOLoader(draco);

  loader.load(
    filename,          // ← root path, Option A
    (gltf) => {
      if (carGroup) scene.remove(carGroup);
      carGroup      = gltf.scene;
      bodyMeshList  = [];
      wheelMeshes   = [];
      doorMeshes    = [];
      doorAnimProgress = 0;
      state.doorsOpen  = false;

      scene.add(carGroup);

      // Shadows
      carGroup.traverse(c => {
        if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
      });

      // Auto-fit & center
      autoFit(carGroup);

      // Print all names to console for debugging
      console.log('=== MESH NAMES IN ' + filename + ' ===');
      carGroup.traverse(c => { if (c.name) console.log(' >', c.name, '| type:', c.type); });
      console.log('=====================================');

      // ── Detect BODY meshes (for color change) ──
      // Collects ALL meshes that are not glass/emissive/tiny
      // so color always works regardless of material values
      carGroup.traverse(c => {
        if (!c.isMesh) return;
        const n   = c.name.toLowerCase();
        const mat = Array.isArray(c.material) ? c.material[0] : c.material;

        // Skip obvious non-body parts
        const skip =
          n.includes('glass')   || n.includes('window') ||
          n.includes('light')   || n.includes('lamp')   ||
          n.includes('lens')    || n.includes('screen')  ||
          n.includes('chrome')  || n.includes('exhaust') ||
          n.includes('interior')|| n.includes('seat');

        if (!skip) bodyMeshList.push(c);
      });

      // ── Detect WHEELS — exclude spare & steering ──
      const allWheels = [];
      carGroup.traverse(c => {
        const n = c.name.toLowerCase();
        const isWheel =
          n.includes('wheel') || n.includes('tire') ||
          n.includes('tyre')  || n.includes('rim')  ||
          n.includes('reifen');
        const isExcluded =
          n.includes('spare')    || n.includes('steering') ||
          n.includes('steer')    || n.includes('volant')   ||
          n.includes('lenkrad');
        if (isWheel && !isExcluded && c.isMesh) allWheels.push(c);
      });

      if (allWheels.length > 0) {
        // Find Y and |X| positions
        const positions = allWheels.map(w => {
          const p = new THREE.Vector3();
          w.getWorldPosition(p);
          return { mesh: w, y: p.y, ax: Math.abs(p.x) };
        });
        const minY   = Math.min(...positions.map(p => p.y));
        const maxAX  = Math.max(...positions.map(p => p.ax));

        positions.forEach(({ mesh, y, ax }) => {
          // Real rolling wheels: near ground AND near sides
          // Spare tire: sits on hood (high Y or center X)
          const nearGround = y < minY + 1.0;
          const onSide     = ax > maxAX * 0.3;
          if (nearGround && onSide) {
            // Detect spin axis from world quaternion
            const q = new THREE.Quaternion();
            mesh.getWorldQuaternion(q);
            const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
            mesh.userData.spinAxis = Math.abs(fwd.x) > 0.7 ? 'z' : 'x';
            wheelMeshes.push(mesh);
            console.log('  ✅ Wheel:', mesh.name, 'y='+y.toFixed(2), 'ax='+ax.toFixed(2));
          } else {
            console.log('  ❌ Excluded (spare/center):', mesh.name, 'y='+y.toFixed(2), 'ax='+ax.toFixed(2));
          }
        });
      }
      console.log('Rolling wheels found:', wheelMeshes.length);

      // ── Detect DOORS ──
      carGroup.traverse(c => {
        if (!c.isMesh) return;
        const n = c.name.toLowerCase();
        if (
          n.includes('door')  || n.includes('tuer')   ||
          n.includes('porte') || n.includes('puerta') ||
          n.includes('hatch')
        ) {
          // Save original LOCAL rotation
          c.userData.origRotX = c.rotation.x;
          c.userData.origRotY = c.rotation.y;
          c.userData.origRotZ = c.rotation.z;

          // World position → determine which side
          const wp = new THREE.Vector3();
          c.getWorldPosition(wp);
          // Right side (positive X world) → opens toward positive Y rotation
          // Left side (negative X world)  → opens toward negative Y rotation
          c.userData.openSide = wp.x >= 0 ? -1 : 1;

          doorMeshes.push(c);
          console.log('  Door:', c.name, 'worldX='+wp.x.toFixed(2), 'openSide='+c.userData.openSide);
        }
      });
      console.log('Doors found:', doorMeshes.length);

      updateDoorButton();

      // Apply saved color after model loads
      applyColorToScene(CAR_COLORS[state.colorIdx]);
    },
    xhr => console.log('Loading:', Math.round(xhr.loaded / xhr.total * 100) + '%'),
    err => {
      console.error('GLB error:', err);
      showToast('⚠ Model load failed — check console');
    }
  );
}

/* ── Auto-fit model to screen ── */
function autoFit(group) {
  const box    = new THREE.Box3().setFromObject(group);
  const size   = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const aspect = renderer.domElement.clientWidth / Math.max(renderer.domElement.clientHeight, 1);
  const target = aspect > 1.4 ? 5.5 : 4.0;
  group.scale.setScalar(target / maxDim);

  const box2   = new THREE.Box3().setFromObject(group);
  const ctr    = box2.getCenter(new THREE.Vector3());
  group.position.set(-ctr.x, -box2.min.y + 0.05, -ctr.z);
}

/* ══════════════════════════════════════════════
   PLATFORM & GRID
══════════════════════════════════════════════ */
function buildPlatform() {
  const plat = new THREE.Mesh(
    new THREE.CylinderGeometry(3.5, 3.5, 0.08, 80),
    new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.3, metalness: 0.5 })
  );
  plat.position.y = -0.04;
  plat.receiveShadow = true;
  scene.add(plat);

  [2.2, 2.8, 3.2].forEach((r, i) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.012, 6, 120),
      new THREE.MeshStandardMaterial({
        color:             i === 1 ? 0xe8c97b : 0x2a2d35,
        emissive:          i === 1 ? 0xe8c97b : 0x000000,
        emissiveIntensity: i === 1 ? 0.3 : 0,
        roughness: 0.2, metalness: 0.8,
      })
    );
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
  });
}

function buildGrid() {
  const g = new THREE.GridHelper(40, 40, 0x1a1e26, 0x1a1e26);
  g.position.y = -0.05;
  g.material.transparent = true;
  g.material.opacity = 0.5;
  scene.add(g);
}

/* ══════════════════════════════════════════════
   ANIMATION LOOP
══════════════════════════════════════════════ */
function animate(time) {
  requestAnimationFrame(animate);
  const delta = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  if (state.autoRotate && !isDragging && state.view === 'exterior') {
    yaw += delta * 0.25;
  }

  camRadius += (camRadiusTarget - camRadius) * 0.08;

  if (state.view === 'exterior') {
    const cx = Math.sin(yaw) * Math.cos(pitch) * camRadius;
    const cy = Math.sin(pitch) * camRadius + 0.5;
    const cz = Math.cos(yaw) * Math.cos(pitch) * camRadius;
    camera.position.lerp(new THREE.Vector3(cx, cy, cz), 0.06);
    camera.lookAt(0, 0.7, 0);
  } else {
    // ── INTERIOR: free orbit around cockpit center ──
    const ir  = camRadius;   // same zoom variable works here
    const icx = Math.sin(intYaw) * Math.cos(intPitch) * ir;
    const icy = Math.sin(intPitch) * ir + 0.85;
    const icz = Math.cos(intYaw) * Math.cos(intPitch) * ir;
    camera.position.lerp(new THREE.Vector3(icx, icy, icz), 0.06);
    camera.lookAt(0, 0.85, 0);
  }

  // Door animation
  if (doorAnimating && doorMeshes.length > 0) {
    const target = state.doorsOpen ? 1 : 0;
    doorAnimProgress += (target - doorAnimProgress) * 0.06;
    if (Math.abs(doorAnimProgress - target) < 0.001) {
      doorAnimProgress = target;
      doorAnimating    = false;
    }
    doorMeshes.forEach(door => {
      // Y-axis swing (like a real car door hinge on its front pillar)
      const openAngle = door.userData.openSide * Math.PI * 0.50; // 90°
      const tilt      = door.userData.openSide * Math.PI * 0.06; // slight outward
      door.rotation.y = door.userData.origRotY + doorAnimProgress * openAngle;
      door.rotation.z = door.userData.origRotZ + doorAnimProgress * tilt;
    });
  }

  // Wheel spin
  if (state.autoRotate) {
    wheelMeshes.forEach(w => {
      if (w.userData.spinAxis === 'z') w.rotation.z += delta * 1.8;
      else                             w.rotation.x += delta * 1.8;
    });
  }

  renderer.render(scene, camera);
}

/* ══════════════════════════════════════════════
   INPUT — drag + scroll + touch
   Works in BOTH exterior and interior views
══════════════════════════════════════════════ */
function attachInputEvents(canvas) {
  canvas.addEventListener('mousedown', e => {
    isDragging = true;
    lastMouse  = { x: e.clientX, y: e.clientY };
    canvas.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const dx = (e.clientX - lastMouse.x) * 0.005;
    const dy = (e.clientY - lastMouse.y) * 0.004;
    if (state.view === 'exterior') {
      yaw   += dx;
      pitch += dy;
      pitch  = Math.max(-0.3, Math.min(0.8, pitch));
    } else {
      // Interior: same drag controls orbit around cockpit
      intYaw   += dx;
      intPitch += dy;
      intPitch  = Math.max(-0.5, Math.min(0.6, intPitch));
    }
    lastMouse = { x: e.clientX, y: e.clientY };
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
    canvas.style.cursor = 'grab';
  });
  canvas.style.cursor = 'grab';

  // Scroll zoom — works in both views
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    camRadiusTarget = Math.max(0.8, Math.min(18, camRadiusTarget + e.deltaY * 0.012));
  }, { passive: false });

  // Touch
  let lastTouch = null;
  canvas.addEventListener('touchstart', e => {
    lastTouch  = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    isDragging = true;
  });
  canvas.addEventListener('touchmove', e => {
    if (!isDragging || !lastTouch) return;
    const dx = (e.touches[0].clientX - lastTouch.x) * 0.006;
    const dy = (e.touches[0].clientY - lastTouch.y) * 0.005;
    if (state.view === 'exterior') {
      yaw   += dx; pitch += dy;
      pitch  = Math.max(-0.3, Math.min(0.8, pitch));
    } else {
      intYaw   += dx; intPitch += dy;
      intPitch  = Math.max(-0.5, Math.min(0.6, intPitch));
    }
    lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  });
  canvas.addEventListener('touchend', () => { isDragging = false; lastTouch = null; });
}

function resizeRenderer() {
  const w = document.querySelector('.canvas-wrapper');
  if (!w || !renderer) return;
  renderer.setSize(w.clientWidth, w.clientHeight);
  if (camera) { camera.aspect = w.clientWidth / w.clientHeight; camera.updateProjectionMatrix(); }
}

/* ══════════════════════════════════════════════
   COLOR CHANGE — reliable method
   Applies to ALL non-glass/non-emissive meshes
══════════════════════════════════════════════ */
function applyColorToScene(col) {
  if (!carGroup) return;

  carGroup.traverse(obj => {
    if (!obj.isMesh) return;

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat, mi) => {
      if (!mat) return;

      // Skip glass, emissive lights, pure black rubber (very dark + no metal)
      const isGlass    = mat.transmission > 0 || mat.opacity < 0.9;
      const isEmissive = mat.emissiveIntensity > 0.5;
      const isRubber   = mat.metalness < 0.05 && mat.roughness > 0.85;
      if (isGlass || isEmissive || isRubber) return;

      // Clone per-instance so other objects aren't affected
      const key = 'cloned_' + mi;
      if (!obj.userData[key]) {
        if (Array.isArray(obj.material)) {
          obj.material = obj.material.map(m => m.clone());
        } else {
          obj.material = mat.clone();
        }
        obj.userData[key] = true;
      }

      const target = Array.isArray(obj.material) ? obj.material[mi] : obj.material;
      target.color.set(col.hex);
      target.roughness   = col.roughness;
      target.needsUpdate = true;
    });
  });
}

/* ══════════════════════════════════════════════
   STATE ACTIONS
══════════════════════════════════════════════ */
function setColor(idx) {
  state.colorIdx = idx;
  const col = CAR_COLORS[idx];
  applyColorToScene(col);
  document.querySelectorAll('.color-swatch').forEach((s, i)  => s.classList.toggle('active', i === idx));
  document.querySelectorAll('.bottom-swatch').forEach((s, i) => s.classList.toggle('active', i === idx));
  showToast('Color: ' + col.name);
}

function setWheels(idx) {
  state.wheelIdx = idx;
  const w = WHEEL_OPTIONS[idx];
  wheelMeshes.forEach(wheel => {
    wheel.traverse(obj => {
      if (!obj.isMesh || !obj.material) return;
      const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      if (mat && mat.metalness > 0.4) {
        if (!obj.userData.wheelMatCloned) {
          obj.material = (Array.isArray(obj.material) ? obj.material[0] : obj.material).clone();
          obj.userData.wheelMatCloned = true;
        }
        obj.material.color.set(w.color);
        obj.material.needsUpdate = true;
      }
    });
  });
  document.querySelectorAll('.wheel-option').forEach((b, i) => b.classList.toggle('active', i === idx));
  showToast('Wheels: ' + w.name + ' ' + w.size + '"');
}

function applyFinish() {
  const map = {
    metallic: { roughness: 0.08, metalness: 0.90 },
    matte:    { roughness: 0.95, metalness: 0.10 },
    gloss:    { roughness: 0.01, metalness: 0.95 },
    satin:    { roughness: 0.30, metalness: 0.70 },
  };
  const p = map[state.finish];
  if (!carGroup) return;
  carGroup.traverse(obj => {
    if (!obj.isMesh || !obj.material) return;
    const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    if (mat && !mat.transmission && mat.metalness > 0.05) {
      mat.roughness = p.roughness;
      mat.metalness = p.metalness;
      mat.needsUpdate = true;
    }
  });
}

function toggleDoors() {
  if (doorMeshes.length === 0) {
    showToast('No door meshes found — see console');
    console.warn('Open DevTools > Console, find door mesh names in the list above,');
    console.warn('then add: n.includes("YOUR_NAME") inside the door detection block.');
    return;
  }
  state.doorsOpen = !state.doorsOpen;
  doorAnimating   = true;
  const btn = document.getElementById('btn-doors');
  if (state.doorsOpen) {
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="2" width="18" height="20" rx="2"/><circle cx="16" cy="12" r="1"/></svg> Close Doors';
    btn.classList.add('open');
    showToast('Opening doors…');
  } else {
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="2" width="18" height="20" rx="2"/><circle cx="16" cy="12" r="1"/></svg> Open Doors';
    btn.classList.remove('open');
    showToast('Closing doors…');
  }
}

function toggleView(view) {
  state.view = view;
  document.getElementById('btn-exterior').classList.toggle('active', view === 'exterior');
  document.getElementById('btn-interior').classList.toggle('active', view === 'interior');
  if (view === 'interior') {
    // Start interior close-up
    camRadiusTarget = 2.0;
    intYaw   = 0;
    intPitch = 0.05;
    showToast('Interior — drag to look around, scroll to zoom');
  } else {
    camRadiusTarget = 9;
    pitch = 0.18;
    showToast('Exterior View');
  }
}

function toggleAutoRotate() {
  state.autoRotate = !state.autoRotate;
  document.getElementById('btn-rotate').classList.toggle('active', state.autoRotate);
  showToast(state.autoRotate ? 'Auto Rotate ON' : 'Auto Rotate OFF');
}

function updateDoorButton() {
  const btn = document.getElementById('btn-doors');
  if (doorMeshes.length === 0) {
    btn.style.opacity = '0.45';
    btn.title = 'No door meshes detected. Check console for mesh names.';
  } else {
    btn.style.opacity = '1';
    btn.title = doorMeshes.length + ' door(s) found';
    showToast(doorMeshes.length + ' door(s) ready');
  }
}

function saveConfig() {
  const col = CAR_COLORS[state.colorIdx];
  const whl = WHEEL_OPTIONS[state.wheelIdx];
  state.configs.push({
    name: col.name, color: col.hex,
    finish: state.finish, wheel: whl.name,
    colorIdx: state.colorIdx, wheelIdx: state.wheelIdx, finishKey: state.finish,
  });
  state.currentConfigIdx = state.configs.length - 1;
  buildConfigs();
  showToast('Configuration saved!');
}

function loadConfig(idx) {
  const cfg = state.configs[idx];
  state.currentConfigIdx = idx;
  setColor(cfg.colorIdx);
  setWheels(cfg.wheelIdx);
  state.finish = cfg.finishKey;
  applyFinish();
  document.querySelectorAll('.finish-btn').forEach(b => b.classList.toggle('active', b.dataset.finish === cfg.finishKey));
  buildConfigs();
  showToast('Loaded: ' + cfg.name);
}

/* ══════════════════════════════════════════════
   UI BUILDERS
══════════════════════════════════════════════ */
function buildColorGrid() {
  const grid = document.getElementById('color-grid');
  const bar  = document.getElementById('bottom-colors');
  grid.innerHTML = bar.innerHTML = '';
  CAR_COLORS.forEach((c, i) => {
    const sw = document.createElement('div');
    sw.className = 'color-swatch' + (i === 0 ? ' active' : '');
    sw.style.background = c.hex;
    sw.innerHTML = '<span class="swatch-name">' + c.name + '</span>';
    sw.addEventListener('click', () => setColor(i));
    grid.appendChild(sw);

    const bs = document.createElement('div');
    bs.className = 'bottom-swatch' + (i === 0 ? ' active' : '');
    bs.style.background = c.hex;
    bs.title = c.name;
    bs.addEventListener('click', () => setColor(i));
    bar.appendChild(bs);
  });
}

function buildWheelOptions() {
  const c = document.getElementById('wheel-options');
  c.innerHTML = '';
  WHEEL_OPTIONS.forEach((w, i) => {
    const b = document.createElement('button');
    b.className = 'wheel-option' + (i === 0 ? ' active' : '');
    b.innerHTML = '<span class="wheel-icon" style="color:' + w.color + '">' + w.icon + '</span><span>' + w.name + ' · ' + w.size + '"</span>';
    b.addEventListener('click', () => setWheels(i));
    c.appendChild(b);
  });
}

function buildFinishButtons() {
  document.querySelectorAll('.finish-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.finish === state.finish);
    btn.addEventListener('click', () => {
      state.finish = btn.dataset.finish;
      document.querySelectorAll('.finish-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFinish();
      showToast('Finish: ' + state.finish);
    });
  });
}

function buildSpecs() {
  const c = document.getElementById('specs-list');
  c.innerHTML = '';
  CAR_SPECS.forEach(s => {
    const r = document.createElement('div');
    r.style.marginBottom = '12px';
    r.innerHTML =
      '<div class="spec-row"><span class="spec-label">' + s.label + '</span><span class="spec-value">' + s.value + '</span></div>' +
      '<div class="spec-bar-track"><div class="spec-bar" style="width:' + (s.bar * 100) + '%"></div></div>';
    c.appendChild(r);
  });
}

function buildConfigs() {
  const list = document.getElementById('configs-list');
  list.innerHTML = '';
  if (!state.configs.length) {
    list.innerHTML = '<div style="color:var(--text-muted);font-size:11px;text-align:center;padding:12px 0;">No saved configs yet.</div>';
    return;
  }
  state.configs.forEach((cfg, i) => {
    const card = document.createElement('div');
    card.className = 'config-card' + (i === state.currentConfigIdx ? ' active-config' : '');
    card.innerHTML =
      '<div class="config-card-swatch" style="background:' + cfg.color + '"></div>' +
      '<div class="config-card-info"><b>' + cfg.name + '</b><span>' + cfg.finish + ' · ' + cfg.wheel + '</span></div>';
    card.addEventListener('click', () => loadConfig(i));
    list.appendChild(card);
  });
}

/* ══════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════ */
let _toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ══════════════════════════════════════════════
   SCREENSHOT & FULLSCREEN
══════════════════════════════════════════════ */
function takeScreenshot() {
  renderer.render(scene, camera);
  const a = document.createElement('a');
  a.href = renderer.domElement.toDataURL('image/png');
  a.download = 'car360-config.png';
  a.click();
  showToast('Screenshot saved!');
}

function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
}

/* ══════════════════════════════════════════════
   LOADING SEQUENCE
══════════════════════════════════════════════ */
function runLoadingSequence() {
  const bar   = document.getElementById('loader-bar');
  const label = document.getElementById('loader-text');
  const steps = [
    { pct: 20,  msg: 'Loading studio environment…' },
    { pct: 45,  msg: 'Building car geometry…' },
    { pct: 65,  msg: 'Applying materials…' },
    { pct: 82,  msg: 'Initializing lighting…' },
    { pct: 95,  msg: 'Almost ready…' },
    { pct: 100, msg: 'Welcome to Car360.' },
  ];
  let i = 0;
  (function next() {
    if (i >= steps.length) {
      setTimeout(() => {
        document.getElementById('loading-screen').classList.add('fade-out');
        document.getElementById('app').classList.remove('hidden');
      }, 450);
      return;
    }
    const s = steps[i++];
    bar.style.width = s.pct + '%';
    label.textContent = s.msg;
    setTimeout(next, 300 + Math.random() * 200);
  })();
}

/* ══════════════════════════════════════════════
   BOOT
══════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  initThree();
  buildColorGrid();
  buildWheelOptions();
  buildFinishButtons();
  buildSpecs();
  buildConfigs();

  document.getElementById('btn-exterior').addEventListener('click', () => toggleView('exterior'));
  document.getElementById('btn-interior').addEventListener('click', () => toggleView('interior'));
  document.getElementById('btn-rotate').addEventListener('click', toggleAutoRotate);
  document.getElementById('btn-doors').addEventListener('click', toggleDoors);
  document.getElementById('btn-save').addEventListener('click', saveConfig);
  document.getElementById('btn-add-config').addEventListener('click', saveConfig);
  document.getElementById('btn-screenshot').addEventListener('click', takeScreenshot);
  document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);
  document.getElementById('btn-order').addEventListener('click', () => showToast('Order flow coming soon!'));

  document.querySelectorAll('.step').forEach(s => {
    s.addEventListener('click', () => {
      document.querySelectorAll('.step').forEach(x => x.classList.remove('active'));
      s.classList.add('active');
    });
  });

  runLoadingSequence();
});
