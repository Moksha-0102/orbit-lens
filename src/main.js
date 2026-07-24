import * as THREE from 'three';
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

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 0.002; 
controls.maxDistance = 10;

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
const earthMaterial = new THREE.MeshPhongMaterial({
  map: textureLoader.load('/textures/8k_earth_daymap.jpg'),
  normalMap: textureLoader.load('/textures/8k_earth_normal_map.jpg'),
  normalScale: new THREE.Vector2(0.5, 0.5),
  specularMap: textureLoader.load('/textures/8k_earth_specular_map.jpg'),
  specular: new THREE.Color('grey')
});

const earth = new THREE.Mesh(earthGeometry, earthMaterial);
scene.add(earth);
const ambientLight = new THREE.AmbientLight(0x333333);
scene.add(ambientLight);
const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
sunLight.position.set(5, 3, 5);
scene.add(sunLight);
const earthShine = new THREE.HemisphereLight(0xaaaaaa, 0x444455, 1.5);
scene.add(earthShine);

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
  '25544': { path: '/models/iss.glb', scale: 0.001 },
  '20580': { path: '/models/hubble.glb', scale: 0.0001 },
  '48274': { path: null, scale: 1 },
  '27424': { path: '/models/aqua.glb', scale: 0.01 },
  '25994': { path: null, scale: 1 }
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
      mesh.rotation.y = Math.PI / 2; 
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

async function fetchSatelliteData() {
  try {
    const noradIds = ['25544', '20580', '48274', '27424', '25994'];
    const fetchPromises = noradIds.map(id => 
      fetch(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${id}&FORMAT=tle`)
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP Error Status: ${response.status}`);
          }
          return response.text();
        })
    );

    const results = await Promise.all(fetchPromises);
    const textData = results.join('\n');

    if (textData.includes('<!DOCTYPE html>') || textData.includes('Error') || textData.includes('No GP data')) {
      throw new Error("API Rate Limit hit. Forcing offline fallback mode."); 
    }

    const lines = textData.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    for (let i = 0; i < lines.length - 2; i += 3) {
      const name = lines[i];
      const tleLine1 = lines[i + 1];
      const tleLine2 = lines[i + 2];
      
      if (tleLine1.charAt(0) !== '1' || tleLine2.charAt(0) !== '2') continue; 
      
      const noradId = tleLine1.substring(2, 7).trim();
      const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
      const dotMesh = new THREE.Mesh(dotGeometry, dotMaterial);
      scene.add(dotMesh);
      
      // Save the ID so we can use it to swap models later
      const satObject = { name, noradId, satrec, dotMesh }; 
      constellation.push(satObject);
      
      const option = document.createElement('option');
      option.value = constellation.length - 1; 
      option.innerText = name;
      satSelector.appendChild(option);
    }
    
    if (constellation.length === 0) {
      throw new Error("Parsed 0 satellites. Data was corrupted or empty.");
    }
    
    console.log(`Successfully loaded ${constellation.length} satellites.`);
    changeActiveTarget(constellation[0]);
    
  } catch (error) {
    console.warn("Network/API failed. Loading offline fallback mode.", error);
    
    const lines = FALLBACK_TLE.split('\n');
    const name = lines[0];
    const noradId = lines[1].substring(2, 7).trim(); // Extract ID
    const satrec = satellite.twoline2satrec(lines[1], lines[2]);
    const dotMesh = new THREE.Mesh(dotGeometry, dotMaterial);
    scene.add(dotMesh);
    const satObject = { name, noradId, satrec, dotMesh };
    constellation.push(satObject);
    
    const option = document.createElement('option');
    option.value = 0;
    option.innerText = name + " (OFFLINE)";
    satSelector.appendChild(option);
    
    changeActiveTarget(constellation[0]);
  }
}

camToggleBtn.addEventListener('click', () => {
  isCameraLocked = !isCameraLocked;
  if (isCameraLocked) {
    camToggleBtn.innerText = 'CAMERA LOCK: SATELLITE'; 
    camToggleBtn.classList.remove('unlocked');
    controls.minDistance = 0.002;
  } else {
    camToggleBtn.innerText = 'CAMERA LOCK: EARTH';
    camToggleBtn.classList.add('unlocked');
    controls.minDistance = 1.2; 
  }
});

function changeActiveTarget(newSatObject) {
  activeTarget = newSatObject;
  document.getElementById('sat-name').innerText = newSatObject.name; 
  drawTrajectory(activeTarget.satrec);
  
  Object.values(loadedModels).forEach(model => {
    model.visible = false;
  });
  const targetModel = loadedModels[newSatObject.noradId];
  
  if (targetModel) {
    targetModel.visible = true;
  }
}

satSelector.addEventListener('change', (event) => {
  const selectedIndex = event.target.value;
  const newTarget = constellation[selectedIndex];
  changeActiveTarget(newTarget);
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

function animate() {
  requestAnimationFrame(animate);
  
  const now = new Date();
  
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
  
  if (isCameraLocked && activeTarget) {
    currentCameraTarget.lerp(targetGroup.position, 0.05);
  } else {
    currentCameraTarget.lerp(new THREE.Vector3(0, 0, 0), 0.05);
  }
  
  controls.target.copy(currentCameraTarget);
  controls.update();
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

fetchSatelliteData()
animate();