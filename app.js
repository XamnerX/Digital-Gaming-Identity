/*
Digital-Gaming-Identity
Author: Haiyi Xiao
Date: Mar 2026

Node/Express server for the Digital Gaming Identity project.

This server:
1. Serves the frontend from the /public folder
2. Resolves Steam profile URLs into numeric steamid64 values
3. Fetches a player's owned games and public profile summary
4. Fetches Steam store metadata for library analysis
5. Builds summary data for:
   - top played games / donut chart
   - genre/category statistics
   - simplified play-mode axis analysis
*/

import "dotenv/config";
import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;
const STEAM_API_KEY = process.env.STEAM_KEY;

app.use(express.static("public"));

/**
 * ---------------------------------------------------------------------------
 * Configuration constants
 * ---------------------------------------------------------------------------
 * Keeping project-wide values here makes the code easier to maintain and
 * avoids unexplained "magic numbers" inside the main logic.
 */
const DEFAULT_TOP_PLAYED_COUNT = 10;
const MAX_TOP_PLAYED_COUNT = 20;

const STORE_DETAILS_RETRY_COUNT = 1;
const STORE_DETAILS_RETRY_DELAY_MS = 400;

/**
 * Steam store metadata is requested repeatedly across many games.
 * We cache app detail results by appid so the same game is not fetched
 * again and again during a single server session.
 *
 * Null values are also cached. This prevents repeated retries for titles
 * that consistently fail or return no usable store metadata.
 */
const steamAppDetailsCache = new Map();

/**
 * ---------------------------------------------------------------------------
 * Category filtering and axis mapping
 * ---------------------------------------------------------------------------
 * Steam exposes many category labels, but not all of them are useful for the
 * kind of behavioural / play-mode reading used in this project.
 *
 * We intentionally keep only the categories that help describe:
 * - solo vs multiplayer play
 * - co-operative vs competitive play
 * - local vs online play
 *
 * This is a project-specific interpretive model, not an official Steam model.
 */
const TRACKED_PLAY_MODE_CATEGORIES = new Set([
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

const MAX_TRACKED_CATEGORY_COUNT = TRACKED_PLAY_MODE_CATEGORIES.size;

/**
 * Rules for translating Steam category labels into three simplified axes.
 *
 * Example:
 * - "Online Co-op" contributes to:
 *   1) the co-op side of the co-op vs PvP axis
 *   2) the online side of the local vs online axis
 *
 * This allows one category to express more than one behavioural tendency.
 */
const PLAY_MODE_AXIS_RULES = {
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
 * ---------------------------------------------------------------------------
 * Small utility helpers
 * ---------------------------------------------------------------------------
 */

/**
 * Pause for a short amount of time.
 * Used for lightweight retry spacing when the Steam store API is inconsistent.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create an Error object with an HTTP status attached.
 * This is cleaner than throwing plain objects and keeps route-level error
 * handling consistent.
 */
function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/**
 * Increment a numeric value stored in a Map.
 * If the key does not exist yet, it starts from 0.
 */
function incrementMapValue(map, key, amount = 1) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + amount);
}

/**
 * Convert a Map into a sorted array of { name, value } objects.
 * Results are sorted descending by numeric value.
 *
 * Example output:
 * [
 *   { name: "Indie", value: 12 },
 *   { name: "Adventure", value: 9 }
 * ]
 */
function mapToSortedStatItems(map, limit = null) {
  const items = Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  return limit == null ? items : items.slice(0, limit);
}

/**
 * Normalize labels from Steam metadata so comparisons stay consistent.
 * This mainly removes accidental whitespace and prevents null/undefined issues.
 */
function normalizeSteamLabel(value) {
  return String(value || "").trim();
}

/**
 * Fetch JSON from a URL and throw a useful HTTP-style error if the request fails.
 * This keeps fetch handling consistent across different Steam endpoints.
 */
async function fetchJson(url, errorContext) {
  const response = await fetch(url);

  if (!response.ok) {
    throw createHttpError(
      502,
      `${errorContext} failed with HTTP ${response.status}.`
    );
  }

  return response.json();
}

/**
 * ---------------------------------------------------------------------------
 * Request validation helpers
 * ---------------------------------------------------------------------------
 */

/**
 * Ensure the server has a Steam API key configured.
 * This is checked per request so the API returns a readable JSON error
 * instead of failing in a less clear way.
 */
function requireSteamApiKey() {
  if (!STEAM_API_KEY) {
    throw createHttpError(500, "Missing STEAM_KEY env var on server.");
  }
}

/**
 * Read and validate the required ?profile= query parameter.
 */
function getRequiredProfileQuery(req) {
  const profile = String(req.query.profile || "").trim();

  if (!profile) {
    throw createHttpError(400, "Missing ?profile=...");
  }

  return profile;
}

/**
 * Parse and clamp the optional ?top_n= query parameter.
 * This prevents invalid, negative, or extremely large values.
 */
function parseTopPlayedCount(rawValue) {
  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_TOP_PLAYED_COUNT;
  }

  return Math.min(Math.max(parsed, 1), MAX_TOP_PLAYED_COUNT);
}

/**
 * Standard route-level error response helper.
 */
function sendRouteError(res, error) {
  if (error?.status && error?.message) {
    return res.status(error.status).json({ error: error.message });
  }

  return res.status(500).json({
    error: "Server error",
    detail: String(error)
  });
}

/**
 * ---------------------------------------------------------------------------
 * Steam profile URL parsing
 * ---------------------------------------------------------------------------
 */

/**
 * Ensure the profile input can be treated as a full URL.
 * If the user pastes "steamcommunity.com/id/..." without protocol,
 * we prepend "https://" so URL parsing still works.
 */
function ensureUrlProtocol(profileInput) {
  if (/^https?:\/\//i.test(profileInput)) {
    return profileInput;
  }

  return `https://${profileInput}`;
}

/**
 * Parse a Steam community profile URL and extract either:
 * - a numeric steamid64 from /profiles/{steamid}
 * - a vanity name from /id/{vanityName}
 *
 * Supported examples:
 * - https://steamcommunity.com/profiles/7656119...
 * - https://steamcommunity.com/id/someVanityName
 *
 * This function also checks that the domain is actually Steam community,
 * which avoids accidentally accepting unrelated URLs with similar paths.
 */
function parseSteamProfileIdentifier(profileInput) {
  try {
    const normalizedInput = ensureUrlProtocol(profileInput);
    const url = new URL(normalizedInput);
    const hostname = url.hostname.toLowerCase();
    const pathParts = url.pathname.split("/").filter(Boolean);

    const isSteamCommunityHost =
      hostname === "steamcommunity.com" || hostname.endsWith(".steamcommunity.com");

    if (!isSteamCommunityHost) {
      return {
        error: "URL must be from steamcommunity.com."
      };
    }

    if (pathParts.length >= 2 && pathParts[0] === "profiles") {
      return { steamId: pathParts[1] };
    }

    if (pathParts.length >= 2 && pathParts[0] === "id") {
      return { vanityName: pathParts[1] };
    }

    return {
      error: "Not a Steam profile URL (need /profiles/... or /id/...)."
    };
  } catch {
    return { error: "Invalid URL." };
  }
}

/**
 * Resolve a Steam vanity name into a numeric steamid64 using Steam Web API.
 */
async function fetchSteamIdFromVanityUrl(vanityName) {
  const url = new URL(
    "https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/"
  );
  url.searchParams.set("key", STEAM_API_KEY);
  url.searchParams.set("vanityurl", vanityName);

  const json = await fetchJson(url, "ResolveVanityURL");
  const result = json?.response;

  if (result?.success === 1 && result?.steamid) {
    return result.steamid;
  }

  return null;
}

/**
 * Resolve either a /profiles/... URL or /id/... URL into a numeric steamid64.
 */
async function resolveSteamProfileToId(profileInput) {
  const parsedProfile = parseSteamProfileIdentifier(profileInput);

  if (parsedProfile.error) {
    throw createHttpError(400, parsedProfile.error);
  }

  if (parsedProfile.steamId) {
    return parsedProfile.steamId;
  }

  const steamId = await fetchSteamIdFromVanityUrl(parsedProfile.vanityName);

  if (!steamId) {
    throw createHttpError(
      404,
      "Could not resolve vanity URL to steamid (maybe typo)."
    );
  }

  return steamId;
}

/**
 * ---------------------------------------------------------------------------
 * Steam API fetch helpers
 * ---------------------------------------------------------------------------
 */

/**
 * Fetch the full owned-games response from Steam Web API.
 * We keep the full response object because it includes both:
 * - game_count
 * - games array
 */
async function fetchOwnedGamesResponse(steamId) {
  const url = new URL(
    "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/"
  );
  url.searchParams.set("key", STEAM_API_KEY);
  url.searchParams.set("steamid", steamId);
  url.searchParams.set("include_appinfo", "1");
  url.searchParams.set("include_played_free_games", "1");

  const json = await fetchJson(url, "GetOwnedGames");
  return json?.response || null;
}

/**
 * Fetch public player profile summary information from Steam Web API.
 */
async function fetchPlayerSummary(steamId) {
  const url = new URL(
    "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/"
  );
  url.searchParams.set("key", STEAM_API_KEY);
  url.searchParams.set("steamids", steamId);

  const json = await fetchJson(url, "GetPlayerSummaries");
  return json?.response?.players?.[0] || null;
}

/**
 * Fetch metadata for one Steam app from the Steam store API.
 *
 * Notes:
 * - The store API is sometimes less stable than the main Steam Web API.
 * - We retry once by default after a short delay.
 * - Results are cached per appid.
 */
async function fetchSteamStoreAppDetails(
  appId,
  retriesRemaining = STORE_DETAILS_RETRY_COUNT
) {
  if (!appId) return null;

  if (steamAppDetailsCache.has(appId)) {
    return steamAppDetailsCache.get(appId);
  }

  const url = new URL("https://store.steampowered.com/api/appdetails");
  url.searchParams.set("appids", String(appId));
  url.searchParams.set("l", "english");

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const json = await response.json();
    const appNode = json?.[appId];
    const appData = appNode?.success && appNode?.data ? appNode.data : null;

    if (!appData && retriesRemaining > 0) {
      await sleep(STORE_DETAILS_RETRY_DELAY_MS);
      return fetchSteamStoreAppDetails(appId, retriesRemaining - 1);
    }

    steamAppDetailsCache.set(appId, appData);
    return appData;
  } catch {
    if (retriesRemaining > 0) {
      await sleep(STORE_DETAILS_RETRY_DELAY_MS);
      return fetchSteamStoreAppDetails(appId, retriesRemaining - 1);
    }

    steamAppDetailsCache.set(appId, null);
    return null;
  }
}

/**
 * ---------------------------------------------------------------------------
 * Data shaping helpers
 * ---------------------------------------------------------------------------
 */

/**
 * Reduce public player data down to only the fields needed by the frontend.
 */
function formatPublicPlayerSummary(playerSummary) {
  if (!playerSummary) return null;

  return {
    personaname: playerSummary.personaname,
    avatar:
      playerSummary.avatarfull ||
      playerSummary.avatarmedium ||
      playerSummary.avatar,
    profileurl: playerSummary.profileurl
  };
}

/**
 * Convert category statistics into three simplified play-mode axes.
 *
 * Input example:
 * [
 *   { name: "Single-player", value: 10 },
 *   { name: "Online Co-op", value: 4 }
 * ]
 *
 * Output example:
 * [
 *   {
 *     axis: "singleMulti",
 *     leftLabel: "Single-player",
 *     rightLabel: "Multi-player",
 *     leftValue: 10,
 *     rightValue: 0
 *   },
 *   ...
 * ]
 */
function derivePlayModeAxes(categoryStatItems) {
  const axisScores = {
    singleMulti: { left: 0, right: 0 },
    coopPvp: { left: 0, right: 0 },
    localOnline: { left: 0, right: 0 }
  };

  for (const item of categoryStatItems || []) {
    const categoryName = item.name;
    const categoryValue = item.value || 0;
    const mappingRules = PLAY_MODE_AXIS_RULES[categoryName];

    if (!mappingRules) continue;

    for (const rule of mappingRules) {
      axisScores[rule.axis][rule.side] += categoryValue;
    }
  }

  return [
    {
      axis: "singleMulti",
      leftLabel: "Single-player",
      rightLabel: "Multi-player",
      leftValue: axisScores.singleMulti.left,
      rightValue: axisScores.singleMulti.right
    },
    {
      axis: "coopPvp",
      leftLabel: "Co-op",
      rightLabel: "PvP",
      leftValue: axisScores.coopPvp.left,
      rightValue: axisScores.coopPvp.right
    },
    {
      axis: "localOnline",
      leftLabel: "Local",
      rightLabel: "Online",
      leftValue: axisScores.localOnline.left,
      rightValue: axisScores.localOnline.right
    }
  ];
}

/**
 * Build library-level analysis data from a player's games.
 *
 * For each valid game:
 * 1. Fetch Steam store metadata
 * 2. Collect genres and categories
 * 3. Build:
 *    - count-based genre/category stats
 *    - playtime-weighted genre/category stats
 *    - simplified play-mode axis summaries
 *
 * This is intentionally processed serially rather than in large parallel batches.
 * It is slower, but gentler on the Steam store API and easier to reason about.
 */
async function buildLibraryAnalysis(games) {
  const genreCountMap = new Map();
  const categoryCountMap = new Map();

  const genrePlaytimeMap = new Map();
  const categoryPlaytimeMap = new Map();

  const uniqueCategoryNames = new Set();
  const skippedGames = [];
  const analysedGames = [];

  let usedGameCount = 0;
  let skippedGameCount = 0;

  for (const game of games) {
    const playtimeForeverMinutes = game.playtime_forever || 0;
    const appDetails = await fetchSteamStoreAppDetails(game.appid);

    if (!appDetails) {
      skippedGameCount += 1;

      skippedGames.push({
        appid: game.appid,
        name: game.name || "(unknown)",
        playtime_forever_min: playtimeForeverMinutes
      });

      continue;
    }

    usedGameCount += 1;

    const genreNames = Array.isArray(appDetails.genres)
      ? appDetails.genres
          .map((item) => normalizeSteamLabel(item.description))
          .filter(Boolean)
      : [];

    const categoryNames = Array.isArray(appDetails.categories)
      ? appDetails.categories
          .map((item) => normalizeSteamLabel(item.description))
          .filter(Boolean)
      : [];

    analysedGames.push({
      appid: game.appid,
      name: game.name || "(unknown)",
      playtime_forever_min: playtimeForeverMinutes,
      playtime_2weeks_min: game.playtime_2weeks || 0,
      genres: genreNames,
      categories: categoryNames
    });

    for (const genreName of genreNames) {
      incrementMapValue(genreCountMap, genreName, 1);
      incrementMapValue(genrePlaytimeMap, genreName, playtimeForeverMinutes);
    }

    for (const categoryName of categoryNames) {
      uniqueCategoryNames.add(categoryName);

      if (!TRACKED_PLAY_MODE_CATEGORIES.has(categoryName)) {
        continue;
      }

      incrementMapValue(categoryCountMap, categoryName, 1);
      incrementMapValue(
        categoryPlaytimeMap,
        categoryName,
        playtimeForeverMinutes
      );
    }
  }

  const countBasedGenres = mapToSortedStatItems(genreCountMap);
  const countBasedCategories = mapToSortedStatItems(
    categoryCountMap,
    MAX_TRACKED_CATEGORY_COUNT
  );

  const playtimeBasedGenres = mapToSortedStatItems(genrePlaytimeMap);
  const playtimeBasedCategories = mapToSortedStatItems(
    categoryPlaytimeMap,
    MAX_TRACKED_CATEGORY_COUNT
  );

  return {
    used_game_count: usedGameCount,
    skipped_game_count: skippedGameCount,
    skipped_games: skippedGames,
    games_meta: analysedGames,
    all_categories: Array.from(uniqueCategoryNames).sort(),

    count_based: {
      genres: countBasedGenres,
      categories: countBasedCategories
    },

    playtime_based: {
      genres: playtimeBasedGenres,
      categories: playtimeBasedCategories
    },

    mode_profile: {
      count_based_axes: derivePlayModeAxes(countBasedCategories),
      playtime_based_axes: derivePlayModeAxes(playtimeBasedCategories)
    }
  };
}

/**
 * ---------------------------------------------------------------------------
 * Routes
 * ---------------------------------------------------------------------------
 */

/**
 * GET /api/owned
 *
 * Returns the data used by the donut / top-playtime view:
 * - steamid
 * - public player summary
 * - total playtime
 * - top N played games
 * - remaining "other" ratio
 */
app.get("/api/owned", async (req, res) => {
  try {
    requireSteamApiKey();

    const profileInput = getRequiredProfileQuery(req);
    const topPlayedCount = parseTopPlayedCount(req.query.top_n);

    const steamId = await resolveSteamProfileToId(profileInput);

    const [ownedGamesResponse, playerSummary] = await Promise.all([
      fetchOwnedGamesResponse(steamId),
      fetchPlayerSummary(steamId)
    ]);

    const allOwnedGames = ownedGamesResponse?.games || [];
    const playedGames = allOwnedGames.filter(
      (game) => (game.playtime_forever || 0) > 0
    );

    const totalPlaytimeForeverMinutes = playedGames.reduce(
      (sum, game) => sum + (game.playtime_forever || 0),
      0
    );

    const playedGamesWithRatios = playedGames
      .map((game) => {
        const playtimeForeverMinutes = game.playtime_forever || 0;
        const playtimeRatio =
          totalPlaytimeForeverMinutes > 0
            ? playtimeForeverMinutes / totalPlaytimeForeverMinutes
            : 0;

        return {
          appid: game.appid,
          name: game.name,
          playtime_forever_min: playtimeForeverMinutes,
          playtime_2weeks_min: game.playtime_2weeks || 0,
          ratio: playtimeRatio
        };
      })
      .sort((a, b) => b.playtime_forever_min - a.playtime_forever_min);

    const selectedGames = playedGamesWithRatios.slice(0, topPlayedCount);

    const selectedRatioSum = selectedGames.reduce(
      (sum, game) => sum + (game.ratio || 0),
      0
    );

    const otherRatio = Math.max(0, 1 - selectedRatioSum);

    return res.json({
      steamid: steamId,
      total_game_count: ownedGamesResponse?.game_count ?? null,
      total_playtime_forever_min: totalPlaytimeForeverMinutes,

      player: formatPublicPlayerSummary(playerSummary),

      top_n: topPlayedCount,
      selected_count: selectedGames.length,
      selected_ratio_sum: selectedRatioSum,
      other_ratio: otherRatio,
      selected: selectedGames
    });
  } catch (error) {
    return sendRouteError(res, error);
  }
});

/**
 * GET /api/library-profile
 *
 * Returns library-level analysis data:
 * - processed game count
 * - skipped games
 * - genre/category summaries
 * - play-mode axis summaries
 */
app.get("/api/library-profile", async (req, res) => {
  try {
    requireSteamApiKey();

    const profileInput = getRequiredProfileQuery(req);
    const steamId = await resolveSteamProfileToId(profileInput);

    const ownedGamesResponse = await fetchOwnedGamesResponse(steamId);
    const allOwnedGames = ownedGamesResponse?.games || [];

    const validOwnedGames = allOwnedGames.filter(
      (game) => game && game.appid
    );

    const libraryAnalysis = await buildLibraryAnalysis(validOwnedGames);

    return res.json({
      steamid: steamId,
      total_game_count: ownedGamesResponse?.game_count ?? null,
      processed_game_count: validOwnedGames.length,
      ...libraryAnalysis
    });
  } catch (error) {
    return sendRouteError(res, error);
  }
});

/**
 * Start the local development server.
 */
app.listen(PORT, () => {
  console.log(`Open http://localhost:${PORT}`);
});