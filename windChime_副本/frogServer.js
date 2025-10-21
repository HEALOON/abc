const express = require('express');
const https = require("https");
const fs = require("fs");

const app = express();
const portHTTPS = 4100;

app.use(express.static('public'));

const options = {
  key: fs.readFileSync("keys-for-local-https/localhost-key.pem"),
  cert: fs.readFileSync("keys-for-local-https/localhost.pem"),
};

let HTTPSserver = https.createServer(options, app);

const { Server } = require('socket.io');
const io = new Server(HTTPSserver);

let frogs = [];           // [{ id, frogIdx, x, y }]
let conductor;            // socket.id

io.on('connection', (socket) => {
  console.log('a user connected', socket.id);

  // client self-reporting role:
  socket.on("my-role", function (data) {
    if (data.role === "frog") {
      const frogData = {
        id: socket.id,
        frogIdx: data.frogIdx,
        x: typeof data.x === 'number' ? data.x : 0.5, // normalized 0..1
        y: typeof data.y === 'number' ? data.y : 0.5  // normalized 0..1
      };
      frogs.push(frogData);
      console.log("frogs:", frogs);

      // If there is a conductor online, notify about the new frog
      if (conductor) {
        io.to(conductor).emit('new-frog', frogData);
      }

    } else if (data.role === "conductor") {
      conductor = socket.id; // save the conductor's socket id
      // send all existing frogs (including their current positions) to conductor:
      socket.emit("all-frogs", frogs);
    }
  });

  // Frog position updates (frog -> server -> conductor)
  socket.on("frog-pos", function (pos) {
    // pos: { x: number(0..1), y: number(0..1) }
    let idx = frogs.findIndex(f => f.id === socket.id);
    if (idx > -1) {
      // Update server copy
      frogs[idx].x = Math.min(1, Math.max(0, Number(pos.x)));
      frogs[idx].y = Math.min(1, Math.max(0, Number(pos.y)));
      // Forward to conductor if present
      if (conductor) {
        io.to(conductor).emit("frog-pos", { id: frogs[idx].id, x: frogs[idx].x, y: frogs[idx].y });
      }
    }
  });

  // (Legacy) Trigger sound
  socket.on("trigger-frog", function (socketID) {
    // io.to(socketID).emit('make-sound'); // 指定青蛙发声：改用这一行、并删除下一行
    io.emit('make-sound');                 // 当前：全部青蛙一起发声
  });

  // DISCONNECT
  socket.on("disconnect", function () {
    console.log("someone disconnected", socket.id);
    let idx = frogs.findIndex(f => f.id === socket.id);

    if (idx > -1) {
      frogs.splice(idx, 1);
      if (conductor) {
        io.to(conductor).emit('delete-frog', socket.id);
      }
    } else if (conductor === socket.id) {
      conductor = undefined;
      console.log("conductor disconnected");
    }
  });
});

HTTPSserver.listen(portHTTPS, function () {
  console.log("HTTPS Server started at port", portHTTPS);
});