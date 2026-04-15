// Tutorial Overlay — Shows how to use the iPod interface
// Displays callout labels for the click wheel and buttons.
// On desktop: shown after dismissing the QR "best on mobile" screen.
// On mobile: shown immediately on first visit.
// Dismissed on any user interaction.

(function () {
  'use strict';

  let overlayEl = null;
  let dismissed = false;

  function shouldShow() {
    var isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) return false;
    return true;
  }

  function show() {
    if (dismissed || overlayEl) return;

    overlayEl = document.createElement('div');
    overlayEl.className = 'tutorial-overlay';
    overlayEl.setAttribute('role', 'dialog');
    overlayEl.setAttribute('aria-label', 'How to use the iPod interface');

    overlayEl.innerHTML =
      '<div class="tutorial-content">' +
        '<div class="tutorial-header">' +
          '<div class="tutorial-welcome">Welcome to Harry Schwartz\'s iPortfolio</div>' +
          '<div class="tutorial-title">How to Use</div>' +
          '<div class="tutorial-subtitle">In case you\'re too young to remember</div>' +
        '</div>' +
        '<svg class="tutorial-lines" xmlns="http://www.w3.org/2000/svg"></svg>' +
        '<div class="tutorial-dismiss-hint">Tap anywhere to start</div>' +
      '</div>';

    document.body.appendChild(overlayEl);

    // Use rAF to let the overlay layout settle before measuring
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        buildCallouts();
        overlayEl.classList.add('tutorial-visible');
      });
    });

    // Dismiss on any interaction (with delay to avoid instant dismiss)
    var dismissEvents = ['pointerdown', 'keydown'];
    function handleDismiss() {
      dismiss();
      dismissEvents.forEach(function (evt) {
        document.removeEventListener(evt, handleDismiss, true);
      });
    }
    setTimeout(function () {
      dismissEvents.forEach(function (evt) {
        document.addEventListener(evt, handleDismiss, true);
      });
    }, 500);
  }

  /**
   * Draw a 90-degree elbow line from (x1,y1) to (x2,y2).
   * direction: 'h-first' = horizontal then vertical, 'v-first' = vertical then horizontal
   */
  function elbowPath(x1, y1, x2, y2, direction) {
    if (Math.abs(y1 - y2) < 2 && Math.abs(x1 - x2) < 2) {
      return 'M' + x1 + ',' + y1 + ' L' + x2 + ',' + y2;
    }
    if (Math.abs(y1 - y2) < 2) {
      // Straight horizontal
      return 'M' + x1 + ',' + y1 + ' L' + x2 + ',' + y2;
    }
    if (Math.abs(x1 - x2) < 2) {
      // Straight vertical
      return 'M' + x1 + ',' + y1 + ' L' + x2 + ',' + y2;
    }
    if (direction === 'h-first') {
      // Go horizontal first, then vertical
      return 'M' + x1 + ',' + y1 + ' L' + x2 + ',' + y1 + ' L' + x2 + ',' + y2;
    } else {
      // Go vertical first, then horizontal
      return 'M' + x1 + ',' + y1 + ' L' + x1 + ',' + y2 + ' L' + x2 + ',' + y2;
    }
  }

  function buildCallouts() {
    if (!overlayEl) return;

    var wheel = document.querySelector('.clickwheel');
    var menuBtn = document.querySelector('.wheel-button.top');
    var centerBtn = document.querySelector('.center-button');
    var rewindBtn = document.querySelector('.wheel-button.left');
    var forwardBtn = document.querySelector('.wheel-button.right');
    var playPauseBtn = document.querySelector('.wheel-button.bottom');

    if (!wheel) return;

    var content = overlayEl.querySelector('.tutorial-content');
    var svgEl = overlayEl.querySelector('.tutorial-lines');
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    // Use viewBox instead of width/height to prevent zoom issues on mobile
    svgEl.setAttribute('viewBox', '0 0 ' + vw + ' ' + vh);
    svgEl.style.position = 'fixed';
    svgEl.style.left = '0';
    svgEl.style.top = '0';
    svgEl.style.width = '100vw';
    svgEl.style.height = '100vh';
    svgEl.style.overflow = 'hidden';
    svgEl.style.pointerEvents = 'none';
    svgEl.style.zIndex = '10001';

    var lineColor = 'rgba(255,255,255,0.4)';
    var dotColor = 'rgba(255,255,255,0.7)';

    function centerOf(el) {
      var r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    var wheelRect = wheel.getBoundingClientRect();
    var wheelCx = wheelRect.left + wheelRect.width / 2;
    var wheelCy = wheelRect.top + wheelRect.height / 2;
    var wheelR = wheelRect.width / 2;

    function makeDot(x, y) {
      var dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', x);
      dot.setAttribute('cy', y);
      dot.setAttribute('r', 3);
      dot.setAttribute('fill', dotColor);
      svgEl.appendChild(dot);
    }

    function makePath(d) {
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('stroke', lineColor);
      path.setAttribute('stroke-width', 1);
      path.setAttribute('fill', 'none');
      svgEl.appendChild(path);
    }

    function makeLabel(title, desc, x, y, align) {
      var el = document.createElement('div');
      el.className = 'tutorial-callout';
      el.style.position = 'fixed';

      var textDiv = document.createElement('div');
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

      var titleSpan = document.createElement('span');
      titleSpan.className = 'callout-title';
      titleSpan.textContent = title;
      var descSpan = document.createElement('span');
      descSpan.className = 'callout-desc';
      descSpan.textContent = desc;
      textDiv.appendChild(titleSpan);
      textDiv.appendChild(descSpan);
      el.appendChild(textDiv);
      content.appendChild(el);
    }

    var isMobile = vw <= 576;

    if (isMobile) {
      // ---- MOBILE LAYOUT ----
      // Labels go above/below the wheel (for Scroll Wheel / Play Pause)
      // and to the far left/right edges for the four directional + center buttons.
      // All connectors use strict 90-degree elbows.

      var gap = 10;

      // SCROLL WHEEL — centered above wheel
      var scrollAngle = -60 * Math.PI / 180;
      var scrollDotX = wheelCx + Math.cos(scrollAngle) * (wheelR - 6);
      var scrollDotY = wheelCy + Math.sin(scrollAngle) * (wheelR - 6);
      makeDot(scrollDotX, scrollDotY);
      var scrollLabelY = wheelRect.top - 40;
      makeLabel('Scroll Wheel', 'Slide finger in a circle to browse', wheelCx, scrollLabelY, 'center');
      // Vertical line from dot up to label
      makePath(elbowPath(scrollDotX, scrollDotY, scrollDotX, scrollLabelY + 14, 'v-first'));

      // MENU (top) — left side
      if (menuBtn) {
        var mc = centerOf(menuBtn);
        makeDot(mc.x, mc.y);
        var menuLabelX = gap;
        var menuLabelY = mc.y - 20;
        makeLabel('Menu', 'Go back', menuLabelX, menuLabelY, 'right');
        // Elbow: horizontal from dot to left, then vertical to label
        var menuLineEndX = menuLabelX + 50;
        makePath(elbowPath(mc.x, mc.y, menuLineEndX, menuLabelY, 'v-first'));
      }

      // SELECT (center) — right side
      if (centerBtn) {
        var cc = centerOf(centerBtn);
        makeDot(cc.x, cc.y);
        var selectLabelX = vw - gap;
        var selectLabelY = cc.y - 24;
        makeLabel('Select', 'Press to choose', selectLabelX, selectLabelY, 'left');
        var selectLineEndX = selectLabelX - 56;
        makePath(elbowPath(cc.x, cc.y, selectLineEndX, selectLabelY, 'v-first'));
      }

      // PREVIOUS (left) — left side
      if (rewindBtn) {
        var rc = centerOf(rewindBtn);
        makeDot(rc.x, rc.y);
        var prevLabelX = gap;
        var prevLabelY = rc.y + 24;
        makeLabel('Previous', 'Skip back', prevLabelX, prevLabelY, 'right');
        var prevLineEndX = prevLabelX + 65;
        makePath(elbowPath(rc.x, rc.y, prevLineEndX, prevLabelY, 'v-first'));
      }

      // NEXT (right) — right side
      if (forwardBtn) {
        var fc = centerOf(forwardBtn);
        makeDot(fc.x, fc.y);
        var nextLabelX = vw - gap;
        var nextLabelY = fc.y + 24;
        makeLabel('Next', 'Skip forward', nextLabelX, nextLabelY, 'left');
        var nextLineEndX = nextLabelX - 75;
        makePath(elbowPath(fc.x, fc.y, nextLineEndX, nextLabelY, 'v-first'));
      }

      // PLAY/PAUSE (bottom) — centered below wheel
      if (playPauseBtn) {
        var pc = centerOf(playPauseBtn);
        makeDot(pc.x, pc.y);
        // Position label well above the "tap anywhere" hint
        var ppLabelY = wheelRect.bottom + 32;
        makeLabel('Play / Pause', 'Control playback', wheelCx, ppLabelY, 'center');
        makePath(elbowPath(pc.x, pc.y, pc.x, ppLabelY - 14, 'v-first'));
      }

    } else {
      // ---- DESKTOP LAYOUT ----
      // Labels to left/right of wheel with 90-degree elbow connectors.
      // Dots anchor on actual button element centers.

      var labelGap = 20;

      function addDesktopCallout(title, desc, dotX, dotY, side, labelY) {
        var ly = (labelY !== undefined) ? labelY : dotY;
        makeDot(dotX, dotY);

        if (side === 'left') {
          var lx = wheelRect.left - labelGap;
          makeLabel(title, desc, lx, ly, 'left');
          // 90-degree elbow: horizontal from label edge to dot X, then vertical to dot Y
          makePath(elbowPath(lx + 4, ly, dotX, dotY, 'h-first'));
        } else {
          var rx = wheelRect.right + labelGap;
          makeLabel(title, desc, rx, ly, 'right');
          makePath(elbowPath(dotX, dotY, rx - 4, ly, 'h-first'));
        }
      }

      // Menu (top) — left side
      if (menuBtn) {
        var mc2 = centerOf(menuBtn);
        addDesktopCallout('Menu', 'Go back to the previous screen', mc2.x, mc2.y, 'left');
      }

      // Scroll Wheel — right side, dot on upper-right rim
      var scrAngle = -45 * Math.PI / 180;
      var scrDotX = wheelCx + Math.cos(scrAngle) * (wheelR - 6);
      var scrDotY = wheelCy + Math.sin(scrAngle) * (wheelR - 6);
      // Put label higher so it's well-separated from Select
      var scrLabelY = wheelCy - wheelR * 0.55;
      addDesktopCallout('Scroll Wheel', 'Slide finger in a circle to browse', scrDotX, scrDotY, 'right', scrLabelY);

      // Previous (left) — left side
      if (rewindBtn) {
        var rc2 = centerOf(rewindBtn);
        addDesktopCallout('Previous', 'Skip back', rc2.x, rc2.y, 'left');
      }

      // Select (center) — right side
      if (centerBtn) {
        var cc2 = centerOf(centerBtn);
        addDesktopCallout('Select', 'Press to choose an item', cc2.x, cc2.y, 'right');
      }

      // Next (right) — right side, offset label below Select
      if (forwardBtn) {
        var fc2 = centerOf(forwardBtn);
        var centerC = centerBtn ? centerOf(centerBtn) : { y: wheelCy };
        // Ensure at least 50px gap between Select label and Next label
        var nextY = (Math.abs(fc2.y - centerC.y) < 50) ? centerC.y + 50 : fc2.y;
        addDesktopCallout('Next', 'Skip forward', fc2.x, fc2.y, 'right', nextY);
      }

      // Play/Pause (bottom) — left side
      if (playPauseBtn) {
        var pc2 = centerOf(playPauseBtn);
        addDesktopCallout('Play / Pause', 'Control audio playback', pc2.x, pc2.y, 'left');
      }
    }
  }

  function dismiss() {
    if (dismissed || !overlayEl) return;
    dismissed = true;
    overlayEl.classList.add('tutorial-dismissing');
    setTimeout(function () {
      if (overlayEl && overlayEl.parentNode) {
        overlayEl.parentNode.removeChild(overlayEl);
      }
      overlayEl = null;
    }, 400);
  }

  window.ipodTutorialOverlay = {
    shouldShow: shouldShow,
    show: show,
    dismiss: dismiss,
    get isActive() { return !dismissed && !!overlayEl; },
  };
})();
