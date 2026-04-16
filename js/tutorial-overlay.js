// Tutorial Overlay — Shows how to use the iPod interface
// Renders a boot screen INSIDE the iPod display (Apple logo + "Harry's iPortfolio")
// and floats callout labels around the clickwheel, constrained to the iPod shell.
// No blur overlay — just labels + connector arms on the iPod body.
// On desktop: shown after dismissing the QR "best on mobile" screen.
// On mobile: shown immediately on first visit.
// Dismissed when the user presses the select (center) button or menu button.

(function () {
  'use strict';

  var calloutContainer = null;
  var svgEl = null;
  var dismissed = false;
  var resizeTimer = null;

  function shouldShow() {
    var isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) return false;
    return true;
  }

  /**
   * Renders the boot screen view for the iPod screen-content area.
   */
  function renderBootView() {
    var container = document.createElement('div');
    container.className = 'boot-screen-view';

    var logoDiv = document.createElement('div');
    logoDiv.className = 'boot-logo';
    var logoImg = document.createElement('img');
    logoImg.src = 'img/apple-logo-black.png';
    logoImg.alt = 'Apple';
    logoImg.className = 'boot-logo-img';
    logoImg.draggable = false;
    logoDiv.appendChild(logoImg);
    container.appendChild(logoDiv);

    var title = document.createElement('div');
    title.className = 'boot-title';
    title.textContent = "Harry's iPortfolio";
    container.appendChild(title);

    var hint = document.createElement('div');
    hint.className = 'boot-hint';
    hint.textContent = 'Press select to enter';
    container.appendChild(hint);

    return container;
  }

  /**
   * Show the floating callout labels + SVG connector lines.
   */
  function showCallouts() {
    if (dismissed || calloutContainer) return;

    calloutContainer = document.createElement('div');
    calloutContainer.className = 'tutorial-callouts-container';
    calloutContainer.style.position = 'fixed';
    calloutContainer.style.inset = '0';
    calloutContainer.style.zIndex = '10001';
    calloutContainer.style.pointerEvents = 'none';
    calloutContainer.style.overflow = 'hidden';

    svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.style.position = 'fixed';
    svgEl.style.left = '0';
    svgEl.style.top = '0';
    svgEl.style.width = '100vw';
    svgEl.style.height = '100vh';
    svgEl.style.overflow = 'hidden';
    svgEl.style.pointerEvents = 'none';
    svgEl.style.zIndex = '10000';

    document.body.appendChild(svgEl);
    document.body.appendChild(calloutContainer);

    // Wait for layout to settle
    setTimeout(function () {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          rebuildCallouts();
          calloutContainer.classList.add('tutorial-callouts-visible');
          svgEl.classList.add('tutorial-callouts-visible');
        });
      });
    }, 300);

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
  }

  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      rebuildCallouts();
    }, 200);
  }

  function rebuildCallouts() {
    if (!calloutContainer || !svgEl) return;
    calloutContainer.innerHTML = '';
    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    svgEl.setAttribute('viewBox', '0 0 ' + vw + ' ' + vh);
    buildCallouts();
  }

  /**
   * 90-degree elbow path from (x1,y1) to (x2,y2).
   */
  function elbowPath(x1, y1, x2, y2, direction) {
    if (Math.abs(y1 - y2) < 2 && Math.abs(x1 - x2) < 2) {
      return 'M' + x1 + ',' + y1 + ' L' + x2 + ',' + y2;
    }
    if (Math.abs(y1 - y2) < 2) {
      return 'M' + x1 + ',' + y1 + ' L' + x2 + ',' + y2;
    }
    if (Math.abs(x1 - x2) < 2) {
      return 'M' + x1 + ',' + y1 + ' L' + x2 + ',' + y2;
    }
    if (direction === 'h-first') {
      return 'M' + x1 + ',' + y1 + ' L' + x2 + ',' + y1 + ' L' + x2 + ',' + y2;
    } else {
      return 'M' + x1 + ',' + y1 + ' L' + x1 + ',' + y2 + ' L' + x2 + ',' + y2;
    }
  }

  function buildCallouts() {
    if (!calloutContainer || !svgEl) return;

    var wheel = document.querySelector('.clickwheel');
    var menuBtn = document.querySelector('.wheel-button.top');
    var centerBtn = document.querySelector('.center-button');
    var rewindBtn = document.querySelector('.wheel-button.left');
    var forwardBtn = document.querySelector('.wheel-button.right');
    var playPauseBtn = document.querySelector('.wheel-button.bottom');
    var shell = document.querySelector('.ipod-shell');

    if (!wheel || !shell) return;

    var vw = window.innerWidth;
    var lineColor = 'rgba(0,0,0,0.5)';
    var dotColor = 'rgba(0,0,0,0.6)';

    // iPod shell bounds — all labels must stay inside
    var shellRect = shell.getBoundingClientRect();
    var shellLeft = shellRect.left;
    var shellRight = shellRect.right;
    var shellTop = shellRect.top;
    var shellBottom = shellRect.bottom;

    // Screen bounds — labels must stay below screen
    var screenEl = document.querySelector('.ipod-screen');
    var screenRect = screenEl ? screenEl.getBoundingClientRect() : null;
    var screenBottom = screenRect ? screenRect.bottom : shellTop;

    // Padding from shell edges
    var pad = 8;
    var labelLeft = shellLeft + pad;
    var labelRight = shellRight - pad;

    function centerOf(el) {
      var r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    var wheelRect = wheel.getBoundingClientRect();
    var wheelCx = wheelRect.left + wheelRect.width / 2;
    var wheelCy = wheelRect.top + wheelRect.height / 2;
    var wheelR = wheelRect.width / 2;
    var isMobile = vw <= 576;

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
      path.setAttribute('stroke-width', 1.5);
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
      } else if (align === 'center-below') {
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.transform = 'translateX(-50%)';
        textDiv.style.textAlign = 'center';
      }

      var titleSpan = document.createElement('span');
      titleSpan.className = 'callout-title';
      titleSpan.textContent = title;
      textDiv.appendChild(titleSpan);

      if (desc) {
        var descSpan = document.createElement('span');
        descSpan.className = 'callout-desc';
        descSpan.textContent = desc;
        textDiv.appendChild(descSpan);
      }

      el.appendChild(textDiv);
      calloutContainer.appendChild(el);
    }

    if (isMobile) {
      // ---- MOBILE LAYOUT ----
      // All labels constrained within iPod shell bounds.
      // Layout:
      //   LEFT: Menu (at menu Y), Previous (at rewind Y)
      //   RIGHT: Scroll Wheel (above menu), Next (at forward Y), Select (below Next)
      //   BOTTOM: Play/Pause (below wheel)
      //
      // Routing:
      //   Menu: straight horizontal left
      //   Scroll Wheel: straight horizontal right
      //   Previous: straight horizontal left
      //   Next: straight horizontal right (at forward button Y)
      //   Select: v-first — down from center, then right to label
      //   Play/Pause: straight vertical down

      // Minimum Y for labels (must be below screen + gap)
      var minLabelY = screenBottom + 14;

      // --- SCROLL WHEEL (upper-right rim) → label RIGHT ---
      var scrollAngle = -55 * Math.PI / 180;
      var scrollDotX = wheelCx + Math.cos(scrollAngle) * (wheelR - 6);
      var scrollDotY = wheelCy + Math.sin(scrollAngle) * (wheelR - 6);
      var scrollLabelY = Math.max(scrollDotY, minLabelY);
      makeDot(scrollDotX, scrollDotY);
      makeLabel('Scroll Wheel', 'Slide to browse', labelRight, scrollLabelY, 'left');
      makePath('M' + scrollDotX + ',' + scrollDotY + ' L' + (labelRight - 80) + ',' + scrollDotY +
        (Math.abs(scrollLabelY - scrollDotY) > 3 ? ' L' + (labelRight - 80) + ',' + scrollLabelY : ''));

      // --- MENU (top button) → label LEFT ---
      if (menuBtn) {
        var mc = centerOf(menuBtn);
        makeDot(mc.x, mc.y);
        makeLabel('Menu', 'Go back', labelLeft, mc.y, 'right');
        makePath('M' + mc.x + ',' + mc.y + ' L' + (labelLeft + 42) + ',' + mc.y);
      }

      // --- PREVIOUS (left button) → label LEFT ---
      if (rewindBtn) {
        var rc = centerOf(rewindBtn);
        makeDot(rc.x, rc.y);
        makeLabel('Previous', 'Skip back', labelLeft, rc.y, 'right');
        makePath('M' + rc.x + ',' + rc.y + ' L' + (labelLeft + 55) + ',' + rc.y);
      }

      // --- NEXT (right button) → label RIGHT, at forward button Y ---
      if (forwardBtn) {
        var fc = centerOf(forwardBtn);
        makeDot(fc.x, fc.y);
        makeLabel('Next', 'Skip forward', labelRight, fc.y, 'left');
        // Straight horizontal right
        makePath('M' + fc.x + ',' + fc.y + ' L' + (labelRight - 68) + ',' + fc.y);
      }

      // --- SELECT (center button) → label RIGHT, BELOW Next ---
      // Arm goes DOWN from center dot, then RIGHT to label.
      if (centerBtn) {
        var cc = centerOf(centerBtn);
        makeDot(cc.x, cc.y);
        // Place Select label below Next — forward Y + offset
        var fcY = forwardBtn ? centerOf(forwardBtn).y : cc.y;
        var selectLabelY = fcY + 36;
        makeLabel('Select', 'Press to choose', labelRight, selectLabelY, 'left');
        // v-first: go down from center, then right to label
        makePath(elbowPath(cc.x, cc.y, labelRight - 80, selectLabelY, 'v-first'));
      }

      // --- PLAY/PAUSE (bottom button) → label BELOW wheel ---
      if (playPauseBtn) {
        var pc = centerOf(playPauseBtn);
        makeDot(pc.x, pc.y);
        var ppLabelY = wheelRect.bottom + 16;
        // Clamp to stay inside shell
        ppLabelY = Math.min(ppLabelY, shellBottom - 40);
        makeLabel('Play / Pause', 'Control playback', wheelCx, ppLabelY, 'center-below');
        makePath('M' + pc.x + ',' + pc.y + ' L' + pc.x + ',' + (ppLabelY - 2));
      }

    } else {
      // ---- DESKTOP LAYOUT ----
      // Labels constrained within iPod shell bounds.
      // Left side: Menu, Previous, Play/Pause
      // Right side: Scroll Wheel, Next (at forward Y), Select (below Next)

      // Desktop: labels sit between wheel edge and shell edge.
      // Left labels: right-aligned, anchored at (wheelRect.left - gap)
      // Right labels: left-aligned, anchored at (wheelRect.right + gap)
      var dLabelGap = 6;
      var dLeftAnchor = wheelRect.left - dLabelGap;    // right edge of left labels
      var dRightAnchor = wheelRect.right + dLabelGap;  // left edge of right labels

      function addDesktopCallout(title, desc, dotX, dotY, side, labelY) {
        var ly = (labelY !== undefined) ? labelY : dotY;
        ly = Math.max(ly, screenBottom + 8);
        makeDot(dotX, dotY);

        if (side === 'left') {
          makeLabel(title, desc, dLeftAnchor, ly, 'left');
          makePath(elbowPath(dLeftAnchor + 4, ly, dotX, dotY, 'h-first'));
        } else {
          makeLabel(title, desc, dRightAnchor, ly, 'right');
          makePath(elbowPath(dotX, dotY, dRightAnchor - 4, ly, 'h-first'));
        }
      }

      // Menu (top) — left side
      if (menuBtn) {
        var mc2 = centerOf(menuBtn);
        addDesktopCallout('Menu', 'Go back', mc2.x, mc2.y, 'left');
      }

      // Scroll Wheel — right side, dot on upper-right rim
      var scrAngle = -45 * Math.PI / 180;
      var scrDotX = wheelCx + Math.cos(scrAngle) * (wheelR - 6);
      var scrDotY = wheelCy + Math.sin(scrAngle) * (wheelR - 6);
      var scrLabelY = wheelCy - wheelR * 0.5;
      addDesktopCallout('Scroll Wheel', 'Slide to browse', scrDotX, scrDotY, 'right', scrLabelY);

      // Previous (left) — left side
      if (rewindBtn) {
        var rc2 = centerOf(rewindBtn);
        addDesktopCallout('Previous', 'Skip back', rc2.x, rc2.y, 'left');
      }

      // Next (right) — right side, at forward button Y
      if (forwardBtn) {
        var fc2 = centerOf(forwardBtn);
        addDesktopCallout('Next', 'Skip forward', fc2.x, fc2.y, 'right');
      }

      // Select (center) — right side, BELOW Next
      // Arm: v-first (down from center, then right)
      if (centerBtn) {
        var cc2 = centerOf(centerBtn);
        var fc2Y = forwardBtn ? centerOf(forwardBtn).y : cc2.y;
        var selectDesktopY = fc2Y + 46;
        makeDot(cc2.x, cc2.y);
        makeLabel('Select', 'Press to choose', dRightAnchor, selectDesktopY, 'right');
        makePath(elbowPath(cc2.x, cc2.y, dRightAnchor - 4, selectDesktopY, 'v-first'));
      }

      // Play/Pause (bottom) — left side
      if (playPauseBtn) {
        var pc2 = centerOf(playPauseBtn);
        addDesktopCallout('Play / Pause', 'Control playback', pc2.x, pc2.y, 'left');
      }
    }
  }

  function hideCallouts() {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);

    if (calloutContainer) {
      calloutContainer.classList.add('tutorial-callouts-hiding');
      setTimeout(function () {
        if (calloutContainer && calloutContainer.parentNode) {
          calloutContainer.parentNode.removeChild(calloutContainer);
        }
        calloutContainer = null;
      }, 400);
    }
    if (svgEl) {
      svgEl.classList.add('tutorial-callouts-hiding');
      setTimeout(function () {
        if (svgEl && svgEl.parentNode) {
          svgEl.parentNode.removeChild(svgEl);
        }
        svgEl = null;
      }, 400);
    }
  }

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    hideCallouts();
  }

  window.ipodTutorialOverlay = {
    shouldShow: shouldShow,
    renderBootView: renderBootView,
    showCallouts: showCallouts,
    dismiss: dismiss,
    get isActive() { return !dismissed && !!calloutContainer; },
  };
})();
