// View Renderers — each node type gets its own render function
// Returns DOM element for the screen content area

// Rewrite a Supabase storage URL to use the on-the-fly image transform endpoint.
// Works for URLs like: https://<proj>.supabase.co/storage/v1/object/public/<bucket>/<path>
// Becomes: https://<proj>.supabase.co/storage/v1/render/image/public/<bucket>/<path>?width=<w>&quality=<q>&resize=contain
// For non-Supabase URLs, returns the original URL unchanged.
//
// IMPORTANT: resize=contain preserves aspect ratio (maps to resizing_type:fit).
// Without it, Supabase defaults to resizing_type:fill, which returns tall/wide
// strips instead of proportional thumbnails — e.g. a landscape 1024x768 source
// at ?width=240 returns 240x768 instead of 240x180. Combined with CSS
// `object-fit: cover; aspect-ratio: 1;` this made thumbnails appear zoomed in.
function transformedImageUrl(url, { width, quality = 75, resize = 'contain' } = {}) {
  if (!url || typeof url !== 'string') return url;
  if (!/supabase\.co\/storage\/v1\/object\/public\//.test(url)) return url;
  const rendered = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
  const params = new URLSearchParams();
  if (width) params.set('width', String(width));
  if (quality) params.set('quality', String(quality));
  if (resize) params.set('resize', String(resize));
  const qs = params.toString();
  return qs ? `${rendered}?${qs}` : rendered;
}

// Default cover/thumbnail width for CMS-hosted images. Covers render at most
// ~320 CSS px in Cover Flow; 640px handles 2x DPR comfortably.
const COVER_THUMB_WIDTH = 640;
const COVER_THUMB_QUALITY = 75;

// Fast image factory — all images get decoding=async for non-blocking rendering.
// Supabase-hosted sources are automatically downscaled via the transform endpoint.
function _img(className, src) {
  const img = document.createElement('img');
  if (className) img.className = className;
  img.decoding = 'async';
  if (src) img.src = transformedImageUrl(src, { width: COVER_THUMB_WIDTH, quality: COVER_THUMB_QUALITY });
  return img;
}

// Creates a cover art element — either an <img> or an emoji div
function createCoverEl(metadata, className, fallbackSrc) {
  if (metadata?.coverEmoji) {
    const el = document.createElement('div');
    el.className = className;
    el.style.backgroundColor = metadata.coverColor || '#6366f1';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    const span = document.createElement('span');
    span.style.fontSize = '40px';
    span.style.lineHeight = '1';
    span.textContent = metadata.coverEmoji;
    el.appendChild(span);
    return el;
  }
  const img = _img(className, metadata?.coverImage || fallbackSrc || '');
  if (metadata?.coverImagePosition || metadata?.coverImageZoom) {
    img.style.objectFit = 'cover';
    img.style.objectPosition = metadata.coverImagePosition || '50% 50%';
    if (metadata.coverImageZoom && parseFloat(metadata.coverImageZoom) !== 1) {
      img.style.transform = `scale(${metadata.coverImageZoom})`;
      img.style.transformOrigin = metadata.coverImagePosition || '50% 50%';
    }
  }
  return img;
}

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '--:--';
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}:${String(rm).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// SVG icons
const ARROW_RIGHT_SVG = `<svg class="arrow-right" viewBox="0 0 8 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L7 7L1 13" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>`;
const VOLUME_MUTE_SVG = `<svg class="volume-icon" viewBox="0 0 16 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M0 4h3l4-4v12L3 8H0V4z" fill="#666"/></svg>`;
const VOLUME_FULL_SVG = `<svg class="volume-icon" viewBox="0 0 20 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M0 4h3l4-4v12L3 8H0V4z" fill="#666"/><path d="M12 1c2 1.5 3 3.5 3 5s-1 3.5-3 5" stroke="#666" stroke-width="1.5" fill="none"/><path d="M10 3c1.2.9 2 2.1 2 3s-.8 2.1-2 3" stroke="#666" stroke-width="1.5" fill="none"/></svg>`;


// ---- Folder View (List) ----
function renderFolderView(node, children, isTopLevel) {
  const container = document.createElement('div');

  if (isTopLevel) {
    // Split screen: list on left, preview on right
    container.className = 'split-screen';
    
    const left = document.createElement('div');
    left.className = 'split-left';
    
    const right = document.createElement('div');
    right.className = 'split-right';
    
    const list = createSelectableList(children, 0, isTopLevel);
    left.appendChild(list);

    // Build per-item image pools for Ken Burns.
    // cover_flow_home shares the Projects folder's image pool.
    // All other navigable items use their direct children's cover images.
    // Fallback: item's own coverImage/previewImage, then the default preview.
    const projectsFolder = children.find(c => c.metadata?.splitScreen === false);
    const projectsPool = projectsFolder
      ? getChildren(projectsFolder.id).map(c => c.metadata?.coverImage || c.metadata?.previewImage).filter(Boolean)
      : [];

    const urlsPerItem = children.map(item => {
      if (item.type === '_now_playing') {
        // Now Playing uses the current track's artwork or fallback
        const track = typeof audioPlayer !== 'undefined' ? audioPlayer.currentTrack : null;
        const coverUrl = track?.metadata?.coverImage || track?.metadata?.coverImageUrl || 'img/headphones-cover.jpg';
        return [coverUrl];
      }
      if (item.type === 'cover_flow_home' || item.type === 'cover_flow_music') {
        return projectsPool.length ? projectsPool : ['img/projects-preview.jpg'];
      }
      // Use the node's own photos array if available (e.g. game/settings nodes)
      const nodePhotos = Array.isArray(item.metadata?.photos)
        ? item.metadata.photos.map(p => p.url).filter(Boolean)
        : [];
      if (nodePhotos.length) return nodePhotos;
      // Collect images from direct children: cover images or children's photos
      const itemChildren = getChildren(item.id);
      const childImgs = itemChildren
        .map(c => c.metadata?.coverImage || c.metadata?.previewImage)
        .filter(Boolean);
      if (childImgs.length) return childImgs;
      const childPhotos = itemChildren
        .flatMap(c => Array.isArray(c.metadata?.photos) ? c.metadata.photos.map(p => p.url) : [])
        .filter(Boolean);
      if (childPhotos.length) return childPhotos;
      // Fall back to item's own image
      const own = item.metadata?.coverImage || item.metadata?.previewImage;
      return own ? [own] : ['img/projects-preview.jpg'];
    });

    const urls = urlsPerItem[0] || ['img/projects-preview.jpg'];

    const kbContainer = document.createElement('div');
    kbContainer.className = 'ken-burns-container';

    const img0 = document.createElement('img');
    img0.className = 'ken-burns-img active';
    img0.src = transformedImageUrl(urls[0], { width: COVER_THUMB_WIDTH, quality: COVER_THUMB_QUALITY });

    const img1 = document.createElement('img');
    img1.className = 'ken-burns-img inactive';
    img1.src = transformedImageUrl(urls[1] || urls[0], { width: COVER_THUMB_WIDTH, quality: COVER_THUMB_QUALITY });

    kbContainer.appendChild(img0);
    kbContainer.appendChild(img1);
    right.appendChild(kbContainer);

    container.appendChild(left);
    container.appendChild(right);
    container._listEl = left;
    container._kenBurns = { urls, index: 0, img0, img1, urlsPerItem };
  } else {
    container.className = 'selectable-list';
    const list = createSelectableList(children, 0, false);
    container.appendChild(list);
    container._listEl = container;
  }
  
  return container;
}

function createSelectableList(items, activeIndex, showArrow) {
  const frag = document.createDocumentFragment();
  
  items.forEach((item, i) => {
    const el = document.createElement('div');
    el.className = 'list-item' + (i === activeIndex ? ' active' : '');
    el.dataset.index = i;
    
    // Inline cover art only for playlist items
    if (item.type === 'playlist' && (item.metadata?.coverEmoji || item.metadata?.coverImage || item.metadata?.thumbnailUrl)) {
      const cover = createCoverEl(
        item.metadata?.coverEmoji ? item.metadata : { coverImage: item.metadata?.coverImage || item.metadata?.thumbnailUrl },
        'list-item-image'
      );
      cover.alt = item.title;
      el.appendChild(cover);
    }
    
    const labelContainer = document.createElement('div');
    labelContainer.className = 'list-label-container';
    
    const label = document.createElement('h3');
    label.className = 'list-label';
    label.textContent = item.title;
    labelContainer.appendChild(label);
    
    // Sublabel for songs
    if (item.type === 'song' && item.metadata?.artistName) {
      const sub = document.createElement('h3');
      sub.className = 'list-sublabel';
      sub.textContent = item.metadata.artistName;
      labelContainer.appendChild(sub);
    }
    
    el.appendChild(labelContainer);
    
    // Arrow for active items
    const arrow = document.createElement('span');
    arrow.className = 'list-arrow';
    arrow.innerHTML = ARROW_RIGHT_SVG;
    el.appendChild(arrow);
    
    frag.appendChild(el);
  });
  
  return frag;
}

/** Turn list-item rows into anchor rows (same layout, opens URL). */
function wrapListRowsAsLinks(container, linkItems) {
  const rows = container.querySelectorAll('.list-item');
  rows.forEach((row, i) => {
    const item = linkItems[i];
    if (!item?.metadata?.url) return;
    const a = document.createElement('a');
    a.className = row.className;
    a.href = item.metadata.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    while (row.firstChild) a.appendChild(row.firstChild);
    row.replaceWith(a);
  });
}

// ---- Album View ----
function renderAlbumView(node, children) {
  const container = document.createElement('div');
  container.className = 'album-view';
  
  const header = document.createElement('div');
  header.className = 'album-header';
  
  if (node.metadata?.coverEmoji || node.metadata?.coverImage) {
    const clip = document.createElement('div');
    clip.className = 'album-cover-clip';
    const cover = createCoverEl(node.metadata, 'album-cover-small');
    cover.alt = node.title;
    clip.appendChild(cover);
    header.appendChild(clip);
  }
  
  const info = document.createElement('div');
  info.className = 'album-header-info';
  info.innerHTML = `
    <div class="album-header-title">${node.title}</div>
    <div class="album-header-artist">${node.metadata?.artistName || ''}</div>
  `;
  header.appendChild(info);
  container.appendChild(header);
  
  const tracks = document.createElement('div');
  tracks.className = 'album-tracks';
  tracks.appendChild(createSelectableList(children, 0, true));
  container.appendChild(tracks);
  container._listEl = tracks;
  
  return container;
}

// ---- Now Playing View ----
function renderNowPlayingView() {
  const container = document.createElement('div');
  container.className = 'now-playing';
  
  const meta = document.createElement('div');
  meta.className = 'now-playing-metadata';
  
  const artContainer = document.createElement('div');
  artContainer.className = 'now-playing-artwork-container';
  const art = document.createElement('img');
  art.className = 'now-playing-artwork';
  art.src = 'img/headphones-cover.jpg';
  art.alt = 'Album artwork';
  artContainer.appendChild(art);
  meta.appendChild(artContainer);
  
  const info = document.createElement('div');
  info.className = 'now-playing-info';
  info.innerHTML = `
    <div class="now-playing-title">--</div>
    <div class="now-playing-subtitle">--</div>
    <div class="now-playing-subtitle">--</div>
    <div class="now-playing-caption"></div>
  `;
  meta.appendChild(info);
  container.appendChild(meta);

  // Status row: shuffle/repeat icons + track counter
  const statusRow = document.createElement('div');
  statusRow.className = 'now-playing-status-row';
  statusRow.id = 'np-status-row';
  statusRow.innerHTML = `
    <span class="np-status-icons" id="np-status-icons"></span>
    <span class="np-speed-badge" id="np-speed-badge"></span>
    <span class="np-track-counter" id="np-track-counter"></span>
  `;
  container.appendChild(statusRow);
  
  // Controls
  const controls = document.createElement('div');
  controls.className = 'now-playing-controls';
  
  // Layer 1: Track progress
  const progressLayer = document.createElement('div');
  progressLayer.className = 'controls-layer';
  progressLayer.id = 'np-progress-layer';
  progressLayer.innerHTML = `
    <span class="progress-time" id="np-current-time">--:--</span>
    <div class="progress-bar-container">
      <div class="progress-bar-track">
        <div class="progress-bar-fill" id="np-progress-fill" style="width:0%"></div>
      </div>
    </div>
    <span class="progress-time" id="np-remaining-time">--:--</span>
  `;
  
  // Layer 2: Scrubber
  const scrubberLayer = document.createElement('div');
  scrubberLayer.className = 'controls-layer hidden-right';
  scrubberLayer.id = 'np-scrubber-layer';
  scrubberLayer.innerHTML = `
    <span class="progress-time" id="np-scrub-time">--:--</span>
    <div class="progress-bar-container">
      <div class="progress-bar-track">
        <div class="progress-bar-fill" id="np-scrub-fill" style="width:0%">
          <div class="progress-bar-diamond"></div>
        </div>
      </div>
    </div>
    <span class="progress-time" id="np-scrub-remaining">--:--</span>
  `;
  
  controls.appendChild(progressLayer);
  controls.appendChild(scrubberLayer);
  container.appendChild(controls);

  // Direct-drag scrubbing on the scrubber bar. The scrubber layer stays hidden
  // (`hidden-right`) until the user activates scrub mode via the select button;
  // while hidden it has `pointer-events: none` so these handlers do nothing.
  attachScrubberDrag(scrubberLayer);

  return container;
}

// Wire direct-drag pointer handlers on the scrubber layer. Dragging anywhere
// along the progress bar (and its end-time labels) sets the scrub position
// based on pointer X relative to the track.
function attachScrubberDrag(scrubberLayer) {
  const track = scrubberLayer.querySelector('.progress-bar-track');
  const container = scrubberLayer.querySelector('.progress-bar-container');
  if (!track || !container) return;

  let dragging = false;
  let activePointerId = null;

  function pctFromEvent(e) {
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const x = e.clientX - rect.left;
    return Math.max(0, Math.min(100, (x / rect.width) * 100));
  }

  function applyPercent(pct) {
    if (!window.ipodApp) return;
    window.ipodApp.scrubPercent = pct;
    audioPlayer.seek(pct);
    window.ipodApp.updateNowPlayingUI();
  }

  container.addEventListener('pointerdown', (e) => {
    // Only respond when the user is in scrubber mode
    if (!window.ipodApp || window.ipodApp.nowPlayingControlState !== 1) return;
    dragging = true;
    activePointerId = e.pointerId;
    try { container.setPointerCapture(e.pointerId); } catch (_) {}
    e.stopPropagation();
    e.preventDefault();
    applyPercent(pctFromEvent(e));
  });

  container.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== activePointerId) return;
    e.stopPropagation();
    e.preventDefault();
    applyPercent(pctFromEvent(e));
  });

  function endDrag(e) {
    if (!dragging || e.pointerId !== activePointerId) return;
    dragging = false;
    activePointerId = null;
    try { container.releasePointerCapture(e.pointerId); } catch (_) {}
    e.stopPropagation();
  }
  container.addEventListener('pointerup', endDrag);
  container.addEventListener('pointercancel', endDrag);
}

// ---- Photo Album Grid ----
function renderPhotoGrid(node) {
  const container = document.createElement('div');
  container.className = 'photo-grid';
  
  const photos = node.metadata?.photos || [];
  // Thumbs render at ~110×110 CSS px in a 3-col grid on mobile; 240px wide covers 2x DPR.
  photos.forEach((photo, i) => {
    const img = document.createElement('img');
    img.className = 'photo-thumb' + (i === 0 ? ' active' : '');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = photo.caption || 'Photo';
    img.dataset.index = i;
    // attachPhotoLoader gives us onerror fallback to the original URL.
    attachPhotoLoader(img, photo, { width: 240, quality: 70 });
    container.appendChild(img);
  });
  
  return container;
}

// ---- Photo Fullscreen ----
// Attach a loader with retry/fallback: if the Supabase transform fetch fails
// (cold edge, 504, network flake), fall back to the original un-transformed
// URL before giving up. Also shows a shimmer skeleton while loading.
function attachPhotoLoader(img, photo, transformOpts) {
  const transformed = transformedImageUrl(photo.url, transformOpts);
  let attempt = 0;
  img.classList.add('photo-loading');
  const onLoad = () => {
    img.classList.remove('photo-loading');
    img.classList.remove('photo-error');
  };
  const onError = () => {
    attempt += 1;
    if (attempt === 1 && transformed !== photo.url) {
      // Transform endpoint failed — try the original storage URL directly.
      img.src = photo.url;
      return;
    }
    if (attempt === 2) {
      // Second failure — one retry with cache-bust on the transform URL.
      img.src = transformed + (transformed.includes('?') ? '&' : '?') + 'r=' + Date.now();
      return;
    }
    // Give up: show an error state so the user sees something tangible.
    img.classList.remove('photo-loading');
    img.classList.add('photo-error');
  };
  img.addEventListener('load', onLoad);
  img.addEventListener('error', onError);
  img.src = transformed;
}

function renderPhotoFullscreen(photo) {
  const container = document.createElement('div');
  container.className = 'photo-fullscreen';

  // Skeleton shimmer shown until the image loads.
  const skeleton = document.createElement('div');
  skeleton.className = 'photo-skeleton';
  container.appendChild(skeleton);

  const img = document.createElement('img');
  // Fullscreen shows at most ~370×232 on mobile; 1200px covers 3x DPR and
  // avoids downloading multi-MB originals for the common case.
  img.decoding = 'async';
  img.loading = 'eager';
  img.fetchPriority = 'high';
  img.setAttribute('fetchpriority', 'high');
  img.alt = photo.caption || 'Photo';
  img.addEventListener('load', () => skeleton.remove(), { once: true });
  attachPhotoLoader(img, photo, { width: 1200, quality: 85 });
  container.appendChild(img);

  if (photo.caption) {
    const cap = document.createElement('div');
    cap.className = 'photo-caption';
    cap.textContent = photo.caption;
    container.appendChild(cap);
  }

  return container;
}

// ---- Text View (About) ----
function renderTextView(node) {
  const container = document.createElement('div');
  container.className = 'text-view';

  const scroll = document.createElement('div');
  scroll.className = 'text-view-scroll';

  const p = document.createElement('p');
  p.textContent = node.metadata?.bodyText || '';
  scroll.appendChild(p);

  if (node.metadata?.links?.length) {
    const linkItems = node.metadata.links.map((link, i) => ({
      id: `${node.id}-link-${i}`,
      title: link.label,
      type: 'link',
      metadata: { url: link.url },
    }));
    const links = document.createElement('div');
    links.className = 'text-view-links';
    links.appendChild(createSelectableList(linkItems, -1, true));
    wrapListRowsAsLinks(links, linkItems);
    scroll.appendChild(links);
  }

  container.appendChild(scroll);
  container._scrollEl = scroll;
  return container;
}

// ---- Video View ----
function renderVideoView(node) {
  const container = document.createElement('div');
  container.className = 'video-view';
  
  if (node.metadata?.videoUrl) {
    const video = document.createElement('video');
    video.src = node.metadata.videoUrl;
    video.controls = false;
    video.playsInline = true;
    container.appendChild(video);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'video-placeholder';
    placeholder.textContent = 'No video available';
    container.appendChild(placeholder);
  }
  
  return container;
}

// ---- Settings View ----
function renderSettingsView(currentTheme, hapticsEnabled) {
  const container = document.createElement('div');
  container.className = 'settings-view';
  // Mark as the scroll/list element so app.updateListSelection() uses
  // container-aware scrolling instead of the default scrollIntoView(),
  // which doesn't account for section headers above the active item.
  container._listEl = container;
  
  let itemIndex = 0;

  // Playback section (first)
  const playbackHeader = document.createElement('div');
  playbackHeader.className = 'settings-section-header';
  playbackHeader.textContent = 'Playback';
  container.appendChild(playbackHeader);

  // Shuffle
  const shuffleEl = document.createElement('div');
  shuffleEl.className = 'list-item' + (itemIndex === 0 ? ' active' : '');
  shuffleEl.dataset.index = itemIndex;
  const shuffleLabelContainer = document.createElement('div');
  shuffleLabelContainer.className = 'list-label-container';
  const shuffleLabel = document.createElement('h3');
  shuffleLabel.className = 'list-label';
  shuffleLabel.textContent = 'Shuffle';
  shuffleLabelContainer.appendChild(shuffleLabel);
  shuffleEl.appendChild(shuffleLabelContainer);
  const shuffleValue = document.createElement('span');
  shuffleValue.className = 'list-value';
  shuffleValue.textContent = audioPlayer.shuffle ? 'On' : 'Off';
  shuffleEl.appendChild(shuffleValue);
  container.appendChild(shuffleEl);
  itemIndex++;

  // Repeat
  const repeatEl = document.createElement('div');
  repeatEl.className = 'list-item';
  repeatEl.dataset.index = itemIndex;
  const repeatLabelContainer = document.createElement('div');
  repeatLabelContainer.className = 'list-label-container';
  const repeatLabel = document.createElement('h3');
  repeatLabel.className = 'list-label';
  repeatLabel.textContent = 'Repeat';
  repeatLabelContainer.appendChild(repeatLabel);
  repeatEl.appendChild(repeatLabelContainer);
  const repeatValue = document.createElement('span');
  repeatValue.className = 'list-value';
  repeatValue.textContent = audioPlayer.repeat === 0 ? 'Off' : audioPlayer.repeat === 1 ? 'All' : 'One';
  repeatEl.appendChild(repeatValue);
  container.appendChild(repeatEl);
  itemIndex++;

  // Speed
  const speedEl = document.createElement('div');
  speedEl.className = 'list-item';
  speedEl.dataset.index = itemIndex;
  const speedLabelContainer = document.createElement('div');
  speedLabelContainer.className = 'list-label-container';
  const speedLabel = document.createElement('h3');
  speedLabel.className = 'list-label';
  speedLabel.textContent = 'Speed';
  speedLabelContainer.appendChild(speedLabel);
  speedEl.appendChild(speedLabelContainer);
  const speedValue = document.createElement('span');
  speedValue.className = 'list-value';
  speedValue.textContent = audioPlayer.playbackSpeed === 1 ? '1x' : audioPlayer.playbackSpeed === 1.5 ? '1.5x' : '2x';
  speedEl.appendChild(speedValue);
  container.appendChild(speedEl);
  itemIndex++;

  // Feedback section — input / device feedback settings (Haptics lives
  // here instead of under Playback because it's unrelated to audio output).
  const feedbackHeader = document.createElement('div');
  feedbackHeader.className = 'settings-section-header';
  feedbackHeader.textContent = 'Feedback';
  container.appendChild(feedbackHeader);

  // Haptics
  const hapticsEl = document.createElement('div');
  hapticsEl.className = 'list-item';
  hapticsEl.dataset.index = itemIndex;
  const hapticsLabelContainer = document.createElement('div');
  hapticsLabelContainer.className = 'list-label-container';
  const hapticsLabel = document.createElement('h3');
  hapticsLabel.className = 'list-label';
  hapticsLabel.textContent = 'Haptics';
  hapticsLabelContainer.appendChild(hapticsLabel);
  hapticsEl.appendChild(hapticsLabelContainer);
  const hapticsValue = document.createElement('span');
  hapticsValue.className = 'list-value';
  hapticsValue.textContent = hapticsEnabled !== false ? 'On' : 'Off';
  hapticsEl.appendChild(hapticsValue);
  container.appendChild(hapticsEl);
  itemIndex++;

  // Footnote under Haptics: hardware ringer is required for sound on iOS.
  // Not a selectable list item — no dataset.index, no 'list-item' class —
  // so it doesn't participate in click-wheel navigation.
  const ringerNote = document.createElement('p');
  ringerNote.className = 'settings-note';
  ringerNote.textContent = 'Turn your ringer on for the full audio experience.';
  container.appendChild(ringerNote);

  // Theme section
  const themes = [
    { id: 'silver', title: 'Silver' },
    { id: 'black', title: 'Black' },
    { id: 'u2', title: 'U2' },
    { id: 'pink', title: 'Pink' },
  ];
  
  const themeHeader = document.createElement('div');
  themeHeader.className = 'settings-section-header';
  themeHeader.textContent = 'Theme';
  container.appendChild(themeHeader);
  
  themes.forEach((theme) => {
    const el = document.createElement('div');
    el.className = 'list-item';
    el.dataset.index = itemIndex;
    el.dataset.themeId = theme.id;
    
    const labelContainer = document.createElement('div');
    labelContainer.className = 'list-label-container';
    const label = document.createElement('h3');
    label.className = 'list-label';
    label.textContent = theme.title + (theme.id === currentTheme ? ' ✓' : '');
    labelContainer.appendChild(label);
    el.appendChild(labelContainer);
    
    const arrow = document.createElement('span');
    arrow.className = 'list-arrow';
    arrow.innerHTML = ARROW_RIGHT_SVG;
    el.appendChild(arrow);
    
    container.appendChild(el);
    itemIndex++;
  });
  
  return container;
}

// ---- Playlist View ----
function renderPlaylistView(node, songs) {
  const container = document.createElement('div');
  container.className = 'playlist-view';
  
  const header = document.createElement('div');
  header.className = 'playlist-header';
  
  if (node.metadata?.coverEmoji || node.metadata?.coverImage) {
    const clip = document.createElement('div');
    clip.className = 'playlist-cover-clip';
    const cover = createCoverEl(node.metadata, 'playlist-cover');
    cover.alt = node.title;
    clip.appendChild(cover);
    header.appendChild(clip);
  }
  
  const info = document.createElement('div');
  info.className = 'playlist-header-info';
  info.innerHTML = `
    <div class="playlist-header-title">${node.title}</div>
    <div class="playlist-header-count">${(() => {
      const songCount = songs.filter(s => s.type === 'song').length;
      const linkCount = songs.filter(s => s.type === 'link').length;
      const parts = [];
      if (songCount) parts.push(`${songCount} song${songCount !== 1 ? 's' : ''}`);
      if (linkCount) parts.push(`${linkCount} link${linkCount !== 1 ? 's' : ''}`);
      return parts.join(', ') || '0 songs';
    })()}</div>
  `;
  header.appendChild(info);
  container.appendChild(header);
  
  const tracks = document.createElement('div');
  tracks.className = 'playlist-tracks';
  tracks.appendChild(createSelectableList(songs, 0, true));
  container.appendChild(tracks);
  container._listEl = tracks;
  
  return container;
}

// ---- Music Library Views ----

// Music menu: Playlists, Artists, Albums, Songs
function renderMusicMenuView() {
  const container = document.createElement('div');
  container.className = 'selectable-list';
  const items = [
    { id: '_music_cover_flow', title: 'Cover Flow', type: '_music_menu' },
    { id: '_music_playlists', title: 'Playlists', type: '_music_menu' },
    { id: '_music_artists', title: 'Artists', type: '_music_menu' },
    { id: '_music_albums', title: 'Albums', type: '_music_menu' },
    { id: '_music_songs', title: 'Songs', type: '_music_menu' },
  ];
  container.appendChild(createSelectableList(items, 0, true));
  container._listEl = container;
  return { view: container, items };
}

// Songs list view (flat alphabetical list of all library songs)
function renderMusicSongsView(songs) {
  const container = document.createElement('div');
  container.className = 'selectable-list';
  // "Shuffle Songs" action at the top
  const shuffleItem = { id: '_shuffle_songs', title: 'Shuffle Songs', type: '_shuffle_songs' };
  const allItems = [shuffleItem, ...songs];
  container.appendChild(createSelectableList(allItems, 0, true));
  container._listEl = container;
  container._allItems = allItems;
  return container;
}

// Artists list view (distinct artist names)
function renderMusicArtistsView(artists) {
  const container = document.createElement('div');
  container.className = 'selectable-list';
  const items = artists.map(a => ({
    id: '_artist_' + a.name,
    title: a.name,
    type: '_music_artist',
  }));
  container.appendChild(createSelectableList(items, 0, true));
  container._listEl = container;
  return { view: container, items };
}

// Artist songs view (songs by a specific artist)
function renderMusicArtistSongsView(artistName, songs) {
  const container = document.createElement('div');
  container.className = 'album-view';

  const header = document.createElement('div');
  header.className = 'album-header';
  const info = document.createElement('div');
  info.className = 'album-header-info';
  info.innerHTML = `
    <div class="album-header-title">${artistName}</div>
    <div class="album-header-artist">${songs.length} song${songs.length !== 1 ? 's' : ''}</div>
  `;
  header.appendChild(info);
  container.appendChild(header);

  const tracks = document.createElement('div');
  tracks.className = 'album-tracks';
  tracks.appendChild(createSelectableList(songs, 0, true));
  container.appendChild(tracks);
  container._listEl = tracks;
  return container;
}

// Albums list view (album name + cover art + artist)
function renderMusicAlbumsView(albums) {
  const container = document.createElement('div');
  container.className = 'selectable-list';
  const items = albums.map(a => ({
    id: '_album_' + a.name,
    title: a.name,
    type: '_music_album',
    metadata: {
      coverImage: a.coverImage,
      artistName: a.artistName,
    },
  }));

  const frag = document.createDocumentFragment();
  items.forEach((item, i) => {
    const el = document.createElement('div');
    el.className = 'list-item' + (i === 0 ? ' active' : '');
    el.dataset.index = i;

    // Album art thumbnail
    if (item.metadata.coverImage) {
      const img = document.createElement('img');
      img.className = 'list-item-image';
      img.src = transformedImageUrl(item.metadata.coverImage, { width: COVER_THUMB_WIDTH, quality: COVER_THUMB_QUALITY });
      img.alt = item.title;
      el.appendChild(img);
    }

    const labelContainer = document.createElement('div');
    labelContainer.className = 'list-label-container';
    const label = document.createElement('h3');
    label.className = 'list-label';
    label.textContent = item.title;
    labelContainer.appendChild(label);
    if (item.metadata.artistName) {
      const sub = document.createElement('h3');
      sub.className = 'list-sublabel';
      sub.textContent = item.metadata.artistName;
      labelContainer.appendChild(sub);
    }
    el.appendChild(labelContainer);

    const arrow = document.createElement('span');
    arrow.className = 'list-arrow';
    arrow.innerHTML = ARROW_RIGHT_SVG;
    el.appendChild(arrow);

    frag.appendChild(el);
  });
  container.appendChild(frag);
  container._listEl = container;
  return { view: container, items };
}

// Album tracks view (tracks sorted by track number, with header)
function renderMusicAlbumTracksView(album) {
  const container = document.createElement('div');
  container.className = 'album-view';

  const header = document.createElement('div');
  header.className = 'album-header';

  if (album.coverImage) {
    const clip = document.createElement('div');
    clip.className = 'album-cover-clip';
    const img = document.createElement('img');
    img.className = 'album-cover-small';
    img.src = transformedImageUrl(album.coverImage, { width: COVER_THUMB_WIDTH, quality: COVER_THUMB_QUALITY });
    img.alt = album.name;
    clip.appendChild(img);
    header.appendChild(clip);
  }

  const info = document.createElement('div');
  info.className = 'album-header-info';
  info.innerHTML = `
    <div class="album-header-title">${album.name}</div>
    <div class="album-header-artist">${album.artistName || ''}</div>
  `;
  header.appendChild(info);
  container.appendChild(header);

  const tracks = document.createElement('div');
  tracks.className = 'album-tracks';
  tracks.appendChild(createSelectableList(album.songs, 0, true));
  container.appendChild(tracks);
  container._listEl = tracks;
  return container;
}

// Playlists list view — with album art mosaics
function renderMusicPlaylistsView(playlists) {
  const container = document.createElement('div');
  container.className = 'selectable-list';

  const frag = document.createDocumentFragment();
  playlists.forEach((playlist, i) => {
    const el = document.createElement('div');
    el.className = 'list-item' + (i === 0 ? ' active' : '');
    el.dataset.index = i;

    // Mosaic placeholder — will be filled with album art from playlist songs
    const mosaicEl = document.createElement('div');
    mosaicEl.className = 'list-item-mosaic';
    el.appendChild(mosaicEl);

    // Fetch playlist songs and build mosaic
    fetchPlaylistSongs(playlist.id).then(songs => {
      const uniqueCovers = [];
      const seen = new Set();
      for (const s of songs) {
        const cover = s.metadata?.coverImage || s.metadata?.coverImageUrl;
        if (cover && !seen.has(cover)) {
          seen.add(cover);
          uniqueCovers.push(cover);
          if (uniqueCovers.length >= 4) break;
        }
      }
      if (uniqueCovers.length === 0) {
        // No cover art — use emoji or default
        mosaicEl.style.backgroundColor = '#6366f1';
        mosaicEl.style.display = 'flex';
        mosaicEl.style.alignItems = 'center';
        mosaicEl.style.justifyContent = 'center';
        mosaicEl.textContent = '🎵';
        return;
      }
      // Build 2×2 grid mosaic
      mosaicEl.classList.add('mosaic-grid');
      const count = Math.min(uniqueCovers.length, 4);
      // If only 1 cover, show it full; 2-3 pad with repeats to fill 4 cells
      const cells = count === 1 ? [uniqueCovers[0]]
        : [uniqueCovers[0], uniqueCovers[1] || uniqueCovers[0],
           uniqueCovers[2] || uniqueCovers[0], uniqueCovers[3] || uniqueCovers[1] || uniqueCovers[0]];
      if (count === 1) {
        // Single cover — full size
        mosaicEl.classList.remove('mosaic-grid');
        const img = document.createElement('img');
        img.src = transformedImageUrl(cells[0], { width: COVER_THUMB_WIDTH, quality: COVER_THUMB_QUALITY });
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        mosaicEl.appendChild(img);
      } else {
        cells.forEach(src => {
          const img = document.createElement('img');
          img.className = 'mosaic-cell';
          // Mosaic cells render at half the tile size; 320 is plenty.
          img.src = transformedImageUrl(src, { width: 320, quality: 70 });
          mosaicEl.appendChild(img);
        });
      }
    });

    const labelContainer = document.createElement('div');
    labelContainer.className = 'list-label-container';
    const label = document.createElement('h3');
    label.className = 'list-label';
    label.textContent = playlist.title;
    labelContainer.appendChild(label);
    el.appendChild(labelContainer);

    const arrow = document.createElement('span');
    arrow.className = 'list-arrow';
    arrow.innerHTML = ARROW_RIGHT_SVG;
    el.appendChild(arrow);

    frag.appendChild(el);
  });
  container.appendChild(frag);
  container._listEl = container;
  return container;
}

// Playlist songs view (with header) — uses album art mosaic
function renderMusicPlaylistSongsView(playlist, songs) {
  const container = document.createElement('div');
  container.className = 'playlist-view';

  const header = document.createElement('div');
  header.className = 'playlist-header';

  // Build mosaic from unique album art in playlist songs
  const uniqueCovers = [];
  const seen = new Set();
  for (const s of songs) {
    const cover = s.metadata?.coverImage || s.metadata?.coverImageUrl;
    if (cover && !seen.has(cover)) {
      seen.add(cover);
      uniqueCovers.push(cover);
      if (uniqueCovers.length >= 4) break;
    }
  }

  if (uniqueCovers.length > 0) {
    const clip = document.createElement('div');
    clip.className = 'playlist-cover-clip';

    if (uniqueCovers.length === 1) {
      const img = document.createElement('img');
      img.className = 'playlist-cover';
      img.src = transformedImageUrl(uniqueCovers[0], { width: COVER_THUMB_WIDTH, quality: COVER_THUMB_QUALITY });
      img.alt = playlist.title;
      clip.appendChild(img);
    } else {
      const mosaic = document.createElement('div');
      mosaic.className = 'playlist-cover-mosaic';
      const cells = [uniqueCovers[0], uniqueCovers[1] || uniqueCovers[0],
                     uniqueCovers[2] || uniqueCovers[0], uniqueCovers[3] || uniqueCovers[1] || uniqueCovers[0]];
      cells.forEach(src => {
        const img = document.createElement('img');
        img.className = 'mosaic-cell';
        img.src = transformedImageUrl(src, { width: 320, quality: 70 });
        mosaic.appendChild(img);
      });
      clip.appendChild(mosaic);
    }
    header.appendChild(clip);
  } else if (playlist.metadata?.coverImage) {
    const clip = document.createElement('div');
    clip.className = 'playlist-cover-clip';
    const img = document.createElement('img');
    img.className = 'playlist-cover';
    img.src = transformedImageUrl(playlist.metadata.coverImage, { width: COVER_THUMB_WIDTH, quality: COVER_THUMB_QUALITY });
    img.alt = playlist.title;
    clip.appendChild(img);
    header.appendChild(clip);
  }

  const info = document.createElement('div');
  info.className = 'playlist-header-info';
  info.innerHTML = `
    <div class="playlist-header-title">${playlist.title}</div>
    <div class="playlist-header-count">${songs.length} song${songs.length !== 1 ? 's' : ''}</div>
  `;
  header.appendChild(info);
  container.appendChild(header);

  const tracks = document.createElement('div');
  tracks.className = 'playlist-tracks';
  tracks.appendChild(createSelectableList(songs, 0, true));
  container.appendChild(tracks);
  container._listEl = tracks;
  return container;
}

// ---- Ken Burns helpers ----
function startKenBurns(container) {
  const kb = container._kenBurns;
  if (!kb || kb.urls.length < 2) return;
  kb.interval = setInterval(() => {
    kb.index = (kb.index + 1) % kb.urls.length;
    const next = (kb.index + 1) % kb.urls.length;
    const [front, back] = kb.img0.classList.contains('active')
      ? [kb.img0, kb.img1]
      : [kb.img1, kb.img0];
    back.src = transformedImageUrl(kb.urls[next], { width: COVER_THUMB_WIDTH, quality: COVER_THUMB_QUALITY });
    back.classList.replace('inactive', 'active');
    front.classList.replace('active', 'inactive');
  }, 3500);
}

function stopKenBurns(container) {
  if (container?._kenBurns?.interval) {
    clearInterval(container._kenBurns.interval);
  }
}

function swapKenBurnsPool(container, itemIndex) {
  const kb = container._kenBurns;
  if (!kb || !kb.urlsPerItem) return;
  const newUrls = kb.urlsPerItem[itemIndex];
  if (!newUrls || !newUrls.length) return;
  // Avoid restart if pool hasn't changed
  if (newUrls === kb.urls) return;

  stopKenBurns(container);
  kb.urls = newUrls;
  kb.index = 0;

  // Snap the active image to first of new pool; preload second
  const [front, back] = kb.img0.classList.contains('active')
    ? [kb.img0, kb.img1]
    : [kb.img1, kb.img0];
  front.src = transformedImageUrl(newUrls[0], { width: COVER_THUMB_WIDTH, quality: COVER_THUMB_QUALITY });
  back.src = transformedImageUrl(newUrls[1] || newUrls[0], { width: COVER_THUMB_WIDTH, quality: COVER_THUMB_QUALITY });
  // Ensure correct opacity state (no transition flash)
  front.style.transition = 'none';
  back.style.transition = 'none';
  front.classList.replace('inactive', 'active');
  back.classList.replace('active', 'inactive');
  requestAnimationFrame(() => {
    front.style.transition = '';
    back.style.transition = '';
  });

  startKenBurns(container);
}

// ---- Game View (shared for all canvas games) ----
function renderGameView(gameId) {
  const container = document.createElement('div');
  container.className = 'brick-game-container';
  container.style.position = 'relative';
  
  const canvas = document.createElement('canvas');
  canvas.className = 'game-canvas';
  canvas.id = 'brickBreakerCanvas';
  container.appendChild(canvas);
  
  const hud = document.createElement('div');
  hud.className = 'game-hud';
  hud.textContent = 'Score: 0';
  container.appendChild(hud);
  
  const hudRight = document.createElement('div');
  hudRight.className = 'game-hud-right';
  hudRight.textContent = 'Lives: 3';
  container.appendChild(hudRight);
  
  return container;
}

// Legacy alias
function renderBrickGameView() {
  return renderGameView('brick');
}
