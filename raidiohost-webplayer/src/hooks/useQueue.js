import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_RECENT_TRACKS, QUEUED_TRACK_STORAGE_KEY, RECENT_TRACKS_STORAGE_KEY, SERVER_BASE } from "../utils/constants";
import { normalizeStoredTrack } from "../utils/trackUtils";

export function useQueue(accessToken, { onBeforeNextTrack } = {}) {
  const [selectedTrack, setSelectedTrack] = useState(null);
  const onBeforeNextTrackRef = useRef(onBeforeNextTrack);
  useEffect(() => {
    onBeforeNextTrackRef.current = onBeforeNextTrack;
  }, [onBeforeNextTrack]);

  const [queuedTrack, setQueuedTrack] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      return JSON.parse(window.localStorage.getItem(QUEUED_TRACK_STORAGE_KEY) || "null");
    } catch {
      return null;
    }
  });
  const [recentTracks, setRecentTracks] = useState(() => {
    if (typeof window === "undefined") return [];
    try {
      const parsed = JSON.parse(window.localStorage.getItem(RECENT_TRACKS_STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [isQueueLoading, setIsQueueLoading] = useState(false);
  const [deviceId, setDeviceId] = useState(null);
  const [playingPlaylistId, setPlayingPlaylistId] = useState(null);

  const queuedTrackRef = useRef(queuedTrack);
  const recentTracksRef = useRef(recentTracks);
  const queueSourceRef = useRef(null);
  const autoAdvanceLockRef = useRef(false);
  const playlistQueueRef = useRef([]);
  const playlistLoadRef = useRef(0);
  const playlistModeRef = useRef(false);

  useEffect(() => {
    queuedTrackRef.current = queuedTrack;
    if (typeof window === "undefined") return;
    try {
      if (queuedTrack) {
        window.localStorage.setItem(QUEUED_TRACK_STORAGE_KEY, JSON.stringify(queuedTrack));
      } else {
        window.localStorage.removeItem(QUEUED_TRACK_STORAGE_KEY);
      }
    } catch (err) {
      console.error("Failed to cache queued track:", err);
    }
  }, [queuedTrack]);

  useEffect(() => {
    recentTracksRef.current = recentTracks;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(RECENT_TRACKS_STORAGE_KEY, JSON.stringify(recentTracks));
    } catch (err) {
      console.error("Failed to cache recent tracks:", err);
    }
  }, [recentTracks]);

  const addToRecentTracks = useCallback((track) => {
    const normalizedTrack = normalizeStoredTrack(track);
    if (!normalizedTrack?.uri) return;
    setRecentTracks((current) => {
      const deduped = current.filter(
        (item) => item?.uri !== normalizedTrack.uri && item?.id !== normalizedTrack.id
      );
      return [normalizedTrack, ...deduped].slice(0, MAX_RECENT_TRACKS);
    });
  }, []);

  const requestQueuedTrack = useCallback(async (sourceTrack) => {
    const sourceUri = sourceTrack?.uri || sourceTrack?.id;
    if (!sourceUri) {
      queueSourceRef.current = null;
      setQueuedTrack(null);
      return null;
    }

    queueSourceRef.current = sourceUri;
    setIsQueueLoading(true);

    try {
      const res = await fetch(`${SERVER_BASE}/api/queue-next`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          track: sourceTrack,
          recentTracks: recentTracksRef.current,
        }),
      });

      const data = await res.json();
      const nextQueuedTrack = res.ok && data?.track ? { ...data.track } : null;
      setQueuedTrack(nextQueuedTrack);
      return nextQueuedTrack;
    } catch (err) {
      console.error("Error finding similar queued track:", err);
      setQueuedTrack(null);
      return null;
    } finally {
      setIsQueueLoading(false);
    }
  }, [accessToken]);

  const handleDeviceReady = useCallback((id) => {
    setDeviceId(id);
  }, []);

  const handlePlayerTrackChange = useCallback(
    (track) => {
      if (!track?.uri) return;
      setSelectedTrack((current) => (current?.uri === track.uri ? current : track));
      addToRecentTracks(track);
      if (playlistModeRef.current) return;
      if (queueSourceRef.current !== track.uri) {
        requestQueuedTrack(track);
      }
    },
    [addToRecentTracks, requestQueuedTrack]
  );

  const handlePlayTrack = useCallback(
    async (track) => {
      const nextTrack = track ? { ...track } : null;
      setSelectedTrack(nextTrack);
      if (!nextTrack?.uri) return;

      const queueIsEmpty = !queuedTrackRef.current && playlistQueueRef.current.length === 0;

      if (queueIsEmpty) {
        playlistModeRef.current = false;
        playlistQueueRef.current = [];
        const queuePromise = requestQueuedTrack(nextTrack);

        if (!deviceId) {
          await queuePromise;
          return;
        }

        try {
          await fetch(
            `${SERVER_BASE}/api/play?uri=${encodeURIComponent(nextTrack.uri)}&device_id=${encodeURIComponent(deviceId)}`,
            { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} }
          );
        } catch (err) {
          console.error("Error starting playback:", err);
        }

        await queuePromise;
      } else {
        if (!deviceId) return;
        try {
          await fetch(
            `${SERVER_BASE}/api/play?uri=${encodeURIComponent(nextTrack.uri)}&device_id=${encodeURIComponent(deviceId)}`,
            { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} }
          );
        } catch (err) {
          console.error("Error starting playback:", err);
        }
      }
    },
    [accessToken, deviceId, requestQueuedTrack]
  );

  const handleAddToQueue = useCallback((track) => {
    if (!track?.uri) return;
    const trackToAdd = { ...track };

    if (playlistModeRef.current) {
      const filtered = playlistQueueRef.current.filter((t) => t?.uri !== trackToAdd.uri);
      playlistQueueRef.current = [trackToAdd, ...filtered];
    } else {
      const existing = queuedTrackRef.current;
      const rest = existing && existing.uri !== trackToAdd.uri ? [existing] : [];
      playlistQueueRef.current = [trackToAdd, ...rest];
      playlistModeRef.current = true;
    }

    setQueuedTrack(trackToAdd);
  }, []);

  const handlePlayQueuedTrack = useCallback(
    async (track) => {
      if (!track?.uri) return;

      if (playlistModeRef.current) {
        const remaining = playlistQueueRef.current.filter((t) => t?.uri !== track.uri);
        playlistQueueRef.current = remaining;
        if (remaining.length === 0) playlistModeRef.current = false;
        setQueuedTrack(remaining[0] ?? null);
      } else {
        setQueuedTrack(null);
        queueSourceRef.current = null;
      }

      if (!deviceId) return;

      try {
        await fetch(
          `${SERVER_BASE}/api/play?uri=${encodeURIComponent(track.uri)}&device_id=${encodeURIComponent(deviceId)}`,
          { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} }
        );
      } catch (err) {
        console.error("Error playing queued track:", err);
      }
    },
    [accessToken, deviceId]
  );

  const handlePlayPlaylist = useCallback(
    async (playlistId) => {
      if (!accessToken) {
        console.warn("Cannot load playlist tracks without an access token.");
        return;
      }

      const loadId = Date.now();
      playlistLoadRef.current = loadId;
      playlistQueueRef.current = [];
      setPlayingPlaylistId(playlistId);

      try {
        const res = await fetch(
          `${SERVER_BASE}/api/playlist/${encodeURIComponent(playlistId)}/tracks`,
          { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} }
        );
        const data = await res.json();

        if (playlistLoadRef.current !== loadId) return;

        if (res.ok && Array.isArray(data?.tracks) && data.tracks.length > 0) {
          const tracks = data.tracks.filter((t) => t?.uri);
          if (tracks.length === 0) return;

          for (let i = tracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
          }

          const remainingTracks = tracks.slice(1);
          playlistQueueRef.current = remainingTracks;
          playlistModeRef.current = true;
          setQueuedTrack(remainingTracks[0] ?? null);

          if (!deviceId) return;

          await fetch(
            `${SERVER_BASE}/api/play?uri=${encodeURIComponent(tracks[0].uri)}&device_id=${encodeURIComponent(deviceId)}`,
            { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} }
          );
        }
      } catch (err) {
        console.error("Failed to play playlist:", err);
      } finally {
        if (playlistLoadRef.current === loadId) {
          setPlayingPlaylistId(null);
        }
      }
    },
    [accessToken, deviceId]
  );

  const handleTrackEnded = useCallback(async () => {
    if (autoAdvanceLockRef.current) return;

    const nextTrack = playlistQueueRef.current[0];
    if (nextTrack?.uri) {
      autoAdvanceLockRef.current = true;
      const remaining = playlistQueueRef.current.slice(1);
      playlistQueueRef.current = remaining;
      setQueuedTrack(remaining[0] ?? null);

      if (remaining.length === 0) {
        playlistModeRef.current = false;
      }

      try {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        if (onBeforeNextTrackRef.current) {
          try { await onBeforeNextTrackRef.current(); } catch { /* TTS must never block playback */ }
        }
        if (deviceId) {
          await fetch(
            `${SERVER_BASE}/api/play?uri=${encodeURIComponent(nextTrack.uri)}&device_id=${encodeURIComponent(deviceId)}`,
            { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} }
          );
        }
      } finally {
        window.setTimeout(() => {
          autoAdvanceLockRef.current = false;
        }, 1500);
      }
      return;
    }

    const nextInQueue = queuedTrackRef.current;
    if (!nextInQueue?.uri) return;

    autoAdvanceLockRef.current = true;
    setQueuedTrack(null);

    try {
      if (onBeforeNextTrackRef.current) {
        try { await onBeforeNextTrackRef.current(); } catch { /* TTS must never block playback */ }
      }
      await handlePlayTrack(nextInQueue);
    } finally {
      window.setTimeout(() => {
        autoAdvanceLockRef.current = false;
      }, 1500);
    }
  }, [accessToken, deviceId, handlePlayTrack]);

  return {
    selectedTrack,
    queuedTrack,
    isQueueLoading,
    playingPlaylistId,
    handleDeviceReady,
    handlePlayerTrackChange,
    handlePlayTrack,
    handleAddToQueue,
    handlePlayQueuedTrack,
    handlePlayPlaylist,
    handleTrackEnded,
  };
}
