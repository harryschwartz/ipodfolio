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

  // ---- localStorage helpers ----
  // Persist "already shown" flags across sessions so first-time hints only
  // fire once per browser. Wrapped in try/catch because localStorage can
  // throw in private-browsing/quota-exceeded contexts.
  function hintWasShown(key) {
    try { return !!localStorage.getItem(key); } catch (e) { return false; }
  }
  function markHintShown(key) {
    try { localStorage.setItem(key, '1'); } catch (e) {}
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
      else if (currentHint === 'speed') positionSpeedHint();
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
    // Hide until positioned — on desktop the shell has a ~1.5s descend
    // animation, during which measuring would yield wrong coordinates.
    // Without this, the hand paints at (0,0) in the shell's top-left.
    wrap.style.visibility = 'hidden';

    var ring = document.createElement('div');
    ring.className = 'tutorial-tap-ring';
    wrap.appendChild(ring);

    var hand = makeHand();
    hand.classList.add('tutorial-hand-select');
    wrap.appendChild(hand);

    c.appendChild(wrap);
    selectEls = { wrap: wrap, hand: hand, ring: ring };
    currentHint = 'select';

    // Position after the shell settles (handles desktop descend animation),
    // then reveal. This prevents the hand from being visible at (0,0) while
    // waiting for coordinates.
    waitForShellSettle(function () {
      positionSelectHint();
      if (selectEls) selectEls.wrap.style.visibility = '';
    });
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
    wrap.style.visibility = 'hidden';

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

    waitForShellSettle(function () {
      positionScrollHint();
      if (scrollEls) scrollEls.wrap.style.visibility = '';
    });
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

  // ====================================================================
  // SPEED hint — floating hand + blue tap-ring pointing at the speed badge.
  // Matches the visual language of the SELECT hint (blue ring + pixelated
  // hand with a small label). Fires exactly once (persisted via localStorage)
  // the first time the user plays audio, and self-dismisses on any
  // interaction (click, keypress, scroll wheel, navigation).
  // ====================================================================

  var SPEED_HINT_KEY = 'ipodfolio.speedHintShown';
  // { wrap, hand, ring, label, badge }
  var speedEls = null;
  var speedDismissHandlers = null;

  function showSpeedHint() {
    if (!shouldShow()) return;
    if (hintWasShown(SPEED_HINT_KEY)) return;
    if (currentHint === 'speed') return;
    // The badge is inside the Now Playing view. `showNowPlaying` starts a
    // slide-in transition, so we must wait for the badge to STOP MOVING
    // before measuring — otherwise we anchor to a transient mid-animation
    // x-coordinate and the hand lands far off to the side.
    var attempts = 0;
    var lastX = null;
    var stableFrames = 0;
    function tryMount() {
      var badge = document.getElementById('np-speed-badge');
      if (!badge || badge.offsetParent === null) {
        if (++attempts < 30) setTimeout(tryMount, 80);
        return;
      }
      var x = badge.getBoundingClientRect().left;
      if (lastX !== null && Math.abs(x - lastX) < 0.5) {
        stableFrames++;
      } else {
        stableFrames = 0;
      }
      lastX = x;
      // Two consecutive stable measurements = transition has settled.
      if (stableFrames >= 2) {
        mountSpeedHint(badge);
        return;
      }
      if (++attempts < 30) setTimeout(tryMount, 80);
    }
    tryMount();
  }

  function mountSpeedHint(badge) {
    hideAll();
    var c = ensureContainer();
    if (!c) return;

    var wrap = document.createElement('div');
    wrap.className = 'tutorial-speed-hint';
    wrap.style.visibility = 'hidden';

    // Blue pulsing ring centered on the badge (same look as select hint).
    var ring = document.createElement('div');
    ring.className = 'tutorial-tap-ring tutorial-speed-ring';
    wrap.appendChild(ring);

    // Floating pixelated hand that taps down on the badge.
    var hand = makeHand();
    hand.classList.add('tutorial-hand-speed');
    wrap.appendChild(hand);

    // Small label above the hand — same tone as the classic hints.
    var label = document.createElement('div');
    label.className = 'tutorial-speed-label';
    label.textContent = 'Tap to change speed';
    wrap.appendChild(label);

    c.appendChild(wrap);
    speedEls = { wrap: wrap, hand: hand, ring: ring, label: label, badge: badge };
    currentHint = 'speed';

    // Wait one frame so the hand image + label have real dimensions before we
    // measure them for positioning (offsetWidth is 0 pre-layout).
    requestAnimationFrame(function () {
      positionSpeedHint();
      if (speedEls) speedEls.wrap.style.visibility = '';
    });

    markHintShown(SPEED_HINT_KEY);
    installSpeedDismissHandlers();
  }

  function positionSpeedHint() {
    if (!speedEls) return;
    var br = elRectInShell(speedEls.badge);
    if (!br) return;
    var sr = shellRect();
    if (!sr) return;

    // ---- Ring: centered on the badge, sized to comfortably enclose it. ----
    // The badge is a tiny ~19×11 pill; a fixed 26px ring reads well without
    // dominating the row.
    var ringSize = Math.max(26, br.width + 14);
    speedEls.ring.style.width = ringSize + 'px';
    speedEls.ring.style.height = ringSize + 'px';
    speedEls.ring.style.left = (br.cx - ringSize / 2) + 'px';
    speedEls.ring.style.top = (br.cy - ringSize / 2) + 'px';

    // ---- Hand: sized like select-hint's hand, fingertip lands on the badge. ----
    // The badge lives on a horizontal status row; positioning the hand from
    // directly above (like select) keeps it out of the way of the album art
    // and progress bar on both mobile and desktop viewports.
    var handW = 34, handH = 40;
    speedEls.hand.style.width = handW + 'px';
    speedEls.hand.style.height = handH + 'px';
    var tipOffsetX = handW * HAND_TIP_FX;
    var tipOffsetY = handH * HAND_TIP_FY;
    // Hand comes in from up-and-slightly-right, tapping down on the badge
    // center. The tap-bob animation moves the whole hand vertically.
    var handX = br.cx - tipOffsetX + 4; // 4px right so fingertip visually lands on badge
    var handY = br.top - handH - 2;     // sit just above the badge
    // Clamp so the hand never falls off the left/right edges of the shell.
    var minHandX = 4;
    var maxHandX = sr.width - handW - 4;
    if (handX < minHandX) handX = minHandX;
    if (handX > maxHandX) handX = maxHandX;
    speedEls.hand.style.left = handX + 'px';
    speedEls.hand.style.top = handY + 'px';

    // ---- Label: small caption above the hand. ----
    var lw = speedEls.label.offsetWidth || 130;
    var lh = speedEls.label.offsetHeight || 18;
    // Center label above the hand's fingertip (which sits at handX + tipOffsetX).
    var fingerX = handX + tipOffsetX;
    var labelLeft = fingerX - lw / 2;
    var labelTop = handY - lh - 4;
    // Clamp horizontally to the shell edges.
    var maxLabelLeft = sr.width - lw - 6;
    if (labelLeft < 6) labelLeft = 6;
    if (labelLeft > maxLabelLeft) labelLeft = maxLabelLeft;
    // If the label would go above the shell top, drop it below the hand instead.
    if (labelTop < 4) {
      labelTop = handY + handH + 2;
    }
    speedEls.label.style.left = labelLeft + 'px';
    speedEls.label.style.top = labelTop + 'px';
  }

  function dismissSpeedHint() {
    if (currentHint !== 'speed' || !speedEls) return;
    var wrap = speedEls.wrap;
    wrap.classList.add('tutorial-hide');
    setTimeout(function () { if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 260);
    speedEls = null;
    currentHint = null;
    removeSpeedDismissHandlers();
  }

  function installSpeedDismissHandlers() {
    if (speedDismissHandlers) return;
    var dismiss = function () { dismissSpeedHint(); };
    speedDismissHandlers = {
      pointerdown: dismiss,
      keydown: dismiss,
      wheel: dismiss,
      forwardscroll: dismiss,
      backscroll: dismiss,
      centerclick: dismiss,
      menuclick: dismiss,
      playpauseclick: dismiss,
    };
    Object.keys(speedDismissHandlers).forEach(function (evt) {
      // capture: true so we notice clicks even on elements that stopPropagation.
      window.addEventListener(evt, speedDismissHandlers[evt], true);
    });
  }

  function removeSpeedDismissHandlers() {
    if (!speedDismissHandlers) return;
    Object.keys(speedDismissHandlers).forEach(function (evt) {
      window.removeEventListener(evt, speedDismissHandlers[evt], true);
    });
    speedDismissHandlers = null;
  }

  // ---- Public dismissal ----
  function hideAll() {
    dismissSelectHint();
    dismissScrollHint();
    dismissSpeedHint();
  }

  // ---- Public API ----
  window.ipodTutorialOverlay = {
    shouldShow: shouldShow,
    renderBootView: renderBootView,
    showSelectHint: showSelectHint,
    showScrollHint: showScrollHint,
    showSpeedHint: showSpeedHint,
    dismissSelectHint: dismissSelectHint,
    dismissScrollHint: dismissScrollHint,
    dismissSpeedHint: dismissSpeedHint,
    hideAll: hideAll,
    get currentHint() { return currentHint; },
    get isActive() { return !!currentHint; },
  };
})();
