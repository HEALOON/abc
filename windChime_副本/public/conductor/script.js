const CUT = 1;
const parts = location.pathname.replace(/\/+$/,'').split('/').filter(Boolean);
const base  = parts.length ? parts.slice(0, -CUT).join('/') : '';
console.log("[conductor] base:", base);

let socket;

let mainWrapper = document.querySelector(".main-wrapper");
let frogsWrapper = document.querySelector("#frogs-wrapper");
let frogs = {}; // id -> { elm, size }

// --- Sound & collision state ---
const SOUND_COUNT = 9; // f0..f8
const sounds = [];
let audioUnlocked = false;
let lastSoundAt = 0;
const COOLDOWN_MS = 700; // play at most once per 700ms
const activePairs = new Set(); // track currently-colliding pairs "id1|id2"

for (let i = 0; i < SOUND_COUNT; i++) {
  const a = new Audio("../frog/sounds/f" + i + ".m4a");
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

  checkCollisions();
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