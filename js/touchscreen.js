// Touchscreen Navigation
// Adds tap-to-select and swipe-to-scroll on the iPod screen.
//
// Two scroll modes:
// 1) Wheel scroll: moves highlight (selection bar) one item at a time, view follows
// 2) Touchscreen scroll: inertial content scrolling (like iPhone), no highlight movement.
//    Tap to select whatever item is at that position.
//
// The old labeled instructions overlay + ℹ️ info button have been replaced by
// the animated hand-cursor hints managed by tutorial-overlay.js. Those hints
// auto-dismiss when the user performs the taught action (center press /
// wheel scroll), so no explicit touchscreen dismissal is needed here.

(function () {
  'use strict';

  var SWIPE_THRESHOLD = 30;       // px to count as a swipe

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

  // Tracks whether a centerclick originated from a screen tap (vs. a real
  // click on the physical center button). Consumed by the centerclick
  // listener below so we can still distinguish the two sources if needed.
  var centerClickFromScreen = false;
  window.addEventListener('centerclick', function () {
    // Reset the flag each time so the next event starts fresh.
    centerClickFromScreen = false;
  });

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
    // Cover Flow backside: the track list inside the active cover
    if (isBacksideActive()) {
      return document.querySelector('.coverflow-backside-list');
    }
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
    // Cover Flow backside track list: use inertial scroll
    if (isBacksideActive()) return !!getScrollContainer();
    // Don't use inertial scroll for cover flow (front), brick game, now playing, photos
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

    // --- Inertial scroll for standard list views (and cover flow backside) ---
    if (isListView()) {
      var container = getScrollContainer();
      if (container) {
        // On backside, if the initial gesture is predominantly horizontal,
        // don't consume it — let the swipe-right back gesture handle it.
        if (onBackside && Math.abs(dx) > Math.abs(dy) * 1.5) {
          return;
        }
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
        }
        // Hide the highlight bar during touch scroll
        var activeEl = container.querySelector('.list-item.active');
        if (activeEl) activeEl.classList.remove('active');
        // Signal cover flow that backside scroll position is user-driven
        if (onBackside && window.ipodApp && window.ipodApp.activeCoverFlow) {
          window.ipodApp.activeCoverFlow._backsideTouchScrolled = true;
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

    var inCoverFlow = isCoverFlowActive();
    var onBackside = isBacksideActive();

    // --- Swipe right to go back (menu) when on backside: check BEFORE inertia
    // so a horizontal back-gesture doesn't get swallowed by momentum.
    if (isSwiping && onBackside && dx > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) {
      window.dispatchEvent(new Event('menuclick'));
      return;
    }

    // --- Inertial scroll momentum (standard lists + cover flow backside) ---
    if (isSwiping && isListView()) {
      startInertia();
      return;
    }

    if (!isSwiping && elapsed < 400 && Math.abs(dy) < 15 && Math.abs(dx) < 15) {
      // --- Tap ---
      // If on the Cover Flow backside and the tap is OUTSIDE the backside box,
      // treat it as "close" (same as pressing Menu).
      if (onBackside) {
        var bsEl = document.querySelector('.coverflow-backside');
        if (bsEl) {
          var br = bsEl.getBoundingClientRect();
          var inside = e.clientX >= br.left && e.clientX <= br.right &&
                       e.clientY >= br.top && e.clientY <= br.bottom;
          if (!inside) {
            window.dispatchEvent(new Event('menuclick'));
            return;
          }
        }
      }
      if (isListView()) {
        // Tap on a list item: select the item at the tapped position
        var tappedIdx = getItemIndexAtY(e.clientY);
        if (tappedIdx >= 0) {
          if (onBackside && window.ipodApp && window.ipodApp.activeCoverFlow) {
            window.ipodApp.activeCoverFlow.backsideScrollIndex = tappedIdx;
            // Avoid auto-scroll fighting the finger; just refresh highlight.
            var bsItems = document.querySelectorAll('.coverflow-backside .list-item');
            bsItems.forEach(function(it, i) {
              it.classList.toggle('active', i === tappedIdx);
            });
            centerClickFromScreen = true;
            setTimeout(function() {
              window.dispatchEvent(new Event('centerclick'));
            }, 80);
          } else if (window.ipodApp) {
            window.ipodApp.scrollIndex = tappedIdx;
            window.ipodApp.updateListSelection();
            centerClickFromScreen = true;
            setTimeout(function() {
              window.dispatchEvent(new Event('centerclick'));
            }, 80);
          }
        }
      } else {
        // Non-list views: plain centerclick
        centerClickFromScreen = true;
        window.dispatchEvent(new Event('centerclick'));
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
