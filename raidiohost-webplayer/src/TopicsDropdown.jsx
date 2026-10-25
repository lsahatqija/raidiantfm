import { useEffect, useMemo, useRef, useState } from "react";
import { useTopics } from "./hooks/useTopics";
import "./TopicsDropdown.css";

const CATEGORY_LABELS = {
  news: "News",
  technology: "Tech",
  gaming: "Gaming",
  music: "Music",
  sports: "Sports",
  local: "Local",
  entertainment: "Entertainment",
  custom: "Custom",
};

export function TopicsDropdown({ sessionKey }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);
  const searchRef = useRef(null);
  const { allTopics, subscribedIds, isLoading, togglingIds, toggleTopic } =
    useTopics(sessionKey);

  const sortedTopics = useMemo(() => {
    const subscribed = allTopics.filter((t) => subscribedIds.has(t._id));
    const unsubscribed = allTopics.filter((t) => !subscribedIds.has(t._id));
    return [...subscribed, ...unsubscribed];
  }, [allTopics, subscribedIds]);

  const filteredTopics = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedTopics;
    return sortedTopics.filter((t) => t.name.toLowerCase().includes(q));
  }, [sortedTopics, search]);

  useEffect(() => {
    if (!isOpen) return;
    setTimeout(() => searchRef.current?.focus(), 0);
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setSearch("");
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        setSearch("");
        setIsOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const subscribedCount = subscribedIds.size;

  return (
    <div className="topics-dropdown" ref={containerRef}>
      <button
        type="button"
        className="topics-dropdown-trigger"
        onClick={() => {
          if (isOpen) setSearch("");
          setIsOpen((prev) => !prev);
        }}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={`Radio topics${subscribedCount > 0 ? `, ${subscribedCount} subscribed` : ""}`}
      >
        Topics
        {subscribedCount > 0 && (
          <span className="topics-dropdown-badge">{subscribedCount}</span>
        )}
        <span className="topics-dropdown-arrow" aria-hidden="true">
          {isOpen ? "▲" : "▼"}
        </span>
      </button>

      {isOpen && (
        <div
          className="topics-dropdown-panel"
          role="listbox"
          aria-label="Available radio topics"
          aria-multiselectable="true"
        >
          <p className="topics-dropdown-heading">Radio Topics</p>

          <div className="topics-search-wrapper">
            <input
              ref={searchRef}
              type="search"
              className="topics-search-input"
              placeholder="Search topics…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search topics"
            />
          </div>

          {isLoading ? (
            <p className="topics-dropdown-status">Loading topics…</p>
          ) : allTopics.length === 0 ? (
            <p className="topics-dropdown-status">No topics available.</p>
          ) : filteredTopics.length === 0 ? (
            <p className="topics-dropdown-status">No topics match "{search}".</p>
          ) : (
            <ul className="topics-list">
              {filteredTopics.map((topic) => {
                const subscribed = subscribedIds.has(topic._id);
                const toggling = togglingIds.has(topic._id);
                return (
                  <li
                    key={topic._id}
                    className="topics-list-item"
                    role="option"
                    aria-selected={subscribed}
                  >
                    <label className={`topics-list-label${toggling ? " topics-list-label--toggling" : ""}`}>
                      <input
                        type="checkbox"
                        className="topics-list-checkbox"
                        checked={subscribed}
                        disabled={toggling}
                        onChange={() => toggleTopic(topic._id, subscribed)}
                      />
                      <span className="topics-list-name">{topic.name}</span>
                      {topic.category && topic.category !== "custom" && (
                        <span className={`topics-list-category topics-list-category--${topic.category}`}>
                          {CATEGORY_LABELS[topic.category] ?? topic.category}
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
