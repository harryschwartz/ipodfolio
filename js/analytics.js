// ============================================================
// iPodfolio analytics — thin wrapper around Vercel Web Analytics
// ============================================================
// Emits named custom events via the `va` queue installed in index.html.
// Doubles as the session-lifecycle tracker (duration, max depth,
// crude drop-off signal via beforeunload/pagehide).
//
// Public API:
//   analytics.track(eventName, dataObject?)
//   analytics.markDepth(depthNumber)   // used to compute maxDepth
//
// Design notes:
// - We do NOT throw on missing `va` (e.g. local file:// or ad-blocked).
//   Every call is best-effort.
// - Long strings get truncated to keep the payload small; Vercel caps
//   event data at ~2KB per event.
// - `pagehide` is fired on iOS Safari backgrounding, `beforeunload` on
//   desktop. We register both and de-dupe with a sent flag.
// - `sendBeacon` is not exposed by the Vercel script; we call `va()` and
//   rely on the SDK's own outbound handling. That's usually reliable
//   because the script queues into an Image() beacon under the hood.
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
    try {
      var payload = { name: name };
      var d = sanitizeData(data);
      if (d) payload.data = d;
      if (typeof window.va === 'function') {
        window.va('event', payload);
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
