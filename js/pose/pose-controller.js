import { POSE_PRESETS } from './pose-presets.js';

    const BODY_BONES = [
        'pelvis',
        'spine_01',
        'spine_02',
        'spine_03',
        'neck_01',
        'Head',
        'clavicle_l',
        'upperarm_l',
        'lowerarm_l',
        'hand_l',
        'clavicle_r',
        'upperarm_r',
        'lowerarm_r',
        'hand_r',
        'thigh_l',
        'calf_l',
        'foot_l',
        'thigh_r',
        'calf_r',
        'foot_r'
    ];

    const FINGER_BONES = [];
    ['l', 'r'].forEach((side) => {
        ['thumb', 'index', 'middle', 'ring', 'pinky'].forEach((finger) => {
            for (let joint = 1; joint <= 3; joint += 1) {
                FINGER_BONES.push(`${finger}_0${joint}_${side}`);
            }
        });
    });

    const EDITABLE_BONES = [...BODY_BONES, ...FINGER_BONES];

    const AXES = ['x', 'y', 'z'];

    function readableBoneName(name) {
        return name
            .replace(/_l$/, ' (Left)')
            .replace(/_r$/, ' (Right)')
            .replaceAll('_', ' ')
            .replace(/\b\w/g, (letter) => letter.toUpperCase());
    }

    function isFingerBone(name) {
        return /^(thumb|index|middle|ring|pinky)_0[1-3]_[lr]$/.test(name);
    }

    export class PoseController {
        constructor({ scene, camera, renderer, orbitControls, model, container, onPoseChange }) {
            this.scene = scene;
            this.camera = camera;
            this.renderer = renderer;
            this.orbitControls = orbitControls;
            this.model = model;
            this.container = container;
            this.onPoseChange = onPoseChange || (() => {});
            this.bones = new Map();
            this.bindQuaternions = new Map();
            this.selectedBone = null;
            this.sliders = {};
            this.valueLabels = {};
            this.deltaEuler = new THREE.Euler(0, 0, 0, 'XYZ');
            this.deltaQuaternion = new THREE.Quaternion();
            this.inverseBindQuaternion = new THREE.Quaternion();
            this.presetEuler = new THREE.Euler(0, 0, 0, 'XYZ');
            this.presetQuaternion = new THREE.Quaternion();
            this.poseHistory = [];
            this.historyIndex = -1;
            this.isRestoringPose = false;

            this.collectBones();
            this.createPanel();
            this.createTransformControls();
            this.createJointMarker();
            this.enableJointPicking();

            if (this.boneSelect.options.length > 0) {
                this.selectBone(this.boneSelect.value);
            }
            this.recordHistory();
        }

        collectBones() {
            this.model.traverse((child) => {
                if (child.isBone) {
                    this.bones.set(child.name, child);
                    this.bindQuaternions.set(child.name, child.quaternion.clone());
                }
            });
        }

        createPanel() {
            this.panel = document.createElement('section');
            this.panel.className = 'pose-panel';

            const heading = document.createElement('h3');
            heading.textContent = 'Pose Model';
            this.panel.appendChild(heading);

            const presetLabel = document.createElement('span');
            presetLabel.className = 'pose-subheading';
            presetLabel.textContent = 'Pose Presets';
            this.panel.appendChild(presetLabel);

            const presetGrid = document.createElement('div');
            presetGrid.className = 'pose-preset-grid';
            Object.entries(POSE_PRESETS).forEach(([name, preset]) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = preset.label;
                button.addEventListener('click', () => this.applyPreset(name));
                presetGrid.appendChild(button);
            });
            this.panel.appendChild(presetGrid);

            const selectLabel = document.createElement('label');
            selectLabel.htmlFor = 'poseBoneSelect';
            selectLabel.textContent = 'Joint';
            this.panel.appendChild(selectLabel);

            this.boneSelect = document.createElement('select');
            this.boneSelect.id = 'poseBoneSelect';
            this.addBoneOptions('Body', BODY_BONES);
            this.addBoneOptions('Left Hand', FINGER_BONES.filter((name) => name.endsWith('_l')));
            this.addBoneOptions('Right Hand', FINGER_BONES.filter((name) => name.endsWith('_r')));
            this.boneSelect.addEventListener('change', () => {
                this.selectBone(this.boneSelect.value);
            });
            this.panel.appendChild(this.boneSelect);

            const sliderGroup = document.createElement('div');
            sliderGroup.className = 'pose-sliders';
            AXES.forEach((axis) => {
                const row = document.createElement('div');
                row.className = 'pose-slider-row';

                const label = document.createElement('label');
                label.htmlFor = `pose-${axis}`;
                label.textContent = `${axis.toUpperCase()} rotation`;

                const slider = document.createElement('input');
                slider.id = `pose-${axis}`;
                slider.type = 'range';
                slider.min = -180;
                slider.max = 180;
                slider.step = 1;
                slider.value = 0;
                slider.addEventListener('input', () => this.applySliderRotation());
                slider.addEventListener('change', () => this.recordHistory());

                const value = document.createElement('output');
                value.textContent = '0°';

                this.sliders[axis] = slider;
                this.valueLabels[axis] = value;
                row.append(label, slider, value);
                sliderGroup.appendChild(row);
            });
            this.panel.appendChild(sliderGroup);

            const hint = document.createElement('p');
            hint.className = 'pose-hint';
            hint.textContent = 'Click a joint on the skeleton or choose one here, then use the colored rotation rings or sliders. Zoom in before selecting finger joints.';
            this.panel.appendChild(hint);

            const historyActions = document.createElement('div');
            historyActions.className = 'pose-actions';

            this.undoButton = document.createElement('button');
            this.undoButton.type = 'button';
            this.undoButton.textContent = 'Undo';
            this.undoButton.addEventListener('click', () => this.undo());

            this.redoButton = document.createElement('button');
            this.redoButton.type = 'button';
            this.redoButton.textContent = 'Redo';
            this.redoButton.addEventListener('click', () => this.redo());

            historyActions.append(this.undoButton, this.redoButton);
            this.panel.appendChild(historyActions);

            const resetActions = document.createElement('div');
            resetActions.className = 'pose-actions';

            const resetJointButton = document.createElement('button');
            resetJointButton.type = 'button';
            resetJointButton.textContent = 'Reset Joint';
            resetJointButton.addEventListener('click', () => this.resetSelectedBone());

            const resetPoseButton = document.createElement('button');
            resetPoseButton.type = 'button';
            resetPoseButton.textContent = 'Reset Pose';
            resetPoseButton.addEventListener('click', () => this.resetPose());

            resetActions.append(resetJointButton, resetPoseButton);
            this.panel.appendChild(resetActions);

            const mirrorActions = document.createElement('div');
            mirrorActions.className = 'pose-actions pose-actions--stacked';

            const mirrorLeftButton = document.createElement('button');
            mirrorLeftButton.type = 'button';
            mirrorLeftButton.textContent = 'Mirror Left → Right';
            mirrorLeftButton.addEventListener('click', () => this.mirrorPose('l', 'r'));

            const mirrorRightButton = document.createElement('button');
            mirrorRightButton.type = 'button';
            mirrorRightButton.textContent = 'Mirror Right → Left';
            mirrorRightButton.addEventListener('click', () => this.mirrorPose('r', 'l'));

            mirrorActions.append(mirrorLeftButton, mirrorRightButton);
            this.panel.appendChild(mirrorActions);

            const fileActions = document.createElement('div');
            fileActions.className = 'pose-actions';

            const savePoseButton = document.createElement('button');
            savePoseButton.type = 'button';
            savePoseButton.textContent = 'Save Pose';
            savePoseButton.addEventListener('click', () => this.savePose());

            const loadPoseButton = document.createElement('button');
            loadPoseButton.type = 'button';
            loadPoseButton.textContent = 'Load Pose';
            loadPoseButton.addEventListener('click', () => this.poseFileInput.click());

            this.poseFileInput = document.createElement('input');
            this.poseFileInput.type = 'file';
            this.poseFileInput.accept = 'application/json,.json';
            this.poseFileInput.hidden = true;
            this.poseFileInput.addEventListener('change', () => {
                const [file] = this.poseFileInput.files;
                if (file) {
                    this.loadPose(file);
                }
                this.poseFileInput.value = '';
            });

            fileActions.append(savePoseButton, loadPoseButton);
            this.panel.append(fileActions, this.poseFileInput);

            this.poseStatus = document.createElement('p');
            this.poseStatus.className = 'pose-status';
            this.poseStatus.setAttribute('aria-live', 'polite');
            this.panel.appendChild(this.poseStatus);
            this.container.appendChild(this.panel);
        }

        addBoneOptions(label, boneNames) {
            const group = document.createElement('optgroup');
            group.label = label;

            boneNames.forEach((name) => {
                if (!this.bones.has(name)) {
                    return;
                }

                const option = document.createElement('option');
                option.value = name;
                option.textContent = readableBoneName(name);
                group.appendChild(option);
            });

            this.boneSelect.appendChild(group);
        }

        createTransformControls() {
            this.transformControls = new THREE.TransformControls(this.camera, this.renderer.domElement);
            this.transformControls.setMode('rotate');
            this.transformControls.setSpace('local');
            this.transformControls.setSize(0.65);
            this.transformControls.addEventListener('dragging-changed', (event) => {
                this.orbitControls.enabled = !event.value;
                if (event.value) {
                    this.didDragGizmo = true;
                } else if (this.didDragGizmo) {
                    this.recordHistory();
                }
            });
            this.transformControls.addEventListener('objectChange', () => {
                this.syncSlidersFromBone();
                this.onPoseChange();
            });
            this.scene.add(this.transformControls);
        }

        setCamera(camera) {
            this.camera = camera;
            this.transformControls.camera = camera;
        }

        createJointMarker() {
            const geometry = new THREE.SphereGeometry(0.025, 16, 12);
            const material = new THREE.MeshBasicMaterial({
                color: 0xffa726,
                depthTest: false
            });
            this.jointMarker = new THREE.Mesh(geometry, material);
            this.jointMarker.userData.ignoreGrounding = true;
            this.jointMarker.renderOrder = 1000;
        }

        enableJointPicking() {
            this.pointerDownPosition = new THREE.Vector2();
            this.projectedJointPosition = new THREE.Vector3();
            this.jointWorldPosition = new THREE.Vector3();
            this.didDragGizmo = false;

            this.renderer.domElement.addEventListener('pointerdown', (event) => {
                if (event.button !== 0) {
                    return;
                }
                this.pointerDownPosition.set(event.clientX, event.clientY);
            });

            this.renderer.domElement.addEventListener('pointerup', (event) => {
                if (event.button !== 0) {
                    return;
                }

                if (this.didDragGizmo) {
                    this.didDragGizmo = false;
                    return;
                }

                const movement = this.pointerDownPosition.distanceTo(
                    new THREE.Vector2(event.clientX, event.clientY)
                );
                if (movement > 4) {
                    return;
                }

                this.pickJoint(event);
            });
        }

        pickJoint(event) {
            const bounds = this.renderer.domElement.getBoundingClientRect();
            const selectionRadius = 36;
            let closestBoneName = null;
            let closestDistance = selectionRadius;

            EDITABLE_BONES.forEach((name) => {
                const bone = this.bones.get(name);
                if (!bone) {
                    return;
                }

                bone.getWorldPosition(this.jointWorldPosition);
                this.projectedJointPosition
                    .copy(this.jointWorldPosition)
                    .project(this.camera);

                if (this.projectedJointPosition.z < -1 || this.projectedJointPosition.z > 1) {
                    return;
                }

                const screenX = bounds.left
                    + ((this.projectedJointPosition.x + 1) / 2) * bounds.width;
                const screenY = bounds.top
                    + ((1 - this.projectedJointPosition.y) / 2) * bounds.height;
                const distance = Math.hypot(event.clientX - screenX, event.clientY - screenY);

                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestBoneName = name;
                }
            });

            if (!closestBoneName) {
                return;
            }

            this.selectBone(closestBoneName);
        }

        selectBone(name) {
            const bone = this.bones.get(name);
            if (!bone) {
                return;
            }

            this.selectedBone = bone;
            this.boneSelect.value = name;
            this.transformControls.setSize(isFingerBone(name) ? 0.3 : 0.65);
            this.transformControls.attach(bone);
            bone.add(this.jointMarker);
            this.jointMarker.position.set(0, 0, 0);
            this.syncSlidersFromBone();
        }

        applySliderRotation() {
            if (!this.selectedBone) {
                return;
            }

            const x = THREE.MathUtils.degToRad(Number(this.sliders.x.value));
            const y = THREE.MathUtils.degToRad(Number(this.sliders.y.value));
            const z = THREE.MathUtils.degToRad(Number(this.sliders.z.value));
            this.deltaEuler.set(x, y, z, 'XYZ');
            this.deltaQuaternion.setFromEuler(this.deltaEuler);
            this.selectedBone.quaternion
                .copy(this.bindQuaternions.get(this.selectedBone.name))
                .multiply(this.deltaQuaternion);
            this.updateValueLabels();
            this.onPoseChange();
        }

        setBoneDelta(name, rotationDegrees) {
            const bone = this.bones.get(name);
            const bindQuaternion = this.bindQuaternions.get(name);
            if (!bone || !bindQuaternion) {
                return;
            }

            this.presetEuler.set(
                THREE.MathUtils.degToRad(rotationDegrees[0]),
                THREE.MathUtils.degToRad(rotationDegrees[1]),
                THREE.MathUtils.degToRad(rotationDegrees[2]),
                'XYZ'
            );
            this.presetQuaternion.setFromEuler(this.presetEuler);
            bone.quaternion
                .copy(bindQuaternion)
                .multiply(this.presetQuaternion)
                .normalize();
        }

        applyPreset(name) {
            const preset = POSE_PRESETS[name];
            if (!preset) {
                return;
            }

            if (preset.scope === 'all') {
                this.bones.forEach((bone, boneName) => {
                    bone.quaternion.copy(this.bindQuaternions.get(boneName));
                });
            } else if (preset.scope === 'hands') {
                FINGER_BONES.forEach((boneName) => {
                    const bone = this.bones.get(boneName);
                    if (bone) {
                        bone.quaternion.copy(this.bindQuaternions.get(boneName));
                    }
                });
            }

            Object.entries(preset.rotations).forEach(([boneName, rotation]) => {
                this.setBoneDelta(boneName, rotation);
            });

            this.syncSlidersFromBone();
            this.onPoseChange();
            this.recordHistory();
            this.setStatus(`Applied ${preset.label.toLowerCase()} preset.`);
        }

        syncSlidersFromBone() {
            if (!this.selectedBone) {
                return;
            }

            this.inverseBindQuaternion
                .copy(this.bindQuaternions.get(this.selectedBone.name))
                .invert();
            this.deltaQuaternion
                .copy(this.inverseBindQuaternion)
                .multiply(this.selectedBone.quaternion);
            this.deltaEuler.setFromQuaternion(this.deltaQuaternion, 'XYZ');

            AXES.forEach((axis) => {
                const degrees = Math.round(THREE.MathUtils.radToDeg(this.deltaEuler[axis]));
                this.sliders[axis].value = degrees;
            });
            this.updateValueLabels();
        }

        updateValueLabels() {
            AXES.forEach((axis) => {
                this.valueLabels[axis].textContent = `${this.sliders[axis].value}°`;
            });
        }

        capturePose() {
            const pose = {};
            this.bones.forEach((bone, name) => {
                pose[name] = bone.quaternion.toArray();
            });
            return pose;
        }

        applyPose(pose) {
            this.isRestoringPose = true;
            Object.entries(pose).forEach(([name, values]) => {
                const bone = this.bones.get(name);
                if (!bone || !Array.isArray(values) || values.length !== 4) {
                    return;
                }

                const quaternionValues = values.map(Number);
                if (!quaternionValues.every(Number.isFinite)) {
                    return;
                }

                bone.quaternion.fromArray(quaternionValues).normalize();
            });
            this.isRestoringPose = false;
            this.syncSlidersFromBone();
            this.onPoseChange();
        }

        recordHistory() {
            if (this.isRestoringPose) {
                return;
            }

            const snapshot = this.capturePose();
            const signature = JSON.stringify(snapshot);
            const currentEntry = this.poseHistory[this.historyIndex];
            if (currentEntry && currentEntry.signature === signature) {
                this.updateHistoryButtons();
                return;
            }

            this.poseHistory = this.poseHistory.slice(0, this.historyIndex + 1);
            this.poseHistory.push({ snapshot, signature });
            if (this.poseHistory.length > 100) {
                this.poseHistory.shift();
            }
            this.historyIndex = this.poseHistory.length - 1;
            this.updateHistoryButtons();
        }

        updateHistoryButtons() {
            this.undoButton.disabled = this.historyIndex <= 0;
            this.redoButton.disabled = this.historyIndex >= this.poseHistory.length - 1;
        }

        undo() {
            if (this.historyIndex <= 0) {
                return;
            }

            this.historyIndex -= 1;
            this.applyPose(this.poseHistory[this.historyIndex].snapshot);
            this.updateHistoryButtons();
            this.setStatus('Undid pose change.');
        }

        redo() {
            if (this.historyIndex >= this.poseHistory.length - 1) {
                return;
            }

            this.historyIndex += 1;
            this.applyPose(this.poseHistory[this.historyIndex].snapshot);
            this.updateHistoryButtons();
            this.setStatus('Redid pose change.');
        }

        savePose() {
            const poseDocument = {
                format: '3d-model-trace-pose',
                version: 1,
                model: 'quaternius-ubc-male',
                savedAt: new Date().toISOString(),
                bones: this.capturePose()
            };
            const blob = new Blob([JSON.stringify(poseDocument, null, 2)], {
                type: 'application/json'
            });
            const url = URL.createObjectURL(blob);
            const downloadLink = document.createElement('a');
            downloadLink.href = url;
            downloadLink.download = `ubc-male-pose-${new Date().toISOString().slice(0, 10)}.json`;
            downloadLink.click();
            URL.revokeObjectURL(url);
            this.setStatus('Pose saved as JSON.');
        }

        loadPose(file) {
            const reader = new FileReader();
            reader.addEventListener('load', () => {
                try {
                    const poseDocument = JSON.parse(reader.result);
                    if (
                        poseDocument.format !== '3d-model-trace-pose'
                        || poseDocument.version !== 1
                        || !poseDocument.bones
                        || typeof poseDocument.bones !== 'object'
                    ) {
                        throw new Error('Unsupported pose format');
                    }

                    this.applyPose(poseDocument.bones);
                    this.recordHistory();
                    this.setStatus(`Loaded ${file.name}.`);
                } catch (error) {
                    console.error('Could not load pose:', error);
                    this.setStatus('That file is not a valid pose.', true);
                }
            });
            reader.addEventListener('error', () => {
                this.setStatus('The pose file could not be read.', true);
            });
            reader.readAsText(file);
        }

        mirrorPose(sourceSide, targetSide) {
            const sourceSuffix = `_${sourceSide}`;
            const targetSuffix = `_${targetSide}`;
            const sourceDelta = new THREE.Quaternion();
            const mirroredDelta = new THREE.Quaternion();
            const inverseSourceBind = new THREE.Quaternion();

            this.bones.forEach((sourceBone, sourceName) => {
                if (!sourceName.endsWith(sourceSuffix)) {
                    return;
                }

                const targetName = `${sourceName.slice(0, -2)}${targetSuffix}`;
                const targetBone = this.bones.get(targetName);
                if (!targetBone) {
                    return;
                }

                inverseSourceBind.copy(this.bindQuaternions.get(sourceName)).invert();
                sourceDelta.copy(inverseSourceBind).multiply(sourceBone.quaternion);
                mirroredDelta
                    .set(sourceDelta.x, -sourceDelta.y, -sourceDelta.z, sourceDelta.w)
                    .normalize();
                targetBone.quaternion
                    .copy(this.bindQuaternions.get(targetName))
                    .multiply(mirroredDelta);
            });

            this.syncSlidersFromBone();
            this.onPoseChange();
            this.recordHistory();
            const sourceLabel = sourceSide === 'l' ? 'left' : 'right';
            const targetLabel = targetSide === 'l' ? 'left' : 'right';
            this.setStatus(`Mirrored ${sourceLabel} limbs to the ${targetLabel}.`);
        }

        setStatus(message, isError = false) {
            this.poseStatus.textContent = message;
            this.poseStatus.classList.toggle('pose-status--error', isError);
        }

        resetSelectedBone() {
            if (!this.selectedBone) {
                return;
            }

            this.selectedBone.quaternion.copy(this.bindQuaternions.get(this.selectedBone.name));
            this.syncSlidersFromBone();
            this.onPoseChange();
            this.recordHistory();
            this.setStatus('Joint reset.');
        }

        resetPose() {
            this.bones.forEach((bone, name) => {
                bone.quaternion.copy(this.bindQuaternions.get(name));
            });
            this.syncSlidersFromBone();
            this.onPoseChange();
            this.recordHistory();
            this.setStatus('Pose reset.');
        }
    }
