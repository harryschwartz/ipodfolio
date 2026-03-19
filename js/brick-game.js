// Brick Breaker Game — ported from ipod-classic-js
// Canvas-based breakout game controlled by click wheel

const BASE_CANVAS = { WIDTH: 340, HEIGHT: 260 };

const GC = {
  PLAYER: {
    BOTTOM_OFFSET: 3, INITIAL_LIVES: 3, WIDTH: 70, HEIGHT: 8,
    SPEED: 3, SPEED_MULTIPLIER: 1, FRICTION: 0.85, VELOCITY_STOP: 0.1,
  },
  BALL: {
    LEFT_OFFSET: 8, RADIUS: 6, SPEED: 2, INITIAL_ANGLE: Math.PI / 4,
    LIGHT_OFFSET: 0.25, LIGHT_INNER: 0.05, GRAD_MID: 0.3,
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

class BrickGame {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.cw = 0;
    this.ch = 0;
    this.scale = 1;
    this.player = null;
    this.ball = null;
    this.bricks = [];
    this.waiting = true;
    this.inStasis = false;
    this.initialized = false;
    this.animId = null;
    this.listeners = [];
    this.hudEl = null;
    this.hudRightEl = null;
  }

  init(canvasEl, hudEl, hudRightEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.hudEl = hudEl;
    this.hudRightEl = hudRightEl;
    
    // Set canvas size to match screen content area
    const parent = canvasEl.parentElement;
    this.cw = canvasEl.width = parent.clientWidth;
    this.ch = canvasEl.height = parent.clientHeight;
    this.scale = this.cw / BASE_CANVAS.WIDTH;

    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';

    this.player = new BrickPlayer(this);
    this.ball = new BrickBall(this);
    
    this.setupBricks();
    this.waiting = true;
    this.inStasis = false;

    // Event listeners
    const onCenter = () => { if (this.waiting && !this.inStasis) this.waiting = false; };
    const onFwd = () => this.player.moveRight();
    const onBwd = () => this.player.moveLeft();
    const onMenu = () => { this.inStasis = true; };
    
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

  update() {
    this.clearBg();
    this.player.update();
    this.player.draw();
    this.drawBricks();
    this.ball.update();
    this.updateHUD();
    this.animId = requestAnimationFrame(() => this.update());
  }

  clearBg() {
    const g = this.ctx.createLinearGradient(0, 0, 0, this.ch);
    g.addColorStop(0.5, GC.CANVAS.BG.TOP);
    g.addColorStop(1, GC.CANVAS.BG.BOTTOM);
    this.ctx.fillStyle = g;
    this.ctx.fillRect(0, 0, this.cw, this.ch);
  }

  die() {
    this.player.position.x = (this.cw - this.player.size.width) / 2;
    this.player.position.y = this.ch - this.player.size.height - GC.PLAYER.BOTTOM_OFFSET * this.scale;
    this.player.lives--;
    if (this.player.lives < 1) this.reset();
    this.ball.resetPos();
    this.waiting = true;
  }

  reset() {
    this.player.reset();
    this.ball.resetPos();
    this.setupBricks();
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
    if (this.hudRightEl) this.hudRightEl.textContent = `Lives: ${this.player.lives}`;
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
  constructor(game) {
    this.game = game;
    this.radius = GC.BALL.RADIUS * game.scale;
    this.position = { x: GC.BALL.LEFT_OFFSET * game.scale, y: game.ch / 2 };
    this.size = { width: this.radius * 2, height: this.radius * 2 };
    this.physics = { speed: GC.BALL.SPEED * game.scale };
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
    if (this.position.y > this.game.ch) this.game.die();

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
