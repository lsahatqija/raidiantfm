import { useCallback, useEffect, useState } from "react";
import { SERVER_BASE } from "../utils/constants";

export function useTopics(accessToken) {
  const [allTopics, setAllTopics] = useState([]);
  const [subscribedIds, setSubscribedIds] = useState(new Set());
  const [loadedToken, setLoadedToken] = useState(null);
  const [togglingIds, setTogglingIds] = useState(new Set());

  const fetchTopics = useCallback(async () => {
    if (!accessToken) return;
    try {
      const headers = { Authorization: `Bearer ${accessToken}` };
      const [allRes, myRes] = await Promise.all([
        fetch(`${SERVER_BASE}/api/radio/topics`, { headers }),
        fetch(`${SERVER_BASE}/api/radio/my-topics`, { headers }),
      ]);

      if (allRes.ok) {
        const data = await allRes.json();
        setAllTopics(data.topics ?? []);
      }

      if (myRes.ok) {
        const data = await myRes.json();
        const ids = new Set(
          (data.topics ?? [])
            .filter((t) => t.enabled && t.topicId)
            .map((t) => t.topicId._id ?? t.topicId),
        );
        setSubscribedIds(ids);
      }
    } catch {
      // silent — topics are optional enrichment
    } finally {
      setLoadedToken(accessToken);
    }
  }, [accessToken]);

  useEffect(() => {
    queueMicrotask(fetchTopics);
  }, [fetchTopics]);

  const toggleTopic = useCallback(
    async (topicId, isCurrentlySubscribed) => {
      setTogglingIds((prev) => new Set([...prev, topicId]));
      try {
        const res = await fetch(`${SERVER_BASE}/api/radio/my-topics/${topicId}`, {
          method: isCurrentlySubscribed ? "DELETE" : "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          ...(!isCurrentlySubscribed
            ? { body: JSON.stringify({ preferredTone: "casual" }) }
            : {}),
        });

        if (res.ok) {
          setSubscribedIds((prev) => {
            const next = new Set(prev);
            if (isCurrentlySubscribed) {
              next.delete(topicId);
            } else {
              next.add(topicId);
            }
            return next;
          });
        }
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
    [accessToken],
  );

  const isLoading = Boolean(accessToken && loadedToken !== accessToken);

  return { allTopics, subscribedIds, isLoading, togglingIds, toggleTopic };
}
