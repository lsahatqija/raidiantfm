export function normalizeStoredTrack(track) {
  if (!track?.uri && !track?.id) {
    return null;
  }

  return {
    id: track.id || track.uri,
    uri: track.uri,
    name: track.name || "Unknown track",
    artists: track.artists || "Unknown Artist",
    album: track.album || "Unknown Album",
    image: track.image || null,
  };
}
