// Parachute Game — classic iPod Parachute port
// Canvas-based shooting game controlled by click wheel

const PC_BASE = { WIDTH: 340, HEIGHT: 260 };

const PC = {
  TURRET: {
    BASE_W: 28, BASE_H: 14,
    BARREL_LEN: 22, BARREL_W: 6,
    ANGLE_MIN: -Math.PI * 0.85,   // left limit (from vertical)
    ANGLE_MAX: Math.PI * 0.85,    // right limit
    ANGLE_STEP: 0.08,             // radians per scroll tick
    INITIAL_ANGLE: -Math.PI / 2, // straight up
  },
  BULLET: {
    RADIUS: 3, SPEED: 5,
    COLOR: '#ffe066',
    MAX: 6,
  },
  HELICOPTER: {
    WIDTH: 52, HEIGHT: 20,
    SPEED_INITIAL: 0.9,
    SPEED_INCREMENT: 0.15,
    Y_OFFSET: 22,         // from top
    DROP_INTERVAL_INITIAL: 160, // frames between drops
    DROP_INTERVAL_MIN: 60,
  },
  PARATROOPER: {
    WIDTH: 10, HEIGHT: 14,
    CHUTE_RADIUS: 14,
    FALL_SPEED: 0.55,
    FALL_SPEED_FAST: 2.8, // after chute shot
    MAX_LANDED: 5,
    SCORE_CHUTE: 10,      // chute popped (falling)
    SCORE_HELI: 50,       // helicopter hit
  },
  EXPLOSION: {
    DURATION: 30,         // frames
    RADIUS_MAX: 22,
  },
  GROUND: {
    HEIGHT: 12,
    COLOR_TOP: '#4c8c2e',
    COLOR_BOT: '#2a5416',
  },
  SKY: {
    TOP: '#4db8f0',
    BOT: '#a8dff7',
  },
};

// ─── Utility ──────────────────────────────────────────────────────────────────

function lerpColor(a, b, t) {
  const ar = parseInt(a.slice(1,3),16), ag = parseInt(a.slice(3,5),16), ab = parseInt(a.slice(5,7),16);
  const br = parseInt(b.slice(1,3),16), bg = parseInt(b.slice(3,5),16), bb = parseInt(b.slice(5,7),16);
  const r = Math.round(ar + (br-ar)*t);
  const g = Math.round(ag + (bg-ag)*t);
  const blue = Math.round(ab + (bb-ab)*t);
  return `rgb(${r},${g},${blue})`;
}

// ─── ParachuteGame class ───────────────────────────────────────────────────────

class ParachuteGame {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.cw = 0;
    this.ch = 0;
    this.scale = 1;
    this.animId = null;
    this.listeners = [];
    this.hudEl = null;
    this.hudRightEl = null;

    // State
    this.state = 'start';  // 'start' | 'playing' | 'gameover'
    this.score = 0;
    this.landed = 0;       // paratroopers that reached ground
    this.wave = 0;

    // Game objects
    this.turretAngle = PC.TURRET.INITIAL_ANGLE;
    this.bullets = [];
    this.heli = null;
    this.paratroopers = [];
    this.explosions = [];

    // Helicopter state
    this.heliDropTimer = 0;
    this.heliDropInterval = PC.HELICOPTER.DROP_INTERVAL_INITIAL;
    this.heliSpeed = PC.HELICOPTER.SPEED_INITIAL;

    // Rotor animation
    this.rotorAngle = 0;

    // Frame counter
    this.frame = 0;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  init(canvasEl, hudEl, hudRightEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.hudEl = hudEl;
    this.hudRightEl = hudRightEl;

    const parent = canvasEl.parentElement;
    this.cw = canvasEl.width = parent.clientWidth;
    this.ch = canvasEl.height = parent.clientHeight;
    this.scale = this.cw / PC_BASE.WIDTH;

    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';

    this._resetGame();
    this.state = 'start';

    // Event listeners
    const onCenter = () => this._handleCenter();
    const onFwd    = () => this._handleFwd();
    const onBwd    = () => this._handleBwd();
    const onMenu   = () => {};  // menu handled by parent

    window.addEventListener('centerclick', onCenter);
    window.addEventListener('forwardscroll', onFwd, true);
    window.addEventListener('backwardscroll', onBwd, true);
    window.addEventListener('menuclick', onMenu);

    this.listeners = [
      ['centerclick', onCenter],
      ['forwardscroll', onFwd],
      ['backwardscroll', onBwd],
      ['menuclick', onMenu],
    ];

    this._loop();
  }

  cleanup() {
    if (this.animId) cancelAnimationFrame(this.animId);
    this.animId = null;
    this.listeners.forEach(([evt, fn]) => window.removeEventListener(evt, fn, true));
    this.listeners = [];
  }

  // ── Input Handlers ──────────────────────────────────────────────────────────

  _handleCenter() {
    if (this.state === 'start' || this.state === 'gameover') {
      this._resetGame();
      this.state = 'playing';
    } else if (this.state === 'playing') {
      this._fire();
    }
  }

  _handleFwd() {
    // Forward scroll → rotate turret clockwise (right)
    if (this.state !== 'playing') return;
    this.turretAngle = Math.min(PC.TURRET.ANGLE_MAX, this.turretAngle + PC.TURRET.ANGLE_STEP);
  }

  _handleBwd() {
    // Backward scroll → rotate turret counter-clockwise (left)
    if (this.state !== 'playing') return;
    this.turretAngle = Math.max(PC.TURRET.ANGLE_MIN, this.turretAngle - PC.TURRET.ANGLE_STEP);
  }

  // ── Game Logic ──────────────────────────────────────────────────────────────

  _resetGame() {
    this.score = 0;
    this.landed = 0;
    this.wave = 1;
    this.turretAngle = PC.TURRET.INITIAL_ANGLE;
    this.bullets = [];
    this.paratroopers = [];
    this.explosions = [];
    this.heliDropTimer = 0;
    this.heliDropInterval = PC.HELICOPTER.DROP_INTERVAL_INITIAL;
    this.heliSpeed = PC.HELICOPTER.SPEED_INITIAL;
    this.rotorAngle = 0;
    this.frame = 0;
    this._spawnHeli();
  }

  _spawnHeli() {
    const s = this.scale;
    const hw = PC.HELICOPTER.WIDTH * s;
    const y = PC.HELICOPTER.Y_OFFSET * s;
    // Start from left or right randomly
    const fromLeft = Math.random() > 0.5;
    this.heli = {
      x: fromLeft ? -hw : this.cw + hw,
      y,
      w: hw,
      h: PC.HELICOPTER.HEIGHT * s,
      dir: fromLeft ? 1 : -1,
      alive: true,
    };
    this.heliDropTimer = Math.floor(this.heliDropInterval * 0.5);
  }

  _fire() {
    if (this.bullets.length >= PC.BULLET.MAX) return;
    const s = this.scale;
    const tx = this.cw / 2;
    const groundY = this.ch - PC.GROUND.HEIGHT * s;
    const ty = groundY - PC.TURRET.BASE_H * s;

    // Bullet starts at barrel tip
    const barrelLen = PC.TURRET.BARREL_LEN * s;
    const bx = tx + Math.cos(this.turretAngle) * barrelLen;
    const by = ty + Math.sin(this.turretAngle) * barrelLen;

    const speed = PC.BULLET.SPEED * s;
    this.bullets.push({
      x: bx, y: by,
      vx: Math.cos(this.turretAngle) * speed,
      vy: Math.sin(this.turretAngle) * speed,
    });
  }

  _update() {
    if (this.state !== 'playing') return;
    this.frame++;
    const s = this.scale;

    // Ground Y
    const groundY = this.ch - PC.GROUND.HEIGHT * s;

    // ─ Helicopter ─
    if (this.heli) {
      if (this.heli.alive) {
        this.heli.x += this.heli.dir * this.heliSpeed * s;

        // Drop paratroopers
        this.heliDropTimer++;
        if (this.heliDropTimer >= this.heliDropInterval) {
          this.heliDropTimer = 0;
          this._dropParatrooper();
        }

        // Wrap: if heli crosses screen, new wave
        const hw = this.heli.w;
        if ((this.heli.dir > 0 && this.heli.x > this.cw + hw) ||
            (this.heli.dir < 0 && this.heli.x < -hw)) {
          this._nextWave();
        }
      }
    }

    // ─ Rotor animation ─
    this.rotorAngle += 0.25;

    // ─ Bullets ─
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx;
      b.y += b.vy;

      // Out of bounds
      if (b.x < 0 || b.x > this.cw || b.y < 0 || b.y > this.ch) {
        this.bullets.splice(i, 1);
        continue;
      }

      let removed = false;

      // ─ Check bullet vs helicopter ─
      if (this.heli && this.heli.alive) {
        const hw = this.heli.w / 2;
        const hh = this.heli.h;
        if (b.x >= this.heli.x - hw && b.x <= this.heli.x + hw &&
            b.y >= this.heli.y && b.y <= this.heli.y + hh) {
          this._explode(this.heli.x, this.heli.y + hh / 2, 'heli');
          this.heli.alive = false;
          this.score += PC.PARATROOPER.SCORE_HELI;
          this.bullets.splice(i, 1);
          removed = true;
          // Respawn heli after short delay via frame counting
          setTimeout(() => {
            if (this.state === 'playing') this._spawnHeli();
          }, 1200);
        }
      }

      if (removed) continue;

      // ─ Check bullet vs paratroopers ─
      for (let j = this.paratroopers.length - 1; j >= 0; j--) {
        const p = this.paratroopers[j];

        if (p.chutePopped) {
          // Hit the falling body
          const bw = PC.PARATROOPER.WIDTH * s;
          const bh = PC.PARATROOPER.HEIGHT * s;
          if (b.x >= p.x - bw/2 && b.x <= p.x + bw/2 &&
              b.y >= p.y && b.y <= p.y + bh) {
            this._explode(p.x, p.y + bh/2, 'para');
            this.paratroopers.splice(j, 1);
            this.score += Math.floor(PC.PARATROOPER.SCORE_CHUTE / 2);
            this.bullets.splice(i, 1);
            removed = true;
            break;
          }
        } else {
          // Hit the parachute dome
          const cr = PC.PARATROOPER.CHUTE_RADIUS * s;
          const dx = b.x - p.x;
          const dy = b.y - (p.y - cr);
          if (dx*dx + dy*dy <= cr*cr) {
            p.chutePopped = true;
            this.score += PC.PARATROOPER.SCORE_CHUTE;
            this.bullets.splice(i, 1);
            removed = true;
            break;
          }
        }
        if (removed) break;
      }
    }

    // ─ Paratroopers ─
    for (let i = this.paratroopers.length - 1; i >= 0; i--) {
      const p = this.paratroopers[i];
      const fallSpeed = p.chutePopped
        ? PC.PARATROOPER.FALL_SPEED_FAST * s
        : PC.PARATROOPER.FALL_SPEED * s;
      p.y += fallSpeed;

      const bh = PC.PARATROOPER.HEIGHT * s;
      if (p.y + bh >= groundY) {
        // Landed
        this.paratroopers.splice(i, 1);
        if (!p.chutePopped) {
          // Safe landing
          this.landed++;
          if (this.landed >= PC.PARATROOPER.MAX_LANDED) {
            this.state = 'gameover';
          }
        } else {
          // Fell without chute — splat (no penalty, already scored on chute pop)
          this._explode(p.x, groundY - bh / 2, 'splat');
        }
      }
    }

    // ─ Explosions ─
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      this.explosions[i].frame++;
      if (this.explosions[i].frame >= PC.EXPLOSION.DURATION) {
        this.explosions.splice(i, 1);
      }
    }

    this._updateHUD();
  }

  _nextWave() {
    this.wave++;
    this.heliSpeed = Math.min(
      PC.HELICOPTER.SPEED_INITIAL + (this.wave - 1) * PC.HELICOPTER.SPEED_INCREMENT,
      4.0
    );
    this.heliDropInterval = Math.max(
      PC.HELICOPTER.DROP_INTERVAL_INITIAL - (this.wave - 1) * 20,
      PC.HELICOPTER.DROP_INTERVAL_MIN
    );
    this._spawnHeli();
  }

  _dropParatrooper() {
    if (!this.heli || !this.heli.alive) return;
    const s = this.scale;
    this.paratroopers.push({
      x: this.heli.x,
      y: this.heli.y + this.heli.h,
      chutePopped: false,
    });
  }

  _explode(x, y, type) {
    this.explosions.push({ x, y, frame: 0, type });
  }

  _updateHUD() {
    if (this.hudEl)      this.hudEl.textContent = `Score: ${this.score}`;
    if (this.hudRightEl) this.hudRightEl.textContent = `Landed: ${this.landed}/${PC.PARATROOPER.MAX_LANDED}`;
  }

  // ── Draw ────────────────────────────────────────────────────────────────────

  _draw() {
    const ctx = this.ctx;
    const s = this.scale;
    const cw = this.cw, ch = this.ch;

    // Sky background
    const skyGrad = ctx.createLinearGradient(0, 0, 0, ch);
    skyGrad.addColorStop(0, PC.SKY.TOP);
    skyGrad.addColorStop(1, PC.SKY.BOT);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, cw, ch);

    // Ground
    const groundY = ch - PC.GROUND.HEIGHT * s;
    const groundGrad = ctx.createLinearGradient(0, groundY, 0, ch);
    groundGrad.addColorStop(0, PC.GROUND.COLOR_TOP);
    groundGrad.addColorStop(1, PC.GROUND.COLOR_BOT);
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, groundY, cw, ch - groundY);

    // Ground highlight line
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(0, groundY, cw, 1.5 * s);

    if (this.state === 'start') {
      this._drawStartScreen();
      return;
    }

    if (this.state === 'gameover') {
      this._drawTurret(groundY);
      this._drawGameOverScreen();
      return;
    }

    // ─ Playing ─
    this._drawHeli();
    this._drawParatroopers();
    this._drawBullets();
    this._drawExplosions();
    this._drawTurret(groundY);

    // Wave indicator (subtle)
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.font = `${Math.round(7 * s)}px "Chicago", "Helvetica Neue", sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(`Wave ${this.wave}`, cw - 4 * s, 9 * s);
  }

  _drawStartScreen() {
    const ctx = this.ctx;
    const s = this.scale;
    const cw = this.cw, ch = this.ch;

    // Draw a static turret for atmosphere
    this._drawTurret(ch - PC.GROUND.HEIGHT * s);

    // Overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.beginPath();
    const pw = 160 * s, ph = 68 * s;
    const px = (cw - pw) / 2, py = (ch - ph) / 2 - 10 * s;
    this._roundRect(ctx, px, py, pw, ph, 8 * s);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = `bold ${Math.round(13 * s)}px "Chicago", "Helvetica Neue", sans-serif`;
    ctx.fillText('PARACHUTE', cw / 2, py + 24 * s);

    ctx.font = `${Math.round(9 * s)}px "Chicago", "Helvetica Neue", sans-serif`;
    ctx.fillStyle = '#ffe066';
    ctx.fillText('Press center to start', cw / 2, py + 42 * s);

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `${Math.round(7.5 * s)}px "Chicago", "Helvetica Neue", sans-serif`;
    ctx.fillText('Scroll = aim  •  Center = fire', cw / 2, py + 60 * s);
  }

  _drawGameOverScreen() {
    const ctx = this.ctx;
    const s = this.scale;
    const cw = this.cw, ch = this.ch;

    // Overlay panel
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    const pw = 170 * s, ph = 76 * s;
    const px = (cw - pw) / 2, py = (ch - ph) / 2 - 8 * s;
    ctx.beginPath();
    this._roundRect(ctx, px, py, pw, ph, 8 * s);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff4444';
    ctx.font = `bold ${Math.round(14 * s)}px "Chicago", "Helvetica Neue", sans-serif`;
    ctx.fillText('GAME OVER', cw / 2, py + 22 * s);

    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.round(9.5 * s)}px "Chicago", "Helvetica Neue", sans-serif`;
    ctx.fillText(`Score: ${this.score}`, cw / 2, py + 42 * s);

    ctx.fillStyle = '#ffe066';
    ctx.font = `${Math.round(8 * s)}px "Chicago", "Helvetica Neue", sans-serif`;
    ctx.fillText('Press center to play again', cw / 2, py + 62 * s);
  }

  _drawHeli() {
    if (!this.heli || !this.heli.alive) return;
    const ctx = this.ctx;
    const s = this.scale;
    const { x, y, w, h, dir } = this.heli;

    ctx.save();
    ctx.translate(x, y);

    // Body — main fuselage
    ctx.fillStyle = '#556677';
    ctx.beginPath();
    this._roundRect(ctx, -w * 0.38, 0, w * 0.76, h * 0.6, 3 * s);
    ctx.fill();

    // Cockpit bubble
    const cockpitGrad = ctx.createRadialGradient(-w*0.05, h*0.1, 1, -w*0.05, h*0.15, w*0.22);
    cockpitGrad.addColorStop(0, 'rgba(180,230,255,0.9)');
    cockpitGrad.addColorStop(1, 'rgba(80,140,200,0.7)');
    ctx.fillStyle = cockpitGrad;
    ctx.beginPath();
    ctx.ellipse(-w * 0.05, h * 0.28, w * 0.22, h * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 0.8 * s;
    ctx.stroke();

    // Tail boom
    ctx.fillStyle = '#445566';
    ctx.fillRect(w * 0.32, h * 0.1, w * 0.38, h * 0.28);

    // Tail fin
    ctx.beginPath();
    ctx.moveTo(w * 0.62, h * 0.1);
    ctx.lineTo(w * 0.7, -h * 0.3);
    ctx.lineTo(w * 0.7, h * 0.1);
    ctx.fillStyle = '#445566';
    ctx.fill();

    // Landing skids
    ctx.strokeStyle = '#778899';
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.moveTo(-w * 0.32, h * 0.6);
    ctx.lineTo(-w * 0.32, h * 0.82);
    ctx.moveTo(w * 0.28, h * 0.6);
    ctx.lineTo(w * 0.28, h * 0.82);
    ctx.moveTo(-w * 0.42, h * 0.82);
    ctx.lineTo(w * 0.38, h * 0.82);
    ctx.stroke();

    // Main rotor (spinning line)
    const rotLen = w * 0.62;
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(Math.cos(this.rotorAngle) * -rotLen, -2 * s);
    ctx.lineTo(Math.cos(this.rotorAngle) * rotLen, -2 * s);
    ctx.stroke();

    // Rotor center nub
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(0, -2 * s, 2.5 * s, 0, Math.PI * 2);
    ctx.fill();

    // Tail rotor
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1.5 * s;
    const trLen = h * 0.22;
    ctx.beginPath();
    ctx.moveTo(w * 0.68, h * 0.1 - Math.cos(this.rotorAngle * 1.5) * trLen);
    ctx.lineTo(w * 0.68, h * 0.1 + Math.cos(this.rotorAngle * 1.5) * trLen);
    ctx.stroke();

    // Direction light
    const lightX = dir > 0 ? -w * 0.38 : w * 0.38;
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.arc(lightX, h * 0.3, 2 * s, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawParatroopers() {
    this.paratroopers.forEach(p => this._drawParatrooper(p));
  }

  _drawParatrooper(p) {
    const ctx = this.ctx;
    const s = this.scale;
    const cr = PC.PARATROOPER.CHUTE_RADIUS * s;
    const bw = PC.PARATROOPER.WIDTH * s;
    const bh = PC.PARATROOPER.HEIGHT * s;

    ctx.save();
    ctx.translate(p.x, p.y);

    if (!p.chutePopped) {
      // Parachute dome
      const chuteGrad = ctx.createRadialGradient(-cr*0.2, -cr*0.6, 0, 0, -cr*0.3, cr);
      chuteGrad.addColorStop(0, '#ffffff');
      chuteGrad.addColorStop(0.4, '#e0e8ff');
      chuteGrad.addColorStop(1, '#8888cc');
      ctx.fillStyle = chuteGrad;
      ctx.beginPath();
      ctx.arc(0, -cr, cr, Math.PI, 0);
      ctx.fill();

      // Dome outline
      ctx.strokeStyle = 'rgba(80,80,140,0.5)';
      ctx.lineWidth = 0.8 * s;
      ctx.beginPath();
      ctx.arc(0, -cr, cr, Math.PI, 0);
      ctx.stroke();

      // Panel lines on chute
      ctx.strokeStyle = 'rgba(100,100,180,0.3)';
      ctx.lineWidth = 0.6 * s;
      for (let i = 1; i < 4; i++) {
        const seg = (Math.PI / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, -cr);
        ctx.lineTo(Math.cos(Math.PI - seg) * cr, -cr + Math.sin(Math.PI - seg) * cr);
        ctx.stroke();
      }

      // Suspension lines
      ctx.strokeStyle = 'rgba(60,60,60,0.5)';
      ctx.lineWidth = 0.7 * s;
      // Left line
      ctx.beginPath();
      ctx.moveTo(-cr, -cr);
      ctx.lineTo(-bw * 0.35, 0);
      ctx.stroke();
      // Right line
      ctx.beginPath();
      ctx.moveTo(cr, -cr);
      ctx.lineTo(bw * 0.35, 0);
      ctx.stroke();
      // Center line
      ctx.beginPath();
      ctx.moveTo(0, -cr * 0.15);
      ctx.lineTo(0, 0);
      ctx.stroke();
    }

    // Body (stick figure)
    // Head
    ctx.fillStyle = '#f5d0a0';
    ctx.strokeStyle = '#885522';
    ctx.lineWidth = 0.8 * s;
    ctx.beginPath();
    ctx.arc(0, bh * 0.12, bw * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Torso
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1.4 * s;
    ctx.beginPath();
    ctx.moveTo(0, bh * 0.26);
    ctx.lineTo(0, bh * 0.65);
    ctx.stroke();

    // Arms
    ctx.beginPath();
    ctx.moveTo(-bw * 0.38, bh * 0.38);
    ctx.lineTo(bw * 0.38, bh * 0.38);
    ctx.stroke();

    // Legs (animated slight swing when floating)
    const swing = p.chutePopped ? 0 : Math.sin(Date.now() / 300) * 0.12;
    ctx.lineWidth = 1.2 * s;
    ctx.beginPath();
    ctx.moveTo(0, bh * 0.65);
    ctx.lineTo(-bw * (0.3 + swing), bh);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, bh * 0.65);
    ctx.lineTo(bw * (0.3 - swing), bh);
    ctx.stroke();

    ctx.restore();
  }

  _drawBullets() {
    const ctx = this.ctx;
    const s = this.scale;
    const r = PC.BULLET.RADIUS * s;

    this.bullets.forEach(b => {
      const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.4, PC.BULLET.COLOR);
      grad.addColorStop(1, '#ff8800');

      ctx.shadowColor = PC.BULLET.COLOR;
      ctx.shadowBlur = 6 * s;

      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    });
  }

  _drawExplosions() {
    const ctx = this.ctx;
    const s = this.scale;

    this.explosions.forEach(ex => {
      const t = ex.frame / PC.EXPLOSION.DURATION;
      const maxR = PC.EXPLOSION.RADIUS_MAX * s;
      const r = maxR * t;
      const alpha = 1 - t;

      // Outer ring
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,80,0,${alpha * 0.6})`;
      ctx.fill();

      // Inner bright core
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, r * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,220,0,${alpha})`;
      ctx.fill();

      // Flash (early)
      if (t < 0.2) {
        ctx.beginPath();
        ctx.arc(ex.x, ex.y, r * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${(0.2 - t) / 0.2})`;
        ctx.fill();
      }
    });
  }

  _drawTurret(groundY) {
    const ctx = this.ctx;
    const s = this.scale;
    const cw = this.cw;

    const tx = cw / 2;
    const baseW = PC.TURRET.BASE_W * s;
    const baseH = PC.TURRET.BASE_H * s;
    const barrelLen = PC.TURRET.BARREL_LEN * s;
    const barrelW = PC.TURRET.BARREL_W * s;
    const ty = groundY - baseH * 0.5;

    // Base shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(tx, groundY + 2 * s, baseW * 0.55, 3 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // Turret base (trapezoid)
    const baseGrad = ctx.createLinearGradient(tx - baseW/2, ty, tx + baseW/2, ty + baseH);
    baseGrad.addColorStop(0, '#aab0bb');
    baseGrad.addColorStop(0.4, '#7a8090');
    baseGrad.addColorStop(1, '#555a66');
    ctx.fillStyle = baseGrad;
    ctx.beginPath();
    ctx.moveTo(tx - baseW * 0.55, groundY);
    ctx.lineTo(tx - baseW * 0.38, ty);
    ctx.lineTo(tx + baseW * 0.38, ty);
    ctx.lineTo(tx + baseW * 0.55, groundY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 0.8 * s;
    ctx.stroke();

    // Turret dome (pivot point)
    const domeR = baseW * 0.36;
    const domeGrad = ctx.createRadialGradient(tx - domeR*0.3, ty - domeR*0.3, 1, tx, ty, domeR);
    domeGrad.addColorStop(0, '#c8cdd6');
    domeGrad.addColorStop(0.5, '#888e99');
    domeGrad.addColorStop(1, '#4a5060');
    ctx.fillStyle = domeGrad;
    ctx.beginPath();
    ctx.arc(tx, ty, domeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 0.8 * s;
    ctx.stroke();

    // Barrel
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(this.turretAngle);

    const barrelGrad = ctx.createLinearGradient(-barrelW/2, 0, barrelW/2, 0);
    barrelGrad.addColorStop(0, '#555a66');
    barrelGrad.addColorStop(0.4, '#9aa0aa');
    barrelGrad.addColorStop(1, '#555a66');
    ctx.fillStyle = barrelGrad;
    ctx.beginPath();
    this._roundRect(ctx, -barrelW/2, -barrelLen, barrelW, barrelLen, 2 * s);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.7 * s;
    ctx.stroke();

    // Muzzle cap
    ctx.fillStyle = '#333744';
    ctx.beginPath();
    ctx.arc(0, -barrelLen, barrelW * 0.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Aim indicator line (subtle)
    const aimLen = 18 * s;
    const aimX = tx + Math.cos(this.turretAngle) * (barrelLen + aimLen);
    const aimY = ty + Math.sin(this.turretAngle) * (barrelLen + aimLen);
    ctx.strokeStyle = 'rgba(255,220,100,0.35)';
    ctx.lineWidth = 0.8 * s;
    ctx.setLineDash([2 * s, 3 * s]);
    ctx.beginPath();
    ctx.moveTo(tx + Math.cos(this.turretAngle) * barrelLen, ty + Math.sin(this.turretAngle) * barrelLen);
    ctx.lineTo(aimX, aimY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── Helper: roundRect (fallback for older environments) ─────────────────────

  _roundRect(ctx, x, y, w, h, r) {
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, r);
    } else {
      r = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }
  }

  // ── Main Loop ───────────────────────────────────────────────────────────────

  _loop() {
    this._update();
    this._draw();
    this.animId = requestAnimationFrame(() => this._loop());
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ParachuteGame };
}
