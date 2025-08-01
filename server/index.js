const express = require('express');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const http = require('http');

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server);
const PORT = 3000;

const rooms = {};
const voicePeers = {};

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// 📡 REST API: Join or Create Room
app.post('/api/join-room', (req, res) => {
  const { roomId } = req.body;
  if (!rooms[roomId]) {
    rooms[roomId] = { users: [] };
  }
  res.json({ success: true, message: "Joined room" });
});

// 🔌 Socket.IO Real-time Handling
io.on('connection', (socket) => {
  console.log('✅ User connected');

  // Join a room
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`👥 User joined room: ${roomId}`);
  });

  // Video Sync Events
  socket.on('video-control', ({ roomId, action, time, videoId }) => {
    socket.to(roomId).emit('video-control', { action, time, videoId });
  });

  // Chat Messaging
  socket.on('chat-message', ({ roomId, message }) => {
    socket.to(roomId).emit('chat-message', message);
  });

  // 📞 Register Voice Peer ID
  socket.on('register-voice-id', ({ roomId, peerId }) => {
    socket.join(roomId);
    if (!voicePeers[roomId]) {
      voicePeers[roomId] = [];
    }
    voicePeers[roomId].push(peerId);
    socket.to(roomId).emit('user-joined-voice', peerId);
  });

  // 🔁 One user requests all peer IDs
  socket.on('request-voice-call', ({ roomId }) => {
    socket.to(roomId).emit('request-voice-call');
  });

  // 📤 A peer sends its voice ID to others
  socket.on('voice-peer-id', ({ roomId, peerId }) => {
    socket.to(roomId).emit('receive-voice-call', { fromPeerId: peerId });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('❌ User disconnected');
    // Optional: cleanup voicePeers if needed
  });
});

// 🚀 Start server
server.listen(PORT, () => {
  console.log(`🌐 Server running at http://localhost:${PORT}`);
});
