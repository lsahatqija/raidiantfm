import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../api/client";

const EMPTY_TOPIC_IDS = new Set();

export function useTopics(sessionKey) {
  const [allTopics, setAllTopics] = useState([]);
  const [subscribedIds, setSubscribedIds] = useState(new Set());
  const [loadedSessionKey, setLoadedSessionKey] = useState(null);
  const [togglingIds, setTogglingIds] = useState(new Set());
  const requestedSessionKeyRef = useRef(null);

  const fetchTopics = useCallback(async () => {
    if (!sessionKey) {
      requestedSessionKeyRef.current = null;
      return;
    }
    requestedSessionKeyRef.current = sessionKey;
    try {
      const [allData, myData] = await Promise.all([
        apiRequest('/api/radio/topics'),
        apiRequest('/api/radio/my-topics'),
      ]);

      if (requestedSessionKeyRef.current !== sessionKey) return;

      setAllTopics(allData?.topics ?? []);
      const ids = new Set(
        (myData?.topics ?? [])
          .filter((t) => t.enabled && t.topicId)
          .map((t) => t.topicId._id ?? t.topicId),
      );
      setSubscribedIds(ids);
    } catch {
      // silent — topics are optional enrichment
    } finally {
      if (requestedSessionKeyRef.current === sessionKey) {
        setLoadedSessionKey(sessionKey);
      }
    }
  }, [sessionKey]);

  useEffect(() => {
    queueMicrotask(fetchTopics);
  }, [fetchTopics]);

  const toggleTopic = useCallback(
    async (topicId, isCurrentlySubscribed) => {
      setTogglingIds((prev) => new Set([...prev, topicId]));
      try {
        await apiRequest(`/api/radio/my-topics/${topicId}`, {
          method: isCurrentlySubscribed ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          ...(!isCurrentlySubscribed
            ? { body: JSON.stringify({ preferredTone: "casual" }) }
            : {}),
        });

        setSubscribedIds((prev) => {
          const next = new Set(prev);
          if (isCurrentlySubscribed) {
            next.delete(topicId);
          } else {
            next.add(topicId);
          }
          return next;
        });
      } catch {
        // silent
      } finally {
        setTogglingIds((prev) => {
          const next = new Set(prev);
          next.delete(topicId);
          return next;
        });
      }
    },
    [],
  );

  const isLoading = Boolean(sessionKey && loadedSessionKey !== sessionKey);

  return {
    allTopics: sessionKey === loadedSessionKey ? allTopics : [],
    subscribedIds: sessionKey === loadedSessionKey ? subscribedIds : EMPTY_TOPIC_IDS,
    isLoading,
    togglingIds,
    toggleTopic,
  };
}
