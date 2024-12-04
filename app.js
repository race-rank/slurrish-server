const express = require("express");
const { Server } = require("socket.io");
const http = require("http");

// Create an Express application
const app = express();
const PORT = process.env.PORT || 10000;

// Create an HTTP server with the Express app
const httpServer = http.createServer(app);

// Initialize Socket.IO with CORS settings
const io = new Server(httpServer, {
  cors: {
    origin: "*:*", // Allow all origins for development. Restrict this in production.
    methods: ["GET", "POST"],
  },
});

const lobbies = {};

// Socket.IO logic
io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  socket.on("createLobby", ({ playerName, words }) => {
    const lobbyId = generateId();
    const playerId = socket.id;

    socket.lobbyId = lobbyId;

    lobbies[lobbyId] = {
      id: lobbyId,
      players: {
        [playerId]: {
          name: playerName,
          words,
          usedWords: [],
        },
      },
      playerOrder: [playerId],
      gameStarted: false,
      currentTurnIndex: 0,
    };

    socket.join(lobbyId);
    socket.emit("lobbyCreated", { lobbyId, playerId });
    console.log(`Lobby ${lobbyId} created by player ${playerName}`);
  });

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
    leaveLobby(socket);
  });
});

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

function leaveLobby(socket) {
  const lobby = lobbies[socket.lobbyId];
  if (lobby) {
    delete lobby.players[socket.id];
    lobby.playerOrder = lobby.playerOrder.filter((id) => id !== socket.id);

    io.to(socket.lobbyId).emit("playerLeft", { playerId: socket.id });

    if (Object.keys(lobby.players).length === 0) {
      delete lobbies[socket.lobbyId];
      console.log(`Lobby ${socket.lobbyId} deleted.`);
    }
  }
}

// Start the server
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
