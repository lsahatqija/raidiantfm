/**
 * Personality options for the radio host AI blurb generation.
 * The `id` is sent to the server as `hostPersonality`.
 */

/** @typedef {{ id: string, label: string }} PersonalityOption */

/** @type {PersonalityOption[]} */
export const PERSONALITY_OPTIONS = [
  { id: "calm",      label: "Calm"      },
  { id: "smooth",    label: "Smooth"    },
  { id: "deep",      label: "Deep"      },
  { id: "energetic", label: "Energetic" },
  { id: "cool",      label: "Cool"      },
  { id: "witty",     label: "Witty"     },
  { id: "serious",   label: "Serious"   },
  { id: "playful",   label: "Playful"   },
  { id: "sardonic",  label: "Sardonic"  },
];

export const DEFAULT_PERSONALITY_ID = "smooth";

/**
 * Returns the personality option matching the given id,
 * falling back to smooth → first entry. Never returns undefined.
 * @param {string} id
 * @returns {PersonalityOption}
 */
export function getPersonalityById(id) {
  return (
    PERSONALITY_OPTIONS.find((p) => p.id === id) ??
    PERSONALITY_OPTIONS.find((p) => p.id === "smooth") ??
    PERSONALITY_OPTIONS[0]
  );
}
