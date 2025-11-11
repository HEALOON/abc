// ========== sketch.js (fixed multi-safezones + entry detection + target line) ==========
// 功能摘要：
// 1) 地图 + 实时位置 + Emoji（🐭/🐱）。
// 2) 安全区：一开始就把所有安全区“方形区域”绘在画布上（橘色边框 + 浅绿色填充，半边 25m）。
//    —— 注意：安全区以“方形区域”为判定，而不是一个点。
//    —— 本机每帧检测“我是否从区外 → 区内”的穿越；若进入则向服务器上报 playerEnteredSafezone({zoneIndex}).
// 3) 连线：只绘制“自己 → 自己目标”的一条连线（仍能看见所有人的位置）。
// 4) HUD（名称在 index.html 设置；本文件仅负责无敌倒计时显示）：
//    左上显示“自己”的无敌倒计时，右上显示“目标”的无敌倒计时（仅在倒计时>0时显示）。
// 5) 兼容：从 index.html 传入的 __PLAYER_NAME / __PLAYER_EMOJI，建立 socket 后自动上报到服务器。

let mappa = new Mappa('Leaflet');
let myMap;
let canvas;

let currentLongitude = 0;
let currentLatitude  = 0;
let mapInit = false;

let me;
let others = [];             // Person[]
let othersById = new Map();  // socketID -> Person（便于查找目标）

let socket;
let myEmoji = null;

// —— 固定显示的所有安全区（方形），半边 25m —— //
const SAFEZONE_HALF_M = 25;
const SAFEZONE_POINTS = [
  { lat: 31.151517, lon: 121.480270 }, // 1
  { lat: 31.148650, lon: 121.482401 }, // 2
  { lat: 31.150231, lon: 121.484472 }, // 3
  { lat: 31.149892, lon: 121.481752 }, // 4
  { lat: 31.148546, lon: 121.483528 }  // 5
];
// 内部状态：记录“我是否处于每个安全区内部”（用于边沿检测）
let insideZoneFlags = SAFEZONE_POINTS.map(() => false);

// —— 身份通报（从 index.html 设置的全局变量读取并上报到 server） ——
let identityAnnounceTimer = null;
let announcedName  = false;
let announcedEmoji = false;

// —— 目标与无敌状态（由服务器事件提供/更新） —— //
let myNum = null;
let myTargetNum = null;
let myTargetUserId = null;

let invincibleUntilMe     = 0; // 毫秒时间戳
let invincibleUntilTarget = 0; // 毫秒时间戳

let gameEnded = false;

// ===== Socket 连接（路径兼容） =====
if (location.hostname.toLowerCase().startsWith('browsercircus')) {
  socket = io({ path: "/gps-see-everyone/socket.io" });
} else {
  socket = io();
}

// ===== 地图参数（lat/lng 在拿到首个 GPS 后写入） =====
let mappa_options = {
  lat: 0,
  lng: 0,
  zoom: 16,
  style: "https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}",
};

// ================= p5 生命周期 =================
function setup() {
  canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent("p5-canvas-container");
  me = new Person("ME");

  bindEmojiButtons(); // 绑定 🐭/🐱 选择（用于进入地图前的选择 UI）

  // 周期性尝试将名称与表情上报到 server（index 中点击后才会赋值）
  identityAnnounceTimer = setInterval(attemptAnnounceIdentity, 300);
  attemptAnnounceIdentity(); // 先试一次
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

  // 背景半透明遮罩（仅用于提高点与区域对比度）
  noStroke();
  fill(0, 160);
  rect(0, 0, width, height);

  if (!mapInit) return;

  // 先更新/绘制所有人
  me.update();
  me.display();

  for (const o of others) {
    o.update();
    o.display();
  }

  // 绘制所有安全区（方形）
  drawAllSafezones();

  // “自己 → 自己的目标”的一条连线
  drawMyTargetLine();

  // 进入安全区检测（以“整个方形区域”为判定，不是点）
  detectAndEmitSafezoneEntry();

  // HUD：无敌倒计时
  renderInvincibleHUD();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// ================= 身份通报 =================
function attemptAnnounceIdentity(){
  if (!socket) return;
  // 名称
  if (!announcedName && typeof window !== "undefined" && window.__PLAYER_NAME && window.__PLAYER_NAME.trim().length){
    socket.emit('nicknameFromClient', { nickname: window.__PLAYER_NAME.trim() });
    announcedName = true;
  }
  // 表情
  if (!announcedEmoji && typeof window !== "undefined" && window.__PLAYER_EMOJI && window.__PLAYER_EMOJI.length){
    myEmoji = window.__PLAYER_EMOJI;
    if (me) me.emoji = myEmoji;
    socket.emit('emojiFromClient', { emoji: myEmoji });
    announcedEmoji = true;
  }
  // 条件满足则停止轮询
  if (announcedName && announcedEmoji && identityAnnounceTimer){
    clearInterval(identityAnnounceTimer);
    identityAnnounceTimer = null;
  }
}

// ================= 绑定 🐭/🐱 =================
function bindEmojiButtons() {
  const chooser = document.getElementById('emoji-chooser');
  if (!chooser) return;
  chooser.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-emoji]');
    if (!btn) return;

    const picked = btn.dataset.emoji; // "🐭" / "🐱"
    myEmoji = picked;
    if (me) me.emoji = picked;

    socket.emit("emojiFromClient", { emoji: picked });
    chooser.style.display = 'none';
  });
}

// ================= 安全区绘制（多个方形） =================
function drawAllSafezones(){
  push();
  rectMode(CENTER);
  stroke(255, 165, 0);          // 橘色边框
  strokeWeight(3);
  fill(100, 255, 100, 140);     // 浅绿色半透明

  for (let i = 0; i < SAFEZONE_POINTS.length; i++) {
    const z = SAFEZONE_POINTS[i];
    // 将 25m 转为经/纬度偏移
    const dLat = metersToLat(SAFEZONE_HALF_M);
    const dLng = metersToLng(SAFEZONE_HALF_M, z.lat);

    // 中心像素
    const center = myMap.latLngToPixel(z.lat, z.lon);

    // 用东/北方向像素偏移估计半边像素
    const eastPx  = myMap.latLngToPixel(z.lat, z.lon + dLng);
    const northPx = myMap.latLngToPixel(z.lat + dLat, z.lon);

    const halfW = Math.abs(eastPx.x  - center.x);
    const halfH = Math.abs(northPx.y - center.y);
    const half  = Math.min(halfW, halfH); // 取较小值保证“正方形”

    rect(center.x, center.y, half * 2, half * 2);
  }
  pop();
}

// ================= 进入安全区检测（以“方形区域”为判定） =================
function detectAndEmitSafezoneEntry(){
  if (!me || !me.lat || !me.lon) return;

  for (let i = 0; i < SAFEZONE_POINTS.length; i++) {
    const z = SAFEZONE_POINTS[i];
    // 将半边 25m 换成经/纬度范围
    const dLat = metersToLat(SAFEZONE_HALF_M);
    const dLng = metersToLng(SAFEZONE_HALF_M, z.lat);

    const inLat = Math.abs(me.lat - z.lat) <= dLat;
    const inLng = Math.abs(me.lon - z.lon) <= dLng;
    const nowInside = inLat && inLng;

    // 仅在“由外到内”的瞬间触发一次
    if (nowInside && !insideZoneFlags[i] && !gameEnded) {
      // 上报给服务器：我进入了第 i 个安全区
      socket.emit('playerEnteredSafezone', { zoneIndex: i });
    }
    insideZoneFlags[i] = nowInside;
  }
}

// ================= 只绘“自己 → 目标”的连线 =================
function drawMyTargetLine(){
  if (!myTargetUserId) return;
  const target = othersById.get(myTargetUserId);
  if (!target) return;

  // 仅在两者都有像素坐标时绘制
  const meHas = Number.isFinite(me.x) && Number.isFinite(me.y);
  const tgHas = target && Number.isFinite(target.x) && Number.isFinite(target.y);
  if (!meHas || !tgHas) return;

  push();
  stroke(255);           // 白色线（可按需改）
  strokeWeight(2);
  line(me.x, me.y, target.x, target.y);
  pop();
}

// ================= HUD：无敌倒计时 =================
function renderInvincibleHUD(){
  const left  = document.getElementById('hud-self-invinc');
  const right = document.getElementById('hud-target-invinc');
  const now = Date.now();

  if (left) {
    const remain = Math.max(0, invincibleUntilMe - now);
    if (remain > 0) {
      left.textContent = `我的无敌 ${Math.ceil(remain/1000)}s`;
    } else {
      left.textContent = '';
    }
  }
  if (right) {
    const remain = Math.max(0, invincibleUntilTarget - now);
    if (remain > 0) {
      right.textContent = `目标无敌 ${Math.ceil(remain/1000)}s`;
    } else {
      right.textContent = '';
    }
  }
}

// ================= GPS 回调 =================
function handleNewPosition(pos) {
  // 兼容中国区偏移修正（由外部提供）
  const lonlat = (typeof fixForChineseMap === "function")
    ? fixForChineseMap(pos)
    : [pos.coords.longitude, pos.coords.latitude];

  currentLongitude = lonlat[0];
  currentLatitude  = lonlat[1];

  me.lon = currentLongitude;
  me.lat = currentLatitude;

  // 上报位置（附带 emoji，便于他端同步）
  const locForServer = { lat: currentLatitude, lon: currentLongitude, emoji: myEmoji || null };
  socket.emit("locationFromClient", locForServer);

  if (mapInit) updateMapContent();
}

// ================= 工具 =================
function metersToLat(m) {                        // 1° 纬度 ≈ 111320 m
  return m / 111320;
}
function metersToLng(m, lat) {                   // 1° 经度 ≈ 111320 * Math.cos(lat)
  return m / (111320 * Math.cos(lat * Math.PI / 180));
}

// ================= 地图移动/缩放后重算像素 =================
function updateMapContent() {
  me.recalculatePosition();
  for (const o of others) o.recalculatePosition();
}

// ================= Socket 事件（位置/身份/目标/无敌/结算） =================

// 其他玩家位置
socket.on("locationFromServer", function (data) {
  let o = othersById.get(data.socketID);
  if (o) {
    o.lat = data.lat;
    o.lon = data.lon;
    if (typeof data.emoji !== "undefined") o.emoji = data.emoji;
    o.recalculatePosition();
  } else {
    o = new Person(data.socketID);
    o.lat = data.lat;
    o.lon = data.lon;
    if (typeof data.emoji !== "undefined") o.emoji = data.emoji;
    o.recalculatePosition();
    others.push(o);
    othersById.set(o.id, o);
  }
});

// 其他玩家选择了 emoji
socket.on("emojiFromServer", function (data) {
  let o = othersById.get(data.socketID);
  if (o) {
    o.emoji = data.emoji;
  } else {
    o = new Person(data.socketID);
    o.emoji = data.emoji;
    others.push(o);
    othersById.set(o.id, o);
  }
});

// 有人离线
socket.on("deletePerson", function (data) {
  const idx = others.findIndex(o => o.id === data.socketID);
  if (idx > -1) others.splice(idx, 1);
  othersById.delete(data.socketID);

  // 若目标离线，清空本地目标
  if (myTargetUserId === data.socketID) {
    myTargetUserId = null;
  }
});

// 服务器分配目标（需要 server.js 发出该事件）
socket.on('targetAssigned', function (payload) {
  // payload: { myNum, targetNum, targetUserId }
  if (typeof payload?.myNum === 'number')     myNum = payload.myNum;
  if (typeof payload?.targetNum === 'number') myTargetNum = payload.targetNum;
  if (payload?.targetUserId)                  myTargetUserId = payload.targetUserId;
});

// 无敌开始/结束（服务器权威）
socket.on('invincibleStart', function (data) {
  // data: { userid, until, zoneIndex, num }
  const untilMs = Number(data?.until) || 0;
  if (!untilMs) return;

  if (data.userid === socket.id) {
    invincibleUntilMe = untilMs;
  }
  if (data.userid === myTargetUserId) {
    invincibleUntilTarget = untilMs;
  }
});
socket.on('invincibleEnd', function (data) {
  // data: { userid }
  if (data.userid === socket.id) {
    invincibleUntilMe = 0;
  }
  if (data.userid === myTargetUserId) {
    invincibleUntilTarget = 0;
  }
});

// 结算：胜负广播（index 侧也会监听，这里同步显示）
socket.on('gameOver', function (data) {
  gameEnded = true;
  const hudGameover = document.getElementById("hud-gameover");
  if (hudGameover) {
    if (data && data.winner === 'Rat') {
      hudGameover.textContent = '🐭 Win';
    } else if (data && data.winner === 'Cat') {
      hudGameover.textContent = '🐱 Win';
    } else {
      hudGameover.textContent = 'Game Over';
    }
  }
});

// ================= 数据模型 =================
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
    this.id = id;
    this.emoji = ""; // 🐭/🐱
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

    fill(this.col);
    stroke("pink");
    strokeWeight(3);
    const dia = this.size + sin(frameCount * 0.1);
    circle(0, 0, dia);

    noStroke();
    fill(0);
    textAlign(CENTER, CENTER);
    textSize(18);
    const label = (this.emoji && this.emoji.length) ? this.emoji : this.id;
    text(label, 0, 0);
    pop();
  }
}
// ========== end of sketch.js ==========