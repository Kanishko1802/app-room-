let socket;
let player;
let currentRoomId = "";
let peer;
let screenPeer;
let localStream;

// Join Room
function joinRoom() {
  const roomId = document.getElementById('roomIdInput').value.trim();
  if (!roomId) return;

  fetch('/api/join-room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId }),
  }).then(res => res.json()).then(() => {
    document.getElementById('room').style.display = 'block';
    document.getElementById('roomDisplay').textContent = roomId;
    currentRoomId = roomId;

    socket = io();
    socket.emit('join-room', roomId);

    socket.on('video-control', ({ action, time, videoId }) => {
      if (!player) return;
      if (action === 'play') {
        player.seekTo(time, true);
        player.playVideo();
      } else if (action === 'pause') {
        player.pauseVideo();
      } else if (action === 'load') {
        player.loadVideoById(videoId);
      }
    });

    socket.on('chat-message', (msg) => {
      const chatBox = document.getElementById('chat-messages');
      const p = document.createElement('p');
      p.textContent = msg;
      chatBox.appendChild(p);
      chatBox.scrollTop = chatBox.scrollHeight;
    });

    // Set up PeerJS
    peer = new Peer(undefined, {
      host: 'localhost',
      port: 9000,
      path: '/peerjs'
    });

    peer.on('open', (id) => {
      socket.emit('peer-connected', { roomId, peerId: id });
    });

    peer.on('call', (call) => {
      call.answer(); // auto-answer for viewers
      call.on('stream', stream => {
        const container = document.getElementById('screen-container');
        container.innerHTML = ""; // replace old
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        container.appendChild(video);
      });
    });

    socket.on('new-peer', (peerId) => {
      if (localStream) {
        const call = peer.call(peerId, localStream);
      }
    });
  });
}

// Load YouTube Video
function loadVideo() {
  const input = document.getElementById('videoIdInput').value.trim();
  if (!input || !player) return;
  const videoId = extractVideoId(input);
  player.loadVideoById(videoId);
  socket.emit('video-control', { roomId: currentRoomId, action: 'load', videoId });
}

// Chat
function sendMessage() {
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg || !socket) return;
  socket.emit('chat-message', { roomId: currentRoomId, message: msg });
  const p = document.createElement('p');
  p.textContent = `You: ${msg}`;
  document.getElementById('chat-messages').appendChild(p);
  input.value = "";
}

// YouTube API
function onYouTubeIframeAPIReady() {
  player = new YT.Player('player', {
    height: '390',
    width: '640',
    videoId: '',
    events: { onStateChange: onPlayerStateChange }
  });
}

function onPlayerStateChange(event) {
  if (!socket || !currentRoomId) return;
  const time = player.getCurrentTime();
  if (event.data === YT.PlayerState.PLAYING) {
    socket.emit('video-control', { roomId: currentRoomId, action: 'play', time });
  } else if (event.data === YT.PlayerState.PAUSED) {
    socket.emit('video-control', { roomId: currentRoomId, action: 'pause', time });
  }
}

function extractVideoId(input) {
  try {
    const url = new URL(input);
    if (url.hostname === 'youtu.be') return url.pathname.slice(1);
    if (url.hostname.includes('youtube.com')) return new URLSearchParams(url.search).get('v');
  } catch {
    return input;
  }
}

// Share screen
function startScreenShare() {
  navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
    .then(stream => {
      localStream = stream;

      const container = document.getElementById('screen-container');
      container.innerHTML = "";
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      container.appendChild(video);

      socket.emit('screen-share-start', currentRoomId);

      // Send to new peers
      socket.on('new-peer', (peerId) => {
        const call = peer.call(peerId, stream);
      });
    })
    .catch(err => {
      console.error("Screen share failed:", err);
    });
}
function sendReaction(emoji) {
  socket.emit('reaction', {
    roomId: currentRoomId,
    emoji: emoji
  });

  showFloatingEmoji(emoji); // Show locally too
}

function sendQuickMessage(message) {
  socket.emit('chat-message', {
    roomId: currentRoomId,
    message: message
  });

  const chatBox = document.getElementById('chat-messages');
  const p = document.createElement('p');
  p.textContent = `You: ${message}`;
  chatBox.appendChild(p);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function showFloatingEmoji(emoji) {
  const emojiElem = document.createElement('div');
  emojiElem.textContent = emoji;
  emojiElem.style.position = 'absolute';
  emojiElem.style.left = `${Math.random() * 80 + 10}%`;
  emojiElem.style.top = '90%';
  emojiElem.style.fontSize = '2rem';
  emojiElem.style.animation = 'float-up 2s ease-out';
  document.body.appendChild(emojiElem);
  setTimeout(() => emojiElem.remove(), 2000);
}

let myPeerId;
let currentCall;

// Setup PeerJS voice call after joining room
function setupVoicePeer() {
  peer = new Peer(undefined, {
    host: '/',
    port: 9000,
    path: '/peerjs' // if you use a custom path, otherwise just '/'
  });

  peer.on('open', id => {
    myPeerId = id;
    socket.emit('voice-peer-id', { roomId: currentRoomId, peerId: id });
  });

  peer.on('call', call => {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        localStream = stream;
        call.answer(stream);
        call.on('stream', remoteStream => {
          playIncomingAudio(remoteStream);
        });
        currentCall = call;
      });
  });

  socket.on('receive-voice-call', ({ fromPeerId }) => {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        localStream = stream;
        const call = peer.call(fromPeerId, stream);
        call.on('stream', remoteStream => {
          playIncomingAudio(remoteStream);
        });
        currentCall = call;
      });
  });
}

// Call voice
function startVoiceCall() {
  socket.emit('request-voice-call', { roomId: currentRoomId });
}

// Play incoming audio
function playIncomingAudio(stream) {
  const audioElem = new Audio();
  audioElem.srcObject = stream;
  audioElem.play();
}

let myAudioStream;
let connectedPeers = {};

function startVoiceChat() {
  myPeer = new Peer(undefined, {
    host: '/',
    port: 9000,
    path: '/peerjs'
  });

  navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    .then(stream => {
      myAudioStream = stream;

      myPeer.on('call', call => {
        call.answer(myAudioStream); // Answer call with own mic
        call.on('stream', remoteStream => {
          addAudioStream(remoteStream);
        });
      });

      socket.emit('ready-for-voice', currentRoomId);

      socket.on('user-joined-voice', userId => {
        const call = myPeer.call(userId, myAudioStream);
        call.on('stream', remoteStream => {
          addAudioStream(remoteStream);
        });
        connectedPeers[userId] = call;
      });

      myPeer.on('open', id => {
        socket.emit('register-voice-id', {
          roomId: currentRoomId,
          peerId: id
        });
      });
    });
}

function addAudioStream(stream) {
  const audio = document.createElement('audio');
  audio.srcObject = stream;
  audio.autoplay = true;
  document.body.appendChild(audio); // Or append to a better container
}
