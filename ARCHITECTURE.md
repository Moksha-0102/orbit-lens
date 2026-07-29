# Orbit Lens: How It Works 

This document explains how Orbit Lens and the code itself works. This project tracks thousands of satellites smoothly in a web browser without using bulky frameworks. Here is a simple breakdown of how the engine does it.


## 1. The Big Picture

The app runs on a simple, three-step loop:
1. **Get the Data:** Download the list of active satellites.
2. **Do the Math:** Calculate exactly where they are in space right now.
3. **Draw the Picture:** Tell the graphics card to show them on the screen.

## 2. Getting the Data (API & Caching)

The website gets the satellite data from CelesTrak, a non-profit organisation that provides free space data. However, downloading a text file with 16,000+ satellites takes time and uses up bandwidth. 

* **Saving for Later (Caching):** Instead of downloading the data every single time you refresh the page, the app saves it directly into your browser's memory for 6 hours. This is because the satellite data (TLE) is not like a live location of the satellite, but rather its like a snapshot of a satellite's position in space. This only gets updated like once or twice a day so having Orbit Lens only request the API for data only every 6 hours makes the app load incredibly fast on your second visit and prevents you from spamming the CelesTrak servers.


## 3. The Space Math (`satellite.js`)

Satellites don't broadcast normal GPS coordinates. Instead, they are tracked using a format called a "TLE" (Two-Line Element), which is basically a mathematical formula of their orbit.

* **Translating the Formulas:** I used a math library called `satellite.js` to do all the ath. It looks at the TLE formula, looks at the current time on your clock, and calculates the exact X, Y, and Z coordinates of the satellite in space.
* **Scaling it Down:** Since space is huge, you divide those massive real-world distances by the radius of the Earth so they fit perfectly around the 3D digital globe.

## 4. Drawing 16,000+ Dots Fast (Three.js)

If you tell a web browser to draw more than 16,000 individual 3D spheres, the computer will panic and the website will freeze and crash. I had to use some tricks to keep the app running at a smoothly despite the thousands of dots.

* **Instanced Rendering:** Instead of making 16,000 unique spheres, I used a feature called `InstancedMesh`. I created *one* single white dot, and then tell the graphics card to stamp that exact same dot 16,000 times in different locations. This is incredible fast and didn't choke the gpu.

* **Pacing the Updates:** All the individual dots are also moving simultaneously so updating 16,000 locations every single millisecond is still a lot of work. To continue keeping the app from running the smoothly, the app only updates 4,000 satellites per frame. It cycles through them really fast that your eyes can't tell the difference.

* **Day and Night:** The Earth looks realistic because I wrote custom lighting rules (a shader) to it where it calculates where the digital Sun is shining and seamlessly blends a bright daytime map with a glowing city-lights night map, both of which I got from Solar System Scope.

## 5. The Menus and Search Bar

* **A Custom Search Engine:** Normal HTML dropdown menus break completely if you try to put 16,000 items in them. So I built a custom search bar that only loads 200 items at a time. As you type, it instantly deletes and recreates that short list to match your search.

* **The Loading Screen:** The app has to download 3D models (like the ISS), textures, and the satellite data. The loading screen acts as a accurately depicts the loading progress and loads you in when everything is properly rendered

* **Filtering System:** Since there are more than 16000 satellites, I implemented a filtering system to filter them into different categories. These categories include Starlink, OneWeb, Comms, Navigation, Weather, and Other.

## 6. The 2D Flat Map

The minimap in the corner takes the 3D space math and flattens it out.

* **Latitude and Longitude:** The code converts the 3D X/Y/Z coordinates into standard 2D Latitude and Longitude to draw the satellite's path over the countries.

* **Line Wrapping:** When a satellite flies off the right edge of a flat map, it needs to reappear on the left edge. The code has a logic that detects the edge of the map, stops drawing the line, and restarts the line on the opposite side so it doesn't draw a messy streak straight across the screen.




