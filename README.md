# ORBIT LENS

Orbit Lens is a real-time 3D satellite tracking website built using vanilla JavaScript and Three.js. It tracks over 16,000 live space objects around earth using real-time data from CelesTrak.

## Features

* **Smooth Performance:** This website uses `THREE.InstancedMesh` to render 16,000+ objects smoothly without crashing the browser.

* **Accuracy:** Calculates exact satellite positions, velocities, and altitudes using `satellite.js` and TLE data. The calculations and the tracking data have been verified with other trusted sources like the official NASA satellite tracker.

* **Ground Tracking:** Includes an interactive 2D map that displays an object's past and future orbit tracks.

* **Space Object Search:** You can instantly search and filter through 16,000+ active satellites.

* **Filtering:** You can filter specific satellite groups instantly, including but not limited to categories like Starlink, OneWeb, GPS, Weather, and Space Stations.

* **API Caching:** This website stores the satellite data for 6 hours in the browser's local cache (`localStorage`) to mitigate API failures and rate limits.

* **Responsive UI:** A dark-themed UI that is optimized for both desktop and mobile devices.


## Tech Stack

* **Graphics:** Three.js (WebGL)
* **Physics/Math:** satellite.js (SGP4/SDP4 propagation)
* **3D Asset Loading:** `GLTFLoader` with `DRACOLoader` compression
* **Data Source:** [CelesTrak API](https://celestrak.org/)
* **Frontend:** Vanilla HTML5, CSS3, ES6 JavaScript (No frameworks)

## Running Locally

To run this project locally, you must use a local web server to bypass strict browser CORS policies when loading local 3D models and textures.

1. **Clone the repository:**
```bash
git clone https://github.com/Moksha-0102/orbit-lens.git
cd orbit-lens
```

3. **Start a local server:**
* Using Python3:
```bash
python -m http.server 8000
```
Or

* Using Node.js (http-server):
```bash
npx http-server
```

3. **Launch the website:**
Open your web browser and navigate to http://localhost:8000 (or whichever port your server specifies).


Alternatively, if you don't want to use the terminal, you can do this:
1. Download this repository to your machine.
2. Open the folder in a code editor like VS Code.
3. Start the **Live Server** extension (on VS Code) to run this project locally. No terminal commands required.
4. Open your web browser and navigate to http://localhost:8000 (or whichever port your server specifies).

*(NOTE: Directly opening index.html in a browser without hosting a server will cause many features (e.g., API services) to fail due to modern browser security restrictions. Ensure you host it on a local server by following the steps above.)*