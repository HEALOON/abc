const express = require('express');
const http = require("http");
const https = require("https");
// to read certificates from the filesystem (fs)
const fs = require("fs");

const app = express(); // the server "app", the server behaviour
const portHTTP = 3000; // port for http
const portHTTPS = portHTTP+1; // port for https

// returning to the client anything that is
// inside the public folder
// This is (public) what people can get from our server
app.use(express.static('public'));


// Creating object of key and certificate
// for SSL
const options = {
    key: fs.readFileSync("localhost-key.pem"),
    cert: fs.readFileSync("localhost.pem"),
};



// Creating servers and make them listen at their ports:
http.createServer(app).listen(portHTTP, function (req, res) {
    console.log("HTTP Server started at port", portHTTP);
});
https.createServer(options, app).listen(portHTTPS, function (req, res) {
    console.log("HTTPS Server started at port", portHTTPS);
});





