// Click Wheel interaction handler
// Ported from ipod-classic-js ClickWheel component

const ANGLE_OFFSET_THRESHOLD = 10; // degrees before scroll triggers
const PAN_THRESHOLD = 5; // pixels

// Haptic feedback support
const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;

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
    
    this.bindEvents();
  }

  // Short vibration pulse for scroll ticks (10ms like original iPod.js)
  triggerScrollHaptic() {
    if (this.hapticsEnabled && canVibrate) {
      navigator.vibrate(10);
    }
  }

  // Slightly stronger pulse for button presses
  triggerClickHaptic() {
    if (this.hapticsEnabled && canVibrate) {
      navigator.vibrate(15);
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
      this.isPanning = true;
      this.hasScrolled = false;
      this.startPoint = { x: e.clientX, y: e.clientY };
      this.lastPoint = { x: e.clientX, y: e.clientY };
      this.el.setPointerCapture(e.pointerId);
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
