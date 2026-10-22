/**
 * Tone templates for the radio host blurb generator.
 *
 * Structure: TONE_TEMPLATES[tone][personality]
 *
 * Tones (content mood):
 *   casual | serious | happy | sad | curious | urgent | optimistic | professional
 *
 * Personalities (host delivery style):
 *   calm | smooth | deep | energetic | cool | witty | serious | playful | sardonic
 *
 * Each combination exposes:
 *   openers    — intro phrase; may contain {name} for the topic name
 *   connectors — linking phrases between headlines
 *   closers    — sign-off phrase; may contain {name}
 *   songPrevRef — references the previous song; may contain {song} and {artist}
 *   songNextRef — references the upcoming song; may contain {song} and {artist}
 */

const TONE_TEMPLATES = {
    casual:       require('./tones/casual'),
    serious:      require('./tones/serious'),
    happy:        require('./tones/happy'),
    sad:          require('./tones/sad'),
    curious:      require('./tones/curious'),
    urgent:       require('./tones/urgent'),
    optimistic:   require('./tones/optimistic'),
    professional: require('./tones/professional'),
};

module.exports = { TONE_TEMPLATES };
