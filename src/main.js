import * as THREE from 'three';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js'; 
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import * as satellite from 'satellite.js';


const latElement = document.getElementById('lat-val');
const lonElement = document.getElementById('lon-val');
const altElement = document.getElementById('alt-val');
const velElement = document.getElementById('vel-val');
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
const camToggleBtn = document.getElementById('cam-toggle');
let isCameraLocked = false; 
const currentCameraTarget = new THREE.Vector3(0, 0, 0); 
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
raycaster.params.Points.threshold = 0.1;
let isTransitioning = false;
let transitionProgress = 1.0;

const camera = new THREE.PerspectiveCamera(
  45, 
  window.innerWidth / window.innerHeight, 
  0.1, 
  1000
);
camera.position.set(0, 0, 5); 

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

const trackballControls = new TrackballControls(camera, renderer.domElement);
trackballControls.rotateSpeed = 4.0;
trackballControls.dynamicDampingFactor = 0.1;
trackballControls.minDistance = 0.002; 
trackballControls.maxDistance = 10;

const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.05;
orbitControls.enablePan = false;
orbitControls.minDistance = 1.2; 
orbitControls.maxDistance = 10;

trackballControls.enabled = false;
orbitControls.enabled = true;

/*Loading Screen*/
const loadingScreen = document.getElementById('loading-screen');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const manager = new THREE.LoadingManager();

let highestProgress = 0; 

manager.onProgress = function (url, itemsLoaded, itemsTotal) {
  const currentProgress = (itemsLoaded / itemsTotal) * 100;
  
  if (currentProgress > highestProgress) {
    highestProgress = currentProgress;
    progressBar.style.width = highestProgress + '%';
    progressText.innerText = Math.floor(highestProgress) + '%'; 
  }
};

manager.onLoad = function () {
  console.log('All 3D assets loaded.');
  Object.values(loadedModels).forEach(model => model.visible = true);
  renderer.render(scene, camera);
  Object.values(loadedModels).forEach(model => model.visible = false);
  
  if (activeTarget) {
    changeActiveTarget(activeTarget);
  }
  
  loadingScreen.style.pointerEvents = 'none';

  setTimeout(() => {
    loadingScreen.classList.add('fade-out');
    setTimeout(() => {
      loadingScreen.style.display = 'none';
    }, 800);
  }, 500); 
};

/*End loading screen*/

const textureLoader = new THREE.TextureLoader(manager);
const earthGeometry = new THREE.SphereGeometry(1, 64, 64);
const nightTexture = textureLoader.load('/textures/8k_earth_nightmap.jpg'); 

const earthMaterial = new THREE.MeshPhongMaterial({
  map: textureLoader.load('/textures/8k_earth_daymap.jpg'),
  normalMap: textureLoader.load('/textures/8k_earth_normal_map.jpg'),
  normalScale: new THREE.Vector2(0.5, 0.5),
  specularMap: textureLoader.load('/textures/8k_earth_specular_map.jpg'),
  specular: new THREE.Color('grey')
});

earthMaterial.userData.sunDir = { value: new THREE.Vector3() };
earthMaterial.onBeforeCompile = function (shader) {
  shader.uniforms.tNight = { value: nightTexture };
  shader.uniforms.sunDir = earthMaterial.userData.sunDir;

  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <map_pars_fragment>',
    `
    #include <map_pars_fragment>
    uniform sampler2D tNight;
    uniform vec3 sunDir;
    `
  );

  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <emissivemap_fragment>',
    `
    #include <emissivemap_fragment>
    
    float intensity = dot(vNormal, sunDir);
    float nightMix = 1.0 - smoothstep(-0.2, 0.2, intensity);
    vec4 nightColor = texture2D(tNight, vMapUv);
    
    float luminance = dot(nightColor.rgb, vec3(0.299, 0.587, 0.114));
    
    luminance = smoothstep(0.1, 0.5, luminance);
    
    vec3 realisticLights = vec3(1.0, 0.75, 0.3) * luminance;
    
    totalEmissiveRadiance += realisticLights * nightMix * 2.0; 
    `
  );
};

const earth = new THREE.Mesh(earthGeometry, earthMaterial);
scene.add(earth);
const ambientLight = new THREE.AmbientLight(0x222222); 
scene.add(ambientLight);
const earthShine = new THREE.HemisphereLight(0x000000, 0x002244, 1.5); 
scene.add(earthShine);
const sunLight = new THREE.DirectionalLight(0xffffff, 3.0);
scene.add(sunLight);

function createSunTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(256, 256, 0, 256, 256, 256);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.1, 'rgba(255, 250, 200, 1)');
  gradient.addColorStop(0.3, 'rgba(255, 180, 50, 0.8)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 512);
  return new THREE.CanvasTexture(canvas);
}

const sunMaterial = new THREE.SpriteMaterial({
  map: createSunTexture(),
  blending: THREE.AdditiveBlending,
  transparent: true,
  depthWrite: false
});

const sunSprite = new THREE.Sprite(sunMaterial);
sunSprite.scale.set(15, 15, 1);
scene.add(sunSprite)

function createStars() {
  const starGeometry = new THREE.BufferGeometry();
  const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.02 });
  const starVertices = [];
  
  for(let i = 0; i < 5000; i++) {
    const x = (Math.random() - 0.5) * 100;
    const y = (Math.random() - 0.5) * 100;
    const z = (Math.random() - 0.5) * 100;
    starVertices.push(x, y, z);
  }
  
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
  const stars = new THREE.Points(starGeometry, starMaterial);
  scene.add(stars);
}
createStars();




/* Satellite Data fetching */

const ISS_TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=tle';
const targetGroup = new THREE.Group();
scene.add(targetGroup);

const modelRegistry = {
  '25544': { path: '/models/iss.glb', scale: 0.001, rotation: [0, Math.PI / 2, 0] },
  '20580': { path: '/models/hubble.glb', scale: 0.0001, rotation: [-Math.PI / 2, 0, 0] }, 
  '48274': { path: null, scale: 1, rotation: [0, 0, 0] },
  '27424': { path: '/models/aqua.glb', scale: 0.004, rotation: [Math.PI, 0, 0] }, 
  '25994': { path: null, scale: 1, rotation: [0, 0, 0] }
};

const loadedModels = {};
const fallbackGeometry = new THREE.SphereGeometry(0.015, 16, 16); 
const fallbackMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff });
const dracoLoader = new DRACOLoader(manager);
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
const gltfLoader = new GLTFLoader(manager);
gltfLoader.setDRACOLoader(dracoLoader);

Object.keys(modelRegistry).forEach(noradId => {
  const config = modelRegistry[noradId];

  if (!config.path) {
    const mesh = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
    mesh.visible = false;
    targetGroup.add(mesh);
    loadedModels[noradId] = mesh;
    
    manager.itemStart(`procedural-${noradId}`);
    manager.itemEnd(`procedural-${noradId}`);
    return; 
  }

  gltfLoader.load(
    config.path,
    (gltf) => {
      const mesh = gltf.scene;
      mesh.scale.set(config.scale, config.scale, config.scale); 
      mesh.rotation.set(config.rotation[0], config.rotation[1], config.rotation[2]); 
      
      mesh.visible = false; 
      targetGroup.add(mesh); 
      loadedModels[noradId] = mesh;
    },
    undefined,
    (error) => { console.error(`Error loading model ${noradId}:`, error); }
  );
});

let constellation = [];
let activeTarget = null;
let instancedMesh;

const dummy = new THREE.Object3D(); 
const satSearch = document.getElementById('sat-search');
const satFilter = document.getElementById('sat-filter');
const insightCount = document.getElementById('insight-count');
const dataInsights = document.getElementById('data-insights');
let activeFilter = 'ALL';
const dotGeometry = new THREE.SphereGeometry(0.0045, 8, 8); 
const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

let currentSatUpdateIndex = 0;
const SATS_PER_FRAME = 4000;

let orbitLine = null;
let futureOrbitLine = null;
let lastOrbitUpdate = 0;
let dropLine = null;

function getSatellitePosition(satrec, date, fixedGmst = null){
  const positionAndVelocity = satellite.propagate(satrec, date);
  const positionEci = positionAndVelocity.position;

  if (!positionEci || isNaN(positionEci.x)) return null;

  const gmst = fixedGmst !== null ? fixedGmst : satellite.gstime(date);
  const cosGmst = Math.cos(gmst);
  const sinGmst = Math.sin(gmst);
  const xEcef = positionEci.x * cosGmst + positionEci.y * sinGmst;
  const yEcef = -positionEci.x * sinGmst + positionEci.y * cosGmst;
  const zEcef = positionEci.z;

  const EARTH_RADIUS = 6371;
  return new THREE.Vector3(
    xEcef / EARTH_RADIUS,
    zEcef / EARTH_RADIUS,
    -yEcef / EARTH_RADIUS
  );
}

function drawTrajectory(satrec) {
  if (orbitLine) {
    scene.remove(orbitLine);
    orbitLine.geometry.dispose();
    orbitLine.material.dispose();
  }
  if (futureOrbitLine) {
    scene.remove(futureOrbitLine);
    futureOrbitLine.geometry.dispose();
    futureOrbitLine.material.dispose();
  }

  const pastPoints = [];
  const futurePoints = [];
  const now = Date.now();
  const frozenGmst = satellite.gstime(new Date(now));
  const periodMinutes = Math.ceil((2 * Math.PI) / satrec.no);
  const halfPeriod = Math.floor(periodMinutes / 2);

  for (let i = -halfPeriod; i <= 0; i++) {
    const pastDate = new Date(now + i * 60000);
    const pos = getSatellitePosition(satrec, pastDate, frozenGmst);
    if (pos) pastPoints.push(pos);
  }

  for (let i = 0; i <= halfPeriod; i++) {
    const futureDate = new Date(now + i * 60000);
    const pos = getSatellitePosition(satrec, futureDate, frozenGmst);
    if (pos) futurePoints.push(pos);
  }

  const pastMaterial = new THREE.LineBasicMaterial({ color: 0xffff00 });
  const pastGeometry = new THREE.BufferGeometry().setFromPoints(pastPoints);
  orbitLine = new THREE.Line(pastGeometry, pastMaterial);
  scene.add(orbitLine);

  const futureMaterial = new THREE.LineDashedMaterial({ 
    color: 0x00ffff, dashSize: 0.02, gapSize: 0.02 
  });
  const futureGeometry = new THREE.BufferGeometry().setFromPoints(futurePoints);
  futureOrbitLine = new THREE.Line(futureGeometry, futureMaterial);
  futureOrbitLine.computeLineDistances(); 
  scene.add(futureOrbitLine);
}

const FALLBACK_TLE = `ISS (ZARYA)
1 25544U 98067A   24135.52083333  .00016717  00000-0  30188-3 0  9997
2 25544  51.6416 284.6300 0005703 124.7170 327.0002 15.49525530417711`;

function parseTLEData(textData) {
  const lines = textData.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const dataList = document.getElementById('sat-list');
  dataList.innerHTML = '';
  constellation = [];

  const friendlyNames = {
    '25544': 'ISS (ZARYA) - INTERNATIONAL SPACE STATION',
    '20580': 'HST - HUBBLE SPACE TELESCOPE',
    '48274': 'CSS (TIANHE) - TIANGONG SPACE STATION',
    '27424': 'AQUA',
    '25994': 'TERRA'
  };

  for (let i = 0; i < lines.length - 2; i += 3) {
    const rawName = lines[i];
    const tleLine1 = lines[i + 1];
    const tleLine2 = lines[i + 2];
    
    if (tleLine1.charAt(0) !== '1' || tleLine2.charAt(0) !== '2') continue; 
    
    const noradId = tleLine1.substring(2, 7).trim();
    const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
    const displayName = friendlyNames[noradId] ? friendlyNames[noradId] : rawName;
    const upperName = displayName.toUpperCase();
    let category = 'OTHER';
    if (upperName.includes('STARLINK')) category = 'STARLINK';
    else if (upperName.includes('ONEWEB')) category = 'ONEWEB';
    else if (upperName.includes('IRIDIUM') || upperName.includes('O3B') || upperName.includes('GLOBALSTAR') || upperName.includes('FLOCK') || upperName.includes('LEMUR') || upperName.includes('ORBCOMM')) category = 'COMMS';
    else if (upperName.includes('NAVSTAR') || upperName.includes('GLONASS') || upperName.includes('BEIDOU') || upperName.includes('GALILEO') || upperName.includes('GPS')) category = 'GPS';
    else if (upperName.includes('NOAA') || upperName.includes('GOES') || upperName.includes('AQUA') || upperName.includes('TERRA') || upperName.includes('METEOR') || upperName.includes('SENTINEL') || upperName.includes('LANDSAT')) category = 'WEATHER';
    else if (upperName.includes('ISS') || upperName.includes('CSS') || upperName.includes('TIANGONG')) category = 'STATIONS';
    else category = 'OTHER';
    
    const satObject = { name: displayName, noradId, satrec, category }; 
    constellation.push(satObject);
    const option = document.createElement('option');
    option.value = displayName;
    dataList.appendChild(option);
  }
  
  if (constellation.length > 0) {
    console.log(`Successfully loaded ${constellation.length} satellites.`);
    
    if (insightCount) insightCount.innerText = constellation.length;
    if (dataInsights) dataInsights.style.display = 'block';
    if (instancedMesh) scene.remove(instancedMesh);
    instancedMesh = new THREE.InstancedMesh(dotGeometry, dotMaterial, constellation.length);
    scene.add(instancedMesh);
    
    changeActiveTarget(null);
  } else {
    throw new Error("Parsed 0 satellites.");
  }
}

async function fetchSatelliteData() {
  const CACHE_KEY = 'orbitlens_tle_cache';
  const CACHE_TIME_KEY = 'orbitlens_tle_timestamp';
  const CACHE_DURATION = 6 * 60 * 60 * 1000;

  const cachedData = localStorage.getItem(CACHE_KEY);
  const cachedTime = localStorage.getItem(CACHE_TIME_KEY);

  if (cachedData && cachedTime && (Date.now() - parseInt(cachedTime)) < CACHE_DURATION) {
    console.log("Loading TLE data from local cache...");
    try {
      parseTLEData(cachedData);
      return;
    } catch (e) {
      console.warn("Cache corrupted. Fetching fresh data...");
    }
  }

  try {
    console.log("Fetching master active satellite list from API...");
    const response = await fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle');
    
    if (!response.ok) throw new Error(`HTTP Error Status: ${response.status}`);
    const textData = await response.text();

    if (textData.includes('<!DOCTYPE html>') || textData.includes('Error') || textData.includes('No GP data')) {
      throw new Error("API Rate Limit hit or invalid data returned."); 
    }

    localStorage.setItem(CACHE_KEY, textData);
    localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
    parseTLEData(textData);
    
  } catch (error) {
    console.warn("Network/API failed. Loading offline fallback mode.", error);
    const dataList = document.getElementById('sat-list');
    dataList.innerHTML = '';
    constellation = [];
    const lines = FALLBACK_TLE.split('\n');
    const name = lines[0] + " (OFFLINE)";
    const noradId = lines[1].substring(2, 7).trim(); 
    const satrec = satellite.twoline2satrec(lines[1], lines[2]);
    const satObject = { name, noradId, satrec };
    constellation.push(satObject);
    const option = document.createElement('option');
    option.value = name;
    dataList.appendChild(option);
    
    if (instancedMesh) scene.remove(instancedMesh);
    instancedMesh = new THREE.InstancedMesh(dotGeometry, dotMaterial, constellation.length);
    scene.add(instancedMesh);

    changeActiveTarget(null);
  }
}

camToggleBtn.addEventListener('click', () => {
  isCameraLocked = !isCameraLocked;
  if (isCameraLocked) {
    camToggleBtn.innerText = 'CAMERA LOCK: SATELLITE'; 
    camToggleBtn.classList.remove('unlocked');
    orbitControls.enabled = false;
    trackballControls.enabled = true;
  } else {
    camToggleBtn.innerText = 'CAMERA LOCK: EARTH';
    camToggleBtn.classList.add('unlocked');
    trackballControls.enabled = false;
    orbitControls.enabled = true;
    camera.up.set(0, 1, 0); 
  }
});

function changeActiveTarget(newSatObject) {
  const minimapContainer = document.getElementById('minimap-container'); 

  if (!newSatObject) {
    activeTarget = null;
    isTransitioning = true;
    transitionProgress = 0.0;
    
    document.getElementById('sat-name').innerText = 'NONE'; 
    latElement.innerText = '0.0000°';
    lonElement.innerText = '0.0000°';
    altElement.innerText = '0.00 km';
    velElement.innerText = '0.00 km/s';
    
    if (orbitLine) scene.remove(orbitLine);
    if (futureOrbitLine) scene.remove(futureOrbitLine);
    
    if (dropLine) dropLine.visible = false; 
    
    Object.values(loadedModels).forEach(model => model.visible = false);
    if (minimapContainer) minimapContainer.style.display = 'none';
    
    return;
  }

  if (!dropLine) {
    const dropMaterial = new THREE.LineBasicMaterial({ color: 0xaaaaaa, linewidth: 2, transparent: true, opacity: 0.5 });
    const dropGeom = new THREE.BufferGeometry();
    dropGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    dropLine = new THREE.Line(dropGeom, dropMaterial);
    dropLine.frustumCulled = false; 
    scene.add(dropLine);
  }
  dropLine.visible = true;

  activeTarget = newSatObject;
  document.getElementById('sat-name').innerText = newSatObject.name; 
  drawTrajectory(activeTarget.satrec);
  
  if (minimapContainer) {
    minimapContainer.style.display = 'block';
    drawGroundTrack(activeTarget.satrec); 
  }
  
  Object.values(loadedModels).forEach(model => model.visible = false);
  const targetModel = loadedModels[newSatObject.noradId];
  if (targetModel) targetModel.visible = true;

  isCameraLocked = true;
  camToggleBtn.innerText = 'CAMERA LOCK: SATELLITE'; 
  camToggleBtn.classList.remove('unlocked');
  
  orbitControls.enabled = false;
  trackballControls.enabled = true;

  isTransitioning = true;
  transitionProgress = 0.0;
}

satSearch.addEventListener('change', (event) => {
  const searchTerm = event.target.value.trim().toUpperCase();
  
  if (searchTerm === '') {
    changeActiveTarget(null);
    isCameraLocked = false;
    camToggleBtn.innerText = 'CAMERA LOCK: EARTH';
    camToggleBtn.classList.add('unlocked');
    orbitControls.minDistance = 1.2; 
  } else {
    const foundSat = constellation.find(sat => sat.name.toUpperCase().includes(searchTerm));
    if (foundSat) {
      changeActiveTarget(foundSat);
      satSearch.value = foundSat.name;
    }
  }
});

satFilter.addEventListener('change', (event) => {
  activeFilter = event.target.value;
  const dataList = document.getElementById('sat-list');
  dataList.innerHTML = '';
  let visibleCount = 0;
  
  constellation.forEach(sat => {
     if (activeFilter === 'ALL' || sat.category === activeFilter) {
         const option = document.createElement('option');
         option.value = sat.name;
         dataList.appendChild(option);
         visibleCount++;
     }
  });
  
  if (insightCount) insightCount.innerText = visibleCount;
  if (activeTarget && activeFilter !== 'ALL' && activeTarget.category !== activeFilter) {
      changeActiveTarget(null);
  }
  satSearch.value = '';
});

container.addEventListener('click', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  
  if (instancedMesh) {
    const intersects = raycaster.intersectObject(instancedMesh);
    if (intersects.length > 0) {
      const instanceId = intersects[0].instanceId;
      const clickedSat = constellation[instanceId];
      if (activeFilter === 'ALL' || clickedSat.category === activeFilter) {
        changeActiveTarget(clickedSat);
        satSearch.value = clickedSat.name; 
      }
    }
  }
});


/* Sun */

function getSunPosition(date) {
  const time = date.getTime();
  const jd = (time / 86400000.0) + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.460 + 0.9856474 * n) % 360;
  const g = (357.528 + 0.9856003 * n) % 360;
  const L_rad = L * (Math.PI / 180);
  const g_rad = g * (Math.PI / 180);
  const lambda_rad = L_rad + (1.915 * Math.sin(g_rad) + 0.020 * Math.sin(2 * g_rad)) * (Math.PI / 180);
  const epsilon_rad = (23.439 - 0.0000004 * n) * (Math.PI / 180);
  const alpha = Math.atan2(Math.cos(epsilon_rad) * Math.sin(lambda_rad), Math.cos(lambda_rad));
  const delta = Math.asin(Math.sin(epsilon_rad) * Math.sin(lambda_rad));
  const gmst = satellite.gstime(date);
  const latitude = delta;
  let longitude = alpha - gmst;
  
  if (longitude > Math.PI) longitude -= 2 * Math.PI;
  if (longitude < -Math.PI) longitude += 2 * Math.PI;

  const distance = 100; 
  const x = distance * Math.cos(latitude) * Math.cos(longitude);
  const y = distance * Math.sin(latitude);
  const z = -distance * Math.cos(latitude) * Math.sin(longitude);

  return new THREE.Vector3(x, y, z);
}


/* 2d map*/

function getLatLon(satrec, date) {
  const posAndVel = satellite.propagate(satrec, date);
  const gmst = satellite.gstime(date);
  
  if (!posAndVel.position || isNaN(posAndVel.position.x)) return null;
  
  const positionGd = satellite.eciToGeodetic(posAndVel.position, gmst);
  return {
    lat: positionGd.latitude * (180 / Math.PI),
    lon: positionGd.longitude * (180 / Math.PI)
  };
}

const mapCanvas = document.getElementById('minimap');
const mapCtx = mapCanvas.getContext('2d');
const mapImg = new Image();
mapImg.src = '/textures/8k_earth_daymap.jpg';

function drawGroundTrack(satrec) {
  if (!mapCanvas || !activeTarget) return;

  mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
  if (mapImg.complete) {
    mapCtx.drawImage(mapImg, 0, 0, mapCanvas.width, mapCanvas.height);
  }

  const now = Date.now();
  const periodMinutes = Math.ceil((2 * Math.PI) / satrec.no);
  const halfPeriod = Math.floor(periodMinutes / 2);

  function drawSegment(startI, endI, isDotted, color) {
    mapCtx.beginPath();
    mapCtx.lineWidth = 4;
    mapCtx.strokeStyle = color;
    
    if (isDotted) {
      mapCtx.setLineDash([8, 8]);
    } else {
      mapCtx.setLineDash([]); 
    }

    let lastX = -1;
    for (let i = startI; i <= endI; i++) {
      const d = new Date(now + i * 60000);
      const coords = getLatLon(satrec, d);
      if (!coords) continue;

      const x = (coords.lon + 180) * (mapCanvas.width / 360);
      const y = (90 - coords.lat) * (mapCanvas.height / 180);

      if (lastX !== -1 && Math.abs(x - lastX) > mapCanvas.width / 2) {
        mapCtx.stroke(); 
        mapCtx.beginPath(); 
      }

      if (i === startI || (lastX !== -1 && Math.abs(x - lastX) > mapCanvas.width / 2)) {
        mapCtx.moveTo(x, y);
      } else {
        mapCtx.lineTo(x, y);
      }
      lastX = x;
    }
    mapCtx.stroke();
  }

  drawSegment(-halfPeriod, 0, false, '#ffff00');
  drawSegment(0, halfPeriod, true, '#00ffff');
  mapCtx.setLineDash([]);

  const currentCoords = getLatLon(satrec, new Date(now));
  if (currentCoords) {
    const cx = (currentCoords.lon + 180) * (mapCanvas.width / 360);
    const cy = (90 - currentCoords.lat) * (mapCanvas.height / 180);
    
    mapCtx.beginPath();
    mapCtx.arc(cx, cy, 8, 0, 2 * Math.PI);
    mapCtx.fillStyle = '#ff0055'; 
    mapCtx.fill();
    mapCtx.lineWidth = 2;
    mapCtx.strokeStyle = 'white';
    mapCtx.stroke();
  }
}

function animate() {
  requestAnimationFrame(animate);
  
  const now = new Date();
  const sunPos = getSunPosition(now);
  sunLight.position.copy(sunPos);
  sunSprite.position.copy(sunPos);
  const sunDir = sunPos.clone().normalize();
  sunDir.transformDirection(camera.matrixWorldInverse);
  earth.material.userData.sunDir.value.copy(sunDir);
  
  if (instancedMesh && constellation.length > 0) {
    
    const has3DModel = activeTarget && 
                       loadedModels[activeTarget.noradId] && 
                       modelRegistry[activeTarget.noradId]?.path !== null;

    const limit = Math.min(currentSatUpdateIndex + SATS_PER_FRAME, constellation.length);
    
    for (let i = currentSatUpdateIndex; i < limit; i++) {
      const sat = constellation[i];
      const pos = getSatellitePosition(sat.satrec, now);
      
      if (pos) {
        dummy.position.copy(pos);
        const isHiddenByFilter = activeFilter !== 'ALL' && sat.category !== activeFilter;
        
        if ((sat === activeTarget && has3DModel) || isHiddenByFilter) {
           dummy.scale.set(0, 0, 0);
        } else {
           dummy.scale.set(1, 1, 1);
        }
        
        dummy.updateMatrix();
        instancedMesh.setMatrixAt(i, dummy.matrix);
      }
    }
    
    if (activeTarget) {
      const activeIndex = constellation.indexOf(activeTarget);
      if (activeIndex !== -1) {
        const pos = getSatellitePosition(activeTarget.satrec, now);
        if (pos) {
           dummy.position.copy(pos);
           if (has3DModel) {
             dummy.scale.set(0, 0, 0);
           } else {
             dummy.scale.set(1, 1, 1);
           }
           
           dummy.updateMatrix();
           instancedMesh.setMatrixAt(activeIndex, dummy.matrix);
        }
      }
    }
    
    instancedMesh.instanceMatrix.needsUpdate = true;
    
    currentSatUpdateIndex = limit;
    if (currentSatUpdateIndex >= constellation.length) {
      currentSatUpdateIndex = 0; 
    }
  }
  
  if (activeTarget) {
    const livePos = getSatellitePosition(activeTarget.satrec, now);
    
    if (livePos) { 
      targetGroup.position.copy(livePos);
      
      if (dropLine && dropLine.visible) {
        const groundPos = livePos.clone().normalize(); 
        const positions = dropLine.geometry.attributes.position.array;
        
        positions[0] = groundPos.x;
        positions[1] = groundPos.y;
        positions[2] = groundPos.z;
        positions[3] = livePos.x;
        positions[4] = livePos.y;
        positions[5] = livePos.z;
        
        dropLine.geometry.attributes.position.needsUpdate = true;
      }
      
      const futureTime = new Date(now.getTime() + 1000);
      const forwardPos = getSatellitePosition(activeTarget.satrec, futureTime);
      
      if (forwardPos) {
        targetGroup.up.copy(livePos).normalize();
        targetGroup.lookAt(forwardPos);
      }
    }

    if (now.getTime() - lastOrbitUpdate > 10000) {
      drawTrajectory(activeTarget.satrec);
      drawGroundTrack(activeTarget.satrec);
      lastOrbitUpdate = now.getTime();
    }
    
    const positionAndVelocity = satellite.propagate(activeTarget.satrec, now);
    const positionEci = positionAndVelocity.position;
    const velocityEci = positionAndVelocity.velocity;
    
    if (positionEci && velocityEci) {
      const gmst = satellite.gstime(now);
      const positionGd = satellite.eciToGeodetic(positionEci, gmst);
      
      const latitude = positionGd.latitude * (180 / Math.PI);
      const longitude = positionGd.longitude * (180 / Math.PI);
      const altitude = positionGd.height;
      
      const velocity = Math.sqrt(
        Math.pow(velocityEci.x, 2) + 
        Math.pow(velocityEci.y, 2) + 
        Math.pow(velocityEci.z, 2)
      );
      
      latElement.innerText = latitude.toFixed(4) + '°';
      lonElement.innerText = longitude.toFixed(4) + '°';
      altElement.innerText = altitude.toFixed(2) + ' km';
      velElement.innerText = velocity.toFixed(2) + ' km/s';
    }
  }

  let desiredTarget = new THREE.Vector3(0, 0, 0);
  let idealCameraPos = new THREE.Vector3(0, 0, 5); 

  if (activeTarget) {
    desiredTarget.copy(targetGroup.position);
    const earthToSat = desiredTarget.clone().normalize();
    idealCameraPos = desiredTarget.clone().add(earthToSat.multiplyScalar(0.3));
  } else {
    idealCameraPos = camera.position.clone().normalize().multiplyScalar(5);
  }

  if (isTransitioning) {
    trackballControls.enabled = false; 
    orbitControls.enabled = false; 

    transitionProgress += 0.025;
    
    if (transitionProgress >= 1.0) {
      transitionProgress = 1.0;
      isTransitioning = false;
      
      currentCameraTarget.copy(desiredTarget);
      camera.position.copy(idealCameraPos);
      
      if (!activeTarget) {
        camera.up.set(0, 1, 0); 
      }
      
      camera.lookAt(currentCameraTarget);
      
      trackballControls.target.copy(currentCameraTarget);
      orbitControls.target.copy(currentCameraTarget);
      
    } else {
      const dynamicLerp = 0.05 + (Math.pow(transitionProgress, 3) * 0.95);
      
      currentCameraTarget.lerp(desiredTarget, dynamicLerp);

      const currentDir = camera.position.clone().normalize();
      const targetDir = idealCameraPos.clone().normalize();

      if (currentDir.dot(targetDir) < -0.99) {
        currentDir.add(new THREE.Vector3(0, 0.1, 0)).normalize();
      }
      
      const angleDiff = currentDir.angleTo(targetDir);
      currentDir.lerp(targetDir, dynamicLerp).normalize();

      const baseAlt = idealCameraPos.length();
      const zoomBoost = angleDiff * 1.5; 
      const targetAlt = baseAlt + zoomBoost; 
      const currentAlt = camera.position.length();
      const newAlt = THREE.MathUtils.lerp(currentAlt, targetAlt, dynamicLerp);

      camera.position.copy(currentDir.multiplyScalar(newAlt));
      
      if (!activeTarget) {
        const targetUp = new THREE.Vector3(0, 1, 0);
        camera.up.lerp(targetUp, dynamicLerp);
      }
      
      camera.lookAt(currentCameraTarget);
    }

  } else {
    if (activeTarget && isCameraLocked) {
      trackballControls.enabled = true; 
      orbitControls.enabled = false;

      const previousTarget = currentCameraTarget.clone();
      currentCameraTarget.copy(desiredTarget); 

      const delta = new THREE.Vector3().subVectors(currentCameraTarget, previousTarget);
      camera.position.add(delta);

      trackballControls.target.copy(currentCameraTarget);
      trackballControls.update(); 
      
    } else {
      trackballControls.enabled = false;
      orbitControls.enabled = true;
      
      currentCameraTarget.lerp(new THREE.Vector3(0, 0, 0), 0.05);
      orbitControls.target.copy(currentCameraTarget);
      orbitControls.update(); 
    }
  }
  
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

fetchSatelliteData()
animate();


window.toggleMap = function() {
  const btn = document.getElementById('expand-map-btn');
  const container = document.getElementById('minimap-container');
  const canvas = document.getElementById('minimap');
  
  if (!container || !btn) return;
  
  if (btn.innerText === 'EXPAND') {
    btn.innerText = 'COLLAPSE';
    
    container.style.position = 'fixed';
    container.style.top = '50%';
    container.style.left = '50%';
    container.style.transform = 'translate(-50%, -50%)';
    container.style.width = '90vw';
    container.style.maxWidth = '1200px';
    container.style.maxHeight = '85vh';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.zIndex = '999999'; 
    container.style.background = '#0a0a0a';
    container.style.border = '1px solid #333333';
    container.style.padding = '0';
    container.style.boxShadow = '0 10px 50px rgba(0,0,0,0.9)';
    
    if (canvas) {
        canvas.style.objectFit = 'contain';
        canvas.style.minHeight = '0';
    }
    
  } else {
    btn.innerText = 'EXPAND';
    
    container.style.position = 'fixed';
    container.style.top = 'auto';
    container.style.bottom = '20px';
    container.style.right = '20px';
    container.style.left = 'auto';
    container.style.transform = 'none';
    container.style.width = '320px';
    container.style.maxWidth = '320px';
    container.style.maxHeight = 'none';
    container.style.display = 'block';
    container.style.zIndex = '100';
    container.style.background = '#0a0a0a';
    container.style.border = '1px solid #333333';
    container.style.padding = '0';
    container.style.boxShadow = 'none';
    
    if (canvas) {
        canvas.style.objectFit = 'fill';
        canvas.style.minHeight = 'auto';
    }
  }
};