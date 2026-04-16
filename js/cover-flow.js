// Cover Flow 3D Carousel
class CoverFlow {
  constructor(container, albums, onBack) {
    this.container = container;
    this.albums = albums;
    this.onBack = onBack;
    this.activeIndex = 0;
    this.selectedAlbum = null;
    this.playingAlbum = false;
    this.backsideScrollIndex = 0;
    this.midpoint = { x: 0, y: 0 };
    this.listeners = [];

    this.render();
    this.updateMidpoint();
    this.bindEvents();
    this.updatePositions();
  }

  render() {
    this.container.innerHTML = '';
    this.container.className = 'coverflow-container';

    this.albumsEl = document.createElement('div');
    this.albumsEl.className = 'coverflow-albums';
    this.container.appendChild(this.albumsEl);

    this.coverEls = this.albums.map((album, index) => {
      const el = document.createElement('div');
      el.className = 'coverflow-album';
      
      const wrapper = document.createElement('div');
      wrapper.className = 'coverflow-artwork-wrapper';
      const cover = createCoverEl(album.metadata, 'coverflow-artwork', 'img/headphones-cover.jpg');
      cover.alt = album.title;
      wrapper.appendChild(cover);
      el.appendChild(wrapper);
      
      this.albumsEl.appendChild(el);
      return el;
    });

    // Info container at bottom
    this.infoEl = document.createElement('div');
    this.infoEl.className = 'coverflow-info';
    this.container.appendChild(this.infoEl);

    this.updateInfo();
  }

  updateMidpoint() {
    const rect = this.albumsEl.getBoundingClientRect();
    this.midpoint = { x: rect.width / 2, y: rect.height / 2 };
  }

  getOffsetPx(offset) {
    if (offset === 0) return 0;
    const val = this.midpoint.x - 46 + offset * 48;
    return val + (offset < 0 ? -48 : 24);
  }

  updatePositions() {
    this.coverEls.forEach((el, index) => {
      const offset = index - this.activeIndex;
      const isActive = index === this.activeIndex;
      const isVisible = Math.abs(offset) < 15;
      const isSelected = this.selectedAlbum && this.albums[index].id === this.selectedAlbum.id;
      const isHidden = !isActive && this.playingAlbum;

      el.style.display = isVisible ? '' : 'none';
      el.style.zIndex = 1 - Math.abs(offset);
      el.style.opacity = isHidden ? '0' : '1';

      el.classList.toggle('active', isActive);
      el.classList.toggle('selected', isSelected && !this.playingAlbum);
      el.classList.toggle('playing', isSelected && this.playingAlbum);
      el.classList.toggle('hidden', isHidden);

      if (isActive) {
        if (isSelected && this.playingAlbum) {
          el.style.transform = `translate(${this.midpoint.x / 9}px, 8px) rotateY(35deg)`;
          el.style.webkitBoxReflect = 'below 0px -webkit-gradient(linear, left top, left bottom, from(transparent), color-stop(70%, transparent), to(rgba(240, 240, 240, 0.2)))';
        } else if (isSelected) {
          el.style.transform = `translate3d(${this.midpoint.x - 60}px, 4px, 20px) rotateY(-180deg) translateY(25%) scale(0.96)`;
          el.style.webkitBoxReflect = 'none';
        } else {
          el.style.transform = `translate3d(${this.midpoint.x - 60}px, 4px, 20px)`;
          el.style.webkitBoxReflect = 'below 0px -webkit-gradient(linear, left top, left bottom, from(transparent), color-stop(70%, transparent), to(rgba(240, 240, 240, 0.2)))';
        }
      } else {
        const px = this.getOffsetPx(offset);
        const rot = index < this.activeIndex ? '70deg' : '-70deg';
        el.style.transform = `translateX(${px}px) scale(1.1) translateZ(-65px) rotateY(${rot})`;
        el.style.webkitBoxReflect = 'below 0px -webkit-gradient(linear, left top, left bottom, from(transparent), color-stop(70%, transparent), to(rgba(240, 240, 240, 0.2)))';
      }
    });
  }

  updateInfo() {
    if (this.playingAlbum) {
      this.infoEl.style.display = 'none';
      return;
    }
    
    this.infoEl.style.display = '';
    const album = this.albums[this.activeIndex];
    if (album) {
      this.infoEl.innerHTML = `
        <h3>${album.title}</h3>
        <h3>${album.metadata.artistName || ''}</h3>
      `;
    }
  }

  showBackside(album) {
    this.selectedAlbum = album;
    this.backsideScrollIndex = 0;
    
    const el = this.coverEls[this.activeIndex];
    // Remove existing backside
    const existing = el.querySelector('.coverflow-backside');
    if (existing) existing.remove();

    // Get all children for this album (songs, links, photo albums, videos, folders, etc.)
    const children = getChildren(album.id);
    
    const backside = document.createElement('div');
    backside.className = 'coverflow-backside';
    
    const header = document.createElement('div');
    header.className = 'coverflow-backside-header';
    header.innerHTML = `<h3>${album.title}</h3><h4>${album.metadata.artistName || ''}</h4>`;
    backside.appendChild(header);
    
    const listContainer = document.createElement('div');
    listContainer.className = 'coverflow-backside-list';
    
    children.forEach((child, i) => {
      const item = document.createElement('div');
      item.className = 'list-item' + (i === 0 ? ' active' : '');
      item.innerHTML = `<div class="list-label-container"><h3 class="list-label">${child.title}</h3></div>`;
      listContainer.appendChild(item);
    });
    
    backside.appendChild(listContainer);
    el.appendChild(backside);
    this.backsideChildren = children;
    
    this.updatePositions();
  }

  hideBackside() {
    this.selectedAlbum = null;
    this.coverEls.forEach(el => {
      const bs = el.querySelector('.coverflow-backside');
      if (bs) bs.remove();
    });
    this.updatePositions();
    this.updateInfo();
  }

  updateBacksideSelection() {
    const el = this.coverEls[this.activeIndex];
    if (!el) return;
    const items = el.querySelectorAll('.coverflow-backside .list-item');
    items.forEach((item, i) => {
      item.classList.toggle('active', i === this.backsideScrollIndex);
      if (i === this.backsideScrollIndex) {
        // Scroll the active item into view within the backside list container
        const list = el.querySelector('.coverflow-backside-list');
        if (list) {
          const itemTop = item.offsetTop;
          const itemBottom = itemTop + item.offsetHeight;
          const listTop = list.scrollTop;
          const listBottom = listTop + list.clientHeight;
          if (itemBottom > listBottom) {
            list.scrollTop = itemBottom - list.clientHeight;
          } else if (itemTop < listTop) {
            list.scrollTop = itemTop;
          }
        }
      }
    });
  }

  bindEvents() {
    const onForward = () => {
      if (this.selectedAlbum && !this.playingAlbum) {
        // Scrolling backside list
        if (this.backsideChildren && this.backsideScrollIndex < this.backsideChildren.length - 1) {
          this.backsideScrollIndex++;
          this.updateBacksideSelection();
        }
      } else if (!this.playingAlbum && this.activeIndex < this.albums.length - 1) {
        this.activeIndex++;
        this.updatePositions();
        this.updateInfo();
      }
    };
    
    const onBackward = () => {
      if (this.selectedAlbum && !this.playingAlbum) {
        if (this.backsideScrollIndex > 0) {
          this.backsideScrollIndex--;
          this.updateBacksideSelection();
        }
      } else if (!this.playingAlbum && this.activeIndex > 0) {
        this.activeIndex--;
        this.updatePositions();
        this.updateInfo();
      }
    };
    
    const onCenter = () => {
      if (!this.selectedAlbum) {
        const album = this.albums[this.activeIndex];
        if (album) {
          this.showBackside(album);
        }
      } else if (this.selectedAlbum && !this.playingAlbum) {
        // Select an item from backside
        if (this.backsideChildren && this.backsideChildren[this.backsideScrollIndex]) {
          const track = this.backsideChildren[this.backsideScrollIndex];
          if (track.type === 'song') {
            const songs = this.backsideChildren.filter(c => c.type === 'song');
            audioPlayer.play(track, songs, songs.indexOf(track));
            this.cleanup();
            if (this.onBack) this.onBack(true);
          } else if (track.type === 'link' && track.metadata?.url) {
            window.open(track.metadata.url, '_blank', 'noopener,noreferrer');
          } else if (track.type === 'folder' || track.type === 'photo_album' || track.type === 'video') {
            // Navigate into the item via the main app
            this.cleanup();
            if (this.onBack) this.onBack(false, track);
          }
        }
      }
    };
    
    const onMenu = () => {
      if (this.selectedAlbum && this.playingAlbum) {
        this.playingAlbum = false;
        this.updatePositions();
        this.updateInfo();
      } else if (this.selectedAlbum) {
        this.hideBackside();
      } else {
        this.cleanup();
        if (this.onBack) this.onBack();
      }
    };

    window.addEventListener('forwardscroll', onForward);
    window.addEventListener('backwardscroll', onBackward);
    window.addEventListener('centerclick', onCenter);
    window.addEventListener('menuclick', onMenu);
    
    this.listeners = [
      ['forwardscroll', onForward],
      ['backwardscroll', onBackward],
      ['centerclick', onCenter],
      ['menuclick', onMenu],
    ];
  }

  cleanup() {
    this.listeners.forEach(([evt, fn]) => window.removeEventListener(evt, fn));
    this.listeners = [];
  }
}

// Music Cover Flow — variant that uses music library albums (computed from songs)
// instead of database node children for the backside track list.
class MusicCoverFlow extends CoverFlow {
  constructor(container, albums, musicAlbums, onAction) {
    // onAction callback: onAction(action, data)
    //   action='play'  → data = { song, songs, index }
    //   action='album'  → data = musicAlbum object
    //   action='back'   → no data
    super(container, albums, null);
    this.onAction = onAction;
    // Re-bind events with music-specific behavior
    this.cleanup();
    this.bindMusicEvents();
  }

  showBackside(album) {
    this.selectedAlbum = album;
    this.backsideScrollIndex = 0;

    const el = this.coverEls[this.activeIndex];
    const existing = el.querySelector('.coverflow-backside');
    if (existing) existing.remove();

    // Use the music album's songs instead of getChildren
    const musicAlbum = album._musicAlbum;
    const children = musicAlbum ? musicAlbum.songs : [];

    const backside = document.createElement('div');
    backside.className = 'coverflow-backside';

    const header = document.createElement('div');
    header.className = 'coverflow-backside-header';
    header.innerHTML = `<h3>${album.title}</h3><h4>${album.metadata.artistName || ''}</h4>`;
    backside.appendChild(header);

    const listContainer = document.createElement('div');
    listContainer.className = 'coverflow-backside-list';

    children.forEach((child, i) => {
      const item = document.createElement('div');
      item.className = 'list-item' + (i === 0 ? ' active' : '');
      item.innerHTML = `<div class="list-label-container"><h3 class="list-label">${child.title}</h3></div>`;
      listContainer.appendChild(item);
    });

    backside.appendChild(listContainer);
    el.appendChild(backside);
    this.backsideChildren = children;

    this.updatePositions();
  }

  bindMusicEvents() {
    const onForward = () => {
      if (this.selectedAlbum && !this.playingAlbum) {
        if (this.backsideChildren && this.backsideScrollIndex < this.backsideChildren.length - 1) {
          this.backsideScrollIndex++;
          this.updateBacksideSelection();
        }
      } else if (!this.playingAlbum && this.activeIndex < this.albums.length - 1) {
        this.activeIndex++;
        this.updatePositions();
        this.updateInfo();
      }
    };

    const onBackward = () => {
      if (this.selectedAlbum && !this.playingAlbum) {
        if (this.backsideScrollIndex > 0) {
          this.backsideScrollIndex--;
          this.updateBacksideSelection();
        }
      } else if (!this.playingAlbum && this.activeIndex > 0) {
        this.activeIndex--;
        this.updatePositions();
        this.updateInfo();
      }
    };

    const onCenter = () => {
      if (!this.selectedAlbum) {
        const album = this.albums[this.activeIndex];
        if (album) this.showBackside(album);
      } else if (this.selectedAlbum && !this.playingAlbum) {
        if (this.backsideChildren && this.backsideChildren[this.backsideScrollIndex]) {
          const track = this.backsideChildren[this.backsideScrollIndex];
          if (track.type === 'song') {
            const songs = this.backsideChildren.filter(c => c.type === 'song');
            const idx = songs.indexOf(track);
            this.cleanup();
            if (this.onAction) this.onAction('play', { song: track, songs, index: idx >= 0 ? idx : 0 });
          }
        }
      }
    };

    const onMenu = () => {
      if (this.selectedAlbum && this.playingAlbum) {
        this.playingAlbum = false;
        this.updatePositions();
        this.updateInfo();
      } else if (this.selectedAlbum) {
        this.hideBackside();
      } else {
        this.cleanup();
        if (this.onAction) this.onAction('back');
      }
    };

    window.addEventListener('forwardscroll', onForward);
    window.addEventListener('backwardscroll', onBackward);
    window.addEventListener('centerclick', onCenter);
    window.addEventListener('menuclick', onMenu);

    this.listeners = [
      ['forwardscroll', onForward],
      ['backwardscroll', onBackward],
      ['centerclick', onCenter],
      ['menuclick', onMenu],
    ];
  }
}
