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

  // 根据触摸情况，决定每个区块左/右侧是否画圆
  for (let i = 0; i < 4; i++) {
    let { leftTouched, rightTouched } = getTouchSidesForBlock(i, blockH);

    // 触碰左侧 -> 右侧出现黑圆
    if (leftTouched) {
      drawCircleRight(i, blockH);
    }
    // 触碰右侧 -> 左侧出现黑圆
    if (rightTouched) {
      drawCircleLeft(i, blockH);
    }
  }

  // 保留：中央黑色圆
  fill(0);
  circle(width / 2, height / 2, 100);
}

// 统计某个区块内，是否有触点在左/右半区
function getTouchSidesForBlock(index, blockH) {
  let top = index * blockH;
  let bottom = (index + 1) * blockH;
  let leftTouched = false;
  let rightTouched = false;

  for (let t of touches) {
    if (t.y > top && t.y < bottom) {
      if (t.x < width / 2) leftTouched = true;
      else rightTouched = true;
    }
  }
  return { leftTouched, rightTouched };
}

function drawCircleLeft(index, blockH) {
  fill(0);
  circle(50, index * blockH + blockH / 2, 50);
}

function drawCircleRight(index, blockH) {
  fill(0);
  circle(width - 50, index * blockH + blockH / 2, 50);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
