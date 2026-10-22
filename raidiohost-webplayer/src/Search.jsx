import { useState } from "react";

function normalizeTrack(track, query) {
  if (!track) {
    return null;
  }

  if (typeof track === "string") {
    if (track.startsWith("spotify:")) {
      return { id: track, name: query, artist: track.artists, uri: track };
    }

    if (track.startsWith("http")) {
      return { id: track, name: query, artist: track.artists, url: track, uri: track };
    }
  }

  const uri = track.uri || track.url || track.trackUrl || track.spotifyUrl || track.href || track.external_urls?.spotify;

  return {
    id: track.id || uri || `${track.name || query}-${track.artists || "artist"}`,
    uri,
    name: track.name || query || "Selected track",
    artists:
      track.artists ||
      "Unknown Artist",
    album: typeof track.album === "string" ? track.album : track.album?.name,
    image: track.image || track.albumImage || track.album_image || track.album?.images?.[0]?.url,
    url: track.url || track.trackUrl || track.spotifyUrl || track.href || track.external_urls?.spotify,
  };
}

function normalizeSearchResponse(data, query) {
  const candidateList =
    (Array.isArray(data) && data) ||
    data?.results ||
    data?.items ||
    data?.tracks?.items ||
    (Array.isArray(data?.tracks) ? data.tracks : null) ||
    data?.data ||
    null;

  if (Array.isArray(candidateList)) {
    return candidateList.map((track) => normalizeTrack(track, query)).filter(Boolean);
  }

  if (data?.track) {
    return [normalizeTrack(data.track, query)].filter(Boolean);
  }

  const singleTrack = normalizeTrack(data, query);
  return singleTrack?.uri || singleTrack?.url ? [singleTrack] : [];
}

export default function Search({ onResultsChange, onManualSearchStart, accessToken }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();

    if (!query.trim()) return;

    onManualSearchStart?.();
    setLoading(true);

    try {
      const searchUrl = `${import.meta.env.VITE_SERVER_BASE_URL}/api/search`;
      const res = await fetch(`${searchUrl}?q=${encodeURIComponent(query)}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      console.log(`Search URL: ${searchUrl}?q=${encodeURIComponent(query)}`);

      const data = await res.json();
      const normalizedResults = normalizeSearchResponse(data, query);

      onResultsChange?.(normalizedResults);
    } catch (err) {
      console.error("Search failed:", err);
      onResultsChange?.([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="search-section">
      <form className="search-form" onSubmit={handleSearch}>
        <input
          className="search-input"
          type="text"
          placeholder="Search songs, artists..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="search-button" type="submit">Search</button>
      </form>

      {loading && <p>Loading...</p>}
    </div>
  );
}