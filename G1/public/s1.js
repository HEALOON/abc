// ========== sketch.js (start wizard + name/emoji + GPS + rotating safe zones) ==========
// 功能概述：
// 1) 启动引导三步：输入名称 → 选择分组 emoji（🐭/🐱）→ Request GPS
// 2) 与服务器通过 Socket.IO 同步位置/emoji/名称（名称与 socket.id 绑定）
// 3) 安全区在 5 个固定点之间按顺序轮换（每 8 秒），到第 5 个后停止
// 4) 安全区为以中心点为基准、半边 25 米的正方形（橘色描边、浅绿色填充）
// 5) 地图：Mappa + Leaflet 高德瓦片，p5 画布 overlay，人物圆点 + emoji 居中显示，名称在下方

let mappa = new Mappa('Leaflet');
let myMap;
let canvas;

let currentLongitude = 0;
let currentLatitude  = 0;
let mapInit = false;

let me;
let others = [];

let socket;
let myEmoji = null;       // "🐭" or "🐱"
let myName  = "";         // 用户输入名称
let mySocketId = "";      // 从服务器得到的唯一 socket.id（或 socket 自身）

// —— 安全区配置：5 个固定点，按顺序轮换，每 8 秒切换一次，到第 5 个后停止 ——
const SAFEZONE_POINTS = [
  { lat: 31.151517, lon: 121.480270 }, // 1
  { lat: 31.148650, lon: 121.482401 }, // 2
  { lat: 31.150231, lon: 121.484472 }, // 3
  { lat: 31.149892, lon: 121.481752 }, // 4
  { lat: 31.148546, lon: 121.483528 }  // 5
];
const SAFEZONE_STEP_MS   = 8000;   // 测试用：每 8 秒切换（原需求 2 分钟）
const SAFEZONE_HALF_M    = 25;     // 安全区半边 25m（边长 50m）
let   safezoneIndex      = 0;
let   safezoneCenter     = { ...SAFEZONE_POINTS[0] };
let   safezoneIntervalId = null;

// 启动引导（step 1/2/3）
let startOverlayEl = null;
let startStep = 1;        // 1=输入名称; 2=选 emoji; 3=Request GPS; 4=完成/隐藏

// 根据域名选择 socket.io 路径
if (location.hostname.toLowerCase().startsWith('browsercircus')) {
  socket = io({ path: "/gps-see-everyone/socket.io" });
} else {
  socket = io();
}

// 地图参数（lat/lng 在拿到首个 GPS 后写入）
let mappa_options = {
  lat: 0,
  lng: 0,
  zoom: 16,
  style: "https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}",
};

// ---------- p5 生命周期 ----------
function setup() {
  canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent("p5-canvas-container");
  me = new Person("ME"); // 不再显示这个 id，只作为内部标识

  // 隐藏 index.html 里原有的按钮/选择器，交由启动引导接管
  const oldBtn = document.getElementById("requestOrientationButton");
  if (oldBtn) oldBtn.style.display = "none";
  const oldChooser = document.getElementById("emoji-chooser");
  if (oldChooser) oldChooser.style.display = "none";

  buildStartOverlay();       // 构建并显示启动引导 UI
  startSafezoneRotation();   // 启动安全区轮换（到第 5 个后自动停止）
}

function draw() {
  clear();

  // 首次满足条件时初始化地图
  if (!mapInit && typeof GPS_GRANTED !== "undefined" && GPS_GRANTED && currentLongitude !== 0) {
    mappa_options.lat = currentLatitude;
    mappa_options.lng = currentLongitude;
    myMap = mappa.tileMap(mappa_options);
    myMap.overlay(canvas);
    myMap.onChange(updateMapContent);
    mapInit = true;
  }

  noStroke();
  fill(0, 160);
  rect(0, 0, width, height);

  if (mapInit) {
    me.update();
    me.display();

    for (const o of others) {
      o.update();
      o.display();
    }

    drawPointers(others);
    drawPointers([me]);
    drawSafezoneSquare();
  }

  // 若处于“请求 GPS”阶段，且已授予，则自动关闭引导
  if (startStep === 3 && typeof GPS_GRANTED !== "undefined" && GPS_GRANTED) {
    advanceStartStep(); // 进入完成态并隐藏
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// ---------- 启动引导 UI ----------
function buildStartOverlay(){
  startOverlayEl = document.createElement("div");
  startOverlayEl.id = "start-overlay";
  // 简单内联样式
  Object.assign(startOverlayEl.style, {
    position: "fixed",
    inset: "0",
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: "10000",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  });

  const panel = document.createElement("div");
  Object.assign(panel.style, {
    background: "#fff",
    borderRadius: "12px",
    padding: "20px 24px",
    width: "min(90vw, 420px)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
    textAlign: "center"
  });

  // 标题
  const h = document.createElement("h2");
  h.textContent = "Start";
  Object.assign(h.style, { margin: "0 0 12px 0" });

  // 内容容器
  const content = document.createElement("div");
  content.id = "start-content";

  panel.appendChild(h);
  panel.appendChild(content);
  startOverlayEl.appendChild(panel);
  document.body.appendChild(startOverlayEl);

  renderStartStep();
}

function renderStartStep(){
  if(!startOverlayEl) return;
  const content = startOverlayEl.querySelector("#start-content");
  content.innerHTML = "";

  if(startStep === 1){
    // Step 1: 输入名称
    const p = document.createElement("p");
    p.textContent = "请输入你的名称（将绑定到你的唯一连接）";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "例如：Alice / 小王";
    input.value = localStorage.getItem("gse_name") || "";
    Object.assign(input.style, {
      width: "100%", padding: "10px 12px", margin: "12px 0",
      borderRadius: "8px", border: "1px solid #ccc", fontSize: "16px"
    });
    const btn = document.createElement("button");
    btn.textContent = "确定";
    Object.assign(btn.style, {
      padding: "10px 16px", borderRadius: "8px", border: "none",
      background: "#4a7", color: "#fff", fontSize: "16px", cursor: "pointer"
    });
    btn.onclick = ()=>{
      const name = (input.value || "").trim();
      if(!name){ input.focus(); return; }
      myName = name;
      localStorage.setItem("gse_name", myName);
      // 如果已拿到 socket.id，则立即上报名称
      if(mySocketId) socket.emit("nameFromClient", { name: myName });
      advanceStartStep();
    };
    content.appendChild(p);
    content.appendChild(input);
    content.appendChild(btn);
  }
  else if(startStep === 2){
    // Step 2: 选择 emoji
    const p = document.createElement("p");
    p.textContent = "请选择分组（emoji）：";
    const row = document.createElement("div");
    Object.assign(row.style, { display:"flex", gap:"12px", justifyContent:"center", marginTop:"12px" });

    const mkBtn = (emoji) => {
      const b = document.createElement("button");
      b.textContent = emoji;
      Object.assign(b.style, {
        width:"64px", height:"64px", fontSize:"32px", lineHeight:"64px",
        borderRadius:"12px", border:"2px solid #ccc", cursor:"pointer", background:"#fff"
      });
      b.onclick = ()=>{
        myEmoji = emoji;
        if(me) me.emoji = emoji;
        socket.emit("emojiFromClient", { emoji });
        advanceStartStep();
      };
      return b;
    };

    row.appendChild(mkBtn("🐭"));
    row.appendChild(mkBtn("🐱"));

    content.appendChild(p);
    content.appendChild(row);
  }
  else if(startStep === 3){
    // Step 3: Request GPS
    const p = document.createElement("p");
    p.textContent = "需要定位权限以开始游戏：";
    const btn = document.createElement("button");
    btn.textContent = "Request GPS";
    Object.assign(btn.style, {
      padding: "10px 16px", borderRadius: "8px", border: "none",
      background: "#2d6cdf", color: "#fff", fontSize: "16px", cursor: "pointer", marginTop: "12px"
    });
    btn.onclick = ()=>{
      try { requestGPS(); } catch(e){ console.warn("requestGPS.js 未就绪", e); }
    };
    content.appendChild(p);
    content.appendChild(btn);
    const tip = document.createElement("div");
    tip.textContent = "允许后将自动进入地图。";
    Object.assign(tip.style, { marginTop:"8px", color:"#666", fontSize:"14px" });
    content.appendChild(tip);
  }
  else {
    // 完成/隐藏
    startOverlayEl.style.display = "none";
  }
}

function advanceStartStep(){
  startStep++;
  if(startStep > 3) startStep = 4;
  renderStartStep();
}

// ---------- 安全区轮换 ----------
function startSafezoneRotation(){
  safezoneIndex  = 0;
  safezoneCenter = { ...SAFEZONE_POINTS[0] };

  if (safezoneIntervalId) {
    clearInterval(safezoneIntervalId);
    safezoneIntervalId = null;
  }

  safezoneIntervalId = setInterval(() => {
    if (safezoneIndex < SAFEZONE_POINTS.length - 1) {
      safezoneIndex++;
      safezoneCenter = { ...SAFEZONE_POINTS[safezoneIndex] };
    } else {
      clearInterval(safezoneIntervalId);
      safezoneIntervalId = null;
    }
  }, SAFEZONE_STEP_MS);
}

// ---------- 屏幕外方向指示器 ----------
function drawPointers(points) {
  if (!mapInit || !myMap?.map) return;
  for (const p of points) {
    if (!checkIfOnMap(p.lat, p.lon)) {
      const dx = p.x - width / 2;
      const dy = p.y - height / 2;
      const angRad = Math.atan2(dy, dx);

      const pointerPos = pointOnRectEdge(10, width - 10, 10, height - 10, angRad);

      push();
      translate(pointerPos.x, pointerPos.y);
      rotate(angRad - PI / 2);
      scale(1.4);
      fill(color(170, 240, 190));
      stroke("pink");
      strokeWeight(3);
      triangle(-4, -4, 0, 4, 4, -4);
      pop();
    }
  }
}

// ---------- 绘制“半边 25m 的正方形安全区”（橘边、浅绿填充） ----------
function drawSafezoneSquare() {
  if (!mapInit || !safezoneCenter) return;

  const center = myMap.latLngToPixel(safezoneCenter.lat, safezoneCenter.lon);

  const dLat = metersToLat(SAFEZONE_HALF_M);
  const dLng = metersToLng(SAFEZONE_HALF_M, safezoneCenter.lat);

  const eastPx  = myMap.latLngToPixel(safezoneCenter.lat, safezoneCenter.lon + dLng);
  const northPx = myMap.latLngToPixel(safezoneCenter.lat + dLat, safezoneCenter.lon);

  const halfW = Math.abs(eastPx.x  - center.x);
  const halfH = Math.abs(northPx.y - center.y);
  const half  = Math.min(halfW, halfH);

  push();
  rectMode(CENTER);
  stroke(255, 165, 0);                 // 橘色边框
  strokeWeight(3);
  fill(180, 255, 190, 140);            // 浅绿色半透明填充
  rect(center.x, center.y, half * 2, half * 2);
  pop();
}

// ---------- 米/经纬换算（近似） ----------
function metersToLat(m) {             // 1° 纬度 ≈ 111320 m
  return m / 111320;
}
function metersToLng(m, lat) {        // 1° 经度 ≈ 111320 * cos(lat)
  return m / (111320 * Math.cos(lat * Math.PI / 180));
}

// ---------- 辅助：求“从矩形中心沿 angle 发射的射线”与矩形边的交点 ----------
function pointOnRectEdge(x1, x2, y1, y2, angle) {
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const EPS = 1e-12;
  const sdx = Math.abs(dx) < EPS ? 0 : dx;
  const sdy = Math.abs(dy) < EPS ? 0 : dy;

  let tx = Infinity;
  if (sdx !== 0) tx = dx > 0 ? (x2 - cx) / dx : (x1 - cx) / dx;

  let ty = Infinity;
  if (sdy !== 0) ty = dy > 0 ? (y2 - cy) / dy : (y1 - cy) / dy;

  const t = Math.min(tx, ty);
  return { x: cx + t * dx, y: cy + t * dy };
}

// ---------- GPS 回调：由 requestGPS.js 调用 ----------
function handleNewPosition(pos) {
  const lonlat = (typeof fixForChineseMap === "function")
    ? fixForChineseMap(pos)
    : [pos.coords.longitude, pos.coords.latitude];

  currentLongitude = lonlat[0];
  currentLatitude  = lonlat[1];

  me.lon = currentLongitude;
  me.lat = currentLatitude;

  // 上报位置（附带 emoji 与 name，便于他端同步）
  const locForServer = {
    lat: currentLatitude,
    lon: currentLongitude,
    emoji: myEmoji || null,
    name:  myName  || null
  };
  socket.emit("locationFromClient", locForServer);

  if (mapInit) updateMapContent();
}

// ---------- 判断某经纬是否在当前视窗内 ----------
function checkIfOnMap(lat, lon) {
  if (mapInit && myMap?.map) {
    const bounds = myMap.map.getBounds();
    return bounds.contains([lat, lon]);
  } else {
    return false;
  }
}

// ---------- 地图移动/缩放后重算像素 ----------
function updateMapContent() {
  me.recalculatePosition();
  for (const o of others) o.recalculatePosition();
}

// ---------- Socket 事件 ----------
socket.on("connect", function(){
  // 有些情况下可直接拿 socket.id，但我们也监听服务器的 welcome 事件
  mySocketId = socket.id || mySocketId;
});

socket.on("welcome", function(payload){
  if(payload && payload.socketID){
    mySocketId = payload.socketID;
    // 如果用户已在 step1 填过名字（或本地已有缓存），现在可以立刻上报一次
    const cached = (myName && myName.trim()) || localStorage.getItem("gse_name");
    if(cached){
      myName = cached;
      socket.emit("nameFromClient", { name: myName });
    }
  }
});

socket.on("locationFromServer", function (data) {
  const idx = others.findIndex(o => o.id === data.socketID);
  if (idx > -1) {
    others[idx].lat = data.lat;
    others[idx].lon = data.lon;
    if (typeof data.emoji !== "undefined") others[idx].emoji = data.emoji;
    if (typeof data.name  !== "undefined") others[idx].name  = data.name;
    others[idx].recalculatePosition();
  } else {
    const o = new Person(data.socketID);
    o.lat = data.lat;
    o.lon = data.lon;
    if (typeof data.emoji !== "undefined") o.emoji = data.emoji;
    if (typeof data.name  !== "undefined") o.name  = data.name;
    o.recalculatePosition();
    others.push(o);
  }
});

socket.on("emojiFromServer", function (data) {
  const idx = others.findIndex(o => o.id === data.socketID);
  if (idx > -1) {
    others[idx].emoji = data.emoji;
  } else {
    const o = new Person(data.socketID);
    o.emoji = data.emoji;
    others.push(o);
  }
});

socket.on("nameFromServer", function (data) {
  // 服务器应广播：{ socketID, name }
  const idx = others.findIndex(o => o.id === data.socketID);
  if (idx > -1) {
    others[idx].name = data.name;
  } else {
    const o = new Person(data.socketID);
    o.name = data.name;
    others.push(o);
  }
});

socket.on("deletePerson", function (data) {
  const idx = others.findIndex(o => o.id === data.socketID);
  if (idx > -1) others.splice(idx, 1);
});

// ---------- 数据模型 ----------
class Person {
  constructor(id) {
    this.x = 0;
    this.y = 0;
    this.goalX = 0;
    this.goalY = 0;
    this.lat = 0;
    this.lon = 0;
    this.size = 14;
    this.col = color(170, 240, 190);
    this.id = id;         // 不显示给用户
    this.emoji = "";      // 🐭/🐱
    this.name  = "";      // 展示给用户
  }
  recalculatePosition() {
    if (mapInit) {
      const pos = myMap.latLngToPixel(this.lat, this.lon);
      this.goalX = pos.x;
      this.goalY = pos.y;
    }
  }
  update() {
    this.x = lerp(this.x, this.goalX, 0.2);
    this.y = lerp(this.y, this.goalY, 0.2);
  }
  display() {
    push();
    translate(this.x, this.y);

    // 圆点
    fill(this.col);
    stroke("pink");
    strokeWeight(3);
    const dia = this.size + sin(frameCount * 0.1);
    circle(0, 0, dia);

    // Emoji 居中显示
    noStroke();
    fill(0);
    textAlign(CENTER, CENTER);
    textSize(18);
    const face = (this.emoji && this.emoji.length) ? this.emoji : "·";
    text(face, 0, 0);

    // 名称显示在下方
    if (this.name && this.name.trim()) {
      textSize(12);
      fill(255);
      // 描边文字以增强可读性
      drawingContext.save();
      drawingContext.shadowColor = 'rgba(0,0,0,0.7)';
      drawingContext.shadowBlur = 4;
      drawingContext.shadowOffsetX = 0;
      drawingContext.shadowOffsetY = 0;
      text(this.name, 0, 18);
      drawingContext.restore();
    }

    pop();
  }
}

// ========== end of sketch.js ==========