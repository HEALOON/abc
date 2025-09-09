function setup() {
  let canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent("p5-canvas-container");
}

function draw() {
  // background(90, 200, 190);
  
  fill(0);
  circle(width/2, height/2, 100);

}

// P5 touch events: https://p5js.org/reference/#Touch

function touchStarted() {
  console.log(touches);
  background(200,0,0);
}

function touchMoved() {
}

function touchEnded() {
  background(255);
}

function windowResized(){
  resizeCanvas(windowWidth, windowHeight);
}

