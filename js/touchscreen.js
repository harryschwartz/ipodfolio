// Touchscreen Navigation + Info Button
// Adds tap-to-select and swipe-to-scroll on the iPod screen.
// Tracks whether user only uses the screen (no wheel/buttons) —
// if so, after a threshold, shows the instructions overlay.

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
  var SCROLL_STEP = 40;  // px per scroll item

  function initTouchscreen() {
    var screenEl = document.querySelector('.screen-content');
    if (!screenEl) return;

    screenEl.addEventListener('pointerdown', onPointerDown, { passive: false });
    screenEl.addEventListener('pointermove', onPointerMove, { passive: false });
    screenEl.addEventListener('pointerup', onPointerUp, { passive: false });
    screenEl.addEventListener('pointercancel', onPointerCancel, { passive: false });
  }

  function onPointerDown(e) {
    // Ignore if it's a click on an interactive element inside Now Playing
    if (e.target.closest('.np-speed-badge')) return;

    touchStartY = e.clientY;
    touchStartX = e.clientX;
    touchStartTime = Date.now();
    isSwiping = false;
    accumulatedSwipe = 0;
  }

  function isCoverFlowActive() {
    return !!document.querySelector('.coverflow-container');
  }

  function isBacksideActive() {
    return !!document.querySelector('.coverflow-backside');
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

    // Backside (track list) and normal list: vertical swipe for scrolling
    // Cover flow album browsing: horizontal swipe for scrolling
    var useHorizontal = inCoverFlow && !onBackside;

    // Continuous scroll during drag (only on the scroll axis)
    if (isSwiping) {
      var total = useHorizontal ? (e.clientX - touchStartX) : (e.clientY - touchStartY);
      var stepSize = useHorizontal ? 60 : SCROLL_STEP;
      // On backside, only count vertical movement for scroll steps
      // (horizontal movement is reserved for swipe-right-to-back, handled in onPointerUp)
      if (onBackside && Math.abs(dx) > Math.abs(dy) * 1.5) {
        // Predominantly horizontal on backside — don't scroll, will be handled as back gesture
        return;
      }
      var steps = Math.floor(Math.abs(total) / stepSize);
      var fired = Math.abs(accumulatedSwipe);
      // Backside uses natural scroll: finger up = highlight up (backward)
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
  }

  function onPointerUp(e) {
    if (!touchStartTime) return;
    var dy = e.clientY - touchStartY;
    var dx = e.clientX - touchStartX;
    var elapsed = Date.now() - touchStartTime;
    touchStartTime = 0;

    // If info overlay is showing (from ℹ️ button), screen tap dismisses it
    // But don't dismiss the initial tutorial overlay from boot — that requires wheel/buttons
    if (infoOverlayActive && !isSwiping && elapsed < 400) {
      hideInfoOverlay();
      overlayShownByTouch = false;
      return; // consume the tap
    }
    // If initial tutorial is still visible, don't dismiss on screen tap — let it persist
    if (window.ipodTutorialOverlay && window.ipodTutorialOverlay.isActive && !infoOverlayActive) {
      // Still allow the tap to fire centerclick for navigation, overlay just stays
    }

    var inCoverFlow = isCoverFlowActive();
    var onBackside = isBacksideActive();

    // Swipe right to go back (menu) when on backside or in cover flow
    if (isSwiping && inCoverFlow && dx > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (onBackside) {
        // Swipe right on backside → close backside (go back to album covers)
        window.dispatchEvent(new Event('menuclick'));
      }
      // If not on backside, horizontal swipe is already handled in onPointerMove for browsing
    } else if (!isSwiping && elapsed < 400 && Math.abs(dy) < 15 && Math.abs(dx) < 15) {
      // Tap → select (center click)
      centerClickFromScreen = true;
      window.dispatchEvent(new Event('centerclick'));

      // Count screen-only touches (skip during boot/QR)
      if (!wheelUsed && window.ipodApp && !window.ipodApp.bootScreenActive && !window.ipodApp.desktopQRActive) {
        screenTouchCount++;
        if (screenTouchCount >= TOUCH_ONLY_LIMIT && !infoOverlayActive && !overlayShownByTouch) {
          overlayShownByTouch = true;
          showInfoOverlay();
        }
      }
    }
    // Swipe-based scroll was already handled in onPointerMove
  }

  function onPointerCancel() {
    touchStartTime = 0;
    isSwiping = false;
    accumulatedSwipe = 0;
  }

  // Init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTouchscreen);
  } else {
    initTouchscreen();
  }
})();
