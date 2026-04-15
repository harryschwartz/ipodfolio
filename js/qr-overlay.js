// Desktop QR overlay — renders "best on mobile" screen inside the iPod display
// Uses qrcode-generator library (loaded separately as qrcode-lib.js)

(function () {
  'use strict';

  window.ipodQROverlay = {
    /**
     * Returns true if the QR "best on mobile" screen should be shown.
     * Conditions: desktop viewport (>576px), not already dismissed, not standalone PWA.
     */
    shouldShow() {
      const width = window.innerWidth;
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      console.log('[QR Overlay] shouldShow check:', {
        windowWidth: width,
        isMobile: width <= 576,
        isStandalone,
      });
      if (width <= 576) { console.log('[QR Overlay] SKIP: mobile viewport'); return false; }
      if (isStandalone) { console.log('[QR Overlay] SKIP: standalone PWA'); return false; }
      console.log('[QR Overlay] SHOW: all conditions met');
      return true;
    },

    /**
     * Renders the QR screen as a view element suitable for the iPod screen-content.
     * Returns the DOM element.
     */
    renderView() {
      const container = document.createElement('div');
      container.className = 'qr-screen-view';

      const heading = document.createElement('div');
      heading.className = 'qr-screen-heading';
      heading.textContent = 'This site is best on mobile';
      container.appendChild(heading);

      const sub = document.createElement('div');
      sub.className = 'qr-screen-sub';
      sub.textContent = 'Scan to open on your phone';
      container.appendChild(sub);

      // Generate QR code using qrcode-generator library
      const qrContainer = document.createElement('div');
      qrContainer.className = 'qr-screen-code';

      try {
        const qr = qrcode(0, 'M'); // auto-detect version, medium error correction
        qr.addData('https://ipodfolio.vercel.app/');
        qr.make();

        const moduleCount = qr.getModuleCount();
        const canvas = document.createElement('canvas');
        const cellSize = 4;
        const margin = cellSize * 2;
        const size = moduleCount * cellSize + margin * 2;
        canvas.width = size;
        canvas.height = size;
        canvas.className = 'qr-screen-canvas';

        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#000000';

        for (let row = 0; row < moduleCount; row++) {
          for (let col = 0; col < moduleCount; col++) {
            if (qr.isDark(row, col)) {
              ctx.fillRect(
                margin + col * cellSize,
                margin + row * cellSize,
                cellSize,
                cellSize
              );
            }
          }
        }

        qrContainer.appendChild(canvas);
      } catch (e) {
        console.warn('[iPodfolio] QR generation failed:', e);
      }

      container.appendChild(qrContainer);

      const hint = document.createElement('div');
      hint.className = 'qr-screen-hint';
      hint.textContent = 'Press \u25cf to continue';
      container.appendChild(hint);

      return container;
    },

    /** Mark as dismissed for this page load (no persistence). */
    dismiss() {
      // No-op — dismissal is handled by the app state (desktopQRActive flag)
    }
  };
})();
