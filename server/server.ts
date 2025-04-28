import express from 'express';
import https from 'https';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(cors());

// SSL Certificate Configuration
const sslOptions = {
  key: fs.readFileSync(path.join(__dirname, 'ssl', 'privkey1.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'ssl', 'cert1.pem')),
  // For additional security (optional):
  // ca: fs.readFileSync(path.join(__dirname, 'ssl', 'ca.pem')),
  // requestCert: true,
  // rejectUnauthorized: false
};

const server = https.createServer(sslOptions, app);
const io = new Server(server, {
  cors: {
    origin: "*", // In production, replace with your frontend URLs
    methods: ["GET", "POST"]
  },
  // Optional: Enable HTTPS for Socket.IO if needed
  // transports: ['websocket', 'polling'],
  // serveClient: false,
  // pingTimeout: 60000,
  // pingInterval: 25000
});

interface Room {
  users: string[];
}

const rooms: Record<string, Room> = {};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('createRoom', (roomId: string, callback: (success: boolean) => void) => {
    if (rooms[roomId]) {
      callback(false);
      return;
    }
    rooms[roomId] = { users: [socket.id] };
    socket.join(roomId);
    callback(true);
    console.log(`Room created: ${roomId}`);
  });

  socket.on('joinRoom', (roomId: string, callback: (success: boolean) => void) => {
    if (!rooms[roomId]) {
      callback(false);
      return;
    }
    if (rooms[roomId].users.length >= 2) {
      callback(false);
      return;
    }
    rooms[roomId].users.push(socket.id);
    socket.join(roomId);
    callback(true);
    socket.to(roomId).emit('newUserJoined', socket.id);
    console.log(`User ${socket.id} joined room ${roomId}`);
  });

  socket.on('offer', (data: { target: string; offer: RTCSessionDescriptionInit }) => {
    socket.to(data.target).emit('offer', {
      sender: socket.id,
      offer: data.offer
    });
  });

  socket.on('answer', (data: { target: string; answer: RTCSessionDescriptionInit }) => {
    socket.to(data.target).emit('answer', {
      sender: socket.id,
      answer: data.answer
    });
  });

  socket.on('ice-candidate', (data: { target: string; candidate: RTCIceCandidateInit }) => {
    socket.to(data.target).emit('ice-candidate', {
      sender: socket.id,
      candidate: data.candidate
    });
  });

  socket.on('leaveRoom', (roomId: string) => {
    socket.leave(roomId);
    if (rooms[roomId]) {
      const index = rooms[roomId].users.indexOf(socket.id);
      if (index !== -1) {
        rooms[roomId].users.splice(index, 1);
        socket.to(roomId).emit('userLeft', socket.id);
        if (rooms[roomId].users.length === 0) {
          delete rooms[roomId];
        }
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    for (const roomId in rooms) {
      const index = rooms[roomId].users.indexOf(socket.id);
      if (index !== -1) {
        rooms[roomId].users.splice(index, 1);
        socket.to(roomId).emit('userLeft', socket.id);
        if (rooms[roomId].users.length === 0) {
          delete rooms[roomId];
        }
      }
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`HTTPS server running on port ${PORT}`);
});