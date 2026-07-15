export class CanvasExporter {
    constructor({ container, scene, renderer, getCamera, getHiddenObjects }) {
        this.scene = scene;
        this.renderer = renderer;
        this.getCamera = getCamera;
        this.getHiddenObjects = getHiddenObjects || (() => []);
        this.createControls(container);
    }

    createControls(container) {
        const transparentRow = document.createElement('div');
        transparentRow.className = 'checkbox-control';

        this.transparentCheckbox = document.createElement('input');
        this.transparentCheckbox.type = 'checkbox';
        this.transparentCheckbox.id = 'transparentPng';

        const transparentLabel = document.createElement('label');
        transparentLabel.htmlFor = this.transparentCheckbox.id;
        transparentLabel.textContent = 'Transparent PNG Background';
        transparentRow.append(this.transparentCheckbox, transparentLabel);

        this.exportButton = document.createElement('button');
        this.exportButton.type = 'button';
        this.exportButton.textContent = 'Download PNG';
        this.exportButton.addEventListener('click', () => this.download());

        this.status = document.createElement('p');
        this.status.className = 'export-status';
        this.status.setAttribute('aria-live', 'polite');

        container.append(transparentRow, this.exportButton, this.status);
    }

    download() {
        const originalBackground = this.scene.background;
        const originalClearAlpha = this.renderer.getClearAlpha();
        const originalRenderTarget = this.renderer.getRenderTarget();
        const detachedObjects = this.getHiddenObjects()
            .filter((object) => object.parent)
            .map((object) => ({ object, parent: object.parent }));
        let exportTarget;
        this.exportButton.disabled = true;
        this.status.textContent = 'Preparing PNG…';

        try {
            detachedObjects.forEach(({ object, parent }) => {
                parent.remove(object);
            });

            if (this.transparentCheckbox.checked) {
                this.scene.background = null;
                this.renderer.setClearAlpha(0);
            }

            const width = this.renderer.domElement.width;
            const height = this.renderer.domElement.height;
            exportTarget = new THREE.WebGLRenderTarget(width, height, {
                format: THREE.RGBAFormat,
                type: THREE.UnsignedByteType,
                depthBuffer: true,
                stencilBuffer: false
            });

            this.renderer.setRenderTarget(exportTarget);
            this.renderer.clear(true, true, true);
            this.renderer.render(this.scene, this.getCamera());
            const pixels = new Uint8Array(width * height * 4);
            this.renderer.readRenderTargetPixels(exportTarget, 0, 0, width, height, pixels);
            const flippedPixels = new Uint8ClampedArray(pixels.length);
            const rowLength = width * 4;
            for (let row = 0; row < height; row += 1) {
                const sourceStart = (height - row - 1) * rowLength;
                const targetStart = row * rowLength;
                flippedPixels.set(
                    pixels.subarray(sourceStart, sourceStart + rowLength),
                    targetStart
                );
            }

            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = width;
            exportCanvas.height = height;
            const exportContext = exportCanvas.getContext('2d');
            exportContext.putImageData(new ImageData(flippedPixels, width, height), 0, 0);
            const pngUrl = exportCanvas.toDataURL('image/png');

            const downloadLink = document.createElement('a');
            const timestamp = new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z');
            downloadLink.href = pngUrl;
            downloadLink.download = `3d-model-reference-${timestamp}.png`;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            downloadLink.remove();
            this.status.textContent = 'PNG downloaded.';
        } catch (error) {
            console.error('Could not export the canvas:', error);
            this.status.textContent = 'The PNG could not be created.';
        } finally {
            this.scene.background = originalBackground;
            this.renderer.setClearAlpha(originalClearAlpha);
            this.renderer.setRenderTarget(originalRenderTarget);
            if (exportTarget) {
                exportTarget.dispose();
            }
            detachedObjects.forEach(({ object, parent }) => {
                parent.add(object);
            });
            this.scene.updateMatrixWorld(true);
            this.renderer.render(this.scene, this.getCamera());
            this.exportButton.disabled = false;
        }
    }
}
