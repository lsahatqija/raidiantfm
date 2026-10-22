export const SERVER_BASE = import.meta.env.VITE_SERVER_BASE_URL;
export const QUEUED_TRACK_STORAGE_KEY = "raidiohost-queued-track";
export const RECENT_TRACKS_STORAGE_KEY = "raidiohost-recent-tracks";
export const AUTH_STORAGE_KEY = "raidiohost-auth";
export const MAX_RECENT_TRACKS = 20;
// How long (ms) to wait for a host blurb to arrive before skipping TTS and playing the next song
export const BLURB_WAIT_TIMEOUT_MS = 5000;
