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
      // Labels at same Y as their offset dots → straight horizontal lines.
      // All labels constrained within iPod shell bounds.
      //   LEFT: Menu, Previous, Play/Pause
      //   RIGHT: Scroll Wheel, Next, Select (below Next)

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

      // Vertical dot offset: above center → UP, below center → DOWN.
      var dotOff = 20;

      // --- MENU (top button, above center) → dot & label shift UP → straight line LEFT ---
      if (menuBtn) {
        var mc = centerOf(menuBtn);
        var menuDotY = mc.y - dotOff;
        var menuLabelY = Math.max(menuDotY, minLabelY);
        makeDot(mc.x, menuDotY);
        makeLabel('Menu', 'Go back', labelLeft, menuLabelY, 'right');
        makePath('M' + mc.x + ',' + menuDotY + ' L' + (labelLeft + 42) + ',' + menuDotY +
          (Math.abs(menuLabelY - menuDotY) > 3 ? ' L' + (labelLeft + 42) + ',' + menuLabelY : ''));
      }

      // --- PREVIOUS (left button) → dot & label shift UP → straight line LEFT ---
      if (rewindBtn) {
        var rc = centerOf(rewindBtn);
        var prevDotY = rc.y - dotOff;
        makeDot(rc.x, prevDotY);
        makeLabel('Previous', 'Skip back', labelLeft, prevDotY, 'right');
        makePath('M' + rc.x + ',' + prevDotY + ' L' + (labelLeft + 55) + ',' + prevDotY);
      }

      // --- NEXT (right button) → dot & label shift DOWN → straight line RIGHT ---
      if (forwardBtn) {
        var fc = centerOf(forwardBtn);
        var nextDotY = fc.y + dotOff;
        makeDot(fc.x, nextDotY);
        makeLabel('Next', 'Skip forward', labelRight, nextDotY, 'left');
        makePath('M' + fc.x + ',' + nextDotY + ' L' + (labelRight - 68) + ',' + nextDotY);
      }

      // --- SELECT (center button) → dot at center, arm v-first down then right ---
      if (centerBtn) {
        var cc = centerOf(centerBtn);
        makeDot(cc.x, cc.y);
        var fcDotY = forwardBtn ? centerOf(forwardBtn).y + dotOff : cc.y;
        var selectLabelY = fcDotY + 30;
        selectLabelY = Math.min(selectLabelY, shellBottom - 30);
        makeLabel('Select', 'Press to choose', labelRight, selectLabelY, 'left');
        makePath(elbowPath(cc.x, cc.y, labelRight - 80, selectLabelY, 'v-first'));
      }

      // --- PLAY/PAUSE (bottom button, below center) → dot & label shift DOWN → straight line LEFT ---
      if (playPauseBtn) {
        var pc = centerOf(playPauseBtn);
        var ppDotY = pc.y + dotOff;
        var ppLabelY = Math.min(ppDotY, shellBottom - 30);
        makeDot(pc.x, ppLabelY);
        makeLabel('Play / Pause', 'Control playback', labelLeft, ppLabelY, 'right');
        makePath('M' + pc.x + ',' + ppLabelY + ' L' + (labelLeft + 80) + ',' + ppLabelY);
      }

    } else {
      // ---- DESKTOP LAYOUT ----
      // Labels at same Y as their offset dots → straight horizontal lines.
      // All labels constrained within iPod shell bounds.
      // Left side: Menu, Previous, Play/Pause
      // Right side: Scroll Wheel, Next, Select (below Next)

      var dLabelGap = 6;
      var dLeftAnchor = wheelRect.left - dLabelGap;
      var dRightAnchor = wheelRect.right + dLabelGap;
      var dMinY = screenBottom + 8;

      // Straight-line desktop callout: label Y = dot Y → horizontal line.
      function addDesktopCallout(title, desc, dotX, dotY, side) {
        var ly = Math.max(dotY, dMinY);
        ly = Math.min(ly, shellBottom - 28);
        makeDot(dotX, ly);

        if (side === 'left') {
          makeLabel(title, desc, dLeftAnchor, ly, 'left');
          makePath('M' + dotX + ',' + ly + ' L' + (dLeftAnchor + 4) + ',' + ly);
        } else {
          makeLabel(title, desc, dRightAnchor, ly, 'right');
          makePath('M' + dotX + ',' + ly + ' L' + (dRightAnchor - 4) + ',' + ly);
        }
      }

      // Vertical offset: above center → UP, below → DOWN.
      var dDotOff = 20;

      // Menu (top, above center) — shift UP — left side
      if (menuBtn) {
        var mc2 = centerOf(menuBtn);
        addDesktopCallout('Menu', 'Go back', mc2.x, mc2.y - dDotOff, 'left');
      }

      // Scroll Wheel — right side, dot on upper-right rim
      var scrAngle = -45 * Math.PI / 180;
      var scrDotX = wheelCx + Math.cos(scrAngle) * (wheelR - 6);
      var scrDotY = wheelCy + Math.sin(scrAngle) * (wheelR - 6);
      addDesktopCallout('Scroll Wheel', 'Slide to browse', scrDotX, scrDotY, 'right');

      // Previous (left, at center horizon) — shift UP — left side
      if (rewindBtn) {
        var rc2 = centerOf(rewindBtn);
        addDesktopCallout('Previous', 'Skip back', rc2.x, rc2.y - dDotOff, 'left');
      }

      // Next (right, at center horizon) — shift DOWN — right side
      if (forwardBtn) {
        var fc2 = centerOf(forwardBtn);
        addDesktopCallout('Next', 'Skip forward', fc2.x, fc2.y + dDotOff, 'right');
      }

      // Select (center) — dot at center, arm v-first down then right
      if (centerBtn) {
        var cc2 = centerOf(centerBtn);
        var fc2DotY = forwardBtn ? centerOf(forwardBtn).y + dDotOff : cc2.y;
        var selectDesktopY = fc2DotY + 30;
        selectDesktopY = Math.min(selectDesktopY, shellBottom - 28);
        makeDot(cc2.x, cc2.y);
        makeLabel('Select', 'Press to choose', dRightAnchor, selectDesktopY, 'right');
        makePath(elbowPath(cc2.x, cc2.y, dRightAnchor - 4, selectDesktopY, 'v-first'));
      }

      // Play/Pause (bottom, below center) — shift DOWN — left side
      if (playPauseBtn) {
        var pc2 = centerOf(playPauseBtn);
        addDesktopCallout('Play / Pause', 'Control playback', pc2.x, pc2.y + dDotOff, 'left');
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
