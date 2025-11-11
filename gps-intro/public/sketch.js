let mappa = new Mappa('Leaflet'); // map library
let myMap;
let canvas;
let currentLongitude = 0; // global variables will be updated as we get GPS data
let currentLatitude = 0; // global variables will be updated as we get GPS data
let mapInit = false; // we only do map stuff once mapInit is true (see in draw)
let me; // point object showing our own location

let socket = io();//114
// options for map
// we only actually initialize the map once we get data where we are (in draw)
// there are differnt suppliers and styles of maps available
let mappa_options = {
  lat: 0, // will change once we have data
  lng: 0, // will change once we have data
  zoom: 16, // initial zoom level
  // style: "https://b.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png"
  // style: "https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}",
  style: 'https://webst01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=6&x={x}&y={y}&z={z}',
}

function setup() {
  canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent("p5-canvas-container");
  me = new MyPoint();
  
}

function draw() {
  clear();

  // Initialize full screen map
  //Runs only once to initialize the map
  if(!mapInit && GPS_GRANTED && currentLongitude!= 0){
    console.log("starting map");
    //38.897170, -77.036568
    mappa_options.lat = currentLatitude;
    mappa_options.lng = currentLongitude;
    // mappa_options.lat = 38.897170;
    // mappa_options.lng = -77.036568;
    myMap = mappa.tileMap(mappa_options); 
    myMap.overlay(canvas);
    myMap.onChange(updateMapContent);
    mapInit = true
  }

  if(mapInit){
    // only update and draw our point if we actually have data
    me.update();
    me.display();
    // console.log(me)

  }
  


}

// P5 touch events: https://p5js.org/reference/#Touch
function touchStarted() {
  if(mapInit){
    let pos = myMap.pixelToLatLng(touches[0].x, touches[0].y);
    console.log("TOUCHED", pos);
  }else{
    console.log("TOUCHED", touches);
  }
}

function touchMoved() {
}

function touchEnded() {
}

function windowResized(){
  resizeCanvas(windowWidth, windowHeight);
}


//directly called from the GPS listener whenever our location updates:
function handleNewPosition(pos){
  // fix location for chinese map tiles
  let lonlat = fixForChineseMap(pos);
  currentLongitude = lonlat[0];
  currentLatitude = lonlat[1];
  console.log(currentLatitude, currentLongitude);

  let locForServer = {
    lat: currentLatitude,
    lng: currentLongitude
  }

  socket.emit("lacationFromClient", locForServer);



  if(mapInit){
  }
  
    // if map already displayed, update the point
    updateMapContent();
  }
  


function updateMapContent(){
  //change our own location from location to pixels on canvas
  let myPosOnCanvas = myMap.latLngToPixel(currentLatitude, currentLongitude)
  me.goalX = myPosOnCanvas.x;
  me.goalY = myPosOnCanvas.y;
}

class MyPoint{
  constructor(){
    this.x = 0;
    this.y = 0;
    this.goalX = 0;
    this.goalY = 0;
    this.size = 14;
    this.col = color(170, 240, 190);

  }
  update(){
    // lerp to each new location to keep things smoother
    this.x = lerp(this.x, this.goalX, 0.2)
    this.y = lerp(this.y, this.goalY, 0.2)

  }
  display(){
    push();
    translate(this.x, this.y);
    fill(this.col);
    stroke("pink");
    strokeWeight(3)
    let dia = this.size + sin(frameCount*0.1)
    circle(0, 0, dia);

    pop();
  }
}