/*
Sketch 03 – Digital Gaming Identity
Author: Haiyi Xiao
Date: Mar 2026

An interactive data visualisation project that generates a personalised player profile
through analysis of a player's Steam library structure, playtime distribution, genres,
and play-mode tendencies.
*/

const appState = {
  ownedGamesData: null,
  libraryAnalysisData: null,
  playerPersona: null,
  avatarImage: null,
  statusText: ""
};

const THEME = {
  pageGradientLeft: [22, 38, 52],
  pageGradientRight: [38, 32, 47],
  analysisBackground: [13, 24, 37],
  panel: [20, 35, 52],
  panelAlt: [17, 30, 45],
  pageBorder: [42, 68, 92],
  barLeft: [66, 96, 122],
  barRight: [62, 47, 73],
  text: [199, 213, 224],
  textSoft: [143, 152, 160],
  textDim: [104, 122, 140],
  blue: [102, 192, 244],
  blue2: [84, 156, 214],
  other: [88, 103, 118],
  white: [240, 244, 248],
  black: [8, 14, 20]
};

const LAYOUT = {
  canvasMinHeight: 720,
  canvasViewportOffset: 120,
  canvasInnerPaddingX: 24,
  canvasBottomPadding: 40,

  maxPageWidth: 1180,
  pageOuterMarginX: 80,
  pageCollapsedHeight: 555,
  pageBottomPadding: 46,

  headerInsetX: 38,
  sectionInsetX: 26,
  sectionGapY: 50,

  headerTopY: 22,
  headerHeight: 268,

  analysisGapTop: 40,
  analysisBarHeight: 40,

  playtimeSectionBaseHeight: 270,
  playtimeLegendBaseRows: 11,
  playtimeSectionRowStep: 22,

  genreComparisonBaseHeight: 200,
  genreComparisonBaseRows: 5,
  genreComparisonExtraRowHeight: 28,

  analysisPanelsHeight: 160,
  summaryGapTop: 90,
  summaryHeight: 116,

  panelTitleReservedHeight: 40,
  sectionPanelPaddingX: 17,
  sectionPanelPaddingTop: 20,
  sectionPanelPaddingBottom: 20
};

/**
 * Titles excluded from persona reading.
 * These items behave more like utilities, background software, or meta-tools
 * rather than games that meaningfully express the player's play taste.
 * Excluding them helps the persona stay focused on actual play preference.
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
 * Steam exposes many other categories, but this project intentionally narrows
 * the list to the ones that help describe social / competitive / local / online
 * play tendencies in a readable way.
 */
const TRACKED_PERSONA_CATEGORIES = new Set([
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
 * Project-specific rules for translating Steam category labels into three
 * simplified play-mode axes.
 *
 * A single category can contribute to more than one axis. For example:
 * - "Online Co-op" adds to both "co-op vs PvP" and "local vs online"
 * - "MMO" adds to both "single-player vs multi-player" and "local vs online"
 *
 * This is an interpretive mapping for the project rather than a Steam-native one.
 */
const PLAY_MODE_AXIS_RULES = {
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
 * Genre-level contribution rules used when constructing the persona.
 * These are not objective labels. They are weighted heuristics used to turn
 * genre patterns into a more readable interpretive profile.
 */
const GENRE_PERSONA_RULES = {
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
 * Category-level contribution rules used when constructing the persona.
 * These weights supplement the genre reading with play-mode behaviour.
 */
const CATEGORY_PERSONA_RULES = {
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

const PERSONA_CORE_FEATURE_KEYS = [
  "immersion",
  "strategy",
  "challenge",
  "social",
  "competition",
  "variety"
];

/**
 * Convert an RGB array into a CSS rgb() string.
 * The p5 canvas drawing context uses native canvas gradients, which expect
 * CSS color strings rather than plain numeric arrays.
 */
function rgbArrayToCss(rgbArray) {
  return `rgb(${rgbArray[0]}, ${rgbArray[1]}, ${rgbArray[2]})`;
}

/**
 * Update the UI status line.
 * The same status text is shown both above the canvas and inside the placeholder
 * state, so this helper keeps both places in sync.
 */
function setStatusText(message) {
  appState.statusText = message || "";

  const hintElement = document.getElementById("hintText");
  if (hintElement) {
    hintElement.textContent =
      appState.statusText || "Paste a Steam profile link and click Generate.";
  }
}

/**
 * Clear all loaded data before fetching a new profile.
 * Resetting the current state avoids showing stale visuals while a new request
 * is still in progress.
 */
function resetLoadedProfileState() {
  appState.ownedGamesData = null;
  appState.libraryAnalysisData = null;
  appState.playerPersona = null;
  appState.avatarImage = null;
}

/**
 * Return the usable canvas width inside the wrapper element.
 * A small horizontal padding is subtracted so the canvas does not sit flush
 * against the wrapper edge.
 */
function getCanvasDisplayWidth() {
  const wrapper = document.getElementById("canvasWrap");
  return Math.max(320, wrapper.clientWidth - LAYOUT.canvasInnerPaddingX);
}

/**
 * Calculate the height of the playtime donut section.
 * The section grows only when the legend needs more rows than the default base.
 * This keeps the donut section visually compact for smaller datasets while
 * still accommodating longer game lists.
 */
function calculatePlaytimeSectionHeight(ownedGamesData) {
  const donutSlices = buildPlaytimeDonutSlices(ownedGamesData?.selected || []);
  const legendRowCount = donutSlices.length;

  return (
    LAYOUT.playtimeSectionBaseHeight +
    (legendRowCount - LAYOUT.playtimeLegendBaseRows) * LAYOUT.playtimeSectionRowStep
  );
}

/**
 * Calculate the height of the genre comparison section.
 * The base layout is designed around five genre rows, but the section can grow
 * if the merged library/playtime genre set contains more items.
 */
function calculateGenreComparisonSectionHeight(libraryAnalysisData) {
  const genreRows = buildGenreComparisonRows(libraryAnalysisData, 5);
  const rowCount = genreRows.length;

  return (
    LAYOUT.genreComparisonBaseHeight +
    Math.max(0, rowCount - LAYOUT.genreComparisonBaseRows) *
      LAYOUT.genreComparisonExtraRowHeight
  );
}

/**
 * Compute all vertical positions used by the report.
 * Keeping the y-position logic in one place makes the layout easier to read,
 * easier to adjust, and less error-prone than scattering hard-coded offsets
 * across many drawing functions.
 */
function calculateVerticalLayout() {
  const playtimeSectionHeight =
    appState.ownedGamesData && appState.libraryAnalysisData
      ? calculatePlaytimeSectionHeight(appState.ownedGamesData)
      : LAYOUT.playtimeSectionBaseHeight;

  const genreComparisonSectionHeight =
    appState.ownedGamesData && appState.libraryAnalysisData
      ? calculateGenreComparisonSectionHeight(appState.libraryAnalysisData)
      : LAYOUT.genreComparisonBaseHeight;

  const headerCardY = LAYOUT.headerTopY;
  const analysisShellY = headerCardY + LAYOUT.headerHeight + LAYOUT.analysisGapTop;

  const playtimeSectionY =
    analysisShellY + LAYOUT.analysisBarHeight + LAYOUT.sectionGapY;

  const genreComparisonSectionY =
    playtimeSectionY + playtimeSectionHeight + LAYOUT.sectionGapY;

  const analysisPanelsSectionY =
    genreComparisonSectionY + genreComparisonSectionHeight + LAYOUT.sectionGapY;

  const summarySectionY =
    analysisPanelsSectionY + LAYOUT.analysisPanelsHeight + LAYOUT.summaryGapTop;

  /**
   * expandedPageHeight controls the visible bordered report page, not the canvas.
   * The extra bottom padding preserves a small gap below the Summary panel
   * before the page border ends.
   */
  const expandedPageHeight =
    summarySectionY + LAYOUT.summaryHeight + LAYOUT.pageBottomPadding;

  /**
   * The analysis shell is the large framed background behind all lower sections.
   * Its height extends slightly below the lower analysis panels so the grouped
   * block still reads as one coherent analysis area.
   */
  const analysisShellHeight =
    analysisPanelsSectionY + LAYOUT.analysisPanelsHeight - analysisShellY + LAYOUT.sectionGapY;

  return {
    headerCardY,
    analysisShellY,
    playtimeSectionY,
    playtimeSectionHeight,
    genreComparisonSectionY,
    genreComparisonSectionHeight,
    analysisPanelsSectionY,
    summarySectionY,
    expandedPageHeight,
    analysisShellHeight
  };
}

/**
 * Calculate canvas height.
 * Before data is loaded, the canvas stays compact.
 * After data is loaded, the canvas expands to fit the full report plus a small
 * extra buffer below the bordered page.
 */
function calculateCanvasHeight() {
  if (!appState.ownedGamesData || !appState.libraryAnalysisData) {
    return Math.max(
      window.innerHeight - LAYOUT.canvasViewportOffset,
      LAYOUT.canvasMinHeight
    );
  }

  const verticalLayout = calculateVerticalLayout();
  return verticalLayout.expandedPageHeight + LAYOUT.canvasBottomPadding;
}

/**
 * Resize the p5 canvas so it matches the current wrapper width and report height.
 */
function resizeCanvasToWrapper() {
  resizeCanvas(getCanvasDisplayWidth(), calculateCanvasHeight());
}

function setup() {
  const canvas = createCanvas(getCanvasDisplayWidth(), calculateCanvasHeight());
  canvas.parent("canvasWrap");

  angleMode(RADIANS);
  textFont("system-ui");

  setStatusText(appState.statusText);

  const generateButton = document.getElementById("go");
  if (generateButton) {
    generateButton.addEventListener("click", loadSteamProfileData);
  }
}

/**
 * Fetch JSON from an API endpoint and normalise common failure cases into one
 * readable error pathway.
 * This avoids repeating the same fetch / JSON parsing / HTTP check logic in
 * every data-loading function.
 */
async function fetchApiJson(url, requestLabel) {
  const response = await fetch(url);

  let json;
  try {
    json = await response.json();
  } catch {
    throw new Error(`${requestLabel} returned invalid JSON.`);
  }

  if (!response.ok || json?.error) {
    throw new Error(json?.error || `${requestLabel} request failed.`);
  }

  return json;
}

/**
 * Load an avatar image if one exists.
 * Avatar failures are treated softly because the rest of the report can still
 * render correctly without the image.
 */
function loadAvatarImage(avatarUrl) {
  return new Promise((resolve) => {
    if (!avatarUrl) {
      resolve(null);
      return;
    }

    loadImage(
      avatarUrl,
      (imageAsset) => resolve(imageAsset),
      () => resolve(null)
    );
  });
}

/**
 * Fetch both API datasets, load the avatar, build the persona object, and then
 * resize the canvas so the full report can be displayed.
 */
async function loadSteamProfileData() {
  const profileInput = document.getElementById("profile")?.value.trim() || "";

  if (!profileInput) {
    setStatusText("Please paste a Steam profile link");
    return;
  }

  setStatusText("Fetching...");
  resetLoadedProfileState();
  resizeCanvasToWrapper();

  try {
    const ownedGamesUrl = `/api/owned?top_n=10&profile=${encodeURIComponent(
      profileInput
    )}`;

    const libraryAnalysisUrl = `/api/library-profile?profile=${encodeURIComponent(
      profileInput
    )}`;

    /**
     * The two endpoints are independent, so they are fetched in parallel.
     * This reduces waiting time compared with sequential requests.
     */
    const [ownedGamesData, libraryAnalysisData] = await Promise.all([
      fetchApiJson(ownedGamesUrl, "Owned games"),
      fetchApiJson(libraryAnalysisUrl, "Library profile")
    ]);

    appState.ownedGamesData = ownedGamesData;
    appState.libraryAnalysisData = libraryAnalysisData;
    appState.avatarImage = await loadAvatarImage(ownedGamesData.player?.avatar);

    /**
     * The persona is built only after both datasets are available, because it
     * relies on the deeper library analysis rather than the donut data alone.
     */
    appState.playerPersona = buildPlayerPersona(
      ownedGamesData,
      libraryAnalysisData
    );

    const totalHours = Math.round(
      (ownedGamesData.total_playtime_forever_min || 0) / 60
    );

    setStatusText(
      `OK: top ${ownedGamesData.selected_count}, total ${totalHours} hours | ` +
        `metadata ${libraryAnalysisData.used_game_count}/${libraryAnalysisData.processed_game_count} ` +
        `(skipped ${libraryAnalysisData.skipped_game_count})`
    );

    resizeCanvasToWrapper();
  } catch (error) {
    resetLoadedProfileState();
    setStatusText(`Fetch failed: ${String(error)}`);
    resizeCanvasToWrapper();
  }
}

function windowResized() {
  resizeCanvasToWrapper();
}

function draw() {
  const pageLayout = calculatePageLayout();

  drawReportPage(pageLayout.page);

  if (!appState.ownedGamesData || !appState.libraryAnalysisData) {
    drawPlaceholderState(pageLayout.page);
    return;
  }

  const playtimeDonutSlices = buildPlaytimeDonutSlices(
    appState.ownedGamesData.selected
  );

  drawProfileHeaderCard(
    pageLayout.headerCard,
    appState.playerPersona,
    appState.ownedGamesData
  );

  drawAnalysisShell(pageLayout.analysisShell);

  drawPlaytimeDonutSection(
    pageLayout.playtimeSection,
    playtimeDonutSlices
  );

  drawGenreComparisonSection(
    pageLayout.genreComparisonSection,
    appState.libraryAnalysisData
  );

  drawAnalysisPanelsSection(
    pageLayout.analysisPanelsSection,
    appState.libraryAnalysisData,
    appState.playerPersona
  );

  drawSummarySection(
    pageLayout.summarySection,
    appState.playerPersona
  );
}

/**
 * Build the main report layout boxes used by all drawing functions.
 * Each box name is based on what it contains, not where it happens to sit,
 * so the code stays readable even if the visual order is adjusted later.
 */
function calculatePageLayout() {
  const verticalLayout = calculateVerticalLayout();

  const pageWidth = Math.min(LAYOUT.maxPageWidth, width - LAYOUT.pageOuterMarginX);
  const pageX = (width - pageWidth) / 2;
  const pageY = 0;

  const headerCardLeftX = pageX + LAYOUT.headerInsetX;
  const headerCardWidth = pageWidth - LAYOUT.headerInsetX * 2;

  const contentSectionLeftX = headerCardLeftX + LAYOUT.sectionInsetX;
  const contentSectionWidth = headerCardWidth - LAYOUT.sectionInsetX * 2;

  return {
    page: {
      x: pageX,
      y: pageY,
      w: pageWidth,
      h:
        appState.ownedGamesData && appState.libraryAnalysisData
          ? verticalLayout.expandedPageHeight
          : LAYOUT.pageCollapsedHeight
    },

    headerCard: {
      x: headerCardLeftX,
      y: verticalLayout.headerCardY,
      w: headerCardWidth,
      h: LAYOUT.headerHeight
    },

    analysisShell: {
      x: headerCardLeftX,
      y: verticalLayout.analysisShellY,
      w: headerCardWidth,
      h: verticalLayout.analysisShellHeight,
      barH: LAYOUT.analysisBarHeight
    },

    playtimeSection: {
      x: contentSectionLeftX,
      y: verticalLayout.playtimeSectionY,
      w: contentSectionWidth,
      h: verticalLayout.playtimeSectionHeight
    },

    genreComparisonSection: {
      x: contentSectionLeftX,
      y: verticalLayout.genreComparisonSectionY,
      w: contentSectionWidth,
      h: verticalLayout.genreComparisonSectionHeight
    },

    analysisPanelsSection: {
      x: contentSectionLeftX,
      y: verticalLayout.analysisPanelsSectionY,
      w: contentSectionWidth,
      h: LAYOUT.analysisPanelsHeight
    },

    summarySection: {
      x: headerCardLeftX,
      y: verticalLayout.summarySectionY,
      w: headerCardWidth,
      h: LAYOUT.summaryHeight
    }
  };
}

/**
 * Draw the outer bordered report page.
 */
function drawReportPage(pageBox) {
  push();

  noStroke();
  drawHorizontalGradientRect(
    pageBox.x,
    pageBox.y,
    pageBox.w,
    pageBox.h,
    rgbArrayToCss(THEME.pageGradientLeft),
    rgbArrayToCss(THEME.pageGradientRight)
  );

  noFill();
  stroke(...THEME.pageBorder);
  strokeWeight(1);
  rect(pageBox.x, pageBox.y, pageBox.w, pageBox.h);

  pop();
}

/**
 * Draw a horizontal gradient rectangle using the native canvas 2D context.
 * This is used instead of p5's flat fill when a section needs a more subtle
 * panel or header-bar transition.
 */
function drawHorizontalGradientRect(x, y, w, h, leftColor, rightColor) {
  const context = drawingContext;
  const gradient = context.createLinearGradient(x, y, x + w, y);
  gradient.addColorStop(0, leftColor);
  gradient.addColorStop(1, rightColor);

  context.save();
  context.fillStyle = gradient;
  context.fillRect(x, y, w, h);
  context.restore();
}

/**
 * Draw a simple bordered panel rectangle.
 */
function drawPanelBox(
  x,
  y,
  w,
  h,
  fillRgb = THEME.panel,
  strokeRgb = THEME.pageBorder
) {
  stroke(...strokeRgb);
  strokeWeight(1);
  fill(...fillRgb);
  rect(x, y, w, h);
}

/**
 * Draw a titled section panel and return the inner content box.
 * The returned content box is the area available for the chart or diagram,
 * after panel padding and title spacing have been accounted for.
 */
function drawTitledPanelSection(sectionBox, title, fillRgb = THEME.panel) {
  const outerPanelBox = {
    x: sectionBox.x - LAYOUT.sectionPanelPaddingX,
    y: sectionBox.y - LAYOUT.sectionPanelPaddingTop,
    w: sectionBox.w + LAYOUT.sectionPanelPaddingX * 2,
    h:
      sectionBox.h +
      LAYOUT.sectionPanelPaddingTop +
      LAYOUT.sectionPanelPaddingBottom
  };

  drawPanelBox(
    outerPanelBox.x,
    outerPanelBox.y,
    outerPanelBox.w,
    outerPanelBox.h,
    fillRgb,
    THEME.pageBorder
  );

  noStroke();
  fill(...THEME.text);
  textAlign(LEFT, TOP);
  textSize(16);
  text(title, sectionBox.x, sectionBox.y);

  /**
   * Reserve vertical room for the title before returning the content box.
   * This keeps internal chart drawing logic simpler, because the chart code
   * can assume it is already working inside the usable content area.
   */
  return {
    x: sectionBox.x,
    y: sectionBox.y + LAYOUT.panelTitleReservedHeight,
    w: sectionBox.w,
    h: sectionBox.h - LAYOUT.panelTitleReservedHeight
  };
}

/**
 * Placeholder state shown before a valid Steam profile is loaded.
 */
function drawPlaceholderState(pageBox) {
  const centerX = pageBox.x + pageBox.w * 0.5;
  const centerY = pageBox.y + pageBox.h * 0.46;
  const message = appState.statusText || "Paste a Steam profile link to begin";

  push();
  translate(centerX, centerY);

  stroke(...THEME.pageBorder, 120);
  strokeWeight(2);
  noFill();
  circle(0, 0, 260);
  circle(0, 0, 160);

  noStroke();
  fill(...THEME.textSoft);
  textAlign(CENTER, CENTER);
  textSize(14);
  text(message, 0, 0);

  pop();
}

/**
 * Draw the large framed shell behind the lower analysis area.
 */
function drawAnalysisShell(shellBox) {
  drawPanelBox(
    shellBox.x,
    shellBox.y,
    shellBox.w,
    shellBox.h,
    THEME.analysisBackground,
    THEME.pageBorder
  );

  noStroke();
  drawHorizontalGradientRect(
    shellBox.x + 1,
    shellBox.y + 1,
    shellBox.w - 2,
    shellBox.barH,
    rgbArrayToCss(THEME.barLeft),
    rgbArrayToCss(THEME.barRight)
  );

  stroke(...THEME.pageBorder);
  strokeWeight(1);
  line(
    shellBox.x,
    shellBox.y + shellBox.barH,
    shellBox.x + shellBox.w,
    shellBox.y + shellBox.barH
  );

  noStroke();
  fill(...THEME.text);
  textAlign(LEFT, CENTER);
  textSize(17);
  text("Analysis", shellBox.x + 14, shellBox.y + shellBox.barH / 2 + 1);
}

/**
 * Draw the top profile identity block:
 * - avatar
 * - Steam display name
 * - generated archetype name
 * - top genres / top games
 * - short persona evidence lines
 */
function drawProfileHeaderCard(headerBox, personaData, ownedGamesData) {
  const avatarSize = 220;
  const avatarX = headerBox.x + 20;
  const avatarY = headerBox.y + 24;

  const textStartX = avatarX + avatarSize + 32;
  const textWidthLimit = headerBox.w - (textStartX - headerBox.x) - 24;
  let textY = headerBox.y + 30;

  drawAvatarPanel({ x: avatarX, y: avatarY, size: avatarSize });

  fill(...THEME.blue);
  textAlign(LEFT, TOP);
  textSize(18);
  text(
    ownedGamesData?.player?.personaname || "Unknown Player",
    textStartX,
    textY
  );

  textY += 42;

  fill(...THEME.white);
  textSize(30);
  text(personaData?.archetypeName || "Archetype", textStartX, textY);

  textY += 54;

  fill(...THEME.textSoft);
  textSize(13);
  text(
    `Top genres: ${personaData?.topGenres?.join(", ") || ""}`,
    textStartX,
    textY,
    textWidthLimit,
    20
  );

  textY += 24;

  text(
    `Top games: ${personaData?.topGames?.join(", ") || ""}`,
    textStartX,
    textY,
    textWidthLimit,
    20
  );

  textY += 34;

  if (personaData?.detailLines?.length) {
    fill(...THEME.text);
    textSize(12);

    /**
     * Only the first three lines are drawn here to keep the header compact.
     * Longer evidence stays implicit in the persona object rather than
     * overcrowding the top section.
     */
    for (let index = 0; index < Math.min(3, personaData.detailLines.length); index++) {
      text(personaData.detailLines[index], textStartX, textY, textWidthLimit, 18);
      textY += 22;
    }
  }
}

/**
 * Draw the avatar panel.
 * If the avatar fails to load, a fallback question mark is shown so the layout
 * still feels intentional rather than broken.
 */
function drawAvatarPanel(avatarBox) {
  const { x, y, size } = avatarBox;

  push();

  noFill();
  stroke(...THEME.blue2);
  strokeWeight(2);
  rect(x, y, size, size);

  if (appState.avatarImage) {
    const context = drawingContext;

    /**
     * The avatar image is clipped to the inner square so it sits neatly inside
     * the border without spilling over the frame edges.
     */
    context.save();
    context.beginPath();
    context.rect(x + 6, y + 6, size - 12, size - 12);
    context.clip();
    image(appState.avatarImage, x + 6, y + 6, size - 12, size - 12);
    context.restore();
  } else {
    noStroke();
    fill(28);
    rect(x + 6, y + 6, size - 12, size - 12);

    fill(...THEME.white);
    textAlign(CENTER, CENTER);
    textSize(68);
    text("?", x + size / 2, y + size / 2);
  }

  pop();
}

/**
 * Draw the playtime section:
 * - legend on the left
 * - donut chart on the right
 */
function drawPlaytimeDonutSection(sectionBox, donutSlices) {
  const contentBox = drawTitledPanelSection(sectionBox, "Playtime Donut", THEME.panel);

  const columnGap = 26;
  const legendColumnWidth = contentBox.w * 0.42;
  const donutColumnWidth = contentBox.w * 0.58;

  const legendBox = {
    x: contentBox.x,
    y: contentBox.y + 2,
    w: legendColumnWidth - columnGap / 2,
    h: contentBox.h - 4
  };

  const donutBox = {
    x: contentBox.x + legendColumnWidth + columnGap / 2,
    y: contentBox.y,
    w: donutColumnWidth - columnGap / 2,
    h: contentBox.h
  };

  drawPlaytimeLegend(donutSlices, legendBox);
  drawPlaytimeDonutChart(donutSlices, donutBox);
}

/**
 * Draw the donut legend on the left side of the playtime section.
 */
function drawPlaytimeLegend(donutSlices, legendBox) {
  const lineHeight = 22;
  const markerSize = 12;
  const maxTextWidth = legendBox.w - 24;

  const gameSliceCount = Math.max(
    1,
    donutSlices.filter((slice) => slice.kind === "game").length
  );

  let rowY = legendBox.y + 2;

  textAlign(LEFT, CENTER);
  textSize(12);

  for (let index = 0; index < donutSlices.length; index++) {
    const slice = donutSlices[index];
    const sliceColor = getDonutSliceColor(index, slice.kind, gameSliceCount);

    noStroke();
    fill(sliceColor);
    rect(legendBox.x, rowY - 6, markerSize, markerSize);

    const percent = Math.round((slice.ratio || 0) * 1000) / 10;
    const hours =
      slice.kind === "other"
        ? null
        : Math.round((slice.playtime_forever_min || 0) / 60);

    const recentLabel =
      slice.kind !== "other" && (slice.playtime_2weeks_min || 0) > 0
        ? " · recent"
        : "";

    const lineText =
      slice.kind === "other"
        ? `Other — ${percent}%`
        : `${slice.name} — ${percent}% (${hours}h)${recentLabel}`;

    fill(...THEME.text);
    text(
      shortenTextToWidth(lineText, maxTextWidth - 20),
      legendBox.x + 18,
      rowY
    );

    rowY += lineHeight;
  }
}

/**
 * Draw the donut chart itself.
 * Hovered slices are slightly enlarged and show a tooltip.
 * Games played recently are marked with a small white dot.
 */
function drawPlaytimeDonutChart(donutSlices, donutBox) {
  const lineHeight = 22;
  const listStartY = donutBox.y + 2;
  const lastRowCenterY = listStartY + (donutSlices.length - 1) * lineHeight;
  const lastRowBottomY = lastRowCenterY + 6;

  /**
   * The donut height is aligned to the height of the legend list so the left
   * and right halves of the section feel visually connected.
   */
  const donutTopY = listStartY;
  const donutBottomY = lastRowBottomY;

  const outerRadius = Math.min((donutBottomY - donutTopY) / 2, donutBox.w * 0.32);
  const innerRadius = outerRadius * 0.56;

  const donutCenterY = (donutTopY + donutBottomY) / 2;
  const donutCenterX = donutBox.x + donutBox.w * 0.6;

  const mouseDx = mouseX - donutCenterX;
  const mouseDy = mouseY - donutCenterY;
  const mouseDistanceToCenter = Math.sqrt(mouseDx * mouseDx + mouseDy * mouseDy);

  const ringMidRadius = (outerRadius + innerRadius) / 2;
  const ringHalfThickness = (outerRadius - innerRadius) / 2;

  const mouseIsInsideRing =
    mouseDistanceToCenter >= ringMidRadius - ringHalfThickness &&
    mouseDistanceToCenter <= ringMidRadius + ringHalfThickness;

  const normalizedMouseAngle = normalizeAngle(Math.atan2(mouseDy, mouseDx));

  const gameSliceCount = Math.max(
    1,
    donutSlices.filter((slice) => slice.kind === "game").length
  );

  let hoveredSliceIndex = -1;
  let currentStartAngle = -Math.PI / 2;

  /**
   * First pass: detect which slice the mouse is over.
   * The slice geometry is reused in the second pass for actual drawing.
   */
  for (let index = 0; index < donutSlices.length; index++) {
    const slice = donutSlices[index];
    const currentEndAngle = currentStartAngle + (slice.ratio || 0) * TWO_PI;

    if (
      mouseIsInsideRing &&
      isAngleWithinSlice(normalizedMouseAngle, currentStartAngle, currentEndAngle)
    ) {
      hoveredSliceIndex = index;
    }

    currentStartAngle = currentEndAngle;
  }

  currentStartAngle = -Math.PI / 2;
  let tooltipText = null;

  /**
   * Second pass: draw the slices.
   * Hover effects are applied only after the hovered index has been identified.
   */
  for (let index = 0; index < donutSlices.length; index++) {
    const slice = donutSlices[index];
    const currentEndAngle = currentStartAngle + (slice.ratio || 0) * TWO_PI;
    const isHovered = index === hoveredSliceIndex;
    const scaleMultiplier = isHovered ? 1.05 : 1;

    const sliceColor = getDonutSliceColor(index, slice.kind, gameSliceCount);

    stroke(sliceColor);
    strokeWeight((outerRadius - innerRadius) * scaleMultiplier);
    strokeCap(SQUARE);
    noFill();

    const diameter = (outerRadius + innerRadius) * scaleMultiplier;
    arc(
      donutCenterX,
      donutCenterY,
      diameter,
      diameter,
      currentStartAngle,
      currentEndAngle
    );

    if (slice.kind !== "other" && (slice.playtime_2weeks_min || 0) > 0) {
      const midAngle = (currentStartAngle + currentEndAngle) / 2;
      const markerRadius = ((outerRadius + innerRadius) / 2) * scaleMultiplier;
      const markerX = donutCenterX + Math.cos(midAngle) * markerRadius;
      const markerY = donutCenterY + Math.sin(midAngle) * markerRadius;

      noStroke();
      fill(...THEME.white);
      circle(markerX, markerY, 9);
    }

    if (isHovered) {
      const percent = Math.round((slice.ratio || 0) * 1000) / 10;
      tooltipText = `${slice.name}: ${percent}%`;
    }

    currentStartAngle = currentEndAngle;
  }

  if (tooltipText) {
    drawTooltipBox(mouseX, mouseY, tooltipText);
  }
}

/**
 * Build the donut slice palette.
 * Game slices shift gradually from pink-purple to blue.
 * The "Other" slice uses a neutral colour so it reads as leftover remainder
 * rather than as one more named title.
 */
function getDonutSliceColor(index, kind = "game", totalGameSlices = 10) {
  if (kind === "other") {
    return color(...THEME.other);
  }

  colorMode(HSL, 360, 100, 100, 1);

  const t = totalGameSlices <= 1 ? 0 : index / (totalGameSlices - 1);
  const hue = lerp(328, 202, t);
  const saturation = lerp(78, 82, t);
  const lightness = lerp(62, 66, t);

  const sliceColor = color(hue, saturation, lightness, 1);

  colorMode(RGB, 255);
  return sliceColor;
}

/**
 * Build the donut slice data from the selected top-playtime games.
 * An "Other" slice is added when the selected items do not sum to 100%.
 */
function buildPlaytimeDonutSlices(selectedGames) {
  const selectedRatioSum = selectedGames.reduce(
    (sum, game) => sum + (game.ratio || 0),
    0
  );

  const donutSlices = selectedGames.map((game) => ({
    kind: "game",
    name: game.name,
    appid: game.appid,
    ratio: game.ratio || 0,
    playtime_forever_min: game.playtime_forever_min || 0,
    playtime_2weeks_min: game.playtime_2weeks_min || 0
  }));

  const otherRatio = Math.max(0, 1 - selectedRatioSum);

  /**
   * Tiny remainders are ignored so the donut does not gain a visually noisy
   * extra slice that contributes almost nothing.
   */
  if (otherRatio >= 0.01) {
    donutSlices.push({
      kind: "other",
      name: "Other",
      ratio: otherRatio,
      playtime_forever_min: 0,
      playtime_2weeks_min: 0
    });
  }

  return donutSlices;
}

/**
 * Draw the genre comparison section.
 */
function drawGenreComparisonSection(sectionBox, libraryAnalysisData) {
  if (!libraryAnalysisData) return;

  const contentBox = drawTitledPanelSection(
    sectionBox,
    "Genres · Library vs Play Preference",
    THEME.panel
  );

  const genreRows = buildGenreComparisonRows(libraryAnalysisData, 5);
  drawGenreComparisonChart(genreRows, contentBox.x, contentBox.y + 2, contentBox.w);
}

/**
 * Build merged rows for the mirrored genre comparison chart.
 * The chart includes the top genres from both:
 * - count-based library composition
 * - playtime-based preference
 *
 * Merging them ensures the chart compares what is owned versus what actually
 * dominates playtime, rather than showing two unrelated lists.
 */
function buildGenreComparisonRows(libraryAnalysisData, topN = 5) {
  if (!libraryAnalysisData) return [];

  const countGenres = libraryAnalysisData.count_based?.genres || [];
  const playtimeGenres = libraryAnalysisData.playtime_based?.genres || [];

  const topCountGenreNames = countGenres.slice(0, topN).map((item) => item.name);
  const topPlaytimeGenreNames = playtimeGenres
    .slice(0, topN)
    .map((item) => item.name);

  const displayNames = [...new Set([...topCountGenreNames, ...topPlaytimeGenreNames])];

  const countGenreMap = new Map(countGenres.map((item) => [item.name, item.value]));
  const playtimeGenreMap = new Map(
    playtimeGenres.map((item) => [item.name, item.value])
  );

  const maxCountValue = Math.max(
    1,
    ...displayNames.map((name) => countGenreMap.get(name) || 0)
  );

  const maxPlaytimeValue = Math.max(
    1,
    ...displayNames.map((name) => playtimeGenreMap.get(name) || 0)
  );

  const rows = displayNames.map((name) => {
    const countValue = countGenreMap.get(name) || 0;
    const playtimeValue = playtimeGenreMap.get(name) || 0;

    return {
      name,
      countValue,
      playtimeValue,
      countRatio: countValue / maxCountValue,
      playtimeRatio: playtimeValue / maxPlaytimeValue
    };
  });

  /**
   * Rows are sorted by whichever side is visually strongest so the most relevant
   * genres appear near the top of the chart.
   */
  rows.sort((a, b) => {
    const aPriority = Math.max(a.countRatio, a.playtimeRatio);
    const bPriority = Math.max(b.countRatio, b.playtimeRatio);
    return bPriority - aPriority;
  });

  return rows;
}

/**
 * Draw the mirrored genre comparison chart.
 * Left bars represent library breadth; right bars represent playtime preference.
 */
function drawGenreComparisonChart(rows, startX, startY, totalWidth) {
  if (!rows || rows.length === 0) return startY;

  const nameColumnWidth = 72;
  const leftValuePadding = 34;
  const rightValuePadding = 34;
  const halfBarWidth =
    (totalWidth - nameColumnWidth - leftValuePadding - rightValuePadding) / 2;

  const axisX = startX + nameColumnWidth + leftValuePadding + halfBarWidth;
  const rowHeight = 28;
  const barHeight = 12;

  textSize(12);
  fill(...THEME.textSoft);
  noStroke();

  text(
    "By Library",
    startX + nameColumnWidth + leftValuePadding + halfBarWidth * 0.5 - 28,
    startY
  );

  text("By Playtime", axisX + halfBarWidth * 0.5 - 32, startY);

  const chartStartY = startY + 24;
  const chartBottomY =
    chartStartY + rows.length * rowHeight - (rowHeight - barHeight) / 2;

  stroke(...THEME.pageBorder);
  strokeWeight(1);
  line(axisX, chartStartY - 8, axisX, chartBottomY);
  noStroke();

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const rowY = chartStartY + index * rowHeight;

    fill(...THEME.text);
    textAlign(LEFT, CENTER);
    textSize(12);
    text(
      shortenTextToWidth(row.name, nameColumnWidth - 6),
      startX,
      rowY + barHeight / 2
    );

    const leftBarWidth = row.countRatio * (halfBarWidth - 12);
    fill(...THEME.blue2);
    rect(axisX - leftBarWidth, rowY, leftBarWidth, barHeight);

    const rightBarWidth = row.playtimeRatio * (halfBarWidth - 12);
    fill(...THEME.blue);
    rect(axisX, rowY, rightBarWidth, barHeight);

    fill(...THEME.textSoft);
    textSize(11);

    /**
     * Numeric labels are placed outside the bars so bar lengths remain visually
     * readable even when the values differ a lot.
     */
    if (row.countValue > 0) {
      textAlign(RIGHT, CENTER);
      text(String(row.countValue), axisX - leftBarWidth - 6, rowY + barHeight / 2);
    }

    if (row.playtimeValue > 0) {
      textAlign(LEFT, CENTER);
      text(
        `${Math.round(row.playtimeValue / 60)}h`,
        axisX + rightBarWidth + 6,
        rowY + barHeight / 2
      );
    }
  }

  return chartStartY + rows.length * rowHeight + 10;
}

/**
 * Draw the two lower analysis panels side by side:
 * - play-mode tendencies
 * - persona reading axes
 */
function drawAnalysisPanelsSection(sectionBox, libraryAnalysisData, personaData) {
  const panelGap = 43;
  const panelWidth = (sectionBox.w - panelGap) / 2;

  const playModePanelBox = {
    x: sectionBox.x,
    y: sectionBox.y,
    w: panelWidth,
    h: sectionBox.h
  };

  const personaAxesPanelBox = {
    x: sectionBox.x + sectionBox.w - panelWidth,
    y: sectionBox.y,
    w: panelWidth,
    h: sectionBox.h
  };

  drawPlayModePanel(playModePanelBox, libraryAnalysisData);
  drawPersonaAxesPanel(personaAxesPanelBox, personaData);
}

/**
 * Draw the play-mode slider panel based on Steam category-derived axes.
 */
function drawPlayModePanel(panelBox, libraryAnalysisData) {
  if (!libraryAnalysisData) return;

  const contentBox = drawTitledPanelSection(
    panelBox,
    "Play Style Tendencies",
    THEME.panelAlt
  );

  drawPlayModeAxisSliders(
    libraryAnalysisData.mode_profile?.playtime_based_axes || [],
    contentBox.x + 10,
    contentBox.y + 2,
    contentBox.w - 20
  );
}

/**
 * Draw the persona interpretation axis panel based on the generated reading.
 */
function drawPersonaAxesPanel(panelBox, personaData) {
  if (!personaData?.readingAxes?.length) return;

  const contentBox = drawTitledPanelSection(
    panelBox,
    "Player Tendencies",
    THEME.panelAlt
  );

  drawPersonaReadingAxisSliders(
    personaData.readingAxes,
    contentBox.x + 10,
    contentBox.y + 2,
    contentBox.w - 20
  );
}

/**
 * Draw the play-mode slider set.
 * Each slider visualises the balance between two opposing labels.
 */
function drawPlayModeAxisSliders(axes, startX, startY, totalWidth) {
  if (!axes || axes.length === 0) return startY;

  const rowHeight = 42;
  const labelWidth = 88;
  const sidePercentageWidth = 30;
  const axisGap = 8;

  const axisWidth =
    totalWidth - labelWidth * 2 - sidePercentageWidth * 2 - axisGap * 4;

  const lineStartX = startX + labelWidth + sidePercentageWidth + axisGap * 2;
  const lineEndX = lineStartX + axisWidth;

  for (let index = 0; index < axes.length; index++) {
    const axisItem = axes[index];
    const rowY = startY + index * rowHeight + 14;

    const leftValue = axisItem.leftValue || 0;
    const rightValue = axisItem.rightValue || 0;
    const totalValue = leftValue + rightValue;

    let rightRatio = 0.5;
    let leftPercentage = 50;
    let rightPercentage = 50;

    if (totalValue > 0) {
      rightRatio = rightValue / totalValue;
      leftPercentage = Math.round((leftValue / totalValue) * 100);
      rightPercentage = Math.round((rightValue / totalValue) * 100);
    }

    const knobX = lerp(lineStartX, lineEndX, rightRatio);

    fill(...THEME.text);
    textSize(12);
    textAlign(RIGHT, CENTER);
    text(axisItem.leftLabel, lineStartX - sidePercentageWidth - axisGap * 2, rowY);

    textAlign(LEFT, CENTER);
    text(axisItem.rightLabel, lineEndX + sidePercentageWidth + axisGap * 2, rowY);

    stroke(...THEME.pageBorder);
    strokeWeight(2);
    line(lineStartX, rowY, lineEndX, rowY);

    /**
     * The midpoint marker helps the slider read as a balance between two sides,
     * not just as a floating dot on a line.
     */
    stroke(...THEME.textDim);
    line((lineStartX + lineEndX) / 2, rowY - 6, (lineStartX + lineEndX) / 2, rowY + 6);

    noStroke();
    fill(...THEME.blue);
    circle(knobX, rowY, 12);

    fill(...THEME.textSoft);
    textSize(11);

    textAlign(RIGHT, TOP);
    text(`${leftPercentage}%`, lineStartX - axisGap, rowY + 10);

    textAlign(LEFT, TOP);
    text(`${rightPercentage}%`, lineEndX + axisGap, rowY + 10);
  }

  textAlign(LEFT, TOP);
  return startY + axes.length * rowHeight + 8;
}

/**
 * Draw the persona reading slider set.
 * These axes are more interpretive than the Steam category axes and are built
 * from the representative game profile.
 */
function drawPersonaReadingAxisSliders(axes, startX, startY, totalWidth) {
  if (!axes || axes.length === 0) return startY;

  const rowHeight = 42;
  const labelWidth = 88;
  const sidePercentageWidth = 30;
  const axisGap = 8;

  const axisWidth =
    totalWidth - labelWidth * 2 - sidePercentageWidth * 2 - axisGap * 4;

  const lineStartX = startX + labelWidth + sidePercentageWidth + axisGap * 2;
  const lineEndX = lineStartX + axisWidth;

  for (let index = 0; index < axes.length; index++) {
    const axisItem = axes[index];
    const rowY = startY + index * rowHeight + 14;

    const rightPercentage = axisItem.rightPct || 50;
    const leftPercentage = 100 - rightPercentage;
    const knobX = lerp(lineStartX, lineEndX, rightPercentage / 100);

    fill(...THEME.text);
    textSize(12);

    textAlign(RIGHT, CENTER);
    text(axisItem.leftLabel, lineStartX - sidePercentageWidth - axisGap * 2, rowY);

    textAlign(LEFT, CENTER);
    text(axisItem.rightLabel, lineEndX + sidePercentageWidth + axisGap * 2, rowY);

    stroke(...THEME.pageBorder);
    strokeWeight(2);
    line(lineStartX, rowY, lineEndX, rowY);

    stroke(...THEME.textDim);
    line((lineStartX + lineEndX) / 2, rowY - 6, (lineStartX + lineEndX) / 2, rowY + 6);

    noStroke();
    fill(...THEME.blue);
    circle(knobX, rowY, 12);

    fill(...THEME.textSoft);
    textSize(11);

    textAlign(RIGHT, TOP);
    text(`${leftPercentage}%`, lineStartX - axisGap, rowY + 10);

    textAlign(LEFT, TOP);
    text(`${rightPercentage}%`, lineEndX + axisGap, rowY + 10);
  }

  textAlign(LEFT, TOP);
  return startY + axes.length * rowHeight + 8;
}

/**
 * Draw the final bottom summary section containing the one-line persona reading.
 */
function drawSummarySection(summaryBox, personaData) {
  if (!personaData) return;

  const summaryBarHeight = 40;

  drawPanelBox(
    summaryBox.x,
    summaryBox.y,
    summaryBox.w,
    summaryBox.h,
    THEME.analysisBackground,
    THEME.pageBorder
  );

  noStroke();
  drawHorizontalGradientRect(
    summaryBox.x + 1,
    summaryBox.y + 1,
    summaryBox.w - 2,
    summaryBarHeight,
    rgbArrayToCss(THEME.barLeft),
    rgbArrayToCss(THEME.barRight)
  );

  stroke(...THEME.pageBorder);
  strokeWeight(1);
  line(
    summaryBox.x,
    summaryBox.y + summaryBarHeight,
    summaryBox.x + summaryBox.w,
    summaryBox.y + summaryBarHeight
  );

  noStroke();
  fill(...THEME.text);
  textAlign(LEFT, CENTER);
  textSize(17);
  text("Summary", summaryBox.x + 14, summaryBox.y + summaryBarHeight / 2 + 1);

  fill(...THEME.textSoft);
  textSize(13);

  drawJustifiedParagraph(
    personaData.oneLineReading,
    summaryBox.x + 12,
    summaryBox.y + summaryBarHeight + 20,
    summaryBox.w - 24,
    18
  );
}

/**
 * Shorten text with an ellipsis so labels fit within a fixed width.
 * This is mainly used for chart labels and legend entries where very long game
 * or genre names would otherwise break alignment.
 */
function shortenTextToWidth(textValue, maxWidth) {
  if (textWidth(textValue) <= maxWidth) return textValue;

  let shortened = textValue;
  while (shortened.length > 3 && textWidth(`${shortened}…`) > maxWidth) {
    shortened = shortened.slice(0, -1);
  }

  return `${shortened}…`;
}

/**
 * Normalize any angle to the range 0 .. TWO_PI.
 */
function normalizeAngle(angle) {
  let normalized = angle % TWO_PI;
  if (normalized < 0) normalized += TWO_PI;
  return normalized;
}

/**
 * Check whether a normalized angle falls inside a slice span.
 * This helper also handles the case where a slice crosses the wrap-around point
 * at the -PI / PI boundary.
 */
function isAngleWithinSlice(angle, sliceStart, sliceEnd) {
  const normalizedAngle = normalizeAngle(angle);
  const normalizedStart = normalizeAngle(sliceStart);
  const normalizedEnd = normalizeAngle(sliceEnd);

  if (normalizedStart < normalizedEnd) {
    return normalizedAngle >= normalizedStart && normalizedAngle < normalizedEnd;
  }

  return normalizedAngle >= normalizedStart || normalizedAngle < normalizedEnd;
}

/**
 * Draw a tooltip box near the cursor.
 * The tooltip flips left/up when needed so it does not leave the canvas bounds.
 */
function drawTooltipBox(x, y, message) {
  push();

  textSize(14);
  textAlign(LEFT, CENTER);

  const paddingX = 10;
  const paddingY = 7;
  const textHeight = 14;
  const tooltipWidth = textWidth(message) + paddingX * 2;
  const tooltipHeight = textHeight + paddingY * 2;

  let tooltipX = x + 12;
  let tooltipY = y + 12;

  if (tooltipX + tooltipWidth > width) tooltipX = x - tooltipWidth - 12;
  if (tooltipY + tooltipHeight > height) tooltipY = y - tooltipHeight - 12;

  stroke(...THEME.pageBorder);
  strokeWeight(1);
  fill(...THEME.black);
  rect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);

  noStroke();
  fill(...THEME.white);
  text(message, tooltipX + paddingX, tooltipY + tooltipHeight / 2);

  pop();
}

/**
 * Increment a numeric value inside a Map.
 * Used throughout the analysis code for building weighted genre/category totals.
 */
function incrementMapValue(map, key, amount = 1) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + amount);
}

/**
 * Convert a Map into a descending array of { name, value } items.
 */
function mapToSortedStatItems(map) {
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Convert weighted category items into the three simplified play-mode axes.
 */
function derivePlayModeAxesFromCategories(categoryItems) {
  const axisScores = {
    singleMulti: { left: 0, right: 0 },
    coopPvp: { left: 0, right: 0 },
    localOnline: { left: 0, right: 0 }
  };

  for (const item of categoryItems || []) {
    const categoryName = item.name;
    const categoryValue = item.value || 0;
    const rules = PLAY_MODE_AXIS_RULES[categoryName];

    if (!rules) continue;

    for (const rule of rules) {
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
 * Choose the most representative games for persona reading.
 * First preference: games with at least two hours of playtime.
 * Fallback: if that produces too few games, use the strongest remaining played titles.
 */
function getRepresentativePersonaGames(gamesMeta) {
  if (!gamesMeta || gamesMeta.length === 0) return [];

  const longPlayGames = gamesMeta
    .filter((game) => !EXCLUDED_PERSONA_TITLES.has(game.name))
    .filter((game) => (game.playtime_forever_min || 0) >= 120)
    .sort((a, b) => (b.playtime_forever_min || 0) - (a.playtime_forever_min || 0));

  if (longPlayGames.length >= 5) {
    return longPlayGames;
  }

  return gamesMeta
    .filter((game) => !EXCLUDED_PERSONA_TITLES.has(game.name))
    .filter((game) => (game.playtime_forever_min || 0) > 0)
    .sort((a, b) => (b.playtime_forever_min || 0) - (a.playtime_forever_min || 0))
    .slice(0, 5);
}

/**
 * Build the representative play profile used specifically for persona generation.
 * This is a smaller, more curated subset of the full library analysis.
 */
function buildRepresentativePlayProfile(gamesMeta) {
  const selectedGames = getRepresentativePersonaGames(gamesMeta);
  const weightedGenreMap = new Map();
  const weightedCategoryMap = new Map();

  for (const game of selectedGames) {
    const playtimeMinutes = game.playtime_forever_min || 0;

    /**
     * Genres and categories are weighted by playtime rather than simple count.
     * This helps the persona reflect sustained attention rather than mere presence.
     */
    for (const genre of game.genres || []) {
      incrementMapValue(weightedGenreMap, genre, playtimeMinutes);
    }

    for (const category of game.categories || []) {
      if (!TRACKED_PERSONA_CATEGORIES.has(category)) continue;
      incrementMapValue(weightedCategoryMap, category, playtimeMinutes);
    }
  }

  const playtimeGenres = mapToSortedStatItems(weightedGenreMap);
  const playtimeCategories = mapToSortedStatItems(weightedCategoryMap);

  return {
    selectedGames,
    playtimeGenres,
    playtimeCategories,
    modeAxes: derivePlayModeAxesFromCategories(playtimeCategories)
  };
}

/**
 * Build the final persona object consumed by the report.
 * This bundles together the archetype name, one-line reading, supporting lines,
 * top genres, top games, and the simplified interpretation axes.
 */
function buildPlayerPersona(ownedGamesData, libraryAnalysisData) {
  if (!ownedGamesData || !libraryAnalysisData?.games_meta) return null;

  const playProfile = buildRepresentativePlayProfile(libraryAnalysisData.games_meta);
  const featureScores = computeFeatureScoresFromPlayProfile(playProfile);
  const rankedFeatures = rankCoreFeatures(featureScores);

  const primaryFeature = choosePersonaCoreFeature(featureScores, playProfile);

  const secondaryFeature =
    rankedFeatures.find(
      (item) => item.name !== primaryFeature && item.name !== "social"
    )?.name ||
    rankedFeatures.find((item) => item.name !== primaryFeature)?.name ||
    "variety";

  return {
    archetypeName: buildArchetypeName(
      featureScores,
      primaryFeature,
      secondaryFeature
    ),
    oneLineReading: buildPersonaOneLineReading(
      featureScores,
      primaryFeature,
      secondaryFeature,
      playProfile
    ),
    detailLines: buildPersonaDetailLines(featureScores, playProfile),
    topGenres: playProfile.playtimeGenres.slice(0, 3).map((item) => item.name),
    topGames: playProfile.selectedGames.slice(0, 3).map((item) => item.name),
    featureScores,
    rankedFeatures,
    readingAxes: buildPersonaReadingAxes(playProfile)
  };
}

/**
 * Build the three interpretive axes shown in the right-hand lower panel.
 */
function buildPersonaReadingAxes(playProfile) {
  return [
    {
      leftLabel: "Broad",
      rightLabel: "Focused",
      rightPct: computeFocusedPct(playProfile.selectedGames || [])
    },
    {
      leftLabel: "Solitary",
      rightLabel: "Social",
      rightPct: getModeAxisRightPercentage(playProfile.modeAxes || [], "singleMulti")
    },
    {
      leftLabel: "Calm",
      rightLabel: "Intense",
      rightPct: computeIntensityPct(playProfile.playtimeGenres || [])
    }
  ];
}

function getModeAxisRightPercentage(modeAxes, axisName) {
  const axis = modeAxes.find((item) => item.axis === axisName);
  if (!axis) return 50;

  const leftValue = axis.leftValue || 0;
  const rightValue = axis.rightValue || 0;
  const totalValue = leftValue + rightValue;

  if (totalValue <= 0) return 50;
  return Math.round((rightValue / totalValue) * 100);
}

/**
 * Estimate how concentrated the player's attention is.
 * Higher values suggest the player's playtime is more focused around a smaller
 * number of representative games.
 */
function computeFocusedPct(selectedGames) {
  if (!selectedGames || selectedGames.length === 0) return 50;

  const totalPlaytime = selectedGames.reduce(
    (sum, game) => sum + (game.playtime_forever_min || 0),
    0
  );

  if (totalPlaytime <= 0) return 50;

  const topOnePlaytime = selectedGames[0]?.playtime_forever_min || 0;
  const topThreePlaytime = selectedGames
    .slice(0, 3)
    .reduce((sum, game) => sum + (game.playtime_forever_min || 0), 0);

  const gameCount = selectedGames.length;
  const topOneShare = topOnePlaytime / totalPlaytime;
  const topThreeShare = topThreePlaytime / totalPlaytime;

  /**
   * countCompression nudges the value upward when fewer games dominate the set.
   * It is constrained so the effect stays interpretive rather than extreme.
   */
  const countCompression = 1 - constrain((gameCount - 3) / 12, 0, 1);

  return Math.round(
    constrain(
      (topThreeShare * 0.6 + topOneShare * 0.2 + countCompression * 0.2) * 100,
      0,
      100
    )
  );
}

/**
 * Estimate a calm-versus-intense play tendency from weighted genres.
 */
function computeIntensityPct(playtimeGenres) {
  const toneRules = {
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

  let calmScore = 0;
  let intenseScore = 0;

  for (const item of playtimeGenres || []) {
    const rule = toneRules[item.name];
    if (!rule) continue;

    const weight = Math.sqrt(item.value || 0);
    calmScore += (rule.calm || 0) * weight;
    intenseScore += (rule.intense || 0) * weight;
  }

  const totalScore = calmScore + intenseScore;
  if (totalScore <= 0) return 50;

  return Math.round((intenseScore / totalScore) * 100);
}

/**
 * Convert representative genre/category signals into normalized persona scores.
 * The raw values are built first, then normalized into a comparable 0–100 range.
 */
function computeFeatureScoresFromPlayProfile(playProfile) {
  const genreItems = playProfile.playtimeGenres || [];
  const categoryItems = playProfile.playtimeCategories || [];
  const selectedGames = playProfile.selectedGames || [];

  const rawScores = {
    immersion: 0,
    strategy: 0,
    challenge: 0,
    social: 0,
    competition: 0,
    variety: 0,
    dedication: 0
  };

  for (const item of genreItems) {
    const rules = GENRE_PERSONA_RULES[item.name];
    if (!rules) continue;

    const weight = Math.sqrt(item.value || 0);

    for (const [feature, amount] of Object.entries(rules)) {
      if (feature in rawScores) {
        rawScores[feature] += amount * weight;
      }
    }
  }

  for (const item of categoryItems) {
    const rules = CATEGORY_PERSONA_RULES[item.name];
    if (!rules) continue;

    const weight = Math.sqrt(item.value || 0);

    for (const [feature, amount] of Object.entries(rules)) {
      if (feature === "dedication_hint") continue;
      if (feature in rawScores) {
        rawScores[feature] += amount * weight;
      }
    }
  }

  rawScores.variety = computeVarietyScore(selectedGames);
  rawScores.dedication = computeDedicationScore(selectedGames);

  /**
   * Axis-derived boosts act as a secondary correction layer so the persona also
   * reflects broader play-mode balance, not only genre/category weighting.
   */
  const modeBoosts = computeModeAxisFeatureBoosts(playProfile.modeAxes || []);
  rawScores.social += modeBoosts.social;
  rawScores.competition += modeBoosts.competition;
  rawScores.immersion += modeBoosts.immersion;

  const normalizedCoreScores = normalizeFeatureScores(
    rawScores,
    PERSONA_CORE_FEATURE_KEYS
  );

  normalizedCoreScores.dedication = Math.round(
    constrain(rawScores.dedication, 0, 100)
  );

  return normalizedCoreScores;
}

/**
 * Estimate how varied the player's representative games are.
 * Variety combines:
 * - diversity of genres
 * - diversity of categories
 * - how spread out playtime is across the selected set
 */
function computeVarietyScore(selectedGames) {
  if (!selectedGames || selectedGames.length === 0) return 0;

  const uniqueGenres = new Set();
  const uniqueCategories = new Set();
  let totalPlaytime = 0;

  for (const game of selectedGames) {
    totalPlaytime += game.playtime_forever_min || 0;

    for (const genre of game.genres || []) uniqueGenres.add(genre);
    for (const category of game.categories || []) uniqueCategories.add(category);
  }

  const topThreePlaytime = selectedGames
    .slice(0, 3)
    .reduce((sum, game) => sum + (game.playtime_forever_min || 0), 0);

  const spreadScore =
    totalPlaytime > 0 ? (1 - topThreePlaytime / totalPlaytime) * 100 : 0;

  const genreScore = Math.min(100, uniqueGenres.size * 10);
  const categoryScore = Math.min(100, uniqueCategories.size * 8);

  return Math.round(
    genreScore * 0.45 + categoryScore * 0.2 + spreadScore * 0.35
  );
}

/**
 * Estimate how dedicated or sustained the player's attention is.
 * Higher values indicate that a few core games account for a large share of
 * total representative playtime.
 */
function computeDedicationScore(selectedGames) {
  if (!selectedGames || selectedGames.length === 0) return 0;

  const totalPlaytime = selectedGames.reduce(
    (sum, game) => sum + (game.playtime_forever_min || 0),
    0
  );

  if (totalPlaytime <= 0) return 0;

  const topOnePlaytime = selectedGames[0]?.playtime_forever_min || 0;
  const topThreePlaytime = selectedGames
    .slice(0, 3)
    .reduce((sum, game) => sum + (game.playtime_forever_min || 0), 0);

  const topOneRatio = topOnePlaytime / totalPlaytime;
  const topThreeRatio = topThreePlaytime / totalPlaytime;
  const totalHours = totalPlaytime / 60;

  const longPlayBias = Math.min(100, totalHours / 8);

  return Math.round(
    topOneRatio * 100 * 0.3 +
    topThreeRatio * 100 * 0.5 +
    longPlayBias * 0.2
  );
}

/**
 * Use play-mode axes as a secondary adjustment layer for the persona.
 * This adds broad behavioural signals such as solo-vs-social and co-op-vs-PvP
 * on top of the genre/category feature calculations.
 */
function computeModeAxisFeatureBoosts(modeAxes) {
  const featureBoosts = { social: 0, competition: 0, immersion: 0 };

  const singleMultiAxis = modeAxes.find((item) => item.axis === "singleMulti");
  const coopPvpAxis = modeAxes.find((item) => item.axis === "coopPvp");

  if (singleMultiAxis) {
    const leftValue = singleMultiAxis.leftValue || 0;
    const rightValue = singleMultiAxis.rightValue || 0;
    const totalValue = leftValue + rightValue;

    if (totalValue > 0) {
      featureBoosts.immersion += (leftValue / totalValue) * 16;
      featureBoosts.social += (rightValue / totalValue) * 8;
    }
  }

  if (coopPvpAxis) {
    const leftValue = coopPvpAxis.leftValue || 0;
    const rightValue = coopPvpAxis.rightValue || 0;
    const totalValue = leftValue + rightValue;

    if (totalValue > 0) {
      featureBoosts.social += (leftValue / totalValue) * 12;
      featureBoosts.competition += (rightValue / totalValue) * 30;
    }
  }

  return featureBoosts;
}

/**
 * Normalize selected raw feature values to a 0–100 range relative to the
 * strongest feature in the current set.
 */
function normalizeFeatureScores(rawScores, keys) {
  const values = keys.map((key) => rawScores[key] || 0);
  const maxValue = Math.max(1, ...values);

  const normalized = {};
  for (const key of keys) {
    normalized[key] = Math.round(((rawScores[key] || 0) / maxValue) * 100);
  }

  return normalized;
}

function rankCoreFeatures(scores) {
  return PERSONA_CORE_FEATURE_KEYS
    .map((name) => ({ name, value: scores[name] || 0 }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Choose the persona's lead feature.
 * If "social" ranks highest, the broader axis balance is checked to decide
 * whether it is genuinely dominant or whether another trait should lead.
 */
function choosePersonaCoreFeature(scores, playProfile) {
  const rankedFeatures = rankCoreFeatures(scores);
  const highestFeatureName = rankedFeatures[0]?.name || "immersion";
  const secondFeatureName = rankedFeatures[1]?.name || "immersion";

  if (highestFeatureName !== "social") {
    return highestFeatureName;
  }

  const modeAxes = playProfile.modeAxes || [];
  const singleMultiAxis = modeAxes.find((item) => item.axis === "singleMulti");
  const coopPvpAxis = modeAxes.find((item) => item.axis === "coopPvp");

  let multiplayerPct = 50;
  let coopPct = 50;
  let pvpPct = 50;

  if (singleMultiAxis) {
    const totalValue =
      (singleMultiAxis.leftValue || 0) + (singleMultiAxis.rightValue || 0);

    if (totalValue > 0) {
      multiplayerPct = Math.round(
        ((singleMultiAxis.rightValue || 0) / totalValue) * 100
      );
    }
  }

  if (coopPvpAxis) {
    const totalValue =
      (coopPvpAxis.leftValue || 0) + (coopPvpAxis.rightValue || 0);

    if (totalValue > 0) {
      coopPct = Math.round(((coopPvpAxis.leftValue || 0) / totalValue) * 100);
      pvpPct = 100 - coopPct;
    }
  }

  const strongCompanionReading = multiplayerPct >= 55 && coopPct >= 60;
  const softCompanionReading = coopPct >= 68 && pvpPct <= 32;

  if (strongCompanionReading || softCompanionReading) {
    return "social";
  }

  return secondFeatureName;
}

function buildArchetypeName(scores, primaryFeature, secondaryFeature) {
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
  } else if ((scores.variety || 0) >= 72 && primaryFeature !== "variety") {
    modifier = "Curious";
  } else {
    modifier = getContextualModifier(primaryFeature, secondaryFeature);
  }

  return `${modifier} ${nounMap[primaryFeature] || "Player"}`;
}

function getContextualModifier(primaryFeature, secondaryFeature) {
  const modifierMap = {
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

  return modifierMap[primaryFeature]?.[secondaryFeature] || "Distinct";
}

/**
 * Build the interaction sentence used inside the one-line persona reading.
 * This sentence is derived from the simplified mode axes rather than directly
 * from genre scores, so it speaks more specifically about solo/social balance.
 */
function buildInteractionSentence(playProfile) {
  const modeAxes = playProfile.modeAxes || [];
  const singleMultiAxis = modeAxes.find((item) => item.axis === "singleMulti");
  const coopPvpAxis = modeAxes.find((item) => item.axis === "coopPvp");

  let singlePct = 50;
  let multiPct = 50;
  let coopPct = 50;
  let pvpPct = 50;

  if (singleMultiAxis) {
    const totalValue =
      (singleMultiAxis.leftValue || 0) + (singleMultiAxis.rightValue || 0);

    if (totalValue > 0) {
      singlePct = Math.round(((singleMultiAxis.leftValue || 0) / totalValue) * 100);
      multiPct = 100 - singlePct;
    }
  }

  if (coopPvpAxis) {
    const totalValue =
      (coopPvpAxis.leftValue || 0) + (coopPvpAxis.rightValue || 0);

    if (totalValue > 0) {
      coopPct = Math.round(((coopPvpAxis.leftValue || 0) / totalValue) * 100);
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

/**
 * Build the final one-line persona reading.
 * This combines:
 * - a primary feature
 * - a secondary feature
 * - a social interaction sentence
 * - the most evident top genres
 * - an optional dedication/variety note
 */
function buildPersonaOneLineReading(
  scores,
  primaryFeature,
  secondaryFeature,
  playProfile
) {
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
    `You seem most drawn to ${featureTextMap[primaryFeature]}, with a noticeable pull toward ` +
    `${featureTextMap[secondaryFeature]}. ${buildInteractionSentence(playProfile)} ` +
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

function getTraitPhrase(featureName, value) {
  const labelMap = {
    social: "social pull",
    competition: "competitive edge",
    immersion: "immersive pull",
    strategy: "strategic bent",
    challenge: "challenge-seeking streak",
    variety: "variety-seeking streak"
  };

  return `${getStrengthWord(value)} ${labelMap[featureName] || featureName}`;
}

/**
 * Build the short evidence lines shown below the archetype title.
 */
function buildPersonaDetailLines(scores, playProfile) {
  const detailLines = [];
  const topRankedFeatures = rankCoreFeatures(scores).slice(0, 3);

  detailLines.push(
    `Core tendencies: ${topRankedFeatures
      .map((item) => getTraitPhrase(item.name, item.value))
      .join(" · ")}`
  );

  const modeAxes = playProfile.modeAxes || [];
  const singleMultiAxis = modeAxes.find((item) => item.axis === "singleMulti");
  const coopPvpAxis = modeAxes.find((item) => item.axis === "coopPvp");

  if (singleMultiAxis) {
    const totalValue =
      (singleMultiAxis.leftValue || 0) + (singleMultiAxis.rightValue || 0);

    if (totalValue > 0) {
      const singlePct = Math.round(
        ((singleMultiAxis.leftValue || 0) / totalValue) * 100
      );
      const multiPct = 100 - singlePct;

      detailLines.push(
        `Play mode tilt: ${singlePct}% single-player / ${multiPct}% multi-player`
      );
    }
  }

  if (coopPvpAxis) {
    const totalValue =
      (coopPvpAxis.leftValue || 0) + (coopPvpAxis.rightValue || 0);

    if (totalValue > 0) {
      const coopPct = Math.round(((coopPvpAxis.leftValue || 0) / totalValue) * 100);
      const pvpPct = 100 - coopPct;

      detailLines.push(`Interaction style: ${coopPct}% co-op / ${pvpPct}% PvP`);
    }
  }

  return detailLines;
}

/**
 * Word-wrap a paragraph into line arrays so it can later be drawn with
 * custom justification.
 */
function wrapWordsToWidth(textValue, maxWidth) {
  const words = String(textValue || "")
    .split(/\s+/)
    .filter(Boolean);

  const lines = [];
  let currentLine = [];

  for (const word of words) {
    const testLine = [...currentLine, word].join(" ");

    if (currentLine.length === 0 || textWidth(testLine) <= maxWidth) {
      currentLine.push(word);
    } else {
      lines.push(currentLine);
      currentLine = [word];
    }
  }

  if (currentLine.length) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Draw justified paragraph text.
 * Non-final lines are stretched so the paragraph reads as a more even block,
 * while the last line remains left-aligned to avoid awkward spacing.
 */
function drawJustifiedParagraph(textValue, x, y, w, lineHeight) {
  const lines = wrapWordsToWidth(textValue, w);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const words = lines[lineIndex];
    const isLastLine = lineIndex === lines.length - 1;

    if (isLastLine || words.length === 1) {
      textAlign(LEFT, TOP);
      text(words.join(" "), x, y + lineIndex * lineHeight);
      continue;
    }

    const wordsWidth = words.reduce((sum, word) => sum + textWidth(word), 0);
    const gapWidth = (w - wordsWidth) / (words.length - 1);

    let cursorX = x;
    for (const word of words) {
      textAlign(LEFT, TOP);
      text(word, cursorX, y + lineIndex * lineHeight);
      cursorX += textWidth(word) + gapWidth;
    }
  }
}