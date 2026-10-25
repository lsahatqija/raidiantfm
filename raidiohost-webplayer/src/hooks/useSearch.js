import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../api/client";

export function useSearch(sessionKey) {
  const [searchResults, setSearchResults] = useState([]);
  const [manualSearchSessionKey, setManualSearchSessionKey] = useState(null);
  const [resultsSessionKey, setResultsSessionKey] = useState(null);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [suggestionsKey, setSuggestionsKey] = useState(0);
  const resultsRef = useRef(null);
  const hasManualSearch = Boolean(sessionKey && manualSearchSessionKey === sessionKey);

  useEffect(() => {
    if (!sessionKey) {
      return undefined;
    }

    if (hasManualSearch) {
      return undefined;
    }

    let ignore = false;

    const loadSuggestions = async () => {
      setIsSuggestionsLoading(true);
      try {
        const data = await apiRequest('/api/suggestions');
        if (!ignore) {
          setSearchResults(Array.isArray(data?.tracks) ? data.tracks : []);
          setResultsSessionKey(sessionKey);
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
  }, [sessionKey, hasManualSearch, suggestionsKey]);

  const handleManualSearchStart = useCallback(() => {
    setManualSearchSessionKey(sessionKey);
    setResultsSessionKey(sessionKey);
    setSearchResults([]);
  }, [sessionKey]);

  const refreshSuggestions = useCallback(() => {
    setManualSearchSessionKey(null);
    setSuggestionsKey((k) => k + 1);
  }, []);

  const setScopedSearchResults = useCallback((results) => {
    setResultsSessionKey(sessionKey);
    setSearchResults(results);
  }, [sessionKey]);

  const scrollResults = useCallback((direction) => {
    if (!resultsRef.current) return;
    resultsRef.current.scrollBy({
      left: direction * 224,
      behavior: "smooth",
    });
  }, []);

  return {
    searchResults: sessionKey === resultsSessionKey ? searchResults : [],
    setSearchResults: setScopedSearchResults,
    hasManualSearch,
    isSuggestionsLoading,
    resultsRef,
    handleManualSearchStart,
    refreshSuggestions,
    scrollResults,
  };
}
