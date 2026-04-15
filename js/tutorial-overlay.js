// Tutorial Overlay — Shows how to use the iPod interface
// Renders a boot screen INSIDE the iPod display (Apple logo + "Harry's iPortfolio")
// and floats callout labels OUTSIDE the iPod pointing to each button.
// Blurry overlay covers everything EXCEPT the iPod screen area (rounded corners).
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
    hint.textContent = 'Press \u25cf to continue';
    container.appendChild(hint);

    return container;
  }

  /**
   * Show the blur overlay using an inline SVG mask for rounded-rect cutout.
   */
  function showBlurOverlay() {
    if (blurOverlay) return;

    blurOverlay = document.createElement('div');
    blurOverlay.className = 'tutorial-blur-overlay';
    blurOverlay.style.pointerEvents = 'none';

    updateBlurMask();
    document.body.appendChild(blurOverlay);
  }

  function updateBlurMask() {
    if (!blurOverlay) return;
    var screen = document.querySelector('.ipod-screen');
    if (!screen) return;

    var sr = screen.getBoundingClientRect();
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    // Get the computed border-radius of the screen
    var cs = getComputedStyle(screen);
    var borderRadius = parseFloat(cs.borderRadius) || 8;
    // Account for the border width so we cut inside the border
    var borderWidth = parseFloat(cs.borderWidth) || 4;
    // The cutout should be the inner area (inside the border)
    var cx = sr.left + borderWidth;
    var cy = sr.top + borderWidth;
    var cw = sr.width - borderWidth * 2;
    var ch = sr.height - borderWidth * 2;
    var cr = Math.max(0, borderRadius - borderWidth);

    // Build an inline SVG mask with a white rect (show) and a black rounded-rect hole (hide)
    var svgMask = '<svg xmlns="http://www.w3.org/2000/svg" width="' + vw + '" height="' + vh + '">' +
      '<defs><mask id="blur-mask">' +
      '<rect width="100%" height="100%" fill="white"/>' +
      '<rect x="' + cx + '" y="' + cy + '" width="' + cw + '" height="' + ch + '" rx="' + cr + '" ry="' + cr + '" fill="black"/>' +
      '</mask></defs>' +
      '<rect width="100%" height="100%" fill="white" mask="url(#blur-mask)"/>' +
      '</svg>';

    var encoded = 'data:image/svg+xml,' + encodeURIComponent(svgMask);
    blurOverlay.style.webkitMaskImage = 'url("' + encoded + '")';
    blurOverlay.style.maskImage = 'url("' + encoded + '")';
    blurOverlay.style.webkitMaskSize = vw + 'px ' + vh + 'px';
    blurOverlay.style.maskSize = vw + 'px ' + vh + 'px';
    blurOverlay.style.webkitMaskRepeat = 'no-repeat';
    blurOverlay.style.maskRepeat = 'no-repeat';
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

    showBlurOverlay();

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
      updateBlurMask();
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
      // v-first: go vertical to y2, then horizontal to x2
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
    var lineColor = 'rgba(255,255,255,0.45)';
    var dotColor = 'rgba(255,255,255,0.65)';

    // Get screen rect to ensure labels don't overlap
    var screenEl = document.querySelector('.ipod-screen');
    var screenBottom = screenEl ? screenEl.getBoundingClientRect().bottom : 0;

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
      } else if (align === 'center-above') {
        el.style.left = x + 'px';
        el.style.bottom = (window.innerHeight - y) + 'px';
        el.style.transform = 'translateX(-50%)';
        textDiv.style.textAlign = 'center';
      } else if (align === 'center-below') {
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.transform = 'translateX(-50%)';
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
      // Non-overlapping arm routing:
      // LEFT side labels: Menu (at menu Y), Previous (at rewind Y)
      // RIGHT side labels: Scroll Wheel (above menu Y), Select (between center/forward), Next (below forward)
      // BOTTOM center: Play/Pause
      //
      // Left arms go straight horizontal LEFT from their dots.
      // Right arms go straight horizontal RIGHT from their dots,
      //   with vertical segments only at the far-right edge (near labels).
      // This prevents any crossing in the middle area.

      var gap = 10;
      var minLabelY = screenBottom + 18;

      // Compute label anchor X for right-side labels — all right labels
      // connect at the same X column near the right edge, then go vertical.
      var rightLineX = vw - 60; // vertical channel for right-side elbows

      // --- MENU (top button) → label on LEFT, straight horizontal ---
      if (menuBtn) {
        var mc = centerOf(menuBtn);
        makeDot(mc.x, mc.y);
        var menuLabelX = gap;
        makeLabel('Menu', 'Go back', menuLabelX, mc.y, 'right');
        makePath('M' + mc.x + ',' + mc.y + ' L' + (menuLabelX + 50) + ',' + mc.y);
      }

      // --- SCROLL WHEEL (upper-right rim) → label on RIGHT ---
      // Dot on the rim, arm goes straight right to label
      var scrollAngle = -50 * Math.PI / 180;
      var scrollDotX = wheelCx + Math.cos(scrollAngle) * (wheelR - 6);
      var scrollDotY = wheelCy + Math.sin(scrollAngle) * (wheelR - 6);
      makeDot(scrollDotX, scrollDotY);
      var scrollLabelX = vw - gap;
      var scrollLabelY = Math.max(scrollDotY, minLabelY);
      makeLabel('Scroll Wheel', 'Slide to browse', scrollLabelX, scrollLabelY, 'left');
      // Straight horizontal (dot and label are at ~same Y)
      makePath('M' + scrollDotX + ',' + scrollDotY + ' L' + rightLineX + ',' + scrollDotY +
        (Math.abs(scrollLabelY - scrollDotY) > 3 ? ' L' + rightLineX + ',' + scrollLabelY : ''));

      // --- PREVIOUS (left button) → label on LEFT, straight horizontal ---
      if (rewindBtn) {
        var rc = centerOf(rewindBtn);
        makeDot(rc.x, rc.y);
        var prevLabelX = gap;
        makeLabel('Previous', 'Skip back', prevLabelX, rc.y, 'right');
        makePath('M' + rc.x + ',' + rc.y + ' L' + (prevLabelX + 65) + ',' + rc.y);
      }

      // --- SELECT (center button) → label on RIGHT ---
      // v-first: go UP from center, then RIGHT to label.
      // This avoids crossing Previous' horizontal line.
      if (centerBtn) {
        var cc = centerOf(centerBtn);
        makeDot(cc.x, cc.y);
        var selectLabelX = vw - gap;
        // Place label between scroll and next, closer to center Y
        var selectLabelY = cc.y;
        makeLabel('Select', 'Press to choose', selectLabelX, selectLabelY, 'left');
        // Straight right from dot to right edge
        makePath('M' + cc.x + ',' + cc.y + ' L' + rightLineX + ',' + cc.y);
      }

      // --- NEXT (right button) → label on RIGHT, below Select ---
      if (forwardBtn) {
        var fc = centerOf(forwardBtn);
        makeDot(fc.x, fc.y);
        var nextLabelX = vw - gap;
        // Label well below Select — ensure at least 36px gap from Select label
        var nextLabelY = fc.y + 44;
        makeLabel('Next', 'Skip forward', nextLabelX, nextLabelY, 'left');
        // v-first: go down from dot, then right to label
        makePath(elbowPath(fc.x, fc.y, rightLineX, nextLabelY, 'v-first'));
      }

      // --- PLAY/PAUSE (bottom button) → label BELOW wheel ---
      if (playPauseBtn) {
        var pc = centerOf(playPauseBtn);
        makeDot(pc.x, pc.y);
        var ppLabelY = wheelRect.bottom + 28;
        makeLabel('Play / Pause', 'Control playback', wheelCx, ppLabelY, 'center-below');
        makePath('M' + pc.x + ',' + pc.y + ' L' + pc.x + ',' + ppLabelY);
      }

    } else {
      // ---- DESKTOP LAYOUT ----
      // Labels alternate left/right. Arms go h-first (horizontal out from dot, 
      // then vertical to label Y if needed).
      // Left side: Menu (top), Previous (middle), Play/Pause (bottom)
      // Right side: Scroll Wheel (top), Select (middle), Next (below select)

      var labelGap = 20;

      function addDesktopCallout(title, desc, dotX, dotY, side, labelY) {
        var ly = (labelY !== undefined) ? labelY : dotY;
        // Ensure labels don't overlap screen
        ly = Math.max(ly, screenBottom + 10);
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
