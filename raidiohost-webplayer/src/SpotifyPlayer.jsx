import { useEffect, useRef, useState } from 'react';
import './SpotifyPlayer.css';

function clampVolume(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return 0.5;
    }

    return Math.min(1, Math.max(0, value));
}

function normalizePlayerTrack(track) {
    if (!track) {
        return null;
    }

    return {
        id: track.id || track.uri,
        uri: track.uri,
        name: track.name || 'Unknown track',
        artists: Array.isArray(track.artists) ? track.artists.map((artist) => artist.name).join(', ') : 'Unknown Artist',
        album: track.album?.name || 'Unknown Album',
        image: track.album?.images?.[0]?.url || null,
    };
}

export default function SpotifyPlayer({
    isAuthenticated,
    getSpotifyAccessToken,
    onReady,
    queuedTrack,
    isQueueLoading = false,
    onTrackChange,
    onTrackEnded,
    onPlayQueuedTrack,
    initialVolume,
    onVolumeChange,
    isSpeaking = false,
    onCancelSpeech,
}) {
    const playerRef = useRef(null);
    const lastTrackUriRef = useRef(null);
    const lastProgressRef = useRef({ trackUri: null, positionMs: 0, durationMs: 0 });
    const hasUserAdjustedVolumeRef = useRef(false);
    const volumeRef = useRef(clampVolume(initialVolume));
    const [playerState, setPlayerState] = useState(null);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState(null);
    const [volumeOverride, setVolumeOverride] = useState(null);
    const [positionMs, setPositionMs] = useState(0);
    const volume = volumeOverride ?? clampVolume(initialVolume);

    useEffect(() => {
        volumeRef.current = volume;
        if (!hasUserAdjustedVolumeRef.current) {
            playerRef.current?.setVolume(volume);
        }
    }, [volume]);

    const formatTime = (ms = 0) => {
        const totalSeconds = Math.max(0, Math.floor(ms / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    useEffect(() => {
        if (!isAuthenticated) return;

        const initPlayer = () => {
            const player = new window.Spotify.Player({
                name: 'RAIdio Host Web Player',
                getOAuthToken: async (cb) => {
                    try {
                        cb(await getSpotifyAccessToken());
                    } catch (tokenError) {
                        const requiresSignIn = tokenError?.status === 401
                            || tokenError?.code === 'reauth_required';
                        setError(requiresSignIn
                            ? 'Your Spotify session expired. Sign in again.'
                            : 'Unable to connect to Spotify. Try again shortly.');
                    }
                },
                volume: 0.5,
            });

            player.addListener('ready', ({ device_id }) => {
                console.log('Web Playback SDK ready with Device ID:', device_id);
                setIsReady(true);
                setError(null);
                player.setVolume(volumeRef.current).catch((setVolumeError) => {
                    console.error('Failed to apply initial volume:', setVolumeError);
                });
                onReady?.(device_id);
            });

            player.addListener('not_ready', ({ device_id }) => {
                console.log('Device ID has gone offline:', device_id);
                setIsReady(false);
            });

            player.addListener('initialization_error', ({ message }) => {
                console.error('Initialization error:', message);
                setError('Failed to initialize player. Spotify Premium is required.');
            });

            player.addListener('authentication_error', ({ message }) => {
                console.error('Authentication error:', message);
                setError('Authentication failed. Please log in again.');
            });

            player.addListener('account_error', ({ message }) => {
                console.error('Account error:', message);
                setError('Spotify Premium is required for web playback.');
            });

            player.addListener('player_state_changed', (state) => {
                if (state) {
                    setPlayerState(state);
                    setPositionMs(state.position ?? 0);
                }
            });

            player.connect();
            playerRef.current = player;
        };

        if (window.Spotify) {
            initPlayer();
        } else {
            window.onSpotifyWebPlaybackSDKReady = initPlayer;
            if (!document.querySelector('script[src="https://sdk.scdn.co/spotify-player.js"]')) {
                const script = document.createElement('script');
                script.src = 'https://sdk.scdn.co/spotify-player.js';
                script.async = true;
                document.body.appendChild(script);
            }
        }

        return () => {
            playerRef.current?.disconnect();
            playerRef.current = null;
        };
    }, [getSpotifyAccessToken, isAuthenticated, onReady]);

    useEffect(() => {
        const duration = playerState?.duration ?? playerState?.track_window?.current_track?.duration_ms ?? 0;

        if (!duration || playerState?.paused) return;

        const intervalId = window.setInterval(() => {
            setPositionMs((prev) => Math.min(prev + 1000, duration));
        }, 1000);

        return () => window.clearInterval(intervalId);
    }, [playerState]);

    const currentTrack = playerState?.track_window?.current_track;
    const isPaused = playerState?.paused ?? true;
    const durationMs = currentTrack?.duration_ms ?? 0;
    const remainingMs = Math.max(durationMs - positionMs, 0);

    useEffect(() => {
        if (currentTrack) {
            const trackName = currentTrack.name || 'Unknown Track';
            const artistName = Array.isArray(currentTrack.artists)
                ? currentTrack.artists.map((a) => a.name).join(', ')
                : 'Unknown Artist';
            document.title = `RaidiantFM - ${trackName} - ${artistName}`;
        } else {
            document.title = 'RaidiantFM';
        }
    }, [currentTrack]);

    useEffect(() => {
        const normalizedTrack = normalizePlayerTrack(currentTrack);

        if (!normalizedTrack?.uri) {
            lastTrackUriRef.current = null;
            return;
        }

        if (lastTrackUriRef.current !== normalizedTrack.uri) {
            lastTrackUriRef.current = normalizedTrack.uri;
            onTrackChange?.(normalizedTrack);
        }
    }, [currentTrack, onTrackChange]);

    useEffect(() => {
        const trackUri = currentTrack?.uri || null;
        const previousProgress = lastProgressRef.current;
        const wasNearEnd = previousProgress.trackUri === trackUri
            && previousProgress.durationMs > 0
            && previousProgress.positionMs >= previousProgress.durationMs - 1500;

        if (trackUri && isPaused && positionMs === 0 && wasNearEnd) {
            onTrackEnded?.(normalizePlayerTrack(currentTrack));
        }

        lastProgressRef.current = {
            trackUri,
            positionMs,
            durationMs,
        };
    }, [currentTrack, durationMs, isPaused, onTrackEnded, positionMs]);

    return (
        <section className="spotify-player-section">
            <p className="song-label">Player</p>

            {error && <p className="song-status song-error">{error}</p>}

            {!isAuthenticated && <p className="song-status">Log in with Spotify to start playing.</p>}

            {isAuthenticated && !isReady && !error && (
                <p className="song-status">Connecting to Spotify...</p>
            )}

            {isReady && (
                <div className="sdk-player-info">
                    {currentTrack?.album?.images?.[0]?.url ? (
                        <img
                            src={currentTrack.album.images[0].url}
                            alt={currentTrack.name}
                            className="sdk-player-album-art"
                        />
                    ) : (
                        <img
                            src="/logos/logo_full.png"
                            alt="No track selected"
                            className="sdk-player-album-art sdk-player-album-art-placeholder"
                        />
                    )}
                    <div className="sdk-player-track-details">
                        <p className="sdk-player-track-name">{currentTrack?.name ?? '—'}</p>
                        <p className="sdk-player-track-artist">
                            {currentTrack?.artists?.map((a) => a.name).join(', ') ?? 'Select a song to begin'}
                        </p>

                        <button
                            type="button"
                            className={`sdk-player-up-next ${queuedTrack ? 'sdk-player-up-next-actionable' : ''}`}
                            onClick={() => {
                                if (isSpeaking) {
                                    onCancelSpeech?.();
                                } else {
                                    queuedTrack && onPlayQueuedTrack?.(queuedTrack);
                                }
                            }}
                            disabled={!isSpeaking && !queuedTrack}
                            aria-label={isSpeaking ? 'Skip host, play next track' : queuedTrack ? `Play next track ${queuedTrack.name}` : 'No queued track available'}
                        >
                            <span className="sdk-player-up-next-label">Up Next</span>
                            {queuedTrack ? (
                                <p className="sdk-player-up-next-value">
                                    {queuedTrack.name} · {queuedTrack.artists}
                                </p>
                            ) : (
                                <p className="sdk-player-up-next-value sdk-player-up-next-empty">
                                    {isQueueLoading ? 'Finding a similar track...' : 'No queued track yet.'}
                                </p>
                            )}
                        </button>

                        <div className="sdk-player-progress">
                            <span className="sdk-player-time">{formatTime(positionMs)}</span>
                            <button
                                type="button"
                                className="sdk-control-button sdk-control-play"
                                onClick={() => playerRef.current?.togglePlay()}
                                disabled={!currentTrack || isSpeaking}
                                aria-label={isPaused ? 'Play' : 'Pause'}
                            >
                                {isPaused ? '▶' : '⏸'}
                            </button>
                            <input
                                type="range"
                                className="sdk-progress-slider"
                                min="0"
                                max={durationMs || 1}
                                step="1000"
                                value={Math.min(positionMs, durationMs || 1)}
                                disabled={!currentTrack}
                                style={{
                                    '--seek-progress': `${Math.round(
                                        (Math.min(positionMs, durationMs || 1) / (durationMs || 1)) * 100,
                                    )}%`,
                                }}
                                onChange={async (e) => {
                                    const nextPosition = Number(e.target.value);
                                    setPositionMs(nextPosition);
                                    try {
                                        await playerRef.current?.seek(nextPosition);
                                    } catch (seekError) {
                                        console.error('Seek error:', seekError);
                                    }
                                }}
                                aria-label="Track progress"
                            />
                            <span className="sdk-player-time">-{formatTime(remainingMs)}</span>
                        </div>
                    </div>

                    <div className="sdk-volume-control">
                        <input
                            type="range"
                            className="sdk-volume-slider"
                            min="0"
                            max="1"
                            step="0.01"
                            value={volume}
                            style={{ '--volume-progress': `${Math.round(volume * 100)}%` }}
                            onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                hasUserAdjustedVolumeRef.current = true;
                                setVolumeOverride(v);
                                playerRef.current?.setVolume(v);
                                onVolumeChange?.(v);
                            }}
                            aria-label="Volume"
                        />
                        <span
                            className="sdk-volume-label"
                            onClick={() => {
                                const newVol = volume > 0 ? 0 : 0.5;
                                hasUserAdjustedVolumeRef.current = true;
                                setVolumeOverride(newVol);
                                playerRef.current?.setVolume(newVol);
                                onVolumeChange?.(newVol);
                            }}
                            role="button"
                            tabIndex={0}
                            aria-label={volume === 0 ? 'Unmute' : 'Mute'}
                        >
                            {volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
                        </span>
                    </div>
                </div>
            )}
        </section>
    );
}
