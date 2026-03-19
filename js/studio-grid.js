// Studio Grid — infinite horizontal perspective grid fading to white
(function () {
  const canvas = document.getElementById('studio-grid');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clean white background
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(0, 0, W, H);

    /*
     * Flat horizontal plane with lines that individually fade
     * to transparent with distance — no overlay needed, so
     * there's never a distinct horizon line.
     */

    const surfaceWidth = 200;
    const floorDepth = 60;

    const camY = 2.8;
    const camZ = -1;
    const fov = 0.9;
    const horizonY = H * 0.32; // raised horizon

    function project(worldX, worldZ) {
      const relZ = worldZ - camZ;
      if (relZ <= 0.05) return null;
      const scale = (fov * Math.min(W, H) * 0.5) / relZ;
      const screenX = W / 2 + worldX * scale;
      const screenY = horizonY + camY * scale;
      return { x: screenX, y: screenY };
    }

    // How far a Z value is from the camera, normalized 0–1
    function distanceFactor(worldZ) {
      return Math.max(0, Math.min(1, (worldZ - 0.1) / floorDepth));
    }

    const UCOLS = 120;
    const VROWS = 80;
    const SEGMENTS = 40; // segments per depth-line for gradient effect

    // --- Depth lines (constant X, varying Z) ---
    // Draw each as many small segments so opacity can fade per-segment
    for (let col = 0; col <= UCOLS; col++) {
      const u = col / UCOLS;
      const worldX = (u - 0.5) * surfaceWidth;

      let prev = null;
      for (let s = 0; s <= SEGMENTS; s++) {
        const t = s / SEGMENTS;
        const worldZ = 0.1 + Math.pow(t, 1.5) * floorDepth;
        const p = project(worldX, worldZ);
        if (!p) { prev = null; continue; }
        if (p.x < -50 || p.x > W + 50 || p.y < -50 || p.y > H + 50) { prev = null; continue; }

        if (prev) {
          const d = distanceFactor(worldZ);
          // Fade: full opacity near camera, transparent at horizon
          const alpha = 0.30 * Math.pow(1 - d, 2.0);
          if (alpha > 0.005) {
            ctx.beginPath();
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(p.x, p.y);
            ctx.strokeStyle = `rgba(155,155,155,${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
        prev = p;
      }
    }

    // --- Cross lines (constant Z, varying X) ---
    for (let row = 0; row <= VROWS; row++) {
      const t = row / VROWS;
      const worldZ = 0.1 + Math.pow(t, 1.8) * floorDepth;

      const pLeft = project(-surfaceWidth / 2, worldZ);
      const pRight = project(surfaceWidth / 2, worldZ);
      if (!pLeft || !pRight) continue;
      if (pLeft.y < horizonY - 10) continue;
      if (pLeft.y > H + 50) continue;

      const d = distanceFactor(worldZ);
      const alpha = 0.30 * Math.pow(1 - d, 2.0);
      if (alpha < 0.005) continue;

      ctx.beginPath();
      ctx.moveTo(pLeft.x, pLeft.y);
      ctx.lineTo(pRight.x, pRight.y);
      ctx.strokeStyle = `rgba(155,155,155,${alpha})`;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }

  draw();
  window.addEventListener('resize', draw);
})();
