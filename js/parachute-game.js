// Parachute Game — full rebuild for iPod Classic web portfolio
// Classic Paratrooper/Sabotage mechanics, canvas-based, click-wheel controlled.

// ─── Constants ────────────────────────────────────────────────────────────────

const PC_BASE = { WIDTH: 392, HEIGHT: 262 };

// All sizes in "base" pixels (scaled up by this.scale at runtime)
const PC = {
  TURRET: {
    BASE_W: 26,         // turret base width
    BASE_H: 12,         // turret base height
    DOME_R: 9,          // pivot dome radius
    BARREL_LEN: 20,     // barrel length
    BARREL_W: 5,        // barrel width
    // Angle from vertical (up = 0). -Math.PI/2 is pointing left, +Math.PI/2 is right.
    // We store as standard canvas angle: straight up = -PI/2
    ANGLE_MIN: -Math.PI / 2 - (80 * Math.PI / 180),  // ~-80° left of straight-up
    ANGLE_MAX: -Math.PI / 2 + (80 * Math.PI / 180),  // ~+80° right of straight-up
    ANGLE_STEP: 0.09,
    INITIAL_ANGLE: -Math.PI / 2,   // straight up
  },
  BULLET: {
    RADIUS: 2.5,
    SPEED: 320,   // pixels/sec in base units — scaled
    COLOR: '#ffe066',
    MAX: 8,
    COST: 1,      // score cost per shot
  },
  HELICOPTER: {
    WIDTH: 56,
    HEIGHT: 22,
    SPEED_BASE: 50,          // base-pixels / second
    SPEED_INC: 8,            // per wave
    SPEED_MAX: 130,
    Y_BAND: [18, 70],        // altitude range top/bottom of screen (base px from top)
    DROP_INTERVAL_BASE: 3.5, // seconds between drops
    DROP_INTERVAL_MIN: 1.2,
    DROP_DEC: 0.25,          // seconds less per wave
    SCORE: 5,
  },
  PARATROOPER: {
    W: 8,
    H: 12,
    CHUTE_R: 13,
    FALL_SPEED: 30,       // base px/sec with chute
    FALL_SPEED_FAST: 130, // without chute
    SCORE: 2,
    MAX_PER_SIDE: 4,      // 4 on one side → game over
  },
  JET: {
    WIDTH: 52,
    HEIGHT: 14,
    SPEED: 220,          // base px/sec (fast!)
    BOMB_SPEED: 80,
    SCORE: 5,
    BOMB_SCORE: 25,
    INTERVAL: [12, 22],  // seconds between jet appearances
  },
  EXPLOSION: {
    DURATION: 0.55,      // seconds
    RADIUS_MAX: 24,
  },
  GROUND: {
    HEIGHT: 14,
  },
  LADDER: {
    ANIM_DURATION: 2.5,  // seconds of ladder-climbing animation
  },
};

// ─── Utility ──────────────────────────────────────────────────────────────────

function rnd(min, max) { return Math.random() * (max - min) + min; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

// ─── ParachuteGame class ───────────────────────────────────────────────────────

class ParachuteGame {
  constructor() {
    this.canvas    = null;
    this.ctx       = null;
    this.cw        = 0;
    this.ch        = 0;
    this.scale     = 1;
    this.animId    = null;
    this.listeners = [];
    this.hudEl     = null;
    this.hudRightEl= null;

    // Game state machine
    // 'start' | 'playing' | 'paused' | 'ladder' | 'gameover'
    this.state = 'start';
    this.score = 0;
    this.wave  = 1;

    // Timing
    this._lastTs   = null;
    this._gameTime = 0;  // total game seconds (unpaused)

    // Objects
    this.turretAngle = PC.TURRET.INITIAL_ANGLE;
    this.bullets     = [];
    this.helis       = [];        // array — can have up to 2
    this.paratroopers = [];
    this.explosions  = [];
    this.jets        = [];
    this.bombs       = [];

    // Landed paratroopers per side: index 0 = left, 1 = right
    this.landedLeft  = 0;
    this.landedRight = 0;

    // Helicopter spawn
    this._heliTimer   = 0;
    this._nextHeliIn  = 1.5;

    // Jet spawn
    this._jetTimer    = 0;
    this._nextJetIn   = rnd(PC.JET.INTERVAL[0], PC.JET.INTERVAL[1]);

    // Rotor animation
    this._rotorPhase  = 0;

    // Ladder animation state
    this._ladderSide  = 0; // 0=left,1=right
    this._ladderTimer = 0;

    // Audio: Web Audio API for procedural SFX
    this._audioCtx    = null;
    this._audioReady  = false;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  init(canvasEl, hudEl, hudRightEl) {
    this.canvas       = canvasEl;
    this.ctx          = canvasEl.getContext('2d');
    this.hudEl        = hudEl;
    this.hudRightEl   = hudRightEl;

    const parent      = canvasEl.parentElement;
    this.cw           = canvasEl.width  = parent.clientWidth;
    this.ch           = canvasEl.height = parent.clientHeight;
    this.scale        = this.cw / PC_BASE.WIDTH;

    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';

    this._resetGame();
    this.state = 'start';
    this._updateHUD();

    // ── Event listeners ──
    const onCenter = () => this._handleCenter();
    const onFwd    = () => this._handleFwd();
    const onBwd    = () => this._handleBwd();
    const onMenu   = () => this._handleMenu();

    window.addEventListener('centerclick',    onCenter);
    window.addEventListener('forwardscroll',  onFwd,    true);
    window.addEventListener('backwardscroll', onBwd,    true);
    window.addEventListener('menuclick',      onMenu);

    this.listeners = [
      ['centerclick',    onCenter, false],
      ['forwardscroll',  onFwd,    true],
      ['backwardscroll', onBwd,    true],
      ['menuclick',      onMenu,   false],
    ];

    this._lastTs = null;
    this._loop();
  }

  cleanup() {
    if (this.animId) cancelAnimationFrame(this.animId);
    this.animId = null;
    this.listeners.forEach(([evt, fn, cap]) => window.removeEventListener(evt, fn, cap));
    this.listeners = [];
    if (this._audioCtx) { try { this._audioCtx.close(); } catch(e) {} }
  }

  // ── Input Handlers ──────────────────────────────────────────────────────────

  _handleCenter() {
    this._initAudio();
    if (this.state === 'start' || this.state === 'gameover') {
      this._resetGame();
      this.state = 'playing';
      this._updateHUD();
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this._lastTs = null; // reset dt on resume to avoid jump
      this._updateHUD();
    } else if (this.state === 'playing') {
      this._fire();
    }
  }

  _handleFwd() {
    if (this.state !== 'playing') return;
    this.turretAngle = clamp(
      this.turretAngle + PC.TURRET.ANGLE_STEP,
      PC.TURRET.ANGLE_MIN,
      PC.TURRET.ANGLE_MAX
    );
  }

  _handleBwd() {
    if (this.state !== 'playing') return;
    this.turretAngle = clamp(
      this.turretAngle - PC.TURRET.ANGLE_STEP,
      PC.TURRET.ANGLE_MIN,
      PC.TURRET.ANGLE_MAX
    );
  }

  _handleMenu() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this._updateHUD();
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this._lastTs = null;
      this._updateHUD();
    }
  }

  // ── Reset ────────────────────────────────────────────────────────────────────

  _resetGame() {
    this.score        = 0;
    this.wave         = 1;
    this.turretAngle  = PC.TURRET.INITIAL_ANGLE;
    this.bullets      = [];
    this.helis        = [];
    this.paratroopers = [];
    this.explosions   = [];
    this.jets         = [];
    this.bombs        = [];
    this.landedLeft   = 0;
    this.landedRight  = 0;
    this._heliTimer   = 0;
    this._nextHeliIn  = 1.5;
    this._jetTimer    = 0;
    this._nextJetIn   = rnd(PC.JET.INTERVAL[0], PC.JET.INTERVAL[1]);
    this._rotorPhase  = 0;
    this._gameTime    = 0;
    this._ladderTimer = 0;
  }

  // ── Audio ────────────────────────────────────────────────────────────────────

  _initAudio() {
    if (this._audioReady) return;
    try {
      this._audioCtx   = new (window.AudioContext || window.webkitAudioContext)();
      this._audioReady = true;
    } catch(e) {}
  }

  _sfx(type) {
    if (!this._audioReady || !this._audioCtx) return;
    const ac = this._audioCtx;
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);

    switch (type) {
      case 'fire':
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.08);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now); osc.stop(now + 0.1);
        break;
      case 'explode':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.35);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now); osc.stop(now + 0.38);
        break;
      case 'pop':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.18);
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.start(now); osc.stop(now + 0.2);
        break;
      case 'land':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(330, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.12);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.start(now); osc.stop(now + 0.15);
        break;
      case 'gameover':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(55, now + 0.9);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
        osc.start(now); osc.stop(now + 1.0);
        break;
    }
  }

  // ── Fire ─────────────────────────────────────────────────────────────────────

  _fire() {
    if (this.bullets.length >= PC.BULLET.MAX) return;
    const s      = this.scale;
    const tx     = this.cw / 2;
    const gY     = this._groundY();
    const ty     = gY - (PC.TURRET.BASE_H + PC.TURRET.DOME_R) * s;
    const bLen   = PC.TURRET.BARREL_LEN * s;
    const angle  = this.turretAngle;
    const speed  = PC.BULLET.SPEED * s;

    this.bullets.push({
      x:  tx + Math.cos(angle) * bLen,
      y:  ty + Math.sin(angle) * bLen,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    });

    this.score = Math.max(0, this.score - PC.BULLET.COST);
    this._sfx('fire');
    this._updateHUD();
  }

  // ── Ground Y ─────────────────────────────────────────────────────────────────

  _groundY() {
    return this.ch - PC.GROUND.HEIGHT * this.scale;
  }

  // ── Helicopter spawn ─────────────────────────────────────────────────────────

  _spawnHeli() {
    const s    = this.scale;
    const hw   = PC.HELICOPTER.WIDTH * s;
    // Altitude: each wave gets progressively lower
    const bandTop = PC.HELICOPTER.Y_BAND[0] * s;
    const bandBot = PC.HELICOPTER.Y_BAND[1] * s;
    const waveT   = clamp((this.wave - 1) / 8, 0, 1);
    const y       = lerp(bandTop, bandBot, waveT) + rnd(-4, 4) * s;
    const fromLeft = Math.random() > 0.5;

    const speed = clamp(
      (PC.HELICOPTER.SPEED_BASE + (this.wave - 1) * PC.HELICOPTER.SPEED_INC) * s,
      PC.HELICOPTER.SPEED_BASE * s,
      PC.HELICOPTER.SPEED_MAX * s
    );
    const dropInterval = Math.max(
      PC.HELICOPTER.DROP_INTERVAL_BASE - (this.wave - 1) * PC.HELICOPTER.DROP_DEC,
      PC.HELICOPTER.DROP_INTERVAL_MIN
    );

    this.helis.push({
      x:     fromLeft ? -hw : this.cw + hw,
      y,
      w:     hw,
      h:     PC.HELICOPTER.HEIGHT * s,
      dir:   fromLeft ? 1 : -1,
      speed,
      dropTimer: dropInterval * rnd(0.3, 0.7), // stagger first drop
      dropInterval,
      alive: true,
    });

    this._nextHeliIn = rnd(4, 8);
    this._heliTimer  = 0;
  }

  // ── Jet spawn ────────────────────────────────────────────────────────────────

  _spawnJet() {
    const s       = this.scale;
    const fromLeft = Math.random() > 0.5;
    const jw      = PC.JET.WIDTH * s;
    const y       = rnd(20, 55) * s;

    this.jets.push({
      x:        fromLeft ? -jw : this.cw + jw,
      y,
      w:        jw,
      h:        PC.JET.HEIGHT * s,
      dir:      fromLeft ? 1 : -1,
      speed:    PC.JET.SPEED * s,
      hasBombed: false,
      alive:    true,
    });

    this._nextJetIn  = rnd(PC.JET.INTERVAL[0], PC.JET.INTERVAL[1]);
    this._jetTimer   = 0;
  }

  // ── Update ────────────────────────────────────────────────────────────────────

  _update(dt) {
    if (this.state === 'ladder') {
      this._ladderTimer += dt;
      if (this._ladderTimer >= PC.LADDER.ANIM_DURATION) {
        this.state = 'gameover';
        this._sfx('gameover');
        this._updateHUD();
      }
      return;
    }
    if (this.state !== 'playing') return;

    this._gameTime += dt;
    this._rotorPhase += dt * 18;

    const s     = this.scale;
    const gY    = this._groundY();

    // ── Turret pivot (for bullets)
    const tx    = this.cw / 2;
    const ty    = gY - (PC.TURRET.BASE_H + PC.TURRET.DOME_R) * s;

    // ── Helicopter spawn ──
    this._heliTimer += dt;
    if (this._heliTimer >= this._nextHeliIn && this.helis.length < 2) {
      this._spawnHeli();
    }

    // ── Jet spawn (waves 2+) ──
    if (this.wave >= 2) {
      this._jetTimer += dt;
      if (this._jetTimer >= this._nextJetIn) {
        this._spawnJet();
        this._jetTimer  = 0;
        this._nextJetIn = rnd(PC.JET.INTERVAL[0], PC.JET.INTERVAL[1]);
      }
    }

    // ── Helicopters ──
    for (let i = this.helis.length - 1; i >= 0; i--) {
      const h = this.helis[i];
      if (!h.alive) { this.helis.splice(i, 1); continue; }

      h.x += h.dir * h.speed * dt;
      h.dropTimer += dt;
      if (h.dropTimer >= h.dropInterval) {
        h.dropTimer = 0;
        this._dropPara(h);
      }

      // Off-screen → next wave
      const margin = h.w;
      if ((h.dir > 0 && h.x > this.cw + margin) ||
          (h.dir < 0 && h.x < -margin)) {
        this.helis.splice(i, 1);
        // Increment wave when last heli leaves
        if (this.helis.length === 0) {
          this.wave++;
          this._heliTimer  = 0;
          this._nextHeliIn = rnd(1.5, 3.5);
        }
      }
    }

    // ── Jets ──
    for (let i = this.jets.length - 1; i >= 0; i--) {
      const j = this.jets[i];
      if (!j.alive) { this.jets.splice(i, 1); continue; }

      j.x += j.dir * j.speed * dt;

      // Drop bomb when passing over turret (once)
      if (!j.hasBombed) {
        const overTurret = (j.dir > 0 && j.x > tx - 20 * s && j.x < tx + 40 * s) ||
                           (j.dir < 0 && j.x < tx + 20 * s && j.x > tx - 40 * s);
        if (overTurret) {
          j.hasBombed = true;
          this.bombs.push({
            x:  j.x,
            y:  j.y + j.h,
            vy: PC.JET.BOMB_SPEED * s,
          });
        }
      }

      const margin = j.w;
      if ((j.dir > 0 && j.x > this.cw + margin) ||
          (j.dir < 0 && j.x < -margin)) {
        this.jets.splice(i, 1);
      }
    }

    // ── Bombs ──
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.y += b.vy * dt;

      // Hit turret?
      const distToTurret = Math.sqrt((b.x - tx) ** 2 + (b.y - ty) ** 2);
      if (distToTurret < 18 * s) {
        this._explode(b.x, b.y, 'bomb');
        this.bombs.splice(i, 1);
        this._triggerGameOver('bomb');
        return;
      }

      // Hit ground
      if (b.y >= gY) {
        this._explode(b.x, gY, 'splat');
        this.bombs.splice(i, 1);
      }
    }

    // ── Bullets ──
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.x < 0 || b.x > this.cw || b.y < 0 || b.y > this.ch) {
        this.bullets.splice(i, 1);
        continue;
      }

      let hit = false;

      // ── Bullet vs Jets ──
      for (let j = this.jets.length - 1; j >= 0; j--) {
        const jet = this.jets[j];
        if (!jet.alive) continue;
        if (b.x >= jet.x - jet.w / 2 && b.x <= jet.x + jet.w / 2 &&
            b.y >= jet.y && b.y <= jet.y + jet.h) {
          this._explode(jet.x, jet.y + jet.h / 2, 'heli');
          jet.alive = false;
          this.score += PC.JET.SCORE;
          this._sfx('explode');
          this.bullets.splice(i, 1);
          hit = true;
          break;
        }
      }
      if (hit) { this._updateHUD(); continue; }

      // ── Bullet vs Bombs ──
      for (let j = this.bombs.length - 1; j >= 0; j--) {
        const bm = this.bombs[j];
        const dx = b.x - bm.x, dy = b.y - bm.y;
        if (dx * dx + dy * dy < (6 * s) ** 2) {
          this._explode(bm.x, bm.y, 'splat');
          this.bombs.splice(j, 1);
          this.score += PC.JET.BOMB_SCORE;
          this._sfx('explode');
          this.bullets.splice(i, 1);
          hit = true;
          break;
        }
      }
      if (hit) { this._updateHUD(); continue; }

      // ── Bullet vs Helicopters ──
      for (let j = this.helis.length - 1; j >= 0; j--) {
        const h = this.helis[j];
        if (!h.alive) continue;
        if (b.x >= h.x - h.w / 2 && b.x <= h.x + h.w / 2 &&
            b.y >= h.y && b.y <= h.y + h.h) {
          this._explode(h.x, h.y + h.h / 2, 'heli');
          h.alive = false;
          this.score += PC.HELICOPTER.SCORE;
          this._sfx('explode');
          this.bullets.splice(i, 1);
          hit = true;
          break;
        }
      }
      if (hit) { this._updateHUD(); continue; }

      // ── Bullet vs Paratroopers ──
      for (let j = this.paratroopers.length - 1; j >= 0; j--) {
        const p = this.paratroopers[j];
        if (p.landed) continue;

        if (p.chutePopped) {
          // Shoot falling body
          const bw = PC.PARATROOPER.W * s / 2;
          const bh = PC.PARATROOPER.H * s;
          if (b.x >= p.x - bw && b.x <= p.x + bw &&
              b.y >= p.y && b.y <= p.y + bh) {
            this._explode(p.x, p.y + bh / 2, 'para');
            this.paratroopers.splice(j, 1);
            this.score += PC.PARATROOPER.SCORE;
            this._sfx('pop');
            this.bullets.splice(i, 1);
            hit = true;
            break;
          }
        } else {
          // Shoot parachute dome
          const cr  = PC.PARATROOPER.CHUTE_R * s;
          const ccy = p.y - cr;
          const dx  = b.x - p.x, dy = b.y - ccy;
          if (dx * dx + dy * dy <= cr * cr) {
            p.chutePopped = true;
            this.score += PC.PARATROOPER.SCORE;
            this._sfx('pop');
            this.bullets.splice(i, 1);
            hit = true;
            break;
          }
        }
        if (hit) break;
      }
      if (hit) { this._updateHUD(); continue; }
    }

    // ── Paratroopers ──
    for (let i = this.paratroopers.length - 1; i >= 0; i--) {
      const p = this.paratroopers[i];
      if (p.landed) continue;

      const fallSpeed = (p.chutePopped
        ? PC.PARATROOPER.FALL_SPEED_FAST
        : PC.PARATROOPER.FALL_SPEED) * s;

      p.y += fallSpeed * dt;
      p.swingPhase = (p.swingPhase || 0) + dt * 2.5;

      const bh = PC.PARATROOPER.H * s;

      // Hit turret directly?
      const distTurret = Math.abs(p.x - tx);
      if (distTurret < 12 * s && p.y + bh >= ty - 6 * s) {
        this._explode(tx, ty, 'bomb');
        this._triggerGameOver('para-direct');
        return;
      }

      // Landed on ground
      if (p.y + bh >= gY) {
        p.y = gY - bh;
        p.landed = true;

        if (p.chutePopped) {
          // Fell fast → splat
          this._explode(p.x, gY, 'splat');
          this.paratroopers.splice(i, 1);
        } else {
          // Safe landing — counts for the side
          this._sfx('land');
          if (p.x < tx) {
            this.landedLeft++;
            if (this.landedLeft >= PC.PARATROOPER.MAX_PER_SIDE) {
              this._triggerLadder(0);
              return;
            }
          } else {
            this.landedRight++;
            if (this.landedRight >= PC.PARATROOPER.MAX_PER_SIDE) {
              this._triggerLadder(1);
              return;
            }
          }
          this._updateHUD();
        }
      }
    }

    // ── Explosions ──
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      this.explosions[i].t += dt;
      if (this.explosions[i].t >= PC.EXPLOSION.DURATION) {
        this.explosions.splice(i, 1);
      }
    }
  }

  _dropPara(heli) {
    const s = this.scale;
    this.paratroopers.push({
      x:          heli.x,
      y:          heli.y + heli.h,
      chutePopped: false,
      landed:     false,
      swingPhase: Math.random() * Math.PI * 2,
    });
  }

  _explode(x, y, type) {
    this.explosions.push({ x, y, t: 0, type });
  }

  _triggerLadder(side) {
    this._ladderSide  = side;
    this._ladderTimer = 0;
    this.state        = 'ladder';
  }

  _triggerGameOver(cause) {
    this.state = 'gameover';
    this._sfx('gameover');
    this._updateHUD();
  }

  _updateHUD() {
    if (this.hudEl) {
      this.hudEl.textContent = `Score: ${this.score}`;
    }
    if (this.hudRightEl) {
      const lL = this.landedLeft, lR = this.landedRight;
      const max = PC.PARATROOPER.MAX_PER_SIDE;
      if (this.state === 'playing' || this.state === 'paused' || this.state === 'ladder') {
        this.hudRightEl.textContent = `L:${lL}/${max}  R:${lR}/${max}`;
      } else {
        this.hudRightEl.textContent = '';
      }
    }
  }

  // ── Draw ──────────────────────────────────────────────────────────────────────

  _draw() {
    const ctx = this.ctx;
    const cw  = this.cw, ch = this.ch;
    const s   = this.scale;
    const gY  = this._groundY();

    // ── Sky ──
    const skyGrad = ctx.createLinearGradient(0, 0, 0, gY);
    skyGrad.addColorStop(0,   '#2e5fa3');
    skyGrad.addColorStop(0.45,'#4a90d9');
    skyGrad.addColorStop(1,   '#87ceeb');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, cw, gY);

    // ── Ground ──
    const groundGrad = ctx.createLinearGradient(0, gY, 0, ch);
    groundGrad.addColorStop(0,   '#4caf50');
    groundGrad.addColorStop(0.25,'#388e3c');
    groundGrad.addColorStop(1,   '#1b5e20');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, gY, cw, ch - gY);

    // Ground edge highlight
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(0, gY, cw, 1.5 * s);

    // ── State-specific screens ──
    if (this.state === 'start') {
      this._drawTurret(gY);
      this._drawStartScreen();
      return;
    }

    if (this.state === 'gameover') {
      this._drawLandedTroopers(gY, false);
      this._drawTurret(gY);
      this._drawExplosions();
      this._drawGameOverScreen();
      return;
    }

    if (this.state === 'paused') {
      this._drawAll(gY);
      this._drawPauseScreen();
      return;
    }

    if (this.state === 'ladder') {
      this._drawLadderAnim(gY);
      return;
    }

    // ── Playing ──
    this._drawAll(gY);
  }

  _drawAll(gY) {
    const ctx = this.ctx;
    const s   = this.scale;

    this._drawLandedTroopers(gY, false);
    this._drawJets();
    this._drawBombs();
    this._drawHelis();
    this._drawParatroopers();
    this._drawBullets();
    this._drawExplosions();
    this._drawTurret(gY);
    this._drawWaveIndicator();
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // DRAW: Start screen
  _drawStartScreen() {
    const ctx = this.ctx;
    const s   = this.scale;
    const cw  = this.cw, ch = this.ch;

    // Panel
    const pw = 168 * s, ph = 70 * s;
    const px = (cw - pw) / 2, py = (ch - ph) / 2 - 12 * s;
    ctx.fillStyle = 'rgba(0,0,0,0.52)';
    this._rr(ctx, px, py, pw, ph, 8 * s);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = s;
    this._rr(ctx, px, py, pw, ph, 8 * s);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe066';
    ctx.font = `bold ${Math.round(15 * s)}px "Helvetica Neue", Helvetica, sans-serif`;
    ctx.fillText('PARACHUTE', cw / 2, py + 22 * s);

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `${Math.round(9 * s)}px "Helvetica Neue", Helvetica, sans-serif`;
    ctx.fillText('Press ● to start', cw / 2, py + 40 * s);

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `${Math.round(7.5 * s)}px "Helvetica Neue", Helvetica, sans-serif`;
    ctx.fillText('Scroll = aim  •  ● = fire  •  Menu = pause', cw / 2, py + 58 * s);
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // DRAW: Game over screen
  _drawGameOverScreen() {
    const ctx = this.ctx;
    const s   = this.scale;
    const cw  = this.cw, ch = this.ch;

    const pw = 178 * s, ph = 78 * s;
    const px = (cw - pw) / 2, py = (ch - ph) / 2 - 10 * s;
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    this._rr(ctx, px, py, pw, ph, 8 * s);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,80,80,0.5)';
    ctx.lineWidth = 1.2 * s;
    this._rr(ctx, px, py, pw, ph, 8 * s);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff4444';
    ctx.font = `bold ${Math.round(15 * s)}px "Helvetica Neue", Helvetica, sans-serif`;
    ctx.fillText('GAME OVER', cw / 2, py + 22 * s);

    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.round(10 * s)}px "Helvetica Neue", Helvetica, sans-serif`;
    ctx.fillText(`Score: ${this.score}`, cw / 2, py + 40 * s);

    ctx.fillStyle = '#ffe066';
    ctx.font = `${Math.round(8.5 * s)}px "Helvetica Neue", Helvetica, sans-serif`;
    ctx.fillText('Press ● to play again', cw / 2, py + 60 * s);
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // DRAW: Pause screen
  _drawPauseScreen() {
    const ctx = this.ctx;
    const s   = this.scale;
    const cw  = this.cw, ch = this.ch;

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, cw, ch);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(14 * s)}px "Helvetica Neue", Helvetica, sans-serif`;
    ctx.fillText('PAUSED', cw / 2, ch / 2 - 8 * s);

    ctx.fillStyle = '#ffe066';
    ctx.font = `${Math.round(8.5 * s)}px "Helvetica Neue", Helvetica, sans-serif`;
    ctx.fillText('Press Menu or ● to resume', cw / 2, ch / 2 + 10 * s);
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // DRAW: Wave indicator
  _drawWaveIndicator() {
    const ctx = this.ctx;
    const s   = this.scale;
    const cw  = this.cw;

    ctx.textAlign    = 'right';
    ctx.fillStyle    = 'rgba(255,255,255,0.45)';
    ctx.font         = `${Math.round(7 * s)}px "Helvetica Neue", Helvetica, sans-serif`;
    ctx.fillText(`Wave ${this.wave}`, cw - 5 * s, 10 * s);
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // DRAW: Turret
  _drawTurret(gY) {
    const ctx      = this.ctx;
    const s        = this.scale;
    const cw       = this.cw;
    const tx       = cw / 2;
    const baseW    = PC.TURRET.BASE_W * s;
    const baseH    = PC.TURRET.BASE_H * s;
    const domeR    = PC.TURRET.DOME_R * s;
    const barrelL  = PC.TURRET.BARREL_LEN * s;
    const barrelW  = PC.TURRET.BARREL_W * s;
    const pivotY   = gY - baseH - domeR * 0.35;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(tx, gY + 1 * s, baseW * 0.55, 2.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // Base (trapezoid)
    const baseGrad = ctx.createLinearGradient(tx - baseW / 2, pivotY, tx + baseW / 2, gY);
    baseGrad.addColorStop(0,   '#b0b8c8');
    baseGrad.addColorStop(0.4, '#7a8695');
    baseGrad.addColorStop(1,   '#4a5260');
    ctx.fillStyle = baseGrad;
    ctx.beginPath();
    ctx.moveTo(tx - baseW * 0.58, gY);
    ctx.lineTo(tx - baseW * 0.38, pivotY + domeR * 0.6);
    ctx.lineTo(tx + baseW * 0.38, pivotY + domeR * 0.6);
    ctx.lineTo(tx + baseW * 0.58, gY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth   = 0.8 * s;
    ctx.stroke();

    // Pivot dome
    const domeGrad = ctx.createRadialGradient(tx - domeR * 0.3, pivotY - domeR * 0.3, 1, tx, pivotY, domeR);
    domeGrad.addColorStop(0,   '#d0d8e8');
    domeGrad.addColorStop(0.5, '#8090a8');
    domeGrad.addColorStop(1,   '#3a4558');
    ctx.fillStyle = domeGrad;
    ctx.beginPath();
    ctx.arc(tx, pivotY, domeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth   = 0.8 * s;
    ctx.stroke();

    // Barrel
    ctx.save();
    ctx.translate(tx, pivotY);
    ctx.rotate(this.turretAngle);

    const bGrad = ctx.createLinearGradient(-barrelW / 2, 0, barrelW / 2, 0);
    bGrad.addColorStop(0,   '#4a5260');
    bGrad.addColorStop(0.4, '#9aa5b8');
    bGrad.addColorStop(1,   '#4a5260');
    ctx.fillStyle = bGrad;
    ctx.beginPath();
    this._rr(ctx, -barrelW / 2, -barrelL, barrelW, barrelL, 2 * s);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth   = 0.7 * s;
    ctx.stroke();

    // Muzzle cap
    ctx.fillStyle = '#2a3040';
    ctx.beginPath();
    ctx.arc(0, -barrelL, barrelW * 0.58, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Aim guide (subtle dashed)
    const aimStart = barrelL;
    const aimEnd   = barrelL + 16 * s;
    ctx.strokeStyle  = 'rgba(255,220,80,0.28)';
    ctx.lineWidth    = 0.8 * s;
    ctx.setLineDash([2 * s, 3 * s]);
    ctx.beginPath();
    ctx.moveTo(tx + Math.cos(this.turretAngle) * aimStart, pivotY + Math.sin(this.turretAngle) * aimStart);
    ctx.lineTo(tx + Math.cos(this.turretAngle) * aimEnd,   pivotY + Math.sin(this.turretAngle) * aimEnd);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // DRAW: Helicopters
  _drawHelis() {
    this.helis.forEach(h => { if (h.alive) this._drawHeli(h); });
  }

  _drawHeli(h) {
    const ctx  = this.ctx;
    const s    = this.scale;
    const { x, y, w, h: hh, dir } = h;

    ctx.save();
    ctx.translate(x, y);
    if (dir < 0) { ctx.scale(-1, 1); } // flip if going left

    // ── Fuselage ──
    const bodyGrad = ctx.createLinearGradient(0, 0, 0, hh * 0.65);
    bodyGrad.addColorStop(0,   '#6a7a8e');
    bodyGrad.addColorStop(0.5, '#4a5a6e');
    bodyGrad.addColorStop(1,   '#3a4a5a');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    this._rr(ctx, -w * 0.38, 0, w * 0.76, hh * 0.65, 3 * s);
    ctx.fill();

    // ── Cockpit glass ──
    const glassBubble = ctx.createRadialGradient(-w * 0.08, hh * 0.12, 1, -w * 0.08, hh * 0.22, w * 0.2);
    glassBubble.addColorStop(0,   'rgba(190,235,255,0.92)');
    glassBubble.addColorStop(0.6, 'rgba(80,150,210,0.72)');
    glassBubble.addColorStop(1,   'rgba(40,80,150,0.55)');
    ctx.fillStyle = glassBubble;
    ctx.beginPath();
    ctx.ellipse(-w * 0.08, hh * 0.3, w * 0.2, hh * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth   = 0.7 * s;
    ctx.stroke();

    // ── Tail boom ──
    ctx.fillStyle = '#3a4a5a';
    ctx.fillRect(w * 0.3, hh * 0.1, w * 0.4, hh * 0.28);

    // ── Tail fin ──
    ctx.beginPath();
    ctx.moveTo(w * 0.62, hh * 0.1);
    ctx.lineTo(w * 0.7,  -hh * 0.28);
    ctx.lineTo(w * 0.72, hh * 0.1);
    ctx.fillStyle = '#3a4a5a';
    ctx.fill();

    // ── Landing skids ──
    ctx.strokeStyle = '#7a8898';
    ctx.lineWidth   = 1.4 * s;
    ctx.beginPath();
    // Left strut
    ctx.moveTo(-w * 0.28, hh * 0.65);
    ctx.lineTo(-w * 0.28, hh * 0.88);
    // Right strut
    ctx.moveTo(w * 0.24, hh * 0.65);
    ctx.lineTo(w * 0.24, hh * 0.88);
    // Skid bar
    ctx.moveTo(-w * 0.38, hh * 0.88);
    ctx.lineTo(w * 0.34,  hh * 0.88);
    ctx.stroke();

    // ── Main rotor ──
    const rotLen = w * 0.6;
    ctx.save();
    ctx.translate(0, -2 * s);
    ctx.rotate(this._rotorPhase);
    ctx.strokeStyle = '#1a2030';
    ctx.lineWidth   = 2 * s;
    // Two blades
    ctx.beginPath();
    ctx.moveTo(-rotLen, 0); ctx.lineTo(rotLen, 0);
    ctx.stroke();
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(-rotLen * 0.7, 0); ctx.lineTo(rotLen * 0.7, 0);
    ctx.stroke();
    // Hub
    ctx.fillStyle = '#1a2030';
    ctx.beginPath();
    ctx.arc(0, 0, 2.5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ── Tail rotor ──
    const trLen = hh * 0.22;
    ctx.strokeStyle = '#1a2030';
    ctx.lineWidth   = 1.2 * s;
    ctx.save();
    ctx.translate(w * 0.69, hh * 0.08);
    ctx.rotate(this._rotorPhase * 1.8);
    ctx.beginPath();
    ctx.moveTo(0, -trLen); ctx.lineTo(0, trLen);
    ctx.stroke();
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -trLen * 0.7); ctx.lineTo(0, trLen * 0.7);
    ctx.stroke();
    ctx.restore();

    // ── Nav light ──
    ctx.fillStyle = (Math.floor(this._rotorPhase * 3) % 2 === 0) ? '#ff4444' : '#cc2222';
    ctx.beginPath();
    ctx.arc(-w * 0.38, hh * 0.32, 2 * s, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // DRAW: Jets
  _drawJets() {
    const ctx = this.ctx;
    const s   = this.scale;

    this.jets.forEach(j => {
      if (!j.alive) return;
      ctx.save();
      ctx.translate(j.x, j.y + j.h / 2);
      if (j.dir < 0) ctx.scale(-1, 1);

      // Fuselage
      ctx.fillStyle = '#8898a8';
      ctx.beginPath();
      ctx.moveTo(-j.w / 2, j.h * 0.1);
      ctx.lineTo(j.w * 0.42, j.h * 0.1);
      ctx.lineTo(j.w / 2, 0);
      ctx.lineTo(j.w * 0.42, -j.h * 0.1);
      ctx.lineTo(-j.w / 2, -j.h * 0.1);
      ctx.closePath();
      ctx.fill();

      // Wings
      ctx.fillStyle = '#6a7888';
      ctx.beginPath();
      ctx.moveTo(0, -j.h * 0.1);
      ctx.lineTo(j.w * 0.15, -j.h * 0.55);
      ctx.lineTo(-j.w * 0.15, -j.h * 0.55);
      ctx.lineTo(-j.w * 0.28, -j.h * 0.1);
      ctx.closePath();
      ctx.fill();

      // Tail fin
      ctx.fillStyle = '#5a6878';
      ctx.beginPath();
      ctx.moveTo(-j.w * 0.3, j.h * 0.1);
      ctx.lineTo(-j.w * 0.38, j.h * 0.52);
      ctx.lineTo(-j.w * 0.15, j.h * 0.1);
      ctx.closePath();
      ctx.fill();

      // Engine glow
      ctx.fillStyle = 'rgba(255,160,30,0.7)';
      ctx.beginPath();
      ctx.ellipse(-j.w / 2, 0, 3 * s, j.h * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // DRAW: Bombs
  _drawBombs() {
    const ctx = this.ctx;
    const s   = this.scale;

    this.bombs.forEach(b => {
      ctx.fillStyle = '#444';
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, 3 * s, 5 * s, 0, 0, Math.PI * 2);
      ctx.fill();

      // Tail fins
      ctx.fillStyle = '#555';
      ctx.beginPath();
      ctx.moveTo(b.x - 3 * s, b.y - 3 * s);
      ctx.lineTo(b.x - 6 * s, b.y - 7 * s);
      ctx.lineTo(b.x, b.y - 3 * s);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(b.x + 3 * s, b.y - 3 * s);
      ctx.lineTo(b.x + 6 * s, b.y - 7 * s);
      ctx.lineTo(b.x, b.y - 3 * s);
      ctx.fill();
    });
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // DRAW: Paratroopers (falling)
  _drawParatroopers() {
    this.paratroopers.forEach(p => {
      if (!p.landed) this._drawPara(p);
    });
  }

  _drawPara(p) {
    const ctx    = this.ctx;
    const s      = this.scale;
    const cr     = PC.PARATROOPER.CHUTE_R * s;
    const bw     = PC.PARATROOPER.W * s;
    const bh     = PC.PARATROOPER.H * s;
    const swing  = p.chutePopped ? 0 : Math.sin(p.swingPhase || 0) * 0.1;

    ctx.save();
    ctx.translate(p.x, p.y);

    if (!p.chutePopped) {
      // Parachute dome
      const cGrad = ctx.createRadialGradient(-cr * 0.2, -cr * 0.7, 0, 0, -cr * 0.3, cr);
      cGrad.addColorStop(0,   '#ffffff');
      cGrad.addColorStop(0.35,'#dce8ff');
      cGrad.addColorStop(1,   '#8899cc');
      ctx.fillStyle = cGrad;
      ctx.beginPath();
      ctx.arc(0, -cr, cr, Math.PI, 0, false);
      ctx.fill();
      ctx.strokeStyle = 'rgba(70,80,140,0.4)';
      ctx.lineWidth   = 0.8 * s;
      ctx.beginPath();
      ctx.arc(0, -cr, cr, Math.PI, 0, false);
      ctx.stroke();

      // Chute panel lines
      ctx.strokeStyle = 'rgba(100,110,180,0.25)';
      ctx.lineWidth   = 0.6 * s;
      for (let i = 1; i <= 3; i++) {
        const angle = Math.PI + (Math.PI / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, -cr);
        ctx.lineTo(Math.cos(angle) * cr, -cr + Math.sin(angle) * cr);
        ctx.stroke();
      }

      // Suspension lines (3)
      ctx.strokeStyle = 'rgba(50,50,50,0.45)';
      ctx.lineWidth   = 0.65 * s;
      const anchors = [-cr, -cr * 0.25, cr];
      anchors.forEach((ax, idx) => {
        const targetX = idx === 0 ? -bw * 0.35 : idx === 1 ? 0 : bw * 0.35;
        ctx.beginPath();
        ctx.moveTo(ax, -cr);
        ctx.lineTo(targetX, 0);
        ctx.stroke();
      });
    }

    // Body (stick figure)
    ctx.save();
    ctx.rotate(swing);
    // Head
    const headR = bw * 0.2;
    ctx.fillStyle   = '#f0c090';
    ctx.strokeStyle = '#a06030';
    ctx.lineWidth   = 0.7 * s;
    ctx.beginPath();
    ctx.arc(0, headR, headR, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Torso
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth   = 1.3 * s;
    ctx.beginPath();
    ctx.moveTo(0, headR * 2);
    ctx.lineTo(0, bh * 0.64);
    ctx.stroke();

    // Arms
    ctx.beginPath();
    ctx.moveTo(-bw * 0.35, bh * 0.36);
    ctx.lineTo(bw * 0.35, bh * 0.36);
    ctx.stroke();

    // Legs
    ctx.lineWidth = 1.1 * s;
    const legSwing = p.chutePopped ? 0 : Math.sin((p.swingPhase || 0) * 1.6) * 0.15;
    ctx.beginPath();
    ctx.moveTo(0, bh * 0.64);
    ctx.lineTo(-bw * (0.28 + legSwing), bh);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, bh * 0.64);
    ctx.lineTo(bw * (0.28 - legSwing), bh);
    ctx.stroke();

    ctx.restore();
    ctx.restore();
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // DRAW: Landed paratroopers on ground
  _drawLandedTroopers(gY, highlight) {
    const ctx    = this.ctx;
    const s      = this.scale;
    const tx     = this.cw / 2;
    const bh     = PC.PARATROOPER.H * s;
    const bw     = PC.PARATROOPER.W * s;
    const spacing = 9 * s;
    const groundBase = gY;

    // Left side — stack from right-to-left
    for (let i = 0; i < this.landedLeft; i++) {
      const px = tx - 22 * s - i * spacing;
      const py = groundBase - bh;
      this._drawStandingTrooper(ctx, px, py, s, bh, bw, highlight && i === this.landedLeft - 1);
    }

    // Right side — stack from left-to-right
    for (let i = 0; i < this.landedRight; i++) {
      const px = tx + 22 * s + i * spacing;
      const py = groundBase - bh;
      this._drawStandingTrooper(ctx, px, py, s, bh, bw, highlight && i === this.landedRight - 1);
    }
  }

  _drawStandingTrooper(ctx, px, py, s, bh, bw, highlight) {
    ctx.save();
    ctx.translate(px, py);

    if (highlight) {
      ctx.shadowColor = '#ff4444';
      ctx.shadowBlur  = 8 * s;
    }

    // Head
    const headR = bw * 0.2;
    ctx.fillStyle   = '#f0c090';
    ctx.strokeStyle = '#a06030';
    ctx.lineWidth   = 0.6 * s;
    ctx.beginPath();
    ctx.arc(0, headR, headR, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Torso
    ctx.strokeStyle = '#2a3a2a';
    ctx.lineWidth   = 1.2 * s;
    ctx.beginPath();
    ctx.moveTo(0, headR * 2);
    ctx.lineTo(0, bh * 0.65);
    ctx.stroke();

    // Arms
    ctx.beginPath();
    ctx.moveTo(-bw * 0.34, bh * 0.38);
    ctx.lineTo(bw * 0.34, bh * 0.38);
    ctx.stroke();

    // Legs (standing straight)
    ctx.lineWidth = 1.0 * s;
    ctx.beginPath();
    ctx.moveTo(0, bh * 0.65);
    ctx.lineTo(-bw * 0.22, bh);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, bh * 0.65);
    ctx.lineTo(bw * 0.22, bh);
    ctx.stroke();

    ctx.restore();
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // DRAW: Bullets
  _drawBullets() {
    const ctx = this.ctx;
    const s   = this.scale;
    const r   = PC.BULLET.RADIUS * s;

    this.bullets.forEach(b => {
      const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
      grad.addColorStop(0,   '#ffffff');
      grad.addColorStop(0.4, '#ffe066');
      grad.addColorStop(1,   '#ff8800');

      ctx.shadowColor = '#ffe066';
      ctx.shadowBlur  = 5 * s;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // DRAW: Explosions
  _drawExplosions() {
    const ctx = this.ctx;
    const s   = this.scale;

    this.explosions.forEach(ex => {
      const t     = ex.t / PC.EXPLOSION.DURATION;
      const maxR  = PC.EXPLOSION.RADIUS_MAX * s;
      const r     = maxR * Math.sqrt(t);
      const alpha = 1 - t;

      // Outer bloom
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,90,0,${alpha * 0.55})`;
      ctx.fill();

      // Mid ring
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, r * 0.62, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,200,0,${alpha * 0.8})`;
      ctx.fill();

      // Core flash (early)
      if (t < 0.25) {
        ctx.beginPath();
        ctx.arc(ex.x, ex.y, r * 0.28, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${(0.25 - t) / 0.25})`;
        ctx.fill();
      }

      // Particles
      const count = ex.type === 'heli' ? 6 : 4;
      for (let k = 0; k < count; k++) {
        const angle = (k / count) * Math.PI * 2 + t * 4;
        const pr    = r * (0.6 + Math.sin(k * 2.3) * 0.3);
        const px    = ex.x + Math.cos(angle) * pr;
        const py    = ex.y + Math.sin(angle) * pr;
        ctx.beginPath();
        ctx.arc(px, py, 2 * s * alpha, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,150,0,${alpha * 0.7})`;
        ctx.fill();
      }
    });
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // DRAW: Ladder animation (4 troopers climb and overtake turret)
  _drawLadderAnim(gY) {
    const ctx     = this.ctx;
    const s       = this.scale;
    const cw      = this.cw;
    const t       = clamp(this._ladderTimer / PC.LADDER.ANIM_DURATION, 0, 1);
    const tx      = cw / 2;
    const side    = this._ladderSide;
    const bh      = PC.PARATROOPER.H * s;
    const bw      = PC.PARATROOPER.W * s;
    const spacing = 9 * s;

    // Draw all the landed troopers normally first
    this._drawLandedTroopers(gY, false);
    this._drawTurret(gY);

    // The 4 troopers on the active side climb in a column toward the turret
    const maxT  = PC.PARATROOPER.MAX_PER_SIDE;
    const destX = tx + (side === 0 ? -16 * s : 16 * s);

    for (let i = 0; i < maxT; i++) {
      // Each trooper starts at their ground position and climbs to a stacked position
      const startX = side === 0
        ? tx - 22 * s - i * spacing
        : tx + 22 * s + i * spacing;
      const startY = gY - bh;

      // Climb height: bottom trooper stays, top ones rise
      const stackY = gY - bh * (i + 1) - 2 * s * i;

      const px = lerp(startX, destX, t);
      const py = lerp(startY, stackY, t * (1 - 0.1 * i));

      this._drawStandingTrooper(ctx, px, py, s, bh, bw, false);
    }

    // Flash effect near end of animation
    if (t > 0.85) {
      const flashAlpha = (t - 0.85) / 0.15;
      ctx.fillStyle = `rgba(255,80,0,${flashAlpha * 0.45})`;
      ctx.fillRect(0, 0, cw, this.ch);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // HELPER: Rounded rect path
  _rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, r);
      return;
    }
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

  // ── Main Loop ────────────────────────────────────────────────────────────────

  _loop(ts) {
    this.animId = requestAnimationFrame(ts => this._loop(ts));

    // Delta time, capped at 100ms to avoid spiral of death on tab refocus
    let dt = 0;
    if (this._lastTs !== null && ts !== undefined) {
      dt = Math.min((ts - this._lastTs) / 1000, 0.1);
    }
    this._lastTs = ts;

    this._update(dt);
    this._draw();
  }
}

// ── Module export (for non-browser environments) ──────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ParachuteGame };
}
