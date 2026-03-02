let data = null;
let statusText = "输入链接后点击 Generate";

function setup() {
  const wrap = document.getElementById("canvasWrap");
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;

  const cnv = createCanvas(w, h);
  cnv.parent("canvasWrap");

  angleMode(RADIANS);
  textFont("system-ui");

  document.getElementById("go").onclick = loadData;
}

async function loadData() {
  const profile = document.getElementById("profile").value.trim();
  if (!profile) {
    statusText = "请先粘贴 Steam 主页链接";
    return;
  }

  statusText = "Fetching...";
  data = null;

  try {
    const url = `/api/owned?min_ratio=0.05&max=20&profile=${encodeURIComponent(profile)}`;
    const r = await fetch(url);
    const j = await r.json();

    if (j.error) {
      statusText = `Error: ${j.error}`;
      data = null;
      return;
    }

    data = j;

    const totalH = Math.round((j.total_playtime_forever_min || 0) / 60);
    statusText = `OK: selected ${j.selected_count}, total ${totalH} hours`;
  } catch (e) {
    statusText = `Fetch failed: ${String(e)}`;
    data = null;
  }
}

function draw() {
  background(245);

  // 标题
  fill(20);
  noStroke();
  textSize(18);
  text("Steam Time Donut", 20, 40);

  textSize(12);
  fill(60);
  text(statusText, 20, 62);

  if (!data) {
    drawPlaceholder();
    return;
  }

  // 1) 把 selected 变成 slices，并追加 Other
  const slices = buildSlicesWithOther(data.selected);

  // 2) 画 donut（带 hover）
  drawDonut(slices);

  // 3) 画 legend（不溢出）
  drawLegend(slices);
}

function drawPlaceholder() {
  push();
  translate(width * 0.5, height * 0.55);
  stroke(0, 25);
  strokeWeight(2);
  noFill();
  circle(0, 0, 320);
  circle(0, 0, 180);
  noStroke();
  fill(0, 70);
  textAlign(CENTER, CENTER);
  textSize(14);
  text("Waiting for data…", 0, 0);
  pop();
}

/**
 * selected 的 ratio 是“相对于总时长”的比例，加起来可能 < 1
 * 我们把剩下的部分合成一个 Other（灰色扇区），保证 donut 一圈 = 100%
 */
function buildSlicesWithOther(selected) {
  const coreSum = selected.reduce((s, g) => s + (g.ratio || 0), 0);

  const slices = selected.map(g => ({
    kind: "game",
    name: g.name,
    appid: g.appid,
    ratio: g.ratio || 0,
    playtime_forever_min: g.playtime_forever_min || 0,
    playtime_2weeks_min: g.playtime_2weeks_min || 0
  }));

  const otherRatio = Math.max(0, 1 - coreSum);

  // 太小的 other（<1%）就不画，避免噪声
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

function drawDonut(slices) {
  // —— 布局参数（自适应）——
  const leftPad = 20;
  const legendW = Math.min(520, Math.max(240, width * 0.45)); // 给 legend 预留宽度
  const cx = leftPad + legendW + (width - (leftPad + legendW)) * 0.55; // donut 在右侧区域居中
  const cy = height * 0.58;

  const maxR = Math.min(width - (leftPad + legendW) - 40, height - 120) * 0.45;
  const outerR = Math.max(110, maxR);
  const innerR = outerR * 0.62;

  // 起始角度：从顶部开始
  let a0 = -Math.PI / 2;

  // —— hover 命中检测（角度 + 是否在环带内）——
  const dx = mouseX - cx;
  const dy = mouseY - cy;
  const distToCenter = Math.sqrt(dx * dx + dy * dy);

  const ringMidR = (outerR + innerR) / 2;
  const ringHalfThick = (outerR - innerR) / 2;

  const insideRing = distToCenter >= (ringMidR - ringHalfThick) &&
                     distToCenter <= (ringMidR + ringHalfThick);

  const mouseAngle = normAngle(Math.atan2(dy, dx));
  let hoveredIndex = -1;

  // 第一遍：找 hover
  for (let i = 0; i < slices.length; i++) {
    const s = slices[i];
    const a1 = a0 + (s.ratio || 0) * TWO_PI;

    if (insideRing && isAngleInSlice(mouseAngle, a0, a1)) {
      hoveredIndex = i;
    }
    a0 = a1;
  }

  // 第二遍：绘制
  a0 = -Math.PI / 2;

  // 用 HSL 更好调柔和色
  colorMode(HSL, 360, 100, 100, 1);

  for (let i = 0; i < slices.length; i++) {
    const s = slices[i];
    const a1 = a0 + (s.ratio || 0) * TWO_PI;

    const hovered = (i === hoveredIndex);
    const scale = hovered ? 1.06 : 1.0;

    // 颜色：游戏是柔和色相，Other 是灰
    let col;
    if (s.kind === "other") {
      col = color(0, 0, 55, 1);
    } else {
      const hue = (i * (360 / Math.max(1, slices.length - 1))) % 360;
      col = color(hue, 35, 75, 1); // 柔和
    }

    stroke(col);
    strokeWeight((outerR - innerR) * scale);
    strokeCap(SQUARE);
    noFill();

    const diam = (outerR + innerR) * scale;
    arc(cx, cy, diam, diam, a0, a1);

    // 最近两周玩过：加白点（Other 不加）
    if (s.kind !== "other" && (s.playtime_2weeks_min || 0) > 0) {
      const mid = (a0 + a1) / 2;
      const rr = ((outerR + innerR) / 2) * scale;
      const px = cx + Math.cos(mid) * rr;
      const py = cy + Math.sin(mid) * rr;

      colorMode(RGB, 255);
      noStroke();
      fill(255);
      circle(px, py, 10);
      stroke(30, 120);
      strokeWeight(2);
      noFill();
      circle(px, py, 14);
      colorMode(HSL, 360, 100, 100, 1);
    }

    // hover tooltip
    if (hovered) {
      const pct = Math.round((s.ratio || 0) * 1000) / 10;
      colorMode(RGB, 255);
      drawTooltip(mouseX, mouseY, `${s.name}: ${pct}%`);
      colorMode(HSL, 360, 100, 100, 1);
    }

    a0 = a1;
  }

  // 中间文字
  colorMode(RGB, 255);
  noStroke();
  fill(25);
  textAlign(CENTER, CENTER);
  textSize(14);
  text("Playtime Structure", cx, cy - 8);
  textSize(12);
  fill(80);
  text("Selected + Other", cx, cy + 12);

  // 回到 RGB
  colorMode(RGB, 255);
}

function drawLegend(slices) {
  const x = 20;
  let y = 110;

  const legendW = Math.min(520, Math.max(240, width * 0.45));
  const maxTextWidth = legendW - 18 - 16; // 色块+间距
  const lineH = 18;

  // ✅ 关键：强制左对齐 + 垂直居中
  textAlign(LEFT, CENTER);

  fill(20);
  noStroke();
  textSize(14);
  text("Segments (by playtime share)", x, y);
  y += 16;

  colorMode(HSL, 360, 100, 100, 1);

  for (let i = 0; i < slices.length; i++) {
    const s = slices[i];
    y += lineH;

    let col;
    if (s.kind === "other") col = color(0, 0, 55, 1);
    else {
      const hue = (i * (360 / Math.max(1, slices.length - 1))) % 360;
      col = color(hue, 35, 75, 1);
    }

    noStroke();
    fill(col);
    rect(x, y - 6, 12, 12, 3);

    colorMode(RGB, 255);
    fill(30);
    textSize(12);
    noStroke();

    const pct = Math.round((s.ratio || 0) * 1000) / 10;
    const hours = s.kind === "other" ? null : Math.round((s.playtime_forever_min || 0) / 60);
    const recent = (s.kind !== "other" && (s.playtime_2weeks_min || 0) > 0) ? " · recent" : "";

    let line = "";
    if (s.kind === "other") line = `Other — ${pct}%`;
    else line = `${s.name} — ${pct}% (${hours}h)${recent}`;

    line = shortenToWidth(line, maxTextWidth);

    // ✅ y 用 CENTER 对齐，避免基线造成错位
    text(line, x + 18, y);

    colorMode(HSL, 360, 100, 100, 1);
    // ✅ 防止别的地方改掉 textAlign（保险）
    textAlign(LEFT, CENTER);
  }

  colorMode(RGB, 255);
}

function shortenToWidth(str, maxW) {
  if (textWidth(str) <= maxW) return str;
  let s = str;
  while (s.length > 3 && textWidth(s + "…") > maxW) {
    s = s.slice(0, -1);
  }
  return s + "…";
}

// —— hover 工具函数（沿用你 breakfast 的思路）——
function normAngle(a) {
  a = a % TWO_PI;
  if (a < 0) a += TWO_PI;
  return a;
}

function isAngleInSlice(a, start, end) {
  a = normAngle(a);
  start = normAngle(start);
  end = normAngle(end);

  if (start < end) return a >= start && a < end;
  return a >= start || a < end;
}

function drawTooltip(x, y, msg) {
  push();
  textSize(14);
  textAlign(LEFT, TOP);

  const padding = 8;
  const w = textWidth(msg) + padding * 2;
  const h = 20 + padding * 2;

  let tx = x + 12;
  let ty = y + 12;
  if (tx + w > width) tx = x - w - 12;
  if (ty + h > height) ty = y - h - 12;

  noStroke();
  fill(255);
  rect(tx, ty, w, h, 6);

  fill(0);
  text(msg, tx + padding, ty + padding);
  pop();
}

function windowResized() {
  const wrap = document.getElementById("canvasWrap");
  resizeCanvas(wrap.clientWidth, wrap.clientHeight);
}