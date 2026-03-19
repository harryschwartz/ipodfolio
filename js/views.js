// View Renderers — each node type gets its own render function
// Returns DOM element for the screen content area

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
    
    // Preview image for first item
    const previewImg = document.createElement('img');
    previewImg.className = 'split-preview-image';
    previewImg.src = children[0]?.metadata?.previewImage || children[0]?.metadata?.coverImage || 'img/projects-preview.jpg';
    previewImg.alt = 'Preview';
    right.appendChild(previewImg);
    
    container.appendChild(left);
    container.appendChild(right);
    container._listEl = left;
    container._previewImg = previewImg;
    container._previewContainer = right;
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
    
    // Image if available
    if (item.metadata?.coverImage || item.metadata?.thumbnailUrl) {
      const img = document.createElement('img');
      img.className = 'list-item-image';
      img.src = item.metadata.coverImage || item.metadata.thumbnailUrl;
      img.alt = item.title;
      el.appendChild(img);
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

// ---- Album View ----
function renderAlbumView(node, children) {
  const container = document.createElement('div');
  container.className = 'album-view';
  
  const header = document.createElement('div');
  header.className = 'album-header';
  
  if (node.metadata?.coverImage) {
    const img = document.createElement('img');
    img.className = 'album-cover-small';
    img.src = node.metadata.coverImage;
    img.alt = node.title;
    header.appendChild(img);
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
  `;
  meta.appendChild(info);
  container.appendChild(meta);
  
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
  
  // Layer 2: Volume
  const volumeLayer = document.createElement('div');
  volumeLayer.className = 'controls-layer hidden-left';
  volumeLayer.id = 'np-volume-layer';
  volumeLayer.innerHTML = `
    ${VOLUME_MUTE_SVG}
    <div class="progress-bar-container" style="margin: 0 8px;">
      <div class="progress-bar-track">
        <div class="progress-bar-fill" id="np-volume-fill" style="width:70%"></div>
      </div>
    </div>
    ${VOLUME_FULL_SVG}
  `;
  
  // Layer 3: Scrubber
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
  controls.appendChild(volumeLayer);
  controls.appendChild(scrubberLayer);
  container.appendChild(controls);
  
  return container;
}

// ---- Photo Album Grid ----
function renderPhotoGrid(node) {
  const container = document.createElement('div');
  container.className = 'photo-grid';
  
  const photos = node.metadata?.photos || [];
  photos.forEach((photo, i) => {
    const img = document.createElement('img');
    img.className = 'photo-thumb' + (i === 0 ? ' active' : '');
    img.src = photo.url;
    img.alt = photo.caption || 'Photo';
    img.dataset.index = i;
    container.appendChild(img);
  });
  
  return container;
}

// ---- Photo Fullscreen ----
function renderPhotoFullscreen(photo) {
  const container = document.createElement('div');
  container.className = 'photo-fullscreen';
  
  const img = document.createElement('img');
  img.src = photo.url;
  img.alt = photo.caption || 'Photo';
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
  
  const p = document.createElement('p');
  p.textContent = node.metadata?.bodyText || '';
  container.appendChild(p);
  
  if (node.metadata?.links?.length) {
    const links = document.createElement('div');
    links.className = 'text-view-links';
    node.metadata.links.forEach(link => {
      const a = document.createElement('a');
      a.href = link.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = link.label + ' →';
      links.appendChild(a);
    });
    container.appendChild(links);
  }
  
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
function renderSettingsView(currentTheme) {
  const container = document.createElement('div');
  container.className = 'settings-view';
  
  const themes = [
    { id: 'silver', title: 'Silver' },
    { id: 'black', title: 'Black' },
    { id: 'u2', title: 'U2' },
    { id: 'pink', title: 'Pink' },
  ];
  
  const sectionHeader = document.createElement('div');
  sectionHeader.className = 'settings-section-header';
  sectionHeader.textContent = 'Theme';
  container.appendChild(sectionHeader);
  
  themes.forEach((theme, i) => {
    const el = document.createElement('div');
    el.className = 'list-item' + (i === 0 ? ' active' : '');
    el.dataset.index = i;
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
  });
  
  return container;
}

// ---- Playlist View ----
function renderPlaylistView(node, songs) {
  const container = document.createElement('div');
  container.className = 'playlist-view';
  
  const header = document.createElement('div');
  header.className = 'playlist-header';
  
  if (node.metadata?.coverImage) {
    const img = document.createElement('img');
    img.className = 'playlist-cover';
    img.src = node.metadata.coverImage;
    img.alt = node.title;
    header.appendChild(img);
  }
  
  const info = document.createElement('div');
  info.className = 'playlist-header-info';
  info.innerHTML = `
    <div class="playlist-header-title">${node.title}</div>
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

// ---- Brick Game View ----
function renderBrickGameView() {
  const container = document.createElement('div');
  container.className = 'brick-game-container';
  container.style.position = 'relative';
  
  const canvas = document.createElement('canvas');
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
