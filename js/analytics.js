// ============================================================
// iPodfolio analytics — fan-out wrapper for Vercel + PostHog
// ============================================================
// Emits named custom events to two destinations:
//   1. Vercel Web Analytics via the `va` queue (Hobby plan: only
//      pageviews render in the dashboard; custom events are dropped
//      server-side, but the queue call is harmless).
//   2. PostHog via `posthog.capture()` — full custom-event support on
//      the free tier + session replay.
//
// Also owns the session-lifecycle tracker (duration, max depth,
// crude drop-off signal via beforeunload/pagehide).
//
// Public API:
//   analytics.track(eventName, dataObject?)
//   analytics.markDepth(depthNumber)   // used to compute maxDepth
//
// Design notes:
// - Every call is best-effort. Never throws — analytics must never
//   crash the app. If a provider isn't loaded (ad-blocker, offline,
//   file:// origin), we silently skip it.
// - Long strings get truncated to keep the payload small; Vercel caps
//   event data at ~2KB per event. PostHog is more generous but we
//   still keep values small so replays stay light.
// - `pagehide` fires on iOS Safari backgrounding, `beforeunload` on
//   desktop. We register both and de-dupe with a sent flag.
// ============================================================

(function () {
  var MAX_STR = 80;             // truncate string prop values
  var MAX_EVENTS_PER_SESSION = 200;  // hard cap to avoid runaway loops

  var sessionStart = Date.now();
  var maxDepth = 0;
  var eventsSent = 0;
  var sessionEndSent = false;

  function truncate(v) {
    if (typeof v === 'string' && v.length > MAX_STR) return v.slice(0, MAX_STR - 1) + '\u2026';
    return v;
  }

  function sanitizeData(data) {
    if (!data || typeof data !== 'object') return undefined;
    var out = {};
    var keys = Object.keys(data);
    for (var i = 0; i < keys.length && i < 20; i++) {
      var k = keys[i];
      var v = data[k];
      if (v === undefined || v === null) continue;
      if (typeof v === 'number' || typeof v === 'boolean') {
        out[k] = v;
      } else {
        out[k] = truncate(String(v));
      }
    }
    return out;
  }

  function track(name, data) {
    if (!name || typeof name !== 'string') return;
    if (eventsSent >= MAX_EVENTS_PER_SESSION) return;
    eventsSent++;
    var d = sanitizeData(data);
    // 1. Vercel (Hobby drops custom events, but harmless to send)
    try {
      if (typeof window.va === 'function') {
        var vercelPayload = { name: name };
        if (d) vercelPayload.data = d;
        window.va('event', vercelPayload);
      }
    } catch (e) { /* never let analytics crash the app */ }
    // 2. PostHog (this is where the funnel actually lives)
    try {
      if (window.posthog && typeof window.posthog.capture === 'function') {
        window.posthog.capture(name, d || {});
      }
    } catch (e) { /* never let analytics crash the app */ }
  }

  function markDepth(n) {
    if (typeof n === 'number' && n > maxDepth) maxDepth = n;
  }

  function fireSessionEnd() {
    if (sessionEndSent) return;
    sessionEndSent = true;
    var durationSec = Math.round((Date.now() - sessionStart) / 1000);
    track('session_end', {
      durationSec: durationSec,
      maxDepth: maxDepth,
      eventsInSession: eventsSent,
    });
  }

  // Both events fire on tab close / navigation away; pagehide also fires
  // on iOS Safari backgrounding, which is often the closest we can get
  // to a real "left" signal on mobile.
  window.addEventListener('pagehide', fireSessionEnd);
  window.addEventListener('beforeunload', fireSessionEnd);

  // Expose
  window.analytics = {
    track: track,
    markDepth: markDepth,
  };
})();
