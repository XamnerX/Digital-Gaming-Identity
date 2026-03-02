import 'dotenv/config';
import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

// 你的 Steam Web API Key：放在环境变量里
const STEAM_KEY = process.env.STEAM_KEY;

app.use(express.static("public"));

function extractSteamIdOrVanity(profileUrl) {
  // 支持：
  // https://steamcommunity.com/profiles/7656119...
  // https://steamcommunity.com/id/someVanityName
  try {
    const u = new URL(profileUrl);
    const parts = u.pathname.split("/").filter(Boolean); // ["profiles","..."] or ["id","..."]
    if (parts.length >= 2 && parts[0] === "profiles") return { steamid: parts[1] };
    if (parts.length >= 2 && parts[0] === "id") return { vanity: parts[1] };
    return { error: "Not a Steam profile URL (need /profiles/... or /id/...)" };
  } catch {
    return { error: "Invalid URL" };
  }
}

async function resolveVanityToSteamId(vanity) {
  // ResolveVanityURL 把 /id/xxx 转成 steamid64
  const url = new URL("https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/");
  url.searchParams.set("key", STEAM_KEY);
  url.searchParams.set("vanityurl", vanity);

  const r = await fetch(url);
  const j = await r.json();
  const resp = j?.response;

  if (resp?.success === 1 && resp?.steamid) return resp.steamid;
  return null;
}

async function getOwnedGames(steamid) {
  // include_appinfo=1 会带回游戏名（不需要你再查商店）
  const url = new URL("https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/");
  url.searchParams.set("key", STEAM_KEY);
  url.searchParams.set("steamid", steamid);
  url.searchParams.set("include_appinfo", "1");
  url.searchParams.set("include_played_free_games", "1");

  const r = await fetch(url);
  const j = await r.json();
  return j?.response || null;
}

// ✅ 你将来让前端调用的接口：
// /api/owned?profile=<Steam主页链接>
app.get("/api/owned", async (req, res) => {
  try {
    if (!STEAM_KEY) {
      return res.status(500).json({ error: "Missing STEAM_KEY env var on server." });
    }

    const profile = String(req.query.profile || "").trim();
    if (!profile) return res.status(400).json({ error: "Missing ?profile=..." });

    const parsed = extractSteamIdOrVanity(profile);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    let steamid = parsed.steamid;

    if (!steamid && parsed.vanity) {
      steamid = await resolveVanityToSteamId(parsed.vanity);
      if (!steamid) {
        return res.status(404).json({
          error: "Could not resolve vanity URL to steamid (maybe typo)."
        });
      }
    }

    const owned = await getOwnedGames(steamid);

    // // 如果对方“Game details”是 private，经常会出现 owned 为 null 或 games 为空
    // const games = owned?.games || [];
    // // 按时长排序（分钟）
    // games.sort((a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0));

    // // 只返回前 N 个，避免太大（你可以改）
    // const topN = Number(req.query.top || 30);
    // const top = games.slice(0, topN).map(g => ({
    //   appid: g.appid,
    //   name: g.name, // include_appinfo=1 才有
    //   playtime_forever_min: g.playtime_forever || 0,
    //   playtime_2weeks_min: g.playtime_2weeks || 0
    // }));

    // res.json({
    //   steamid,
    //   total_game_count: owned?.game_count ?? null,
    //   returned: top.length,
    //   top
    // });

const games = owned?.games || [];

// 1) 过滤掉 0 分钟的（可选但推荐）
const played = games.filter(g => (g.playtime_forever || 0) > 0);

// 2) 计算总时长（分钟）
const totalPlaytime = played.reduce((sum, g) => sum + (g.playtime_forever || 0), 0);

// 3) 算每个游戏占比 ratio，并排序
const withRatio = played
  .map(g => {
    const mins = g.playtime_forever || 0;
    const ratio = totalPlaytime > 0 ? mins / totalPlaytime : 0;
    return {
      appid: g.appid,
      name: g.name,
      playtime_forever_min: mins,
      playtime_2weeks_min: g.playtime_2weeks || 0,
      ratio // 0~1
    };
  })
  .sort((a, b) => b.playtime_forever_min - a.playtime_forever_min);

// 4) 按比例筛选：默认 5%（0.05），也允许你用 ?min_ratio=0.08 传参调整
const minRatio = Number(req.query.min_ratio || 0.05); // 0.05 = 5%

let selected = withRatio.filter(x => x.ratio >= minRatio);

// 5) 兜底：如果筛完一个都没有，就至少保留前 3 个（不然前端没东西画）
if (selected.length === 0) selected = withRatio.slice(0, 3);

// 6) 可选：限制最多返回多少个，避免有人特别平均导致返回太多
const maxN = Number(req.query.max || 20);
selected = selected.slice(0, maxN);

// 7) 返回“结构化结果”
res.json({
  steamid,
  total_game_count: owned?.game_count ?? null,
  total_playtime_forever_min: totalPlaytime,
  min_ratio: minRatio,
  selected_count: selected.length,
  selected
});
  } catch (e) {
    res.status(500).json({ error: "Server error", detail: String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`Open http://localhost:${PORT}`);
});