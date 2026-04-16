// Klondike Solitaire — canvas-based, iPod click wheel controlled
// Follows the same pattern as brick-game.js

const SOL_BASE = { WIDTH: 340, HEIGHT: 260 };

// Suits: 0=♠ 1=♥ 2=♦ 3=♣
const SUITS    = ['♠', '♥', '♦', '♣'];
const RANKS    = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const IS_RED   = s => s === 1 || s === 2;

// Cursor positions (linear):
// 0 = stock, 1 = waste, 2..8 = tableau cols 0..6, 9..12 = foundation 0..3
const N_CURSORS = 13;
const CUR_STOCK = 0;
const CUR_WASTE = 1;
const CUR_TAB   = i => 2 + i;   // i: 0..6
const CUR_FOUND = i => 9 + i;   // i: 0..3

// ─── Card helpers ─────────────────────────────────────────────────────────────

function makeCard(suit, rank) {
  return { suit, rank, faceUp: false };
}

function rankValue(r) { return RANKS.indexOf(r); } // 0=A .. 12=K

function canStackOnFoundation(card, pile) {
  if (pile.length === 0) return card.rank === 'A';
  const top = pile[pile.length - 1];
  return top.suit === card.suit && rankValue(card.rank) === rankValue(top.rank) + 1;
}

function canStackOnTableau(card, pile) {
  if (pile.length === 0) return card.rank === 'K';
  const top = pile[pile.length - 1];
  if (!top.faceUp) return false;
  const diffColor = IS_RED(card.suit) !== IS_RED(top.suit);
  return diffColor && rankValue(card.rank) === rankValue(top.rank) - 1;
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

// ─── SolitaireGame ────────────────────────────────────────────────────────────

class SolitaireGame {
  constructor() {
    this.canvas = null;
    this.ctx    = null;
    this.cw = 0; this.ch = 0;
    this.scale  = 1;
    this.animId = null;
    this.listeners = [];
    this.hudEl = null;
    this.hudRightEl = null;

    // Game state
    this.stock     = [];
    this.waste     = [];
    this.tableau   = Array.from({ length: 7 }, () => []);
    this.foundation= Array.from({ length: 4 }, () => []);

    // UI state
    this.cursor    = 0;        // current cursor position (0..12)
    this.held      = null;     // { cards: [], from: { type, index, count } } or null
    this.score     = 0;
    this.won       = false;
    this.message   = '';       // short feedback flash
    this.msgTimer  = 0;
    this.initialized = false;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  init(canvasEl, hudEl, hudRightEl) {
    this.canvas = canvasEl;
    this.ctx    = canvasEl.getContext('2d');
    this.hudEl  = hudEl;
    this.hudRightEl = hudRightEl;

    const parent = canvasEl.parentElement;
    this.cw = canvasEl.width  = parent.clientWidth;
    this.ch = canvasEl.height = parent.clientHeight;
    this.scale = this.cw / SOL_BASE.WIDTH;

    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';

    this.deal();

    // Event listeners
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
    this.initialized = false;
  }

  // ── Game setup ──────────────────────────────────────────────────────────────

  deal() {
    const deck = shuffle(newDeck());
    this.stock = [];
    this.waste = [];
    this.tableau = Array.from({ length: 7 }, () => []);
    this.foundation = Array.from({ length: 4 }, () => []);
    this.held = null;
    this.score = 0;
    this.won = false;
    this.cursor = 0;
    this.message = '';

    // Deal to tableau: col i gets i+1 cards, last card face up
    let idx = 0;
    for (let col = 0; col < 7; col++) {
      for (let row = 0; row <= col; row++) {
        const card = deck[idx++];
        card.faceUp = (row === col);
        this.tableau[col].push(card);
      }
    }
    // Remaining go to stock (face down)
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
    } else if (this.cursor >= 9 && this.cursor <= 12) {
      this._clickFoundation(this.cursor - 9);
    }
    this._checkWin();
  }

  _onMenu() {
    // Cancel held cards / go back to no selection
    if (this.held) {
      this._returnHeld();
    }
  }

  // ── Click handlers ──────────────────────────────────────────────────────────

  _clickStock() {
    if (this.held) { this._returnHeld(); return; }
    if (this.stock.length === 0) {
      // Recycle waste
      this.waste.reverse().forEach(c => { c.faceUp = false; this.stock.push(c); });
      this.waste = [];
      this.score = Math.max(0, this.score - 100);
    } else {
      const card = this.stock.pop();
      card.faceUp = true;
      this.waste.push(card);
      this.score += 5;
    }
  }

  _clickWaste() {
    if (this.held) { this._returnHeld(); return; }
    if (this.waste.length === 0) return;
    const card = this.waste[this.waste.length - 1];
    this.held = {
      cards: [card],
      from: { type: 'waste', index: null },
      returnFn: () => { /* card already on waste, just clear held */ }
    };
    this.waste.pop();
  }

  _clickTableau(col) {
    const pile = this.tableau[col];

    if (this.held) {
      // Try to place
      const topCard = this.held.cards[0];
      if (canStackOnTableau(topCard, pile)) {
        this.held.cards.forEach(c => pile.push(c));
        this.score += 5;
        this.held = null;
        // Try auto-flip top of source
        this._autoFlip();
      } else {
        this._flash('Invalid move');
      }
      return;
    }

    // Pick up: find topmost face-up run
    if (pile.length === 0) return;
    const topCard = pile[pile.length - 1];
    if (!topCard.faceUp) {
      // Flip it
      topCard.faceUp = true;
      this.score += 5;
      return;
    }

    // Pick up the face-up run from this column
    let runStart = pile.length - 1;
    while (runStart > 0 && pile[runStart - 1].faceUp &&
           IS_RED(pile[runStart].suit) !== IS_RED(pile[runStart - 1].suit) &&
           rankValue(pile[runStart].rank) === rankValue(pile[runStart - 1].rank) - 1) {
      runStart--;
    }

    const cards = pile.splice(runStart);
    const fromCol = col;
    this.held = {
      cards,
      from: { type: 'tableau', index: fromCol },
      returnFn: () => { cards.forEach(c => this.tableau[fromCol].push(c)); }
    };
  }

  _clickFoundation(fi) {
    const pile = this.foundation[fi];

    if (this.held) {
      // Only single cards can go to foundation
      if (this.held.cards.length === 1 && canStackOnFoundation(this.held.cards[0], pile)) {
        pile.push(this.held.cards[0]);
        this.score += 10;
        this.held = null;
        this._autoFlip();
      } else {
        this._flash('Invalid move');
      }
      return;
    }

    // Pick up top of foundation
    if (pile.length === 0) return;
    const card = pile[pile.length - 1];
    const fromFi = fi;
    pile.pop();
    this.held = {
      cards: [card],
      from: { type: 'foundation', index: fromFi },
      returnFn: () => { this.foundation[fromFi].push(card); }
    };
  }

  _returnHeld() {
    if (!this.held) return;
    this.held.returnFn();
    this.held = null;
  }

  _autoFlip() {
    // After placing, flip top face-down card of each tableau column
    for (let col = 0; col < 7; col++) {
      const pile = this.tableau[col];
      if (pile.length > 0 && !pile[pile.length - 1].faceUp) {
        pile[pile.length - 1].faceUp = true;
        this.score += 5;
      }
    }
  }

  _flash(msg) {
    this.message = msg;
    this.msgTimer = 90; // frames
  }

  _checkWin() {
    const total = this.foundation.reduce((s, p) => s + p.length, 0);
    if (total === 52) {
      this.won = true;
      this.score += 500;
      this.message = 'You Win!';
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
    const sc  = this.scale;
    const cw  = this.cw;
    const ch  = this.ch;

    // ── Background: green felt ──
    ctx.fillStyle = '#1a6b2f';
    ctx.fillRect(0, 0, cw, ch);

    // Subtle felt texture — fine cross lines
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = sc * 0.5;
    for (let x = 0; x < cw; x += sc * 6) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke();
    }
    for (let y = 0; y < ch; y += sc * 6) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke();
    }

    this._computeLayout();
    this._drawAllPiles();
    this._drawHeld();
    this._drawCursorLabel();

    // Flash message
    if (this.msgTimer > 0) {
      this.msgTimer--;
      const alpha = this.msgTimer === Infinity ? 1 : Math.min(1, this.msgTimer / 30);
      ctx.globalAlpha = alpha;
      const fs = Math.round(10 * sc);
      ctx.font = `bold ${fs}px sans-serif`;
      ctx.textAlign = 'center';
      const tw = ctx.measureText(this.message).width;
      const bx = cw / 2 - tw / 2 - 6 * sc;
      const by = ch / 2 - fs - 4 * sc;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.beginPath();
      ctx.roundRect(bx, by, tw + 12 * sc, fs + 8 * sc, 4 * sc);
      ctx.fill();
      ctx.fillStyle = '#FFD700';
      ctx.fillText(this.message, cw / 2, by + fs + 2 * sc);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }

    // Win overlay
    if (this.won) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, cw, ch);
      const fs = Math.round(13 * sc);
      ctx.font = `bold ${fs}px sans-serif`;
      ctx.fillStyle = '#FFD700';
      ctx.textAlign = 'center';
      ctx.fillText('🎉 You Win! 🎉', cw / 2, ch / 2 - fs);
      const fs2 = Math.round(8 * sc);
      ctx.font = `${fs2}px sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.fillText('Press center to play again', cw / 2, ch / 2 + 4 * sc);
      ctx.textAlign = 'left';
    }
  }

  _computeLayout() {
    const sc = this.scale;
    const cw = this.cw;
    const ch = this.ch;

    // Card dimensions (scaled to fit 7 columns)
    const marginX = 4 * sc;
    const gap     = 3 * sc;
    const totalW  = cw - 2 * marginX;
    const cardW   = (totalW - 6 * gap) / 7;
    const cardH   = cardW * 1.4;

    this.L = {
      marginX, gap, cardW, cardH,
      topRowY: 4 * sc,
      tabY:    cardH + 12 * sc,
      tabGap:  Math.min(14 * sc, (ch - cardH - 16 * sc - cardH) / 12), // vertical cascade gap
      cornerR: 2 * sc,
      sc,
    };
  }

  _colX(col) {
    const { marginX, cardW, gap } = this.L;
    return marginX + col * (cardW + gap);
  }

  _drawAllPiles() {
    const { topRowY, cardW, cardH } = this.L;

    // Stock (col 0 position)
    const stockX = this._colX(0);
    this._drawPileSlot(stockX, topRowY);
    if (this.stock.length > 0) {
      this._drawCardBack(stockX, topRowY, this.cursor === CUR_STOCK);
    } else {
      // Recycle symbol
      this._drawEmptySlot(stockX, topRowY, this.cursor === CUR_STOCK, '↺');
    }

    // Waste (col 1 position)
    const wasteX = this._colX(1);
    this._drawPileSlot(wasteX, topRowY);
    if (this.waste.length > 0) {
      const top = this.waste[this.waste.length - 1];
      this._drawCard(top, wasteX, topRowY, this.cursor === CUR_WASTE, false);
    } else {
      this._drawEmptySlot(wasteX, topRowY, this.cursor === CUR_WASTE, '');
    }

    // Foundation piles (cols 3..6 positions)
    for (let fi = 0; fi < 4; fi++) {
      const fx = this._colX(3 + fi);
      const pile = this.foundation[fi];
      const isActive = this.cursor === CUR_FOUND(fi);
      this._drawPileSlot(fx, topRowY);
      if (pile.length > 0) {
        this._drawCard(pile[pile.length - 1], fx, topRowY, isActive, false);
      } else {
        const sym = SUITS[fi];
        this._drawEmptySlot(fx, topRowY, isActive, sym);
      }
    }

    // Tableau columns
    for (let col = 0; col < 7; col++) {
      const tx = this._colX(col);
      const pile = this.tableau[col];
      const isActive = this.cursor === CUR_TAB(col);
      this._drawPileSlot(tx, this.L.tabY);

      if (pile.length === 0) {
        this._drawEmptySlot(tx, this.L.tabY, isActive, '');
      } else {
        pile.forEach((card, i) => {
          const cy = this.L.tabY + i * this.L.tabGap;
          const isTopCard = i === pile.length - 1;
          const highlight = isActive && isTopCard;
          if (card.faceUp) {
            this._drawCard(card, tx, cy, highlight, false);
          } else {
            this._drawCardBack(tx, cy, false);
          }
        });
        // Show highlight on pile slot if active and pile is empty (already handled above)
        // or re-draw highlight border around whole stack
        if (isActive) {
          const topY = this.L.tabY;
          const bottomCard = pile[pile.length - 1];
          const botY = this.L.tabY + (pile.length - 1) * this.L.tabGap;
          this._drawStackHighlight(tx, topY, botY);
        }
      }
    }
  }

  _drawCard(card, x, y, highlight, ghost) {
    const ctx = this.ctx;
    const { cardW, cardH, cornerR, sc } = this.L;

    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur  = 3 * sc;
    ctx.shadowOffsetX = 1 * sc;
    ctx.shadowOffsetY = 1 * sc;

    // Card face
    ctx.fillStyle = ghost ? 'rgba(255,255,255,0.5)' : '#fff';
    ctx.beginPath();
    ctx.roundRect(x, y, cardW, cardH, cornerR);
    ctx.fill();

    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

    // Border
    if (highlight) {
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2.5 * sc;
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 0.5 * sc;
    }
    ctx.beginPath();
    ctx.roundRect(x, y, cardW, cardH, cornerR);
    ctx.stroke();

    // Text
    const color = IS_RED(card.suit) ? '#c0102e' : '#111';
    ctx.fillStyle = color;

    const rankFs = Math.max(5, Math.round(6.5 * sc));
    const suitFs = Math.max(4, Math.round(5.5 * sc));
    ctx.font = `bold ${rankFs}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Top-left rank + suit
    const pad = 1.5 * sc;
    ctx.fillText(card.rank, x + pad, y + pad);
    ctx.font = `${suitFs}px sans-serif`;
    ctx.fillText(card.suit, x + pad, y + pad + rankFs + 0.5 * sc);

    // Center suit (large)
    const bigSuitFs = Math.max(8, Math.round(10 * sc));
    ctx.font = `${bigSuitFs}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(card.suit, x + cardW / 2, y + cardH / 2);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  _drawCardBack(x, y, highlight) {
    const ctx = this.ctx;
    const { cardW, cardH, cornerR, sc } = this.L;

    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur  = 3 * sc;
    ctx.shadowOffsetX = 1 * sc;
    ctx.shadowOffsetY = 1 * sc;

    ctx.fillStyle = '#1a3a8f';
    ctx.beginPath();
    ctx.roundRect(x, y, cardW, cardH, cornerR);
    ctx.fill();

    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

    // Cross-hatch pattern
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x + 1.5 * sc, y + 1.5 * sc, cardW - 3 * sc, cardH - 3 * sc, cornerR * 0.5);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 0.5 * sc;
    const step = 4 * sc;
    for (let i = -cardH; i < cardW + cardH; i += step) {
      ctx.beginPath(); ctx.moveTo(x + i, y); ctx.lineTo(x + i + cardH, y + cardH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + i + cardH, y); ctx.lineTo(x + i, y + cardH); ctx.stroke();
    }
    ctx.restore();

    // Border
    ctx.strokeStyle = highlight ? '#FFD700' : 'rgba(0,0,0,0.4)';
    ctx.lineWidth = highlight ? 2.5 * sc : 0.5 * sc;
    ctx.beginPath();
    ctx.roundRect(x, y, cardW, cardH, cornerR);
    ctx.stroke();
  }

  _drawPileSlot(x, y) {
    const ctx = this.ctx;
    const { cardW, cardH, cornerR, sc } = this.L;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 0.5 * sc;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.roundRect(x, y, cardW, cardH, cornerR);
    ctx.fill();
    ctx.stroke();
  }

  _drawEmptySlot(x, y, highlight, label) {
    const ctx = this.ctx;
    const { cardW, cardH, cornerR, sc } = this.L;

    if (highlight) {
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2 * sc;
      ctx.beginPath();
      ctx.roundRect(x, y, cardW, cardH, cornerR);
      ctx.stroke();
    }

    if (label) {
      const fs = Math.max(6, Math.round(8 * sc));
      ctx.font = `${fs}px sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + cardW / 2, y + cardH / 2);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }

  _drawStackHighlight(x, topY, bottomY) {
    // Draw a faint glow around the entire tableau column's face-up run
    // (the top card already has its own highlight border; this is subtle)
  }

  _drawHeld() {
    if (!this.held) return;
    // Draw held cards floating at the current cursor position (top of screen area)
    const { cardW, cardH, sc } = this.L;
    // Position: centered in the canvas, slightly transparent
    const totalCards = this.held.cards.length;
    const gap = this.L.tabGap;
    const totalH = cardH + (totalCards - 1) * gap;
    const hx = this.cw / 2 - cardW / 2;
    const hy = this.ch / 2 - totalH / 2;

    this.held.cards.forEach((card, i) => {
      this._drawCard(card, hx, hy + i * gap, i === 0, false);
    });

    // Label
    const fs = Math.round(6 * sc);
    this.ctx.font = `${fs}px sans-serif`;
    this.ctx.fillStyle = '#FFD700';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('Holding — press center to place', this.cw / 2, hy - 4 * sc);
    this.ctx.textAlign = 'left';
  }

  _drawCursorLabel() {
    const ctx = this.ctx;
    const sc  = this.scale;
    const labels = ['Stock', 'Waste', 'T1','T2','T3','T4','T5','T6','T7', 'F1','F2','F3','F4'];
    const label = labels[this.cursor] || '';

    // Small label at bottom
    const fs = Math.round(5.5 * sc);
    ctx.font = `${fs}px sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.textAlign = 'center';
    ctx.fillText(`▸ ${label}`, this.cw / 2, this.ch - 2 * sc);
    ctx.textAlign = 'left';
  }

  _updateHUD() {
    if (this.hudEl)      this.hudEl.textContent      = `Score: ${this.score}`;
    if (this.hudRightEl) this.hudRightEl.textContent = this.held ? `Holding ${this.held.cards.length}` : '';
  }
}
