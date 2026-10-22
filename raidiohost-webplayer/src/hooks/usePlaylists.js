import { useCallback, useEffect, useRef, useState } from "react";
import { SERVER_BASE } from "../utils/constants";

export function usePlaylists(accessToken) {
  const [playlists, setPlaylists] = useState([]);
  const [playlistsOffset, setPlaylistsOffset] = useState(0);
  const [playlistsTotal, setPlaylistsTotal] = useState(0);
  const [isPlaylistsLoading, setIsPlaylistsLoading] = useState(false);
  const playlistsRef = useRef(null);

  useEffect(() => {
    if (!accessToken) {
      setPlaylists([]);
      setPlaylistsOffset(0);
      setPlaylistsTotal(0);
      return undefined;
    }

    let ignore = false;

    const loadPlaylists = async () => {
      setIsPlaylistsLoading(true);
      try {
        const res = await fetch(`${SERVER_BASE}/api/playlists?limit=50&offset=0`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json();
        if (!ignore && res.ok && Array.isArray(data?.playlists)) {
          setPlaylists(data.playlists);
          setPlaylistsTotal(data.total ?? 0);
          setPlaylistsOffset(data.playlists.length);
        }
      } catch (err) {
        console.error("Failed to load playlists:", err);
      } finally {
        if (!ignore) setIsPlaylistsLoading(false);
      }
    };

    loadPlaylists();

    return () => {
      ignore = true;
    };
  }, [accessToken]);

  const loadMorePlaylists = useCallback(async () => {
    if (!accessToken || isPlaylistsLoading || playlistsOffset >= playlistsTotal) return;
    setIsPlaylistsLoading(true);
    try {
      const res = await fetch(`${SERVER_BASE}/api/playlists?limit=20&offset=${playlistsOffset}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data?.playlists)) {
        setPlaylists((prev) => [...prev, ...data.playlists]);
        setPlaylistsTotal(data.total ?? 0);
        setPlaylistsOffset((prev) => prev + data.playlists.length);
      }
    } catch (err) {
      console.error("Failed to load more playlists:", err);
    } finally {
      setIsPlaylistsLoading(false);
    }
  }, [accessToken, isPlaylistsLoading, playlistsOffset, playlistsTotal]);

  const scrollPlaylists = useCallback((direction) => {
    if (!playlistsRef.current) return;
    playlistsRef.current.scrollBy({
      left: direction * 224,
      behavior: "smooth",
    });
  }, []);

  return {
    playlists,
    playlistsOffset,
    playlistsTotal,
    isPlaylistsLoading,
    playlistsRef,
    loadMorePlaylists,
    scrollPlaylists,
  };
}
