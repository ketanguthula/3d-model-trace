export const MALE_MODEL_URL = './assets/models/ubc/male/male.gltf';

export const INITIAL_CAMERA_POSITION = { x: 0, y: 1, z: 3.2 };
export const CAMERA_TARGET = { x: 0, y: 0.9, z: 0 };

export const CAMERA_PRESETS = [
    { label: 'Front', position: { x: 0, y: 1, z: 3.2 } },
    { label: 'Back', position: { x: 0, y: 1, z: -3.2 } },
    { label: 'Left', position: { x: -3.2, y: 1, z: 0 } },
    { label: 'Right', position: { x: 3.2, y: 1, z: 0 } },
    { label: '3/4', position: { x: 2.35, y: 1.25, z: 2.35 } },
    { label: 'Top', position: { x: 0, y: 4, z: 0.01 } }
];
