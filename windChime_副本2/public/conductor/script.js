const CUT = 1;
const parts = location.pathname.replace(/\/+$/,'').split('/').filter(Boolean);
const base  = parts.length ? parts.slice(0, -CUT).join('/') : '';
console.log("[conductor] base:", base);

let socket;

let mainWrapper = document.querySelector(".main-wrapper");
let frogsWrapper = document.querySelector("#frogs-wrapper");
let frogs = {}; // id -> { elm, cx, cy, nx, ny }

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

// --- Sound & collision state (frog↔frog only) ---
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

window.addEventListener("load", function(){
  console.log("[conductor] ready");
  ensureStage();

  // 解锁音频（首次用户交互）
  window.addEventListener('pointerdown', () => ensureAudioUnlocked(), { once: true });

  // 仅绘制风铃（装饰），不参与逻辑
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

  socket.on("frog-pos", function(data){
    updateFrogPos(data.id, data.x, data.y);
  });
});

// 使用图片原始尺寸（缩小为 1/10 后）定位
function addFrog(frogData){
  let frogElm = document.createElement("img");
  frogElm.src = "../imgs/frog" + frogData.frogIdx + ".png";
  frogElm.classList.add("frog");
  frogElm.dataset.socketid = frogData.id;

  frogElm.style.position = "absolute";
  frogElm.style.left = (window.innerWidth  - 100) / 2 + "px";
  frogElm.style.top  = (window.innerHeight - 100) / 2 + "px";

  frogsWrapper.appendChild(frogElm);
  frogs[frogData.id] = { elm: frogElm, cx: 0, cy: 0, nx: 0.5, ny: 0.5 };

  // —— 等比例缩小为原图的 1/10 —— //
  function scaleToOneTenth(img){
    const nw = img.naturalWidth  || img.width  || img.offsetWidth  || 0;
    const nh = img.naturalHeight || img.height || img.offsetHeight || 0;
    if (nw && nh) {
      img.width  = Math.max(1, Math.round(nw / 10));
      img.height = Math.max(1, Math.round(nh / 10));
    }
  }

  const applyScaleAndPlace = () => {
    scaleToOneTenth(frogElm);
    const item = frogs[frogData.id];
    if (item) updateFrogPos(frogData.id, item.nx, item.ny);
  };

  if (frogElm.complete) {
    applyScaleAndPlace();
  } else {
    frogElm.addEventListener('load', applyScaleAndPlace, { once: true });
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

  // 仅保留青蛙↔青蛙碰撞
  checkCollisions();
}

window.addEventListener("resize", function(){
  Object.entries(frogs).forEach(([id, item]) => {
    updateFrogPos(id, item.nx ?? 0.5, item.ny ?? 0.5);
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

      // 基于图片实际渲染尺寸的“有效半径”
      const ar = Math.min(a.elm.offsetWidth || 0, a.elm.offsetHeight || 0) / 2;
      const br = Math.min(b.elm.offsetWidth || 0, b.elm.offsetHeight || 0) / 2;

      const collided = dist2 <= Math.pow(ar + br, 2);
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

  // 清理已经分开的 pair
  [...activePairs].forEach(key => {
    if (!stillColliding.has(key)) activePairs.delete(key);
  });
}