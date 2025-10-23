const CUT = 1;
const parts = location.pathname.replace(/\/+$/,'').split('/').filter(Boolean);
const base  = parts.length ? parts.slice(0, -CUT).join('/') : '';
console.log("[frog] base:", base);

let socket;

let readyButton = document.querySelector("#ready");
let mainWrapper = document.querySelector(".main-wrapper");

let audioElm, imgElm;
let frogIdx;
let frogSize;

// 映射角度到 [0,1]
function normalize(valDeg, minDeg, maxDeg) {
  const clamped = Math.max(minDeg, Math.min(maxDeg, valDeg));
  return (clamped - minDeg) / (maxDeg - minDeg);
}
function clamp01(v){ return Math.max(0, Math.min(1, v)); }

// 把归一化坐标转为像素（带边界）
function applyPosition(nx, ny) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const maxX = Math.max(0, w - frogSize);
  const maxY = Math.max(0, h - frogSize);
  const x = Math.round(nx * maxX);
  const y = Math.round(ny * maxY);

  imgElm.style.left = x + "px";
  imgElm.style.top  = y + "px";
}

function startOrientation() {
  function onOrient(e) {
    const gamma = typeof e.gamma === "number" ? e.gamma : 0; // 左右
    const beta  = typeof e.beta  === "number" ? e.beta  : 0; // 前后

    // 可根据手持姿势调节灵敏度范围
    const nx = normalize(gamma, -45, 45); // -45~45 → 0~1
    const ny = normalize(beta,   10, 80); //  10~80 → 0~1

    const x01 = clamp01(nx);
    const y01 = clamp01(ny);

    // 本地移动自己的青蛙
    applyPosition(x01, y01);
    // 把位置发给服务器（conductor 端汇总显示）
    socket && socket.emit("frog-pos", { x: x01, y: y01 });
  }
  window.addEventListener("deviceorientation", onOrient, { passive: true });
}

readyButton.addEventListener("click", async function(){
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

  // 尺寸：让青蛙更小（短边的 1/6）
  frogSize = Math.round(Math.min(window.innerWidth, window.innerHeight) / 6);
  imgElm.width = frogSize;
  imgElm.height = frogSize;

  // 绝对定位
  imgElm.style.position = "absolute";
  imgElm.style.left = (window.innerWidth - frogSize)/2 + "px";
  imgElm.style.top  = (window.innerHeight - frogSize)/2 + "px";

  // 点击本地也可播放
  imgElm.addEventListener("click", () => audioElm.play().catch(()=>{}));
});

// 旋转/改变窗口大小时，自适应尺寸并保持位置
window.addEventListener("resize", function(){
  // 以当前像素位置反推归一化坐标
  const prevLeft = parseInt(imgElm.style.left || "0", 10);
  const prevTop  = parseInt(imgElm.style.top  || "0", 10);
  const prevSize = frogSize || 1;
  const x01 = prevLeft / Math.max(1, window.innerWidth  - prevSize);
  const y01 = prevTop  / Math.max(1, window.innerHeight - prevSize);

  // 重新计算尺寸（同上规则）
  frogSize = Math.round(Math.min(window.innerWidth, window.innerHeight) / 6);
  imgElm.width = frogSize;
  imgElm.height = frogSize;

  // 在新边界内重新定位
  applyPosition(x01, y01);
});