import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import PlaylistHolder from "./PlaylistHolder";
import Search from "./Search";
import SongHolder from "./SongHolder";
import SpotifyPlayer from "./SpotifyPlayer";
import { useAuth } from "./hooks/useAuth";
import { usePlaylists } from "./hooks/usePlaylists";
import { useQueue } from "./hooks/useQueue";
import { useSearch } from "./hooks/useSearch";
import { useSpeech } from "./hooks/useSpeech";
import { useUserProfile } from "./hooks/useUserProfile";
import { getNameInitials } from "./utils/profileUtils";
import { BLURB_WAIT_TIMEOUT_MS, SERVER_BASE } from "./utils/constants";
import { TopicsDropdown } from "./TopicsDropdown";
import { VoiceSelector } from "./VoiceSelector";
import { LocationSelector } from "./LocationSelector";
import { ArticlePanel } from "./ArticlePanel";

function shuffleItems(items) {
  const nextItems = [...items];

  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [nextItems[index], nextItems[randomIndex]] = [nextItems[randomIndex], nextItems[index]];
  }

  return nextItems;
}

function App() {
  const { accessToken, handleLogin } = useAuth();
  const {
    speak, cancel, isSpeaking, setSpeechVolume,
    personalities, activeVoiceName, setActiveVoice,
    speechRate, setSpeechRate, speechPitch, setSpeechPitch,
    activePersonality, setActivePersonality,
  } = useSpeech();
  const activePersonalityRef = useRef(activePersonality);
  useEffect(() => { activePersonalityRef.current = activePersonality; }, [activePersonality]);
  const [playlistOrder, setPlaylistOrder] = useState([]);
  const preservedPlaylistScrollRef = useRef(null);
  const [hostBlurb, setHostBlurb] = useState(null);
  const [isBlurbLoading, setIsBlurbLoading] = useState(false);
  const blurbRequestIdRef = useRef(0);
  // Holds the Promise for the currently-in-flight blurb fetch; resolves with the text (or null)
  const blurbReadyRef = useRef(Promise.resolve(null));
  const [hostArticles, setHostArticles] = useState([]);
  const [isArticlePanelOpen, setIsArticlePanelOpen] = useState(false);

  const {
    userProfile,
    isProfileLoading,
    profileError,
    isEditingName,
    editNameValue,
    setEditNameValue,
    isSavingName,
    saveNameError,
    editNameInputRef,
    handleEditName,
    handleCancelEdit,
    handleSaveName,
    userLocation,
    isEditingLocation,
    locationQuery,
    locationSuggestions,
    isLoadingLocationSuggestions,
    isSavingLocation,
    saveLocationError,
    handleEditLocation,
    handleCancelEditLocation,
    handleLocationQueryChange,
    handleSelectLocation,
    saveLastVolume,
  } = useUserProfile(accessToken);

  // Keep speech volume in sync with the player volume slider
  useEffect(() => {
    if (userProfile?.lastVolume != null) {
      setSpeechVolume(userProfile.lastVolume);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.lastVolume]);

  const handleVolumeChange = useCallback((v) => {
    saveLastVolume(v);
    setSpeechVolume(v);
  }, [saveLastVolume, setSpeechVolume]);

  // Spoken between songs: wait up to BLURB_WAIT_TIMEOUT_MS for the blurb to arrive, then speak it
  const onBeforeNextTrack = useCallback(async () => {
    const blurbPromise = blurbReadyRef.current;
    const text = await Promise.race([
      blurbPromise,
      new Promise((resolve) => setTimeout(() => resolve(null), BLURB_WAIT_TIMEOUT_MS)),
    ]);
    if (text) {
      try {
        await speak(text);
      } catch {
        // TTS failures must never block playback
      }
    }
  }, [speak]);

  const {
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
  } = useQueue(accessToken, { onBeforeNextTrack });

  const {
    playlists,
    playlistsOffset,
    playlistsTotal,
    isPlaylistsLoading,
    playlistsRef,
    loadMorePlaylists,
    scrollPlaylists,
  } = usePlaylists(accessToken);

  const {
    searchResults,
    setSearchResults,
    hasManualSearch,
    isSuggestionsLoading,
    resultsRef,
    handleManualSearchStart,
    refreshSuggestions,
    scrollResults,
  } = useSearch(accessToken);

  const visiblePlaylists = playlists.filter(
    (playlist) => playlist.ownerId === userProfile?.spotifyId || playlist.collaborative,
  );

  const displayedPlaylists = useMemo(() => {
    const playlistsById = new Map(visiblePlaylists.map((playlist) => [playlist.id, playlist]));
    const ordered = playlistOrder
      .map((playlistId) => playlistsById.get(playlistId))
      .filter(Boolean);
    const orderedIds = new Set(ordered.map((playlist) => playlist.id));
    const missing = visiblePlaylists.filter((playlist) => !orderedIds.has(playlist.id));

    return [...ordered, ...missing];
  }, [playlistOrder, visiblePlaylists]);

  useLayoutEffect(() => {
    if (preservedPlaylistScrollRef.current === null || !playlistsRef.current) {
      return;
    }

    playlistsRef.current.scrollLeft = preservedPlaylistScrollRef.current;
    preservedPlaylistScrollRef.current = null;
  }, [displayedPlaylists, playlistsRef]);

  const fetchHostBlurb = useCallback(async ({ previousTrack, nextTrack } = {}) => {
    // Create a new promise for this request; onBeforeNextTrack races against it
    let resolveBlurb;
    blurbReadyRef.current = new Promise((resolve) => { resolveBlurb = resolve; });

    if (!accessToken) {
      resolveBlurb(null);
      return;
    }

    const requestId = ++blurbRequestIdRef.current;
    setIsBlurbLoading(true);
    let blurbText = null;
    try {
      const body = {};
      const savedUnits = typeof window !== 'undefined' ? window.localStorage.getItem('weatherUnits') : null;
      body.weatherUnits = savedUnits === 'imperial' ? 'imperial' : 'metric';
      if (previousTrack?.name || previousTrack?.artists) {
        body.previousTrack = { name: previousTrack.name, artist: previousTrack.artists };
      }
      if (nextTrack?.name || nextTrack?.artists) {
        body.nextTrack = { name: nextTrack.name, artist: nextTrack.artists };
      }
      body.hostPersonality = activePersonalityRef.current;
      const res = await fetch(`${SERVER_BASE}/api/radio/host-blurb`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (requestId !== blurbRequestIdRef.current) return;
      blurbText = data?.text ?? null;
      setHostBlurb(blurbText);
      if (Array.isArray(data?.articles) && data.articles.length > 0) {
        setHostArticles((prev) => [...data.articles, ...prev].slice(0, 30));
      }
    } catch {
      // blurb is optional — swallow errors silently
    } finally {
      resolveBlurb(blurbText);
      if (requestId === blurbRequestIdRef.current) {
        setIsBlurbLoading(false);
      }
    }
  }, [accessToken]);

  const handleTrackChangeWithBlurb = useCallback((track) => {
    const prevTrack = selectedTrack;
    handlePlayerTrackChange(track);
    fetchHostBlurb({ previousTrack: prevTrack, nextTrack: queuedTrack });
  }, [handlePlayerTrackChange, fetchHostBlurb, selectedTrack, queuedTrack]);

  const handleShufflePlaylists = () => {
    if (visiblePlaylists.length < 2) {
      return;
    }

    preservedPlaylistScrollRef.current = playlistsRef.current?.scrollLeft ?? 0;

    setPlaylistOrder((previousOrder) => {
      const baseOrder = previousOrder.length === displayedPlaylists.length
        ? previousOrder
        : displayedPlaylists.map((playlist) => playlist.id);

      return shuffleItems(baseOrder);
    });
  };


  return (
    <div>
      <header className="user-header" aria-live="polite">
        <div className="user-header-left">
          {accessToken ? (
            <section className="user-info-section" aria-label="User information">
              {userProfile?.profileImage ? (
                <img
                  className="profile-avatar"
                  src={userProfile.profileImage}
                  alt={`${userProfile.primaryName || "Spotify user"} profile`}
                />
              ) : (
                <div className="profile-avatar profile-avatar-fallback" aria-hidden="true">
                  {getNameInitials(userProfile?.primaryName)}
                </div>
              )}

              <div className="profile-details">
                {isEditingName ? (
                  <form
                    className="profile-edit-form"
                    onSubmit={(e) => { e.preventDefault(); handleSaveName(); }}
                  >
                    <input
                      ref={editNameInputRef}
                      className="profile-edit-input"
                      type="text"
                      value={editNameValue}
                      maxLength={64}
                      disabled={isSavingName}
                      onChange={(e) => setEditNameValue(e.target.value)}
                      aria-label="Edit display name"
                    />
                    <button
                      type="submit"
                      className="profile-edit-btn profile-edit-btn--save"
                      disabled={isSavingName}
                    >
                      {isSavingName ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      className="profile-edit-btn profile-edit-btn--cancel"
                      disabled={isSavingName}
                      onClick={handleCancelEdit}
                    >
                      Cancel
                    </button>
                    {saveNameError ? <p className="profile-error">{saveNameError}</p> : null}
                  </form>
                ) : (
                  <div className="profile-name-row">
                    <p className="profile-name">
                      {userProfile?.primaryName || (isProfileLoading ? "Loading..." : "Spotify listener")}
                    </p>
                    {userProfile && !isProfileLoading ? (
                      <button
                        type="button"
                        className="profile-edit-trigger"
                        onClick={handleEditName}
                        aria-label="Edit display name"
                      >
                        Edit
                      </button>
                    ) : null}
                  </div>
                )}
                {profileError ? <p className="profile-error">{profileError}</p> : null}
                <LocationSelector
                  userLocation={userLocation}
                  isEditingLocation={isEditingLocation}
                  locationQuery={locationQuery}
                  locationSuggestions={locationSuggestions}
                  isLoadingLocationSuggestions={isLoadingLocationSuggestions}
                  isSavingLocation={isSavingLocation}
                  saveLocationError={saveLocationError}
                  handleEditLocation={handleEditLocation}
                  handleCancelEditLocation={handleCancelEditLocation}
                  handleLocationQueryChange={handleLocationQueryChange}
                  handleSelectLocation={handleSelectLocation}
                />
              </div>

              <TopicsDropdown accessToken={accessToken} />
              <VoiceSelector
                activeVoiceName={activeVoiceName}
                onSelectVoice={setActiveVoice}
                speechRate={speechRate}
                onRateChange={setSpeechRate}
                speechPitch={speechPitch}
                onPitchChange={setSpeechPitch}
                personalities={personalities}
                activePersonality={activePersonality}
                onSelectPersonality={setActivePersonality}
                onTest={speak}
              />
            </section>
          ) : (
            <div className="user-info-placeholder" aria-hidden="true" />
          )}
        </div>

        <div className="user-header-center">
          <img className="header-minimal-logo" src="/logos/logo_text.png" alt="RaidiantFM logo" />
        </div>

        <div className="user-header-right">
          {accessToken ? (
            <div className="header-search-slot">
              <Search
                onResultsChange={setSearchResults}
                onManualSearchStart={handleManualSearchStart}
                accessToken={accessToken}
              />
            </div>
          ) : (
            <div className="header-search-placeholder" aria-hidden="true" />
          )}
        </div>
      </header>

      {!accessToken ? (
        <div className="login-section">
          <p>Log in with Spotify to start listening.</p>
          <button type="button" className="login-button" onClick={handleLogin}>
            Login with Spotify
          </button>
        </div>
      ) : (
        <>
          <SpotifyPlayer
            accessToken={accessToken}
            onReady={handleDeviceReady}
            queuedTrack={queuedTrack}
            isQueueLoading={isQueueLoading}
            onTrackChange={handleTrackChangeWithBlurb}
            onTrackEnded={handleTrackEnded}
            onPlayQueuedTrack={handlePlayQueuedTrack}
            initialVolume={userProfile?.lastVolume}
            onVolumeChange={handleVolumeChange}
            isSpeaking={isSpeaking}
            onCancelSpeech={cancel}
          />

          {(isBlurbLoading || hostBlurb) && (
            <div className="host-blurb-shell" aria-live="polite" aria-label="Radio host commentary">
              {isBlurbLoading ? (
                <div className="host-blurb-loading" aria-hidden="true" />
              ) : (
                <p className="host-blurb-text">{hostBlurb}</p>
              )}
            </div>
          )}

          <div className="playlist-section-shell">
            <div className="playlist-section-header">
              <p className="playlist-section-title">Your Playlists</p>
              <div className="playlist-section-controls">
                <button
                  className="carousel-button carousel-button--refresh"
                  type="button"
                  onClick={handleShufflePlaylists}
                  disabled={visiblePlaylists.length < 2}
                  aria-label="Shuffle playlist carousel"
                  title="Shuffle playlists"
                >
                  ⇄
                </button>
                <button
                  className="carousel-button"
                  type="button"
                  onClick={() => scrollPlaylists(-1)}
                  disabled={displayedPlaylists.length === 0}
                  aria-label="Scroll playlists left"
                >
                  ←
                </button>
                <button
                  className="carousel-button"
                  type="button"
                  onClick={() => scrollPlaylists(1)}
                  disabled={displayedPlaylists.length === 0}
                  aria-label="Scroll playlists right"
                >
                  →
                </button>
              </div>
            </div>
            <div ref={playlistsRef} className="playlist-results">
              {displayedPlaylists.map((pl) => (
                <PlaylistHolder
                  key={pl.id}
                  playlist={pl}
                  onPlay={handlePlayPlaylist}
                  isPlayingId={playingPlaylistId}
                />
              ))}
              {isPlaylistsLoading && (
                <div className="playlist-loading-card" aria-label="Loading playlists">…</div>
              )}
              {!isPlaylistsLoading && playlistsOffset < playlistsTotal && (
                <button
                  className="playlist-load-more"
                  type="button"
                  onClick={loadMorePlaylists}
                  aria-label="Load more playlists"
                >
                  More
                </button>
              )}
            </div>
          </div>

          <div className="song-results-shell">
            <div className="song-results-header">
              <p className="song-results-title">
                {hasManualSearch ? "Search Results" : "Recommended for You"}
              </p>
              <div className="song-results-controls">
                <button
                  className="carousel-button carousel-button--refresh"
                  type="button"
                  onClick={refreshSuggestions}
                  disabled={isSuggestionsLoading}
                  aria-label="Refresh recommendations"
                  title="Refresh recommendations"
                >
                  {isSuggestionsLoading ? "…" : "↻"}
                </button>
                <button
                  className="carousel-button"
                  type="button"
                  onClick={() => scrollResults(-1)}
                  disabled={searchResults.length === 0}
                  aria-label="Scroll search results left"
                >
                  ←
                </button>
                <button
                  className="carousel-button"
                  type="button"
                  onClick={() => scrollResults(1)}
                  disabled={searchResults.length === 0}
                  aria-label="Scroll search results right"
                >
                  →
                </button>
              </div>
            </div>

            <div ref={resultsRef} className="song-results">
              {searchResults.map((track) => (
                <SongHolder
                  key={track.id || track.uri || track.url || track.name}
                  track={track}
                  onPlay={handlePlayTrack}
                  onAddToQueue={handleAddToQueue}
                  isActive={
                    selectedTrack?.id === track.id ||
                    selectedTrack?.uri === track.uri
                  }
                />
              ))}
            </div>
          </div>
        </>
      )}
      
      <h1 className="app-logo-heading">
        <img className="app-logo-full" src="/logos/logo_full.png" alt="RaidiantFM" />
      </h1>

      <ArticlePanel
        articles={hostArticles}
        isOpen={isArticlePanelOpen}
        onToggle={() => setIsArticlePanelOpen((prev) => !prev)}
      />
    </div>    
  );
}

export default App;