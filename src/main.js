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
controls.minDistance = 1.5;
controls.maxDistance = 10;

const textureLoader = new THREE.TextureLoader();
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
const issGroup = new THREE.Group();
scene.add(issGroup);
let issMesh = null;
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

gltfLoader.load(
  '/models/iss.glb',
  (gltf) => {
    issMesh = gltf.scene;
    issMesh.scale.set(0.001, 0.001, 0.001); 
    issMesh.rotation.y = Math.PI / 2; 
    issGroup.add(issMesh); 
    console.log("ISS model loaded successfully.");
  },
  undefined,
  (error) => {
    console.error("Fatal error loading the .glb file:", error);
  }
);

let activeSatrec = null;
let orbitLine = null;
let futureOrbitLine = null;
let lastOrbitUpdate = 0;

function getSatellitePosition(satrec, date){
  const positionAndVelocity = satellite.propagate(satrec, date);
  const positionEci = positionAndVelocity.position;

  if (!positionEci || isNaN(positionEci.x)) return null;

  const gmst = satellite.gstime(date);
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
  if (orbitLine) scene.remove(orbitLine);
  if (futureOrbitLine) scene.remove(futureOrbitLine);

  const pastPoints = [];
  const futurePoints = [];
  const now = Date.now();

  for (let i = -46; i <= 0; i++) {
    const pastDate = new Date(now + i * 60000);
    const pos = getSatellitePosition(satrec, pastDate);
    if (pos) pastPoints.push(pos);
  }

  for (let i = 0; i <= 46; i++) {
    const futureDate = new Date(now + i * 60000);
    const pos = getSatellitePosition(satrec, futureDate);
    if (pos) futurePoints.push(pos);
  }

  const pastMaterial = new THREE.LineBasicMaterial({ 
    color: 0xffff00, 
    transparent: false, 
    opacity: 1.0 
  });
  const pastGeometry = new THREE.BufferGeometry().setFromPoints(pastPoints);
  orbitLine = new THREE.Line(pastGeometry, pastMaterial);
  scene.add(orbitLine);

  const futureMaterial = new THREE.LineDashedMaterial({ 
    color: 0x00ffff, 
    dashSize: 0.02,
    gapSize: 0.02,
    transparent: false, 
    opacity: 1.0 
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
  const CACHE_KEY = 'iss_tle_cache';
  const CACHE_TIME_KEY = 'iss_tle_timestamp';
  const CACHE_DURATION = 1000 * 60 * 60 * 12;

  try {
    const cachedTLE = localStorage.getItem(CACHE_KEY);
    const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
    const now = Date.now();

    let data = '';

    if (cachedTLE && cachedTime && (now - cachedTime < CACHE_DURATION)) {
      console.log("Using cached TLE data. Bypassing network request.");
      data = cachedTLE;
    } else {
      console.log("Fetching fresh TLE data from CelesTrak...");
      const response = await fetch(ISS_TLE_URL);
      data = await response.text();

      if (!response.ok || data.includes('<html')) {
        throw new Error("API rate limited.");
      }

      localStorage.setItem(CACHE_KEY, data);
      localStorage.setItem(CACHE_TIME_KEY, now.toString());
    }

    const tleLines = data.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    activeSatrec = satellite.twoline2satrec(tleLines[1], tleLines[2]);
    drawTrajectory(activeSatrec);

  } catch (error) {
    console.warn("Network and Cache failed. Using Fallback TLE.", error);
    const tleLines = FALLBACK_TLE.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    activeSatrec = satellite.twoline2satrec(tleLines[1], tleLines[2]);
    drawTrajectory(activeSatrec);
  }
}

function animate() {
  requestAnimationFrame(animate);
  
  if (activeSatrec) {
    const now = new Date();
    const livePos = getSatellitePosition(activeSatrec, now);
    
    if (livePos && issMesh) {
      issGroup.position.copy(livePos);
      
      const futureTime = new Date(now.getTime() + 1000);
      const forwardPos = getSatellitePosition(activeSatrec, futureTime);
      
      if (forwardPos) {
        issGroup.up.copy(livePos).normalize();
        issGroup.lookAt(forwardPos);
      }
    }
    
    if (now.getTime() - lastOrbitUpdate > 10000) {
      drawTrajectory(activeSatrec);
      lastOrbitUpdate = now.getTime();
    }
    
    const positionAndVelocity = satellite.propagate(activeSatrec, now);
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