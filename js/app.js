import { PoseController } from './pose/pose-controller.js?v=20260715-5';
import { CanvasExporter } from './ui/canvas-exporter.js?v=20260715-5';
import { appendCheckboxControl, createControlSection } from './ui/control-elements.js';
import {
    CAMERA_PRESETS,
    CAMERA_TARGET,
    INITIAL_CAMERA_POSITION,
    MALE_MODEL_URL,
    ORTHOGRAPHIC_VIEW_HEIGHT
} from './config.js';

document.addEventListener('DOMContentLoaded', () => {
    const canvasContainer = document.getElementById('canvasContainer');

    // Set up the scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeeeeee);

    // Set up the camera
    const initialAspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
    const perspectiveCamera = new THREE.PerspectiveCamera(75, initialAspect, 0.1, 1000);
    const orthographicCamera = new THREE.OrthographicCamera(
        -(ORTHOGRAPHIC_VIEW_HEIGHT * initialAspect) / 2,
        (ORTHOGRAPHIC_VIEW_HEIGHT * initialAspect) / 2,
        ORTHOGRAPHIC_VIEW_HEIGHT / 2,
        -ORTHOGRAPHIC_VIEW_HEIGHT / 2,
        0.1,
        1000
    );
    let camera = perspectiveCamera;
    const initialCameraPosition = INITIAL_CAMERA_POSITION;
    perspectiveCamera.position.set(initialCameraPosition.x, initialCameraPosition.y, initialCameraPosition.z);
    orthographicCamera.position.copy(perspectiveCamera.position);

    // Set up the renderer
    const renderer = new THREE.WebGLRenderer({
        alpha: true,
        preserveDrawingBuffer: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    renderer.shadowMap.enabled = true;
    canvasContainer.appendChild(renderer.domElement);

    function resizeRendererToContainer() {
        const width = canvasContainer.clientWidth;
        const height = canvasContainer.clientHeight;
        if (width === 0 || height === 0) {
            return;
        }

        renderer.setSize(width, height, false);
        const aspect = width / height;
        perspectiveCamera.aspect = aspect;
        perspectiveCamera.updateProjectionMatrix();
        orthographicCamera.left = -(ORTHOGRAPHIC_VIEW_HEIGHT * aspect) / 2;
        orthographicCamera.right = (ORTHOGRAPHIC_VIEW_HEIGHT * aspect) / 2;
        orthographicCamera.top = ORTHOGRAPHIC_VIEW_HEIGHT / 2;
        orthographicCamera.bottom = -ORTHOGRAPHIC_VIEW_HEIGHT / 2;
        orthographicCamera.updateProjectionMatrix();
    }

    const canvasResizeObserver = new ResizeObserver(resizeRendererToContainer);
    canvasResizeObserver.observe(canvasContainer);

    let rainParticles;
    let poseController;

    // Add ambient and directional lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 7.5);
    directionalLight.castShadow = true; // Enable shadow casting on the light
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -15;
    directionalLight.shadow.camera.right = 15;
    directionalLight.shadow.camera.top = 15;
    directionalLight.shadow.camera.bottom = -15;
    directionalLight.shadow.bias = -0.0005;
    scene.add(directionalLight);

    // Initialize OrbitControls
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0.9, 0);

    // Ground plane (create first so it's available for model setup)
    const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, opacity: 0.3, transparent: true });
    const groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.receiveShadow = true;
    groundPlane.visible = false;
    scene.add(groundPlane);

    const model = new THREE.Group();
    let skeletonHelper;
    let baseModelHeight = 1.81;
    const groundingVertex = new THREE.Vector3();
    const groundingBox = new THREE.Box3();
    scene.add(model);

    const loadingStatus = document.createElement('div');
    loadingStatus.className = 'model-loading-status';
    loadingStatus.textContent = 'Loading male model…';
    canvasContainer.appendChild(loadingStatus);

    function alignModelToGround() {
        let lowestPoint = Infinity;
        model.updateMatrixWorld(true);

        model.traverse((child) => {
            if (!child.isMesh || child.userData.ignoreGrounding) {
                return;
            }

            if (child.isSkinnedMesh) {
                const positionAttribute = child.geometry.attributes.position;
                child.skeleton.update();
                for (let index = 0; index < positionAttribute.count; index += 1) {
                    groundingVertex.fromBufferAttribute(positionAttribute, index);
                    child.boneTransform(index, groundingVertex);
                    child.localToWorld(groundingVertex);
                    lowestPoint = Math.min(lowestPoint, groundingVertex.y);
                }
                return;
            }

            groundingBox.setFromObject(child);
            lowestPoint = Math.min(lowestPoint, groundingBox.min.y);
        });

        if (!Number.isFinite(lowestPoint)) {
            return;
        }

        model.position.y -= lowestPoint;
        model.updateMatrixWorld(true);
        groundPlane.position.y = 0;
    }

    const loader = new THREE.GLTFLoader();
    loader.load(
        MALE_MODEL_URL,
        (gltf) => {
            const loadedModel = gltf.scene;
            loadedModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            model.add(loadedModel);
            const initialBounds = new THREE.Box3().setFromObject(model);
            baseModelHeight = initialBounds.max.y - initialBounds.min.y;
            alignModelToGround();

            skeletonHelper = new THREE.SkeletonHelper(loadedModel);
            scene.add(skeletonHelper);

            poseController = new PoseController({
                scene,
                camera,
                renderer,
                orbitControls: controls,
                model: loadedModel,
                container: controlsContainer,
                onPoseChange: alignModelToGround
            });
            loadingStatus.remove();
        },
        undefined,
        (error) => {
            loadingStatus.textContent = 'The male model could not be loaded.';
            loadingStatus.classList.add('model-loading-status--error');
            console.error('Failed to load the Quaternius male model:', error);
        }
    );

    // Rain particle system
    function createRainParticles() {
        // Remove existing rain particles if they already exist
        if (rainParticles) {
            scene.remove(rainParticles);
        }

        const rainGeometry = new THREE.BufferGeometry();
        const rainCount = parseInt(rainDensitySlider.value);
        const positions = new Float32Array(rainCount * 3);

        for (let i = 0; i < rainCount; i++) {
            positions[i * 3] = Math.random() * 200 - 100;
            positions[i * 3 + 1] = Math.random() * 200;
            positions[i * 3 + 2] = Math.random() * 200 - 100;
        }

        rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const rainMaterial = new THREE.PointsMaterial({ color: 0xaaaaaa, size: 0.1, transparent: true });
        rainParticles = new THREE.Points(rainGeometry, rainMaterial);
        scene.add(rainParticles);
    }

    function animateRain() {
        if (rainParticles) {
            const positions = rainParticles.geometry.attributes.position.array;
            const rainCount = positions.length / 3;
            for (let i = 0; i < rainCount; i++) {
                positions[i * 3 + 1] -= 0.2;
                if (positions[i * 3 + 1] < 0) {
                    positions[i * 3 + 1] = Math.random() * 200;
                }
            }
            rainParticles.geometry.attributes.position.needsUpdate = true;
        }
    }



    // Animation loop
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();

    // Function to update model height without changing the y-position
    function updateModelHeight(newHeight) {
        const uniformScale = (newHeight / 100) / baseModelHeight;
        model.scale.setScalar(uniformScale);
        alignModelToGround();
    }



    // Organize controls by what they affect.
    const controlsContainer = document.getElementById('controlsContainer');

    const canvasControls = createControlSection(controlsContainer, 'Canvas');
    const modelControls = createControlSection(controlsContainer, 'Model');

    const cameraPresetLabel = document.createElement('label');
    cameraPresetLabel.textContent = 'Camera Views';
    canvasControls.appendChild(cameraPresetLabel);

    const cameraPresetGrid = document.createElement('div');
    cameraPresetGrid.className = 'camera-preset-grid';
    canvasControls.appendChild(cameraPresetGrid);

    const projectionCheckbox = document.createElement('input');
    projectionCheckbox.type = 'checkbox';
    const projectionLabel = document.createElement('label');
    projectionLabel.textContent = 'Orthographic View';
    appendCheckboxControl(canvasControls, projectionCheckbox, projectionLabel);

    function switchCamera(useOrthographic) {
        const previousCamera = camera;
        const nextCamera = useOrthographic ? orthographicCamera : perspectiveCamera;
        const viewDirection = previousCamera.position.clone().sub(controls.target).normalize();

        nextCamera.position.copy(previousCamera.position);
        nextCamera.quaternion.copy(previousCamera.quaternion);
        nextCamera.up.copy(previousCamera.up);

        if (useOrthographic) {
            const distance = previousCamera.position.distanceTo(controls.target);
            const visibleHeight = 2 * distance
                * Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov / 2));
            orthographicCamera.zoom = ORTHOGRAPHIC_VIEW_HEIGHT / visibleHeight;
        } else {
            const visibleHeight = ORTHOGRAPHIC_VIEW_HEIGHT / orthographicCamera.zoom;
            const distance = visibleHeight
                / (2 * Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov / 2)));
            nextCamera.position.copy(controls.target).addScaledVector(viewDirection, distance);
        }

        nextCamera.updateProjectionMatrix();
        camera = nextCamera;
        controls.object = camera;
        controls.update();
        if (poseController) {
            poseController.setCamera(camera);
        }
    }

    projectionCheckbox.addEventListener('change', () => {
        switchCamera(projectionCheckbox.checked);
    });

    new CanvasExporter({
        container: canvasControls,
        scene,
        renderer,
        getCamera: () => camera,
        getHiddenObjects: () => [
            skeletonHelper,
            ...(poseController?.getEditingHelpers() || [])
        ].filter(Boolean)
    });

    function moveCameraTo(position, target = CAMERA_TARGET) {
        gsap.killTweensOf(camera.position);
        gsap.killTweensOf(controls.target);
        gsap.to(camera.position, {
            ...position,
            duration: 0.8,
            ease: 'power2.inOut',
            onUpdate: () => controls.update()
        });
        gsap.to(controls.target, {
            ...target,
            duration: 0.8,
            ease: 'power2.inOut',
            onUpdate: () => controls.update()
        });
    }

    CAMERA_PRESETS.forEach((preset) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = preset.label;
        button.addEventListener('click', () => moveCameraTo(preset.position));
        cameraPresetGrid.appendChild(button);
    });

    // Height slider for dynamic model scaling
    const heightSliderLabel = document.createElement('label');
    heightSliderLabel.textContent = 'Height (cm):';
    modelControls.appendChild(heightSliderLabel);

    const heightSlider = document.createElement('input');
    heightSlider.type = 'range';
    heightSlider.min = 120;
    heightSlider.max = 220;
    heightSlider.value = 181;
    heightSlider.step = 1;
    heightSlider.style.width = '150px';
    modelControls.appendChild(heightSlider);

    heightSlider.addEventListener('input', () => {
        updateModelHeight(parseFloat(heightSlider.value));
    });

    // Add grid helper
    let gridHelper = new THREE.GridHelper(1000, 20);
    gridHelper.rotation.x = Math.PI / 2;
    gridHelper.visible = false;
    scene.add(gridHelper);

    // Checkbox and button for grid control
    const gridCheckbox = document.createElement('input');
    gridCheckbox.type = 'checkbox';
    const gridLabel = document.createElement('label');
    gridLabel.textContent = 'Enable Gridlines';
    appendCheckboxControl(canvasControls, gridCheckbox, gridLabel);
    gridCheckbox.addEventListener('change', () => {
        gridHelper.visible = gridCheckbox.checked;
    });

    const skeletonCheckbox = document.createElement('input');
    skeletonCheckbox.type = 'checkbox';
    skeletonCheckbox.checked = true;
    const skeletonLabel = document.createElement('label');
    skeletonLabel.textContent = 'Show Skeleton';
    appendCheckboxControl(modelControls, skeletonCheckbox, skeletonLabel);
    skeletonCheckbox.addEventListener('change', () => {
        if (skeletonHelper) {
            skeletonHelper.visible = skeletonCheckbox.checked;
        }
    });

    const rotateGridButton = document.createElement('button');
    rotateGridButton.textContent = 'Rotate Grid';
    canvasControls.appendChild(rotateGridButton);

    let gridPlane = 'xy';
    rotateGridButton.addEventListener('click', () => {
        if (gridPlane === 'xy') {
            gridHelper.rotation.set(0, Math.PI / 2, 0); // yz plane
            gridPlane = 'yz';
        } else if (gridPlane === 'yz') {
            gridHelper.rotation.set(0, 0, Math.PI / 2); // xz plane
            gridPlane = 'xz';
        } else {
            gridHelper.rotation.set(Math.PI / 2, 0, 0); // xy plane
            gridPlane = 'xy';
        }
        console.log("Grid rotated to plane:", gridPlane);
    });

    // Grid size slider
    const gridSizeSliderLabel = document.createElement('label');
    gridSizeSliderLabel.textContent = 'Grid Size:';
    canvasControls.appendChild(gridSizeSliderLabel);

    const gridSizeSlider = document.createElement('input');
    gridSizeSlider.type = 'range';
    gridSizeSlider.min = 0.1;
    gridSizeSlider.max = 3;
    gridSizeSlider.step = 0.05;
    gridSizeSlider.value = 1;
    gridSizeSlider.style.width = '150px';
    canvasControls.appendChild(gridSizeSlider);

    gridSizeSlider.addEventListener('input', () => {
        const squareSize = parseFloat(gridSizeSlider.value);
        scene.remove(gridHelper);
        gridHelper = new THREE.GridHelper(1000, Math.floor(1000 / squareSize));

        // Set the rotation based on the current plane
        if (gridPlane === 'xy') {
            gridHelper.rotation.set(Math.PI / 2, 0, 0);
        } else if (gridPlane === 'yz') {
            gridHelper.rotation.set(0, Math.PI / 2, 0);
        } else if (gridPlane === 'xz') {
            gridHelper.rotation.set(0, 0, Math.PI / 2);
        }

        gridHelper.visible = gridCheckbox.checked;
        scene.add(gridHelper);
        console.log("Grid size adjusted in plane:", gridPlane);
    });

    // Light position sliders
    const lightPositionLabel = document.createElement('label');
    lightPositionLabel.textContent = 'Adjust Light Position';
    canvasControls.appendChild(lightPositionLabel);

    function createLightSlider(labelText, min, max, initialValue, callback) {
        const label = document.createElement('label');
        label.textContent = labelText;
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = min;
        slider.max = max;
        slider.step = 0.5
        slider.value = 0;
        slider.style.width = '150px';
        slider.addEventListener('input', () => callback(parseFloat(slider.value)));
        canvasControls.appendChild(label);
        canvasControls.appendChild(slider);
    }

    createLightSlider('Light X:', -20, 20, directionalLight.position.x, (val) => directionalLight.position.x = val);
    createLightSlider('Light Y:', -20, 20, directionalLight.position.y, (val) => directionalLight.position.y = val);
    createLightSlider('Light Z:', -20, 20, directionalLight.position.z, (val) => directionalLight.position.z = val);

    // Light brightness slider
    const brightnessLabel = document.createElement('label');
    brightnessLabel.textContent = 'Light Brightness:';
    canvasControls.appendChild(brightnessLabel);

    const brightnessSlider = document.createElement('input');
    brightnessSlider.type = 'range';
    brightnessSlider.min = 0;    // Minimum brightness
    brightnessSlider.max = 2;    // Maximum brightness (feel free to adjust this range)
    brightnessSlider.step = 0.1; // Step for smoother control
    brightnessSlider.value = directionalLight.intensity; // Set default to current intensity
    brightnessSlider.style.width = '150px';
    canvasControls.appendChild(brightnessSlider);

    brightnessSlider.addEventListener('input', () => {
        directionalLight.intensity = parseFloat(brightnessSlider.value);
    });


    // Ground plane checkbox
    const groundCheckbox = document.createElement('input');
    groundCheckbox.type = 'checkbox';
    const groundLabel = document.createElement('label');
    groundLabel.textContent = 'Enable Ground Plane';
    appendCheckboxControl(canvasControls, groundCheckbox, groundLabel);
    groundCheckbox.addEventListener('change', () => {
        groundPlane.visible = groundCheckbox.checked;
    });



    const wireframeCheckbox = document.createElement('input');
    wireframeCheckbox.type = 'checkbox';
    const wireframeLabel = document.createElement('label');
    wireframeLabel.textContent = 'Wireframe Mode';
    appendCheckboxControl(modelControls, wireframeCheckbox, wireframeLabel);
    wireframeCheckbox.addEventListener('change', () => {
        model.traverse((child) => {
            if (child.isMesh) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach((material) => {
                    material.wireframe = wireframeCheckbox.checked;
                });
            }
        });
    });

    const rainDensityLabel = document.createElement('label');
    rainDensityLabel.textContent = 'Rain Density:';
    canvasControls.appendChild(rainDensityLabel);

    const rainDensitySlider = document.createElement('input');
    rainDensitySlider.type = 'range';
    rainDensitySlider.min = 0;   // Set to a minimum density of 0 (no rain)
    rainDensitySlider.max = 2000000; // Maximum density (adjust as desired)
    rainDensitySlider.value = 1000; // Default density
    rainDensitySlider.step = 50;   // Step for control precision
    rainDensitySlider.style.width = '150px';
    canvasControls.appendChild(rainDensitySlider);

    // Add event listener to recreate rain particles based on density
    rainDensitySlider.addEventListener('input', () => {
        createRainParticles();
    });

    createRainParticles(); // Initialize rain particles after setting up UI controls

    // scene.fog = new THREE.Fog(0xeeeeee, 10, 100);  // Adjust colors and distances

    // Model color picker
    const colorPickerLabel = document.createElement('label');
    colorPickerLabel.textContent = 'Model Color:';
    modelControls.appendChild(colorPickerLabel);

    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.value = '#888888'; // Default color, you can change it
    modelControls.appendChild(colorPicker);

    colorPicker.addEventListener('input', () => {
        const selectedColor = colorPicker.value;
        if (model) {
            model.traverse((child) => {
                if (child.isMesh) {
                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    materials.forEach((material) => material.color.set(selectedColor));
                }
            });
        }
    });


    // Home button
    const homeButton = document.createElement('button');
    homeButton.textContent = 'Home';
    homeButton.style.position = 'absolute';
    homeButton.style.top = '10px';
    homeButton.style.right = '10px';
    homeButton.style.padding = '8px 12px';
    homeButton.style.backgroundColor = '#4CAF50';
    canvasContainer.appendChild(homeButton);
    homeButton.addEventListener('click', () => {
        moveCameraTo(initialCameraPosition);
    });
});
