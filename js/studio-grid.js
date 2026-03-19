// Studio Cyclorama Grid — seamless curved perspective grid on canvas
// The curve recedes away from the viewer, lines extend to fill the viewport
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

    // Background gradient — soft light gray
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#f0f0f0');
    bg.addColorStop(0.45, '#eaeaea');
    bg.addColorStop(0.55, '#e4e4e4');
    bg.addColorStop(1, '#d8d8d8');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    /*
     * 3D Cyclorama — viewer stands on the floor looking at the back wall.
     * The surface is extremely wide so grid lines fill the entire viewport
     * edge-to-edge, appearing to extend infinitely.
     *
     * Coordinate system:
     *   X = left/right
     *   Y = up (height)
     *   Z = depth (positive = away from camera, toward the back wall)
     */

    // --- 3D parameters ---
    // Make surface very wide so near-floor lines go well past viewport edges
    const surfaceWidth = 80;        // very wide so lines fill all edges
    const floorDepth = 16;          // floor extends from near camera to curve
    const curveRadius = 5;          // radius of the quarter-circle bend
    const wallHeight = 12;          // straight wall above the curve

    // Camera
    const camY = 3.0;              // camera height above floor
    const camZ = -2;               // camera slightly in front of floor start
    const fov = 1.0;               // field-of-view multiplier

    // Grid density — use enough lines to fill the wide surface
    const UCOLS = 80;              // lines across the width (more for wider surface)
    const VROWS = 40;              // lines along the surface
    const STEPS = 100;             // smoothness per line

    // --- Surface parameterization ---
    const totalArcLen = floorDepth + (Math.PI / 2) * curveRadius + wallHeight;
    const floorFrac = floorDepth / totalArcLen;
    const curveFrac = ((Math.PI / 2) * curveRadius) / totalArcLen;

    // Given v ∈ [0,1], return 3D point on the surface at column u
    function surfacePoint(u, v) {
      const worldX = (u - 0.5) * surfaceWidth;
      let worldY, worldZ;

      if (v <= floorFrac) {
        const t = v / floorFrac;
        worldY = 0;
        worldZ = t * floorDepth;
      } else if (v <= floorFrac + curveFrac) {
        const t = (v - floorFrac) / curveFrac;
        const angle = t * (Math.PI / 2);
        worldZ = floorDepth + Math.cos(angle) * curveRadius;
        worldY = Math.sin(angle) * curveRadius;
      } else {
        const t = (v - floorFrac - curveFrac) / (1 - floorFrac - curveFrac);
        worldZ = floorDepth;
        worldY = curveRadius + t * wallHeight;
      }

      return { x: worldX, y: worldY, z: worldZ };
    }

    // Project 3D → 2D screen coordinates (camera looks toward +Z)
    function project(p3) {
      const relZ = p3.z - camZ;
      if (relZ <= 0.1) return null;
      const scale = (fov * Math.min(W, H) * 0.5) / relZ;
      const screenX = W / 2 + p3.x * scale;
      const screenY = H * 0.48 - (p3.y - camY) * scale;
      return { x: screenX, y: screenY };
    }

    const lineColor = 'rgba(140, 140, 140,';
    const lineAlpha = 0.28;

    // Draw lines along the surface (constant u, varying v)
    // These run from the near floor, through the curve, up the wall
    for (let col = 0; col <= UCOLS; col++) {
      const u = col / UCOLS;
      ctx.beginPath();
      let started = false;
      let anyVisible = false;
      for (let s = 0; s <= STEPS; s++) {
        const v = s / STEPS;
        const p3 = surfacePoint(u, v);
        const p2 = project(p3);
        if (!p2) continue;
        // Only skip if way off screen (generous margin)
        if (p2.x < -500 || p2.x > W + 500 || p2.y < -500 || p2.y > H + 500) {
          started = false;
          continue;
        }
        if (!started) { ctx.moveTo(p2.x, p2.y); started = true; }
        else ctx.lineTo(p2.x, p2.y);
        // Check if any part of line is actually on screen
        if (p2.x >= 0 && p2.x <= W && p2.y >= 0 && p2.y <= H) anyVisible = true;
      }
      if (anyVisible) {
        ctx.strokeStyle = lineColor + lineAlpha + ')';
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }

    // Draw lines across the surface (constant v, varying u)
    // These are horizontal on the floor and wall, curving through the bend
    for (let row = 0; row <= VROWS; row++) {
      const v = row / VROWS;
      ctx.beginPath();
      let started = false;
      let anyVisible = false;
      for (let s = 0; s <= STEPS; s++) {
        const u = s / STEPS;
        const p3 = surfacePoint(u, v);
        const p2 = project(p3);
        if (!p2) continue;
        if (p2.y < -500 || p2.y > H + 500) {
          started = false;
          continue;
        }
        if (!started) { ctx.moveTo(p2.x, p2.y); started = true; }
        else ctx.lineTo(p2.x, p2.y);
        if (p2.x >= -50 && p2.x <= W + 50 && p2.y >= -50 && p2.y <= H + 50) anyVisible = true;
      }
      if (anyVisible) {
        ctx.strokeStyle = lineColor + lineAlpha + ')';
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }

    // Soft vignette
    const vig = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.15, W / 2, H * 0.45, H * 0.95);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.04)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

  draw();
  window.addEventListener('resize', draw);
})();
