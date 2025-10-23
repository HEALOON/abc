const CUT = 1;
const parts = location.pathname.replace(/\/+$/,'').split('/').filter(Boolean);
const base  = parts.length ? parts.slice(0, -CUT).join('/') : '';
console.log("[conductor] base:", base);

let socket;

let mainWrapper = document.querySelector(".main-wrapper");
let frogsWrapper = document.querySelector("#frogs-wrapper");
let frogs = {}; // id -> { elm, size }

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

  frogsWrapper.appendChild(frogElm);
  frogs[frogData.id] = { elm: frogElm, size };
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
}

window.addEventListener("resize", function(){
  const newSize = frogSizeForViewport();
  Object.values(frogs).forEach(item => {
    const prevLeft = parseInt(item.elm.style.left || "0", 10);
    const prevTop  = parseInt(item.elm.style.top  || "0", 10);
    const prevSize = item.size;

    // 保持归一化位置一致
    const x01 = prevSize > 0 ? prevLeft / Math.max(1, window.innerWidth  - prevSize) : 0.5;
    const y01 = prevSize > 0 ? prevTop  / Math.max(1, window.innerHeight - prevSize) : 0.5;

    item.size = newSize;
    item.elm.width = newSize;
    item.elm.height = newSize;

    updateFrogPos(item.elm.dataset.socketid, x01, y01);
  });
});