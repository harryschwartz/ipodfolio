// Tutorial Overlay — Animated floating-hand hints
// Two hints teach the two gestures users need on page 1 (landing/boot+QR) and
// page 2 (home):
//   • SELECT hint — a floating hand hovers above the center "select" button with
//     a concentric tap-pulse ring. Shown on the boot screen and the desktop QR
//     screen. Dismissed the moment the user presses center.
//   • SCROLL hint — a floating hand orbits the upper-right rim of the click
//     wheel, tracing a dashed arc in the scroll direction. Shown on the home
//     screen. Dismissed the moment the user scrolls (forward or backward).
//
// Architecture: a single absolute-positioned container lives inside the
// .ipod-shell so all coordinates are shell-relative (robust across mobile
// browsers). No blur, no modal — just floating elements on the shell body.
//
// Public API (unchanged names kept where possible):
//   renderBootView()  — returns the iPod-screen content for the boot screen
//   showSelectHint()  — show the center-button hand + pulse
//   showScrollHint()  — show the wheel-orbiting hand + arc
//   dismissSelectHint() / dismissScrollHint() — hide without transition reset
//   hideAll()         — hide whichever hint is visible

(function () {
  'use strict';

  var container = null;      // shell-relative positioned container
  var currentHint = null;    // 'select' | 'scroll' | null
  var resizeTimer = null;

  function shouldShow() {
    // Skip when running as an installed PWA — the onboarding has already been
    // done on first launch, and fullscreen standalone mode hides the wheel.
    var isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) return false;
    return true;
  }

  // ---- Boot screen content (unchanged) ----
  function renderBootView() {
    var view = document.createElement('div');
    view.className = 'boot-screen-view';

    var logoDiv = document.createElement('div');
    logoDiv.className = 'boot-logo';
    var logoImg = document.createElement('img');
    logoImg.src = 'img/apple-logo-black.png';
    logoImg.alt = 'Apple';
    logoImg.className = 'boot-logo-img';
    logoImg.draggable = false;
    logoDiv.appendChild(logoImg);
    view.appendChild(logoDiv);

    var title = document.createElement('div');
    title.className = 'boot-title';
    title.textContent = "Harry's iPortfolio";
    view.appendChild(title);

    var hint = document.createElement('div');
    hint.className = 'boot-hint';
    hint.textContent = 'Press \u25CF to enter';
    view.appendChild(hint);

    return view;
  }

  // ---- Container lifecycle ----
  function ensureContainer() {
    if (container) return container;
    var shell = document.querySelector('.ipod-shell');
    if (!shell) return null;

    // Shell must be a positioning context
    if (getComputedStyle(shell).position === 'static') {
      shell.style.position = 'relative';
    }

    container = document.createElement('div');
    container.className = 'tutorial-hand-container';
    container.style.position = 'absolute';
    container.style.inset = '0';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '10001';
    container.style.overflow = 'visible';
    shell.appendChild(container);

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    return container;
  }

  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (currentHint === 'select') positionSelectHint();
      else if (currentHint === 'scroll') positionScrollHint();
    }, 120);
  }

  // ---- Hand icon (reused by both hints) ----
  // Classic pixelated link cursor, served as a static PNG asset (white fill
  // with a black pixelated outline, transparent background). The image is
  // 468×600; the fingertip was measured at pixel (166, 0) — fractional
  // anchor (0.3547, 0) of the rendered image.
  var HAND_IMG_SRC = 'assets/cursor-hand.png';
  var HAND_TIP_FX = 166 / 468;  // fingertip x as fraction of image width
  var HAND_TIP_FY = 0;          // fingertip y as fraction of image height

  function makeHand() {
    var hand = document.createElement('div');
    hand.className = 'tutorial-hand';
    var img = document.createElement('img');
    img.src = HAND_IMG_SRC;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.draggable = false;
    hand.appendChild(img);
    return hand;
  }

  // ---- Geometry helpers ----
  function shellRect() {
    var shell = document.querySelector('.ipod-shell');
    return shell ? shell.getBoundingClientRect() : null;
  }

  function elRectInShell(el) {
    var sr = shellRect();
    if (!sr || !el) return null;
    var r = el.getBoundingClientRect();
    return {
      left: r.left - sr.left,
      top: r.top - sr.top,
      width: r.width,
      height: r.height,
      cx: r.left - sr.left + r.width / 2,
      cy: r.top - sr.top + r.height / 2,
    };
  }

  // ====================================================================
  // SELECT hint — hand hovers above center button, tap-ring pulses on it
  // ====================================================================

  var selectEls = null; // { hand, ring }

  function showSelectHint() {
    if (!shouldShow()) return;
    if (currentHint === 'select') return;
    hideAll();
    var c = ensureContainer();
    if (!c) return;

    var wrap = document.createElement('div');
    wrap.className = 'tutorial-select-hint';

    var ring = document.createElement('div');
    ring.className = 'tutorial-tap-ring';
    wrap.appendChild(ring);

    var hand = makeHand();
    hand.classList.add('tutorial-hand-select');
    wrap.appendChild(hand);

    c.appendChild(wrap);
    selectEls = { wrap: wrap, hand: hand, ring: ring };
    currentHint = 'select';

    // Position after two rAFs so the shell's descend animation doesn't throw
    // off getBoundingClientRect on first paint.
    waitForShellSettle(positionSelectHint);
  }

  function positionSelectHint() {
    if (!selectEls) return;
    var centerBtn = document.querySelector('.center-button');
    if (!centerBtn) return;
    var r = elRectInShell(centerBtn);
    if (!r) return;

    // Ring sits centered on the button, same diameter.
    var ringSize = Math.max(r.width, r.height);
    selectEls.ring.style.width = ringSize + 'px';
    selectEls.ring.style.height = ringSize + 'px';
    selectEls.ring.style.left = (r.cx - ringSize / 2) + 'px';
    selectEls.ring.style.top = (r.cy - ringSize / 2) + 'px';

    // Hand floats slightly up-and-right of the center button.
    var handW = 38, handH = 44;
    selectEls.hand.style.width = handW + 'px';
    selectEls.hand.style.height = handH + 'px';
    // Position so the fingertip points at the button center.
    var tipOffsetX = handW * HAND_TIP_FX;
    var tipOffsetY = handH * HAND_TIP_FY;
    // Offset the hand diagonally down-right from the button so the pointer
    // finger tip sits on the button's top edge.
    var offsetX = r.width * 0.22;   // right of center
    var offsetY = r.height * 0.15;  // below center (hand body extends down)
    selectEls.hand.style.left = (r.cx + offsetX - tipOffsetX) + 'px';
    selectEls.hand.style.top = (r.cy + offsetY - tipOffsetY) + 'px';
  }

  function dismissSelectHint() {
    if (currentHint !== 'select' || !selectEls) return;
    // Remove immediately (no fade) so the select hand doesn't linger while
    // the next hint fades in on top of it.
    var wrap = selectEls.wrap;
    if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
    selectEls = null;
    currentHint = null;
  }

  // ====================================================================
  // SCROLL hint — hand orbits upper-right rim of wheel, arc shows direction
  // ====================================================================

  var scrollEls = null; // { wrap, arcSvg, hand }

  function showScrollHint() {
    if (!shouldShow()) return;
    if (currentHint === 'scroll') return;
    hideAll();
    var c = ensureContainer();
    if (!c) return;

    var wrap = document.createElement('div');
    wrap.className = 'tutorial-scroll-hint';

    // Dashed arc SVG (absolute-positioned inside wrap)
    var arcSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arcSvg.setAttribute('class', 'tutorial-arc');
    arcSvg.style.position = 'absolute';
    arcSvg.style.left = '0';
    arcSvg.style.top = '0';
    arcSvg.style.overflow = 'visible';
    arcSvg.style.pointerEvents = 'none';
    wrap.appendChild(arcSvg);

    var hand = makeHand();
    hand.classList.add('tutorial-hand-scroll');
    wrap.appendChild(hand);

    c.appendChild(wrap);
    scrollEls = { wrap: wrap, arcSvg: arcSvg, hand: hand };
    currentHint = 'scroll';

    waitForShellSettle(positionScrollHint);
  }

  function positionScrollHint() {
    if (!scrollEls) return;
    var wheel = document.querySelector('.clickwheel');
    if (!wheel) return;
    var r = elRectInShell(wheel);
    if (!r) return;

    var cx = r.cx;
    var cy = r.cy;
    // Orbit radius: just outside the ring (past the click wheel rim).
    var wheelRadius = Math.min(r.width, r.height) / 2;
    var orbitR = wheelRadius - 10;  // on the ring itself

    // Arc: from upper-right sweeping clockwise to lower-right, drawn solid
    // with an arrowhead on both ends to signal bidirectional scroll.
    var a1 = -60 * Math.PI / 180; // upper-right starting angle
    var a2 =  45 * Math.PI / 180; // lower-right ending angle
    var startX = cx + Math.cos(a1) * orbitR;
    var startY = cy + Math.sin(a1) * orbitR;
    var endX   = cx + Math.cos(a2) * orbitR;
    var endY   = cy + Math.sin(a2) * orbitR;

    // Clear + rebuild arc
    while (scrollEls.arcSvg.firstChild) scrollEls.arcSvg.removeChild(scrollEls.arcSvg.firstChild);

    // Size the svg to cover the shell for simplicity
    var sr = shellRect();
    scrollEls.arcSvg.setAttribute('width', sr.width);
    scrollEls.arcSvg.setAttribute('height', sr.height);
    scrollEls.arcSvg.setAttribute('viewBox', '0 0 ' + sr.width + ' ' + sr.height);

    var arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    // sweep-flag = 1 (clockwise); large-arc-flag = 0 (minor arc)
    arc.setAttribute('d',
      'M' + startX + ',' + startY +
      ' A' + orbitR + ',' + orbitR + ' 0 0 1 ' + endX + ',' + endY);
    arc.setAttribute('class', 'tutorial-arc-path');
    arc.setAttribute('fill', 'none');
    scrollEls.arcSvg.appendChild(arc);

    // Arrowheads on BOTH ends of the arc — small triangles tangent to the
    // circle, pointing outward in the scroll direction.
    var ah = 7;
    function addArrowhead(angle, tipX, tipY, outward) {
      // `outward` = +1 for the end pointing along clockwise direction,
      // -1 for the end pointing against it (counter-clockwise).
      var tangent = angle + outward * Math.PI / 2;
      var p1x = tipX + Math.cos(tangent) * ah;
      var p1y = tipY + Math.sin(tangent) * ah;
      var p2x = tipX + Math.cos(tangent + 2.4) * ah;
      var p2y = tipY + Math.sin(tangent + 2.4) * ah;
      var p3x = tipX + Math.cos(tangent - 2.4) * ah;
      var p3y = tipY + Math.sin(tangent - 2.4) * ah;
      var head = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      head.setAttribute('points', p1x + ',' + p1y + ' ' + p2x + ',' + p2y + ' ' + p3x + ',' + p3y);
      head.setAttribute('class', 'tutorial-arc-head');
      scrollEls.arcSvg.appendChild(head);
    }
    // End (clockwise direction, at a2): tangent points along +CW
    addArrowhead(a2, endX, endY, +1);
    // Start (counter-clockwise direction, at a1): tangent points along -CW
    addArrowhead(a1, startX, startY, -1);

    // Configure the hand to orbit via CSS custom props.
    // It moves along the arc from a1 → a2 → a1 (back and forth).
    var handW = 34, handH = 40;
    scrollEls.hand.style.width = handW + 'px';
    scrollEls.hand.style.height = handH + 'px';
    scrollEls.hand.style.setProperty('--tut-cx', cx + 'px');
    scrollEls.hand.style.setProperty('--tut-cy', cy + 'px');
    scrollEls.hand.style.setProperty('--tut-r', orbitR + 'px');
    // Fingertip offset (same as select hint).
    scrollEls.hand.style.setProperty('--tut-tip-x', (handW * HAND_TIP_FX) + 'px');
    scrollEls.hand.style.setProperty('--tut-tip-y', (handH * HAND_TIP_FY) + 'px');
  }

  function dismissScrollHint() {
    if (currentHint !== 'scroll' || !scrollEls) return;
    scrollEls.wrap.classList.add('tutorial-hide');
    var wrap = scrollEls.wrap;
    setTimeout(function () { if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 320);
    scrollEls = null;
    currentHint = null;
  }

  // ---- Utility: wait for the desktop shell's descend animation ----
  // On desktop the .ipod-shell has a 1.5s scale animation on load. Measuring
  // element positions before it completes yields wrong coordinates, so we
  // wait for animationend with a safety timeout before positioning.
  function waitForShellSettle(callback) {
    var shell = document.querySelector('.ipod-shell');
    if (!shell) { setTimeout(callback, 0); return; }
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var animName = getComputedStyle(shell).animationName;
    var hasDescend = !reduceMotion && animName && animName !== 'none';
    if (!hasDescend) {
      requestAnimationFrame(function () { requestAnimationFrame(callback); });
      return;
    }
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      shell.removeEventListener('animationend', onEnd);
      requestAnimationFrame(function () { requestAnimationFrame(callback); });
    }
    function onEnd(e) { if (e.target === shell) finish(); }
    shell.addEventListener('animationend', onEnd);
    setTimeout(finish, 1700);
  }

  // ---- Public dismissal ----
  function hideAll() {
    dismissSelectHint();
    dismissScrollHint();
  }

  // ---- Public API ----
  window.ipodTutorialOverlay = {
    shouldShow: shouldShow,
    renderBootView: renderBootView,
    showSelectHint: showSelectHint,
    showScrollHint: showScrollHint,
    dismissSelectHint: dismissSelectHint,
    dismissScrollHint: dismissScrollHint,
    hideAll: hideAll,
    get currentHint() { return currentHint; },
    get isActive() { return !!currentHint; },
  };
})();
