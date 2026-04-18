// HTML5 Audio Player for iPodfolio
class AudioPlayer {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this.isPlaying = false;
    this.isPaused = false;
    this.currentTrack = null;
    this.queue = [];
    this.queueIndex = 0;
    this.volume = 0.7;
    this.audio.volume = this.volume;
    this.shuffle = false;   // 'off' or 'songs'
    this.repeat = 0;        // 0 = off, 1 = all, 2 = one
    this.playbackSpeed = 1; // 1, 1.5, or 2
    this._shuffleOrder = [];
    this._shufflePos = 0;
    
    // Set up audio events
    this.audio.addEventListener('ended', () => this._onEnded());
    this.audio.addEventListener('timeupdate', () => this._onTimeUpdate());
    this.audio.addEventListener('loadedmetadata', () => this._onMetaLoaded());
    
    this.onUpdate = null; // callback for UI updates
  }

  play(track, queue, queueIndex) {
    if (track) {
      this.currentTrack = track;
      if (queue) {
        this.queue = queue;
        this.queueIndex = queueIndex || 0;
      }
      if (track.metadata.audioUrl) {
        this.audio.src = track.metadata.audioUrl;
        this.audio.playbackRate = this.playbackSpeed;
        this.audio.play().catch(() => {});
        this.isPlaying = true;
        this.isPaused = false;
      } else {
        // No audio URL - simulate playback for demo
        this.isPlaying = true;
        this.isPaused = false;
        this._simulatePlayback();
      }
    } else if (this.isPaused) {
      this.audio.play().catch(() => {});
      this.isPlaying = true;
      this.isPaused = false;
    }
    this._notify();
  }

  pause() {
    this.audio.pause();
    this.isPaused = true;
    this._notify();
  }

  togglePlayPause() {
    if (this.isPlaying && !this.isPaused) {
      this.pause();
    } else if (this.isPaused) {
      this.play();
    }
  }

  next() {
    if (this.shuffle && this.queue.length > 1) {
      this._shufflePos++;
      if (this._shufflePos >= this._shuffleOrder.length) {
        if (this.repeat === 1) {
          this._buildShuffleOrder();
          this._shufflePos = 0;
        } else {
          this.stop();
          return;
        }
      }
      this.queueIndex = this._shuffleOrder[this._shufflePos];
      this.play(this.queue[this.queueIndex], this.queue, this.queueIndex);
      return;
    }
    if (this.queue.length > 0 && this.queueIndex < this.queue.length - 1) {
      this.queueIndex++;
      this.play(this.queue[this.queueIndex], this.queue, this.queueIndex);
    } else if (this.repeat === 1 && this.queue.length > 0) {
      this.queueIndex = 0;
      this.play(this.queue[this.queueIndex], this.queue, this.queueIndex);
    } else {
      this.stop();
    }
  }

  prev() {
    if (this.shuffle && this.queue.length > 1) {
      if (this._shufflePos > 0) {
        this._shufflePos--;
        this.queueIndex = this._shuffleOrder[this._shufflePos];
        this.play(this.queue[this.queueIndex], this.queue, this.queueIndex);
      }
      return;
    }
    if (this.queue.length > 0 && this.queueIndex > 0) {
      this.queueIndex--;
      this.play(this.queue[this.queueIndex], this.queue, this.queueIndex);
    }
  }

  toggleShuffle() {
    this.shuffle = !this.shuffle;
    if (this.shuffle && this.queue.length > 1) {
      this._buildShuffleOrder();
    }
    this._notify();
  }

  cycleRepeat() {
    this.repeat = (this.repeat + 1) % 3; // off → all → one → off
    this._notify();
  }

  cycleSpeed() {
    const speeds = [1, 1.5, 2];
    const idx = speeds.indexOf(this.playbackSpeed);
    this.playbackSpeed = speeds[(idx + 1) % speeds.length];
    this.audio.playbackRate = this.playbackSpeed;
    this._notify();
  }

  _buildShuffleOrder() {
    // Fisher-Yates shuffle, current track first
    const indices = Array.from({ length: this.queue.length }, (_, i) => i);
    const current = this.queueIndex;
    const rest = indices.filter(i => i !== current);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    this._shuffleOrder = [current, ...rest];
    this._shufflePos = 0;
  }

  _onEnded() {
    if (this.repeat === 2) {
      // Repeat One: replay current track
      this.audio.currentTime = 0;
      this.audio.play().catch(() => {});
      this._notify();
      return;
    }
    this.next();
  }

  stop() {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.isPlaying = false;
    this.isPaused = false;
    this._stopSimulation();
    this._notify();
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    this.audio.volume = this.volume;
    this._notify();
  }

  increaseVolume() {
    this.setVolume(this.volume + 0.05);
  }

  decreaseVolume() {
    this.setVolume(this.volume - 0.05);
  }

  seek(percent) {
    const duration = this.getDuration();
    if (duration > 0) {
      this.audio.currentTime = (percent / 100) * duration;
    } else if (this.currentTrack && this.currentTrack.metadata.duration) {
      this._simCurrentTime = (percent / 100) * this.currentTrack.metadata.duration;
    }
    this._notify();
  }

  getCurrentTime() {
    if (this.audio.src && this.audio.readyState > 0) {
      return this.audio.currentTime;
    }
    return this._simCurrentTime || 0;
  }

  getDuration() {
    if (this.audio.src && isFinite(this.audio.duration) && this.audio.duration > 0) {
      return this.audio.duration;
    }
    // Fallback: use metadata duration or derive from transcription
    if (this.currentTrack) {
      if (this.currentTrack.metadata.duration) return this.currentTrack.metadata.duration;
      const t = this.currentTrack.metadata.transcription;
      if (t) {
        const segs = t.segments;
        if (segs && segs.length > 0) return segs[segs.length - 1].end;
      }
    }
    return 0;
  }

  getPercent() {
    const d = this.getDuration();
    if (d <= 0) return 0;
    return (this.getCurrentTime() / d) * 100;
  }

  getTimeRemaining() {
    return Math.max(0, this.getDuration() - this.getCurrentTime());
  }

  _onTimeUpdate() {
    this._notify();
  }

  _onMetaLoaded() {
    this._notify();
  }

  _notify() {
    if (this.onUpdate) this.onUpdate();
  }

  // Simulated playback for tracks without audio URLs
  _simCurrentTime = 0;
  _simInterval = null;

  _simulatePlayback() {
    this._stopSimulation();
    this._simCurrentTime = 0;
    this._simInterval = setInterval(() => {
      if (this.isPlaying && !this.isPaused) {
        this._simCurrentTime += 1;
        const d = this.currentTrack ? (this.currentTrack.metadata.duration || 0) : 0;
        if (d > 0 && this._simCurrentTime >= d) {
          this._onEnded();
        }
        this._notify();
      }
    }, 1000);
  }

  _stopSimulation() {
    if (this._simInterval) {
      clearInterval(this._simInterval);
      this._simInterval = null;
    }
  }
}

// Singleton
const audioPlayer = new AudioPlayer();
