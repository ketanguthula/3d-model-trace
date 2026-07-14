(function () {
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

    class PoseController {
        constructor({ scene, camera, renderer, orbitControls, model, container }) {
            this.scene = scene;
            this.camera = camera;
            this.renderer = renderer;
            this.orbitControls = orbitControls;
            this.model = model;
            this.container = container;
            this.bones = new Map();
            this.bindQuaternions = new Map();
            this.selectedBone = null;
            this.sliders = {};
            this.valueLabels = {};
            this.deltaEuler = new THREE.Euler(0, 0, 0, 'XYZ');
            this.deltaQuaternion = new THREE.Quaternion();
            this.inverseBindQuaternion = new THREE.Quaternion();

            this.collectBones();
            this.createPanel();
            this.createTransformControls();
            this.createJointMarker();
            this.enableJointPicking();

            if (this.boneSelect.options.length > 0) {
                this.selectBone(this.boneSelect.value);
            }
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

            const buttonRow = document.createElement('div');
            buttonRow.className = 'pose-actions';

            const resetJointButton = document.createElement('button');
            resetJointButton.type = 'button';
            resetJointButton.textContent = 'Reset Joint';
            resetJointButton.addEventListener('click', () => this.resetSelectedBone());

            const resetPoseButton = document.createElement('button');
            resetPoseButton.type = 'button';
            resetPoseButton.textContent = 'Reset Pose';
            resetPoseButton.addEventListener('click', () => this.resetPose());

            buttonRow.append(resetJointButton, resetPoseButton);
            this.panel.appendChild(buttonRow);
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
                }
            });
            this.transformControls.addEventListener('objectChange', () => {
                this.syncSlidersFromBone();
            });
            this.scene.add(this.transformControls);
        }

        createJointMarker() {
            const geometry = new THREE.SphereGeometry(0.025, 16, 12);
            const material = new THREE.MeshBasicMaterial({
                color: 0xffa726,
                depthTest: false
            });
            this.jointMarker = new THREE.Mesh(geometry, material);
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

        resetSelectedBone() {
            if (!this.selectedBone) {
                return;
            }

            this.selectedBone.quaternion.copy(this.bindQuaternions.get(this.selectedBone.name));
            this.syncSlidersFromBone();
        }

        resetPose() {
            this.bones.forEach((bone, name) => {
                bone.quaternion.copy(this.bindQuaternions.get(name));
            });
            this.syncSlidersFromBone();
        }
    }

    window.PoseController = PoseController;
})();
