import "dotenv/config";
import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;
const STEAM_KEY = process.env.STEAM_KEY;

app.use(express.static("public"));

/**
 * Cache Steam store app details by appid.
 * This avoids repeated requests for the same game metadata.
 * We also cache null results so failed lookups are not retried forever.
 */
const appDetailsCache = new Map();

/**
 * Category labels we want to keep for the play-mode profile.
 * Other categories may still be collected in all_categories,
 * but only these are counted for axis-based analysis.
 */
const USEFUL_CATEGORIES = new Set([
  "Single-player",
  "Multi-player",
  "Co-op",
  "Online Co-op",
  "LAN Co-op",
  "PvP",
  "Online PvP",
  "LAN PvP",
  "Shared/Split Screen",
  "Shared/Split Screen Co-op",
  "Shared/Split Screen PvP",
  "MMO"
]);

/**
 * Rules for mapping Steam categories onto three play-mode axes.
 * Each category can contribute to one or more axes.
 */
const CATEGORY_AXES = {
  "Single-player": [{ axis: "singleMulti", side: "left" }],
  "Multi-player": [{ axis: "singleMulti", side: "right" }],

  "Co-op": [{ axis: "coopPvp", side: "left" }],
  "PvP": [{ axis: "coopPvp", side: "right" }],

  "Online Co-op": [
    { axis: "coopPvp", side: "left" },
    { axis: "localOnline", side: "right" }
  ],
  "LAN Co-op": [
    { axis: "coopPvp", side: "left" },
    { axis: "localOnline", side: "left" }
  ],

  "Online PvP": [
    { axis: "coopPvp", side: "right" },
    { axis: "localOnline", side: "right" }
  ],
  "LAN PvP": [
    { axis: "coopPvp", side: "right" },
    { axis: "localOnline", side: "left" }
  ],

  "MMO": [
    { axis: "singleMulti", side: "right" },
    { axis: "localOnline", side: "right" }
  ],

  "Shared/Split Screen": [{ axis: "localOnline", side: "left" }],
  "Shared/Split Screen Co-op": [
    { axis: "coopPvp", side: "left" },
    { axis: "localOnline", side: "left" }
  ],
  "Shared/Split Screen PvP": [
    { axis: "coopPvp", side: "right" },
    { axis: "localOnline", side: "left" }
  ]
};

/**
 * Safely add a numeric amount into a Map counter.
 */
function addCount(map, key, amount = 1) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + amount);
}

/**
 * Convert a Map into a sorted array of { name, value } objects.
 * Sorts descending by value. If topN is provided, trims the result.
 */
function toSortedArray(map, topN = null) {
  const result = Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  return topN == null ? result : result.slice(0, topN);
}

/**
 * Normalize text values from Steam metadata.
 */
function normalizeName(value) {
  return String(value || "").trim();
}

/**
 * Parse a Steam community profile URL.
 * Supports:
 * - https://steamcommunity.com/profiles/7656119...
 * - https://steamcommunity.com/id/vanityName
 */
function extractSteamIdOrVanity(profileUrl) {
  try {
    const url = new URL(profileUrl);
    const parts = url.pathname.split("/").filter(Boolean);

    if (parts.length >= 2 && parts[0] === "profiles") {
      return { steamid: parts[1] };
    }

    if (parts.length >= 2 && parts[0] === "id") {
      return { vanity: parts[1] };
    }

    return {
      error: "Not a Steam profile URL (need /profiles/... or /id/...)."
    };
  } catch {
    return { error: "Invalid URL." };
  }
}

/**
 * Resolve a Steam vanity URL into a numeric steamid64.
 */
async function resolveVanityToSteamId(vanity) {
  const url = new URL(
    "https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/"
  );
  url.searchParams.set("key", STEAM_KEY);
  url.searchParams.set("vanityurl", vanity);

  const response = await fetch(url);
  const json = await response.json();
  const result = json?.response;

  if (result?.success === 1 && result?.steamid) {
    return result.steamid;
  }

  return null;
}

/**
 * Resolve either a /profiles/... URL or /id/... URL into a steamid.
 * Throws an error object with status/message so route handlers can respond cleanly.
 */
async function resolveProfileToSteamId(profile) {
  const parsed = extractSteamIdOrVanity(profile);

  if (parsed.error) {
    throw { status: 400, message: parsed.error };
  }

  if (parsed.steamid) {
    return parsed.steamid;
  }

  const steamid = await resolveVanityToSteamId(parsed.vanity);
  if (!steamid) {
    throw {
      status: 404,
      message: "Could not resolve vanity URL to steamid (maybe typo)."
    };
  }

  return steamid;
}

/**
 * Fetch the player's owned games from Steam Web API.
 * include_appinfo=1 gives basic game names directly in the response.
 */
async function getOwnedGames(steamid) {
  const url = new URL(
    "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/"
  );
  url.searchParams.set("key", STEAM_KEY);
  url.searchParams.set("steamid", steamid);
  url.searchParams.set("include_appinfo", "1");
  url.searchParams.set("include_played_free_games", "1");

  const response = await fetch(url);
  const json = await response.json();

  return json?.response || null;
}

/**
 * Fetch basic public player profile information.
 */
async function getPlayerSummary(steamid) {
  const url = new URL(
    "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/"
  );
  url.searchParams.set("key", STEAM_KEY);
  url.searchParams.set("steamids", steamid);

  const response = await fetch(url);
  const json = await response.json();

  return json?.response?.players?.[0] || null;
}

/**
 * Fetch store metadata for a game from Steam store API.
 * Retries once by default because the store endpoint can be inconsistent.
 */
async function getAppDetails(appid, retryCount = 1) {
  if (!appid) return null;

  if (appDetailsCache.has(appid)) {
    return appDetailsCache.get(appid);
  }

  const url = new URL("https://store.steampowered.com/api/appdetails");
  url.searchParams.set("appids", String(appid));
  url.searchParams.set("l", "english");

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const json = await response.json();
    const node = json?.[appid];
    const data = node?.success && node?.data ? node.data : null;

    if (!data && retryCount > 0) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return getAppDetails(appid, retryCount - 1);
    }

    appDetailsCache.set(appid, data);
    return data;
  } catch {
    if (retryCount > 0) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return getAppDetails(appid, retryCount - 1);
    }

    appDetailsCache.set(appid, null);
    return null;
  }
}

/**
 * Build the three play-mode axes from category data.
 * Input should be an array like:
 * [{ name: "Single-player", value: 10 }, ...]
 */
function buildPlayModeAxes(categoryItems) {
  const scores = {
    singleMulti: { left: 0, right: 0 },
    coopPvp: { left: 0, right: 0 },
    localOnline: { left: 0, right: 0 }
  };

  for (const item of categoryItems || []) {
    const categoryName = item.name;
    const value = item.value || 0;
    const rules = CATEGORY_AXES[categoryName];

    if (!rules) continue;

    for (const rule of rules) {
      scores[rule.axis][rule.side] += value;
    }
  }

  return [
    {
      axis: "singleMulti",
      leftLabel: "Single-player",
      rightLabel: "Multi-player",
      leftValue: scores.singleMulti.left,
      rightValue: scores.singleMulti.right
    },
    {
      axis: "coopPvp",
      leftLabel: "Co-op",
      rightLabel: "PvP",
      leftValue: scores.coopPvp.left,
      rightValue: scores.coopPvp.right
    },
    {
      axis: "localOnline",
      leftLabel: "Local",
      rightLabel: "Online",
      leftValue: scores.localOnline.left,
      rightValue: scores.localOnline.right
    }
  ];
}

/**
 * Build library-level genre/category statistics from owned games.
 * For each game, we fetch store metadata, then aggregate:
 * - count-based stats
 * - playtime-weighted stats
 * - simplified play-mode axis profile
 *
 * batchSize is currently 1, which is effectively serial.
 * This is slower but safer for Steam store requests.
 */
async function buildLibraryProfileStats(games) {
  const genreCountMap = new Map();
  const categoryCountMap = new Map();
  const genrePlaytimeMap = new Map();
  const categoryPlaytimeMap = new Map();

  const uniqueCategoriesSet = new Set();
  const skippedGames = [];
  const gamesMeta = [];

  let usedGameCount = 0;
  let skippedGameCount = 0;

  const batchSize = 1;

  for (let i = 0; i < games.length; i += batchSize) {
    const batch = games.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (game) => {
        try {
          const detail = await getAppDetails(game.appid);
          return { game, detail };
        } catch {
          return { game, detail: null };
        }
      })
    );

    for (const { game, detail } of batchResults) {
      const playtime = game.playtime_forever || 0;

      if (!detail) {
        skippedGameCount++;
        skippedGames.push({
          appid: game.appid,
          name: game.name || "(unknown)",
          playtime_forever_min: playtime
        });
        continue;
      }

      usedGameCount++;

      const genres = Array.isArray(detail.genres) ? detail.genres : [];
      const categories = Array.isArray(detail.categories)
        ? detail.categories
        : [];

      const genreNames = genres
        .map((item) => normalizeName(item.description))
        .filter(Boolean);

      const categoryNames = categories
        .map((item) => normalizeName(item.description))
        .filter(Boolean);

      gamesMeta.push({
        appid: game.appid,
        name: game.name || "(unknown)",
        playtime_forever_min: game.playtime_forever || 0,
        playtime_2weeks_min: game.playtime_2weeks || 0,
        genres: genreNames,
        categories: categoryNames
      });

      for (const name of genreNames) {
        addCount(genreCountMap, name, 1);
        addCount(genrePlaytimeMap, name, playtime);
      }

      for (const name of categoryNames) {
        uniqueCategoriesSet.add(name);

        if (!USEFUL_CATEGORIES.has(name)) {
          continue;
        }

        addCount(categoryCountMap, name, 1);
        addCount(categoryPlaytimeMap, name, playtime);
      }
    }
  }

  const countBasedGenres = toSortedArray(genreCountMap);
  const countBasedCategories = toSortedArray(categoryCountMap, 12);

  const playtimeBasedGenres = toSortedArray(genrePlaytimeMap);
  const playtimeBasedCategories = toSortedArray(categoryPlaytimeMap, 12);

  return {
    used_game_count: usedGameCount,
    skipped_game_count: skippedGameCount,
    skipped_games: skippedGames,
    games_meta: gamesMeta,
    all_categories: Array.from(uniqueCategoriesSet).sort(),

    count_based: {
      genres: countBasedGenres,
      categories: countBasedCategories
    },

    playtime_based: {
      genres: playtimeBasedGenres,
      categories: playtimeBasedCategories
    },

    mode_profile: {
      count_based_axes: buildPlayModeAxes(countBasedCategories),
      playtime_based_axes: buildPlayModeAxes(playtimeBasedCategories)
    }
  };
}

/**
 * API endpoint for donut chart data.
 * Returns:
 * - player summary
 * - total playtime
 * - top N played games
 * - remaining "other" ratio
 */
app.get("/api/owned", async (req, res) => {
  try {
    if (!STEAM_KEY) {
      return res
        .status(500)
        .json({ error: "Missing STEAM_KEY env var on server." });
    }

    const profile = String(req.query.profile || "").trim();
    if (!profile) {
      return res.status(400).json({ error: "Missing ?profile=..." });
    }

    const steamid = await resolveProfileToSteamId(profile);

    const [owned, player] = await Promise.all([
      getOwnedGames(steamid),
      getPlayerSummary(steamid)
    ]);

    const games = owned?.games || [];
    const playedGames = games.filter((game) => (game.playtime_forever || 0) > 0);

    const totalPlaytime = playedGames.reduce(
      (sum, game) => sum + (game.playtime_forever || 0),
      0
    );

    const gamesWithRatio = playedGames
      .map((game) => {
        const playtimeMinutes = game.playtime_forever || 0;
        const ratio = totalPlaytime > 0 ? playtimeMinutes / totalPlaytime : 0;

        return {
          appid: game.appid,
          name: game.name,
          playtime_forever_min: playtimeMinutes,
          playtime_2weeks_min: game.playtime_2weeks || 0,
          ratio
        };
      })
      .sort((a, b) => b.playtime_forever_min - a.playtime_forever_min);

    const topN = Number(req.query.top_n || 10);
    const selected = gamesWithRatio.slice(0, topN);

    const selectedRatioSum = selected.reduce(
      (sum, game) => sum + (game.ratio || 0),
      0
    );
    const otherRatio = Math.max(0, 1 - selectedRatioSum);

    return res.json({
      steamid,
      total_game_count: owned?.game_count ?? null,
      total_playtime_forever_min: totalPlaytime,

      player: player
        ? {
            personaname: player.personaname,
            avatar: player.avatarfull || player.avatarmedium || player.avatar,
            profileurl: player.profileurl
          }
        : null,

      top_n: topN,
      selected_count: selected.length,
      selected_ratio_sum: selectedRatioSum,
      other_ratio: otherRatio,
      selected
    });
  } catch (error) {
    if (error?.status && error?.message) {
      return res.status(error.status).json({ error: error.message });
    }

    return res.status(500).json({
      error: "Server error",
      detail: String(error)
    });
  }
});

/**
 * API endpoint for library-level analysis.
 * Builds genre/category summaries and play-mode profile axes.
 */
app.get("/api/library-profile", async (req, res) => {
  try {
    if (!STEAM_KEY) {
      return res
        .status(500)
        .json({ error: "Missing STEAM_KEY env var on server." });
    }

    const profile = String(req.query.profile || "").trim();
    if (!profile) {
      return res.status(400).json({ error: "Missing ?profile=..." });
    }

    const steamid = await resolveProfileToSteamId(profile);
    const owned = await getOwnedGames(steamid);
    const games = owned?.games || [];

    const validGames = games.filter((game) => game && game.appid);
    const stats = await buildLibraryProfileStats(validGames);

    return res.json({
      steamid,
      total_game_count: owned?.game_count ?? null,
      processed_game_count: validGames.length,
      ...stats
    });
  } catch (error) {
    if (error?.status && error?.message) {
      return res.status(error.status).json({ error: error.message });
    }

    return res.status(500).json({
      error: "Server error",
      detail: String(error)
    });
  }
});

app.listen(PORT, () => {
  console.log(`Open http://localhost:${PORT}`);
});