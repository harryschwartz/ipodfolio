// Studio Cyclorama Grid — seamless curved perspective grid on canvas
// Like a sheet of paper hanging from the ceiling, curving gently onto the floor
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
     * Paper backdrop: a sheet hangs vertically from the ceiling, curves
     * gently at the bottom, and lays flat on the floor toward the viewer.
     *
     * The wall is tall and dominates. The curve is very gentle (large radius).
     * The floor extends forward from the base of the curve.
     *
     * v ∈ [0,1] traces: floor (near) → curve → wall (up to ceiling)
     */

    // --- 3D parameters ---
    const surfaceWidth = 80;
    const floorDepth = 12;          // floor extends toward camera
    const curveRadius = 14;         // LARGE radius = very gentle, subtle curve
    const wallHeight = 20;          // tall wall — paper hangs from ceiling

    // Camera — eye level, standing back from the surface
    const camY = 4.0;
    const camZ = -3;
    const fov = 1.0;

    // Grid density
    const UCOLS = 80;
    const VROWS = 48;
    const STEPS = 120;

    // --- Surface parameterization ---
    const totalArcLen = floorDepth + (Math.PI / 2) * curveRadius + wallHeight;
    const floorFrac = floorDepth / totalArcLen;
    const curveFrac = ((Math.PI / 2) * curveRadius) / totalArcLen;

    function surfacePoint(u, v) {
      const worldX = (u - 0.5) * surfaceWidth;
      let worldY, worldZ;

      if (v <= floorFrac) {
        // Floor: flat on the ground, extends toward camera
        const t = v / floorFrac;
        worldY = 0;
        worldZ = t * floorDepth;
      } else if (v <= floorFrac + curveFrac) {
        // Gentle quarter-circle curve from floor up to wall
        const t = (v - floorFrac) / curveFrac;
        const angle = t * (Math.PI / 2);
        worldZ = floorDepth + Math.cos(angle) * curveRadius;
        worldY = Math.sin(angle) * curveRadius;
      } else {
        // Wall: vertical, going straight up from top of curve
        const t = (v - floorFrac - curveFrac) / (1 - floorFrac - curveFrac);
        worldZ = floorDepth;
        worldY = curveRadius + t * wallHeight;
      }

      return { x: worldX, y: worldY, z: worldZ };
    }

    function project(p3) {
      const relZ = p3.z - camZ;
      if (relZ <= 0.1) return null;
      const scale = (fov * Math.min(W, H) * 0.5) / relZ;
      const screenX = W / 2 + p3.x * scale;
      const screenY = H * 0.50 - (p3.y - camY) * scale;
      return { x: screenX, y: screenY };
    }

    const lineColor = 'rgba(140, 140, 140,';
    const lineAlpha = 0.28;

    // Lines along the surface (constant u, varying v)
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
        if (p2.x < -500 || p2.x > W + 500 || p2.y < -500 || p2.y > H + 500) {
          started = false;
          continue;
        }
        if (!started) { ctx.moveTo(p2.x, p2.y); started = true; }
        else ctx.lineTo(p2.x, p2.y);
        if (p2.x >= 0 && p2.x <= W && p2.y >= 0 && p2.y <= H) anyVisible = true;
      }
      if (anyVisible) {
        ctx.strokeStyle = lineColor + lineAlpha + ')';
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }

    // Lines across the surface (constant v, varying u)
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
