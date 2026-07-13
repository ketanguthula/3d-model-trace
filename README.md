# 3D Model Trace

A simple browser-based 3D reference tool for viewing and adjusting a human figure model so it can be used as a tracing aid.

## Features
- Load a 3D FBX model in the browser
- Orbit the camera to inspect the figure from different angles
- Adjust the model height, lighting, grid, ground plane, and color
- Toggle wireframe and rain effects
- Reset the camera to a home view

## Running locally
1. Open [draw-model.html](draw-model.html) in a browser.
2. The page loads the 3D model and related assets from CDN links, so no build step is required.

## Notes
- This project is a static web app and does not need a Python or Node dependency file such as requirements.txt.
- The FBX model is loaded from a relative path and must be available in the project folder when running locally.
