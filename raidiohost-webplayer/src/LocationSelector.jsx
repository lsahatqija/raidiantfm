import { useEffect, useRef } from "react";
import "./LocationSelector.css";

export function LocationSelector({
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
  handleClearLocation,
}) {
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // Auto-focus the input when edit mode opens
  useEffect(() => {
    if (isEditingLocation) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isEditingLocation]);

  // Close on Escape key
  useEffect(() => {
    if (!isEditingLocation) return undefined;
    function onKeyDown(e) {
      if (e.key === "Escape") handleCancelEditLocation();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isEditingLocation, handleCancelEditLocation]);

  // Close on click outside
  useEffect(() => {
    if (!isEditingLocation) return undefined;
    function onMouseDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        handleCancelEditLocation();
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [isEditingLocation, handleCancelEditLocation]);

  const cityLabel = userLocation?.city || "";

  if (isEditingLocation) {
    return (
      <div className="location-selector" ref={containerRef}>
        <div className="location-edit-row">
          <input
            ref={inputRef}
            type="text"
            className="location-edit-input"
            placeholder="Search for a city…"
            value={locationQuery}
            disabled={isSavingLocation}
            onChange={(e) => handleLocationQueryChange(e.target.value)}
            aria-label="Search for your city"
            aria-autocomplete="list"
            aria-expanded={locationSuggestions.length > 0}
          />
          <button
            type="button"
            className="location-cancel-btn"
            onClick={handleCancelEditLocation}
            disabled={isSavingLocation}
          >
            Cancel
          </button>
        </div>
        <p className="location-consent">
          Optional: selecting a city lets RaidiantFM fetch local weather. Only the city label is stored.
        </p>

        {isLoadingLocationSuggestions && (
          <p className="location-status">Searching…</p>
        )}

        {isSavingLocation && (
          <p className="location-status">Saving…</p>
        )}

        {!isLoadingLocationSuggestions && !isSavingLocation && locationSuggestions.length > 0 && (
          <ul className="location-suggestions" role="listbox" aria-label="City suggestions">
            {locationSuggestions.map((s, i) => (
              <li
                key={`${s.displayName}-${i}`}
                className="location-suggestion-item"
                role="option"
                aria-selected="false"
                onClick={() => handleSelectLocation(s)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSelectLocation(s); }}
                tabIndex={0}
              >
                {s.displayName}
              </li>
            ))}
          </ul>
        )}

        {saveLocationError && (
          <p className="location-error">{saveLocationError}</p>
        )}
      </div>
    );
  }

  return (
    <div className="location-selector">
      <div className="location-view-row">
        {cityLabel ? (
          <span className="location-city">{cityLabel}</span>
        ) : (
          <span className="location-city location-city--empty">Set location</span>
        )}
        <button
          type="button"
          className="location-edit-trigger"
          onClick={handleEditLocation}
          aria-label="Edit location"
        >
          {cityLabel ? "Edit" : "Set"}
        </button>
        {cityLabel ? (
          <button
            type="button"
            className="location-edit-trigger"
            onClick={handleClearLocation}
            aria-label="Remove saved location"
          >
            Remove
          </button>
        ) : null}
      </div>
    </div>
  );
}
