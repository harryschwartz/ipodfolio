// Brick Breaker Game — ported from ipod-classic-js
// Canvas-based breakout game controlled by click wheel
// Features: levels, multi-ball, arcade-style leaderboard

const BASE_CANVAS = { WIDTH: 340, HEIGHT: 260 };

const GC = {
  PLAYER: {
    BOTTOM_OFFSET: 3, INITIAL_LIVES: 3, WIDTH: 70, HEIGHT: 8,
    SPEED: 3, SPEED_MULTIPLIER: 1, FRICTION: 0.85, VELOCITY_STOP: 0.1,
  },
  BALL: {
    LEFT_OFFSET: 8, RADIUS: 6, SPEED: 2, INITIAL_ANGLE: Math.PI / 4,
    LIGHT_OFFSET: 0.25, LIGHT_INNER: 0.05, GRAD_MID: 0.3,
    SPEED_INCREMENT: 0.3, // speed increase per level
  },
  BRICK: {
    TOP_MARGIN: 6, SPACING: 3, HEIGHT: 12, ROWS: 5, COLS: 8,
    COLORS: {
      RED:    { TOP: 'rgb(255,196,196)', BOTTOM: 'rgb(239,26,26)',   POINTS: 7 },
      ORANGE: { TOP: 'rgb(255,202,161)', BOTTOM: 'rgb(255,120,30)',  POINTS: 5 },
      YELLOW: { TOP: 'rgb(254,242,189)', BOTTOM: 'rgb(240,195,31)',  POINTS: 3 },
      GREEN:  { TOP: 'rgb(167,255,209)', BOTTOM: 'rgb(23,200,112)',  POINTS: 1 },
      BLUE:   { TOP: 'rgb(140,200,255)', BOTTOM: 'rgb(0,100,222)',   POINTS: 1 },
    }
  },
  CANVAS: {
    BG: { TOP: 'rgb(64,162,247)', BOTTOM: 'rgb(141,204,254)' },
    PLAYER_COLORS: { TOP: 'rgb(199,199,199)', MID: 'rgb(85,85,85)', BOTTOM: 'rgb(111,111,111)' },
    BALL_COLORS:   { CENTER: 'rgb(171,171,171)', MID: 'rgb(98,98,98)', EDGE: 'rgb(67,67,67)' },
    SHADOW: { COLOR: 'rgba(0,0,0,0.4)', BRICK_COLOR: 'rgba(0,0,0,0.3)', BLUR: 4, BRICK_BLUR: 3, OFFSET_Y: 2 },
    BORDER: { PLAYER: 'rgba(0,0,0,0.5)', LINE_WIDTH: 1 },
  },
  COLLISION: { MIN_ANGLE: Math.PI / 6, MAX_ANGLE: (5 * Math.PI) / 6 },
};

function mapRange(v, inMin, inMax, outMin, outMax) {
  return ((v - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}

function checkAABB(p1, s1, p2, s2) {
  return !(p1.y + s1.height < p2.y || p1.y > p2.y + s2.height ||
           p1.x > p2.x + s2.width || p1.x + s1.width < p2.x);
}

// Game states
const GAME_STATE = {
  PLAYING: 'playing',
  GAME_OVER: 'game_over',       // initials entry screen
  LEADERBOARD: 'leaderboard',   // viewing high scores
  LEVEL_CLEAR: 'level_clear',   // brief "Level X Clear!" message
};

class BrickGame {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.cw = 0;
    this.ch = 0;
    this.scale = 1;
    this.player = null;
    this.balls = [];
    this.bricks = [];
    this.waiting = true;
    this.inStasis = false;
    this.initialized = false;
    this.animId = null;
    this.listeners = [];
    this.hudEl = null;
    this.hudRightEl = null;

    // Level system
    this.level = 1;
    this.state = GAME_STATE.PLAYING;

    // Game over / initials entry
    this.initials = ['A', 'A', 'A'];
    this.initialsCursor = 0; // which letter (0-2) is being edited
    this.finalScore = 0;
    this.finalLevel = 1;

    // Leaderboard
    this.leaderboardScores = [];
    this.leaderboardLoading = false;
    this.leaderboardScroll = 0;

    // Level clear timer
    this.levelClearTimer = 0;
  }

  init(canvasEl, hudEl, hudRightEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.hudEl = hudEl;
    this.hudRightEl = hudRightEl;
    
    const parent = canvasEl.parentElement;
    this.cw = canvasEl.width = parent.clientWidth;
    this.ch = canvasEl.height = parent.clientHeight;
    this.scale = this.cw / BASE_CANVAS.WIDTH;

    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';

    this.player = new BrickPlayer(this);
    this.level = 1;
    this.state = GAME_STATE.PLAYING;
    this.spawnBalls();
    this.setupBricks();
    this.waiting = true;
    this.inStasis = false;

    // Event listeners
    const onCenter = () => this.handleCenter();
    const onFwd = () => this.handleForward();
    const onBwd = () => this.handleBackward();
    const onMenu = () => this.handleMenu();
    
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

    this.initialized = true;
    this.update();
  }

  cleanup() {
    if (this.animId) cancelAnimationFrame(this.animId);
    this.animId = null;
    this.listeners.forEach(([evt, fn]) => window.removeEventListener(evt, fn, true));
    this.listeners = [];
    this.initialized = false;
  }

  // --- Input handling per state ---
  handleCenter() {
    if (this.state === GAME_STATE.PLAYING) {
      if (this.waiting && !this.inStasis) this.waiting = false;
    } else if (this.state === GAME_STATE.GAME_OVER) {
      // Move cursor to next initial, or submit if at end
      this.initialsCursor++;
      if (this.initialsCursor > 2) {
        this.submitScore();
      }
    } else if (this.state === GAME_STATE.LEADERBOARD) {
      // Start new game from leaderboard
      this.restartGame();
    } else if (this.state === GAME_STATE.LEVEL_CLEAR) {
      // Skip the level clear animation
      this.startNextLevel();
    }
  }

  handleForward() {
    if (this.state === GAME_STATE.PLAYING) {
      this.player.moveRight();
    } else if (this.state === GAME_STATE.GAME_OVER) {
      // Cycle letter forward (A→B→...→Z→0→...→9→A)
      this.cycleInitial(1);
    } else if (this.state === GAME_STATE.LEADERBOARD) {
      this.leaderboardScroll = Math.min(this.leaderboardScroll + 1, Math.max(0, this.leaderboardScores.length - 8));
    }
  }

  handleBackward() {
    if (this.state === GAME_STATE.PLAYING) {
      this.player.moveLeft();
    } else if (this.state === GAME_STATE.GAME_OVER) {
      // Cycle letter backward
      this.cycleInitial(-1);
    } else if (this.state === GAME_STATE.LEADERBOARD) {
      this.leaderboardScroll = Math.max(0, this.leaderboardScroll - 1);
    }
  }

  handleMenu() {
    if (this.state === GAME_STATE.PLAYING) {
      this.inStasis = true;
    } else if (this.state === GAME_STATE.GAME_OVER) {
      // Move cursor back
      if (this.initialsCursor > 0) {
        this.initialsCursor--;
      }
    }
    // Leaderboard menu is handled by app.js navigateBack
  }

  cycleInitial(dir) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const idx = this.initialsCursor;
    if (idx > 2) return;
    const cur = chars.indexOf(this.initials[idx]);
    const next = (cur + dir + chars.length) % chars.length;
    this.initials[idx] = chars[next];
  }

  // --- Game loop ---
  update() {
    if (this.state === GAME_STATE.PLAYING) {
      this.clearBg();
      this.player.update();
      this.player.draw();
      this.drawBricks();
      this.balls.forEach(b => b.update());
      this.updateHUD();
      // Check if all bricks cleared
      if (this.bricks.length === 0) {
        this.state = GAME_STATE.LEVEL_CLEAR;
        this.levelClearTimer = 90; // ~1.5 seconds at 60fps
      }
    } else if (this.state === GAME_STATE.LEVEL_CLEAR) {
      this.drawLevelClear();
      this.levelClearTimer--;
      if (this.levelClearTimer <= 0) {
        this.startNextLevel();
      }
    } else if (this.state === GAME_STATE.GAME_OVER) {
      this.drawGameOver();
    } else if (this.state === GAME_STATE.LEADERBOARD) {
      this.drawLeaderboard();
    }
    this.animId = requestAnimationFrame(() => this.update());
  }

  clearBg() {
    const g = this.ctx.createLinearGradient(0, 0, 0, this.ch);
    g.addColorStop(0.5, GC.CANVAS.BG.TOP);
    g.addColorStop(1, GC.CANVAS.BG.BOTTOM);
    this.ctx.fillStyle = g;
    this.ctx.fillRect(0, 0, this.cw, this.ch);
  }

  // --- Level progression ---
  startNextLevel() {
    this.level++;
    this.setupBricks();
    this.player.position.x = (this.cw - this.player.size.width) / 2;
    this.spawnBalls();
    this.waiting = true;
    this.state = GAME_STATE.PLAYING;
  }

  spawnBalls() {
    this.balls = [];
    // Level 1 = 1 ball, level 2 = 2, etc. Max 5
    const numBalls = Math.min(this.level, 5);
    const baseSpeed = GC.BALL.SPEED + (this.level - 1) * GC.BALL.SPEED_INCREMENT;
    for (let i = 0; i < numBalls; i++) {
      const ball = new BrickBall(this, baseSpeed);
      // Stagger initial positions slightly
      ball.position.x = GC.BALL.LEFT_OFFSET * this.scale + i * 12 * this.scale;
      ball.position.y = this.ch / 2 - i * 8 * this.scale;
      // Vary angles slightly
      const angleOffset = (i - Math.floor(numBalls / 2)) * 0.15;
      ball.direction.x = Math.cos(GC.BALL.INITIAL_ANGLE + angleOffset);
      ball.direction.y = Math.sin(GC.BALL.INITIAL_ANGLE + angleOffset);
      this.balls.push(ball);
    }
  }

  die() {
    this.player.position.x = (this.cw - this.player.size.width) / 2;
    this.player.position.y = this.ch - this.player.size.height - GC.PLAYER.BOTTOM_OFFSET * this.scale;
    this.player.lives--;
    if (this.player.lives < 1) {
      // Game over — go to initials entry
      this.finalScore = this.player.score;
      this.finalLevel = this.level;
      this.state = GAME_STATE.GAME_OVER;
      this.initials = ['A', 'A', 'A'];
      this.initialsCursor = 0;
      return;
    }
    this.spawnBalls();
    this.waiting = true;
  }

  // Called when a single ball falls off — only die() when ALL balls are gone
  onBallLost(ball) {
    const idx = this.balls.indexOf(ball);
    if (idx !== -1) this.balls.splice(idx, 1);
    if (this.balls.length === 0) {
      this.die();
    }
  }

  restartGame() {
    this.level = 1;
    this.player.reset();
    this.spawnBalls();
    this.setupBricks();
    this.waiting = true;
    this.state = GAME_STATE.PLAYING;
    this.leaderboardScroll = 0;
  }

  reset() {
    this.restartGame();
  }

  setupBricks() {
    this.bricks = [];
    const colors = ['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE'];
    const rm = 4 * this.scale;
    const lm = 60 * this.scale;
    const aw = this.cw - rm - lm;
    const sp = GC.BRICK.SPACING * this.scale;
    const ts = (GC.BRICK.COLS - 1) * sp;
    const bw = (aw - ts) / GC.BRICK.COLS;
    const bh = GC.BRICK.HEIGHT * this.scale;

    colors.forEach((color, row) => {
      for (let i = 0; i < GC.BRICK.COLS; i++) {
        this.bricks.push({
          color,
          points: GC.BRICK.COLORS[color].POINTS,
          size: { width: bw, height: bh },
          position: {
            x: lm + i * (bw + sp),
            y: GC.BRICK.TOP_MARGIN * this.scale + row * (bh + sp),
          },
        });
      }
    });
  }

  drawBricks() {
    this.bricks.forEach(b => {
      const cc = GC.BRICK.COLORS[b.color];
      const sp = GC.BRICK.SPACING * this.scale;
      const w = b.size.width - sp;
      const h = b.size.height - sp;
      const g = this.ctx.createLinearGradient(b.position.x, b.position.y, b.position.x, b.position.y + h);
      g.addColorStop(0, cc.TOP);
      g.addColorStop(0.5, cc.BOTTOM);
      
      this.ctx.shadowColor = GC.CANVAS.SHADOW.BRICK_COLOR;
      this.ctx.shadowBlur = GC.CANVAS.SHADOW.BRICK_BLUR * this.scale;
      this.ctx.shadowOffsetX = 0;
      this.ctx.shadowOffsetY = GC.CANVAS.SHADOW.OFFSET_Y * this.scale;
      
      this.ctx.fillStyle = g;
      this.ctx.beginPath();
      this.ctx.roundRect(b.position.x, b.position.y, w, h, 0);
      this.ctx.fill();
      
      this.ctx.shadowColor = 'transparent';
      this.ctx.shadowBlur = 0;
      this.ctx.strokeStyle = cc.BOTTOM;
      this.ctx.lineWidth = GC.CANVAS.BORDER.LINE_WIDTH;
      this.ctx.stroke();
    });
  }

  updateHUD() {
    if (this.hudEl) this.hudEl.textContent = `Score: ${this.player.score}`;
    if (this.hudRightEl) this.hudRightEl.textContent = `Lv${this.level}  ♥${this.player.lives}`;
  }

  // --- Level Clear screen ---
  drawLevelClear() {
    this.clearBg();
    const c = this.ctx;
    const cx = this.cw / 2;
    const cy = this.ch / 2;
    const s = this.scale;

    c.fillStyle = 'rgba(0, 0, 0, 0.5)';
    c.fillRect(0, 0, this.cw, this.ch);

    c.fillStyle = '#fff';
    c.font = `bold ${20 * s}px "Chicago", "Geneva", sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(`Level ${this.level} Clear!`, cx, cy - 14 * s);

    c.font = `${11 * s}px "Chicago", "Geneva", sans-serif`;
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.fillText(`Score: ${this.player.score}`, cx, cy + 10 * s);
  }

  // --- Game Over / Initials Entry ---
  drawGameOver() {
    const c = this.ctx;
    const cx = this.cw / 2;
    const s = this.scale;

    // Background (same blue gradient as gameplay)
    this.clearBg();

    // "GAME OVER"
    c.fillStyle = '#fff';
    c.font = `bold ${18 * s}px "Chicago", "Geneva", sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('GAME OVER', cx, 24 * s);

    // Score and level
    c.font = `${11 * s}px "Chicago", "Geneva", sans-serif`;
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.fillText(`Score: ${this.finalScore}   Level: ${this.finalLevel}`, cx, 44 * s);

    // "Enter your initials"
    c.fillStyle = '#fff';
    c.font = `${10 * s}px "Chicago", "Geneva", sans-serif`;
    c.fillText('ENTER YOUR INITIALS', cx, 68 * s);

    // Draw the three initials
    const letterW = 28 * s;
    const letterH = 32 * s;
    const gap = 8 * s;
    const totalW = 3 * letterW + 2 * gap;
    const startX = cx - totalW / 2;
    const letterY = 84 * s;

    for (let i = 0; i < 3; i++) {
      const x = startX + i * (letterW + gap);
      const isActive = i === this.initialsCursor && this.initialsCursor <= 2;

      // Box background
      c.fillStyle = isActive ? 'rgba(64,162,247,0.8)' : 'rgba(255,255,255,0.15)';
      c.fillRect(x, letterY, letterW, letterH);

      // Border
      c.strokeStyle = isActive ? '#fff' : 'rgba(255,255,255,0.3)';
      c.lineWidth = isActive ? 2 * s : 1 * s;
      c.strokeRect(x, letterY, letterW, letterH);

      // Letter
      c.fillStyle = '#fff';
      c.font = `bold ${20 * s}px "Chicago", "Geneva", monospace`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(this.initials[i], x + letterW / 2, letterY + letterH / 2);

      // Up/down arrows on active
      if (isActive) {
        c.font = `${8 * s}px sans-serif`;
        c.fillStyle = 'rgba(255,255,255,0.6)';
        c.fillText('▲', x + letterW / 2, letterY - 5 * s);
        c.fillText('▼', x + letterW / 2, letterY + letterH + 8 * s);
      }
    }

    // Instructions
    c.font = `${8 * s}px "Chicago", "Geneva", sans-serif`;
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.textAlign = 'center';
    if (this.initialsCursor <= 2) {
      c.fillText('Scroll to change • Select to confirm', cx, this.ch - 14 * s);
      c.fillText('Menu to go back', cx, this.ch - 4 * s);
    } else {
      c.fillText('Submitting...', cx, this.ch - 10 * s);
    }
  }

  // --- Submit score to Supabase ---
  async submitScore() {
    const initStr = this.initials.join('');
    try {
      const url = `${SUPABASE_URL}/rest/v1/brick_breaker_scores`;
      await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          initials: initStr,
          score: this.finalScore,
          level: this.finalLevel,
        }),
      });
    } catch (e) {
      console.warn('Failed to submit score:', e);
    }
    // Show leaderboard
    this.state = GAME_STATE.LEADERBOARD;
    this.leaderboardScroll = 0;
    this.fetchLeaderboard();
  }

  async fetchLeaderboard() {
    this.leaderboardLoading = true;
    try {
      const url = `${SUPABASE_URL}/rest/v1/brick_breaker_scores?select=initials,score,level&order=score.desc&limit=50`;
      const res = await fetch(url, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });
      this.leaderboardScores = await res.json();
    } catch (e) {
      console.warn('Failed to fetch leaderboard:', e);
      this.leaderboardScores = [];
    }
    this.leaderboardLoading = false;
  }

  // --- Leaderboard screen ---
  drawLeaderboard() {
    const c = this.ctx;
    const s = this.scale;
    const cx = this.cw / 2;

    // Background (same blue gradient as gameplay)
    this.clearBg();

    // Title
    c.fillStyle = '#fff';
    c.font = `bold ${14 * s}px "Chicago", "Geneva", sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('HIGH SCORES', cx, 14 * s);

    // Divider line
    c.strokeStyle = 'rgba(255,255,255,0.3)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(10 * s, 24 * s);
    c.lineTo(this.cw - 10 * s, 24 * s);
    c.stroke();

    if (this.leaderboardLoading) {
      c.font = `${10 * s}px "Chicago", "Geneva", sans-serif`;
      c.fillStyle = 'rgba(255,255,255,0.5)';
      c.fillText('Loading...', cx, this.ch / 2);
    } else if (this.leaderboardScores.length === 0) {
      c.font = `${10 * s}px "Chicago", "Geneva", sans-serif`;
      c.fillStyle = 'rgba(255,255,255,0.5)';
      c.fillText('No scores yet', cx, this.ch / 2);
    } else {
      // Column headers
      const rowH = 18 * s;
      const startY = 32 * s;
      const rankX = 14 * s;
      const nameX = 40 * s;
      const lvlX = this.cw - 78 * s;
      const scoreX = this.cw - 14 * s;

      c.font = `${8 * s}px "Chicago", "Geneva", sans-serif`;
      c.fillStyle = 'rgba(255,255,255,0.4)';
      c.textAlign = 'left';
      c.fillText('#', rankX, startY - 4 * s);
      c.fillText('NAME', nameX, startY - 4 * s);
      c.fillText('LV', lvlX, startY - 4 * s);
      c.textAlign = 'right';
      c.fillText('SCORE', scoreX, startY - 4 * s);

      // Rows
      const maxVisible = Math.floor((this.ch - startY - 20 * s) / rowH);
      const visibleScores = this.leaderboardScores.slice(this.leaderboardScroll, this.leaderboardScroll + maxVisible);

      visibleScores.forEach((entry, i) => {
        const rank = this.leaderboardScroll + i + 1;
        const y = startY + i * rowH;
        const isNew = entry.initials === this.initials.join('') && entry.score === this.finalScore;

        c.font = `${10 * s}px "Chicago", "Geneva", monospace`;
        c.fillStyle = isNew ? 'rgb(64,162,247)' : '#fff';

        c.textAlign = 'left';
        c.fillText(`${rank}.`, rankX, y + rowH / 2);
        c.fillText(entry.initials, nameX, y + rowH / 2);
        c.fillText(`${entry.level}`, lvlX, y + rowH / 2);
        c.textAlign = 'right';
        c.fillText(`${entry.score}`, scoreX, y + rowH / 2);
      });
    }

    // Bottom instructions
    c.font = `${8 * s}px "Chicago", "Geneva", sans-serif`;
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.textAlign = 'center';
    c.fillText('Press Select to play again', cx, this.ch - 4 * s);
  }
}

class BrickPlayer {
  constructor(game) {
    this.game = game;
    this.size = { width: GC.PLAYER.WIDTH * game.scale, height: GC.PLAYER.HEIGHT * game.scale };
    this.position = {
      x: (game.cw - this.size.width) / 2,
      y: game.ch - this.size.height - GC.PLAYER.BOTTOM_OFFSET * game.scale,
    };
    this.score = 0;
    this.lives = GC.PLAYER.INITIAL_LIVES;
    this.physics = {
      speed: GC.PLAYER.SPEED * game.scale,
      velocity: 0,
      friction: GC.PLAYER.FRICTION,
    };
  }

  draw() {
    const c = this.game.ctx;
    const g = c.createLinearGradient(this.position.x, this.position.y, this.position.x, this.position.y + this.size.height);
    g.addColorStop(0, GC.CANVAS.PLAYER_COLORS.TOP);
    g.addColorStop(0.5, GC.CANVAS.PLAYER_COLORS.MID);
    g.addColorStop(1, GC.CANVAS.PLAYER_COLORS.BOTTOM);
    
    c.shadowColor = GC.CANVAS.SHADOW.COLOR;
    c.shadowBlur = GC.CANVAS.SHADOW.BLUR * this.game.scale;
    c.shadowOffsetX = 0;
    c.shadowOffsetY = GC.CANVAS.SHADOW.OFFSET_Y * this.game.scale;
    c.fillStyle = g;
    c.fillRect(this.position.x, this.position.y, this.size.width, this.size.height);
    
    c.shadowColor = 'transparent'; c.shadowBlur = 0;
    c.strokeStyle = GC.CANVAS.BORDER.PLAYER;
    c.lineWidth = GC.CANVAS.BORDER.LINE_WIDTH * this.game.scale;
    c.strokeRect(this.position.x, this.position.y, this.size.width, this.size.height);
  }

  update() {
    this.position.x += this.physics.velocity;
    this.physics.velocity *= this.physics.friction;
    if (Math.abs(this.physics.velocity) < GC.PLAYER.VELOCITY_STOP) this.physics.velocity = 0;
    this.position.x = Math.max(0, Math.min(this.game.cw - this.size.width, this.position.x));
  }

  moveLeft() {
    const amt = this.physics.speed * GC.PLAYER.SPEED_MULTIPLIER;
    this.physics.velocity -= amt;
    this.physics.velocity = Math.max(-this.physics.speed * 3, this.physics.velocity);
  }

  moveRight() {
    const amt = this.physics.speed * GC.PLAYER.SPEED_MULTIPLIER;
    this.physics.velocity += amt;
    this.physics.velocity = Math.min(this.physics.speed * 3, this.physics.velocity);
  }

  reset() {
    this.lives = GC.PLAYER.INITIAL_LIVES;
    this.score = 0;
    this.position.x = (this.game.cw - this.size.width) / 2;
    this.position.y = this.game.ch - this.size.height - GC.PLAYER.BOTTOM_OFFSET * this.game.scale;
  }
}

class BrickBall {
  constructor(game, speed) {
    this.game = game;
    this.radius = GC.BALL.RADIUS * game.scale;
    this.position = { x: GC.BALL.LEFT_OFFSET * game.scale, y: game.ch / 2 };
    this.size = { width: this.radius * 2, height: this.radius * 2 };
    this.physics = { speed: (speed || GC.BALL.SPEED) * game.scale };
    this.direction = {
      x: Math.cos(GC.BALL.INITIAL_ANGLE),
      y: Math.sin(GC.BALL.INITIAL_ANGLE),
    };
  }

  draw() {
    const c = this.game.ctx;
    const x = this.position.x, y = this.position.y;
    const g = c.createRadialGradient(
      x - this.radius * GC.BALL.LIGHT_OFFSET,
      y - this.radius * GC.BALL.LIGHT_OFFSET,
      this.radius * GC.BALL.LIGHT_INNER,
      x, y, this.radius
    );
    g.addColorStop(0, GC.CANVAS.BALL_COLORS.CENTER);
    g.addColorStop(GC.BALL.GRAD_MID, GC.CANVAS.BALL_COLORS.MID);
    g.addColorStop(1, GC.CANVAS.BALL_COLORS.EDGE);
    
    c.shadowColor = GC.CANVAS.SHADOW.COLOR;
    c.shadowBlur = GC.CANVAS.SHADOW.BLUR * this.game.scale;
    c.shadowOffsetX = 0;
    c.shadowOffsetY = GC.CANVAS.SHADOW.OFFSET_Y * this.game.scale;
    
    c.beginPath();
    c.arc(x, y, this.radius, 0, 2 * Math.PI);
    c.fillStyle = g;
    c.fill();
    c.shadowColor = 'transparent'; c.shadowBlur = 0;
  }

  resetPos() {
    this.position.x = GC.BALL.LEFT_OFFSET * this.game.scale;
    this.position.y = this.game.ch / 2;
    this.direction.x = Math.cos(GC.BALL.INITIAL_ANGLE);
    this.direction.y = Math.sin(GC.BALL.INITIAL_ANGLE);
  }

  update() {
    if (this.position.x < 0 || this.position.x > this.game.cw) this.direction.x = -this.direction.x;
    if (this.position.y < 0) this.direction.y = -this.direction.y;
    if (this.position.y > this.game.ch) {
      this.game.onBallLost(this);
      return;
    }

    if (!this.game.waiting && !this.game.inStasis) {
      this.checkPlayer();
      this.checkBricks();
      this.position.x += this.physics.speed * this.direction.x;
      this.position.y += this.physics.speed * this.direction.y;
    }
    this.draw();
  }

  checkPlayer() {
    const p = this.game.player;
    if (!checkAABB(this.position, this.size, p.position, p.size)) return;
    const hit = this.position.x - p.position.x;
    const angle = mapRange(hit, 0, p.size.width, GC.COLLISION.MIN_ANGLE, GC.COLLISION.MAX_ANGLE);
    this.direction.x = -Math.cos(angle);
    this.direction.y = -Math.sin(angle);
  }

  checkBricks() {
    for (let i = this.game.bricks.length - 1; i >= 0; i--) {
      const b = this.game.bricks[i];
      if (!checkAABB(this.position, this.size, b.position, b.size)) continue;
      this.game.player.score += b.points;
      this.game.bricks.splice(i, 1);
      
      if (this.direction.x > 0 && this.direction.y > 0) {
        if (this.position.y > b.position.y) this.direction.x = -this.direction.x;
        else this.direction.y = -this.direction.y;
      } else if (this.direction.x < 0 && this.direction.y > 0) {
        if (this.position.y > b.position.y) this.direction.x = -this.direction.x;
        else this.direction.y = -this.direction.y;
      } else if (this.direction.x > 0 && this.direction.y < 0) {
        if (this.position.x > b.position.x) this.direction.y = -this.direction.y;
        else this.direction.x = -this.direction.x;
      } else {
        if (this.position.x > b.position.x + b.size.width) this.direction.x = -this.direction.x;
        else this.direction.y = -this.direction.y;
      }
      break;
    }
  }
}
