// Tutorial Overlay — Shows how to use the iPod interface
// Displays callout labels for the click wheel and buttons.
// Appears as a full-page overlay on top of the iPod.
// On desktop: shown after dismissing the QR "best on mobile" screen.
// On mobile: shown immediately on first visit.
// Dismissed on any user interaction (touch/click/scroll/key).

(function () {
  'use strict';

  let overlayEl = null;
  let dismissed = false;

  function shouldShow() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) return false;
    return true;
  }

  function show() {
    if (dismissed || overlayEl) return;

    overlayEl = document.createElement('div');
    overlayEl.className = 'tutorial-overlay';
    overlayEl.setAttribute('role', 'dialog');
    overlayEl.setAttribute('aria-label', 'How to use the iPod interface');

    overlayEl.innerHTML = `
      <div class="tutorial-content">
        <div class="tutorial-title">How to Use</div>
        <svg class="tutorial-lines" xmlns="http://www.w3.org/2000/svg"></svg>
        <div class="tutorial-dismiss-hint">Tap anywhere to start</div>
      </div>
    `;

    document.body.appendChild(overlayEl);

    requestAnimationFrame(() => {
      buildCallouts();
      overlayEl.classList.add('tutorial-visible');
    });

    const dismissEvents = ['pointerdown', 'keydown'];
    function handleDismiss() {
      dismiss();
      dismissEvents.forEach(evt => document.removeEventListener(evt, handleDismiss, true));
    }
    setTimeout(() => {
      dismissEvents.forEach(evt => document.addEventListener(evt, handleDismiss, true));
    }, 400);
  }

  function buildCallouts() {
    if (!overlayEl) return;

    const wheel = document.querySelector('.clickwheel');
    const menuBtn = document.querySelector('.wheel-button.top');
    const centerBtn = document.querySelector('.center-button');
    const rewindBtn = document.querySelector('.wheel-button.left');
    const forwardBtn = document.querySelector('.wheel-button.right');
    const playPauseBtn = document.querySelector('.wheel-button.bottom');

    if (!wheel) return;

    const content = overlayEl.querySelector('.tutorial-content');
    const svgEl = overlayEl.querySelector('.tutorial-lines');
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    svgEl.setAttribute('width', vw);
    svgEl.setAttribute('height', vh);
    svgEl.style.position = 'fixed';
    svgEl.style.inset = '0';
    svgEl.style.pointerEvents = 'none';
    svgEl.style.zIndex = '10001';

    const lineColor = 'rgba(255,255,255,0.4)';
    const dotColor = 'rgba(255,255,255,0.7)';

    // Helper: get the center of an element in viewport coords
    function centerOf(el) {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    const wheelRect = wheel.getBoundingClientRect();
    const wheelCx = wheelRect.left + wheelRect.width / 2;
    const wheelCy = wheelRect.top + wheelRect.height / 2;
    const wheelR = wheelRect.width / 2;

    function makeDot(x, y) {
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', x);
      dot.setAttribute('cy', y);
      dot.setAttribute('r', 3);
      dot.setAttribute('fill', dotColor);
      svgEl.appendChild(dot);
    }

    function makePath(d) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('stroke', lineColor);
      path.setAttribute('stroke-width', 1);
      path.setAttribute('fill', 'none');
      svgEl.appendChild(path);
    }

    function makeLabel(title, desc, x, y, align) {
      const el = document.createElement('div');
      el.className = 'tutorial-callout';
      el.style.position = 'fixed';

      const textDiv = document.createElement('div');
      textDiv.className = 'callout-label';

      if (align === 'right') {
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.transform = 'translateY(-50%)';
        textDiv.classList.add('callout-label-right');
      } else if (align === 'left') {
        el.style.right = (vw - x) + 'px';
        el.style.top = y + 'px';
        el.style.transform = 'translateY(-50%)';
        textDiv.classList.add('callout-label-left');
      } else if (align === 'center') {
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.transform = 'translate(-50%, -50%)';
        textDiv.style.textAlign = 'center';
      }

      const titleSpan = document.createElement('span');
      titleSpan.className = 'callout-title';
      titleSpan.textContent = title;
      const descSpan = document.createElement('span');
      descSpan.className = 'callout-desc';
      descSpan.textContent = desc;
      textDiv.appendChild(titleSpan);
      textDiv.appendChild(descSpan);
      el.appendChild(textDiv);
      content.appendChild(el);
    }

    /**
     * For each button, the dot goes right on the button center.
     * The label goes to the left or right side of the wheel,
     * with a connecting line (possibly angled) from dot to label.
     *
     * side: 'left' means label is to the left of the wheel
     * side: 'right' means label is to the right of the wheel
     */
    function addCallout(title, desc, dotX, dotY, side, labelYOverride) {
      const labelY = labelYOverride !== undefined ? labelYOverride : dotY;
      const labelGap = 16;

      makeDot(dotX, dotY);

      if (side === 'left') {
        const labelX = wheelRect.left - labelGap;
        makeLabel(title, desc, labelX, labelY, 'left');
        // Line from label to dot
        if (Math.abs(dotY - labelY) > 4) {
          const midX = labelX + (dotX - labelX) * 0.35;
          makePath(`M${labelX + 4},${labelY} L${midX},${labelY} L${dotX},${dotY}`);
        } else {
          makePath(`M${labelX + 4},${labelY} L${dotX},${dotY}`);
        }
      } else {
        const labelX = wheelRect.right + labelGap;
        makeLabel(title, desc, labelX, labelY, 'right');
        if (Math.abs(dotY - labelY) > 4) {
          const midX = dotX + (labelX - dotX) * 0.65;
          makePath(`M${dotX},${dotY} L${midX},${labelY} L${labelX - 4},${labelY}`);
        } else {
          makePath(`M${dotX},${dotY} L${labelX - 4},${labelY}`);
        }
      }
    }

    // For mobile, a different layout is needed since the wheel is nearly full-width
    const isMobile = vw <= 576;

    if (isMobile) {
      // ---- MOBILE LAYOUT ----
      const gap = 8;

      // SCROLL WHEEL — label centered above the wheel
      // Dot on upper-left rim
      const scrollAngle = -70 * Math.PI / 180;
      const scrollDotX = wheelCx + Math.cos(scrollAngle) * (wheelR - 6);
      const scrollDotY = wheelCy + Math.sin(scrollAngle) * (wheelR - 6);
      makeDot(scrollDotX, scrollDotY);
      const scrollLabelY = wheelRect.top - 28;
      makeLabel('Scroll Wheel', 'Slide finger in a circle to browse', wheelCx, scrollLabelY, 'center');
      makePath(`M${scrollDotX},${scrollDotY} L${wheelCx},${scrollLabelY + 12}`);

      // MENU (top button) — label to the left
      if (menuBtn) {
        const c = centerOf(menuBtn);
        makeDot(c.x, c.y);
        const labelX = gap + 8;
        const labelY = c.y - 10;
        makeLabel('Menu', 'Go back', labelX, labelY, 'right');
        makePath(`M${c.x},${c.y} L${labelX + 55},${labelY}`);
      }

      // SELECT (center button) — label to the right
      if (centerBtn) {
        const c = centerOf(centerBtn);
        // Dot on center button edge (upper-right)
        const dotX = c.x + 20;
        const dotY = c.y - 20;
        makeDot(dotX, dotY);
        const labelX = wheelRect.right + gap;
        const labelY = c.y - 20;
        makeLabel('Select', 'Press to choose', Math.min(labelX, vw - 100), labelY, 'right');
        makePath(`M${dotX},${dotY} L${Math.min(labelX, vw - 100) - 4},${labelY}`);
      }

      // PREVIOUS (left button) — label to the left
      if (rewindBtn) {
        const c = centerOf(rewindBtn);
        makeDot(c.x, c.y);
        const labelX = gap + 8;
        const labelY = c.y + 14;
        makeLabel('Previous', 'Skip back', labelX, labelY, 'right');
        makePath(`M${c.x},${c.y} L${labelX + 68},${labelY}`);
      }

      // NEXT (right button) — label to the right
      if (forwardBtn) {
        const c = centerOf(forwardBtn);
        makeDot(c.x, c.y);
        const labelX = wheelRect.right + gap;
        const labelY = c.y + 20;
        makeLabel('Next', 'Skip forward', Math.min(labelX, vw - 90), labelY, 'right');
        makePath(`M${c.x},${c.y} L${Math.min(labelX, vw - 90) - 4},${labelY}`);
      }

      // PLAY/PAUSE (bottom button) — label centered below
      if (playPauseBtn) {
        const c = centerOf(playPauseBtn);
        makeDot(c.x, c.y);
        const labelY = wheelRect.bottom + 28;
        makeLabel('Play / Pause', 'Control audio playback', wheelCx, labelY, 'center');
        makePath(`M${c.x},${c.y} L${wheelCx},${labelY - 12}`);
      }

    } else {
      // ---- DESKTOP LAYOUT ----
      // Dot goes on the actual button center. Label goes to left or right of wheel.
      // This ensures the diagram is always anchored to the real element positions.

      // Menu (top) — left side
      if (menuBtn) {
        const c = centerOf(menuBtn);
        addCallout('Menu', 'Go back to the previous screen', c.x, c.y, 'left');
      }

      // Scroll Wheel — right side, dot on upper-right rim of the wheel ring
      {
        const scrollAngle = -45 * Math.PI / 180;
        const dotX = wheelCx + Math.cos(scrollAngle) * (wheelR - 6);
        const dotY = wheelCy + Math.sin(scrollAngle) * (wheelR - 6);
        // Label Y offset up so it doesn't collide with Select
        addCallout('Scroll Wheel', 'Slide finger in a circle to browse', dotX, dotY, 'right', wheelCy - wheelR * 0.45);
      }

      // Previous (left) — left side
      if (rewindBtn) {
        const c = centerOf(rewindBtn);
        addCallout('Previous', 'Skip back', c.x, c.y, 'left');
      }

      // Select (center) — right side
      if (centerBtn) {
        const c = centerOf(centerBtn);
        addCallout('Select', 'Press to choose an item', c.x, c.y, 'right');
      }

      // Next (right) — right side, offset label below Select if they'd overlap
      if (forwardBtn) {
        const fwdC = centerOf(forwardBtn);
        const centerC = centerBtn ? centerOf(centerBtn) : { y: wheelCy };
        const labelY = Math.abs(fwdC.y - centerC.y) < 40 ? centerC.y + 42 : fwdC.y;
        addCallout('Next', 'Skip forward', fwdC.x, fwdC.y, 'right', labelY);
      }

      // Play/Pause (bottom) — left side
      if (playPauseBtn) {
        const c = centerOf(playPauseBtn);
        addCallout('Play / Pause', 'Control audio playback', c.x, c.y, 'left');
      }
    }
  }

  function dismiss() {
    if (dismissed || !overlayEl) return;
    dismissed = true;
    overlayEl.classList.add('tutorial-dismissing');
    setTimeout(() => {
      if (overlayEl && overlayEl.parentNode) {
        overlayEl.parentNode.removeChild(overlayEl);
      }
      overlayEl = null;
    }, 400);
  }

  window.ipodTutorialOverlay = {
    shouldShow,
    show,
    dismiss,
    get isActive() { return !dismissed && !!overlayEl; },
  };
})();
