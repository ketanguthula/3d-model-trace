function createFistRotations() {
    const rotations = {};
    ['l', 'r'].forEach((side) => {
        ['index', 'middle', 'ring', 'pinky'].forEach((finger) => {
            rotations[`${finger}_01_${side}`] = [70, 0, 0];
            rotations[`${finger}_02_${side}`] = [95, 0, 0];
            rotations[`${finger}_03_${side}`] = [75, 0, 0];
        });
        rotations[`thumb_01_${side}`] = [20, 0, side === 'l' ? -20 : 20];
        rotations[`thumb_02_${side}`] = [55, 0, 0];
        rotations[`thumb_03_${side}`] = [35, 0, 0];
    });
    return rotations;
}

const STANDING_ROTATIONS = {
    upperarm_l: [0, 0, -78], lowerarm_l: [5, 0, 0],
    upperarm_r: [0, 0, 78], lowerarm_r: [5, 0, 0]
};

export const POSE_PRESETS = {
    standing: { label: 'Standing', scope: 'all', rotations: STANDING_ROTATIONS },
    contrapposto: {
        label: 'Contrapposto', scope: 'all',
        rotations: {
            ...STANDING_ROTATIONS, pelvis: [0, 0, 6], spine_01: [0, 0, -4],
            spine_02: [0, 0, -2], thigh_r: [-8, 0, 2], calf_r: [18, 0, 0]
        }
    },
    sitting: {
        label: 'Sitting', scope: 'all',
        rotations: {
            upperarm_l: [10, 0, -62], lowerarm_l: [40, 0, 0],
            upperarm_r: [10, 0, 62], lowerarm_r: [40, 0, 0],
            thigh_l: [-85, 0, -4], calf_l: [85, 0, 0],
            thigh_r: [-85, 0, 4], calf_r: [85, 0, 0], spine_01: [6, 0, 0]
        }
    },
    crouching: {
        label: 'Crouching', scope: 'all',
        rotations: {
            pelvis: [5, 0, 0], spine_01: [15, 0, 0],
            upperarm_l: [25, 0, -55], lowerarm_l: [45, 0, 0],
            upperarm_r: [25, 0, 55], lowerarm_r: [45, 0, 0],
            thigh_l: [-55, 0, -6], calf_l: [105, 0, 0],
            thigh_r: [-55, 0, 6], calf_r: [105, 0, 0]
        }
    },
    fist: { label: 'Fists', scope: 'hands', rotations: createFistRotations() },
    openHands: { label: 'Open Hands', scope: 'hands', rotations: {} }
};
