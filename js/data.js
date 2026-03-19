// Portfolio data tree - each node has id, parentId, type, title, sortOrder, metadata
const PORTFOLIO_DATA = [
  {
    id: "cover-flow",
    parentId: null,
    type: "cover_flow_home",
    title: "Cover Flow",
    sortOrder: 0,
    metadata: {}
  },
  {
    id: "projects",
    parentId: null,
    type: "folder",
    title: "Projects",
    sortOrder: 1,
    metadata: { previewImage: "img/projects-preview.jpg" }
  },
  {
    id: "project-1",
    parentId: "projects",
    type: "album",
    title: "Fusion 360 Headphones",
    sortOrder: 0,
    metadata: {
      coverImage: "img/headphones-cover.jpg",
      artistName: "Harry Schwartz",
    }
  },
  {
    id: "p1-audio",
    parentId: "project-1",
    type: "folder",
    title: "Audio",
    sortOrder: 0,
    metadata: {}
  },
  {
    id: "p1-why",
    parentId: "p1-audio",
    type: "song",
    title: "Why",
    sortOrder: 0,
    metadata: {
      artistName: "Harry Schwartz",
      albumName: "Fusion 360 Headphones",
      duration: 120,
      audioUrl: ""
    }
  },
  {
    id: "p1-journey",
    parentId: "p1-audio",
    type: "song",
    title: "Creative Journey",
    sortOrder: 1,
    metadata: {
      artistName: "Harry Schwartz",
      albumName: "Fusion 360 Headphones",
      duration: 180,
      audioUrl: ""
    }
  },
  {
    id: "p1-learnings",
    parentId: "p1-audio",
    type: "song",
    title: "Learnings",
    sortOrder: 2,
    metadata: {
      artistName: "Harry Schwartz",
      albumName: "Fusion 360 Headphones",
      duration: 150,
      audioUrl: ""
    }
  },
  {
    id: "p1-photos",
    parentId: "project-1",
    type: "photo_album",
    title: "Photos",
    sortOrder: 1,
    metadata: {
      photos: [
        { url: "img/placeholder-1.jpg", caption: "Design sketch" },
        { url: "img/placeholder-2.jpg", caption: "3D model" },
        { url: "img/placeholder-3.jpg", caption: "Final product" }
      ]
    }
  },
  {
    id: "p1-videos",
    parentId: "project-1",
    type: "folder",
    title: "Videos",
    sortOrder: 2,
    metadata: {}
  },
  {
    id: "p1-demo",
    parentId: "p1-videos",
    type: "video",
    title: "Demo Video",
    sortOrder: 0,
    metadata: {
      videoUrl: "",
      thumbnailUrl: "img/placeholder-video.jpg",
      duration: 90
    }
  },
  {
    id: "p1-tryit",
    parentId: "project-1",
    type: "link",
    title: "Try It",
    sortOrder: 3,
    metadata: { url: "https://example.com" }
  },
  {
    id: "project-2",
    parentId: "projects",
    type: "album",
    title: "Adobe Express Redesign",
    sortOrder: 1,
    metadata: {
      coverImage: "img/adobe-cover.jpg",
      artistName: "Harry Schwartz",
    }
  },
  {
    id: "music",
    parentId: null,
    type: "folder",
    title: "Music",
    sortOrder: 2,
    metadata: { previewImage: "img/music-preview.jpg" }
  },
  {
    id: "music-coverflow",
    parentId: "music",
    type: "cover_flow_music",
    title: "Cover Flow",
    sortOrder: 0,
    metadata: {}
  },
  {
    id: "music-playlists",
    parentId: "music",
    type: "folder",
    title: "Playlists",
    sortOrder: 1,
    metadata: {}
  },
  {
    id: "dj-sets",
    parentId: "music-playlists",
    type: "playlist",
    title: "DJ Sets",
    sortOrder: 0,
    metadata: {
      coverImage: "img/dj-cover.jpg",
      songIds: ["dj-set-1", "dj-set-2"]
    }
  },
  {
    id: "dj-set-1",
    parentId: "dj-sets",
    type: "song",
    title: "Set @ Berkeley 2025",
    sortOrder: 0,
    metadata: {
      artistName: "DJ Harry",
      albumName: "DJ Sets",
      duration: 3600,
      audioUrl: ""
    }
  },
  {
    id: "music-artists",
    parentId: "music",
    type: "folder",
    title: "Artists",
    sortOrder: 2,
    metadata: {}
  },
  {
    id: "music-albums",
    parentId: "music",
    type: "folder",
    title: "Albums",
    sortOrder: 3,
    metadata: {}
  },
  {
    id: "music-search",
    parentId: "music",
    type: "folder",
    title: "Search",
    sortOrder: 4,
    metadata: {}
  },
  {
    id: "games",
    parentId: null,
    type: "folder",
    title: "Games",
    sortOrder: 3,
    metadata: { previewImage: "img/games-preview.jpg" }
  },
  {
    id: "brick",
    parentId: "games",
    type: "game",
    title: "Brick",
    sortOrder: 0,
    metadata: {}
  },
  {
    id: "about",
    parentId: null,
    type: "text",
    title: "About",
    sortOrder: 4,
    metadata: {
      bodyText: "Harry Schwartz is an MBA/MEng student at UC Berkeley (Haas + Engineering) with a background in product design from Stanford. He's passionate about creative tools, AI, and the intersection of hardware and software. When he's not building things, he's DJing, skiing, or exploring new ideas across design, engineering, and culture.",
      links: [
        { label: "LinkedIn", url: "https://linkedin.com/in/harryschwartz" },
        { label: "GitHub", url: "https://github.com/harryschwartz" }
      ]
    }
  },
  {
    id: "settings",
    parentId: null,
    type: "settings",
    title: "Settings",
    sortOrder: 5,
    metadata: {}
  }
];

// Helper functions for data tree
function getChildren(parentId) {
  return PORTFOLIO_DATA
    .filter(n => n.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function getNode(id) {
  return PORTFOLIO_DATA.find(n => n.id === id);
}

function getRootNodes() {
  return getChildren(null);
}

function getParent(node) {
  if (!node || !node.parentId) return null;
  return getNode(node.parentId);
}

function getAncestors(node) {
  const ancestors = [];
  let current = node;
  while (current && current.parentId) {
    current = getNode(current.parentId);
    if (current) ancestors.unshift(current);
  }
  return ancestors;
}
