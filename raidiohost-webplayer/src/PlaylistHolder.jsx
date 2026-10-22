import React from 'react';
import './PlaylistHolder.css';

function truncate(str, max = 42) {
    if (!str || str.length <= max) return str;
    return str.slice(0, max) + '…';
}

export default function PlaylistHolder({ playlist, onPlay, isPlayingId }) {
    if (!playlist) return null;

    const isLoading = isPlayingId === playlist.id;

    return (
        <div className="playlist-holder">
            {playlist.imageUrl ? (
                <img
                    src={playlist.imageUrl}
                    alt={playlist.name}
                    className="playlist-cover"
                />
            ) : (
                <div className="playlist-cover playlist-cover-fallback" aria-hidden="true">♪</div>
            )}
            <div className="playlist-info">
                <h2 className="playlist-name">{truncate(playlist.name)}</h2>
                <p className="playlist-meta">{playlist.trackCount} tracks · {truncate(playlist.owner, 24)}</p>
            </div>
            <button
                className={`playlist-play-btn${isLoading ? ' playlist-play-btn--loading' : ''}`}
                type="button"
                onClick={() => !isLoading && onPlay?.(playlist.id)}
                aria-label={isLoading ? 'Loading…' : `Play ${playlist.name}`}
                title={isLoading ? 'Loading…' : 'Play'}
                disabled={isLoading}
            >
                {isLoading ? (
                    <span className="playlist-spinner" aria-hidden="true" />
                ) : (
                    <svg className="play-button-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M8 5.5v13l10-6.5z" fill="currentColor" />
                    </svg>
                )}
            </button>
        </div>
    );
}
