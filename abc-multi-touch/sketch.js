function setup() {
  let canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent("p5-canvas-container");
}

function draw() {
  background(90, 200, 190);

  // 四个区块
  let blockH = height / 4;
  let colors = [
    color(240, 248, 255),
    color(220, 230, 240),
    color(200, 210, 220),
    color(180, 190, 200)
  ];
  noStroke();
  for (let i = 0; i < 4; i++) {
    fill(colors[i]);
    rect(0, i * blockH, width, blockH);
  }

  // 根据触摸情况，决定哪个区块显示圆
  for (let i = 0; i < 4; i++) {
    if (isBlockTouched(i, blockH)) {
      fill(0);
      circle(width - 50, i * blockH + blockH / 2, 50);
    }
  }

  // 保留：中央黑色圆
  fill(0);
  circle(width / 2, height / 2, 100);
}

// 判断某个区块是否有触摸
function isBlockTouched(index, blockH) {
  for (let t of touches) {
    if (t.y > index * blockH && t.y < (index + 1) * blockH) {
      return true;
    }
  }
  return false;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
