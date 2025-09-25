const express = require('express');
// const http = require("http");
const https = require("https");
// to read certificates from the filesystem (fs)
const fs = require("fs");

const app = express(); // the server "app", the server behaviour
// const portHTTP = 4250; // port for http
const portHTTPS = 4250; // port for https


// returning to the client anything that is
// inside the public folder
// This is (public) what people can get from our server
app.use(express.static('public'));


// Creating object of key and certificate
//:loading those key files
// for SSL
const options = {
    //:correct path
    key: fs.readFileSync("keys-for-local-https/localhost-key.pem"),
    cert: fs.readFileSync("keys-for-local-https/localhost.pem"),
    //:original path without folder path
    //key: fs.readFileSync("localhost-key.pem"),
    // cert: fs.readFileSync("localhost.pem"),
};
let HTTPSserver = https.createServer(options, app);


const { Server } = require('socket.io');//:
const io = new Server(HTTPSserver);//:


io.on('connection', (socket) => {
    //:we manage the connection inside here
    //:refresh就是一个新的connection
    console.log('a user connected', socket.id)

    // socket.on ("message", function (incomingMessage){
    //     console. log("go new msg:", incomingMessage)
    //     let messageToAllClients = {
    //         sender: "unknown", 
    //         message: incomingMessage
    //     }
    //     io.emit ("newMessage", messageToAllClients);
    // })

    socket.on("message", (incomingMessage) => {
        console.log("got new msg:", incomingMessage);
        const messageToAllClients = {
            // 暂不处理姓名，这里仅传文本
            message: incomingMessage
        };
        io.emit("newMessage", messageToAllClients); //广播给所有客户端（含自己）
    });
    // after receiving a msg from any one client,
// we send them to all other clients:
    


    // socket.on("disconnected",function(){
    //     console.log('someone disconnected', socket.id);
    // })

    //退出聊天显示
    socket.on("disconnect", () => {
        console.log('someone disconnected', socket.id);
    });

    
});
// Creating servers and make them listen at their ports:
// http.createServer(app).listen(portHTTP, function (req, res) {
//     console.log("HTTP Server started at port", portHTTP);
// });
HTTPSserver.listen(portHTTPS, function (req, res) {
    console.log("HTTPS Server started at port", portHTTPS);
});