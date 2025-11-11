'use strict';

/**
 * server.js — 4 人对战版（老鼠 1/3，猫 2/4）
 * - 分配编号：Rat→[1,3]，Cat→[2,4]（超过则 Num=null）
 * - 目标环：1→2→3→4→1
 * - 安全区：固定 5 个方形，每区对每个编号仅生效一次（首次进入授予 20s 无敌）
 * - 击杀：被追者在自己端点击“我被击杀” → 服务器校验（无敌则拒绝）
 * - 胜负：猫队两人皆亡→🐭Win；鼠队两人皆亡→🐱Win；广播 gameOver
 */

const express = require('express');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const { Server } = require('socket.io');

// ===== App & HTTPS Server =====
const app = express();
const portHTTPS = process.env.PORT || 4250;

app.use(express.static(path.join(__dirname, 'public')));

const options = {
  key:  fs.readFileSync(path.join(__dirname, 'localhost-key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'localhost.pem')),
};

const HTTPSserver = https.createServer(options, app);
const io = new Server(HTTPSserver /*, { pingTimeout: 60000, transports: ['websocket'] }*/);

// ===== In-memory state =====
// 以 socket.id 为 key：{ userid, Nickname, Group('Rat'|'Cat'|null), Emoji('🐭'|'🐱'|null), Num(1|2|3|4|null), Dead(bool) }
const clients = new Map();
// 为了单播事件（如 targetAssigned）
const socketsById = new Map();

// 号码池（按顺序分配）
let availableRat = [1, 3];
let availableCat = [2, 4];

// 固定 5 个安全区中心（经纬度，仅用于标识；判定在前端做，服务端只做资格/时效控制）
const SAFEZONE_POINTS = [
  { lat: 31.151517, lon: 121.480270 }, // 1
  { lat: 31.148650, lon: 121.482401 }, // 2
  { lat: 31.150231, lon: 121.484472 }, // 3
  { lat: 31.149892, lon: 121.481752 }, // 4
  { lat: 31.148546, lon: 121.483528 }  // 5
];
// 每个安全区的“一次性资格表”：初始 {1,2,3,4}，玩家编号首次进入则从集合移除
const zoneEligible = SAFEZONE_POINTS.map(() => new Set([1,2,3,4]));

// 无敌：userid -> 毫秒时间戳（到期时刻）
const invincibleUntil = new Map();

// 胜负
let deadRat = 0;
let deadCat = 0;
let gameActive = true;

// ===== Helpers =====
function mapEmojiToGroup(emoji) {
  if (emoji === '🐭') return 'Rat';
  if (emoji === '🐱') return 'Cat';
  return null;
}

function takeFromPool(group) {
  if (group === 'Rat')  return availableRat.length ? availableRat.shift() : null;
  if (group === 'Cat')  return availableCat.length ? availableCat.shift() : null;
  return null;
}

function returnToPool(group, num) {
  if (num == null) return;
  if (group === 'Rat') {
    availableRat.push(num);
    availableRat.sort((a,b)=>a-b);
  } else if (group === 'Cat') {
    availableCat.push(num);
    availableCat.sort((a,b)=>a-b);
  }
}

function maybeAssignNumber(id) {
  const c = clients.get(id);
  if (!c || !c.Nickname || !c.Group) return; // 需要昵称 + 分组齐备
  if (c.Num != null) return;                 // 已分配过则不再分
  c.Num = takeFromPool(c.Group);             // 对应组已满则为 null
  clients.set(id, c);
}

function snapshotArray() {
  return Array.from(clients.values()).map(({ userid, Nickname, Group, Num }) => ({
    userid, Nickname, Group, Num
  }));
}

function tryLogBinding(id) {
  const c = clients.get(id);
  if (!c) return;
  if (c.Nickname && c.Group) {
    const numStr = (c.Num != null) ? c.Num : 'null';
    console.log('bound:', id, 'nickname:', c.Nickname, 'group:', c.Group, 'num:', numStr);
  }
}

function logZoneEligible(zoneIndex){
  const set = zoneEligible[zoneIndex];
  const list = Array.from(set).sort((a,b)=>a-b).join(' ');
  console.log(`zone ${zoneIndex+1} eligible: ${list || '(none)'}`);
}

// 根据当前 clients 的 Num，给每个已编号玩家分配/广播目标
function recomputeTargets() {
  // 建立 num -> userid 映射
  const numToUser = {};
  for (const [uid, c] of clients) {
    if (c.Num != null) numToUser[c.Num] = uid;
  }
  // 给每个有 Num 的玩家单播 targetAssigned
  for (const [uid, c] of clients) {
    if (c.Num == null) continue;
    const myNum = c.Num;
    const targetNum = (myNum % 4) + 1; // 1->2->3->4->1
    const targetUserId = numToUser[targetNum] || null;
    const sock = socketsById.get(uid);
    if (sock) {
      sock.emit('targetAssigned', { myNum, targetNum, targetUserId });
    }
  }
}

// 检查胜负并广播
function checkVictoryAndBroadcast() {
  if (!gameActive) return;
  if (deadCat >= 2) {
    gameActive = false;
    io.emit('gameOver', { winner: 'Rat' });
  } else if (deadRat >= 2) {
    gameActive = false;
    io.emit('gameOver', { winner: 'Cat' });
  }
}

// ===== Socket.IO =====
io.on('connection', (socket) => {
  socketsById.set(socket.id, socket);

  clients.set(socket.id, {
    userid: socket.id,
    Nickname: null,
    Group: null,
    Emoji: null,
    Num: null,
    Dead: false,
  });

  console.log('connected:', socket.id, 'online:', clients.size);
  console.log(JSON.stringify(snapshotArray(), null, 2));

  socket.emit('welcome', { socketID: socket.id });

  // —— 昵称 —— //
  socket.on('nicknameFromClient', (data = {}) => {
    const name = (data.nickname || '').toString().trim();
    if (!name) return;

    const c = clients.get(socket.id) || { userid: socket.id };
    c.Nickname = name;
    clients.set(socket.id, c);

    maybeAssignNumber(socket.id);
    tryLogBinding(socket.id);

    recomputeTargets();
    console.log(JSON.stringify(snapshotArray(), null, 2));
  });

  // —— 表情/分组 —— //
  socket.on('emojiFromClient', (data = {}) => {
    const emoji = data.emoji || null;
    const newGroup = mapEmojiToGroup(emoji);

    const c = clients.get(socket.id) || { userid: socket.id };
    const oldGroup = c.Group;
    const oldNum   = c.Num;

    c.Emoji = emoji;
    c.Group = newGroup;

    // 分组切换则回收旧号码
    if (oldGroup && oldGroup !== newGroup && oldNum != null) {
      returnToPool(oldGroup, oldNum);
      c.Num = null; // 等待按新组再分
    }

    clients.set(socket.id, c);

    maybeAssignNumber(socket.id);
    tryLogBinding(socket.id);

    recomputeTargets();
    console.log(JSON.stringify(snapshotArray(), null, 2));

    // 广播表情给他人
    socket.broadcast.emit('emojiFromServer', {
      socketID: socket.id,
      emoji
    });
  });

  // —— 位置（透传 + 附带 emoji 便于前端渲染） —— //
  socket.on('locationFromClient', (data = {}) => {
    const c = clients.get(socket.id);
    const emoji = c?.Emoji || null;
    const payload = {
      lon: data.lon,
      lat: data.lat,
      socketID: socket.id,
      emoji
    };
    socket.broadcast.emit('locationFromServer', payload);
  });

  // —— 前端判定“进入安全区方形”后上报 —— //
  socket.on('playerEnteredSafezone', ({ zoneIndex } = {}) => {
    if (!gameActive) return;
    if (typeof zoneIndex !== 'number') return;
    if (zoneIndex < 0 || zoneIndex >= zoneEligible.length) return;

    const c = clients.get(socket.id);
    if (!c || c.Num == null || c.Dead) return;

    const eligibleSet = zoneEligible[zoneIndex];
    if (!eligibleSet.has(c.Num)) {
      // 已用过该区资格，忽略
      return;
    }

    // 授予 20s 无敌（刷新或覆盖到期时刻）
    const until = Date.now() + 20_000;
    invincibleUntil.set(socket.id, until);

    // 消耗该区对该编号的资格
    eligibleSet.delete(c.Num);
    logZoneEligible(zoneIndex);

    // 广播无敌开始（由各端自行判断是“我自己”还是“我的目标”）
    io.emit('invincibleStart', { userid: socket.id, until, zoneIndex, num: c.Num });

    // 定时结束广播（若期间被其它区刷新为更晚的时间，这里不会提前打断）
    setTimeout(() => {
      const now = Date.now();
      const still = invincibleUntil.get(socket.id) || 0;
      if (still <= now) {
        invincibleUntil.delete(socket.id);
        io.emit('invincibleEnd', { userid: socket.id });
      }
    }, 20_100);
  });

  // —— 被追者在自己端点击“我被击杀” —— //
  socket.on('selfKilled', () => {
    if (!gameActive) return;

    const c = clients.get(socket.id);
    if (!c || c.Dead) return; // 已死亡则忽略

    // 无敌期间拒绝
    const until = invincibleUntil.get(socket.id) || 0;
    if (Date.now() < until) {
      socket.emit('killDenied', { reason: 'targetInvincible' });
      return;
    }

    // 记录死亡
    c.Dead = true;
    clients.set(socket.id, c);
    if (c.Group === 'Rat') deadRat = Math.min(2, deadRat + 1);
    if (c.Group === 'Cat') deadCat = Math.min(2, deadCat + 1);

    // 广播死亡
    io.emit('playerDied', { userid: socket.id, num: c.Num, group: c.Group });

    // 检查胜负
    checkVictoryAndBroadcast();
  });

  // —— 断开连接 —— //
  socket.on('disconnect', (reason) => {
    const c = clients.get(socket.id);

    // 回收号码
    if (c && c.Group && c.Num != null) {
      returnToPool(c.Group, c.Num);
    }

    // 清理
    clients.delete(socket.id);
    socketsById.delete(socket.id);
    invincibleUntil.delete(socket.id);

    // 让前端移除该人
    socket.broadcast.emit('deletePerson', { socketID: socket.id });

    // 目标可能变化（例如某人刚好是别人的 target）
    recomputeTargets();

    console.log('disconnected:', socket.id, reason, 'online:', clients.size);
    console.log(JSON.stringify(snapshotArray(), null, 2));
  });
});

// ===== Start Server =====
HTTPSserver.listen(portHTTPS, () => {
  console.log('HTTPS Server started at port', portHTTPS);
});