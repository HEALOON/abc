const CUT = 1;
const parts = location.pathname.replace(/\/+$/,'').split('/').filter(Boolean);
// const base  = parts.length ? '/' + parts.slice(0, -CUT).join('/') : ''; // on SERVER...
const base  = parts.length ? parts.slice(0, -CUT).join('/') : '';
console.log(base);
// yields '/leon/port-4100/socket.io' or '/socket.io'
const socket = io({ path: base + '/socket.io' });  

// let readyButton = document.querySelector("#ready");
let mainWrapper = document.querySelector(".main-wrapper")
let w = window.innerWidth;
let h = window.innerHeight;
let frogs = []

// socket communication
socket.emit("my-role", {role: "conductor"});

socket.on("all-frogs", function(data){
    console.log(data);
    for (let i= 0; i<data.length; i++){
        let frog = data[i];
        addFrog(frog.id, frog.frogIdx); //conductor shows up check frogs already on the page
    }
})

socket.on("new-frog", function(frog){ //5.2
    console.log(frog);
    addFrog(frog.id, frog.frogIdx); //5分钟后迟到的人来了重新打开考勤把迟到者加进去
})

socket.on("delete-frog", function(data){ //5.2
    console.log(data + " is gone");
    document.querySelector("#A" + data).remove(); //looking for an html element id and remove it
})



// addFrog("sdfobjweq", 0); // function test

function addFrog(socketID, frogIdx){
    let imgWrapper = document.createElement("div");
    imgWrapper.className = "img-wrap"
    imgWrapper.id = "A" + socketID; //确保socket id begins with a 字母
    imgElm = document.createElement("img");
    imgElm.src = "../imgs/frog"+frogIdx+".png";
    imgWrapper.append(imgElm)
    mainWrapper.append(imgWrapper);

    // button socket communication:
    imgElm.addEventListener("click", function(){
        document.querySelector("#A"+socketID).style.opacity = 0.3; //确保socket id begins with a 字母
        setTimeout(function(){
            document.querySelector("#A"+socketID).style.opacity = 1; //确保socket id begins with a 字母
        }, 500)
        socket.emit("trigger-frog", socketID);

    })
}
