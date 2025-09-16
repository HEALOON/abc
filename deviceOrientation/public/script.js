const SQ_SIZE = 100;       
const GRAVITY = 0.65;         

const wrapper = document.querySelector('#wrapper');
function getBoxSize(){
  return {
    w: wrapper.clientWidth,
    h: wrapper.clientHeight
  };
}
let { w: boxW, h: boxH } = getBoxSize();
//posision
let posX = (boxW - SQ_SIZE) / 2;
let posY = (boxH - SQ_SIZE) / 2;
let velX = 0;
let velY = 0;

let latest = { alpha: 0, beta: 0, gamma: 0 };

window.addEventListener('resize', () => {
  const size = getBoxSize();
  boxW = size.w; boxH = size.h;
  posX = Math.max(0, Math.min(posX, boxW - SQ_SIZE));
  posY = Math.max(0, Math.min(posY, boxH - SQ_SIZE));
});

function handleOrientation(eventData){
  latest.alpha = eventData.alpha ?? 0; 
  latest.beta  = eventData.beta  ?? 0; 
  latest.gamma = eventData.gamma ?? 0; 

  document.querySelector('#alpha').innerText = "alpha: " + Math.round(latest.alpha);
  document.querySelector('#beta').innerText  = "beta: "  + Math.round(latest.beta);
  document.querySelector('#gamma').innerText = "gamma: " + Math.round(latest.gamma);

  const h1 = document.querySelector('h1');
  if (h1) h1.style.display = "none";
  const btn = document.querySelector('#requestOrientationButton');
  if (btn) btn.style.display = "none";
}

function tick(){
  //将倾斜角映射到 [-1, 1]
  const ax = Math.max(-1, Math.min(1, latest.gamma / 45)); // 左右
  const ay = Math.max(-1, Math.min(1, latest.beta  / 45)); // 前后

  //速度
  velX = (velX + ax * GRAVITY) * 1;
  velY = (velY + ay * GRAVITY) * 1;

  posX += velX;
  posY += velY;

  //边界限制
  const maxX = boxW - SQ_SIZE;
  const maxY = boxH - SQ_SIZE;

  if (posX < 0){ posX = 0; velX = 0; }
  if (posX > maxX){ posX = maxX; velX = 0; }
  if (posY < 0){ posY = 0; velY = 0; }
  if (posY > maxY){ posY = maxY; velY = 0; }

  const square = document.querySelector('#square');
  if (square){
    square.style.transform = `translate(${posX}px, ${posY}px) rotate(${latest.alpha}deg)`;
  }

  // 方块自身颜色随 Y 位置变化
  const tY = posY / (boxH - SQ_SIZE);

  //上绿下黄
  const rBox = Math.round(255 * tY); 
  const gBox = 255;                  
  const bBox = 0;

  square.style.backgroundColor = `rgb(${rBox},${gBox},${bBox})`;

  const tx = Math.max(0, Math.min(1, (posX / (boxW - SQ_SIZE))));
  // 左圆右方
  const radiusPct = Math.round(50 * (1 - tx));
  square.style.borderRadius = `${radiusPct}%`;

  requestAnimationFrame(tick);
    //背景颜色随Y位置变化
  const t = posY / (boxH - SQ_SIZE);
  const r = Math.round(255 * (1 - t));
  const g = 0;
  const b = Math.round(255 * t);

  wrapper.style.backgroundColor = `rgb(${r},${g},${b})`;

}
requestAnimationFrame(tick);