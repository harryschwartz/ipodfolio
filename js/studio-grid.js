// Studio Cyclorama Grid — seamless curved perspective grid on canvas
// The curve recedes away from the viewer, like standing in a photo studio
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
     *
     * Coordinate system:
     *   X = left/right
     *   Y = up (height)
     *   Z = depth (positive = away from camera, toward the back wall)
     *
     * Surface layout (v goes from 0 at near floor to 1 at top of wall):
     *   v ∈ [0, floorFrac]          → floor: Y=0, Z increases from near to curve start
     *   v ∈ [floorFrac, floorFrac+curveFrac] → quarter-circle curve from floor to wall
     *   v ∈ [floorFrac+curveFrac, 1] → wall: Z=maxZ, Y increases upward
     *
     * Camera is at (0, camY, 0) looking toward +Z.
     */

    // --- 3D parameters ---
    const surfaceWidth = 18;        // total width of the cyclorama
    const floorDepth = 14;          // floor extends from near camera to curve
    const curveRadius = 5;          // radius of the quarter-circle bend
    const wallHeight = 10;          // straight wall above the curve

    // Camera
    const camY = 3.0;              // camera height above floor
    const camZ = -2;               // camera slightly in front of floor start
    const fov = 1.0;               // field-of-view multiplier

    // Grid density
    const UCOLS = 30;              // lines across the width
    const VROWS = 36;              // lines along the surface
    const STEPS = 120;             // smoothness per line

    // --- Surface parameterization ---
    const totalArcLen = floorDepth + (Math.PI / 2) * curveRadius + wallHeight;
    const floorFrac = floorDepth / totalArcLen;
    const curveFrac = ((Math.PI / 2) * curveRadius) / totalArcLen;
    // wallFrac = 1 - floorFrac - curveFrac

    // The back wall sits at Z = floorDepth + curveRadius
    const backWallZ = floorDepth + curveRadius;

    // Given v ∈ [0,1], return 3D point on the surface at column u
    function surfacePoint(u, v) {
      const worldX = (u - 0.5) * surfaceWidth;
      let worldY, worldZ;

      if (v <= floorFrac) {
        // Floor: Y=0, Z goes from 0 to floorDepth
        const t = v / floorFrac;
        worldY = 0;
        worldZ = t * floorDepth;
      } else if (v <= floorFrac + curveFrac) {
        // Quarter-circle: transitions from horizontal floor to vertical wall
        const t = (v - floorFrac) / curveFrac; // 0→1 through curve
        const angle = t * (Math.PI / 2); // 0 = horizontal, PI/2 = vertical
        // At t=0: Y=0, Z=floorDepth+R (tangent to floor)
        // At t=1: Y=R, Z=floorDepth+R (tangent to wall, going up)
        // Circle center is at (Y=0, Z=floorDepth) — no wait, let me think...
        // The curve center is at Y=0, Z=floorDepth. Radius goes from
        // center+(0,R) at angle=0 to center+(R,0) at angle=PI/2.
        // Actually: at angle=0, point is at Z=floorDepth+R, Y=0 (floor end)
        //           at angle=PI/2, point is at Z=floorDepth, Y=R (wall start)
        worldZ = floorDepth + Math.cos(angle) * curveRadius;
        worldY = Math.sin(angle) * curveRadius;
      } else {
        // Wall: Z=floorDepth (flat against back), Y goes from R upward
        const t = (v - floorFrac - curveFrac) / (1 - floorFrac - curveFrac);
        worldZ = floorDepth;
        worldY = curveRadius + t * wallHeight;
      }

      return { x: worldX, y: worldY, z: worldZ };
    }

    // Project 3D → 2D screen coordinates (camera looks toward +Z)
    function project(p3) {
      const relZ = p3.z - camZ;
      if (relZ <= 0.1) return null; // behind camera
      const scale = (fov * Math.min(W, H) * 0.5) / relZ;
      const screenX = W / 2 + p3.x * scale;
      const screenY = H * 0.48 - (p3.y - camY) * scale;
      return { x: screenX, y: screenY };
    }

    const lineColor = 'rgba(140, 140, 140,';

    // Draw lines along the surface (constant u, varying v) — these run
    // from the near floor, through the curve, up the wall
    for (let col = 0; col <= UCOLS; col++) {
      const u = col / UCOLS;
      ctx.beginPath();
      let started = false;
      for (let s = 0; s <= STEPS; s++) {
        const v = s / STEPS;
        const p3 = surfacePoint(u, v);
        const p2 = project(p3);
        if (!p2) continue;
        // Clip to viewport with margin
        if (p2.y < -100 || p2.y > H + 100) continue;
        if (!started) { ctx.moveTo(p2.x, p2.y); started = true; }
        else ctx.lineTo(p2.x, p2.y);
      }
      if (started) {
        const edgeDist = Math.min(u, 1 - u);
        const alpha = Math.min(1, edgeDist * 4) * 0.30;
        ctx.strokeStyle = lineColor + alpha + ')';
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }

    // Draw lines across the surface (constant v, varying u) — these are
    // horizontal on the floor and wall, curving through the bend
    for (let row = 0; row <= VROWS; row++) {
      const v = row / VROWS;
      ctx.beginPath();
      let started = false;
      for (let s = 0; s <= STEPS; s++) {
        const u = s / STEPS;
        const p3 = surfacePoint(u, v);
        const p2 = project(p3);
        if (!p2) continue;
        if (p2.y < -100 || p2.y > H + 100) continue;
        if (!started) { ctx.moveTo(p2.x, p2.y); started = true; }
        else ctx.lineTo(p2.x, p2.y);
      }
      if (started) {
        const topFade = Math.min(v * 3, 1);
        const bottomFade = Math.min((1 - v) * 4, 1);
        const alpha = topFade * bottomFade * 0.28;
        ctx.strokeStyle = lineColor + alpha + ')';
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
