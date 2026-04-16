// Music Library — fetches and caches library songs/playlists from Supabase
// Provides computed views: Songs, Artists, Albums, Playlists

const MUSIC_FOLDER_ID = '00000000-0000-4000-a000-00000000000d';

const _musicLibrary = {
  songs: null,       // All library songs (with metadata)
  playlists: null,   // All playlists under Music
  _fetching: false,
  _ready: false,
};

function _supabaseGet(path) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  return fetch(url, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    }
  }).then(res => {
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    return res.json();
  });
}

// Normalize a Supabase row into the same shape as PORTFOLIO_DATA nodes
function _rowToNode(row) {
  const meta = Array.isArray(row.node_metadata) ? row.node_metadata[0] : row.node_metadata;
  return {
    id: row.id,
    parentId: row.parent_id,
    type: row.type,
    title: row.title,
    sortOrder: row.sort_order,
    status: row.status,
    metadata: {
      audioUrl: meta?.audio_url || '',
      coverImage: meta?.cover_image_url || '',
      coverImageUrl: meta?.cover_image_url || '',
      artistName: meta?.artist_name || '',
      albumName: meta?.album_name || '',
      trackNumber: meta?.track_number || 0,
      duration: meta?.duration || 0,
      sourceNodeId: meta?.source_node_id || null,
      transcription: meta?.transcription || null,
    }
  };
}

// Fetch all library songs and playlists. Returns a promise.
function fetchMusicLibrary() {
  if (_musicLibrary._ready) return Promise.resolve(_musicLibrary);
  if (_musicLibrary._fetching) return _musicLibrary._fetching;

  const songsP = _supabaseGet(
    `menu_nodes?parent_id=eq.${MUSIC_FOLDER_ID}&type=eq.song&status=eq.published&select=*,node_metadata!node_metadata_node_id_fkey(*)&order=title.asc`
  );
  const playlistsP = _supabaseGet(
    `menu_nodes?parent_id=eq.${MUSIC_FOLDER_ID}&type=eq.playlist&status=eq.published&select=*,node_metadata!node_metadata_node_id_fkey(*)&order=sort_order.asc`
  );

  _musicLibrary._fetching = Promise.all([songsP, playlistsP])
    .then(([songRows, playlistRows]) => {
      _musicLibrary.songs = songRows.map(_rowToNode);
      _musicLibrary.playlists = playlistRows.map(row => {
        const meta = Array.isArray(row.node_metadata) ? row.node_metadata[0] : row.node_metadata;
        return {
          id: row.id,
          parentId: row.parent_id,
          type: row.type,
          title: row.title,
          sortOrder: row.sort_order,
          metadata: {
            coverImage: meta?.cover_image_url || '',
            coverEmoji: null,
          }
        };
      });
      _musicLibrary._ready = true;
      console.log(`[MusicLibrary] Loaded ${_musicLibrary.songs.length} songs, ${_musicLibrary.playlists.length} playlists`);
      return _musicLibrary;
    })
    .catch(err => {
      console.warn('[MusicLibrary] Fetch failed:', err.message);
      _musicLibrary.songs = [];
      _musicLibrary.playlists = [];
      _musicLibrary._ready = true;
      return _musicLibrary;
    });

  return _musicLibrary._fetching;
}

// Fetch songs for a specific playlist
function fetchPlaylistSongs(playlistId) {
  return _supabaseGet(
    `menu_nodes?parent_id=eq.${playlistId}&type=eq.song&status=eq.published&select=*,node_metadata!node_metadata_node_id_fkey(*)&order=sort_order.asc`
  ).then(rows => rows.map(_rowToNode));
}

// Get all library songs (must call fetchMusicLibrary first)
function getMusicSongs() {
  return (_musicLibrary.songs || []).slice().sort((a, b) =>
    a.title.localeCompare(b.title)
  );
}

// Get distinct artists from library songs
function getMusicArtists() {
  const songs = _musicLibrary.songs || [];
  const artistMap = new Map();
  for (const s of songs) {
    const name = s.metadata.artistName || 'Unknown Artist';
    if (!artistMap.has(name)) {
      artistMap.set(name, []);
    }
    artistMap.get(name).push(s);
  }
  return Array.from(artistMap.entries())
    .map(([name, songs]) => ({ name, songs }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Get distinct albums from library songs
function getMusicAlbums() {
  const songs = _musicLibrary.songs || [];
  const albumMap = new Map();
  for (const s of songs) {
    const name = s.metadata.albumName || 'Unknown Album';
    if (!albumMap.has(name)) {
      albumMap.set(name, {
        name,
        artistName: s.metadata.artistName || '',
        coverImage: s.metadata.coverImage || s.metadata.coverImageUrl || '',
        songs: [],
      });
    }
    albumMap.get(name).songs.push(s);
  }
  // Sort songs within each album by track number then title
  for (const album of albumMap.values()) {
    album.songs.sort((a, b) => {
      const ta = a.metadata.trackNumber || 999;
      const tb = b.metadata.trackNumber || 999;
      if (ta !== tb) return ta - tb;
      return a.title.localeCompare(b.title);
    });
  }
  return Array.from(albumMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

// Get playlists
function getMusicPlaylists() {
  return (_musicLibrary.playlists || []).slice();
}

// Check if a node ID is the Music folder
function isMusicFolder(nodeId) {
  return nodeId === MUSIC_FOLDER_ID;
}
