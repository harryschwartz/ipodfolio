// Click Wheel interaction handler
// Ported from ipod-classic-js ClickWheel component

const ANGLE_OFFSET_THRESHOLD = 10; // degrees before scroll triggers
const PAN_THRESHOLD = 5; // pixels

// Haptic feedback support
const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;

// iOS Safari haptic support via <input type="checkbox" switch> trick
// Safari 17.4+ supports the switch attribute; iOS 18+ triggers Taptic Engine on toggle
// Based on: https://github.com/tijnjh/ios-haptics & https://github.com/lochie/web-haptics
const isCoarsePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
const supportsSwitchInput = (() => {
  try {
    const input = document.createElement('input');
    input.type = 'checkbox';
    return 'switch' in input;
  } catch { return false; }
})();
const canIOSHaptic = isCoarsePointer && supportsSwitchInput;

// Persistent haptic element for iOS click haptics (buttons only — doesn't work during pan gestures)
let _hapticLabel = null;
let _hapticReady = false;

function ensureHapticDOM() {
  if (_hapticReady || !canIOSHaptic) return;
  try {
    const id = 'ipod-haptic-switch';
    const label = document.createElement('label');
    label.setAttribute('for', id);
    label.textContent = 'Haptic feedback';
    label.style.position = 'fixed';
    label.style.bottom = '-9999px';
    label.style.left = '-9999px';
    label.style.opacity = '0';
    label.style.userSelect = 'none';
    label.style.zIndex = '-1';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.id = id;
    input.style.all = 'initial';
    input.style.appearance = 'auto';
    label.appendChild(input);
    document.body.appendChild(label);
    _hapticLabel = label;
    _hapticReady = true;
  } catch {}
}

function triggerIOSClickHaptic() {
  if (!_hapticReady) ensureHapticDOM();
  if (_hapticLabel) {
    try { _hapticLabel.click(); } catch {}
  }
}

// Web Audio tick sound for scroll feedback — works on ALL platforms including
// iOS silent mode. Uses an <audio> element with a looping silent WAV to keep
// the iOS audio session in "playback" mode permanently. The Web Audio API
// AudioContext inherits this routing, so tick sounds play regardless of the
// ringer/silent switch.
let _audioCtx = null;
let _tickBuffer = null;
let _lastTickTime = 0;
const TICK_MIN_INTERVAL = 30; // ms between ticks
const TICK_VOLUME = 0.15; // audible but not loud

// Persistent silent audio element — keeps iOS audio session in "playback" mode.
// Must stay playing (looping) for the entire page lifetime.
let _silentAudio = null;

function _ensureSilentAudio() {
  if (_silentAudio) return;
  try {
    // 1-sample silent WAV, looped forever
    _silentAudio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=');
    _silentAudio.setAttribute('playsinline', '');
    _silentAudio.loop = true;
    _silentAudio.volume = 0.001; // practically inaudible
  } catch {}
}

function _ensureAudioContext() {
  if (_audioCtx && _tickBuffer) return;
  try {
    if (!_audioCtx) {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (!_tickBuffer) {
      // Synthesize a short tick: brief noise burst (~3ms) through exponential decay
      const sr = _audioCtx.sampleRate;
      const len = Math.ceil(sr * 0.003); // 3ms
      _tickBuffer = _audioCtx.createBuffer(1, len, sr);
      const data = _tickBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.15));
      }
    }
  } catch {}
}

// Full unlock: silent audio + AudioContext creation + resume.
// Safe to call repeatedly — each step is idempotent.
function _fullAudioUnlock() {
  _ensureSilentAudio();
  _ensureAudioContext();
  // Start silent audio (iOS requires user gesture)
  if (_silentAudio && _silentAudio.paused) {
    _silentAudio.play().catch(() => {});
  }
  // Resume AudioContext if suspended
  if (_audioCtx && _audioCtx.state === 'suspended') {
    _audioCtx.resume().catch(() => {});
  }
}

// Attach unlock to EVERY user gesture type. Unlike the old approach that removed
// listeners after the first gesture, we keep them around. This handles edge cases
// where the first gesture doesn't fully unlock (e.g. passive touchstart on some
// browsers). Each call is cheap and idempotent.
(function earlyUnlock() {
  const opts = { capture: true, passive: true };
  // Also unlock on touchmove — this catches wheel pan gestures that may be
  // the user's very first interaction.
  for (const evt of ['touchstart', 'touchmove', 'pointerdown', 'mousedown', 'keydown', 'click']) {
    document.addEventListener(evt, _fullAudioUnlock, opts);
  }
})();

function playTickSound() {
  // Attempt unlock on every tick call — covers the case where the user's
  // first interaction is a wheel scroll (which fires before discrete taps).
  _fullAudioUnlock();

  if (!_audioCtx || !_tickBuffer) return;

  // If context is still suspended after our resume attempt, schedule the
  // tick to play as soon as it resumes (don't silently drop it).
  if (_audioCtx.state === 'suspended') {
    _audioCtx.resume().then(() => {
      _playTickNow();
    }).catch(() => {});
    return;
  }

  _playTickNow();
}

function _playTickNow() {
  if (!_audioCtx || !_tickBuffer) return;
  const now = performance.now();
  if (now - _lastTickTime < TICK_MIN_INTERVAL) return;
  _lastTickTime = now;
  try {
    const source = _audioCtx.createBufferSource();
    source.buffer = _tickBuffer;
    const gain = _audioCtx.createGain();
    gain.gain.value = TICK_VOLUME;
    source.connect(gain);
    gain.connect(_audioCtx.destination);
    source.start(0);
  } catch {}
}

class ClickWheel {
  constructor(element) {
    this.el = element;
    this.centerButton = element.querySelector('.center-button');
    this.menuButton = element.querySelector('.wheel-button.top');
    this.rewindButton = element.querySelector('.wheel-button.left');
    this.ffButton = element.querySelector('.wheel-button.right');
    this.playPauseButton = element.querySelector('.wheel-button.bottom');
    
    this.hasScrolled = false;
    this.startPoint = { x: 0, y: 0 };
    this.isPanning = false;
    this.lastPoint = { x: 0, y: 0 };
    this.hapticsEnabled = true; // can be toggled from Settings
    
    // Pre-initialize haptic systems
    if (canIOSHaptic) ensureHapticDOM();
    // Set up Web Audio tick for scroll feedback (always — works on all platforms)
    _ensureAudioContext();
    
    this.bindEvents();
  }

  // Scroll tick: always play audio tick + vibrate on supported devices
  triggerScrollHaptic() {
    // Audio tick always plays (works on all platforms, no ringer dependency)
    playTickSound();
    // Also vibrate on Android if haptics enabled
    if (this.hapticsEnabled && canVibrate) {
      navigator.vibrate(10);
    }
  }

  // Button press: vibrate on Android, Taptic Engine on iOS (checkbox trick works for clicks)
  triggerClickHaptic() {
    if (!this.hapticsEnabled) return;
    if (canVibrate) {
      navigator.vibrate(15);
    } else if (canIOSHaptic) {
      triggerIOSClickHaptic();
    }
  }

  getCircularBoundingInfo(rect) {
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const radius = Math.max(rect.width, rect.height) / 2;
    return { radius, centerPoint: { x: centerX, y: centerY } };
  }

  getAngleBetweenPoints(p1, p2) {
    return Math.round((Math.atan2(p1.y - p2.y, p1.x - p2.x) * 180) / Math.PI);
  }

  getScrollDirection(angleDelta) {
    if (Math.abs(angleDelta) > ANGLE_OFFSET_THRESHOLD * 2) {
      return angleDelta > 0 ? 'counter-clockwise' : 'clockwise';
    }
    return angleDelta > 0 ? 'clockwise' : 'counter-clockwise';
  }

  isPointWithin(point, element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return point.x >= rect.left && point.x <= rect.right &&
           point.y >= rect.top && point.y <= rect.bottom;
  }

  isPointInCenter(point) {
    if (!this.centerButton) return false;
    const rect = this.centerButton.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const r = rect.width / 2;
    const dx = point.x - cx;
    const dy = point.y - cy;
    return (dx * dx + dy * dy) <= (r * r);
  }

  dispatch(eventName) {
    window.dispatchEvent(new CustomEvent(eventName));
  }

  handleWheelPress(point) {
    this.triggerClickHaptic();
    if (this.isPointInCenter(point)) {
      this.dispatch('centerclick');
    } else if (this.isPointWithin(point, this.menuButton)) {
      this.dispatch('menuclick');
    } else if (this.isPointWithin(point, this.rewindButton)) {
      this.dispatch('backclick');
    } else if (this.isPointWithin(point, this.ffButton)) {
      this.dispatch('forwardclick');
    } else if (this.isPointWithin(point, this.playPauseButton)) {
      this.dispatch('playpauseclick');
    }
  }

  handlePanMove(clientX, clientY) {
    const rect = this.el.getBoundingClientRect();
    const { centerPoint } = this.getCircularBoundingInfo(rect);
    const currentPoint = { x: clientX, y: clientY };

    const startAngle = this.getAngleBetweenPoints(this.startPoint, centerPoint);
    const currentAngle = this.getAngleBetweenPoints(currentPoint, centerPoint);
    const angleDelta = currentAngle - startAngle;

    if (Math.abs(angleDelta) > ANGLE_OFFSET_THRESHOLD) {
      this.hasScrolled = true;
      this.startPoint = currentPoint;
      const direction = this.getScrollDirection(angleDelta);
      this.triggerScrollHaptic();
      this.dispatch(direction === 'clockwise' ? 'forwardscroll' : 'backwardscroll');
    }
  }

  bindEvents() {
    // Pointer events for unified mouse/touch handling
    this.el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      // Ensure audio is unlocked on wheel interaction too
      unlockSilentMode();
      unlockAudioContext();
      this.isPanning = true;
      this.hasScrolled = false;
      this.startPoint = { x: e.clientX, y: e.clientY };
      this.lastPoint = { x: e.clientX, y: e.clientY };
      this.el.setPointerCapture(e.pointerId);
      // Emit center press start for long-press detection
      if (this.isPointInCenter({ x: e.clientX, y: e.clientY })) {
        this.dispatch('centerpressstart');
      }
    });

    this.el.addEventListener('pointermove', (e) => {
      if (!this.isPanning) return;
      e.preventDefault();
      this.handlePanMove(e.clientX, e.clientY);
      this.lastPoint = { x: e.clientX, y: e.clientY };
    });

    this.el.addEventListener('pointerup', (e) => {
      if (!this.isPanning) return;
      e.preventDefault();
      this.isPanning = false;
      this.dispatch('centerpressend');
      
      const dx = e.clientX - this.startPoint.x;
      const dy = e.clientY - this.startPoint.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (!this.hasScrolled && dist < PAN_THRESHOLD) {
        this.handleWheelPress({ x: e.clientX, y: e.clientY });
      }
      
      setTimeout(() => { this.hasScrolled = false; }, 50);
    });

    this.el.addEventListener('pointercancel', () => {
      this.isPanning = false;
      this.hasScrolled = false;
    });

    // Keyboard support
    window.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          this.triggerScrollHaptic();
          this.dispatch('backwardscroll');
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.triggerScrollHaptic();
          this.dispatch('forwardscroll');
          break;
        case 'Enter':
          e.preventDefault();
          this.triggerClickHaptic();
          this.dispatch('centerclick');
          break;
        case 'Escape':
        case 'Backspace':
          e.preventDefault();
          this.triggerClickHaptic();
          this.dispatch('menuclick');
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.triggerClickHaptic();
          this.dispatch('backclick');
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.triggerClickHaptic();
          this.dispatch('forwardclick');
          break;
        case ' ':
          e.preventDefault();
          this.triggerClickHaptic();
          this.dispatch('playpauseclick');
          break;
      }
    });
  }
}
