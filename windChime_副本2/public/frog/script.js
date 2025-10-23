const CUT = 1;
const parts = location.pathname.replace(/\/+$/,'').split('/').filter(Boolean);
const base  = parts.length ? parts.slice(0, -CUT).join('/') : '';
console.log("[frog] base:", base);

let socket;

let readyButton = document.querySelector("#ready");
let mainWrapper = document.querySelector(".main-wrapper");

let audioElm, imgElm;
let frogIdx;

// --- motion tuning (slower movement) ---
let posX = 0.5, posY = 0.5;       // smoothed position (0..1)
let targetX = 0.5, targetY = 0.5; // raw target (0..1) from sensors
const SMOOTH = 0.17;              // smoothing factor (smaller = slower)
const SEND_EVERY_MS = 60;         // throttle network updates (ms)
let _lastSend = 0;                // timestamp for throttling
// widen the mapping range to reduce sensitivity (tilt more to move same distance)
const GAMMA_MIN = -60, GAMMA_MAX = 60; // left/right range (deg)
const BETA_MIN  =   0, BETA_MAX  = 90; // up/down range (deg)

// 映射角度到 [0,1]
function normalize(valDeg, minDeg, maxDeg) {
  const clamped = Math.max(minDeg, Math.min(maxDeg, valDeg));
  return (clamped - minDeg) / (maxDeg - minDeg);
}
function clamp01(v){ return Math.max(0, Math.min(1, v)); }

// 把归一化坐标转为像素（带边界）——基于图片当前渲染尺寸
function applyPosition(nx, ny) {
  const w = window.innerWidth;
  const h = window.innerHeight;

  // 用当前元素实际渲染尺寸（未人为设定宽高时即为图片原始显示尺寸）
  const iw = imgElm ? imgElm.offsetWidth  : 0;
  const ih = imgElm ? imgElm.offsetHeight : 0;

  const maxX = Math.max(0, w - iw);
  const maxY = Math.max(0, h - ih);
  const x = Math.round(nx * maxX);
  const y = Math.round(ny * maxY);

  imgElm.style.left = x + "px";
  imgElm.style.top  = y + "px";
}

function startOrientation() {
  function onOrient(e) {
    const gamma = typeof e.gamma === "number" ? e.gamma : 0;
    const beta  = typeof e.beta  === "number" ? e.beta  : 0;
    // Use gentler ranges to reduce sensitivity
    const nx = normalize(gamma, GAMMA_MIN, GAMMA_MAX);
    const ny = normalize(beta,  BETA_MIN,  BETA_MAX);
    targetX = clamp01(nx);
    targetY = clamp01(ny);
  }
  window.addEventListener("deviceorientation", onOrient, { passive: true });
}

readyButton.addEventListener("click", async function(){
  // 尝试锁定竖屏（失败静默）
  try {
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock('portrait');
    }
  } catch (e) {}

  // 舞台容器
  mainWrapper.style.position = "relative";
  mainWrapper.style.width = "100vw";
  mainWrapper.style.height = "100vh";
  mainWrapper.style.overflow = "hidden";

  mainWrapper.append(imgElm);
  readyButton.remove();

  // iOS 权限
  try {
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      const resp = await DeviceOrientationEvent.requestPermission();
      if (resp !== "granted") {
        alert("Motion permission not granted. The frog will not move.");
      }
    }
  } catch (err) {
    console.warn("Orientation permission error:", err);
  }

  // 连接 socket
  socket = io({ path: base + '/socket.io' });

  // 身份上报
  socket.emit("my-role", { role:"frog", frogIdx, x:0.5, y:0.5 });

  // 轻微确认声
  setTimeout(() => audioElm.play().catch(()=>{}), 100);

  // 启动陀螺仪
  startOrientation();

  // 启动平滑渲染与限频发送
  startTick();
});

window.addEventListener("load", function(){
  console.log("[frog] ready");

  frogIdx = Math.floor(Math.random()*9);

  // audio
  audioElm = document.createElement("audio");
  audioElm.controls = true;
  audioElm.id = "frogSound";
  audioElm.innerHTML = `
    <source src="sounds/f${frogIdx}.mp3" type="audio/mpeg">
    Your browser does not support the audio element.
  `;

  // image
  imgElm = document.createElement("img");
  imgElm.src = "../imgs/frog"+frogIdx+".png";
  imgElm.id = "frogImg";

  // 绝对定位（不设置 width/height，使用图片本身大小）
  imgElm.style.position = "absolute";

  // 图片加载完后才能拿到实际宽高，居中一次并初始化 pos/target
  imgElm.addEventListener("load", () => {
    // 等比例缩小为原图的 1/10
    const nw = imgElm.naturalWidth  || imgElm.width  || imgElm.offsetWidth  || 0;
    const nh = imgElm.naturalHeight || imgElm.height || imgElm.offsetHeight || 0;
    const scaledW = Math.max(1, Math.round(nw / 10));
    const scaledH = Math.max(1, Math.round(nh / 10));
    imgElm.width  = scaledW;
    imgElm.height = scaledH;

    // 使用缩放后的尺寸进行一次居中
    const iw = imgElm.offsetWidth;
    const ih = imgElm.offsetHeight;
    imgElm.style.left = (window.innerWidth  - iw) / 2 + "px";
    imgElm.style.top  = (window.innerHeight - ih) / 2 + "px";

    // 初始位置（归一化）设为居中
    posX = targetX = 0.5;
    posY = targetY = 0.5;
  });

  // 点击本地也可播放
  imgElm.addEventListener("click", () => audioElm.play().catch(()=>{}));
});

function startTick(){
  function tick(ts){
    // exponential smoothing toward target
    posX += (targetX - posX) * SMOOTH;
    posY += (targetY - posY) * SMOOTH;
    applyPosition(posX, posY);
    // throttle network sends
    if (socket && (ts - _lastSend >= SEND_EVERY_MS)) {
      _lastSend = ts;
      socket.emit("frog-pos", { x: posX, y: posY });
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}