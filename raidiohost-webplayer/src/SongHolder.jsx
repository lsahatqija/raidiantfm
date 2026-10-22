import React from 'react';
import './SongHolder.css';

function truncate(str, max = 42) {
    if (!str || str.length <= max) return str;
    return str.slice(0, max) + '…';
}

export default function SongHolder({ track, onPlay, onAddToQueue, isActive = false }) {
    if (!track) {
        return <div className="song-holder">No track selected</div>;
    }

    const normalizedTrack = {
        uri: track.uri,
        name: track.name || 'Unknown track',
        artists: track.artists || 'Unknown Artist',
        album: track.album || 'Unknown Album',
        image: track.image || track.albumImage || track.album_image || track.album?.images?.[0]?.url,
    };

    return (
        <div className={`song-holder ${isActive ? 'song-holder-active' : ''}`}>
            {isActive ? (
                <span className="song-active-badge">Now Playing</span>
            ) : (
                <button
                    className="play-button"
                    type="button"
                    onClick={() => onPlay?.(track)}
                    aria-label={`Play ${normalizedTrack.name}`}
                    title="Play"
                >
                    <svg className="play-button-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M8 5.5v13l10-6.5z" fill="currentColor" />
                    </svg>
                </button>
            )}
            {normalizedTrack.image && (
                <img src={normalizedTrack.image} alt={normalizedTrack.name} className="song-image" />
            )}
            <div className="song-info">
                {/*<p className="song-label">Search Result</p>*/}
                <h2 className="song-name">{truncate(normalizedTrack.name)}</h2>
                <p className="song-artist">{truncate(normalizedTrack.artists)}</p>
                {normalizedTrack.album && <p className="song-album">{truncate(normalizedTrack.album)}</p>}
            </div>
            {!isActive && (
                <button
                    className="add-to-queue-button"
                    type="button"
                    onClick={() => onAddToQueue?.(track)}
                    aria-label={`Add ${normalizedTrack.name} to queue`}
                    title="Add to queue"
                >
                    +
                </button>
            )}
        </div>
    );
}