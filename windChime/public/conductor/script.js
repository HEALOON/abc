const CUT = 1;
const parts = location.pathname.replace(/\/+$/,'').split('/').filter(Boolean);
const base  = parts.length ? parts.slice(0, -CUT).join('/') : '';
console.log("[conductor] base:", base);

let socket;

let mainWrapper = document.querySelector(".main-wrapper");
let frogsWrapper = document.querySelector("#frogs-wrapper");
let frogs = {}; // id -> { elm, size }

// 风铃几何信息（在 createWindChimeOverlay 里赋值）
let bellGeom = null; // { cx, cy, r, flatY, xL, xR, vbw, vbh }

// 命中参数（可调）
const ARC_HIT_BAND = 16;           // 判定“碰到轮廓”的带宽（像素，放宽以便更易命中；可再调回 8~12）
const BELL_HIT_COOLDOWN_MS = 350;  // 同一只青蛙连续打在弧线上时的最小间隔
const frogBellLast = new Map();    // frogId -> timestamp

// --- Wind chime overlay (drawn via JS to avoid editing HTML) ---
function createWindChimeOverlay(){
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("id", "windchime-svg");
  svg.setAttribute("viewBox", "0 0 1000 1000");
  svg.setAttribute("aria-hidden", "true");
  Object.assign(svg.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    overflow: "visible",
  });

  // defs: soft shadow
  const defs = document.createElementNS(svgNS, "defs");
  const filter = document.createElementNS(svgNS, "filter");
  filter.setAttribute("id", "softShadow");
  filter.setAttribute("x", "-20%");
  filter.setAttribute("y", "-20%");
  filter.setAttribute("width", "140%");
  filter.setAttribute("height", "140%");
  const fe = document.createElementNS(svgNS, "feDropShadow");
  fe.setAttribute("dx", "0");
  fe.setAttribute("dy", "3");
  fe.setAttribute("stdDeviation", "6");
  fe.setAttribute("flood-color", "#000");
  fe.setAttribute("flood-opacity", "0.15");
  filter.appendChild(fe);
  defs.appendChild(filter);
  svg.appendChild(defs);

  // --- bell geometry (flat-bottom circle) ---
  const cx = 500, cy = 450, r = 220;
  // Choose a flat-bottom y inside the circle (closer to the bottom => flatter)
  const flatY = 630; // must satisfy |flatY - cy| < r
  const dy = flatY - cy;
  const dx = Math.sqrt(Math.max(0, r*r - dy*dy));
  const xL = cx - dx;
  const xR = cx + dx;
  bellGeom = { cx, cy, r, flatY, xL, xR, vbw: 1000, vbh: 1000 };

  // string
  const line = document.createElementNS(svgNS, "line");
  line.setAttribute("id", "bellString");
  line.setAttribute("x1", "500");
  line.setAttribute("y1", "0");
  line.setAttribute("x2", "500");
  line.setAttribute("y2", "230");
  line.setAttribute("stroke", "rgba(150,140,150,0.35)");
  line.setAttribute("stroke-width", "4");
  line.setAttribute("vector-effect", "non-scaling-stroke");
  svg.appendChild(line);

  // inner translucent glass (circular arc + flat chord)
  const path = document.createElementNS(svgNS, "path");
  path.setAttribute("id", "bellFill");
  // large-arc-flag=1, sweep-flag=1 to take the long (upper) arc
  path.setAttribute("d", `M ${xL} ${flatY} A ${r} ${r} 0 1 1 ${xR} ${flatY} L ${xL} ${flatY} Z`);
  path.setAttribute("fill", "rgba(135, 206, 250, 0.18)");
  svg.appendChild(path);

  // outer contour split into two parts:
  // 1) upper arc (circular outline only, no bottom)
  const outlineArc = document.createElementNS(svgNS, "path");
  outlineArc.setAttribute("id", "bellOutlineArc");
  outlineArc.setAttribute("d", `M ${xL} ${flatY} A ${r} ${r} 0 1 1 ${xR} ${flatY}`);
  outlineArc.setAttribute("fill", "none");
  outlineArc.setAttribute("stroke", "rgba(150,140,150,0.35)"); // can be overridden via CSS
  outlineArc.setAttribute("stroke-width", "3.5");
  outlineArc.setAttribute("vector-effect", "non-scaling-stroke");
  outlineArc.setAttribute("filter", "url(#softShadow)");
  svg.appendChild(outlineArc);

  // 2) flat bottom edge (pure black)
  const outlineBottom = document.createElementNS(svgNS, "line");
  outlineBottom.setAttribute("id", "bellOutlineBottom");
  outlineBottom.setAttribute("x1", String(xL));
  outlineBottom.setAttribute("y1", String(flatY));
  outlineBottom.setAttribute("x2", String(xR));
  outlineBottom.setAttribute("y2", String(flatY));
  outlineBottom.setAttribute("stroke", "#000"); // pure black
  outlineBottom.setAttribute("stroke-width", "3.5");
  outlineBottom.setAttribute("vector-effect", "non-scaling-stroke");
  outlineBottom.setAttribute("filter", "url(#softShadow)");
  svg.appendChild(outlineBottom);

  // insert before frogs layer so frogs appear above (but svg is pointer-events none)
  if (frogsWrapper && frogsWrapper.parentNode) {
    frogsWrapper.parentNode.insertBefore(svg, frogsWrapper);
  } else {
    // fallback
    mainWrapper.appendChild(svg);
  }
}

// --- Sound & collision state ---
const SOUND_COUNT = 9; // f0..f8
const sounds = [];
let audioUnlocked = false;
let lastSoundAt = 0;
const COOLDOWN_MS = 700; // play at most once per 700ms
const activePairs = new Set(); // track currently-colliding pairs "id1|id2"

for (let i = 0; i < SOUND_COUNT; i++) {
  const a = new Audio("../frog/sounds/f" + i + ".mp3");
  a.preload = "auto";
  sounds.push(a);
}

function sortedPairKey(id1, id2){
  return id1 < id2 ? (id1 + "|" + id2) : (id2 + "|" + id1);
}

async function ensureAudioUnlocked() {
  if (audioUnlocked) return true;
  try {
    await sounds[0].play();
    sounds[0].pause();
    sounds[0].currentTime = 0;
    audioUnlocked = true;
    return true;
  } catch (e) {
    // 如果浏览器禁止自动播放，则显示按钮
    let btn = document.getElementById("enable-audio");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "enable-audio";
      btn.textContent = "Enable Sound";
      btn.style.position = "fixed";
      btn.style.right = "12px";
      btn.style.top = "12px";
      btn.style.zIndex = "9999";
      btn.style.padding = "6px 10px";
      btn.style.fontSize = "12px";
      btn.style.opacity = "0.85";
      btn.addEventListener("click", async () => {
        try {
          await sounds[0].play();
          sounds[0].pause();
          sounds[0].currentTime = 0;
          audioUnlocked = true;
          btn.remove();
        } catch (err) {
          console.warn("Audio unlock failed:", err);
        }
      });
      document.body.appendChild(btn);
    }
    return false;
  }
}

async function playRandomSound(){
  const now = Date.now();
  if (now - lastSoundAt < COOLDOWN_MS) return; // 冷却时间
  const ok = await ensureAudioUnlocked();
  if (!ok) return;
  lastSoundAt = now;
  const idx = Math.floor(Math.random() * SOUND_COUNT);
  try {
    await sounds[idx].play();
  } catch (e) {
    console.warn("play failed:", e);
  }
}

function ensureStage() {
  mainWrapper.style.position = "relative";
  mainWrapper.style.width = "100vw";
  mainWrapper.style.height = "100vh";
  mainWrapper.style.overflow = "hidden";

  frogsWrapper.style.position = "relative";
  frogsWrapper.style.width = "100%";
  frogsWrapper.style.height = "100%";
  frogsWrapper.style.overflow = "hidden";
}

window.addEventListener("load", function(){
  console.log("[conductor] ready");
  ensureStage();

  // 主动尝试在首次交互时解锁音频
  window.addEventListener('pointerdown', () => ensureAudioUnlocked(), { once: true });

  createWindChimeOverlay();

  socket = io({ path: base + '/socket.io' });
  socket.emit("my-role", { role:"conductor" });

  socket.on("all-frogs", function(allFrogs){
    allFrogs.forEach(function(f){
      addFrog(f);
      updateFrogPos(f.id, f.x ?? 0.5, f.y ?? 0.5);
    });
  });

  socket.on("new-frog", function(frogData){
    addFrog(frogData);
    updateFrogPos(frogData.id, frogData.x ?? 0.5, frogData.y ?? 0.5);
  });

  socket.on("delete-frog", function(socketID){
    let item = frogs[socketID];
    if(item){
      item.elm.remove();
      delete frogs[socketID];
    }
  });

  // 来自服务器的实时位置更新
  socket.on("frog-pos", function(data){
    updateFrogPos(data.id, data.x, data.y);
  });
});

function frogSizeForViewport() {
  // 指挥端更小（短边的 1/10）
  return Math.min(window.innerWidth, window.innerHeight) / 10;
}

function addFrog(frogData){
  const size = frogSizeForViewport();

  let frogElm = document.createElement("img");
  frogElm.src = "../imgs/frog"+frogData.frogIdx+".png";
  frogElm.classList.add("frog");
  frogElm.dataset.socketid = frogData.id;

  frogElm.width = size;
  frogElm.height = size;

  frogElm.style.position = "absolute";
  frogElm.style.left = (window.innerWidth - size)/2 + "px";
  frogElm.style.top  = (window.innerHeight - size)/2 + "px";

  const cx = (window.innerWidth - size)/2 + size/2;
  const cy = (window.innerHeight - size)/2 + size/2;

  frogsWrapper.appendChild(frogElm);
  frogs[frogData.id] = { elm: frogElm, size, cx, cy };
}

function updateFrogPos(id, x01, y01){
  const item = frogs[id];
  if(!item) return;

  const size = item.size;
  const maxX = Math.max(0, window.innerWidth - size);
  const maxY = Math.max(0, window.innerHeight - size);

  const x = Math.round(Math.max(0, Math.min(1, x01)) * maxX);
  const y = Math.round(Math.max(0, Math.min(1, y01)) * maxY);

  item.elm.style.left = x + "px";
  item.elm.style.top  = y + "px";

  item.cx = x + size/2;
  item.cy = y + size/2;

  // 检测是否击中风铃上半圆弧（随机播放一声）
  checkBellHitForFrog(id, item);

  checkCollisions();
}

// —— 最简命中：只认上半圆弧；忽略底边黑线；不考虑青蛙半径 —— 
function checkBellHitForFrog(id, frogItem){
  if (!bellGeom) return;
  const { cx, cy, r, flatY, xL, xR, vbw, vbh } = bellGeom;

  // 屏幕像素 -> SVG 坐标
  const scaleX = vbw / window.innerWidth;
  const scaleY = vbh / window.innerHeight;
  const fxSvg = frogItem.cx * scaleX;
  const fySvg = frogItem.cy * scaleY;

  // 命中带宽（SVG 空间）
  const band = ARC_HIT_BAND * (scaleX + scaleY) / 2;

  // 严格忽略底边
  if (fySvg >= flatY - 0.5) return;

  // 限定在左右弦之间
  if (fxSvg < xL - band || fxSvg > xR + band) return;

  // 与圆边的简单距离判定
  const dx = fxSvg - cx;
  const dy = fySvg - cy;
  const d  = Math.sqrt(dx*dx + dy*dy);

  if (Math.abs(d - r) <= band) {
    const now = Date.now();
    const last = frogBellLast.get(id) || 0;
    if (now - last >= BELL_HIT_COOLDOWN_MS) {
      frogBellLast.set(id, now);
      playRandomSound();
    }
  }
}

window.addEventListener("resize", function(){
  const newSize = frogSizeForViewport();
  Object.values(frogs).forEach(item => {
    const prevLeft = parseInt(item.elm.style.left || "0", 10);
    const prevTop  = parseInt(item.elm.style.top  || "0", 10);
    const prevSize = item.size;

    const x01 = prevSize > 0 ? prevLeft / Math.max(1, window.innerWidth  - prevSize) : 0.5;
    const y01 = prevSize > 0 ? prevTop  / Math.max(1, window.innerHeight - prevSize) : 0.5;

    item.size = newSize;
    item.elm.width = newSize;
    item.elm.height = newSize;

    updateFrogPos(item.elm.dataset.socketid, x01, y01);
  });
});

function checkCollisions(){
  const ids = Object.keys(frogs);
  const stillColliding = new Set();

  for (let i = 0; i < ids.length; i++) {
    const a = frogs[ids[i]];
    if (!a) continue;
    for (let j = i + 1; j < ids.length; j++) {
      const b = frogs[ids[j]];
      if (!b) continue;
      const dx = (a.cx ?? 0) - (b.cx ?? 0);
      const dy = (a.cy ?? 0) - (b.cy ?? 0);
      const dist2 = dx*dx + dy*dy;
      const r = (a.size + b.size) / 2;
      const collided = dist2 <= r*r;
      const key = sortedPairKey(ids[i], ids[j]);
      if (collided) {
        stillColliding.add(key);
        if (!activePairs.has(key)) {
          activePairs.add(key);
          playRandomSound();
        }
      } else {
        if (activePairs.has(key)) activePairs.delete(key);
      }
    }
  }

  [...activePairs].forEach(key => {
    if (!stillColliding.has(key)) activePairs.delete(key);
  });
}