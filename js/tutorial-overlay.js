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
    const isMobile = vw <= 576;

    svgEl.setAttribute('width', vw);
    svgEl.setAttribute('height', vh);
    svgEl.style.position = 'fixed';
    svgEl.style.inset = '0';
    svgEl.style.pointerEvents = 'none';
    svgEl.style.zIndex = '10001';

    function centerOf(el) {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    const wheelRect = wheel.getBoundingClientRect();
    const wheelCx = wheelRect.left + wheelRect.width / 2;
    const wheelCy = wheelRect.top + wheelRect.height / 2;
    const wheelR = wheelRect.width / 2;

    const lineColor = 'rgba(255,255,255,0.35)';
    const dotColor = 'rgba(255,255,255,0.55)';

    function makeDot(x, y) {
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', x);
      dot.setAttribute('cy', y);
      dot.setAttribute('r', 3);
      dot.setAttribute('fill', dotColor);
      svgEl.appendChild(dot);
    }

    function makeLine(x1, y1, x2, y2) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1);
      line.setAttribute('y1', y1);
      line.setAttribute('x2', x2);
      line.setAttribute('y2', y2);
      line.setAttribute('stroke', lineColor);
      line.setAttribute('stroke-width', 1);
      svgEl.appendChild(line);
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
      el.style.top = y + 'px';
      el.style.transform = 'translateY(-50%)';

      const textDiv = document.createElement('div');
      textDiv.className = 'callout-label';

      if (align === 'right') {
        el.style.left = x + 'px';
        textDiv.classList.add('callout-label-right');
      } else if (align === 'left') {
        el.style.right = (vw - x) + 'px';
        textDiv.classList.add('callout-label-left');
      } else if (align === 'center') {
        el.style.left = x + 'px';
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

    if (isMobile) {
      // ---- MOBILE LAYOUT ----
      // On mobile, the wheel is large and centered. Labels go above/below or
      // very tight to the sides. Use compact labels.
      const gap = 8;

      // SCROLL WHEEL — label centered above the wheel
      const scrollDotAngle = -70; // upper-left of wheel ring
      const scrollRad = (scrollDotAngle * Math.PI) / 180;
      const scrollDotX = wheelCx + Math.cos(scrollRad) * (wheelR - 4);
      const scrollDotY = wheelCy + Math.sin(scrollRad) * (wheelR - 4);
      makeDot(scrollDotX, scrollDotY);
      // Label above the wheel, centered
      const scrollLabelY = wheelRect.top - 28;
      makeLabel('Scroll Wheel', 'Slide finger in a circle to browse', wheelCx, scrollLabelY, 'center');
      makeLine(scrollDotX, scrollDotY, wheelCx, scrollLabelY + 12);

      // MENU (top button)
      if (menuBtn) {
        const c = centerOf(menuBtn);
        makeDot(c.x, c.y);
        // Put label to the upper-left, angled line
        const labelX = gap + 8;
        const labelY = c.y - 12;
        makeLabel('Menu', 'Go back', labelX, labelY, 'right');
        // Measure label approximate right edge
        makePath(`M${c.x},${c.y} L${labelX + 60},${labelY}`);
      }

      // SELECT (center button)
      if (centerBtn) {
        const c = centerOf(centerBtn);
        makeDot(c.x + 10, c.y - 10); // offset dot slightly so it's visible on center button edge
        // Label to the right of the wheel
        const labelX = wheelRect.right + gap;
        const labelY = c.y - 20;
        makeLabel('Select', 'Press to choose', Math.min(labelX, vw - 100), labelY, 'right');
        makePath(`M${c.x + 10},${c.y - 10} L${Math.min(labelX, vw - 100) - 4},${labelY}`);
      }

      // PREVIOUS (left button)
      if (rewindBtn) {
        const c = centerOf(rewindBtn);
        makeDot(c.x, c.y);
        const labelX = gap + 8;
        const labelY = c.y + 14;
        makeLabel('Previous', 'Skip back', labelX, labelY, 'right');
        makePath(`M${c.x},${c.y} L${labelX + 68},${labelY}`);
      }

      // NEXT (right button)
      if (forwardBtn) {
        const c = centerOf(forwardBtn);
        makeDot(c.x, c.y);
        const labelX = wheelRect.right + gap;
        const labelY = c.y + 20;
        makeLabel('Next', 'Skip forward', Math.min(labelX, vw - 90), labelY, 'right');
        makePath(`M${c.x},${c.y} L${Math.min(labelX, vw - 90) - 4},${labelY}`);
      }

      // PLAY/PAUSE (bottom button)
      if (playPauseBtn) {
        const c = centerOf(playPauseBtn);
        makeDot(c.x, c.y);
        // Label below the wheel, centered
        const labelY = wheelRect.bottom + 28;
        makeLabel('Play / Pause', 'Control audio playback', wheelCx, labelY, 'center');
        makeLine(c.x, c.y, wheelCx, labelY - 12);
      }

    } else {
      // ---- DESKTOP LAYOUT ----
      // Labels to left and right of the wheel with connecting lines
      const labelGap = 16;

      function addDesktopCallout(title, desc, side, anchorAngleDeg, labelY) {
        const rad = (anchorAngleDeg * Math.PI) / 180;
        const dotX = wheelCx + Math.cos(rad) * (wheelR - 4);
        const dotY = wheelCy + Math.sin(rad) * (wheelR - 4);
        makeDot(dotX, dotY);

        if (side === 'left') {
          const labelRight = wheelRect.left - labelGap;
          makeLabel(title, desc, labelRight, labelY, 'left');
          if (Math.abs(dotY - labelY) > 4) {
            const midX = labelRight + (dotX - labelRight) * 0.3;
            makePath(`M${labelRight + 4},${labelY} L${midX},${labelY} L${dotX},${dotY}`);
          } else {
            makeLine(labelRight + 4, labelY, dotX, dotY);
          }
        } else {
          const labelLeft = wheelRect.right + labelGap;
          makeLabel(title, desc, labelLeft, labelY, 'right');
          if (Math.abs(dotY - labelY) > 4) {
            const midX = dotX + (labelLeft - dotX) * 0.7;
            makePath(`M${dotX},${dotY} L${midX},${labelY} L${labelLeft - 4},${labelY}`);
          } else {
            makeLine(dotX, dotY, labelLeft - 4, labelY);
          }
        }
      }

      // Menu (top) — left
      const menuC = menuBtn ? centerOf(menuBtn) : { y: wheelCy - wheelR * 0.6 };
      addDesktopCallout('Menu', 'Go back to the previous screen', 'left', -90, menuC.y);

      // Scroll Wheel — right, upper rim
      addDesktopCallout('Scroll Wheel', 'Slide finger in a circle to browse', 'right', -45, wheelCy - wheelR * 0.45);

      // Previous (left) — left
      const rewC = rewindBtn ? centerOf(rewindBtn) : { y: wheelCy };
      addDesktopCallout('Previous', 'Skip back', 'left', 180, rewC.y);

      // Select (center) — right
      const centerC = centerBtn ? centerOf(centerBtn) : { y: wheelCy };
      addDesktopCallout('Select', 'Press to choose an item', 'right', 0, centerC.y);

      // Next (right) — right, offset below select
      const fwdC = forwardBtn ? centerOf(forwardBtn) : { y: wheelCy };
      const nextLabelY = Math.abs(fwdC.y - centerC.y) < 40 ? centerC.y + 42 : fwdC.y;
      addDesktopCallout('Next', 'Skip forward', 'right', 15, nextLabelY);

      // Play/Pause (bottom) — left
      const ppC = playPauseBtn ? centerOf(playPauseBtn) : { y: wheelCy + wheelR * 0.6 };
      addDesktopCallout('Play / Pause', 'Control audio playback', 'left', 90, ppC.y);
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
