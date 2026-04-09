let data = null;
let profileStats = null;
let persona = null;
let avatarImg = null;
let statusText = "";

/**
 * Update the current UI status text.
 * Used for both the canvas placeholder and the hint line above.
 */
function setStatus(msg) {
  statusText = msg || "";

  const hint = document.getElementById("hintText");
  if (hint) {
    hint.textContent = statusText || "Paste a Steam profile link and click Generate.";
  }
}

/**
 * Titles excluded from persona reading.
 * These entries are utility-like or not representative of play preference.
 */
const EXCLUDED_PERSONA_TITLES = new Set([
  "Bongo Cat",
  "VTube Studio",
  "Blender",
  "The Jackbox Megapicker",
  "Wallpaper Engine",
  "RPG Maker VX Ace",
  "OBS Studio",
  "MateEngine",
  "Virtual Cottage 2",
  "gogh: Focus with Your Avatar"
]);

/**
 * Only these Steam categories are used in the persona play-mode reading.
 */
const USEFUL_PERSONA_CATEGORIES = new Set([
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
 * Category-to-axis mapping for simplified play-mode analysis.
 * A single category can affect more than one axis.
 */
const CATEGORY_AXES = {
  "Single-player": [{ axis: "singleMulti", side: "left" }],
  "Multi-player": [{ axis: "singleMulti", side: "right" }],

  "Co-op": [{ axis: "coopPvp", side: "left" }],
  "Online Co-op": [
    { axis: "coopPvp", side: "left" },
    { axis: "localOnline", side: "right" }
  ],
  "LAN Co-op": [
    { axis: "coopPvp", side: "left" },
    { axis: "localOnline", side: "left" }
  ],

  "PvP": [{ axis: "coopPvp", side: "right" }],
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
 * Genre-to-feature mapping used when building the persona.
 */
const GENRE_FEATURE_MAP = {
  "RPG": { immersion: 0.8, challenge: 0.15 },
  "Adventure": { immersion: 0.75, challenge: 0.2 },
  "Strategy": { strategy: 1.0 },
  "Simulation": { strategy: 0.9 },
  "Action": { challenge: 1.0 },
  "Fighting": { challenge: 0.95, competition: 0.35 },
  "Racing": { challenge: 0.65, competition: 0.45 },
  "Sports": { competition: 0.7, social: 0.25 },
  "Casual": { immersion: 0.2 },
  "Design & Illustration": { strategy: 0.35 }
};

/**
 * Category-to-feature mapping used when building the persona.
 */
const CATEGORY_FEATURE_MAP = {
  "Single-player": { immersion: 0.45 },
  "Multi-player": { social: 0.2, competition: 0.15 },

  "Co-op": { social: 0.65 },
  "Online Co-op": { social: 0.65 },
  "LAN Co-op": { social: 0.55 },
  "Shared/Split Screen Co-op": { social: 0.55 },

  "PvP": { competition: 1.0 },
  "Online PvP": { competition: 1.0 },
  "LAN PvP": { competition: 0.9 },
  "Shared/Split Screen PvP": { competition: 0.85 },

  "MMO": { social: 0.35, dedication_hint: 0.2 },
  "Shared/Split Screen": { social: 0.25 }
};

const CORE_FEATURES = [
  "immersion",
  "strategy",
  "challenge",
  "social",
  "competition",
  "variety"
];

/**
 * Return canvas height based on whether data has been loaded.
 */
function getCanvasHeight() {
  return data ? 1480 : Math.max(window.innerHeight - 120, 720);
}

/**
 * Keep the canvas width/height synced with the page wrapper.
 */
function syncCanvasSize() {
  const wrap = document.getElementById("canvasWrap");
  resizeCanvas(wrap.clientWidth - 24, getCanvasHeight());
}

function setup() {
  const wrap = document.getElementById("canvasWrap");
  const canvasWidth = wrap.clientWidth - 24;
  const canvasHeight = getCanvasHeight();

  const cnv = createCanvas(canvasWidth, canvasHeight);
  cnv.parent("canvasWrap");

  angleMode(RADIANS);
  textFont("system-ui");

  setStatus(statusText);

  document.getElementById("go").onclick = loadData;
}

/**
 * Fetch both datasets, then rebuild the visual output and persona reading.
 */
async function loadData() {
  const profile = document.getElementById("profile").value.trim();

  if (!profile) {
    setStatus("Please paste a Steam profile link");
    return;
  }

  setStatus("Fetching...");
  data = null;
  profileStats = null;
  persona = null;
  avatarImg = null;
  syncCanvasSize();

  try {
    const ownedUrl = `/api/owned?top_n=10&profile=${encodeURIComponent(profile)}`;
    const profileUrl = `/api/library-profile?profile=${encodeURIComponent(profile)}`;

    const [ownedRes, profileRes] = await Promise.all([
      fetch(ownedUrl),
      fetch(profileUrl)
    ]);

    const ownedJson = await ownedRes.json();
    const profileJson = await profileRes.json();

    if (ownedJson.error) {
      setStatus(`Error: ${ownedJson.error}`);
      syncCanvasSize();
      return;
    }

    if (profileJson.error) {
      setStatus(`Error: ${profileJson.error}`);
      syncCanvasSize();
      return;
    }

    data = ownedJson;
    profileStats = profileJson;

    if (ownedJson.player?.avatar) {
      loadImage(
        ownedJson.player.avatar,
        (img) => {
          avatarImg = img;
        },
        () => {
          avatarImg = null;
        }
      );
    }

    persona = buildPersona(data, profileStats);

    const totalHours = Math.round((ownedJson.total_playtime_forever_min || 0) / 60);
    setStatus(
      `OK: top ${ownedJson.selected_count}, total ${totalHours} hours | ` +
      `metadata ${profileJson.used_game_count}/${profileJson.processed_game_count} ` +
      `(skipped ${profileJson.skipped_game_count})`
    );

    syncCanvasSize();
  } catch (error) {
    setStatus(`Fetch failed: ${String(error)}`);
    data = null;
    profileStats = null;
    persona = null;
    syncCanvasSize();
  }
}

function windowResized() {
  syncCanvasSize();
}

function draw() {
  background(235);

  const layout = getLayout();
  drawPage(layout);

  if (!data) {
    drawPlaceholder(layout);
    return;
  }

  drawHeaderCard(layout.header, persona, data);

  const slices = buildSlicesWithOther(data.selected);
  drawMiddleSection(layout.middle, slices);
  drawGenreRow(layout.genreRow, profileStats);
  drawBottomCharts(layout.bottomCharts, profileStats, persona);
  drawFooterSection(layout.footer, persona);
}

/**
 * Draw a simple placeholder view before valid data is loaded.
 */
function drawPlaceholder(layout) {
  const cx = layout.page.x + layout.page.w * 0.5;
  const cy = layout.page.y + layout.page.h * 0.46;
  const msg = statusText || "Paste a Steam profile link to begin";
  
  push();
  translate(cx, cy);

  stroke(0, 10);
  strokeWeight(2);
  noFill();
  circle(0, 0, 260);
  circle(0, 0, 160);

  noStroke();
  fill(0, 70);
  textAlign(CENTER, CENTER);
  textSize(14);
  text(msg, 0, 0);

  pop();
}

/**
 * Build the main page layout boxes used by all drawing functions.
 */
function getLayout() {
  const pageW = Math.min(1180, width - 80);
  const pageX = (width - pageW) / 2;
  const pageY = 40;

  const collapsedH = 620;
  const expandedH = 1280;
  const pageH = data ? expandedH : collapsedH;

  const headerLeft = pageX + 38;
  const headerRight = pageX + pageW - 38;
  const headerW = headerRight - headerLeft;

  const sectionLeft = headerLeft + 20;
  const sectionRight = headerRight - 20;
  const sectionW = sectionRight - sectionLeft;

  const gap = 30;

  const headerY = pageY + 22;
  const headerH = 240;

  const middleY = headerY + headerH + 30;
  const middleH = 320;

  const genreRowY = middleY + middleH + gap;
  const genreRowH = 220;

  const bottomChartsY = genreRowY + genreRowH + gap;
  const bottomChartsH = 170;

  const footerY = bottomChartsY + bottomChartsH + 20;
  const footerH = 80;

  return {
    page: { x: pageX, y: pageY, w: pageW, h: pageH },
    header: { x: headerLeft, y: headerY, w: headerW, h: headerH },
    middle: { x: sectionLeft, y: middleY, w: sectionW, h: middleH },
    genreRow: { x: sectionLeft, y: genreRowY, w: sectionW, h: genreRowH },
    bottomCharts: { x: sectionLeft, y: bottomChartsY, w: sectionW, h: bottomChartsH },
    footer: { x: sectionLeft, y: footerY, w: sectionW, h: footerH }
  };
}

function drawPage(layout) {
  noStroke();
  fill(252);
  rect(layout.page.x, layout.page.y, layout.page.w, layout.page.h, 18);
}

function drawMiddleHeader(box) {
  // fill(20);
  // noStroke();
  // textAlign(LEFT, TOP);

  // textSize(18);
  // text("Steam Time Donut", box.x, box.y);

  // fill(90);
  // textSize(12);
  // text(statusText, box.x, box.y + 28);
}

/**
 * Draw the top player identity and persona summary card.
 */
function drawHeaderCard(box, personaData, ownedData) {
  const x = box.x;
  const y = box.y;
  const w = box.w;
  const h = box.h;

  push();

  noStroke();
  fill(248);
  rect(x, y, w, h, 18);

  const avatarSize = 220;
  const avatarX = x + 20;
  const avatarY = y + 24;

  drawAvatarBlock({ x: avatarX, y: avatarY, size: avatarSize });

  const tx = avatarX + avatarSize + 32;
  const textW = w - (tx - x) - 24;
  let ty = y + 30;

  fill(82);
  textAlign(LEFT, TOP);
  textSize(18);
  text(ownedData?.player?.personaname || "Unknown Player", tx, ty);

  ty += 42;

  fill(24);
  textSize(30);
  text(personaData?.archetypeName || "Archetype", tx, ty);

  ty += 54;

  fill(72);
  textSize(13);
  text(`Top genres: ${personaData?.topGenres?.join(", ") || ""}`, tx, ty, textW, 20);

  ty += 24;
  text(`Top games: ${personaData?.topGames?.join(", ") || ""}`, tx, ty, textW, 20);

  ty += 34;

  if (personaData?.detailLines?.length) {
    fill(88);
    textSize(12);

    for (let i = 0; i < Math.min(3, personaData.detailLines.length); i++) {
      text(personaData.detailLines[i], tx, ty, textW, 18);
      ty += 22;
    }
  }

  pop();
}

function drawAvatarBlock(box) {
  const { x, y, size } = box;

  push();

  noFill();
  stroke(205);
  strokeWeight(2);
  rect(x, y, size, size, 20);

  if (avatarImg) {
    drawingContext.save();
    drawingContext.beginPath();
    drawingContext.roundRect(x + 6, y + 6, size - 12, size - 12, 16);
    drawingContext.clip();
    image(avatarImg, x + 6, y + 6, size - 12, size - 12);
    drawingContext.restore();
  } else {
    noStroke();
    fill(32);
    rect(x + 6, y + 6, size - 12, size - 12, 16);

    fill(240);
    textAlign(CENTER, CENTER);
    textSize(68);
    text("?", x + size / 2, y + size / 2);
  }

  pop();
}

/**
 * Middle section layout: legend on the left, donut on the right.
 */
function drawMiddleSection(box, slices) {
  const gap = 26;
  const leftW = box.w * 0.42;
  const rightW = box.w * 0.58;

  const leftBox = {
    x: box.x,
    y: box.y + 6,
    w: leftW - gap / 2,
    h: box.h - 12
  };

  const rightBox = {
    x: box.x + leftW + gap / 2,
    y: box.y,
    w: rightW - gap / 2,
    h: box.h
  };

  drawLegendInBox(slices, leftBox);
  drawDonutInBox(slices, rightBox);
}

function drawLegendInBox(slices, box) {
  const x = box.x;
  const blockTopOffset = 16;
  const titleToListGap = 30;
  const lineH = 22;

  let y = box.y + blockTopOffset;
  const maxTextWidth = box.w - 24;

  textAlign(LEFT, CENTER);
  fill(20);
  noStroke();
  textSize(16);
  // text("Segments (by playtime share)", x, y);
  text("Steam Time Donut", x, y);

  y += titleToListGap;

  colorMode(HSL, 360, 100, 100, 1);

  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i];

    let col;
    if (slice.kind === "other") {
      col = color(0, 0, 55, 1);
    } else {
      const hue = (i * (360 / Math.max(1, slices.length - 1))) % 360;
      col = color(hue, 35, 75, 1);
    }

    noStroke();
    fill(col);
    rect(x, y - 6, 12, 12, 3);

    colorMode(RGB, 255);
    fill(30);
    textSize(12);

    const pct = Math.round((slice.ratio || 0) * 1000) / 10;
    const hours =
      slice.kind === "other" ? null : Math.round((slice.playtime_forever_min || 0) / 60);
    const recent =
      slice.kind !== "other" && (slice.playtime_2weeks_min || 0) > 0 ? " · recent" : "";

    let line =
      slice.kind === "other"
        ? `Other — ${pct}%`
        : `${slice.name} — ${pct}% (${hours}h)${recent}`;

    line = shortenToWidth(line, maxTextWidth - 20);
    text(line, x + 18, y);

    colorMode(HSL, 360, 100, 100, 1);
    y += lineH;
  }

  colorMode(RGB, 255);
}

/**
 * Draw donut chart and hover tooltip.
 * Hovered slices are slightly enlarged.
 */
function drawDonutInBox(slices, box) {
  const blockTopOffset = 20;
  const titleToListGap = 30;
  const lineH = 22;

  const listStartY = box.y + blockTopOffset + titleToListGap;
  const lastRowCenterY = listStartY + (slices.length - 1) * lineH;
  const lastRowBottomY = lastRowCenterY + 6;

  const donutTopMin = box.y + 34;
  const outerR = Math.min((lastRowBottomY - donutTopMin) / 2, box.w * 0.32);
  const innerR = outerR * 0.56;

  const cy = lastRowBottomY - outerR;
  const cx = box.x + box.w * 0.60;

  let a0 = -Math.PI / 2;

  const dx = mouseX - cx;
  const dy = mouseY - cy;
  const distToCenter = Math.sqrt(dx * dx + dy * dy);

  const ringMidR = (outerR + innerR) / 2;
  const ringHalfThick = (outerR - innerR) / 2;

  const insideRing =
    distToCenter >= ringMidR - ringHalfThick &&
    distToCenter <= ringMidR + ringHalfThick;

  const mouseAngle = normAngle(Math.atan2(dy, dx));
  let hoveredIndex = -1;

  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i];
    const a1 = a0 + (slice.ratio || 0) * TWO_PI;

    if (insideRing && isAngleInSlice(mouseAngle, a0, a1)) {
      hoveredIndex = i;
    }

    a0 = a1;
  }

  a0 = -Math.PI / 2;
  colorMode(HSL, 360, 100, 100, 1);

  let tooltipMsg = null;

  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i];
    const a1 = a0 + (slice.ratio || 0) * TWO_PI;

    const hovered = i === hoveredIndex;
    const scale = hovered ? 1.05 : 1.0;

    let col;
    if (slice.kind === "other") {
      col = color(0, 0, 55, 1);
    } else {
      const hue = (i * (360 / Math.max(1, slices.length - 1))) % 360;
      col = color(hue, 35, 75, 1);
    }

    stroke(col);
    strokeWeight((outerR - innerR) * scale);
    strokeCap(SQUARE);
    noFill();

    const diam = (outerR + innerR) * scale;
    arc(cx, cy, diam, diam, a0, a1);

    if (slice.kind !== "other" && (slice.playtime_2weeks_min || 0) > 0) {
      const mid = (a0 + a1) / 2;
      const rr = ((outerR + innerR) / 2) * scale;
      const px = cx + Math.cos(mid) * rr;
      const py = cy + Math.sin(mid) * rr;

      colorMode(RGB, 255);
      noStroke();
      fill(255);
      circle(px, py, 10);

      colorMode(HSL, 360, 100, 100, 1);
    }

    if (hovered) {
      const pct = Math.round((slice.ratio || 0) * 1000) / 10;
      tooltipMsg = `${slice.name}: ${pct}%`;
    }

    a0 = a1;
  }

  colorMode(RGB, 255);

  if (tooltipMsg) {
    drawTooltip(mouseX, mouseY, tooltipMsg);
  }
}

function drawGenreRow(box, stats) {
  if (!stats) return;

  const rows = buildGenreComparisonData(stats, 5);
  drawGenreComparisonChart(rows, box.x, box.y, box.w);
}

function drawPlayModeBlock(box, stats) {
  if (!stats) return;

  drawPlayModeProfile(
    stats.mode_profile?.playtime_based_axes || [],
    box.x,
    box.y,
    box.w,
    "Player Play Mode Profile"
  );
}

function drawReadingAxesBlock(box, personaData) {
  if (!personaData || !personaData.readingAxes || personaData.readingAxes.length === 0) {
    return;
  }

  fill(20);
  noStroke();
  textSize(16);
  textAlign(CENTER, TOP);
  text("Player Reading Profile", box.x + box.w / 2, box.y);

  drawReadingAxes(personaData.readingAxes, box.x, box.y + 30, box.w);
}

function drawFooterSection(box, personaData) {
  if (!personaData) return;

  fill(75);
  noStroke();
  textSize(13);
  drawJustifiedText(personaData.oneLineReading, box.x, box.y, box.w, 18);
}

/**
 * Add an "Other" slice so the donut totals 100%.
 */
function buildSlicesWithOther(selected) {
  const coreSum = selected.reduce((sum, game) => sum + (game.ratio || 0), 0);

  const slices = selected.map((game) => ({
    kind: "game",
    name: game.name,
    appid: game.appid,
    ratio: game.ratio || 0,
    playtime_forever_min: game.playtime_forever_min || 0,
    playtime_2weeks_min: game.playtime_2weeks_min || 0
  }));

  const otherRatio = Math.max(0, 1 - coreSum);

  if (otherRatio >= 0.01) {
    slices.push({
      kind: "other",
      name: "Other",
      ratio: otherRatio,
      playtime_forever_min: 0,
      playtime_2weeks_min: 0
    });
  }

  return slices;
}

/**
 * Prepare rows for the genre comparison chart.
 */
function buildGenreComparisonData(stats, topN = 5) {
  if (!stats) return [];

  const countGenres = stats.count_based?.genres || [];
  const playGenres = stats.playtime_based?.genres || [];

  const topCountNames = countGenres.slice(0, topN).map((item) => item.name);
  const topPlayNames = playGenres.slice(0, topN).map((item) => item.name);
  const displayNames = [...new Set([...topCountNames, ...topPlayNames])];

  const countMap = new Map(countGenres.map((item) => [item.name, item.value]));
  const playMap = new Map(playGenres.map((item) => [item.name, item.value]));

  const maxCount = Math.max(1, ...displayNames.map((name) => countMap.get(name) || 0));
  const maxPlay = Math.max(1, ...displayNames.map((name) => playMap.get(name) || 0));

  const rows = displayNames.map((name) => {
    const countValue = countMap.get(name) || 0;
    const playValue = playMap.get(name) || 0;

    return {
      name,
      countValue,
      playValue,
      countRatio: countValue / maxCount,
      playRatio: playValue / maxPlay
    };
  });

  rows.sort((a, b) => {
    const aMax = Math.max(a.countRatio, a.playRatio);
    const bMax = Math.max(b.countRatio, b.playRatio);
    return bMax - aMax;
  });

  return rows;
}

function drawGenreComparisonChart(rows, startX, startY, totalW) {
  if (!rows || rows.length === 0) return startY;

  const nameW = 72;
  const leftValuePad = 34;
  const rightValuePad = 34;
  const halfBarW = (totalW - nameW - leftValuePad - rightValuePad) / 2;

  const axisX = startX + nameW + leftValuePad + halfBarW;
  const rowH = 28;
  const barH = 12;

  fill(20);
  noStroke();
  textAlign(LEFT, TOP);
  textSize(16);
  text("Genres · Library vs Play Preference", startX, startY);

  startY += 28;

  textSize(12);
  fill(80);
  text("By Library", startX + nameW + leftValuePad + halfBarW * 0.5 - 28, startY);
  text("By Playtime", axisX + halfBarW * 0.5 - 32, startY);

  startY += 24;

  const chartTop = startY;
  const chartBottom = startY + rows.length * rowH - (rowH - barH) / 2;

  stroke(180);
  strokeWeight(1);
  line(axisX, chartTop - 2, axisX, chartBottom);
  noStroke();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const y = startY + i * rowH;

    fill(40);
    textAlign(LEFT, CENTER);
    textSize(12);
    text(shortenToWidth(row.name, nameW - 6), startX, y + barH / 2);

    const leftBarW = row.countRatio * (halfBarW - 12);
    fill(170);
    rect(axisX - leftBarW, y, leftBarW, barH, 6);

    const rightBarW = row.playRatio * (halfBarW - 12);
    fill(70);
    rect(axisX, y, rightBarW, barH, 6);

    fill(90);
    textSize(11);

    if (row.countValue > 0) {
      textAlign(RIGHT, CENTER);
      text(String(row.countValue), axisX - leftBarW - 6, y + barH / 2);
    }

    if (row.playValue > 0) {
      textAlign(LEFT, CENTER);
      text(`${Math.round(row.playValue / 60)}h`, axisX + rightBarW + 6, y + barH / 2);
    }
  }

  return startY + rows.length * rowH + 10;
}

function drawPlayModeProfile(axes, startX, startY, totalW, title = "Player Play Mode Profile") {
  if (!axes || axes.length === 0) return startY;

  fill(20);
  noStroke();
  textAlign(CENTER, TOP);
  textSize(16);
  text(title, startX + totalW / 2, startY);

  startY += 30;

  const rowH = 42;
  const labelW = 88;
  const sidePctW = 30;
  const axisGap = 8;

  const axisW = totalW - labelW * 2 - sidePctW * 2 - axisGap * 4;
  const lineX = startX + labelW + sidePctW + axisGap * 2;
  const lineRight = lineX + axisW;

  for (let i = 0; i < axes.length; i++) {
    const item = axes[i];
    const y = startY + i * rowH + 14;

    const leftValue = item.leftValue || 0;
    const rightValue = item.rightValue || 0;
    const total = leftValue + rightValue;

    let t = 0.5;
    let leftPct = 50;
    let rightPct = 50;

    if (total > 0) {
      t = rightValue / total;
      leftPct = Math.round((leftValue / total) * 100);
      rightPct = Math.round((rightValue / total) * 100);
    }

    const knobX = lerp(lineX, lineRight, t);

    fill(50);
    textSize(12);
    textAlign(RIGHT, CENTER);
    text(item.leftLabel, lineX - sidePctW - axisGap * 2, y);

    textAlign(LEFT, CENTER);
    text(item.rightLabel, lineRight + sidePctW + axisGap * 2, y);

    stroke(170);
    strokeWeight(2);
    line(lineX, y, lineRight, y);

    stroke(200);
    line((lineX + lineRight) / 2, y - 6, (lineX + lineRight) / 2, y + 6);

    noStroke();
    fill(40);
    circle(knobX, y, 12);

    fill(100);
    textSize(11);

    textAlign(RIGHT, TOP);
    text(`${leftPct}%`, lineX - axisGap, y + 10);

    textAlign(LEFT, TOP);
    text(`${rightPct}%`, lineRight + axisGap, y + 10);
  }

  textAlign(LEFT, TOP);
  return startY + axes.length * rowH + 8;
}

function drawReadingAxes(axes, startX, startY, totalW) {
  if (!axes || axes.length === 0) return startY;

  const rowH = 42;
  const labelW = 88;
  const sidePctW = 30;
  const axisGap = 8;

  const axisW = totalW - labelW * 2 - sidePctW * 2 - axisGap * 4;
  const lineX = startX + labelW + sidePctW + axisGap * 2;
  const lineRight = lineX + axisW;

  for (let i = 0; i < axes.length; i++) {
    const item = axes[i];
    const y = startY + i * rowH + 14;

    const rightPct = item.rightPct || 50;
    const leftPct = 100 - rightPct;
    const knobX = lerp(lineX, lineRight, rightPct / 100);

    fill(50);
    textSize(12);

    textAlign(RIGHT, CENTER);
    text(item.leftLabel, lineX - sidePctW - axisGap * 2, y);

    textAlign(LEFT, CENTER);
    text(item.rightLabel, lineRight + sidePctW + axisGap * 2, y);

    stroke(170);
    strokeWeight(2);
    line(lineX, y, lineRight, y);

    stroke(200);
    line((lineX + lineRight) / 2, y - 6, (lineX + lineRight) / 2, y + 6);

    noStroke();
    fill(40);
    circle(knobX, y, 12);

    fill(100);
    textSize(11);

    textAlign(RIGHT, TOP);
    text(`${leftPct}%`, lineX - axisGap, y + 10);

    textAlign(LEFT, TOP);
    text(`${rightPct}%`, lineRight + axisGap, y + 10);
  }

  textAlign(LEFT, TOP);
  return startY + axes.length * rowH + 8;
}

function drawBottomCharts(box, stats, personaData) {
  const gap = 64;
  const panelW = (box.w - gap) / 2;

  const leftBox = {
    x: box.x,
    y: box.y,
    w: panelW,
    h: box.h
  };

  const rightBox = {
    x: box.x + box.w - panelW,
    y: box.y,
    w: panelW,
    h: box.h
  };

  drawPlayModeBlock(leftBox, stats);
  drawReadingAxesBlock(rightBox, personaData);
}

/**
 * Trim text with an ellipsis so labels fit within a fixed width.
 */
function shortenToWidth(str, maxW) {
  if (textWidth(str) <= maxW) return str;

  let s = str;
  while (s.length > 3 && textWidth(s + "…") > maxW) {
    s = s.slice(0, -1);
  }

  return s + "…";
}

function normAngle(a) {
  let angle = a % TWO_PI;
  if (angle < 0) angle += TWO_PI;
  return angle;
}

function isAngleInSlice(a, start, end) {
  const angle = normAngle(a);
  const sliceStart = normAngle(start);
  const sliceEnd = normAngle(end);

  if (sliceStart < sliceEnd) {
    return angle >= sliceStart && angle < sliceEnd;
  }

  return angle >= sliceStart || angle < sliceEnd;
}

function drawTooltip(x, y, msg) {
  push();

  textSize(14);
  textAlign(LEFT, CENTER);

  const paddingX = 10;
  const paddingY = 7;
  const textH = 14;
  const w = textWidth(msg) + paddingX * 2;
  const h = textH + paddingY * 2;

  let tx = x + 12;
  let ty = y + 12;

  if (tx + w > width) tx = x - w - 12;
  if (ty + h > height) ty = y - h - 12;

  noStroke();
  fill(255);
  rect(tx, ty, w, h, 6);

  fill(0);
  text(msg, tx + paddingX, ty + h / 2);

  pop();
}

/**
 * Counter helper for weighted maps.
 */
function addToMap(map, key, amount = 1) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + amount);
}

function mapToSortedArray(map) {
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Convert category items into three simplified play-mode axes.
 */
function buildPlayModeAxes(categoryItems) {
  const scores = {
    singleMulti: { left: 0, right: 0 },
    coopPvp: { left: 0, right: 0 },
    localOnline: { left: 0, right: 0 }
  };

  for (const item of categoryItems || []) {
    const name = item.name;
    const value = item.value || 0;
    const rules = CATEGORY_AXES[name];
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
 * Choose the most representative games for persona reading.
 * Utility-like titles and tiny playtimes are filtered out first.
 */
function getRepresentativeGames(gamesMeta) {
  if (!gamesMeta || gamesMeta.length === 0) return [];

  const filtered = gamesMeta
    .filter((game) => !EXCLUDED_PERSONA_TITLES.has(game.name))
    .filter((game) => (game.playtime_forever_min || 0) >= 120)
    .sort((a, b) => (b.playtime_forever_min || 0) - (a.playtime_forever_min || 0));

  if (filtered.length >= 5) return filtered;

  return gamesMeta
    .filter((game) => !EXCLUDED_PERSONA_TITLES.has(game.name))
    .filter((game) => (game.playtime_forever_min || 0) > 0)
    .sort((a, b) => (b.playtime_forever_min || 0) - (a.playtime_forever_min || 0))
    .slice(0, 5);
}

function buildPlayProfileFromGamesMeta(gamesMeta) {
  const selectedGames = getRepresentativeGames(gamesMeta);

  const genreMap = new Map();
  const categoryMap = new Map();

  for (const game of selectedGames) {
    const playtime = game.playtime_forever_min || 0;

    for (const genre of game.genres || []) {
      addToMap(genreMap, genre, playtime);
    }

    for (const category of game.categories || []) {
      if (!USEFUL_PERSONA_CATEGORIES.has(category)) continue;
      addToMap(categoryMap, category, playtime);
    }
  }

  const playtimeGenres = mapToSortedArray(genreMap);
  const playtimeCategories = mapToSortedArray(categoryMap);
  const modeAxes = buildPlayModeAxes(playtimeCategories);

  return {
    selectedGames,
    playtimeGenres,
    playtimeCategories,
    modeAxes
  };
}

/**
 * Build the final persona object used across the page.
 */
function buildPersona(ownedData, stats) {
  if (!ownedData || !stats || !stats.games_meta) return null;

  const playProfile = buildPlayProfileFromGamesMeta(stats.games_meta);
  const featureScores = computeFeatureScoresFromPlayProfile(playProfile);
  const ranked = rankFeatures(featureScores);

  const topFeature = getCoreFeature(featureScores, playProfile);
  const secondFeature =
    ranked.find((item) => item.name !== topFeature && item.name !== "social")?.name ||
    ranked.find((item) => item.name !== topFeature)?.name ||
    "variety";

  return {
    archetypeName: buildArchetypeName(featureScores, topFeature, secondFeature),
    oneLineReading: buildPersonaReadingFromPlayProfile(
      featureScores,
      topFeature,
      secondFeature,
      playProfile
    ),
    detailLines: buildDetailLinesFromPlayProfile(featureScores, playProfile),
    topGenres: playProfile.playtimeGenres.slice(0, 3).map((item) => item.name),
    topGames: playProfile.selectedGames.slice(0, 3).map((item) => item.name),
    featureScores,
    rankedFeatures: ranked,
    readingAxes: buildReadingAxes(playProfile)
  };
}

function buildReadingAxes(playProfile) {
  return [
    {
      leftLabel: "Broad",
      rightLabel: "Focused",
      rightPct: computeFocusedPct(playProfile.selectedGames || [])
    },
    {
      leftLabel: "Solitary",
      rightLabel: "Social",
      rightPct: getAxisRightPct(playProfile.modeAxes || [], "singleMulti")
    },
    {
      leftLabel: "Calm",
      rightLabel: "Intense",
      rightPct: computeIntensePct(playProfile.playtimeGenres || [])
    }
  ];
}

function getAxisRightPct(modeAxes, axisName) {
  const axis = modeAxes.find((item) => item.axis === axisName);
  if (!axis) return 50;

  const left = axis.leftValue || 0;
  const right = axis.rightValue || 0;
  const total = left + right;

  if (total <= 0) return 50;
  return Math.round((right / total) * 100);
}

function computeFocusedPct(selectedGames) {
  if (!selectedGames || selectedGames.length === 0) return 50;

  const total = selectedGames.reduce(
    (sum, game) => sum + (game.playtime_forever_min || 0),
    0
  );
  if (total <= 0) return 50;

  const top1 = selectedGames[0]?.playtime_forever_min || 0;
  const top3 = selectedGames
    .slice(0, 3)
    .reduce((sum, game) => sum + (game.playtime_forever_min || 0), 0);

  const count = selectedGames.length;

  const top1Share = top1 / total;
  const top3Share = top3 / total;
  const countCompression = 1 - constrain((count - 3) / 12, 0, 1);

  return Math.round(
    constrain(
      (top3Share * 0.6 + top1Share * 0.2 + countCompression * 0.2) * 100,
      0,
      100
    )
  );
}

function computeIntensePct(playtimeGenres) {
  const toneMap = {
    "Action": { intense: 1.0 },
    "Fighting": { intense: 1.1 },
    "Racing": { intense: 1.0 },
    "Sports": { intense: 0.8 },
    "RPG": { intense: 0.35 },
    "Strategy": { intense: 0.3 },
    "Casual": { calm: 1.0 },
    "Simulation": { calm: 0.9 },
    "Design & Illustration": { calm: 1.0 },
    "Animation & Modeling": { calm: 0.7 },
    "Video Production": { calm: 0.6 },
    "Adventure": { calm: 0.15, intense: 0.25 }
  };

  let calm = 0;
  let intense = 0;

  for (const item of playtimeGenres || []) {
    const rule = toneMap[item.name];
    if (!rule) continue;

    const weight = Math.sqrt(item.value || 0);
    calm += (rule.calm || 0) * weight;
    intense += (rule.intense || 0) * weight;
  }

  const total = calm + intense;
  if (total <= 0) return 50;

  return Math.round((intense / total) * 100);
}

/**
 * Convert selected genre/category signals into normalized persona feature scores.
 */
function computeFeatureScoresFromPlayProfile(playProfile) {
  const genreItems = playProfile.playtimeGenres || [];
  const categoryItems = playProfile.playtimeCategories || [];
  const selectedGames = playProfile.selectedGames || [];

  const raw = {
    immersion: 0,
    strategy: 0,
    challenge: 0,
    social: 0,
    competition: 0,
    variety: 0,
    dedication: 0
  };

  for (const item of genreItems) {
    const rules = GENRE_FEATURE_MAP[item.name];
    if (!rules) continue;

    const weight = Math.sqrt(item.value || 0);
    for (const [feature, amount] of Object.entries(rules)) {
      if (feature in raw) raw[feature] += amount * weight;
    }
  }

  for (const item of categoryItems) {
    const rules = CATEGORY_FEATURE_MAP[item.name];
    if (!rules) continue;

    const weight = Math.sqrt(item.value || 0);
    for (const [feature, amount] of Object.entries(rules)) {
      if (feature === "dedication_hint") continue;
      if (feature in raw) raw[feature] += amount * weight;
    }
  }

  raw.variety = computeVarietyScoreFromGames(selectedGames);
  raw.dedication = computeDedicationScoreFromGames(selectedGames);

  const modeBoost = computeModeBoosts(playProfile.modeAxes || []);
  raw.social += modeBoost.social;
  raw.competition += modeBoost.competition;
  raw.immersion += modeBoost.immersion;

  const normalizedCore = normalizeFeatureObject(raw, CORE_FEATURES);
  normalizedCore.dedication = Math.round(constrain(raw.dedication, 0, 100));

  return normalizedCore;
}

function computeVarietyScoreFromGames(selectedGames) {
  if (!selectedGames || selectedGames.length === 0) return 0;

  const uniqueGenres = new Set();
  const uniqueCategories = new Set();

  let totalPlaytime = 0;
  for (const game of selectedGames) {
    totalPlaytime += game.playtime_forever_min || 0;

    for (const genre of game.genres || []) uniqueGenres.add(genre);
    for (const category of game.categories || []) uniqueCategories.add(category);
  }

  const top3Playtime = selectedGames
    .slice(0, 3)
    .reduce((sum, game) => sum + (game.playtime_forever_min || 0), 0);

  const spreadScore = totalPlaytime > 0 ? (1 - top3Playtime / totalPlaytime) * 100 : 0;
  const genreScore = Math.min(100, uniqueGenres.size * 10);
  const categoryScore = Math.min(100, uniqueCategories.size * 8);

  return Math.round(genreScore * 0.45 + categoryScore * 0.2 + spreadScore * 0.35);
}

function computeDedicationScoreFromGames(selectedGames) {
  if (!selectedGames || selectedGames.length === 0) return 0;

  const totalPlaytime = selectedGames.reduce(
    (sum, game) => sum + (game.playtime_forever_min || 0),
    0
  );
  if (totalPlaytime <= 0) return 0;

  const top1 = selectedGames[0]?.playtime_forever_min || 0;
  const top3 = selectedGames
    .slice(0, 3)
    .reduce((sum, game) => sum + (game.playtime_forever_min || 0), 0);

  const top1Ratio = top1 / totalPlaytime;
  const top3Ratio = top3 / totalPlaytime;
  const totalHours = totalPlaytime / 60;
  const longPlayBias = Math.min(100, totalHours / 8);

  return Math.round(
    top1Ratio * 100 * 0.3 +
    top3Ratio * 100 * 0.5 +
    longPlayBias * 0.2
  );
}

function computeModeBoosts(modeAxes) {
  const result = { social: 0, competition: 0, immersion: 0 };

  const singleMulti = modeAxes.find((item) => item.axis === "singleMulti");
  const coopPvp = modeAxes.find((item) => item.axis === "coopPvp");

  if (singleMulti) {
    const left = singleMulti.leftValue || 0;
    const right = singleMulti.rightValue || 0;
    const total = left + right;

    if (total > 0) {
      result.immersion += (left / total) * 16;
      result.social += (right / total) * 8;
    }
  }

  if (coopPvp) {
    const left = coopPvp.leftValue || 0;
    const right = coopPvp.rightValue || 0;
    const total = left + right;

    if (total > 0) {
      result.social += (left / total) * 12;
      result.competition += (right / total) * 30;
    }
  }

  return result;
}

function normalizeFeatureObject(raw, keys) {
  const values = keys.map((key) => raw[key] || 0);
  const maxV = Math.max(1, ...values);

  const out = {};
  for (const key of keys) {
    out[key] = Math.round(((raw[key] || 0) / maxV) * 100);
  }

  return out;
}

function rankFeatures(scores) {
  return CORE_FEATURES
    .map((name) => ({ name, value: scores[name] || 0 }))
    .sort((a, b) => b.value - a.value);
}

function getCoreFeature(scores, playProfile) {
  const ranked = rankFeatures(scores);
  const topName = ranked[0]?.name || "immersion";
  const secondName = ranked[1]?.name || "immersion";

  if (topName !== "social") return topName;

  const axes = playProfile.modeAxes || [];
  const singleMulti = axes.find((item) => item.axis === "singleMulti");
  const coopPvp = axes.find((item) => item.axis === "coopPvp");

  let multiPct = 50;
  let coopPct = 50;
  let pvpPct = 50;

  if (singleMulti) {
    const total = (singleMulti.leftValue || 0) + (singleMulti.rightValue || 0);
    if (total > 0) {
      multiPct = Math.round(((singleMulti.rightValue || 0) / total) * 100);
    }
  }

  if (coopPvp) {
    const total = (coopPvp.leftValue || 0) + (coopPvp.rightValue || 0);
    if (total > 0) {
      coopPct = Math.round(((coopPvp.leftValue || 0) / total) * 100);
      pvpPct = 100 - coopPct;
    }
  }

  const strongCompanion = multiPct >= 55 && coopPct >= 60;
  const softCompanion = coopPct >= 68 && pvpPct <= 32;

  if (strongCompanion || softCompanion) return "social";
  return secondName;
}

function buildArchetypeName(scores, topFeature, secondFeature) {
  const nounMap = {
    immersion: "Wanderer",
    strategy: "Architect",
    challenge: "Challenger",
    social: "Companion",
    competition: "Competitor",
    variety: "Explorer"
  };

  let modifier = "";
  if ((scores.dedication || 0) >= 72) {
    modifier = "Devoted";
  } else if ((scores.variety || 0) >= 72 && topFeature !== "variety") {
    modifier = "Curious";
  } else {
    modifier = getModifierForCore(topFeature, secondFeature);
  }

  return `${modifier} ${nounMap[topFeature] || "Player"}`;
}

function getModifierForCore(topFeature, secondFeature) {
  const contextualModifierMap = {
    immersion: {
      strategy: "Strategic",
      challenge: "Driven",
      social: "Gentle",
      competition: "Driven",
      variety: "Curious"
    },
    strategy: {
      immersion: "Reflective",
      challenge: "Tactical",
      social: "Collaborative",
      competition: "Calculated",
      variety: "Curious"
    },
    challenge: {
      immersion: "Driven",
      strategy: "Tactical",
      social: "Bold",
      competition: "Fierce",
      variety: "Restless"
    },
    social: {
      immersion: "Gentle",
      strategy: "Supportive",
      challenge: "Bold",
      competition: "Fierce",
      variety: "Friendly"
    },
    competition: {
      immersion: "Focused",
      strategy: "Tactical",
      social: "Bold",
      challenge: "Fierce",
      variety: "Restless"
    },
    variety: {
      immersion: "Curious",
      strategy: "Experimental",
      challenge: "Restless",
      social: "Friendly",
      competition: "Restless"
    }
  };

  return contextualModifierMap[topFeature]?.[secondFeature] || "Distinct";
}

function buildInteractionSentence(playProfile) {
  const axes = playProfile.modeAxes || [];
  const singleMulti = axes.find((item) => item.axis === "singleMulti");
  const coopPvp = axes.find((item) => item.axis === "coopPvp");

  let singlePct = 50;
  let multiPct = 50;
  let coopPct = 50;
  let pvpPct = 50;

  if (singleMulti) {
    const total = (singleMulti.leftValue || 0) + (singleMulti.rightValue || 0);
    if (total > 0) {
      singlePct = Math.round(((singleMulti.leftValue || 0) / total) * 100);
      multiPct = 100 - singlePct;
    }
  }

  if (coopPvp) {
    const total = (coopPvp.leftValue || 0) + (coopPvp.rightValue || 0);
    if (total > 0) {
      coopPct = Math.round(((coopPvp.leftValue || 0) / total) * 100);
      pvpPct = 100 - coopPct;
    }
  }

  if (coopPct >= 70) {
    return "When your play turns social, it leans much more toward co-op than direct rivalry.";
  }
  if (coopPct >= 58) {
    return "When your play turns social, it leans more toward co-op than direct rivalry.";
  }
  if (pvpPct >= 60) {
    return "When your play turns social, it leans more toward direct rivalry than cooperation.";
  }
  if (singlePct >= 65) {
    return "Most of your play still tilts toward solo experiences.";
  }
  if (multiPct >= 60) {
    return "You move comfortably between solo and social play, with a slight pull toward multiplayer.";
  }

  return "You move fairly evenly between solo and social play.";
}

function buildPersonaReadingFromPlayProfile(scores, topFeature, secondFeature, playProfile) {
  const featureTextMap = {
    immersion: "immersive, world-focused experiences",
    strategy: "systems-heavy, planning-driven play",
    challenge: "demanding, action-led play",
    social: "shared, cooperative play",
    competition: "competitive, versus-oriented play",
    variety: "a broad mix of different experiences"
  };

  const topGenres = playProfile.playtimeGenres.slice(0, 3).map((item) => item.name);
  const genreText = topGenres.length ? topGenres.join(", ") : "different genres";

  let dedicationText = "";
  if ((scores.dedication || 0) >= 72) {
    dedicationText = " You also seem likely to stay with a few games for long stretches.";
  } else if ((scores.variety || 0) >= 72) {
    dedicationText =
      " Your library also suggests a tendency to move across different kinds of play rather than settle in one place.";
  }

  return (
    `You seem most drawn to ${featureTextMap[topFeature]}, with a noticeable pull toward ` +
    `${featureTextMap[secondFeature]}. ${buildInteractionSentence(playProfile)} ` +
    `You can see that mix most clearly in the games you return to most, especially ${genreText}.` +
    dedicationText
  );
}

function getStrengthWord(value) {
  if (value >= 90) return "dominant";
  if (value >= 75) return "strong";
  if (value >= 60) return "clear";
  return "light";
}

function getTraitPhrase(name, value) {
  const labelMap = {
    social: "social pull",
    competition: "competitive edge",
    immersion: "immersive pull",
    strategy: "strategic bent",
    challenge: "challenge-seeking streak",
    variety: "variety-seeking streak"
  };

  return `${getStrengthWord(value)} ${labelMap[name] || name}`;
}

function buildDetailLinesFromPlayProfile(scores, playProfile) {
  const lines = [];
  const ranked = rankFeatures(scores).slice(0, 3);

  lines.push(
    `Core tendencies: ${ranked.map((item) => getTraitPhrase(item.name, item.value)).join(" · ")}`
  );

  const axes = playProfile.modeAxes || [];
  const singleMulti = axes.find((item) => item.axis === "singleMulti");
  const coopPvp = axes.find((item) => item.axis === "coopPvp");

  if (singleMulti) {
    const total = (singleMulti.leftValue || 0) + (singleMulti.rightValue || 0);
    if (total > 0) {
      const singlePct = Math.round(((singleMulti.leftValue || 0) / total) * 100);
      const multiPct = 100 - singlePct;
      lines.push(`Play mode tilt: ${singlePct}% single-player / ${multiPct}% multi-player`);
    }
  }

  if (coopPvp) {
    const total = (coopPvp.leftValue || 0) + (coopPvp.rightValue || 0);
    if (total > 0) {
      const coopPct = Math.round(((coopPvp.leftValue || 0) / total) * 100);
      const pvpPct = 100 - coopPct;
      lines.push(`Interaction style: ${coopPct}% co-op / ${pvpPct}% PvP`);
    }
  }

  return lines;
}

function wrapWordsToWidth(str, maxW) {
  const words = String(str || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = [];

  for (const word of words) {
    const testLine = [...line, word].join(" ");
    if (line.length === 0 || textWidth(testLine) <= maxW) {
      line.push(word);
    } else {
      lines.push(line);
      line = [word];
    }
  }

  if (line.length) lines.push(line);
  return lines;
}

/**
 * Draw justified multi-line body text for the final reading paragraph.
 */
function drawJustifiedText(str, x, y, w, lineH) {
  const lines = wrapWordsToWidth(str, w);

  for (let i = 0; i < lines.length; i++) {
    const words = lines[i];
    const isLastLine = i === lines.length - 1;

    if (isLastLine || words.length === 1) {
      textAlign(LEFT, TOP);
      text(words.join(" "), x, y + i * lineH);
      continue;
    }

    const wordsWidth = words.reduce((sum, word) => sum + textWidth(word), 0);
    const gap = (w - wordsWidth) / (words.length - 1);

    let cx = x;
    for (const word of words) {
      textAlign(LEFT, TOP);
      text(word, cx, y + i * lineH);
      cx += textWidth(word) + gap;
    }
  }
}