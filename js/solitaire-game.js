// Klondike Solitaire — canvas-based, iPod click wheel controlled
// High-quality rebuild with proper card rendering and polished visuals

// ─── Constants ────────────────────────────────────────────────────────────────

const SOL_BASE = { WIDTH: 392, HEIGHT: 262 };

const SUITS  = ['♠', '♥', '♦', '♣'];
const RANKS  = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

function isRed(suit) { return suit === 1 || suit === 2; } // ♥ ♦

// Cursor index layout:
//  0 = stock
//  1 = waste
//  2..8 = tableau columns 0..6
//  9..12 = foundation piles 0..3
const N_CURSORS = 13;
const CUR_STOCK  = 0;
const CUR_WASTE  = 1;
const CUR_TAB    = i => 2 + i;
const CUR_FOUND  = i => 9 + i;

// ─── Card helpers ─────────────────────────────────────────────────────────────

function makeCard(suit, rank) {
  return { suit, rank, faceUp: false };
}

function rankVal(r) { return RANKS.indexOf(r); }

function canGoToFoundation(card, pile) {
  if (pile.length === 0) return card.rank === 'A';
  const top = pile[pile.length - 1];
  return top.suit === card.suit && rankVal(card.rank) === rankVal(top.rank) + 1;
}

function canGoToTableau(card, pile) {
  if (pile.length === 0) return card.rank === 'K';
  const top = pile[pile.length - 1];
  if (!top.faceUp) return false;
  return (isRed(card.suit) !== isRed(top.suit)) &&
         rankVal(card.rank) === rankVal(top.rank) - 1;
}

function newDeck() {
  const deck = [];
  for (let s = 0; s < 4; s++)
    for (let r = 0; r < 13; r++)
      deck.push(makeCard(s, RANKS[r]));
  return deck;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Win animation particle ────────────────────────────────────────────────────

class WinParticle {
  constructor(cw, ch) {
    this.reset(cw, ch);
  }
  reset(cw, ch) {
    this.x = Math.random() * cw;
    this.y = -20;
    this.vy = 1.5 + Math.random() * 2.5;
    this.vx = (Math.random() - 0.5) * 1.5;
    this.rot = Math.random() * Math.PI * 2;
    this.rotV = (Math.random() - 0.5) * 0.15;
    this.w = 6 + Math.random() * 6;
    this.h = this.w * 0.5;
    this.color = ['#FFD700','#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD'][Math.floor(Math.random()*7)];
    this.ch = ch;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.rot += this.rotV;
    return this.y < this.ch + 30;
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.fillStyle = this.color;
    ctx.fillRect(-this.w/2, -this.h/2, this.w, this.h);
    ctx.restore();
  }
}

// ─── SolitaireGame ────────────────────────────────────────────────────────────

class SolitaireGame {
  constructor() {
    this.canvas   = null;
    this.ctx      = null;
    this.cw = 0; this.ch = 0;
    this.scale    = 1;
    this.animId   = null;
    this.listeners = [];
    this.hudEl    = null;
    this.hudRightEl = null;

    // Game state
    this.stock      = [];
    this.waste      = [];
    this.tableau    = Array.from({ length: 7 }, () => []);
    this.foundation = Array.from({ length: 4 }, () => []);

    // UI state
    this.cursor   = 0;
    this.held     = null;   // { cards, returnFn }
    this.score    = 0;
    this.moves    = 0;
    this.won      = false;
    this.message  = '';
    this.msgTimer = 0;
    this.initialized = false;

    // Win animation
    this.particles = [];
    this.particleTimer = 0;

    // Layout cache
    this.L = {};

    // Pre-rendered card cache (offscreen canvases)
    this._cardCache = new Map();
    this._backCache = null;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  init(canvasEl, hudEl, hudRightEl) {
    this.canvas = canvasEl;
    this.ctx    = canvasEl.getContext('2d');
    this.hudEl  = hudEl;
    this.hudRightEl = hudRightEl;

    const parent = canvasEl.parentElement;
    this.cw = canvasEl.width  = parent.clientWidth  || SOL_BASE.WIDTH;
    this.ch = canvasEl.height = parent.clientHeight || SOL_BASE.HEIGHT;
    this.scale = this.cw / SOL_BASE.WIDTH;

    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';

    this._computeLayout();
    this._buildCardCache();
    this.deal();

    // Wire events
    const onFwd  = () => this._onScroll(1);
    const onBwd  = () => this._onScroll(-1);
    const onCtr  = () => this._onCenter();
    const onMenu = () => this._onMenu();

    window.addEventListener('forwardscroll',  onFwd,  true);
    window.addEventListener('backwardscroll', onBwd,  true);
    window.addEventListener('centerclick',    onCtr);
    window.addEventListener('menuclick',      onMenu);

    this.listeners = [
      ['forwardscroll',  onFwd,  true],
      ['backwardscroll', onBwd,  true],
      ['centerclick',    onCtr,  false],
      ['menuclick',      onMenu, false],
    ];

    this.initialized = true;
    this._loop();
  }

  cleanup() {
    if (this.animId) cancelAnimationFrame(this.animId);
    this.animId = null;
    this.listeners.forEach(([evt, fn, cap]) => window.removeEventListener(evt, fn, cap || false));
    this.listeners = [];
    this._cardCache.clear();
    this._backCache = null;
    this.initialized = false;
  }

  // ── Layout ──────────────────────────────────────────────────────────────────

  _computeLayout() {
    const cw = this.cw;
    const ch = this.ch;
    const sc = this.scale;

    // 7 columns with small margins
    const marginX  = Math.round(3 * sc);
    const gap       = Math.round(2.5 * sc);
    const totalW    = cw - 2 * marginX;
    const cardW     = Math.floor((totalW - 6 * gap) / 7);
    const cardH     = Math.round(cardW * 1.45);
    const cornerR   = Math.max(2, Math.round(2.5 * sc));

    // Top row: stock (col 0), waste (col 1), gap (col 2), foundations (col 3-6)
    const topRowY   = Math.round(4 * sc);
    const tabAreaY  = topRowY + cardH + Math.round(6 * sc);

    // Available height for tableau
    const tabAreaH  = ch - tabAreaY - Math.round(4 * sc);
    // Overlap step for face-down cards
    const faceDownStep = Math.round(Math.min(12 * sc, cardH * 0.18));
    // Overlap step for face-up cards (more visible)
    const faceUpStep   = Math.round(Math.min(18 * sc, cardH * 0.28));

    this.L = {
      marginX, gap, cardW, cardH, cornerR, sc,
      topRowY, tabAreaY,
      faceDownStep, faceUpStep,
    };
  }

  _colX(col) {
    const { marginX, cardW, gap } = this.L;
    return marginX + col * (cardW + gap);
  }

  // ── Card cache ──────────────────────────────────────────────────────────────

  _buildCardCache() {
    const { cardW, cardH, cornerR, sc } = this.L;

    // Build all 52 face-up cards
    for (let suit = 0; suit < 4; suit++) {
      for (let ri = 0; ri < 13; ri++) {
        const key = `${suit}_${ri}`;
        const off = document.createElement('canvas');
        off.width  = cardW;
        off.height = cardH;
        this._renderCardFace(off.getContext('2d'), { suit, rank: RANKS[ri], faceUp: true }, cardW, cardH, cornerR, sc);
        this._cardCache.set(key, off);
      }
    }

    // Build card back
    const back = document.createElement('canvas');
    back.width  = cardW;
    back.height = cardH;
    this._renderCardBack(back.getContext('2d'), cardW, cardH, cornerR, sc);
    this._backCache = back;
  }

  _renderCardFace(ctx, card, w, h, r, sc) {
    // White background with subtle gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#f5f5f5');
    ctx.fillStyle = grad;
    _roundRect(ctx, 0, 0, w, h, r);
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 0.7;
    _roundRect(ctx, 0, 0, w, h, r);
    ctx.stroke();

    const color = isRed(card.suit) ? '#C0102E' : '#111111';
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';
    ctx.textAlign    = 'left';

    // Rank font size
    const rankFs = Math.max(6, Math.round(w * 0.22));
    const suitFs = Math.max(5, Math.round(w * 0.18));
    const pad    = Math.max(2, Math.round(w * 0.06));

    // Top-left: rank
    ctx.font = `bold ${rankFs}px "Arial Narrow", Arial, sans-serif`;
    ctx.fillText(card.rank, pad, pad);

    // Top-left: suit symbol below rank
    ctx.font = `${suitFs}px Arial, sans-serif`;
    ctx.fillText(card.suit, pad + (card.rank === '10' ? 1 : 0), pad + rankFs + 1);

    // Center symbol — large
    const bigFs = Math.max(10, Math.round(w * 0.38));
    ctx.font = `${bigFs}px Arial, sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(card.suit, w / 2, h / 2);

    // Bottom-right: rotated rank + suit
    ctx.save();
    ctx.translate(w - pad, h - pad);
    ctx.rotate(Math.PI);
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `bold ${rankFs}px "Arial Narrow", Arial, sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(card.rank, 0, 0);
    ctx.font = `${suitFs}px Arial, sans-serif`;
    ctx.fillText(card.suit, 0, rankFs + 1);
    ctx.restore();

    // Inner border line for visual polish
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 0.5;
    _roundRect(ctx, 2, 2, w - 4, h - 4, Math.max(1, r - 1));
    ctx.stroke();
  }

  _renderCardBack(ctx, w, h, r, sc) {
    // Deep navy gradient
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#1a3a8f');
    grad.addColorStop(0.5, '#1e4db3');
    grad.addColorStop(1, '#122b6e');
    ctx.fillStyle = grad;
    _roundRect(ctx, 0, 0, w, h, r);
    ctx.fill();

    // Inner border
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 0.8;
    _roundRect(ctx, 2, 2, w - 4, h - 4, Math.max(1, r - 1));
    ctx.stroke();

    // Diagonal cross-hatch pattern clipped to inner area
    ctx.save();
    ctx.beginPath();
    _roundRect(ctx, 3, 3, w - 6, h - 6, Math.max(1, r - 2));
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 0.5;
    const step = Math.max(4, Math.round(4 * sc));
    for (let i = -(h + w); i < w + h + step; i += step) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i + h, 0); ctx.lineTo(i, h); ctx.stroke();
    }

    // Central diamond motif
    const cx = w / 2, cy = h / 2;
    const dw = w * 0.35, dh = h * 0.22;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx, cy - dh);
    ctx.lineTo(cx + dw, cy);
    ctx.lineTo(cx, cy + dh);
    ctx.lineTo(cx - dw, cy);
    ctx.closePath();
    ctx.stroke();

    ctx.restore();

    // Outer border
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 0.7;
    _roundRect(ctx, 0, 0, w, h, r);
    ctx.stroke();
  }

  // ── Game setup ──────────────────────────────────────────────────────────────

  deal() {
    const deck = shuffle(newDeck());
    this.stock     = [];
    this.waste     = [];
    this.tableau   = Array.from({ length: 7 }, () => []);
    this.foundation= Array.from({ length: 4 }, () => []);
    this.held      = null;
    this.score     = 0;
    this.moves     = 0;
    this.won       = false;
    this.cursor    = 0;
    this.message   = '';
    this.msgTimer  = 0;
    this.particles = [];

    let idx = 0;
    for (let col = 0; col < 7; col++) {
      for (let row = 0; row <= col; row++) {
        const card = deck[idx++];
        card.faceUp = (row === col);
        this.tableau[col].push(card);
      }
    }
    while (idx < deck.length) {
      this.stock.push(deck[idx++]);
    }
  }

  // ── Input ───────────────────────────────────────────────────────────────────

  _onScroll(dir) {
    if (this.won) return;
    this.cursor = (this.cursor + dir + N_CURSORS) % N_CURSORS;
  }

  _onCenter() {
    if (this.won) { this.deal(); return; }

    if (this.cursor === CUR_STOCK) {
      this._clickStock();
    } else if (this.cursor === CUR_WASTE) {
      this._clickWaste();
    } else if (this.cursor >= 2 && this.cursor <= 8) {
      this._clickTableau(this.cursor - 2);
    } else {
      this._clickFoundation(this.cursor - 9);
    }
    this._checkWin();
    this._updateHUD();
  }

  _onMenu() {
    if (this.held) this._returnHeld();
  }

  // ── Click handlers ──────────────────────────────────────────────────────────

  _clickStock() {
    if (this.held) { this._returnHeld(); return; }
    if (this.stock.length === 0) {
      // Recycle waste to stock (penalty)
      this.waste.slice().reverse().forEach(c => { c.faceUp = false; this.stock.push(c); });
      this.waste = [];
      this.score = Math.max(0, this.score - 100);
      this._flash('Recycled');
    } else {
      const card = this.stock.pop();
      card.faceUp = true;
      this.waste.push(card);
      this.moves++;
    }
  }

  _clickWaste() {
    if (this.held) { this._returnHeld(); return; }
    if (this.waste.length === 0) return;
    const card = this.waste.pop();
    this.held = {
      cards: [card],
      returnFn: () => { card.faceUp = true; this.waste.push(card); },
    };
  }

  _clickTableau(col) {
    const pile = this.tableau[col];

    if (this.held) {
      const topCard = this.held.cards[0];
      if (canGoToTableau(topCard, pile)) {
        this.held.cards.forEach(c => pile.push(c));
        const wasWaste = this.held.fromWaste;
        this.held = null;
        if (wasWaste) this.score += 5;
        this._autoFlip(col);
        this.score += 3;
        this.moves++;
      } else {
        this._flash('Invalid');
      }
      return;
    }

    if (pile.length === 0) return;
    const topCard = pile[pile.length - 1];

    if (!topCard.faceUp) {
      // Flip it
      topCard.faceUp = true;
      this.score += 5;
      this.moves++;
      return;
    }

    // Find start of face-up run from this column
    let runStart = pile.length - 1;
    while (
      runStart > 0 &&
      pile[runStart - 1].faceUp &&
      isRed(pile[runStart].suit) !== isRed(pile[runStart - 1].suit) &&
      rankVal(pile[runStart].rank) === rankVal(pile[runStart - 1].rank) - 1
    ) {
      runStart--;
    }

    const cards   = pile.splice(runStart);
    const fromCol = col;
    this.held = {
      cards,
      fromWaste: false,
      returnFn: () => { cards.forEach(c => this.tableau[fromCol].push(c)); },
    };
  }

  _clickFoundation(fi) {
    const pile = this.foundation[fi];

    if (this.held) {
      if (this.held.cards.length === 1 && canGoToFoundation(this.held.cards[0], pile)) {
        pile.push(this.held.cards[0]);
        this.held = null;
        this.score += 10;
        this.moves++;
        this._autoFlipAll();
      } else {
        this._flash('Invalid');
      }
      return;
    }

    if (pile.length === 0) return;
    const card = pile.pop();
    const fromFi = fi;
    this.held = {
      cards: [card],
      fromWaste: false,
      returnFn: () => { this.foundation[fromFi].push(card); },
    };
  }

  _returnHeld() {
    if (!this.held) return;
    this.held.returnFn();
    this.held = null;
  }

  _autoFlip(col) {
    const pile = this.tableau[col];
    if (pile.length > 0 && !pile[pile.length - 1].faceUp) {
      pile[pile.length - 1].faceUp = true;
      this.score += 5;
    }
  }

  _autoFlipAll() {
    for (let col = 0; col < 7; col++) this._autoFlip(col);
  }

  _flash(msg) {
    this.message  = msg;
    this.msgTimer = 80;
  }

  _checkWin() {
    const total = this.foundation.reduce((s, p) => s + p.length, 0);
    if (total === 52) {
      this.won    = true;
      this.score += 500;
      this.message  = 'YOU WIN!';
      this.msgTimer = Infinity;
    }
  }

  // ── Render loop ──────────────────────────────────────────────────────────────

  _loop() {
    this._draw();
    this._updateHUD();
    this.animId = requestAnimationFrame(() => this._loop());
  }

  _draw() {
    const ctx = this.ctx;
    const { cw, ch } = this;

    // ── Background: rich felt ──
    const bg = ctx.createLinearGradient(0, 0, 0, ch);
    bg.addColorStop(0, '#1a7a34');
    bg.addColorStop(1, '#15612a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cw, ch);

    // Subtle felt texture
    ctx.strokeStyle = 'rgba(0,0,0,0.04)';
    ctx.lineWidth   = 0.5;
    const ts = Math.round(5 * this.scale);
    for (let x = 0; x < cw; x += ts) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke();
    }
    for (let y = 0; y < ch; y += ts) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke();
    }

    this._drawAllPiles();
    this._drawHeld();
    this._drawCursorLabel();
    this._drawMessage();

    // Win overlay + confetti
    if (this.won) {
      this._drawWinOverlay();
    }
  }

  _drawAllPiles() {
    const { topRowY, tabAreaY, cardW, cardH } = this.L;

    // ── Stock (col 0 x) ──
    const sx = this._colX(0);
    this._drawSlot(sx, topRowY);
    if (this.stock.length > 0) {
      this._drawBack(sx, topRowY, this.cursor === CUR_STOCK);
      // Stack depth hint: draw 1-2 offset layers behind if multiple cards
      if (this.stock.length > 1) {
        this._drawDepthHint(sx, topRowY, Math.min(this.stock.length, 3));
      }
    } else {
      this._drawEmptySlot(sx, topRowY, this.cursor === CUR_STOCK, '↺');
    }

    // ── Waste (col 1 x) ──
    const wx = this._colX(1);
    this._drawSlot(wx, topRowY);
    if (this.waste.length > 0) {
      // Show up to 3 fanned cards for visual richness
      const count = Math.min(this.waste.length, 3);
      for (let i = 0; i < count - 1; i++) {
        const card = this.waste[this.waste.length - count + i];
        const offset = i * Math.round(3 * this.scale);
        this._drawCardAt(card, wx + offset, topRowY, false);
      }
      const topWaste = this.waste[this.waste.length - 1];
      this._drawCardAt(topWaste, wx, topRowY, this.cursor === CUR_WASTE);
    } else {
      this._drawEmptySlot(wx, topRowY, this.cursor === CUR_WASTE, '');
    }

    // ── Foundation piles (cols 3-6 x) ──
    for (let fi = 0; fi < 4; fi++) {
      const fx   = this._colX(3 + fi);
      const pile = this.foundation[fi];
      const active = this.cursor === CUR_FOUND(fi);
      this._drawSlot(fx, topRowY);
      if (pile.length > 0) {
        this._drawCardAt(pile[pile.length - 1], fx, topRowY, active);
      } else {
        this._drawEmptySlot(fx, topRowY, active, SUITS[fi]);
      }
    }

    // ── Tableau columns ──
    for (let col = 0; col < 7; col++) {
      const tx   = this._colX(col);
      const pile = this.tableau[col];
      const active = this.cursor === CUR_TAB(col);

      this._drawSlot(tx, tabAreaY);

      if (pile.length === 0) {
        this._drawEmptySlot(tx, tabAreaY, active, '');
        continue;
      }

      // Calculate Y positions for each card
      const yPositions = this._calcTabY(pile, tabAreaY);

      // Draw cards
      pile.forEach((card, i) => {
        const cy = yPositions[i];
        // Highlight: active column highlights the entire face-up run (bottom card too)
        const isTopCard = i === pile.length - 1;
        const isInRun   = active && card.faceUp;

        if (card.faceUp) {
          this._drawCardAt(card, tx, cy, isTopCard && active);
          // Green tint for selected run (non-top cards)
          if (active && !isTopCard) {
            const { cardW, cardH, cornerR } = this.L;
            this.ctx.strokeStyle = 'rgba(100,255,100,0.55)';
            this.ctx.lineWidth   = 1.5;
            _roundRect(this.ctx, tx, cy, cardW, cardH, cornerR);
            this.ctx.stroke();
          }
        } else {
          this._drawBack(tx, cy, false);
        }
      });

      // Active column: draw yellow highlight around the whole column
      if (active) {
        const { cardW, cardH, cornerR } = this.L;
        const topY = tabAreaY;
        const lastY = yPositions[yPositions.length - 1];
        const totalH = lastY + cardH - topY;
        this.ctx.strokeStyle = '#FFD700';
        this.ctx.lineWidth   = 2;
        _roundRect(this.ctx, tx - 1, topY - 1, cardW + 2, totalH + 2, cornerR + 1);
        this.ctx.stroke();
      }
    }
  }

  _calcTabY(pile, baseY) {
    const { faceDownStep, faceUpStep, cardH, ch } = this.L;
    const maxBottom = ch - Math.round(4 * this.scale);

    // First pass: natural positions
    const ys = [baseY];
    for (let i = 1; i < pile.length; i++) {
      const step = pile[i - 1].faceUp ? faceUpStep : faceDownStep;
      ys.push(ys[i - 1] + step);
    }

    // If last card bottom goes off-screen, compress
    const lastBottom = ys[pile.length - 1] + cardH;
    if (lastBottom > maxBottom) {
      const overflow = lastBottom - maxBottom;
      // Compress all steps proportionally
      const totalSteps = pile.length - 1;
      if (totalSteps > 0) {
        const reduce = overflow / totalSteps;
        for (let i = 1; i < pile.length; i++) {
          const step = pile[i - 1].faceUp ? faceUpStep : faceDownStep;
          ys[i] = ys[i - 1] + Math.max(3, step - reduce);
        }
      }
    }

    return ys;
  }

  // ── Card drawing ─────────────────────────────────────────────────────────────

  _drawCardAt(card, x, y, highlight) {
    const ctx = this.ctx;
    const { cardW, cardH, cornerR } = this.L;

    // Shadow
    ctx.save();
    ctx.shadowColor   = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur    = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 2;

    if (card.faceUp) {
      const key = `${card.suit}_${RANKS.indexOf(card.rank)}`;
      const cached = this._cardCache.get(key);
      if (cached) {
        ctx.drawImage(cached, x, y);
      }
    } else {
      const cached = this._backCache;
      if (cached) {
        ctx.drawImage(cached, x, y);
      }
    }

    ctx.restore();

    // Highlight border — drawn on top
    if (highlight) {
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth   = 2.5;
      ctx.shadowColor   = 'rgba(255,215,0,0.6)';
      ctx.shadowBlur    = 5;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      _roundRect(ctx, x, y, cardW, cardH, cornerR);
      ctx.stroke();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur  = 0;
    }
  }

  _drawBack(x, y, highlight) {
    const ctx = this.ctx;
    const { cardW, cardH, cornerR } = this.L;

    ctx.save();
    ctx.shadowColor   = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur    = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 2;
    if (this._backCache) ctx.drawImage(this._backCache, x, y);
    ctx.restore();

    if (highlight) {
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth   = 2.5;
      ctx.shadowColor   = 'rgba(255,215,0,0.6)';
      ctx.shadowBlur    = 5;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      _roundRect(ctx, x, y, cardW, cardH, cornerR);
      ctx.stroke();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur  = 0;
    }
  }

  _drawDepthHint(x, y, depth) {
    const ctx = this.ctx;
    const { cardW, cardH, cornerR } = this.L;
    // Draw shadow layers behind the top card to indicate stack depth
    for (let i = Math.min(depth - 1, 2); i >= 1; i--) {
      const ox = x - i * 1.5;
      const oy = y - i * 1.5;
      ctx.fillStyle = 'rgba(20,50,130,0.6)';
      ctx.beginPath();
      _roundRect(ctx, ox, oy, cardW, cardH, cornerR);
      ctx.fill();
    }
  }

  _drawSlot(x, y) {
    const ctx = this.ctx;
    const { cardW, cardH, cornerR } = this.L;
    ctx.fillStyle   = 'rgba(0,0,0,0.18)';
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth   = 0.8;
    _roundRect(ctx, x, y, cardW, cardH, cornerR);
    ctx.fill();
    ctx.stroke();
  }

  _drawEmptySlot(x, y, highlight, label) {
    const ctx = this.ctx;
    const { cardW, cardH, cornerR, sc } = this.L;

    if (highlight) {
      ctx.strokeStyle   = '#FFD700';
      ctx.lineWidth     = 2;
      ctx.shadowColor   = 'rgba(255,215,0,0.5)';
      ctx.shadowBlur    = 6;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      _roundRect(ctx, x, y, cardW, cardH, cornerR);
      ctx.stroke();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur  = 0;
    }

    if (label) {
      const fs = Math.max(7, Math.round(cardW * 0.32));
      ctx.font         = `${fs}px Arial, sans-serif`;
      ctx.fillStyle    = 'rgba(255,255,255,0.4)';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + cardW / 2, y + cardH / 2);
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }

  // ── Held card display ────────────────────────────────────────────────────────

  _drawHeld() {
    if (!this.held) return;
    const ctx = this.ctx;
    const { cardW, cardH, faceUpStep, sc } = this.L;
    const cards = this.held.cards;
    const n     = cards.length;

    // Float held cards at top-center of screen
    const totalH = cardH + (n - 1) * faceUpStep;
    const hx     = Math.round(this.cw / 2 - cardW / 2);
    const hy     = Math.round(this.ch / 2 - totalH / 2);

    // Semi-transparent backing
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    _roundRect(ctx, hx - 6, hy - 16, cardW + 12, totalH + cardH - faceUpStep + 22, 5);
    ctx.fill();

    // Label
    const fs = Math.max(6, Math.round(6 * sc));
    ctx.font         = `bold ${fs}px Arial, sans-serif`;
    ctx.fillStyle    = '#FFD700';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(n > 1 ? `Holding ${n} cards` : 'Holding — pick a destination', this.cw / 2, hy - 8);
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';

    cards.forEach((card, i) => {
      this._drawCardAt(card, hx, hy + i * faceUpStep, i === 0);
    });
  }

  // ── Cursor label ─────────────────────────────────────────────────────────────

  _drawCursorLabel() {
    const ctx = this.ctx;
    const sc  = this.scale;
    const labels = ['Stock','Waste','Col 1','Col 2','Col 3','Col 4','Col 5','Col 6','Col 7','♠ Found','♥ Found','♦ Found','♣ Found'];
    const label  = labels[this.cursor] || '';

    const fs = Math.max(6, Math.round(5.5 * sc));
    ctx.font         = `${fs}px Arial, sans-serif`;
    ctx.fillStyle    = 'rgba(255,255,255,0.55)';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`▸ ${label}`, this.cw / 2, this.ch - 2);
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // ── Flash message ────────────────────────────────────────────────────────────

  _drawMessage() {
    if (this.msgTimer <= 0 || this.won) return;
    this.msgTimer--;

    const ctx    = this.ctx;
    const sc     = this.scale;
    const alpha  = Math.min(1, this.msgTimer / 25);
    const fs     = Math.max(8, Math.round(9 * sc));

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font        = `bold ${fs}px Arial, sans-serif`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';

    const tw  = ctx.measureText(this.message).width;
    const px  = 10 * sc;
    const py  = 6 * sc;
    const bx  = this.cw / 2 - tw / 2 - px;
    const by  = this.ch / 2 - fs / 2 - py;

    ctx.fillStyle   = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    _roundRect(ctx, bx, by, tw + px * 2, fs + py * 2, 4 * sc);
    ctx.fill();

    ctx.fillStyle = '#FFD700';
    ctx.fillText(this.message, this.cw / 2, this.ch / 2);
    ctx.restore();
  }

  // ── Win overlay ───────────────────────────────────────────────────────────────

  _drawWinOverlay() {
    const ctx = this.ctx;
    const { cw, ch } = this;
    const sc = this.scale;

    // Darken
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, cw, ch);

    // Confetti
    this.particleTimer++;
    if (this.particleTimer % 3 === 0 && this.particles.length < 80) {
      this.particles.push(new WinParticle(cw, ch));
    }
    this.particles = this.particles.filter(p => {
      const alive = p.update();
      p.draw(ctx);
      return alive;
    });

    // Title
    const titleFs = Math.max(14, Math.round(15 * sc));
    ctx.font        = `bold ${titleFs}px Arial, sans-serif`;
    ctx.fillStyle   = '#FFD700';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor   = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur    = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
    ctx.fillText('YOU WIN!', cw / 2, ch / 2 - titleFs);

    const subFs = Math.max(7, Math.round(7 * sc));
    ctx.font      = `${subFs}px Arial, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`Score: ${this.score}  •  Moves: ${this.moves}`, cw / 2, ch / 2 + 2);
    ctx.fillText('Press center to play again', cw / 2, ch / 2 + subFs * 2);

    ctx.shadowColor  = 'transparent';
    ctx.shadowBlur   = 0;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // ── HUD ───────────────────────────────────────────────────────────────────────

  _updateHUD() {
    if (this.hudEl)      this.hudEl.textContent      = `Score: ${this.score}`;
    if (this.hudRightEl) this.hudRightEl.textContent = this.held
      ? `✋ ${this.held.cards.length}`
      : `Moves: ${this.moves}`;
  }
}

// ─── Shared rounded-rect helper (works without roundRect native support) ──────

function _roundRect(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
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
