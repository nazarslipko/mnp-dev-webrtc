import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
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
    // Clean up all rooms this user was in
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});