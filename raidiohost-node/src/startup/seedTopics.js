const Topic = require('../models/topic.model');
const { logger } = require('../services/logger.service');

const SYSTEM_TOPICS = [
  // Top News
  {
    name: "Top News",
    slug: "top-news",
    category: "news",
    description: "Major headlines and important stories from around the world.",
    sources: [
      "https://feeds.bbci.co.uk/news/rss.xml",
      "https://feeds.npr.org/1001/rss.xml",
      "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml"
    ],
    isSystemTopic: true,
    isPublic: true,
    tones: ['serious', 'professional', 'urgent'],
  },
  // World News
  {
    name: "World News",
    slug: "world-news",
    category: "news",
    description: "International headlines, global events, diplomacy, and major world developments.",
    sources: [
      "https://feeds.bbci.co.uk/news/world/rss.xml",
      "https://feeds.npr.org/1004/rss.xml",
      "https://rss.nytimes.com/services/xml/rss/nyt/World.xml"
    ],
    isSystemTopic: true,
    isPublic: true,
    tones: ['serious', 'professional'],
  },
  // Local News
  {
    name: "Local News",
    slug: "local-news",
    category: "local",
    description: "Local and regional headlines from sources chosen for the user's area.",
    sources: [
      "https://news.google.com/rss/search?q={city}+news"
    ],
    requiresLocation: true,
    isPublic: true,
    tones: ['casual', 'happy'],
  },
  // Weather
  {
    name: "Weather",
    slug: "weather",
    category: "local",
    description: "Weather-related headlines, forecasts, climate alerts, and local conditions.",
    sources: [
      "https://wttr.in/{city}?format=j1",
      "https://news.google.com/rss/search?q=weather+forecast+{city}"
    ],
    requiresLocation: true,
    isSystemTopic: true,
    isPublic: true,
    tones: ['casual', 'curious'],
  },
  // Business
  {
    name: "Business",
    slug: "business",
    category: "news",
    description: "Business, companies, economy, work, and major market headlines.",
    sources: [
      "https://feeds.bbci.co.uk/news/business/rss.xml",
      "https://feeds.npr.org/1006/rss.xml",
      "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml"
    ],
    isSystemTopic: true,
    isPublic: true,
    tones: ['professional', 'curious', 'serious'],
  },
  // Personal Finance
  {
    name: "Personal Finance",
    slug: "personal-finance",
    category: "news",
    description: "Money, saving, household finance, consumer prices, and everyday financial decisions.",
    sources: [
      "https://www.nerdwallet.com/blog/feed/",
      "https://www.investopedia.com/feedbuilder/feed/getfeed/?feedName=rss_articles",
      "https://www.thebalancemoney.com/rss"
    ],
    isPublic: true,
    tones: ['casual', 'curious', 'professional'],
  },
  // Technology
  {
    name: "Technology",
    slug: "technology",
    category: "technology",
    description: "Consumer technology, apps, gadgets, platforms, and digital life.",
    sources: [
      "https://feeds.bbci.co.uk/news/technology/rss.xml",
      "https://www.theverge.com/rss/index.xml",
      "https://www.wired.com/feed/rss"
    ],
    isSystemTopic: true,
    isPublic: true,
    tones: ['curious', 'optimistic'],
  },
  // Science
  {
    name: "Science",
    slug: "science",
    category: "news",
    description: "Scientific discoveries, research, space, biology, physics, and innovation.",
    sources: [
      "https://rss.nytimes.com/services/xml/rss/nyt/Science.xml",
      "https://www.sciencedaily.com/rss/top/science.xml",
      "https://feeds.npr.org/1007/rss.xml"
    ],
    isSystemTopic: true,
    isPublic: true,
    tones: ['curious', 'serious'],
  },
  // Health
  {
    name: "Health",
    slug: "health",
    category: "news",
    description: "General health, medicine, wellness, public health, and medical research.",
    sources: [
      "https://feeds.bbci.co.uk/news/health/rss.xml",
      "https://rss.nytimes.com/services/xml/rss/nyt/Health.xml",
      "https://www.nih.gov/news-events/news-releases/feed"
    ],
    isPublic: true,
    tones: ['happy', 'serious'],
  },
  // Climate and Environment
  {
    name: "Climate and Environment",
    slug: "climate-environment",
    category: "news",
    description: "Climate, environment, conservation, sustainability, and energy transition.",
    sources: [
      "https://www.theguardian.com/environment/rss",
      "https://www.carbonbrief.org/feed/",
      "https://rss.nytimes.com/services/xml/rss/nyt/Climate.xml"
    ],
    isPublic: true,
    tones: ['serious', 'curious', 'urgent'],
  },

  {
    name: "Sports",
    slug: "sports",
    category: "sports",
    description: "General sports headlines, match updates, leagues, athletes, and major tournaments.",
    sources: [
      "https://feeds.bbci.co.uk/sport/rss.xml",
      "https://www.espn.com/espn/rss/news",
      "https://feeds.npr.org/1055/rss.xml",
      "https://news.google.com/rss/search?q={city}+sports+news"
    ],
    isSystemTopic: true,
    isPublic: true,
    tones: ['optimistic', 'happy'],
  },
  {
    name: "Football",
    slug: "football",
    category: "sports",
    description: "Football headlines, clubs, transfers, leagues, players, and match coverage.",
    sources: [
      "https://www.espn.com/espn/rss/soccer/news",
      "https://www.goal.com/en/feeds/news",
      "https://www.skysports.com/rss/12040"
    ],
    isPublic: true,
    tones: ['optimistic', 'happy'],
  },
  {
    name: "Basketball",
    slug: "basketball",
    category: "sports",
    description: "Basketball headlines, NBA updates, trades, games, and player stories.",
    sources: [
      "https://www.espn.com/espn/rss/nba/news",
      "https://www.nba.com/news/rss.xml",
      "https://basketball.realgm.com/rss/wiretap/0/0.xml"
    ],
    isPublic: true,
    tones: ['optimistic', 'happy'],
  },
  {
    name: "Tennis",
    slug: "tennis",
    category: "sports",
    description: "Tennis tournaments, players, rankings, Grand Slams, and match results.",
    sources: [
      "https://www.atptour.com/en/media/rss-feed/xml-feed",
      "https://www.wtatennis.com/rss/news",
      "https://www.tennis.com/rss"
    ],
    isPublic: true,
    tones: ['optimistic', 'professional', 'happy'],
  },
  {
    name: "Formula 1",
    slug: "formula-1",
    category: "sports",
    description: "Formula 1 races, teams, drivers, qualifying, and paddock news.",
    sources: [
      "https://www.formula1.com/en/latest/all.xml",
      "https://www.autosport.com/rss/f1/news/",
      "https://www.motorsport.com/rss/f1/news/"
    ],
    isPublic: true,
    tones: ['optimistic', 'curious'],
  },
  {
    name: "Entertainment",
    slug: "entertainment",
    category: "entertainment",
    description: "Celebrities, media, pop culture, entertainment industry news, and major releases.",
    sources: [
      "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml",
      "https://rss.nytimes.com/services/xml/rss/nyt/Arts.xml",
      "https://www.vulture.com/rss/index.xml"
    ],
    isSystemTopic: true,
    isPublic: true,
    tones: ['casual', 'happy'],
  },
  {
    name: "Movies",
    slug: "movies",
    category: "entertainment",
    description: "Film news, trailers, cinema releases, box office, and movie reviews.",
    sources: [
      "https://www.slashfilm.com/feed/",
      "https://www.indiewire.com/c/film/feed/",
      "https://screenrant.com/feed/"
    ],
    isPublic: true,
    tones: ['happy', 'casual', 'serious'],
  },
  {
    name: "TV and Streaming",
    slug: "tv-and-streaming",
    category: "entertainment",
    description: "TV shows, streaming platforms, series releases, reviews, and entertainment news.",
    sources: [
      "https://www.indiewire.com/c/television/feed/",
      "https://www.tvguide.com/rss/news/",
      "https://screenrant.com/tv/feed/"
    ],
    isPublic: true,
    tones: ['happy', 'casual'],
  },
  {
    name: "Music",
    slug: "music",
    category: "music",
    description: "Music news, artists, albums, festivals, tours, and the music industry.",
    sources: [
      "https://pitchfork.com/rss/news/",
      "https://www.nme.com/news/music/feed",
      "https://www.stereogum.com/feed/"
    ],
    isSystemTopic: true,
    isPublic: true,
    tones: ['casual', 'happy'],
  },
  {
    name: "Celebrity News",
    slug: "celebrity-news",
    category: "entertainment",
    description: "Celebrity headlines, public appearances, entertainment personalities, and pop culture moments.",
    sources: [
      "https://people.com/feed/",
      "https://www.etonline.com/news/rss",
      "https://www.eonline.com/syndication/feeds/rssfeeds/topstories.xml"
    ],
    isPublic: true,
    tones: ['casual', 'happy'],
  },
  {
    name: "Lifestyle",
    slug: "lifestyle",
    category: "entertainment",
    description: "Everyday living, habits, home, relationships, wellness, style, and culture.",
    sources: [
      "https://www.theguardian.com/lifeandstyle/rss",
      "https://www.apartmenttherapy.com/main.rss",
      "https://www.realsimple.com/rss"
    ],
    isPublic: true,
    tones: ['casual', 'happy'],
  },
  {
    name: "Food and Cooking",
    slug: "food-cooking",
    category: "entertainment",
    description: "Recipes, restaurants, cooking advice, food culture, and culinary trends.",
    sources: [
      "https://www.seriouseats.com/rss",
      "https://www.foodandwine.com/feed",
      "https://www.bonappetit.com/feed/rss"
    ],
    isPublic: true,
    tones: ['happy', 'casual'],
  },
  {
    name: "Travel",
    slug: "travel",
    category: "entertainment",
    description: "Destinations, travel ideas, tourism, aviation, hotels, and travel tips.",
    sources: [
      "https://www.lonelyplanet.com/news/rss.xml",
      "https://thepointsguy.com/feed/",
      "https://www.travelandleisure.com/feed"
    ],
    isPublic: true,
    tones: ['happy', 'optimistic', 'casual'],
  },
  {
    name: "Cars",
    slug: "cars",
    category: "entertainment",
    description: "Car news, reviews, electric vehicles, ownership, road travel, and the auto industry.",
    sources: [
      "https://www.autoblog.com/rss.xml",
      "https://www.motor1.com/rss/news/all/",
      "https://www.carscoops.com/feed/"
    ],
    isPublic: true,
    tones: ['optimistic', 'curious', 'casual'],
  },
  {
    name: "Fashion and Style",
    slug: "fashion-style",
    category: "entertainment",
    description: "Fashion trends, style advice, designers, red carpets, and clothing culture.",
    sources: [
      "https://www.vogue.com/feed/rss",
      "https://www.gq.com/feed/rss",
      "https://www.elle.com/rss/all.xml/"
    ],
    isPublic: true,
    tones: ['casual', 'happy'],
  },
  {
    name: "Books",
    slug: "books",
    category: "entertainment",
    description: "Books, authors, reading culture, publishing, and literary news.",
    sources: [
      "https://rss.nytimes.com/services/xml/rss/nyt/Books.xml",
      "https://feeds.npr.org/1032/rss.xml",
      "https://www.theguardian.com/books/rss"
    ],
    isPublic: true,
    tones: ['curious', 'serious', 'casual'],
  },
  {
    name: "Gaming",
    slug: "gaming",
    category: "gaming",
    description: "Video game news, major releases, consoles, studios, updates, and gaming culture.",
    sources: [
      "https://www.polygon.com/rss/index.xml",
      "https://www.gamespot.com/feeds/mashup/",
      "https://www.ign.com/rss"
    ],
    isPublic: true,
    tones: ['optimistic', 'happy'],
  },
  {
    name: "Pets and Animals",
    slug: "pets-animals",
    category: "entertainment",
    description: "Pet care, animal stories, wildlife, and human-interest animal news.",
    sources: [
      "https://www.petmd.com/rss",
      "https://www.akc.org/feed/",
      "https://www.nationalgeographic.com/animals/rss"
    ],
    isPublic: true,
    tones: ['happy', 'optimistic'],
  },
  {
    name: "Home and Garden",
    slug: "home-garden",
    category: "entertainment",
    description: "Home improvement, decorating, gardening, cleaning, and practical living.",
    sources: [
      "https://www.apartmenttherapy.com/main.rss",
      "https://www.bhg.com/rss",
      "https://www.gardenersworld.com/feed/"
    ],
    isPublic: true,
    tones: ['happy', 'casual', 'optimistic'],
  },
  {
    name: "Good News",
    slug: "good-news",
    category: "news",
    description: "Positive stories, uplifting headlines, community wins, and lighter human-interest news.",
    sources: [
      "https://www.goodnewsnetwork.org/feed/",
      "https://www.positive.news/feed/",
      "https://www.today.com/news/good-news/rss"
    ],
    isSystemTopic: true,
    isPublic: true,
    tones: ['optimistic', 'happy'],
  }
];

/**
 * Upsert system topics by slug. Safe to call on every startup — idempotent.
 */
async function seedSystemTopics() {
    try {
        await Promise.all(
            SYSTEM_TOPICS.map((data) =>
                Topic.findOneAndUpdate(
                    { slug: data.slug },
                    { $set: data },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                )
            )
        );
        logger.info({ event: 'system_topics_seeded' });
    } catch (err) {
        logger.warn({ event: 'system_topics_seed_failed', errorCode: err.code || err.name });
    }
}

module.exports = { seedSystemTopics };
