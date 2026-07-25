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
  
  if (activeTarget) {
    changeActiveTarget(activeTarget);
  }
  renderer.compile(scene, camera);

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

const satSelector = document.getElementById('sat-selector');
const dotGeometry = new THREE.SphereGeometry(0.008, 8, 8); 
const dotMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff });

let orbitLine = null;
let futureOrbitLine = null;
let lastOrbitUpdate = 0;

function getSatellitePosition(satrec, date, fixedGmst = null){
  const positionAndVelocity = satellite.propagate(satrec, date);
  const positionEci = positionAndVelocity.position;

  if (!positionEci || isNaN(positionEci.x)) return null;

  const gmst = fixedGmst !== null ? fixedGmst : satellite.gstime(date);
  
  const positionGd = satellite.eciToGeodetic(positionEci, gmst);
  const longitude = positionGd.longitude;
  const latitude = positionGd.latitude;
  const altitude = positionGd.height;
  
  const EARTH_RADIUS = 6371;
  const r = 1 + (altitude / EARTH_RADIUS); 
  const x = r * Math.cos(latitude) * Math.cos(longitude);
  const y = r * Math.sin(latitude);
  const z = -r * Math.cos(latitude) * Math.sin(longitude);

  return new THREE.Vector3(x, y, z);
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
  
  satSelector.innerHTML = '<option value="-1">SELECT TARGET...</option>';

  for (let i = 0; i < lines.length - 2; i += 3) {
    const name = lines[i];
    const tleLine1 = lines[i + 1];
    const tleLine2 = lines[i + 2];
    
    if (tleLine1.charAt(0) !== '1' || tleLine2.charAt(0) !== '2') continue; 
    
    const noradId = tleLine1.substring(2, 7).trim();
    const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
    const dotMesh = new THREE.Mesh(dotGeometry, dotMaterial);
    scene.add(dotMesh);
    
    const satObject = { name, noradId, satrec, dotMesh }; 
    constellation.push(satObject);
    
    const option = document.createElement('option');
    option.value = constellation.length - 1; 
    option.innerText = name;
    satSelector.appendChild(option);
  }
  
  if (constellation.length > 0) {
    console.log(`Successfully loaded ${constellation.length} satellites.`);
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
    console.log("Fetching fresh TLE data from API...");
    const noradIds = ['25544', '20580', '48274', '27424', '25994'];
    const fetchPromises = noradIds.map(id => 
      fetch(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${id}&FORMAT=tle`)
        .then(response => {
          if (!response.ok) throw new Error(`HTTP Error Status: ${response.status}`);
          return response.text();
        })
    );

    const results = await Promise.all(fetchPromises);
    const textData = results.join('\n');

    if (textData.includes('<!DOCTYPE html>') || textData.includes('Error') || textData.includes('No GP data')) {
      throw new Error("API Rate Limit hit."); 
    }

    localStorage.setItem(CACHE_KEY, textData);
    localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());

    parseTLEData(textData);
    
  } catch (error) {
    console.warn("Network/API failed. Loading offline fallback mode.", error);
    satSelector.innerHTML = '<option value="-1">SELECT TARGET...</option>';
    
    const lines = FALLBACK_TLE.split('\n');
    const name = lines[0];
    const noradId = lines[1].substring(2, 7).trim(); 
    const satrec = satellite.twoline2satrec(lines[1], lines[2]);
    const dotMesh = new THREE.Mesh(dotGeometry, dotMaterial);
    scene.add(dotMesh);
    const satObject = { name, noradId, satrec, dotMesh };
    constellation.push(satObject);
    
    const option = document.createElement('option');
    option.value = 0;
    option.innerText = name + " (OFFLINE)";
    satSelector.appendChild(option);
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
    
    Object.values(loadedModels).forEach(model => model.visible = false);
    
    return;
  }

  activeTarget = newSatObject;
  document.getElementById('sat-name').innerText = newSatObject.name; 
  drawTrajectory(activeTarget.satrec);
  
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

satSelector.addEventListener('change', (event) => {
  const selectedIndex = parseInt(event.target.value);
  if (selectedIndex === -1) {
    changeActiveTarget(null);
    isCameraLocked = false;
    camToggleBtn.innerText = 'CAMERA LOCK: EARTH';
    camToggleBtn.classList.add('unlocked');
    controls.minDistance = 1.2; 
  } else {
    const newTarget = constellation[selectedIndex];
    changeActiveTarget(newTarget);
  }
});


container.addEventListener('pointerdown', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  
  const targetMeshes = constellation.map(sat => sat.dotMesh);
  const intersects = raycaster.intersectObjects(targetMeshes);

  if (intersects.length > 0) {
    const clickedMesh = intersects[0].object;
    const clickedSatIndex = constellation.findIndex(sat => sat.dotMesh === clickedMesh);
    
    if (clickedSatIndex !== -1) {
      const clickedSat = constellation[clickedSatIndex];
      changeActiveTarget(clickedSat);
      satSelector.value = clickedSatIndex;
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



function animate() {
  requestAnimationFrame(animate);
  
  const now = new Date();
  const sunPos = getSunPosition(now);
  sunLight.position.copy(sunPos);
  sunSprite.position.copy(sunPos);
  const sunDir = sunPos.clone().normalize();
  sunDir.transformDirection(camera.matrixWorldInverse);
  earth.material.userData.sunDir.value.copy(sunDir);
  
  constellation.forEach(sat => {
    const pos = getSatellitePosition(sat.satrec, now);
    if (pos) {
      sat.dotMesh.position.copy(pos);
      sat.dotMesh.visible = (sat !== activeTarget);
    }
  });
  
  if (activeTarget) {
    const livePos = getSatellitePosition(activeTarget.satrec, now);
    
    if (livePos) { 
      targetGroup.position.copy(livePos);
      
      const futureTime = new Date(now.getTime() + 1000);
      const forwardPos = getSatellitePosition(activeTarget.satrec, futureTime);
      
      if (forwardPos) {
        targetGroup.up.copy(livePos).normalize();
        targetGroup.lookAt(forwardPos);
      }
    }

    if (now.getTime() - lastOrbitUpdate > 10000) {
      drawTrajectory(activeTarget.satrec);
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

    transitionProgress += 0.01;
    
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
      const dynamicLerp = 0.04 + (transitionProgress * 0.11);
      
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