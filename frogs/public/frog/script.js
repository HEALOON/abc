const CUT = 1;
const parts = location.pathname.replace(/\/+$/,'').split('/').filter(Boolean);
// const base  = parts.length ? '/' + parts.slice(0, -CUT).join('/') : ''; // on SERVER...
const base  = parts.length ? parts.slice(0, -CUT).join('/') : '';
console.log(base);
let socket;


let readyButton = document.querySelector("#ready");
let mainWrapper = document.querySelector(".main-wrapper")
let w = window.innerWidth;
let h = window.innerHeight;
let audioElm, imgElm;
let frogIdx;

readyButton.addEventListener("click", function(){
    mainWrapper.append(imgElm);
    readyButton.remove();

    // connect to socket server
    socket = io({ path: base + '/socket.io' });  

    
    // socket communication
    let data = {
        role:"frog",
        frogIdx: frogIdx
    }
    socket.emit("my-role", data);

    //conductor端每次点击青蛙发出的声音
    socket.on("make-sound", function(){
        audioElm.play()
    })

   
    // TESTING IF JS CAN PLAY THE AUDIO,frog端第一次点击按钮发出的声音:
    setTimeout(function(){
        audioElm.play()
    }, 100)
})

window.addEventListener("load", function(){
    console.log("ready");
    
    frogIdx = Math.floor(Math.random()*9);
    
    console.log(frogIdx);

    // 加载音频
    audioElm = document.createElement("audio");
    audioElm.controls = true;
    audioElm.id = "frogSound";
    audioElm.innerHTML = `
        <source src="sounds/f`+frogIdx+`.mp3" type="audio/mpeg">
        Your browser does not support the audio element.
    `
    // 加载照片
    imgElm = document.createElement("img");
    imgElm.src = "../imgs/frog"+frogIdx+".png";
    imgElm.id = "frogImg";
    let frogSize = 0;
    if(w > h){
        frogSize = Math.min(h, 400);

    }else{
        frogSize = Math.min(w, 400);
    }
    imgElm.width = frogSize;
    imgElm.height = frogSize;

    imgElm.addEventListener("click", function(){   //点击图片发声
        audioElm.play();
    })

    audioElm.addEventListener("timeupdate", function(){
        console.log(imgElm.width)
        imgElm.width = imgElm.width+2;
        imgElm.height = imgElm.height+2;
    })
    audioElm.addEventListener("ended", function(){
        imgElm.width = frogSize;
        imgElm.height = frogSize;
    })

})


