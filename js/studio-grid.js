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

    // Solid white background
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(0, 0, W, H);

    /*
     * Flat horizontal plane — camera looks across an infinite floor.
     * Lines recede to a vanishing point and fade out with distance.
     * Above the horizon is just clean white.
     */

    const surfaceWidth = 200;
    const floorDepth = 60;

    const camY = 2.8;
    const camZ = -1;
    const fov = 0.9;
    const horizonY = H * 0.42; // horizon sits in upper portion

    const UCOLS = 120;
    const VROWS = 80;
    const STEPS = 2; // floor lines are straight, only need 2 points

    function project(worldX, worldZ) {
      const relZ = worldZ - camZ;
      if (relZ <= 0.05) return null;
      const scale = (fov * Math.min(W, H) * 0.5) / relZ;
      const screenX = W / 2 + worldX * scale;
      const screenY = horizonY + camY * scale;
      return { x: screenX, y: screenY };
    }

    // Draw lines going into the distance (constant X, varying Z)
    for (let col = 0; col <= UCOLS; col++) {
      const u = col / UCOLS;
      const worldX = (u - 0.5) * surfaceWidth;

      // Near point
      const pNear = project(worldX, 0.1);
      // Far point (converges to vanishing point)
      const pFar = project(worldX, floorDepth);
      if (!pNear || !pFar) continue;

      // Skip if entirely off screen
      if (pNear.x < -50 && pFar.x < -50) continue;
      if (pNear.x > W + 50 && pFar.x > W + 50) continue;

      ctx.beginPath();
      ctx.moveTo(pNear.x, pNear.y);
      ctx.lineTo(pFar.x, pFar.y);
      ctx.strokeStyle = 'rgba(160,160,160,0.3)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Draw horizontal cross-lines (constant Z, varying X)
    for (let row = 0; row <= VROWS; row++) {
      const t = row / VROWS;
      // Distribute Z values with more density near the camera (exponential)
      const worldZ = 0.1 + Math.pow(t, 1.8) * floorDepth;

      const pLeft = project(-surfaceWidth / 2, worldZ);
      const pRight = project(surfaceWidth / 2, worldZ);
      if (!pLeft || !pRight) continue;

      // Skip if off screen vertically
      if (pLeft.y < horizonY - 5) continue;
      if (pLeft.y > H + 50) continue;

      // Fade with distance — lines near horizon are fainter
      const distFade = 1 - Math.pow(t, 2.5);
      const alpha = 0.3 * distFade + 0.05;

      ctx.beginPath();
      ctx.moveTo(pLeft.x, pLeft.y);
      ctx.lineTo(pRight.x, pRight.y);
      ctx.strokeStyle = `rgba(160,160,160,${alpha})`;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Fade to white at the horizon — gradient overlay
    const fadeHeight = H * 0.18;
    const fade = ctx.createLinearGradient(0, horizonY - fadeHeight, 0, horizonY + fadeHeight * 0.3);
    fade.addColorStop(0, 'rgba(242,242,242,1)');
    fade.addColorStop(0.5, 'rgba(242,242,242,0.85)');
    fade.addColorStop(1, 'rgba(242,242,242,0)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, horizonY - fadeHeight, W, fadeHeight + fadeHeight * 0.3);

    // Clean white above horizon
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(0, 0, W, horizonY - fadeHeight);

    // Subtle fade at bottom edge too
    const bottomFade = ctx.createLinearGradient(0, H - 60, 0, H);
    bottomFade.addColorStop(0, 'rgba(242,242,242,0)');
    bottomFade.addColorStop(1, 'rgba(242,242,242,0.6)');
    ctx.fillStyle = bottomFade;
    ctx.fillRect(0, H - 60, W, 60);
  }

  draw();
  window.addEventListener('resize', draw);
})();
