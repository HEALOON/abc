const CUT = 1;
const parts = location.pathname.replace(/\/+$/,'').split('/').filter(Boolean);
const base  = parts.length ? parts.slice(0, -CUT).join('/') : '';
console.log("[conductor] base:", base);

let socket;

let mainWrapper = document.querySelector(".main-wrapper");
let frogsWrapper = document.querySelector("#frogs-wrapper");
let frogs = {}; // id -> { elm, cx, cy, nx, ny }

// === Minis (collidable targets) ===
const minis = {}; // name -> { elm, cx, cy, rx, ry }  (rx/ry: ratio in viewport, e.g., 0.3, 0.5)
const MINI_DEFS = [
  { name: "mini0", src: "../imgs/mini0.png", rx: 0.37, ry: 0.50 }, // 中线左侧20% → 30%
  { name: "mini1", src: "../imgs/mini1.png", rx: 0.63, ry: 0.50 }, // 中线右侧20% → 70%
];

// --- Wind chime overlay (drawn via JS; visual only, no logic) ---
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

  // --- bell geometry (flat-bottom circle, visual only) ---
  const cx = 500, cy = 450, r = 220;
  const flatY = 630; // must satisfy |flatY - cy| < r
  const dy = flatY - cy;
  const dx = Math.sqrt(Math.max(0, r*r - dy*dy));
  const xL = cx - dx;
  const xR = cx + dx;

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
  path.setAttribute("d", `M ${xL} ${flatY} A ${r} ${r} 0 1 1 ${xR} ${flatY} L ${xL} ${flatY} Z`);
  path.setAttribute("fill", "rgba(135, 206, 250, 0.18)");
  svg.appendChild(path);

  // upper arc outline (no bottom line)
  const outlineArc = document.createElementNS(svgNS, "path");
  outlineArc.setAttribute("id", "bellOutlineArc");
  outlineArc.setAttribute("d", `M ${xL} ${flatY} A ${r} ${r} 0 1 1 ${xR} ${flatY}`);
  outlineArc.setAttribute("fill", "none");
  outlineArc.setAttribute("stroke", "rgba(150,140,150,0.35)");
  outlineArc.setAttribute("stroke-width", "3.5");
  outlineArc.setAttribute("vector-effect", "non-scaling-stroke");
  outlineArc.setAttribute("filter", "url(#softShadow)");
  svg.appendChild(outlineArc);

  if (frogsWrapper && frogsWrapper.parentNode) {
    frogsWrapper.parentNode.insertBefore(svg, frogsWrapper);
  } else {
    mainWrapper.appendChild(svg);
  }
}

// --- Sound & collision state ---
const SOUND_COUNT = 9; // f0..f8
const sounds = [];
let audioUnlocked = false;
let lastSoundAt = 0;
const COOLDOWN_MS = 200; // 全局最小间隔（毫秒）
const activePairs = new Set();       // frog-frog：当前重叠的配对 "id1|id2"
const activeMiniPairs = new Set();   // frog-mini：当前重叠的配对 "frogId|miniName"

for (let i = 0; i < SOUND_COUNT; i++) {
  const a = new Audio("../frog/sounds/f" + i + ".mp3");
  a.preload = "auto";
  sounds.push(a);
}

function sortedPairKey(id1, id2){
  return id1 < id2 ? (id1 + "|" + id2) : (id2 + "|" + id1);
}
function frogMiniKey(fid, mname){
  return fid + "|" + mname;
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
  if (now - lastSoundAt < COOLDOWN_MS) return;
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

// === Minis: creation & placement ===
function addMiniImages() {
  MINI_DEFS.forEach(def => {
    const img = document.createElement("img");
    img.src = def.src; // 若为 .jpg/.webp，请改后缀
    img.id = def.name;
    img.style.position = "absolute";
    // 初始先居中，待加载后用真实尺寸定位
    img.style.left = (window.innerWidth  / 2 - 50) + "px";
    img.style.top  = (window.innerHeight / 2 - 50) + "px";

    // 放到 frogs-wrapper 之前，确保青蛙显示在它们上方
    if (frogsWrapper && frogsWrapper.parentNode) {
      frogsWrapper.parentNode.insertBefore(img, frogsWrapper);
    } else {
      mainWrapper.appendChild(img);
    }

    minis[def.name] = { elm: img, cx: 0, cy: 0, rx: def.rx, ry: def.ry };

    const placeOnce = () => {
      placeMini(def.name);
    };
    if (img.complete) placeOnce();
    else img.addEventListener("load", placeOnce, { once: true });
  });
}

function placeMini(name){
  const m = minis[name];
  if (!m) return;
  const iw = m.elm.offsetWidth  || 0;
  const ih = m.elm.offsetHeight || 0;

  // 以视窗比例定位（rx, ry 是中心点的比例坐标）
  const cx = Math.round(window.innerWidth  * m.rx);
  const cy = Math.round(window.innerHeight * m.ry);

  const left = cx - Math.round(iw / 2);
  const top  = cy - Math.round(ih / 2);

  m.elm.style.left = left + "px";
  m.elm.style.top  = top  + "px";

  m.cx = cx;
  m.cy = cy;
}

function placeAllMinis(){
  Object.keys(minis).forEach(placeMini);
}

window.addEventListener("load", function(){
  console.log("[conductor] ready");
  ensureStage();

  // 解锁音频（首次用户交互）
  window.addEventListener('pointerdown', () => ensureAudioUnlocked(), { once: true });

  // 仅绘制风铃（装饰），不参与逻辑
  createWindChimeOverlay();

  // 创建并定位 minis（可碰撞目标）
  addMiniImages();

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

  socket.on("frog-pos", function(data){
    updateFrogPos(data.id, data.x, data.y);
  });
});

// 使用图片原图尺寸（不设 width/height）定位
function addFrog(frogData){
  const frogElm = document.createElement("img");
  frogElm.src = "../imgs/frog" + frogData.frogIdx + ".png";
  frogElm.classList.add("frog");
  frogElm.dataset.socketid = frogData.id;

  frogElm.style.position = "absolute";
  // 先大致放中间，等图片真正加载后再用 updateFrogPos 依据实际尺寸定位
  frogElm.style.left = (window.innerWidth  - 100) / 2 + "px";
  frogElm.style.top  = (window.innerHeight - 100) / 2 + "px";

  frogsWrapper.appendChild(frogElm);

  // 记录：不存 size，保存归一化坐标（默认居中）
  frogs[frogData.id] = { elm: frogElm, cx: 0, cy: 0, nx: 0.5, ny: 0.5 };

  // 加载完成后，用真实渲染尺寸（offsetWidth/offsetHeight）重新定位
  const place = () => {
    const item = frogs[frogData.id];
    if (item) updateFrogPos(frogData.id, item.nx, item.ny);
  };
  if (frogElm.complete) {
    place();
  } else {
    frogElm.addEventListener("load", place, { once: true });
  }
}

function updateFrogPos(id, x01, y01){
  const item = frogs[id];
  if(!item) return;

  // 保存归一化坐标
  item.nx = Math.max(0, Math.min(1, x01));
  item.ny = Math.max(0, Math.min(1, y01));

  const iw = item.elm.offsetWidth || 0;
  const ih = item.elm.offsetHeight || 0;

  const maxX = Math.max(0, window.innerWidth  - iw);
  const maxY = Math.max(0, window.innerHeight - ih);

  const x = Math.round(item.nx * maxX);
  const y = Math.round(item.ny * maxY);

  item.elm.style.left = x + "px";
  item.elm.style.top  = y + "px";

  item.cx = x + iw/2;
  item.cy = y + ih/2;

  // 青蛙之间的碰撞
  checkFrogFrogCollisions();

  // 青蛙与 minis 的碰撞
  checkFrogMiniCollisions();
}

window.addEventListener("resize", function(){
  // 先按比例重新放置 minis，再根据缓存的 nx/ny 更新青蛙
  placeAllMinis();
  Object.entries(frogs).forEach(([id, item]) => {
    updateFrogPos(id, item.nx ?? 0.5, item.ny ?? 0.5);
  });
});

// === Collisions ===

// 青蛙 ↔ 青蛙：矩形重叠，进入一次触发，分开复位
function checkFrogFrogCollisions(){
  const ids = Object.keys(frogs);

  for (let i = 0; i < ids.length; i++) {
    const a = frogs[ids[i]];
    if (!a) continue;
    for (let j = i + 1; j < ids.length; j++) {
      const b = frogs[ids[j]];
      if (!b) continue;

      const aw = a.elm.offsetWidth  || 0;
      const ah = a.elm.offsetHeight || 0;
      const ax = parseInt(a.elm.style.left || "0", 10);
      const ay = parseInt(a.elm.style.top  || "0", 10);

      const bw = b.elm.offsetWidth  || 0;
      const bh = b.elm.offsetHeight || 0;
      const bx = parseInt(b.elm.style.left || "0", 10);
      const by = parseInt(b.elm.style.top  || "0", 10);

      const overlap =
        ax < bx + bw &&
        bx < ax + aw &&
        ay < by + bh &&
        by < ay + ah;

      const key = sortedPairKey(ids[i], ids[j]);

      if (overlap) {
        if (!activePairs.has(key)) {
          activePairs.add(key);
          playRandomSound();
        }
      } else {
        if (activePairs.has(key)) {
          activePairs.delete(key);
        }
      }
    }
  }
}

// 青蛙 ↔ minis：矩形重叠，进入一次触发，分开复位
function checkFrogMiniCollisions(){
  const frogIds = Object.keys(frogs);
  const miniNames = Object.keys(minis);

  for (let i = 0; i < frogIds.length; i++) {
    const f = frogs[frogIds[i]];
    if (!f) continue;

    const aw = f.elm.offsetWidth  || 0;
    const ah = f.elm.offsetHeight || 0;
    const ax = parseInt(f.elm.style.left || "0", 10);
    const ay = parseInt(f.elm.style.top  || "0", 10);

    for (let k = 0; k < miniNames.length; k++) {
      const m = minis[miniNames[k]];
      if (!m) continue;

      const bw = m.elm.offsetWidth  || 0;
      const bh = m.elm.offsetHeight || 0;
      const bx = parseInt(m.elm.style.left || "0", 10);
      const by = parseInt(m.elm.style.top  || "0", 10);

      const overlap =
        ax < bx + bw &&
        bx < ax + aw &&
        ay < by + bh &&
        by < ay + ah;

      const key = frogMiniKey(frogIds[i], miniNames[k]);

      if (overlap) {
        if (!activeMiniPairs.has(key)) {
          activeMiniPairs.add(key);
          playRandomSound();
        }
      } else {
        if (activeMiniPairs.has(key)) {
          activeMiniPairs.delete(key);
        }
      }
    }
  }
}