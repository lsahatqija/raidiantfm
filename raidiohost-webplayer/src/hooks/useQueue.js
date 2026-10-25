import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../api/client";
import { MAX_RECENT_TRACKS } from "../utils/constants";
import { normalizeStoredTrack } from "../utils/trackUtils";
import { getUserStorage, setUserStorage } from "../utils/userStorage";

const QUEUED_TRACK_STORAGE_NAME = "queued-track";
const RECENT_TRACKS_STORAGE_NAME = "recent-tracks";

function loadDurableQueue(sessionKey) {
  const recentTracks = getUserStorage(sessionKey, RECENT_TRACKS_STORAGE_NAME, []);
  return {
    sessionKey,
    queuedTrack: getUserStorage(sessionKey, QUEUED_TRACK_STORAGE_NAME, null),
    recentTracks: Array.isArray(recentTracks) ? recentTracks : [],
  };
}

export function useQueue(sessionKey, { onBeforeNextTrack } = {}) {
  const sessionEpoch = useMemo(() => Symbol(sessionKey || "anonymous"), [sessionKey]);
  const [selectedTrackState, setSelectedTrackState] = useState({ sessionEpoch: null, track: null });
  const selectedTrack = selectedTrackState.sessionEpoch === sessionEpoch ? selectedTrackState.track : null;
  const setSelectedTrack = useCallback((value) => {
    setSelectedTrackState((current) => ({
      sessionEpoch,
      track: typeof value === "function"
        ? value(current.sessionEpoch === sessionEpoch ? current.track : null)
        : value,
    }));
  }, [sessionEpoch]);
  const onBeforeNextTrackRef = useRef(onBeforeNextTrack);
  useEffect(() => {
    onBeforeNextTrackRef.current = onBeforeNextTrack;
  }, [onBeforeNextTrack]);

  const [durableQueueState, setDurableQueueState] = useState(() => loadDurableQueue(sessionKey));
  const durableQueue = durableQueueState.sessionKey === sessionKey
    ? durableQueueState
    : loadDurableQueue(sessionKey);
  const { queuedTrack, recentTracks } = durableQueue;
  const setQueuedTrack = useCallback((value) => {
    if (!sessionKey) return;
    setDurableQueueState((current) => {
      const active = current.sessionKey === sessionKey ? current : loadDurableQueue(sessionKey);
      const queuedTrack = typeof value === "function" ? value(active.queuedTrack) : value;
      setUserStorage(sessionKey, QUEUED_TRACK_STORAGE_NAME, queuedTrack);
      return { ...active, queuedTrack };
    });
  }, [sessionKey]);
  const setRecentTracks = useCallback((value) => {
    if (!sessionKey) return;
    setDurableQueueState((current) => {
      const active = current.sessionKey === sessionKey ? current : loadDurableQueue(sessionKey);
      const recentTracks = typeof value === "function" ? value(active.recentTracks) : value;
      setUserStorage(sessionKey, RECENT_TRACKS_STORAGE_NAME, recentTracks);
      return { ...active, recentTracks };
    });
  }, [sessionKey]);
  const [queueLoadingEpoch, setQueueLoadingEpoch] = useState(null);
  const isQueueLoading = Boolean(sessionKey && queueLoadingEpoch === sessionEpoch);
  const [deviceState, setDeviceState] = useState({ sessionEpoch: null, id: null });
  const deviceId = deviceState.sessionEpoch === sessionEpoch ? deviceState.id : null;
  const [playingPlaylistState, setPlayingPlaylistState] = useState({ sessionEpoch: null, id: null });
  const playingPlaylistId = playingPlaylistState.sessionEpoch === sessionEpoch ? playingPlaylistState.id : null;

  const queuedTrackRef = useRef(queuedTrack);
  const recentTracksRef = useRef(recentTracks);
  const queueSourceRef = useRef(null);
  const autoAdvanceLockRef = useRef(false);
  const playlistQueueRef = useRef([]);
  const playlistLoadRef = useRef(0);
  const playlistModeRef = useRef(false);

  useEffect(() => {
    queuedTrackRef.current = queuedTrack;
    recentTracksRef.current = recentTracks;
  }, [queuedTrack, recentTracks]);

  useEffect(() => {
    queueSourceRef.current = null;
    autoAdvanceLockRef.current = false;
    playlistQueueRef.current = [];
    playlistLoadRef.current += 1;
    playlistModeRef.current = false;
  }, [sessionKey]);

  const addToRecentTracks = useCallback((track) => {
    const normalizedTrack = normalizeStoredTrack(track);
    if (!normalizedTrack?.uri) return;
    setRecentTracks((current) => {
      const deduped = current.filter(
        (item) => item?.uri !== normalizedTrack.uri && item?.id !== normalizedTrack.id
      );
      return [normalizedTrack, ...deduped].slice(0, MAX_RECENT_TRACKS);
    });
  }, [setRecentTracks]);

  const requestQueuedTrack = useCallback(async (sourceTrack) => {
    if (!sessionKey) return null;
    const sourceUri = sourceTrack?.uri || sourceTrack?.id;
    if (!sourceUri) {
      queueSourceRef.current = null;
      setQueuedTrack(null);
      return null;
    }

    queueSourceRef.current = sourceUri;
    setQueueLoadingEpoch(sessionEpoch);

    try {
      const data = await apiRequest('/api/queue-next', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track: sourceTrack,
          recentTracks: recentTracksRef.current,
        }),
      });

      const nextQueuedTrack = data?.track ? { ...data.track } : null;
      setQueuedTrack(nextQueuedTrack);
      return nextQueuedTrack;
    } catch (err) {
      console.error("Error finding similar queued track:", err);
      setQueuedTrack(null);
      return null;
    } finally {
      setQueueLoadingEpoch((current) => current === sessionEpoch ? null : current);
    }
  }, [sessionKey, sessionEpoch, setQueuedTrack]);

  const handleDeviceReady = useCallback((id) => {
    setDeviceState({ sessionEpoch, id });
  }, [sessionEpoch]);

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
    [addToRecentTracks, requestQueuedTrack, setSelectedTrack]
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
          await apiRequest(
            `/api/play?uri=${encodeURIComponent(nextTrack.uri)}&device_id=${encodeURIComponent(deviceId)}`,
          );
        } catch (err) {
          console.error("Error starting playback:", err);
        }

        await queuePromise;
      } else {
        if (!deviceId) return;
        try {
          await apiRequest(
            `/api/play?uri=${encodeURIComponent(nextTrack.uri)}&device_id=${encodeURIComponent(deviceId)}`,
          );
        } catch (err) {
          console.error("Error starting playback:", err);
        }
      }
    },
    [deviceId, requestQueuedTrack, setSelectedTrack]
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
  }, [setQueuedTrack]);

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
        await apiRequest(
          `/api/play?uri=${encodeURIComponent(track.uri)}&device_id=${encodeURIComponent(deviceId)}`,
        );
      } catch (err) {
        console.error("Error playing queued track:", err);
      }
    },
    [deviceId, setQueuedTrack]
  );

  const handlePlayPlaylist = useCallback(
    async (playlistId) => {
      if (!sessionKey) {
        return;
      }

      const loadId = Date.now();
      playlistLoadRef.current = loadId;
      playlistQueueRef.current = [];
      setPlayingPlaylistState({ sessionEpoch, id: playlistId });

      try {
        const data = await apiRequest(
          `/api/playlist/${encodeURIComponent(playlistId)}/items`,
        );

        if (playlistLoadRef.current !== loadId) return;

        if (Array.isArray(data?.tracks) && data.tracks.length > 0) {
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

          await apiRequest(
            `/api/play?uri=${encodeURIComponent(tracks[0].uri)}&device_id=${encodeURIComponent(deviceId)}`,
          );
        }
      } catch (err) {
        console.error("Failed to play playlist:", err);
      } finally {
        if (playlistLoadRef.current === loadId) {
          setPlayingPlaylistState((current) => (
            current.sessionEpoch === sessionEpoch ? { sessionEpoch, id: null } : current
          ));
        }
      }
    },
    [sessionKey, sessionEpoch, deviceId, setQueuedTrack]
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
          await apiRequest(
            `/api/play?uri=${encodeURIComponent(nextTrack.uri)}&device_id=${encodeURIComponent(deviceId)}`,
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
  }, [deviceId, handlePlayTrack, setQueuedTrack]);

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
