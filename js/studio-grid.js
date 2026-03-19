// Studio Cyclorama Grid — seamless curved perspective grid on canvas
// Camera near floor level: dense wall grid top, perspective floor bottom
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

    // Background — very light, slightly warm gray
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#f3f3f3');
    bg.addColorStop(0.35, '#efefef');
    bg.addColorStop(0.5, '#eaeaea');
    bg.addColorStop(0.6, '#e5e5e5');
    bg.addColorStop(1, '#ddd');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    /*
     * Cyclorama with camera at near-floor level.
     * Wall = massive, fills upper ~55% with dense uniform grid
     * Floor = dramatic perspective, fills lower ~45%
     * Curve = very gentle, barely noticeable transition
     */

    const surfaceWidth = 160;
    const floorDepth = 22;          // more floor so near lines are denser
    const curveRadius = 14;         // larger radius = more subtle curve
    const wallHeight = 50;

    // Camera barely above floor
    const camY = 0.5;
    const camZ = -0.5;              // closer to surface start
    const fov = 0.85;

    // Very high density
    const UCOLS = 140;
    const VROWS = 120;              // more rows for denser floor lines
    const STEPS = 80;

    const totalArcLen = floorDepth + (Math.PI / 2) * curveRadius + wallHeight;
    const floorFrac = floorDepth / totalArcLen;
    const curveFrac = ((Math.PI / 2) * curveRadius) / totalArcLen;

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

    function project(p3) {
      const relZ = p3.z - camZ;
      if (relZ <= 0.05) return null;
      const scale = (fov * Math.min(W, H) * 0.5) / relZ;
      const screenX = W / 2 + p3.x * scale;
      const screenY = H * 0.5 - (p3.y - camY) * scale;
      return { x: screenX, y: screenY };
    }

    ctx.lineWidth = 0.5;

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
        if (p2.x < -1000 || p2.x > W + 1000 || p2.y < -1000 || p2.y > H + 1000) {
          started = false;
          continue;
        }
        if (!started) { ctx.moveTo(p2.x, p2.y); started = true; }
        else ctx.lineTo(p2.x, p2.y);
        if (p2.x >= -30 && p2.x <= W + 30 && p2.y >= -30 && p2.y <= H + 30) anyVisible = true;
      }
      if (anyVisible) {
        ctx.strokeStyle = 'rgba(150,150,150,0.38)';
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
        if (p2.y < -1000 || p2.y > H + 1000) {
          started = false;
          continue;
        }
        if (!started) { ctx.moveTo(p2.x, p2.y); started = true; }
        else ctx.lineTo(p2.x, p2.y);
        if (p2.x >= -50 && p2.x <= W + 50 && p2.y >= -50 && p2.y <= H + 50) anyVisible = true;
      }
      if (anyVisible) {
        ctx.strokeStyle = 'rgba(150,150,150,0.38)';
        ctx.stroke();
      }
    }
  }

  draw();
  window.addEventListener('resize', draw);
})();
