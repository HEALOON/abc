const express = require('express');

const https = require("https");
// to read certificates from the filesystem (fs)
const fs = require("fs");

const app = express(); // the server "app", the server behaviour
const portHTTPS = 4100; // port for https

// returning to the client anything that is
// inside the public folder
app.use(express.static('public'));


// Creating object of key and certificate
// for SSL
const options = {
    key: fs.readFileSync("keys-for-local-https/localhost-key.pem"),
    cert: fs.readFileSync("keys-for-local-https/localhost.pem"),
};

let HTTPSserver = https.createServer(options, app)


const { Server } = require('socket.io'); // include library
const io = new Server(HTTPSserver); // start socket io 


let frogs = [];
let conductor;
io.on('connection', (socket) => {

    // we manage the connection inside here
    console.log('a user connected', socket.id);


    // LISTEN TO
    // client self-reporting role:
    socket.on("my-role", function(data){
     
        if(data.role == "frog"){
            let frogData = {
                id: socket.id, 
                frogIdx: data.frogIdx
            }
            frogs.push({id: socket.id, frogIdx: data.frogIdx});
            console.log(frogs);
           
            if(conductor){  //checking if there is a conductor or no
                io.to(conductor).emit('new-frog', frogData); //sent to 演奏者
            }



        }else if(data.role = "conductor"){
            conductor = socket.id; //safe the conductor's socket id
            // send all existing frogs to conductor:
            socket.emit("all-frogs", frogs);
        }  
    })

    socket.on("trigger-frog", function(socketID){//接收CS的socket.emit("trigger-frog", socketID);
        io.emit('make-sound');//别忘了改回去
        // io.to(socketID).emit('make-sound');
    })




    
    // DISCONNECT
    // manage the roles
    socket.on("disconnect", function(){
        console.log("someone disconnected", socket.id)
        console.log(frogs);

        //delete the frog from global array
        //that keeps track of all the frogs online
        let idx = frogs.findIndex(function(f){
            return f.id == socket.id
        });
        //if conductor disconnects set, conductor socketID 
        //
        if(idx > -1){
            frogs.splice(idx, 1);
            console.log(frogs);
        }else if(conductor == socket.id){
            conductor = undefined;
        }


        if(conductor){
            io.to(conductor).emit('delete-frog', socket.id);
        }

    })

})




// Creating servers and make them listen at their ports:

HTTPSserver.listen(portHTTPS, function (req, res) {
    console.log("HTTPS Server started at port", portHTTPS);
});





