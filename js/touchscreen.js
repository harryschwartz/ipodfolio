// Touchscreen Navigation + Info Button
// Adds tap-to-select and swipe-to-scroll on the iPod screen.
// Tracks whether user only uses the screen (no wheel/buttons) —
// if so, after a threshold, shows the instructions overlay.
//
// Two scroll modes:
// 1) Wheel scroll: moves highlight (selection bar) one item at a time, view follows
// 2) Touchscreen scroll: inertial content scrolling (like iPhone), no highlight movement.
//    Tap to select whatever item is at that position.

(function () {
  'use strict';

  var SWIPE_THRESHOLD = 30;       // px to count as a swipe
  var TOUCH_ONLY_LIMIT = 5;       // screen-only taps before showing instructions
  var screenTouchCount = 0;
  var wheelUsed = false;
  var overlayShownByTouch = false;

  // --- Info Button (inside the iPod shell) ---
  var infoBtn = document.createElement('button');
  infoBtn.className = 'info-btn';
  infoBtn.setAttribute('aria-label', 'Show controls help');
  infoBtn.textContent = '\u2139\uFE0F';
  // Place inside the shell so it's anchored to the iPod, not the viewport
  var shellEl = document.querySelector('.ipod-shell');
  if (shellEl) {
    shellEl.appendChild(infoBtn);
  } else {
    document.body.appendChild(infoBtn);
  }

  var infoOverlayActive = false;

  infoBtn.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    e.stopPropagation();
    toggleInfoOverlay();
  });

  function toggleInfoOverlay() {
    if (infoOverlayActive) {
      hideInfoOverlay();
    } else {
      showInfoOverlay();
    }
  }

  function showInfoOverlay() {
    if (infoOverlayActive) return;
    if (!window.ipodTutorialOverlay) return;
    infoOverlayActive = true;
    window.ipodTutorialOverlay._showForInfo();
  }

  function hideInfoOverlay() {
    if (!infoOverlayActive) return;
    infoOverlayActive = false;
    if (window.ipodTutorialOverlay) {
      window.ipodTutorialOverlay._hideForInfo();
    }
  }

  // Expose for external use
  window.ipodInfoOverlay = {
    get isActive() { return infoOverlayActive; },
    toggle: toggleInfoOverlay,
    hide: hideInfoOverlay,
  };

  // --- Track wheel/button usage ---
  ['forwardscroll', 'backwardscroll', 'menuclick',
   'playpauseclick', 'forwardclick', 'backclick'].forEach(function (evt) {
    window.addEventListener(evt, function () {
      wheelUsed = true;
      dismissTouchOverlay();
    });
  });

  // centerclick also counts as wheel usage IF it didn't come from touchscreen
  var centerClickFromScreen = false;
  window.addEventListener('centerclick', function () {
    if (!centerClickFromScreen) {
      wheelUsed = true;
      dismissTouchOverlay();
    }
    centerClickFromScreen = false;
  });

  function dismissTouchOverlay() {
    // Dismiss the info overlay if it was auto-triggered
    if (overlayShownByTouch && infoOverlayActive) {
      hideInfoOverlay();
      overlayShownByTouch = false;
    }
    // Dismiss the initial tutorial overlay that persists from boot
    if (window.ipodTutorialOverlay && window.ipodTutorialOverlay.isActive && !infoOverlayActive) {
      window.ipodTutorialOverlay.dismiss();
    }
  }

  // --- Touchscreen on iPod screen ---
  var touchStartY = 0;
  var touchStartX = 0;
  var touchStartTime = 0;
  var isSwiping = false;
  var accumulatedSwipe = 0;
  var SCROLL_STEP = 40;  // px per scroll item (for cover flow horizontal)

  // Inertial scroll state
  var inertiaId = null;
  var lastMoveY = 0;
  var lastMoveTime = 0;
  var velocityY = 0;

  function initTouchscreen() {
    var screenEl = document.querySelector('.screen-content');
    if (!screenEl) return;

    screenEl.addEventListener('pointerdown', onPointerDown, { passive: false });
    screenEl.addEventListener('pointermove', onPointerMove, { passive: false });
    screenEl.addEventListener('pointerup', onPointerUp, { passive: false });
    screenEl.addEventListener('pointercancel', onPointerCancel, { passive: false });
  }

  // --- Helpers ---

  function isCoverFlowActive() {
    return !!document.querySelector('.coverflow-container');
  }

  function isBacksideActive() {
    return !!document.querySelector('.coverflow-backside');
  }

  // Get the scrollable list container for the current view
  function getScrollContainer() {
    if (!window.ipodApp || !window.ipodApp.currentView) return null;
    var view = window.ipodApp.currentView;
    // _listEl is the selectable-list or split-left container
    return view._listEl || view.querySelector('.selectable-list') ||
           view.querySelector('.split-left') || view.querySelector('.settings-view') ||
           view.querySelector('.playlist-tracks') || view.querySelector('.album-tracks') || null;
  }

  // Determine if the current view is a standard list that should use inertial scroll
  function isListView() {
    if (!window.ipodApp) return false;
    // Don't use inertial scroll for cover flow, brick game, now playing, photos, or about
    if (window.ipodApp.activeCoverFlow || window.ipodApp.activeBrickGame) return false;
    if (window.ipodApp.activeNowPlaying) return false;
    if (window.ipodApp.photoFullscreen) return false;
    var node = window.ipodApp.currentNode;
    if (node && (node.type === 'video' || node.type === 'photo_album')) return false;
    return !!getScrollContainer();
  }

  // Find which list-item index is at a given clientY position
  function getItemIndexAtY(clientY) {
    var container = getScrollContainer();
    if (!container) return -1;
    var items = container.querySelectorAll('.list-item');
    for (var i = 0; i < items.length; i++) {
      var rect = items[i].getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) {
        return i;
      }
    }
    return -1;
  }

  function stopInertia() {
    if (inertiaId) {
      cancelAnimationFrame(inertiaId);
      inertiaId = null;
    }
    velocityY = 0;
  }

  function startInertia() {
    var container = getScrollContainer();
    if (!container || Math.abs(velocityY) < 0.5) return;

    var friction = 0.95;
    function step() {
      velocityY *= friction;
      if (Math.abs(velocityY) < 0.5) {
        velocityY = 0;
        inertiaId = null;
        return;
      }
      container.scrollTop -= velocityY;
      inertiaId = requestAnimationFrame(step);
    }
    inertiaId = requestAnimationFrame(step);
  }

  // --- Event handlers ---

  function onPointerDown(e) {
    // Ignore if it's a click on an interactive element inside Now Playing
    if (e.target.closest('.np-speed-badge')) return;

    touchStartY = e.clientY;
    touchStartX = e.clientX;
    touchStartTime = Date.now();
    isSwiping = false;
    accumulatedSwipe = 0;

    // Stop any ongoing inertia
    stopInertia();
    lastMoveY = e.clientY;
    lastMoveTime = Date.now();
  }

  function onPointerMove(e) {
    if (!touchStartTime) return;
    var dy = e.clientY - touchStartY;
    var dx = e.clientX - touchStartX;
    var inCoverFlow = isCoverFlowActive();
    var onBackside = isBacksideActive();

    // Mark as swiping if either axis exceeds threshold
    if (Math.abs(dy) > 10 || Math.abs(dx) > 10) {
      isSwiping = true;
    }

    if (!isSwiping) return;

    // --- Inertial scroll for standard list views ---
    if (isListView() && !inCoverFlow) {
      var container = getScrollContainer();
      if (container) {
        var now = Date.now();
        var moveDy = e.clientY - lastMoveY;
        var dt = now - lastMoveTime;
        if (dt > 0) {
          velocityY = moveDy / dt * 16; // normalize to ~60fps frame
        }
        container.scrollTop -= moveDy;
        lastMoveY = e.clientY;
        lastMoveTime = now;
        // Mark that touch scrolling happened so wheel can re-anchor
        if (window.ipodApp) {
          window.ipodApp._touchScrolled = true;
          // Hide the highlight bar during touch scroll
          var activeEl = container.querySelector('.list-item.active');
          if (activeEl) activeEl.classList.remove('active');
        }
        return; // Don't fire forwardscroll/backwardscroll events
      }
    }

    // --- Cover flow horizontal swipe or backside vertical (event-based) ---
    var useHorizontal = inCoverFlow && !onBackside;
    var total = useHorizontal ? (e.clientX - touchStartX) : (e.clientY - touchStartY);
    var stepSize = useHorizontal ? 60 : SCROLL_STEP;

    // On backside, only count vertical movement for scroll steps
    if (onBackside && Math.abs(dx) > Math.abs(dy) * 1.5) {
      return; // predominantly horizontal on backside — back gesture handled in onPointerUp
    }

    var steps = Math.floor(Math.abs(total) / stepSize);
    var fired = Math.abs(accumulatedSwipe);
    // Backside uses natural scroll direction
    var invert = onBackside && !useHorizontal;
    while (fired < steps) {
      var goForward = invert ? (total > 0) : (total < 0);
      if (goForward) {
        window.dispatchEvent(new Event('forwardscroll'));
      } else {
        window.dispatchEvent(new Event('backwardscroll'));
      }
      fired++;
    }
    accumulatedSwipe = total < 0 ? -steps : steps;
  }

  function onPointerUp(e) {
    if (!touchStartTime) return;
    var dy = e.clientY - touchStartY;
    var dx = e.clientX - touchStartX;
    var elapsed = Date.now() - touchStartTime;
    touchStartTime = 0;

    // If info overlay is showing (from ℹ️ button), screen tap dismisses it
    if (infoOverlayActive && !isSwiping && elapsed < 400) {
      hideInfoOverlay();
      overlayShownByTouch = false;
      return; // consume the tap
    }
    // If initial tutorial is still visible, don't dismiss on screen tap
    if (window.ipodTutorialOverlay && window.ipodTutorialOverlay.isActive && !infoOverlayActive) {
      // Still allow the tap to fire centerclick for navigation, overlay just stays
    }

    var inCoverFlow = isCoverFlowActive();
    var onBackside = isBacksideActive();

    // --- Inertial scroll momentum ---
    if (isSwiping && isListView() && !inCoverFlow) {
      startInertia();
      return;
    }

    // Swipe right to go back (menu) when on backside
    if (isSwiping && inCoverFlow && dx > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (onBackside) {
        window.dispatchEvent(new Event('menuclick'));
      }
    } else if (!isSwiping && elapsed < 400 && Math.abs(dy) < 15 && Math.abs(dx) < 15) {
      // --- Tap ---
      if (isListView() && !inCoverFlow) {
        // Tap on a list item: select the item at the tapped position
        var tappedIdx = getItemIndexAtY(e.clientY);
        if (tappedIdx >= 0 && window.ipodApp) {
          window.ipodApp.scrollIndex = tappedIdx;
          window.ipodApp.updateListSelection();
          // Small delay so the highlight flash is visible before navigation
          centerClickFromScreen = true;
          setTimeout(function() {
            window.dispatchEvent(new Event('centerclick'));
          }, 80);
        }
      } else {
        // Non-list views: plain centerclick
        centerClickFromScreen = true;
        window.dispatchEvent(new Event('centerclick'));
      }

      // Count screen-only touches (skip during boot/QR)
      if (!wheelUsed && window.ipodApp && !window.ipodApp.bootScreenActive && !window.ipodApp.desktopQRActive) {
        screenTouchCount++;
        if (screenTouchCount >= TOUCH_ONLY_LIMIT && !infoOverlayActive && !overlayShownByTouch) {
          overlayShownByTouch = true;
          showInfoOverlay();
        }
      }
    }
  }

  function onPointerCancel() {
    touchStartTime = 0;
    isSwiping = false;
    accumulatedSwipe = 0;
    stopInertia();
  }

  // Init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTouchscreen);
  } else {
    initTouchscreen();
  }
})();
