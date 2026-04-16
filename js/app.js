// Harry's iPortfolio — Main Application Controller
// Manages navigation stack, view rendering, and event routing

class IPodApp {
  constructor() {
    // DOM refs
    this.screenContent = document.getElementById('screen-content');
    this.headerTitle = document.getElementById('header-title');
    this.headerPlayIcon = document.getElementById('header-play-icon');
    this.headerPauseIcon = document.getElementById('header-pause-icon');
    
    // State
    this.navStack = []; // Stack of { nodeId, scrollIndex, type }
    this.currentView = null; // Current DOM element
    this.scrollIndex = 0;
    this.currentItems = []; // Items in current list
    this.currentNode = null;
    this.theme = window._ipodTheme || 'pink';
    
    // Active sub-controllers
    this.activeCoverFlow = null;
    this.activeBrickGame = null;
    this.activeNowPlaying = false;
    this.nowPlayingControlState = 0; // 0=progress, 1=volume, 2=scrubber
    this.scrubPercent = 0;
    
    // Photo state
    this.photoFullscreen = false;
    this.photoIndex = 0;
    this.photoNode = null;
    
    // Apply theme
    this.applyTheme(this.theme);
    
    // Audio player callbacks
    audioPlayer.onUpdate = () => this.updateNowPlayingUI();
    
    // Bind events
    this.bindEvents();
    
    // Desktop: boot screen (with tutorial callouts) FIRST, then QR screen, then home.
    // Mobile: boot screen FIRST, then home (no QR).
    this.desktopQRActive = false;
    this.bootScreenActive = false;
    console.log('[IPodApp] Init — ipodQROverlay available:', !!window.ipodQROverlay);
    this.showBootScreen();
  }

  showDesktopQR() {
    this.desktopQRActive = true;
    this.setHeaderTitle("Harry's iPodfolio");
    const view = window.ipodQROverlay.renderView();
    this.transitionTo(view, 'none');
  }

  dismissDesktopQR() {
    this.desktopQRActive = false;
    window.ipodQROverlay.dismiss();
    // After QR, go straight to home (boot screen was already shown first)
    this.showHome();
  }

  showBootScreen() {
    if (!window.ipodTutorialOverlay || !window.ipodTutorialOverlay.shouldShow()) {
      this.showHome();
      return;
    }
    this.bootScreenActive = true;
    this.setHeaderTitle("Harry's iPortfolio");
    // Render the boot screen inside the iPod display
    const bootView = window.ipodTutorialOverlay.renderBootView();
    this.transitionTo(bootView, 'none');
    // Show floating callout labels around the clickwheel
    window.ipodTutorialOverlay.showCallouts();
  }

  dismissBootScreen() {
    this.bootScreenActive = false;
    if (window.ipodTutorialOverlay) {
      window.ipodTutorialOverlay.dismiss();
    }
    // Desktop: show QR screen next. Mobile: go straight to home.
    if (window.ipodQROverlay && window.ipodQROverlay.shouldShow()) {
      this.showDesktopQR();
    } else {
      this.showHome();
    }
  }

  applyTheme(themeId) {
    this.theme = themeId;
    document.querySelector('.ipod-shell').setAttribute('data-theme', themeId);
    window._ipodTheme = themeId;
  }

  bindEvents() {
    window.addEventListener('forwardscroll', () => this.onScroll('forward'));
    window.addEventListener('backwardscroll', () => this.onScroll('backward'));
    window.addEventListener('centerclick', () => this.onCenterClick());
    window.addEventListener('menuclick', () => this.onMenuClick());
    window.addEventListener('playpauseclick', () => this.onPlayPause());
    window.addEventListener('forwardclick', () => this.onForward());
    window.addEventListener('backclick', () => this.onBack());
  }

  // ---- Navigation ----
  showHome() {
    this.currentNode = null;
    this.currentItems = getRootNodes();
    this.scrollIndex = 0;
    this.setHeaderTitle("Harry's iPortfolio");
    
    const view = renderFolderView(null, this.currentItems, true);
    this.transitionTo(view, 'none');
    startKenBurns(view);
  }

  navigateTo(node, direction) {
    // Save current state to stack
    if (this.currentView) {
      this.navStack.push({
        nodeId: this.currentNode ? this.currentNode.id : null,
        scrollIndex: this.scrollIndex,
        type: this.currentNode ? this.currentNode.type : 'home',
      });
    }
    
    this.currentNode = node;
    this.scrollIndex = 0;
    
    this.renderNode(node, direction || 'right');
  }

  navigateBack() {
    // Clean up active sub-controllers
    this.cleanupSubControllers();
    
    if (this.activeNowPlaying) {
      this.activeNowPlaying = false;
      this.nowPlayingControlState = 0;
      // Go back to previous view
      if (this.navStack.length > 0) {
        const prev = this.navStack.pop();
        if (prev.nodeId === null) {
          this.showHome();
        } else {
          const node = getNode(prev.nodeId);
          this.currentNode = node;
          this.scrollIndex = prev.scrollIndex;
          this.renderNode(node, 'left', prev.scrollIndex);
        }
      } else {
        this.showHome();
      }
      return;
    }
    
    if (this.photoFullscreen) {
      this.photoFullscreen = false;
      this.renderNode(this.photoNode, 'left');
      return;
    }
    
    if (this.navStack.length > 0) {
      const prev = this.navStack.pop();
      if (prev.nodeId === null) {
        this.currentNode = null;
        this.currentItems = getRootNodes();
        this.scrollIndex = prev.scrollIndex;
        this.setHeaderTitle("Harry's iPortfolio");
        const view = renderFolderView(null, this.currentItems, true);
        this.transitionTo(view, 'left');
        startKenBurns(view);
        this.updateListSelection();
      } else {
        const node = getNode(prev.nodeId);
        this.currentNode = node;
        this.scrollIndex = prev.scrollIndex;
        this.renderNode(node, 'left', prev.scrollIndex);
      }
    }
  }

  renderNode(node, direction, restoreIndex) {
    const children = getChildren(node.id);
    this.currentItems = children;
    
    if (restoreIndex !== undefined) {
      this.scrollIndex = restoreIndex;
    }
    
    switch (node.type) {
      case 'folder': {
        const isTopLevel = node.metadata?.splitScreen ?? (node.parentId === null);
        this.setHeaderTitle(node.title);
        const view = renderFolderView(node, children, isTopLevel);
        this.transitionTo(view, direction);
        if (isTopLevel) startKenBurns(view);
        if (restoreIndex !== undefined) this.updateListSelection();
        break;
      }
      case 'album': {
        this.setHeaderTitle(node.title);
        const view = renderAlbumView(node, children);
        this.transitionTo(view, direction);
        if (restoreIndex !== undefined) this.updateListSelection();
        break;
      }
      case 'playlist': {
        const songIds = node.metadata?.songIds || [];
        const songs = songIds.map(id => getNode(id)).filter(Boolean);
        // Include all direct children (songs, links, albums, etc.)
        const allSongs = songs.length > 0 ? songs : children;
        this.currentItems = allSongs;
        this.setHeaderTitle(node.title);
        const view = renderPlaylistView(node, allSongs);
        this.transitionTo(view, direction);
        if (restoreIndex !== undefined) this.updateListSelection();
        break;
      }
      case 'photo_album': {
        this.photoNode = node;
        this.photoIndex = 0;
        this.setHeaderTitle(node.title);
        const view = renderPhotoGrid(node);
        this.currentItems = node.metadata?.photos || [];
        this.transitionTo(view, direction);
        break;
      }
      case 'text': {
        this.setHeaderTitle(node.title);
        const view = renderTextView(node);
        this.transitionTo(view, direction);
        break;
      }
      case 'video': {
        this.setHeaderTitle(node.title);
        const view = renderVideoView(node);
        this.transitionTo(view, direction);
        break;
      }
      case 'settings': {
        this.setHeaderTitle('Settings');
        const hapticsOn = window.ipodClickWheel ? window.ipodClickWheel.hapticsEnabled : true;
        this.currentItems = [
          { id: 'theme-silver', title: 'Silver', type: '_theme', metadata: { themeId: 'silver' } },
          { id: 'theme-black', title: 'Black', type: '_theme', metadata: { themeId: 'black' } },
          { id: 'theme-u2', title: 'U2', type: '_theme', metadata: { themeId: 'u2' } },
          { id: 'theme-pink', title: 'Pink', type: '_theme', metadata: { themeId: 'pink' } },
          { id: 'haptics-toggle', title: 'Haptics: ' + (hapticsOn ? 'On' : 'Off'), type: '_haptics' },
        ];
        const view = renderSettingsView(this.theme, hapticsOn);
        this.transitionTo(view, direction);
        break;
      }
      case 'game': {
        this.setHeaderTitle(node.title);
        const view = renderBrickGameView();
        this.transitionTo(view, direction);
        // Initialize brick game after DOM is ready
        requestAnimationFrame(() => {
          const canvas = document.getElementById('brickBreakerCanvas');
          const hud = this.screenContent.querySelector('.game-hud');
          const hudRight = this.screenContent.querySelector('.game-hud-right');
          if (canvas) {
            this.activeBrickGame = new BrickGame();
            this.activeBrickGame.init(canvas, hud, hudRight);
          }
        });
        break;
      }
      case 'cover_flow_home': {
        this.showCoverFlow('home');
        return;
      }
      case 'cover_flow_music': {
        this.showCoverFlow('music');
        return;
      }
      case 'link': {
        if (node.metadata?.url) {
          window.open(node.metadata.url, '_blank', 'noopener,noreferrer');
        }
        // Don't navigate, stay on current view
        // Pop the nav entry we just pushed
        if (this.navStack.length > 0) this.navStack.pop();
        return;
      }
      case 'song': {
        // Play the song and show Now Playing
        this.playSong(node);
        return;
      }
      default: {
        this.setHeaderTitle(node.title);
        const view = document.createElement('div');
        view.className = 'empty-state';
        view.textContent = 'Nothing to see here';
        this.transitionTo(view, direction);
      }
    }
  }

  showCoverFlow(type) {
    this.setHeaderTitle('Cover Flow');
    
    let albums;
    if (type === 'home') {
      // Get children of the projects folder (top-level folder with splitScreen: false)
      const projectsFolder = PORTFOLIO_DATA.find(n => n.type === 'folder' && n.parentId === null && n.metadata?.splitScreen === false);
      albums = projectsFolder ? getChildren(projectsFolder.id) : [];
    } else {
      // Music albums
      albums = PORTFOLIO_DATA.filter(n => n.type === 'album');
    }
    // Exclude cover_flow nodes from the carousel (they're navigation nodes, not content)
    albums = albums.filter(n => !n.type.startsWith('cover_flow'));
    
    if (albums.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No albums available';
      this.transitionTo(empty, 'right');
      return;
    }
    
    const container = document.createElement('div');
    container.style.height = '100%';
    this.transitionTo(container, 'right');
    
    // Initialize CoverFlow after DOM ready
    requestAnimationFrame(() => {
      this.activeCoverFlow = new CoverFlow(container, albums, (playedSong, navigateToNode) => {
        this.activeCoverFlow = null;
        if (playedSong) {
          this.showNowPlaying();
        } else if (navigateToNode) {
          this.navigateTo(navigateToNode, 'right');
        } else {
          this.navigateBack();
        }
      });
    });
  }

  playSong(node) {
    // Find siblings (songs in same parent)
    const parent = getParent(node);
    let songs = [];
    if (parent) {
      songs = getChildren(parent.id).filter(c => c.type === 'song');
    } else {
      songs = [node];
    }
    const idx = songs.findIndex(s => s.id === node.id);
    
    audioPlayer.play(node, songs, idx >= 0 ? idx : 0);
    this.showNowPlaying();
  }

  showNowPlaying() {
    this.activeNowPlaying = true;
    this.nowPlayingControlState = 0;
    this.setHeaderTitle('Now Playing');
    
    const view = renderNowPlayingView();
    this.transitionTo(view, 'right');
    this.updateNowPlayingUI();
  }

  // ---- View Transitions ----
  transitionTo(newView, direction) {
    this.cleanupSubControllers();
    
    const wrapper = document.createElement('div');
    wrapper.className = 'view-container';
    wrapper.appendChild(newView);
    
    if (direction === 'none' || !this.currentView) {
      this.screenContent.innerHTML = '';
      this.screenContent.appendChild(wrapper);
    } else {
      const oldWrapper = this.currentView.parentElement;
      
      if (direction === 'right') {
        wrapper.classList.add('view-enter-right');
        if (oldWrapper) oldWrapper.classList.add('view-exit-left');
      } else {
        wrapper.classList.add('view-enter-left');
        if (oldWrapper) oldWrapper.classList.add('view-exit-right');
      }
      
      this.screenContent.appendChild(wrapper);
      
      // Remove old view after animation
      setTimeout(() => {
        if (oldWrapper && oldWrapper.parentElement) {
          oldWrapper.remove();
        }
      }, 300);
    }
    
    this.currentView = newView;
  }

  cleanupSubControllers() {
    if (this.activeCoverFlow) {
      this.activeCoverFlow.cleanup();
      this.activeCoverFlow = null;
    }
    if (this.activeBrickGame) {
      this.activeBrickGame.cleanup();
      this.activeBrickGame = null;
    }
    stopKenBurns(this.currentView);
  }

  // ---- Header ----
  setHeaderTitle(title) {
    this.headerTitle.textContent = title;
    this.updateHeaderIcons();
  }

  updateHeaderIcons() {
    if (audioPlayer.isPlaying && !audioPlayer.isPaused) {
      this.headerPlayIcon.style.display = '';
      this.headerPauseIcon.style.display = 'none';
    } else if (audioPlayer.isPaused) {
      this.headerPlayIcon.style.display = 'none';
      this.headerPauseIcon.style.display = '';
    } else {
      this.headerPlayIcon.style.display = 'none';
      this.headerPauseIcon.style.display = 'none';
    }
  }

  // ---- Scroll ----
  onScroll(direction) {
    if (this.desktopQRActive || this.bootScreenActive) return; // QR/boot screen ignores scroll
    if (this.activeCoverFlow || this.activeBrickGame) return; // Handled by sub-controller via its own listeners

    if (this.activeNowPlaying) {
      this.handleNowPlayingScroll(direction);
      return;
    }

    if (this.photoFullscreen) {
      this.handlePhotoFullscreenScroll(direction);
      return;
    }

    // For photo grid
    if (this.currentNode?.type === 'photo_album' && !this.photoFullscreen) {
      const photos = this.currentNode.metadata?.photos || [];
      if (direction === 'forward' && this.photoIndex < photos.length - 1) {
        this.photoIndex++;
      } else if (direction === 'backward' && this.photoIndex > 0) {
        this.photoIndex--;
      }
      this.updatePhotoGridSelection();
      return;
    }

    // Text view: scroll body + link rows (wheel does not move list highlight)
    if (this.currentNode?.type === 'text') {
      const scrollEl = this.currentView?._scrollEl;
      if (!scrollEl) return;
      const step = 28;
      const max = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
      if (direction === 'forward') {
        scrollEl.scrollTop = Math.min(max, scrollEl.scrollTop + step);
      } else {
        scrollEl.scrollTop = Math.max(0, scrollEl.scrollTop - step);
      }
      return;
    }

    if (this.currentItems.length === 0) return;

    if (direction === 'forward' && this.scrollIndex < this.currentItems.length - 1) {
      this.scrollIndex++;
    } else if (direction === 'backward' && this.scrollIndex > 0) {
      this.scrollIndex--;
    }

    this.updateListSelection();
  }

  updateListSelection() {
    const listContainer = this.currentView?._listEl || this.currentView;
    if (!listContainer) return;
    
    const items = listContainer.querySelectorAll('.list-item');
    items.forEach((el, i) => {
      el.classList.toggle('active', i === this.scrollIndex);
    });

    // Scroll active item into view within its scroll container
    const activeItem = items[this.scrollIndex];
    if (activeItem) {
      const scrollContainer = this.currentView?._listEl;
      if (scrollContainer && scrollContainer.scrollHeight > scrollContainer.clientHeight) {
        const itemTop = activeItem.offsetTop - scrollContainer.offsetTop;
        const itemBottom = itemTop + activeItem.offsetHeight;
        const viewTop = scrollContainer.scrollTop;
        const viewBottom = viewTop + scrollContainer.clientHeight;
        if (itemBottom > viewBottom) {
          scrollContainer.scrollTop = itemBottom - scrollContainer.clientHeight;
        } else if (itemTop < viewTop) {
          scrollContainer.scrollTop = itemTop;
        }
      } else {
        activeItem.scrollIntoView({ block: 'nearest' });
      }
    }

    // Swap Ken Burns pool when scrolling the home split-screen
    if (this.currentView?._kenBurns?.urlsPerItem) {
      swapKenBurnsPool(this.currentView, this.scrollIndex);
    }
  }

  updatePhotoGridSelection() {
    const thumbs = this.currentView?.querySelectorAll('.photo-thumb');
    if (!thumbs) return;
    thumbs.forEach((el, i) => {
      el.classList.toggle('active', i === this.photoIndex);
    });
    if (thumbs[this.photoIndex]) {
      thumbs[this.photoIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  // ---- Center Click ----
  onCenterClick() {
    if (this.desktopQRActive) {
      this.dismissDesktopQR();
      return;
    }
    if (this.bootScreenActive) {
      this.dismissBootScreen();
      return;
    }
    if (this.activeCoverFlow || this.activeBrickGame) return;

    if (this.activeNowPlaying) {
      this.cycleNowPlayingControl();
      return;
    }

    if (this.photoFullscreen) return;

    // Photo grid -> fullscreen
    if (this.currentNode?.type === 'photo_album' && !this.photoFullscreen) {
      const photos = this.currentNode.metadata?.photos || [];
      if (photos[this.photoIndex]) {
        this.photoFullscreen = true;
        const view = renderPhotoFullscreen(photos[this.photoIndex]);
        this.navStack.push({
          nodeId: this.currentNode.id,
          scrollIndex: this.photoIndex,
          type: 'photo_album',
        });
        this.transitionTo(view, 'right');
      }
      return;
    }

    // Settings theme/haptics selection
    if (this.currentNode?.type === 'settings') {
      const themes = ['silver', 'black', 'u2', 'pink'];
      if (this.scrollIndex < themes.length && themes[this.scrollIndex]) {
        this.applyTheme(themes[this.scrollIndex]);
      } else if (this.scrollIndex === themes.length) {
        // Toggle haptics
        if (window.ipodClickWheel) {
          window.ipodClickWheel.hapticsEnabled = !window.ipodClickWheel.hapticsEnabled;
        }
      }
      // Re-render settings
      const hapticsOn = window.ipodClickWheel ? window.ipodClickWheel.hapticsEnabled : true;
      this.currentItems = [
        { id: 'theme-silver', title: 'Silver', type: '_theme', metadata: { themeId: 'silver' } },
        { id: 'theme-black', title: 'Black', type: '_theme', metadata: { themeId: 'black' } },
        { id: 'theme-u2', title: 'U2', type: '_theme', metadata: { themeId: 'u2' } },
        { id: 'theme-pink', title: 'Pink', type: '_theme', metadata: { themeId: 'pink' } },
        { id: 'haptics-toggle', title: 'Haptics: ' + (hapticsOn ? 'On' : 'Off'), type: '_haptics' },
      ];
      const view = renderSettingsView(this.theme, hapticsOn);
      this.transitionTo(view, 'none');
      const savedIndex = this.scrollIndex;
      this.scrollIndex = savedIndex;
      this.updateListSelection();
      return;
    }

    // Text view or video - no action on center click
    if (this.currentNode?.type === 'text') return;
    if (this.currentNode?.type === 'video') return;

    // Select current item
    const item = this.currentItems[this.scrollIndex];
    if (!item) return;

    // Songs: play and show Now Playing
    if (item.type === 'song') {
      this.navStack.push({
        nodeId: this.currentNode ? this.currentNode.id : null,
        scrollIndex: this.scrollIndex,
        type: this.currentNode ? this.currentNode.type : 'home',
      });
      this.playSong(item);
      return;
    }

    // Links: open in new tab
    if (item.type === 'link') {
      if (item.metadata?.url) {
        let url = item.metadata.url;
        if (!/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(url)) url = 'https://' + url;
        // Non-http schemes (sms:, mailto:, tel:) must use location.href, not window.open
        if (/^https?:/i.test(url)) {
          window.open(url, '_blank', 'noopener,noreferrer');
        } else {
          window.location.href = url;
        }
      }
      return;
    }

    // Navigate to the item
    this.navigateTo(item, 'right');
  }

  // ---- Menu Click ----
  onMenuClick() {
    if (this.desktopQRActive) {
      this.dismissDesktopQR();
      return;
    }
    if (this.bootScreenActive) {
      this.dismissBootScreen();
      return;
    }
    if (this.activeCoverFlow) return; // CoverFlow handles its own menu
    if (this.activeBrickGame) {
      // Clean up game and go back
      this.activeBrickGame.cleanup();
      this.activeBrickGame = null;
      this.navigateBack();
      return;
    }
    this.navigateBack();
  }

  // ---- Play/Pause ----
  onPlayPause() {
    if (this.activeBrickGame) return;
    
    if (audioPlayer.isPlaying || audioPlayer.isPaused) {
      audioPlayer.togglePlayPause();
      this.updateHeaderIcons();
    }
  }

  // ---- Forward/Back Skip ----
  onForward() {
    if (this.activeBrickGame) return;
    if (this.photoFullscreen) {
      this.handlePhotoFullscreenScroll('forward');
      return;
    }
    if (audioPlayer.isPlaying) {
      audioPlayer.next();
    }
  }

  onBack() {
    if (this.activeBrickGame) return;
    if (this.photoFullscreen) {
      this.handlePhotoFullscreenScroll('backward');
      return;
    }
    if (audioPlayer.isPlaying) {
      if (audioPlayer.getCurrentTime() > 3) {
        audioPlayer.seek(0);
      } else {
        audioPlayer.prev();
      }
    }
  }

  // ---- Now Playing Controls ----
  handleNowPlayingScroll(direction) {
    if (this.nowPlayingControlState === 1) {
      // Volume
      if (direction === 'forward') audioPlayer.increaseVolume();
      else audioPlayer.decreaseVolume();
      this.updateNowPlayingUI();
    } else if (this.nowPlayingControlState === 2) {
      // Scrubber
      if (direction === 'forward') this.scrubPercent = Math.min(100, this.scrubPercent + 2);
      else this.scrubPercent = Math.max(0, this.scrubPercent - 2);
      audioPlayer.seek(this.scrubPercent);
      this.updateNowPlayingUI();
    }
  }

  cycleNowPlayingControl() {
    this.nowPlayingControlState = (this.nowPlayingControlState + 1) % 3;
    
    if (this.nowPlayingControlState === 2) {
      this.scrubPercent = audioPlayer.getPercent();
    }
    
    const progress = document.getElementById('np-progress-layer');
    const volume = document.getElementById('np-volume-layer');
    const scrubber = document.getElementById('np-scrubber-layer');
    
    if (!progress || !volume || !scrubber) return;
    
    // Reset classes
    progress.className = 'controls-layer';
    volume.className = 'controls-layer';
    scrubber.className = 'controls-layer';
    
    switch (this.nowPlayingControlState) {
      case 0: // Progress visible
        volume.classList.add('hidden-left');
        scrubber.classList.add('hidden-right');
        break;
      case 1: // Volume visible
        progress.classList.add('hidden-left');
        scrubber.classList.add('hidden-right');
        break;
      case 2: // Scrubber visible
        progress.classList.add('hidden-left');
        volume.classList.add('hidden-left');
        break;
    }
  }

  updateNowPlayingUI() {
    if (!this.activeNowPlaying) {
      this.updateHeaderIcons();
      return;
    }
    
    this.updateHeaderIcons();
    
    const track = audioPlayer.currentTrack;
    if (!track) return;
    
    // Artwork
    const artwork = this.currentView?.querySelector('.now-playing-artwork');
    if (artwork) {
      const parent = getParent(track);
      const meta = parent?.metadata?.coverEmoji ? parent.metadata
                 : track.metadata?.coverEmoji ? track.metadata
                 : null;
      if (meta?.coverEmoji) {
        artwork.style.backgroundColor = meta.coverColor || '#6366f1';
        artwork.style.display = 'flex';
        artwork.style.alignItems = 'center';
        artwork.style.justifyContent = 'center';
        artwork.style.fontSize = '2rem';
        artwork.textContent = meta.coverEmoji;
        artwork.src = '';
      } else {
        artwork.textContent = '';
        artwork.style = '';
        const coverMeta = parent?.metadata?.coverImage ? parent.metadata : track.metadata;
        artwork.src = coverMeta?.coverImage || 'img/headphones-cover.jpg';
        artwork.style.objectFit = 'cover';
        artwork.style.objectPosition = coverMeta?.coverImagePosition || '50% 50%';
        if (coverMeta?.coverImageZoom && parseFloat(coverMeta.coverImageZoom) !== 1) {
          artwork.style.transform = `scale(${coverMeta.coverImageZoom})`;
          artwork.style.transformOrigin = coverMeta.coverImagePosition || '50% 50%';
        }
      }
    }
    
    // Info
    const title = this.currentView?.querySelector('.now-playing-title');
    const subtitles = this.currentView?.querySelectorAll('.now-playing-subtitle');
    const captionEl = this.currentView?.querySelector('.now-playing-caption');
    if (title) title.textContent = track.title || '--';

    const hasTranscription = track.metadata?.transcription?.segments?.length > 0;

    if (hasTranscription) {
      // Hide artist/album subtitles, show caption
      if (subtitles) subtitles.forEach(s => s.style.display = 'none');
      if (captionEl) {
        captionEl.style.display = '';
        const transcription = track.metadata.transcription;
        const segments = transcription.segments;
        const words = transcription.words;
        const currentTime = audioPlayer.getCurrentTime();

        let newText = '';

        if (words && words.length > 0) {
          // Build chunks of ~6 words from the words array
          if (!transcription._chunks) {
            const CHUNK_SIZE = 6;
            const chunks = [];
            for (let i = 0; i < words.length; i += CHUNK_SIZE) {
              const group = words.slice(i, i + CHUNK_SIZE);
              chunks.push({
                start: group[0].start,
                end: group[group.length - 1].end,
                text: group.map(w => w.word).join(' ')
              });
            }
            transcription._chunks = chunks;
          }
          // Find the active chunk
          const chunks = transcription._chunks;
          for (let i = 0; i < chunks.length; i++) {
            if (currentTime >= chunks[i].start && currentTime < chunks[i].end) {
              newText = chunks[i].text.trim();
              break;
            }
          }
        } else {
          // Fallback: no words array, use segments truncated
          for (let i = 0; i < segments.length; i++) {
            if (currentTime >= segments[i].start && currentTime < segments[i].end) {
              newText = segments[i].text.trim();
              break;
            }
          }
        }

        if (captionEl.dataset.currentText !== newText) {
          captionEl.classList.remove('caption-fade-in');
          void captionEl.offsetWidth;
          captionEl.textContent = newText;
          captionEl.dataset.currentText = newText;
          captionEl.classList.add('caption-fade-in');
        }
      }
    } else {
      // No transcription — show artist/album as normal
      if (subtitles) subtitles.forEach(s => s.style.display = '');
      if (subtitles && subtitles[0]) subtitles[0].textContent = track.metadata?.artistName || '--';
      if (subtitles && subtitles[1]) subtitles[1].textContent = track.metadata?.albumName || '--';
      if (captionEl) captionEl.style.display = 'none';
    }
    
    // Progress
    const currentTime = document.getElementById('np-current-time');
    const remaining = document.getElementById('np-remaining-time');
    const fill = document.getElementById('np-progress-fill');
    
    if (currentTime) currentTime.textContent = formatTime(audioPlayer.getCurrentTime());
    if (remaining) remaining.textContent = '-' + formatTime(audioPlayer.getTimeRemaining());
    if (fill) fill.style.width = audioPlayer.getPercent() + '%';
    
    // Volume
    const volFill = document.getElementById('np-volume-fill');
    if (volFill) volFill.style.width = (audioPlayer.volume * 100) + '%';
    
    // Scrubber
    const scrubFill = document.getElementById('np-scrub-fill');
    const scrubTime = document.getElementById('np-scrub-time');
    const scrubRemaining = document.getElementById('np-scrub-remaining');
    if (this.nowPlayingControlState === 2) {
      if (scrubFill) scrubFill.style.width = this.scrubPercent + '%';
      const dur = audioPlayer.getDuration();
      const curScrub = (this.scrubPercent / 100) * dur;
      if (scrubTime) scrubTime.textContent = formatTime(curScrub);
      if (scrubRemaining) scrubRemaining.textContent = '-' + formatTime(dur - curScrub);
    }
  }

  handlePhotoFullscreenScroll(direction) {
    const photos = this.photoNode?.metadata?.photos || [];
    if (direction === 'forward' && this.photoIndex < photos.length - 1) {
      this.photoIndex++;
    } else if (direction === 'backward' && this.photoIndex > 0) {
      this.photoIndex--;
    }
    const view = renderPhotoFullscreen(photos[this.photoIndex]);
    this.transitionTo(view, direction === 'forward' ? 'right' : 'left');
  }
}

// Initialize app when DOM is ready AND CMS data is loaded
document.addEventListener('DOMContentLoaded', async () => {
  const wheelEl = document.getElementById('clickwheel');
  window.ipodClickWheel = new ClickWheel(wheelEl);
  
  // Wait for CMS data before initializing (has a fast timeout/fallback)
  if (typeof fetchCMSData === 'function') {
    try {
      await Promise.race([
        fetchCMSData(),
        new Promise(resolve => setTimeout(resolve, 3000)) // 3s max wait
      ]);
    } catch (e) {
      console.warn('[iPodfolio] CMS fetch failed, using fallback data');
    }
  }
  
  window.ipodApp = new IPodApp();
});
