// Tutorial Overlay — Shows how to use the iPod interface
// Renders a boot screen INSIDE the iPod display (Apple logo + "Harry's iPortfolio")
// and floats callout labels OUTSIDE the iPod pointing to each button.
// Blurry overlay covers everything EXCEPT the iPod screen area.
// On desktop: shown after dismissing the QR "best on mobile" screen.
// On mobile: shown immediately on first visit.
// Dismissed when the user presses the select (center) button or menu button.

(function () {
  'use strict';

  var calloutContainer = null;
  var svgEl = null;
  var blurOverlay = null;
  var dismissed = false;
  var resizeTimer = null;

  function shouldShow() {
    var isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) return false;
    return true;
  }

  /**
   * Renders the boot screen view for the iPod screen-content area.
   * Returns a DOM element to be placed inside the iPod screen.
   */
  function renderBootView() {
    var container = document.createElement('div');
    container.className = 'boot-screen-view';

    // Apple logo (PNG image)
    var logoDiv = document.createElement('div');
    logoDiv.className = 'boot-logo';
    var logoImg = document.createElement('img');
    logoImg.src = 'img/apple-logo-black.png';
    logoImg.alt = 'Apple';
    logoImg.className = 'boot-logo-img';
    logoImg.draggable = false;
    logoDiv.appendChild(logoImg);
    container.appendChild(logoDiv);

    // Title
    var title = document.createElement('div');
    title.className = 'boot-title';
    title.textContent = "Harry's iPortfolio";
    container.appendChild(title);

    // Hint
    var hint = document.createElement('div');
    hint.className = 'boot-hint';
    hint.textContent = 'Press \u25cf to continue';
    container.appendChild(hint);

    return container;
  }

  /**
   * Show the blur overlay that covers everything except the iPod screen.
   */
  function showBlurOverlay() {
    if (blurOverlay) return;

    blurOverlay = document.createElement('div');
    blurOverlay.className = 'tutorial-blur-overlay';
    blurOverlay.style.pointerEvents = 'none';

    // Find the iPod screen to cut it out
    var screen = document.querySelector('.ipod-screen');
    if (screen) {
      var sr = screen.getBoundingClientRect();
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      // Use clip-path to cut out the screen area (polygon with hole)
      // We create an inset rectangle that represents the screen
      var top = (sr.top / vh * 100);
      var right = (1 - sr.right / vw) * 100;
      var bottom = (1 - sr.bottom / vh) * 100;
      var left = (sr.left / vw * 100);
      // evenodd polygon: outer rectangle, then inner rectangle (screen cutout)
      blurOverlay.style.clipPath = 'polygon(evenodd, ' +
        '0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ' +
        left + '% ' + top + '%, ' +
        left + '% ' + (100 - bottom) + '%, ' +
        (100 - right) + '% ' + (100 - bottom) + '%, ' +
        (100 - right) + '% ' + top + '%, ' +
        left + '% ' + top + '%)';
    }

    document.body.appendChild(blurOverlay);
  }

  function updateBlurOverlayCutout() {
    if (!blurOverlay) return;
    var screen = document.querySelector('.ipod-screen');
    if (!screen) return;
    var sr = screen.getBoundingClientRect();
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var top = (sr.top / vh * 100);
    var right = (1 - sr.right / vw) * 100;
    var bottom = (1 - sr.bottom / vh) * 100;
    var left = (sr.left / vw * 100);
    blurOverlay.style.clipPath = 'polygon(evenodd, ' +
      '0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ' +
      left + '% ' + top + '%, ' +
      left + '% ' + (100 - bottom) + '%, ' +
      (100 - right) + '% ' + (100 - bottom) + '%, ' +
      (100 - right) + '% ' + top + '%, ' +
      left + '% ' + top + '%)';
  }

  /**
   * Show the floating callout labels + SVG connector lines around the clickwheel.
   * Uses a delay to ensure getBoundingClientRect is accurate after layout settles.
   */
  function showCallouts() {
    if (dismissed || calloutContainer) return;

    // Container for labels (transparent, pointer-events none)
    calloutContainer = document.createElement('div');
    calloutContainer.className = 'tutorial-callouts-container';
    calloutContainer.style.position = 'fixed';
    calloutContainer.style.inset = '0';
    calloutContainer.style.zIndex = '10001';
    calloutContainer.style.pointerEvents = 'none';
    calloutContainer.style.overflow = 'hidden';

    // SVG for lines
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

    // Show blur overlay
    showBlurOverlay();

    // Wait for layout to settle before reading positions
    // Using 3 rAFs + a small timeout to handle mobile Safari layout jitter
    setTimeout(function () {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          rebuildCallouts();
          calloutContainer.classList.add('tutorial-callouts-visible');
          svgEl.classList.add('tutorial-callouts-visible');
        });
      });
    }, 300);

    // Listen for resize/orientation changes to reposition
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
  }

  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      rebuildCallouts();
      updateBlurOverlayCutout();
    }, 200);
  }

  function rebuildCallouts() {
    if (!calloutContainer || !svgEl) return;
    // Clear existing
    calloutContainer.innerHTML = '';
    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    // Update viewBox
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

    if (!wheel) return;

    var vw = window.innerWidth;
    var lineColor = 'rgba(255,255,255,0.4)';
    var dotColor = 'rgba(255,255,255,0.6)';
    var isMobile = vw <= 576;

    // On desktop, use dark lines since background is light behind the blur
    if (!isMobile) {
      lineColor = 'rgba(255,255,255,0.5)';
      dotColor = 'rgba(255,255,255,0.7)';
    }

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
      calloutContainer.appendChild(el);
    }

    if (isMobile) {
      // ---- MOBILE LAYOUT ----
      var gap = 10;

      // SCROLL WHEEL — centered above wheel
      var scrollAngle = -60 * Math.PI / 180;
      var scrollDotX = wheelCx + Math.cos(scrollAngle) * (wheelR - 6);
      var scrollDotY = wheelCy + Math.sin(scrollAngle) * (wheelR - 6);
      makeDot(scrollDotX, scrollDotY);
      var scrollLabelY = wheelRect.top - 40;
      makeLabel('Scroll Wheel', 'Slide finger in a circle to browse', wheelCx, scrollLabelY, 'center');
      makePath(elbowPath(scrollDotX, scrollDotY, scrollDotX, scrollLabelY + 14, 'v-first'));

      // MENU (top) — left side
      if (menuBtn) {
        var mc = centerOf(menuBtn);
        makeDot(mc.x, mc.y);
        var menuLabelX = gap;
        var menuLabelY = mc.y - 20;
        makeLabel('Menu', 'Go back', menuLabelX, menuLabelY, 'right');
        makePath(elbowPath(mc.x, mc.y, menuLabelX + 50, menuLabelY, 'v-first'));
      }

      // SELECT (center) — right side
      if (centerBtn) {
        var cc = centerOf(centerBtn);
        makeDot(cc.x, cc.y);
        var selectLabelX = vw - gap;
        var selectLabelY = cc.y - 24;
        makeLabel('Select', 'Press to choose', selectLabelX, selectLabelY, 'left');
        makePath(elbowPath(cc.x, cc.y, selectLabelX - 56, selectLabelY, 'v-first'));
      }

      // PREVIOUS (left) — left side
      if (rewindBtn) {
        var rc = centerOf(rewindBtn);
        makeDot(rc.x, rc.y);
        var prevLabelX = gap;
        var prevLabelY = rc.y + 24;
        makeLabel('Previous', 'Skip back', prevLabelX, prevLabelY, 'right');
        makePath(elbowPath(rc.x, rc.y, prevLabelX + 65, prevLabelY, 'v-first'));
      }

      // NEXT (right) — right side
      if (forwardBtn) {
        var fc = centerOf(forwardBtn);
        makeDot(fc.x, fc.y);
        var nextLabelX = vw - gap;
        var nextLabelY = fc.y + 24;
        makeLabel('Next', 'Skip forward', nextLabelX, nextLabelY, 'left');
        makePath(elbowPath(fc.x, fc.y, nextLabelX - 75, nextLabelY, 'v-first'));
      }

      // PLAY/PAUSE (bottom) — centered below wheel
      if (playPauseBtn) {
        var pc = centerOf(playPauseBtn);
        makeDot(pc.x, pc.y);
        var ppLabelY = wheelRect.bottom + 32;
        makeLabel('Play / Pause', 'Control playback', wheelCx, ppLabelY, 'center');
        makePath(elbowPath(pc.x, pc.y, pc.x, ppLabelY - 14, 'v-first'));
      }

    } else {
      // ---- DESKTOP LAYOUT ----
      var labelGap = 20;

      function addDesktopCallout(title, desc, dotX, dotY, side, labelY) {
        var ly = (labelY !== undefined) ? labelY : dotY;
        makeDot(dotX, dotY);

        if (side === 'left') {
          var lx = wheelRect.left - labelGap;
          makeLabel(title, desc, lx, ly, 'left');
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

      // Next (right) — right side, offset below Select
      if (forwardBtn) {
        var fc2 = centerOf(forwardBtn);
        var centerC = centerBtn ? centerOf(centerBtn) : { y: wheelCy };
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

  function hideCallouts() {
    // Remove resize listeners
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
    if (blurOverlay) {
      blurOverlay.classList.add('tutorial-blur-hiding');
      setTimeout(function () {
        if (blurOverlay && blurOverlay.parentNode) {
          blurOverlay.parentNode.removeChild(blurOverlay);
        }
        blurOverlay = null;
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
