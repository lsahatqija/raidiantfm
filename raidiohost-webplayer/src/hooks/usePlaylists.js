import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../api/client";

export function usePlaylists(sessionKey) {
  const [playlists, setPlaylists] = useState([]);
  const [playlistsOffset, setPlaylistsOffset] = useState(0);
  const [playlistsTotal, setPlaylistsTotal] = useState(0);
  const [isPlaylistsLoading, setIsPlaylistsLoading] = useState(false);
  const [loadedSessionKey, setLoadedSessionKey] = useState(null);
  const playlistsRef = useRef(null);

  useEffect(() => {
    if (!sessionKey) {
      return undefined;
    }

    let ignore = false;

    const loadPlaylists = async () => {
      setIsPlaylistsLoading(true);
      try {
        const data = await apiRequest('/api/playlists?limit=50&offset=0');
        if (!ignore && Array.isArray(data?.playlists)) {
          setPlaylists(data.playlists);
          setPlaylistsTotal(data.total ?? 0);
          setPlaylistsOffset(data.playlists.length);
          setLoadedSessionKey(sessionKey);
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
  }, [sessionKey]);

  const loadMorePlaylists = useCallback(async () => {
    if (!sessionKey || isPlaylistsLoading || playlistsOffset >= playlistsTotal) return;
    setIsPlaylistsLoading(true);
    try {
      const data = await apiRequest(`/api/playlists?limit=20&offset=${playlistsOffset}`);
      if (Array.isArray(data?.playlists)) {
        setPlaylists((prev) => [...prev, ...data.playlists]);
        setPlaylistsTotal(data.total ?? 0);
        setPlaylistsOffset((prev) => prev + data.playlists.length);
      }
    } catch (err) {
      console.error("Failed to load more playlists:", err);
    } finally {
      setIsPlaylistsLoading(false);
    }
  }, [sessionKey, isPlaylistsLoading, playlistsOffset, playlistsTotal]);

  const scrollPlaylists = useCallback((direction) => {
    if (!playlistsRef.current) return;
    playlistsRef.current.scrollBy({
      left: direction * 224,
      behavior: "smooth",
    });
  }, []);

  return {
    playlists: sessionKey === loadedSessionKey ? playlists : [],
    playlistsOffset: sessionKey === loadedSessionKey ? playlistsOffset : 0,
    playlistsTotal: sessionKey === loadedSessionKey ? playlistsTotal : 0,
    isPlaylistsLoading: Boolean(sessionKey && isPlaylistsLoading),
    playlistsRef,
    loadMorePlaylists,
    scrollPlaylists,
  };
}
