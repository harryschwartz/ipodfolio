// Tutorial Overlay — Shows how to use the iPod interface
// Renders a boot screen INSIDE the iPod display (Apple logo + "Harry's iPortfolio")
// and floats callout labels around the clickwheel, constrained to the iPod shell.
// No blur overlay — just labels + connector arms on the iPod body.
// On desktop: shown after dismissing the QR "best on mobile" screen.
// On mobile: shown immediately on first visit.
// Dismissed when the user presses the select (center) button or menu button.
//
// Architecture: SVG + label container are placed INSIDE the .ipod-shell as
// position:absolute children. All coordinates are relative to the shell's top-left.
// This avoids position:fixed vs getBoundingClientRect() viewport mismatches
// across iOS browsers (Safari, Chrome, Comet).

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
    hint.textContent = 'Press \u25CF to enter';
    container.appendChild(hint);

    return container;
  }

  /**
   * Show the floating callout labels + SVG connector lines.
   * Container and SVG are placed inside the iPod shell as absolute-positioned children.
   */
  function showCallouts() {
    if (dismissed || calloutContainer) return;

    var shell = document.querySelector('.ipod-shell');
    if (!shell) return;

    // Ensure shell is a positioning context
    var shellPos = getComputedStyle(shell).position;
    if (shellPos === 'static') shell.style.position = 'relative';

    calloutContainer = document.createElement('div');
    calloutContainer.className = 'tutorial-callouts-container';
    calloutContainer.style.position = 'absolute';
    calloutContainer.style.left = '0';
    calloutContainer.style.top = '0';
    calloutContainer.style.width = '100%';
    calloutContainer.style.height = '100%';
    calloutContainer.style.zIndex = '10001';
    calloutContainer.style.pointerEvents = 'none';
    calloutContainer.style.overflow = 'hidden';

    svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.style.position = 'absolute';
    svgEl.style.left = '0';
    svgEl.style.top = '0';
    svgEl.style.width = '100%';
    svgEl.style.height = '100%';
    svgEl.style.overflow = 'hidden';
    svgEl.style.pointerEvents = 'none';
    svgEl.style.zIndex = '10000';

    shell.appendChild(svgEl);
    shell.appendChild(calloutContainer);

    // Wait for layout to settle
    setTimeout(function () {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          rebuildCallouts();
          addRingerHint();
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

    var shell = document.querySelector('.ipod-shell');
    if (!shell) return;
    var shellRect = shell.getBoundingClientRect();
    var shellW = shellRect.width;
    var shellH = shellRect.height;
    svgEl.setAttribute('viewBox', '0 0 ' + shellW + ' ' + shellH);
    buildCallouts();
    addRingerHint();
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

    var lineColor = 'rgba(0,0,0,0.5)';
    var dotColor = 'rgba(0,0,0,0.6)';

    // All coordinates are relative to shell's top-left
    var shellRect = shell.getBoundingClientRect();
    var shellW = shellRect.width;
    var shellH = shellRect.height;

    // Convert an element's getBoundingClientRect to shell-relative coords
    function toShell(rect) {
      return {
        left: rect.left - shellRect.left,
        top: rect.top - shellRect.top,
        width: rect.width,
        height: rect.height,
        right: rect.right - shellRect.left,
        bottom: rect.bottom - shellRect.top,
      };
    }

    function centerOfEl(el) {
      var r = toShell(el.getBoundingClientRect());
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    // Screen bounds (shell-relative)
    var screenEl = document.querySelector('.ipod-screen');
    var screenR = screenEl ? toShell(screenEl.getBoundingClientRect()) : null;
    var screenBottom = screenR ? screenR.bottom : 0;

    // Wheel bounds (shell-relative)
    var wr = toShell(wheel.getBoundingClientRect());
    var wheelCx = wr.left + wr.width / 2;
    var wheelCy = wr.top + wr.height / 2;
    var wheelR = wr.width / 2;
    var isMobile = shellW <= 576;

    // Padding from shell edges
    var pad = 8;

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
      el.style.position = 'absolute';

      var textDiv = document.createElement('div');
      textDiv.className = 'callout-label';

      if (align === 'right') {
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.transform = 'translateY(-50%)';
        textDiv.classList.add('callout-label-right');
      } else if (align === 'left') {
        el.style.right = (shellW - x) + 'px';
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
      // All dot positions computed from wheel geometry only (no getBoundingClientRect on buttons)
      //   LEFT: Menu, Previous, Play/Pause
      //   RIGHT: Scroll Wheel, Next, Select

      var minLabelY = screenBottom + 14;

      // Label anchors: halfway between wheel edge and shell edge
      var mLeftAnchor = pad + (wr.left - pad) * 0.5;
      var mRightAnchor = shellW - pad - (shellW - pad - wr.right) * 0.5;

      // Dot positions derived from wheel center + radius
      var menuDotX = wheelCx;
      var menuDotY = wr.top + 6;
      var prevDotX = wr.left + 6;
      var prevDotY = wheelCy;
      var nextDotX = wr.right - 6;
      var nextDotY = wheelCy;
      var ppDotX = wheelCx;
      var ppDotY = wr.bottom - 6;
      var selectDotX = wheelCx;
      var selectDotY = wheelCy;

      // Play/Pause Y (Select label will share this Y)
      var ppLabelY = Math.min(ppDotY, shellH - 30);

      // --- SCROLL WHEEL (upper-right rim) → label RIGHT ---
      var scrollAngle = -55 * Math.PI / 180;
      var scrollDotX = wheelCx + Math.cos(scrollAngle) * (wheelR - 6);
      var scrollDotY = wheelCy + Math.sin(scrollAngle) * (wheelR - 6);
      var scrollLabelY = Math.max(scrollDotY, minLabelY);
      makeDot(scrollDotX, scrollDotY);
      makeLabel('Scroll Wheel', 'Slide to browse', mRightAnchor, scrollLabelY, 'left');
      makePath('M' + scrollDotX + ',' + scrollDotY + ' L' + mRightAnchor + ',' + scrollDotY +
        (Math.abs(scrollLabelY - scrollDotY) > 3 ? ' L' + mRightAnchor + ',' + scrollLabelY : ''));

      // --- MENU (top of wheel) → line LEFT then down to label ---
      var menuLabelY = Math.max(menuDotY, minLabelY);
      makeDot(menuDotX, menuDotY);
      makeLabel('Menu', 'Go back', mLeftAnchor, menuLabelY, 'right');
      makePath('M' + menuDotX + ',' + menuDotY + ' L' + mLeftAnchor + ',' + menuDotY +
        (Math.abs(menuLabelY - menuDotY) > 3 ? ' L' + mLeftAnchor + ',' + menuLabelY : ''));

      // --- PREVIOUS (left of wheel) → straight line LEFT ---
      makeDot(prevDotX, prevDotY);
      makeLabel('Previous', 'Skip back', mLeftAnchor, prevDotY, 'right');
      makePath('M' + prevDotX + ',' + prevDotY + ' L' + mLeftAnchor + ',' + prevDotY);

      // --- NEXT (right of wheel) → straight line RIGHT ---
      makeDot(nextDotX, nextDotY);
      makeLabel('Next', 'Skip forward', mRightAnchor, nextDotY, 'left');
      makePath('M' + nextDotX + ',' + nextDotY + ' L' + mRightAnchor + ',' + nextDotY);

      // --- SELECT (center of wheel) → diagonal then horizontal ---
      var selectLabelY = Math.min(ppLabelY, shellH - 30);
      makeDot(selectDotX, selectDotY);
      makeLabel('Select', 'Press to choose', mRightAnchor, selectLabelY, 'left');
      var selMidX = (selectDotX + mRightAnchor) / 2;
      makePath('M' + selectDotX + ',' + selectDotY + ' L' + selMidX + ',' + selectLabelY + ' L' + mRightAnchor + ',' + selectLabelY);

      // --- PLAY/PAUSE (bottom of wheel) → straight line LEFT ---
      makeDot(ppDotX, ppDotY);
      makeLabel('Play / Pause', 'Control playback', mLeftAnchor, ppLabelY, 'right');
      makePath('M' + ppDotX + ',' + ppDotY +
        (Math.abs(ppLabelY - ppDotY) > 3 ? ' L' + mLeftAnchor + ',' + ppDotY + ' L' + mLeftAnchor + ',' + ppLabelY
          : ' L' + mLeftAnchor + ',' + ppDotY));

    } else {
      // ---- DESKTOP LAYOUT ----
      // Short arms: labels close to wheel edge.
      // Select aligned with Play/Pause Y.
      // Left: Menu, Previous, Play/Pause
      // Right: Scroll Wheel, Next, Select

      var dGap = 6;
      var dLeftAnchor = wr.left - dGap;
      var dRightAnchor = wr.right + dGap;
      var dMinY = screenBottom + 8;
      var dDotOff = 20;

      function addDesktopCallout(title, desc, dotX, dotY, side) {
        var ly = Math.max(dotY, dMinY);
        ly = Math.min(ly, shellH - 28);
        makeDot(dotX, ly);
        if (side === 'left') {
          makeLabel(title, desc, dLeftAnchor, ly, 'left');
          makePath('M' + dotX + ',' + ly + ' L' + (dLeftAnchor + 4) + ',' + ly);
        } else {
          makeLabel(title, desc, dRightAnchor, ly, 'right');
          makePath('M' + dotX + ',' + ly + ' L' + (dRightAnchor - 4) + ',' + ly);
        }
      }

      // Compute Play/Pause Y first (Select will share it)
      var dPPY = null;
      if (playPauseBtn) {
        var pc2 = centerOfEl(playPauseBtn);
        dPPY = pc2.y + dDotOff;
        dPPY = Math.min(dPPY, shellH - 28);
      }

      // Menu (top, above center) — shift UP — left
      if (menuBtn) {
        var mc2 = centerOfEl(menuBtn);
        addDesktopCallout('Menu', 'Go back', mc2.x, mc2.y - dDotOff, 'left');
      }

      // Scroll Wheel — right, dot on upper-right rim
      var scrAngle = -45 * Math.PI / 180;
      var scrDotX = wheelCx + Math.cos(scrAngle) * (wheelR - 6);
      var scrDotY = wheelCy + Math.sin(scrAngle) * (wheelR - 6);
      addDesktopCallout('Scroll Wheel', 'Slide to browse', scrDotX, scrDotY, 'right');

      // Previous (left) — shift UP — left
      if (rewindBtn) {
        var rc2 = centerOfEl(rewindBtn);
        addDesktopCallout('Previous', 'Skip back', rc2.x, rc2.y - dDotOff, 'left');
      }

      // Next (right) — shift DOWN — right
      if (forwardBtn) {
        var fc2 = centerOfEl(forwardBtn);
        addDesktopCallout('Next', 'Skip forward', fc2.x, fc2.y + dDotOff, 'right');
      }

      // Select (center) — dot at center, diagonal then horizontal to label
      if (centerBtn) {
        var cc2 = centerOfEl(centerBtn);
        var selY = dPPY !== null ? dPPY : (wr.bottom + 10);
        selY = Math.min(selY, shellH - 28);
        makeDot(cc2.x, cc2.y);
        makeLabel('Select', 'Press to choose', dRightAnchor, selY, 'right');
        var dMidX = (cc2.x + dRightAnchor) / 2;
        makePath('M' + cc2.x + ',' + cc2.y + ' L' + dMidX + ',' + selY + ' L' + (dRightAnchor - 4) + ',' + selY);
      }

      // Play/Pause (bottom) — at ppY — left
      if (playPauseBtn) {
        var ppc2 = centerOfEl(playPauseBtn);
        addDesktopCallout('Play / Pause', 'Control playback', ppc2.x, dPPY, 'left');
      }
    }

  }

  function addRingerHint() {
    if (!calloutContainer) return;
    var hint = document.createElement('div');
    hint.className = 'tutorial-ringer-hint';
    hint.textContent = 'turn ringer on for full experience';
    calloutContainer.appendChild(hint);
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

  // Info-button toggling (separate from the one-time boot dismiss)
  function showForInfo() {
    // Temporarily un-dismiss so showCallouts works
    var wasDismissed = dismissed;
    dismissed = false;
    showCallouts();
    dismissed = wasDismissed; // keep original boot-dismiss state
  }

  function hideForInfo() {
    hideCallouts();
  }

  window.ipodTutorialOverlay = {
    shouldShow: shouldShow,
    renderBootView: renderBootView,
    showCallouts: showCallouts,
    dismiss: dismiss,
    _showForInfo: showForInfo,
    _hideForInfo: hideForInfo,
    get isActive() { return !!calloutContainer; },
  };
})();
