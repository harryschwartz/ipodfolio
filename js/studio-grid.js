// Studio Cyclorama Grid — seamless curved perspective grid on canvas
// Models a true 3D cyclorama surface viewed from a camera position
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
     * 3D Cyclorama: a quarter-pipe surface viewed from a camera.
     *
     * The surface is a quarter-cylinder that transitions from vertical (wall)
     * to horizontal (floor). We parameterize it in 3D:
     *   - The cyclorama cross-section is a quarter circle of radius R
     *     going from angle 0 (pointing up = wall) to PI/2 (pointing forward = floor)
     *   - u ∈ [0,1] goes across the width (left to right in world X)
     *   - v ∈ [0,1] goes along the surface from top of wall to far floor
     *
     * The wall portion extends upward from the curve, the floor extends
     * forward from the curve, and the curve itself is the quarter-circle.
     *
     * Camera sits at (0, camY, camZ) looking toward the back wall.
     */

    // --- 3D parameters ---
    const surfaceWidth = 16;        // total width of the cyclorama
    const wallHeight = 8;           // straight wall above the curve
    const curveRadius = 5;          // radius of the quarter-circle bend
    const floorDepth = 14;          // straight floor extending toward camera

    // Camera
    const camY = 3.5;              // camera height (from floor level)
    const camZ = 12;               // camera distance from the back wall
    const fov = 1.1;               // field-of-view multiplier

    // Grid density
    const UCOLS = 28;              // lines across the width
    const VROWS = 32;              // lines along the surface
    const STEPS = 120;             // smoothness per line

    // --- Surface parameterization ---
    // v ∈ [0, 1] maps to the full surface: wall → curve → floor
    // wallFraction = portion of v for the wall
    // curveFraction = portion for the quarter-circle
    // floorFraction = portion for the floor
    const totalArcLen = wallHeight + (Math.PI / 2) * curveRadius + floorDepth;
    const wallFrac = wallHeight / totalArcLen;
    const curveFrac = ((Math.PI / 2) * curveRadius) / totalArcLen;
    // floorFrac = 1 - wallFrac - curveFrac

    // Given v ∈ [0,1], return 3D point {x, y, z} on the surface at column u
    function surfacePoint(u, v) {
      const worldX = (u - 0.5) * surfaceWidth;
      let worldY, worldZ;

      if (v <= wallFrac) {
        // Straight wall: goes from top down to where the curve starts
        const t = v / wallFrac; // 0 at top, 1 at curve start
        worldY = wallHeight - t * wallHeight + curveRadius; // top of wall down to curve top
        worldZ = 0; // flat against back wall
      } else if (v <= wallFrac + curveFrac) {
        // Quarter-circle curve: from vertical to horizontal
        const t = (v - wallFrac) / curveFrac; // 0→1 through curve
        const angle = t * (Math.PI / 2); // 0 (top) to PI/2 (bottom)
        worldY = Math.cos(angle) * curveRadius;
        worldZ = Math.sin(angle) * curveRadius;
      } else {
        // Straight floor: extends from curve end toward camera
        const t = (v - wallFrac - curveFrac) / (1 - wallFrac - curveFrac);
        worldY = 0;
        worldZ = curveRadius + t * floorDepth;
      }

      return { x: worldX, y: worldY, z: worldZ };
    }

    // Project 3D → 2D screen coordinates
    function project(p3) {
      const relZ = camZ - p3.z;
      if (relZ <= 0.01) return null; // behind camera
      const scale = (fov * Math.min(W, H) * 0.5) / relZ;
      const screenX = W / 2 + p3.x * scale;
      const screenY = H * 0.42 - (p3.y - camY) * scale; // horizon at ~42%
      return { x: screenX, y: screenY };
    }

    const lineColor = 'rgba(140, 140, 140,';

    // Draw vertical lines (constant u, varying v)
    for (let col = 0; col <= UCOLS; col++) {
      const u = col / UCOLS;
      ctx.beginPath();
      let started = false;
      for (let s = 0; s <= STEPS; s++) {
        const v = s / STEPS;
        const p3 = surfacePoint(u, v);
        const p2 = project(p3);
        if (!p2) continue;
        if (!started) { ctx.moveTo(p2.x, p2.y); started = true; }
        else ctx.lineTo(p2.x, p2.y);
      }
      if (started) {
        // Fade lines near edges
        const edgeDist = Math.min(u, 1 - u);
        const alpha = Math.min(1, edgeDist * 4) * 0.35;
        ctx.strokeStyle = lineColor + alpha + ')';
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }

    // Draw horizontal lines (constant v, varying u)
    for (let row = 0; row <= VROWS; row++) {
      const v = row / VROWS;
      ctx.beginPath();
      let started = false;
      for (let s = 0; s <= STEPS; s++) {
        const u = s / STEPS;
        const p3 = surfacePoint(u, v);
        const p2 = project(p3);
        if (!p2) continue;
        if (!started) { ctx.moveTo(p2.x, p2.y); started = true; }
        else ctx.lineTo(p2.x, p2.y);
      }
      if (started) {
        // Fade lines near top and bottom
        const topFade = Math.min(v * 4, 1);
        const bottomFade = Math.min((1 - v) * 3, 1);
        const alpha = topFade * bottomFade * 0.30;
        ctx.strokeStyle = lineColor + alpha + ')';
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }

    // Soft vignette
    const vig = ctx.createRadialGradient(W / 2, H * 0.42, H * 0.2, W / 2, H * 0.42, H * 0.9);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.04)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

  draw();
  window.addEventListener('resize', draw);
})();
