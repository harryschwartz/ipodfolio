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
    
    // Long-press tracking for center button
    this._centerPressStart = 0;
    this._centerLongPressTimer = null;
    this._centerLongPressed = false;

    // Music library state
    this.musicViewType = null; // 'menu', 'songs', 'artists', 'artist_songs', 'albums', 'album_tracks', 'playlists', 'playlist_songs'
    this.musicArtists = null;
    this.musicAlbums = null;
    this.musicCurrentArtist = null;
    this.musicCurrentAlbum = null;
    this.musicCurrentPlaylist = null;
    
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

    // Preload images in background during boot animation
    this._preloadImages();
  }

  _preloadImages() {
    // Downscale Supabase-hosted covers/thumbs via the transform endpoint so we
    // don't pull multi-MB originals for tiles rendered at ~140–320 CSS px.
    const toThumb = (url) =>
      typeof transformedImageUrl === 'function'
        ? transformedImageUrl(url, { width: 640, quality: 75 })
        : url;
    const preload = (urls) => {
      for (const url of urls) {
        if (!url || url.startsWith('data:')) continue;
        const img = new Image();
        img.decoding = 'async';
        img.src = toThumb(url);
      }
    };
    // Cover/thumbnail images for navigation tiles — small and worth preloading.
    // Skip full photo-album photo URLs: they can be 100s of multi-MB files the
    // user may never visit. Those are fetched lazily via the photo grid.
    const portfolioUrls = PORTFOLIO_DATA
      .filter(n => n.metadata)
      .flatMap(n => [
        n.metadata.coverImage,
        n.metadata.coverImageUrl,
        n.metadata.thumbnailUrl,
      ])
      .filter(Boolean);
    preload(portfolioUrls);

    // Music library images — preload once library data arrives
    if (typeof fetchMusicLibrary === 'function') {
      fetchMusicLibrary().then(() => {
        const musicUrls = (getMusicSongs?.() || []).map(s => s.metadata?.coverImage).filter(Boolean);
        // Deduplicate
        preload([...new Set(musicUrls)]);
      }).catch(() => {});
    }
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
    // Keep tutorial callouts visible — they'll be dismissed when
    // the user uses the actual wheel/buttons (handled by touchscreen.js)
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

  _buildSettingsItems() {
    const hapticsOn = window.ipodClickWheel ? window.ipodClickWheel.hapticsEnabled : true;
    this.currentItems = [
      { id: 'shuffle-toggle', title: 'Shuffle', type: '_shuffle' },
      { id: 'repeat-toggle', title: 'Repeat', type: '_repeat' },
      { id: 'speed-toggle', title: 'Speed', type: '_speed' },
      { id: 'haptics-toggle', title: 'Haptics', type: '_haptics' },
      { id: 'theme-silver', title: 'Silver', type: '_theme', metadata: { themeId: 'silver' } },
      { id: 'theme-black', title: 'Black', type: '_theme', metadata: { themeId: 'black' } },
      { id: 'theme-u2', title: 'U2', type: '_theme', metadata: { themeId: 'u2' } },
      { id: 'theme-pink', title: 'Pink', type: '_theme', metadata: { themeId: 'pink' } },
    ];
  }

  _rerenderSettings() {
    this._buildSettingsItems();
    const hapticsOn = window.ipodClickWheel ? window.ipodClickWheel.hapticsEnabled : true;
    const view = renderSettingsView(this.theme, hapticsOn);
    const savedIndex = this.scrollIndex;
    this.transitionTo(view, 'none');
    this.scrollIndex = savedIndex;
    this.updateListSelection();
  }

  bindEvents() {
    window.addEventListener('forwardscroll', () => this.onScroll('forward'));
    window.addEventListener('backwardscroll', () => this.onScroll('backward'));
    window.addEventListener('centerclick', () => this.onCenterClick());
    window.addEventListener('menuclick', () => this.onMenuClick());
    window.addEventListener('playpauseclick', () => this.onPlayPause());
    window.addEventListener('forwardclick', () => this.onForward());
    window.addEventListener('backclick', () => this.onBack());
    // Long-press detection for center button
    window.addEventListener('centerpressstart', () => this._onCenterPressStart());
    window.addEventListener('centerpressend', () => this._onCenterPressEnd());
  }

  // ---- Navigation ----
  // Build the home item list with optional Now Playing injection
  _getHomeItems() {
    const items = getRootNodes();
    if (audioPlayer.isPlaying || audioPlayer.isPaused) {
      return [
        { id: '_now_playing', title: 'Now Playing', type: '_now_playing' },
        ...items
      ];
    }
    return items;
  }

  showHome() {
    this.currentNode = null;
    this.currentItems = this._getHomeItems();
    this.scrollIndex = 0;
    this.musicViewType = null;
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
        this._restoreMusicState(prev);
        if (prev.musicViewType) {
          this._restoreMusicView(prev, 'left');
          return;
        }
        if (prev.nodeId === null) {
          this.showHome();
        } else {
          const node = getNode(prev.nodeId);
          this.currentNode = node;
          this.scrollIndex = prev.scrollIndex;
          this.renderNode(node, 'left', prev.scrollIndex);
        }
      } else {
        this.musicViewType = null;
        this.showHome();
      }
      return;
    }

    if (this.photoFullscreen) {
      this.photoFullscreen = false;
      this.photoNode = null;
      // Pop the photo grid entry, then pop again to reach the parent folder
      if (this.navStack.length > 0) this.navStack.pop(); // discard photo_album grid
      if (this.navStack.length > 0) {
        const prev = this.navStack.pop();
        this._restoreMusicState(prev);
        if (prev.nodeId === null) {
          this.currentNode = null;
          this.currentItems = this._getHomeItems();
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
      return;
    }

    if (this.navStack.length > 0) {
      const prev = this.navStack.pop();
      this._restoreMusicState(prev);
      if (prev.musicViewType) {
        this._restoreMusicView(prev, 'left');
        return;
      }
      // Leaving music views entirely
      this.musicViewType = null;
      if (prev.nodeId === null) {
        this.currentNode = null;
        this.currentItems = this._getHomeItems();
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

  _restoreMusicState(prev) {
    if (prev.musicViewType) {
      this.musicArtists = prev.musicArtists;
      this.musicAlbums = prev.musicAlbums;
      this.musicCurrentArtist = prev.musicCurrentArtist;
      this.musicCurrentAlbum = prev.musicCurrentAlbum;
      this.musicCurrentPlaylist = prev.musicCurrentPlaylist;
    }
  }

  _restoreMusicView(prev, direction) {
    this.scrollIndex = prev.scrollIndex;
    const vt = prev.musicViewType;

    if (vt === 'cover_flow') {
      // Re-enter music cover flow
      const musicNode = getNode(MUSIC_FOLDER_ID);
      this.currentNode = musicNode;
      this.showMusicCoverFlow(direction);
      return;
    }
    if (vt === 'menu') {
      // Re-render the Music menu
      const musicNode = getNode(MUSIC_FOLDER_ID);
      this.currentNode = musicNode;
      this.showMusicMenu(direction, prev.scrollIndex);
      return;
    }
    if (vt === 'songs') {
      this.musicViewType = 'songs';
      this.setHeaderTitle('Songs');
      const songs = getMusicSongs();
      const shuffleAction = { id: '_shuffle_songs', title: 'Shuffle Songs', type: '_shuffle_songs' };
      this.currentItems = [shuffleAction, ...songs];
      const view = renderMusicSongsView(songs);
      this.transitionTo(view, direction);
      this.scrollIndex = prev.scrollIndex;
      this.updateListSelection();
      return;
    }
    if (vt === 'artists') {
      this.musicViewType = 'artists';
      this.setHeaderTitle('Artists');
      const { view, items } = renderMusicArtistsView(this.musicArtists);
      this.currentItems = items;
      this.transitionTo(view, direction);
      this.scrollIndex = prev.scrollIndex;
      this.updateListSelection();
      return;
    }
    if (vt === 'artist_songs') {
      this.musicViewType = 'artist_songs';
      const artist = this.musicCurrentArtist;
      this.setHeaderTitle(artist.name);
      const songs = artist.songs.slice().sort((a, b) => a.title.localeCompare(b.title));
      this.currentItems = songs;
      const view = renderMusicArtistSongsView(artist.name, songs);
      this.transitionTo(view, direction);
      this.scrollIndex = prev.scrollIndex;
      this.updateListSelection();
      return;
    }
    if (vt === 'albums') {
      this.musicViewType = 'albums';
      this.setHeaderTitle('Albums');
      const { view, items } = renderMusicAlbumsView(this.musicAlbums);
      this.currentItems = items;
      this.transitionTo(view, direction);
      this.scrollIndex = prev.scrollIndex;
      this.updateListSelection();
      return;
    }
    if (vt === 'album_tracks') {
      this.musicViewType = 'album_tracks';
      const album = this.musicCurrentAlbum;
      this.setHeaderTitle(album.name);
      this.currentItems = album.songs;
      const view = renderMusicAlbumTracksView(album);
      this.transitionTo(view, direction);
      this.scrollIndex = prev.scrollIndex;
      this.updateListSelection();
      return;
    }
    if (vt === 'playlists') {
      this.musicViewType = 'playlists';
      this.setHeaderTitle('Playlists');
      const playlists = getMusicPlaylists();
      this.currentItems = playlists;
      const view = renderMusicPlaylistsView(playlists);
      this.transitionTo(view, direction);
      this.scrollIndex = prev.scrollIndex;
      this.updateListSelection();
      return;
    }
    if (vt === 'playlist_songs') {
      this.musicViewType = 'playlist_songs';
      const playlist = this.musicCurrentPlaylist;
      this.setHeaderTitle(playlist.title);
      fetchPlaylistSongs(playlist.id).then(songs => {
        this.currentItems = songs;
        const view = renderMusicPlaylistSongsView(playlist, songs);
        this.transitionTo(view, direction);
        this.scrollIndex = prev.scrollIndex;
        this.updateListSelection();
      });
      return;
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
        // Intercept Music folder — show computed iPod-style menu
        if (isMusicFolder(node.id)) {
          this.showMusicMenu(direction, restoreIndex);
          return;
        }
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
        this._buildSettingsItems();
        const hapticsOn = window.ipodClickWheel ? window.ipodClickWheel.hapticsEnabled : true;
        const view = renderSettingsView(this.theme, hapticsOn);
        this.transitionTo(view, direction);
        break;
      }
      case 'game': {
        this.setHeaderTitle(node.title);
        const view = renderGameView();
        this.transitionTo(view, direction);
        // Initialize game after DOM is ready
        requestAnimationFrame(() => {
          const canvas = this.screenContent.querySelector('.game-canvas');
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

  // ---- Music Library Navigation ----

  showMusicMenu(direction, restoreIndex) {
    this.setHeaderTitle('Music');
    this.musicViewType = 'menu';
    // Start fetching library data in background
    fetchMusicLibrary();
    const { view, items } = renderMusicMenuView();
    this.currentItems = items;
    this.transitionTo(view, direction);
    if (restoreIndex !== undefined) {
      this.scrollIndex = restoreIndex;
      this.updateListSelection();
    }
  }

  showMusicSongs(direction) {
    this.setHeaderTitle('Songs');
    this.musicViewType = 'songs';
    fetchMusicLibrary().then(lib => {
      const songs = getMusicSongs();
      if (songs.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = 'No songs';
        this.currentItems = [];
        this.transitionTo(empty, direction);
        return;
      }
      const shuffleAction = { id: '_shuffle_songs', title: 'Shuffle Songs', type: '_shuffle_songs' };
      this.currentItems = [shuffleAction, ...songs];
      const view = renderMusicSongsView(songs);
      this.transitionTo(view, direction);
    });
  }

  showMusicArtists(direction) {
    this.setHeaderTitle('Artists');
    this.musicViewType = 'artists';
    fetchMusicLibrary().then(lib => {
      this.musicArtists = getMusicArtists();
      if (this.musicArtists.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = 'No artists';
        this.currentItems = [];
        this.transitionTo(empty, direction);
        return;
      }
      const { view, items } = renderMusicArtistsView(this.musicArtists);
      this.currentItems = items;
      this.transitionTo(view, direction);
    });
  }

  showMusicArtistSongs(artistIndex, direction) {
    const artist = this.musicArtists[artistIndex];
    if (!artist) return;
    this.musicCurrentArtist = artist;
    this.setHeaderTitle(artist.name);
    this.musicViewType = 'artist_songs';
    const songs = artist.songs.slice().sort((a, b) => a.title.localeCompare(b.title));
    this.currentItems = songs;
    const view = renderMusicArtistSongsView(artist.name, songs);
    this.transitionTo(view, direction);
  }

  showMusicAlbums(direction) {
    this.setHeaderTitle('Albums');
    this.musicViewType = 'albums';
    fetchMusicLibrary().then(lib => {
      this.musicAlbums = getMusicAlbums();
      if (this.musicAlbums.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = 'No albums';
        this.currentItems = [];
        this.transitionTo(empty, direction);
        return;
      }
      const { view, items } = renderMusicAlbumsView(this.musicAlbums);
      this.currentItems = items;
      this.transitionTo(view, direction);
    });
  }

  showMusicAlbumTracks(albumIndex, direction) {
    const album = this.musicAlbums[albumIndex];
    if (!album) return;
    this.musicCurrentAlbum = album;
    this.setHeaderTitle(album.name);
    this.musicViewType = 'album_tracks';
    this.currentItems = album.songs;
    const view = renderMusicAlbumTracksView(album);
    this.transitionTo(view, direction);
  }

  showMusicPlaylists(direction) {
    this.setHeaderTitle('Playlists');
    this.musicViewType = 'playlists';
    fetchMusicLibrary().then(lib => {
      const playlists = getMusicPlaylists();
      if (playlists.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = 'No playlists';
        this.currentItems = [];
        this.transitionTo(empty, direction);
        return;
      }
      this.currentItems = playlists;
      const view = renderMusicPlaylistsView(playlists);
      this.transitionTo(view, direction);
    });
  }

  showMusicPlaylistSongs(playlist, direction) {
    this.musicCurrentPlaylist = playlist;
    this.setHeaderTitle(playlist.title);
    this.musicViewType = 'playlist_songs';
    fetchPlaylistSongs(playlist.id).then(songs => {
      if (songs.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = 'No songs in playlist';
        this.currentItems = [];
        this.transitionTo(empty, direction);
        return;
      }
      this.currentItems = songs;
      const view = renderMusicPlaylistSongsView(playlist, songs);
      this.transitionTo(view, direction);
    });
  }

  // Play a song with the correct music library context
  playMusicSong(song, contextSongs) {
    const idx = contextSongs.findIndex(s => s.id === song.id);
    audioPlayer.play(song, contextSongs, idx >= 0 ? idx : 0);
    this.showNowPlaying();
  }

  showMusicCoverFlow(direction) {
    this.setHeaderTitle('Cover Flow');
    this.musicViewType = 'cover_flow';
    fetchMusicLibrary().then(lib => {
      const albums = getMusicAlbums();
      if (albums.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = 'No albums available';
        this.currentItems = [];
        this.transitionTo(empty, direction);
        return;
      }
      // Convert music library albums to the format CoverFlow expects
      const coverFlowAlbums = albums.map((album, i) => ({
        id: '_music_album_cf_' + i,
        title: album.name,
        metadata: {
          coverImage: album.coverImage,
          artistName: album.artistName,
        },
        _musicAlbum: album, // keep reference for track navigation
      }));

      const container = document.createElement('div');
      container.style.height = '100%';
      this.transitionTo(container, direction);

      requestAnimationFrame(() => {
        this.activeCoverFlow = new MusicCoverFlow(container, coverFlowAlbums, this.musicAlbums, (action, data) => {
          this.activeCoverFlow = null;
          if (action === 'play') {
            // data = { song, songs, index }
            audioPlayer.play(data.song, data.songs, data.index);
            this.showNowPlaying();
          } else if (action === 'album') {
            // Navigate to album tracks
            this.musicAlbums = getMusicAlbums();
            const albumIdx = this.musicAlbums.findIndex(a => a.name === data.name);
            if (albumIdx >= 0) {
              this.navStack.push({
                nodeId: this.currentNode ? this.currentNode.id : null,
                scrollIndex: this.scrollIndex,
                type: this.currentNode ? this.currentNode.type : 'home',
                musicViewType: this.musicViewType,
                musicArtists: this.musicArtists,
                musicAlbums: this.musicAlbums,
                musicCurrentArtist: this.musicCurrentArtist,
                musicCurrentAlbum: this.musicCurrentAlbum,
                musicCurrentPlaylist: this.musicCurrentPlaylist,
              });
              this.scrollIndex = 0;
              this.showMusicAlbumTracks(albumIdx, 'right');
            }
          } else {
            // Back
            this.navigateBack();
          }
        });
      });
    });
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
      if (photos.length > 0) {
        if (direction === 'forward') {
          this.photoIndex = (this.photoIndex + 1) % photos.length;
        } else if (direction === 'backward') {
          this.photoIndex = (this.photoIndex - 1 + photos.length) % photos.length;
        }
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

    // After touch-scrolling, snap highlight to the item currently visible
    // so the wheel picks up from where the user is looking
    if (this._touchScrolled) {
      this._touchScrolled = false;
      const container = this.currentView?._listEl || this.currentView?.querySelector?.('.selectable-list') ||
        this.currentView?.querySelector?.('.split-left') || this.currentView?.querySelector?.('.settings-view') ||
        this.currentView?.querySelector?.('.playlist-tracks') || this.currentView?.querySelector?.('.album-tracks');
      if (container) {
        const items = container.querySelectorAll('.list-item');
        const containerRect = container.getBoundingClientRect();
        const midY = containerRect.top + containerRect.height / 2;
        let closestIdx = this.scrollIndex;
        let closestDist = Infinity;
        items.forEach((el, i) => {
          const r = el.getBoundingClientRect();
          const elMid = r.top + r.height / 2;
          const d = Math.abs(elMid - midY);
          if (d < closestDist) { closestDist = d; closestIdx = i; }
        });
        this.scrollIndex = closestIdx;
      }
    }

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
        // If the active item is preceded immediately by a section header (e.g.
        // Settings "Playback" / "Theme"), anchor to the header's top instead
        // of the item's top so the header remains visible.
        let topAnchor = activeItem;
        let prev = activeItem.previousElementSibling;
        while (prev && !prev.classList.contains('list-item')) {
          if (prev.classList.contains('settings-section-header')) {
            topAnchor = prev;
            break;
          }
          prev = prev.previousElementSibling;
        }
        const itemTop = topAnchor.offsetTop - scrollContainer.offsetTop;
        const itemBottom = activeItem.offsetTop - scrollContainer.offsetTop + activeItem.offsetHeight;
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

  // ---- Center Button Long Press ----
  _onCenterPressStart() {
    this._centerLongPressed = false;
    this._centerPressStart = Date.now();
    this._centerLongPressTimer = setTimeout(() => {
      this._centerLongPressed = true;
    }, 600); // 600ms = long press threshold
  }

  _onCenterPressEnd() {
    clearTimeout(this._centerLongPressTimer);
    this._centerLongPressTimer = null;
  }

  // ---- Center Click ----
  onCenterClick() {
    // If this was a long-press, don't also fire the regular click action
    if (this._centerLongPressed) {
      this._centerLongPressed = false;
      return;
    }
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

    // Settings: Playback (0-3) then Theme (4-7)
    if (this.currentNode?.type === 'settings') {
      const playbackCount = 4; // shuffle, repeat, speed, haptics
      const themes = ['silver', 'black', 'u2', 'pink'];
      if (this.scrollIndex === 0) {
        // Toggle shuffle
        audioPlayer.toggleShuffle();
      } else if (this.scrollIndex === 1) {
        // Cycle repeat
        audioPlayer.cycleRepeat();
      } else if (this.scrollIndex === 2) {
        // Cycle speed
        audioPlayer.cycleSpeed();
      } else if (this.scrollIndex === 3) {
        // Toggle haptics
        if (window.ipodClickWheel) {
          window.ipodClickWheel.hapticsEnabled = !window.ipodClickWheel.hapticsEnabled;
        }
      } else if (this.scrollIndex >= playbackCount && this.scrollIndex < playbackCount + themes.length) {
        this.applyTheme(themes[this.scrollIndex - playbackCount]);
      }
      // Re-render settings
      this._rerenderSettings();
      return;
    }

    // Text view or video - no action on center click
    if (this.currentNode?.type === 'text') return;
    if (this.currentNode?.type === 'video') return;

    // Select current item
    const item = this.currentItems[this.scrollIndex];
    if (!item) return;

    // Music library navigation
    if (this.musicViewType) {
      this.navStack.push({
        nodeId: this.currentNode ? this.currentNode.id : null,
        scrollIndex: this.scrollIndex,
        type: this.currentNode ? this.currentNode.type : 'home',
        musicViewType: this.musicViewType,
        musicArtists: this.musicArtists,
        musicAlbums: this.musicAlbums,
        musicCurrentArtist: this.musicCurrentArtist,
        musicCurrentAlbum: this.musicCurrentAlbum,
        musicCurrentPlaylist: this.musicCurrentPlaylist,
      });
      this.scrollIndex = 0;

      if (this.musicViewType === 'menu') {
        if (item.id === '_music_cover_flow') { this.showMusicCoverFlow('right'); return; }
        if (item.id === '_music_songs') { this.showMusicSongs('right'); return; }
        if (item.id === '_music_artists') { this.showMusicArtists('right'); return; }
        if (item.id === '_music_albums') { this.showMusicAlbums('right'); return; }
        if (item.id === '_music_playlists') { this.showMusicPlaylists('right'); return; }
      }
      if (this.musicViewType === 'songs') {
        if (item.type === '_shuffle_songs') {
          // Enable shuffle and play all songs in random order
          const songs = this.currentItems.filter(s => s.type === 'song');
          if (songs.length > 0) {
            audioPlayer.shuffle = true;
            const randomIdx = Math.floor(Math.random() * songs.length);
            audioPlayer.play(songs[randomIdx], songs, randomIdx);
            audioPlayer._buildShuffleOrder();
            this.showNowPlaying('right');
          }
          return;
        }
        if (item.type === 'song') {
          this.playMusicSong(item, this.currentItems.filter(s => s.type === 'song'));
          return;
        }
      }
      if (this.musicViewType === 'artists') {
        const artistIdx = this.navStack[this.navStack.length - 1].scrollIndex;
        this.showMusicArtistSongs(artistIdx, 'right');
        return;
      }
      if (this.musicViewType === 'artist_songs') {
        if (item.type === 'song') {
          this.playMusicSong(item, this.currentItems);
          return;
        }
      }
      if (this.musicViewType === 'albums') {
        const albumIdx = this.navStack[this.navStack.length - 1].scrollIndex;
        this.showMusicAlbumTracks(albumIdx, 'right');
        return;
      }
      if (this.musicViewType === 'album_tracks') {
        if (item.type === 'song') {
          this.playMusicSong(item, this.currentItems);
          return;
        }
      }
      if (this.musicViewType === 'playlists') {
        this.showMusicPlaylistSongs(item, 'right');
        return;
      }
      if (this.musicViewType === 'playlist_songs') {
        if (item.type === 'song') {
          this.playMusicSong(item, this.currentItems);
          return;
        }
      }
      // Fallback: undo the push
      this.navStack.pop();
    }

    // "Now Playing" menu item — jump to Now Playing screen
    if (item.type === '_now_playing') {
      this.navStack.push({
        nodeId: this.currentNode ? this.currentNode.id : null,
        scrollIndex: this.scrollIndex,
        type: this.currentNode ? this.currentNode.type : 'home',
      });
      this.showNowPlaying();
      return;
    }

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
      // During initials entry, menu goes back a letter (handled by game)
      // During leaderboard or playing, exit the game
      const gs = this.activeBrickGame.state;
      if (gs === 'game_over') {
        // Let the game handle cursor-back
        return;
      }
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
    
    // If playback stopped (e.g. end of queue), navigate back from Now Playing
    if (!audioPlayer.isPlaying && !audioPlayer.isPaused) {
      this.onMenuClick();
      return;
    }
    
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
        const nowPlayingCover = coverMeta?.coverImage;
        artwork.src = nowPlayingCover
          ? (typeof transformedImageUrl === 'function' ? transformedImageUrl(nowPlayingCover, { width: 800, quality: 85 }) : nowPlayingCover)
          : 'img/headphones-cover.jpg';
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
      // Use subtitle elements for caption text so title position never shifts
      if (captionEl) captionEl.style.display = 'none';
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

      // Put caption text in first subtitle, clear second
      if (subtitles && subtitles[0]) {
        if (subtitles[0].dataset.currentCaption !== newText) {
          subtitles[0].classList.remove('caption-fade-in');
          void subtitles[0].offsetWidth;
          subtitles[0].textContent = newText;
          subtitles[0].dataset.currentCaption = newText;
          subtitles[0].classList.add('caption-fade-in');
        }
      }
      if (subtitles && subtitles[1]) subtitles[1].textContent = '';
    } else {
      // No transcription — show artist/album as normal
      if (subtitles && subtitles[0]) {
        subtitles[0].textContent = track.metadata?.artistName || '--';
        subtitles[0].classList.remove('caption-fade-in');
        delete subtitles[0].dataset.currentCaption;
      }
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

    // Shuffle/repeat status icons (iPod-authentic SVGs)
    const statusIcons = document.getElementById('np-status-icons');
    if (statusIcons) {
      let html = '';
      if (audioPlayer.shuffle) {
        html += '<svg class="np-icon" viewBox="0 0 14 10" fill="none"><path d="M0 8h3.5L6 5.5M0 2h3.5l7 6H13m0 0l-2-1.5M13 8l-2 1.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 4l3.5-2H13m0 0l-2-1.5M13 2l-2 1.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      }
      if (audioPlayer.repeat === 1) {
        html += '<svg class="np-icon" viewBox="0 0 16 10" fill="none"><path d="M4 1L1.5 2.5 4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M1.5 2.5H12a2.5 2.5 0 0 1 2.5 2.5v0a2.5 2.5 0 0 1-2.5 2.5H4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M12 9l2.5-1.5L12 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.5 7.5H4A2.5 2.5 0 0 1 1.5 5v0A2.5 2.5 0 0 1 4 2.5h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
      }
      if (audioPlayer.repeat === 2) {
        html += '<svg class="np-icon" viewBox="0 0 18 10" fill="none"><path d="M4 1L1.5 2.5 4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M1.5 2.5H12a2.5 2.5 0 0 1 2.5 2.5v0a2.5 2.5 0 0 1-2.5 2.5H4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M12 9l2.5-1.5L12 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.5 7.5H4A2.5 2.5 0 0 1 1.5 5v0A2.5 2.5 0 0 1 4 2.5h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><text x="16.5" y="8" font-size="6" font-weight="bold" fill="currentColor" font-family="sans-serif">1</text></svg>';
      }
      statusIcons.innerHTML = html;
    }
    // Speed badge
    const speedBadge = document.getElementById('np-speed-badge');
    if (speedBadge) {
      speedBadge.textContent = audioPlayer.playbackSpeed + 'x';
      speedBadge.classList.toggle('np-speed-active', audioPlayer.playbackSpeed !== 1);
      // Make tappable (attach once)
      if (!speedBadge._tapBound) {
        speedBadge._tapBound = true;
        speedBadge.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          audioPlayer.cycleSpeed();
        });
      }
    }

    const trackCounter = document.getElementById('np-track-counter');
    if (trackCounter && audioPlayer.queue.length > 0) {
      trackCounter.textContent = `${audioPlayer.queueIndex + 1} of ${audioPlayer.queue.length}`;
    }
  }

  handlePhotoFullscreenScroll(direction) {
    const photos = this.photoNode?.metadata?.photos || [];
    if (photos.length === 0) return;
    if (direction === 'forward') {
      this.photoIndex = (this.photoIndex + 1) % photos.length;
    } else if (direction === 'backward') {
      this.photoIndex = (this.photoIndex - 1 + photos.length) % photos.length;
    }
    const view = renderPhotoFullscreen(photos[this.photoIndex]);
    this.transitionTo(view, direction === 'forward' ? 'right' : 'left');
    // Prefetch the neighbor in the direction of travel so the next press
    // feels instant.
    const nextIdx = direction === 'backward'
      ? (this.photoIndex - 1 + photos.length) % photos.length
      : (this.photoIndex + 1) % photos.length;
    const nextPhoto = photos[nextIdx];
    if (nextPhoto?.url && typeof transformedImageUrl === 'function') {
      const pre = new Image();
      pre.decoding = 'async';
      pre.src = transformedImageUrl(nextPhoto.url, { width: 1200, quality: 85 });
    }
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
