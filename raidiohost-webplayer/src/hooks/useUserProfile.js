import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../api/client";

export function useUserProfile(sessionKey) {
  const [userProfile, setUserProfile] = useState(null);
  const [loadedSessionKey, setLoadedSessionKey] = useState(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [saveNameError, setSaveNameError] = useState("");
  const editNameInputRef = useRef(null);

  // Location state
  const [userLocation, setUserLocation] = useState(null);
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [locationQuery, setLocationQuery] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [isLoadingLocationSuggestions, setIsLoadingLocationSuggestions] = useState(false);
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [saveLocationError, setSaveLocationError] = useState("");
  const locationDebounceRef = useRef(null);
  const volumeSaveDebounceRef = useRef(null);

  useEffect(() => {
    if (!sessionKey) {
      return undefined;
    }

    let ignore = false;
    const controller = new AbortController();

    const loadProfile = async () => {
      setIsProfileLoading(true);
      setProfileError("");

      try {
        const appProfileData = await apiRequest('/api/users/me', {
          signal: controller.signal,
        });

        if (ignore) {
          return;
        }

        const primaryName =
          appProfileData?.username ||
          appProfileData?.spotifyDisplayName ||
          "Spotify listener";

        const secondaryName =
          appProfileData?.spotifyDisplayName &&
          appProfileData.spotifyDisplayName !== primaryName
            ? appProfileData.spotifyDisplayName
            : "";

        setUserProfile({
          primaryName,
          secondaryName,
          profileImage: "",
          spotifyId: appProfileData?.spotifyId || null,
          lastVolume:
            typeof appProfileData?.lastVolume === "number" &&
            appProfileData.lastVolume >= 0 &&
            appProfileData.lastVolume <= 1
              ? appProfileData.lastVolume
              : 0.5,
        });

        if (appProfileData?.location) {
          setUserLocation(appProfileData.location);
        }
        setLoadedSessionKey(sessionKey);
      } catch (err) {
        if (ignore || err?.name === "AbortError") {
          return;
        }

        console.error("Failed to load user profile:", err);
        setProfileError("Unable to load your profile right now.");
        setUserProfile((current) =>
          current || {
            primaryName: "Spotify listener",
            secondaryName: "",
            profileImage: "",
          }
        );
        setLoadedSessionKey(sessionKey);
      } finally {
        if (!ignore) {
          setIsProfileLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [sessionKey]);

  const handleEditName = useCallback(() => {
    setSaveNameError("");
    setEditNameValue(userProfile?.primaryName ?? "");
    setIsEditingName(true);
    setTimeout(() => editNameInputRef.current?.select(), 0);
  }, [userProfile?.primaryName]);

  const handleCancelEdit = useCallback(() => {
    setIsEditingName(false);
    setSaveNameError("");
  }, []);

  const handleSaveName = useCallback(async () => {
    const trimmed = editNameValue.trim();
    if (!trimmed) {
      setSaveNameError("Name cannot be empty.");
      return;
    }
    if (trimmed.length > 64) {
      setSaveNameError("Name must be 64 characters or fewer.");
      return;
    }
    if (trimmed === userProfile?.primaryName) {
      setIsEditingName(false);
      return;
    }

    setIsSavingName(true);
    setSaveNameError("");

    try {
      const data = await apiRequest('/api/users/me', {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmed }),
      });

      setUserProfile((prev) => ({
        ...prev,
        primaryName: data?.username ?? trimmed,
      }));
      setIsEditingName(false);
    } catch (err) {
      console.error("Failed to save username:", err);
      setSaveNameError(err?.message || "Failed to save. Please try again.");
    } finally {
      setIsSavingName(false);
    }
  }, [editNameValue, userProfile?.primaryName]);

  const handleEditLocation = useCallback(() => {
    setSaveLocationError("");
    setLocationQuery(userLocation?.city ?? "");
    setLocationSuggestions([]);
    setIsEditingLocation(true);
  }, [userLocation?.city]);

  const handleCancelEditLocation = useCallback(() => {
    setIsEditingLocation(false);
    setLocationQuery("");
    setLocationSuggestions([]);
    setSaveLocationError("");
    clearTimeout(locationDebounceRef.current);
  }, []);

  const handleLocationQueryChange = useCallback((q) => {
    setLocationQuery(q);
    clearTimeout(locationDebounceRef.current);

    if (q.trim().length < 2) {
      setLocationSuggestions([]);
      setIsLoadingLocationSuggestions(false);
      return;
    }

    setIsLoadingLocationSuggestions(true);
    locationDebounceRef.current = setTimeout(async () => {
      try {
        const data = await apiRequest(`/api/geocode?q=${encodeURIComponent(q.trim())}`);
        setLocationSuggestions(Array.isArray(data) ? data : []);
      } catch {
        setLocationSuggestions([]);
      } finally {
        setIsLoadingLocationSuggestions(false);
      }
    }, 500);
  }, []);

  const handleSelectLocation = useCallback(async (suggestion) => {
    setIsSavingLocation(true);
    setSaveLocationError("");
    clearTimeout(locationDebounceRef.current);

    try {
      const data = await apiRequest('/api/users/me/location', {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: suggestion.displayName,
          latitude: suggestion.latitude,
          longitude: suggestion.longitude,
        }),
      });

      setUserLocation(data?.location ?? { city: suggestion.displayName, latitude: suggestion.latitude, longitude: suggestion.longitude });
      setIsEditingLocation(false);
      setLocationQuery("");
      setLocationSuggestions([]);
    } catch (error) {
      setSaveLocationError(error?.message || "Failed to save location. Please try again.");
    } finally {
      setIsSavingLocation(false);
    }
  }, []);

  const saveLastVolume = useCallback((nextVolume) => {
    if (typeof nextVolume !== "number" || Number.isNaN(nextVolume)) {
      return;
    }

    const clampedVolume = Math.min(1, Math.max(0, nextVolume));

    setUserProfile((prev) =>
      prev
        ? {
            ...prev,
            lastVolume: clampedVolume,
          }
        : prev,
    );

    if (!sessionKey) {
      return;
    }

    clearTimeout(volumeSaveDebounceRef.current);
    volumeSaveDebounceRef.current = setTimeout(async () => {
      try {
        await apiRequest('/api/users/me', {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lastVolume: clampedVolume }),
        });
      } catch (err) {
        console.error("Failed to save last volume:", err);
      }
    }, 300);
  }, [sessionKey]);

  useEffect(() => {
    return () => {
      clearTimeout(volumeSaveDebounceRef.current);
    };
  }, []);

  return {
    userProfile: sessionKey === loadedSessionKey ? userProfile : null,
    setUserProfile,
    isProfileLoading: Boolean(sessionKey && isProfileLoading),
    profileError: sessionKey === loadedSessionKey ? profileError : "",
    isEditingName,
    editNameValue,
    setEditNameValue,
    isSavingName,
    saveNameError,
    editNameInputRef,
    handleEditName,
    handleCancelEdit,
    handleSaveName,
    userLocation: sessionKey === loadedSessionKey ? userLocation : null,
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
  };
}
