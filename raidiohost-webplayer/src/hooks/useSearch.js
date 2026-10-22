import { useCallback, useEffect, useRef, useState } from "react";
import { SERVER_BASE } from "../utils/constants";

export function useSearch(accessToken) {
  const [searchResults, setSearchResults] = useState([]);
  const [hasManualSearch, setHasManualSearch] = useState(false);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [suggestionsKey, setSuggestionsKey] = useState(0);
  const resultsRef = useRef(null);

  useEffect(() => {
    if (!accessToken || hasManualSearch) {
      return undefined;
    }

    let ignore = false;

    const loadSuggestions = async () => {
      setIsSuggestionsLoading(true);
      try {
        const res = await fetch(`${SERVER_BASE}/api/suggestions`, {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        });
        const data = await res.json();
        if (!ignore) {
          setSearchResults(Array.isArray(data?.tracks) ? data.tracks : []);
        }
      } catch (err) {
        console.error("Failed to load suggestions:", err);
        if (!ignore) {
          setSearchResults([]);
        }
      } finally {
        if (!ignore) {
          setIsSuggestionsLoading(false);
        }
      }
    };

    loadSuggestions();

    return () => {
      ignore = true;
    };
  }, [accessToken, hasManualSearch, suggestionsKey]);

  const handleManualSearchStart = useCallback(() => {
    setHasManualSearch(true);
    setSearchResults([]);
  }, []);

  const refreshSuggestions = useCallback(() => {
    setHasManualSearch(false);
    setSuggestionsKey((k) => k + 1);
  }, []);

  const scrollResults = useCallback((direction) => {
    if (!resultsRef.current) return;
    resultsRef.current.scrollBy({
      left: direction * 224,
      behavior: "smooth",
    });
  }, []);

  return {
    searchResults,
    setSearchResults,
    hasManualSearch,
    isSuggestionsLoading,
    resultsRef,
    handleManualSearchStart,
    refreshSuggestions,
    scrollResults,
  };
}
