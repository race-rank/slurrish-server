const WebSocket = require('ws');

const lobbies = {};
const wss = new WebSocket.Server({ port: 10000 });

wss.on('connection', (ws) => {
  ws.playerId = null;
  ws.lobbyId = null;

  console.log('Player connected.');

  ws.on('message', (message) => {
    const data = JSON.parse(message);

    switch (data.action) {
      case 'createLobby':
        createLobby(ws, data.playerName, data.words);
        break;
      case 'joinLobby':
        joinLobby(ws, data.lobbyId, data.playerName, data.words);
        break;
      case 'leaveLobby':
        leaveLobby(ws);
        break;
      case 'startGame':
        startGame(ws);
        break;
      case 'selectWord':
        handleWordSelection(ws, data.word);
        break;
      case 'submitWords':
        submitWords(ws, data.words);
        break;
      default:
        console.log('Unknown action:', data.action);
    }
  });

  ws.on('close', () => {
    leaveLobby(ws);
    console.log('Player disconnected.');
  });
});

console.log('WebSocket server is running on ws://localhost:10000');

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

function broadcastToLobby(lobbyId, message) {
  const lobby = lobbies[lobbyId];
  if (!lobby) return;

  Object.keys(lobby.players).forEach((playerId) => {
    wss.clients.forEach((client) => {
      if (client.playerId === playerId) {
        client.send(JSON.stringify(message));
      }
    });
  });
}

function createLobby(ws, playerName, words) {
  const lobbyId = generateId();
  ws.lobbyId = lobbyId;
  ws.playerId = generateId();

  lobbies[lobbyId] = {
    id: lobbyId,
    players: { 
      [ws.playerId]: { 
        name: playerName, 
        words,
        usedWords: []
      } 
    },
    playerOrder: [ws.playerId],
    gameStarted: false,
    currentTurnIndex: 0,
  };

  ws.send(JSON.stringify({ action: 'lobbyCreated', lobbyId, playerId: ws.playerId }));
  console.log(`Lobby ${lobbyId} created by player ${playerName}`);
}

function joinLobby(ws, lobbyId, playerName) {
  if (!lobbies[lobbyId]) {
    lobbies[lobbyId] = {
      players: [],
    };
  }

  const lobby = lobbies[lobbyId];
  if (!lobby.players.find((player) => player.name === playerName)) {
    lobby.players.push({ name: playerName, id: ws._socket.remoteAddress });
  }

  ws.playerId = playerName;
  ws.lobbyId = lobbyId;

  console.log(`Player ${playerName} joined lobby ${lobbyId}.`);

  const updatedPlayerList = lobby.players.map((player) => player.name);
  broadcastToLobby(lobbyId, {
    action: 'playerJoined',
    playerId: ws.playerId,
    playersName: updatedPlayerList,
  });
}

function leaveLobby(ws) {
  const lobby = lobbies[ws.lobbyId];
  if (lobby) {
    delete lobby.players[ws.playerId];
    lobby.playerOrder = lobby.playerOrder.filter(id => id !== ws.playerId);

    broadcastToLobby(ws.lobbyId, {
      action: 'playerLeft',
      playerId: ws.playerId,
    });

    if (Object.keys(lobby.players).length === 0) {
      delete lobbies[ws.lobbyId];
      console.log(`Lobby ${ws.lobbyId} deleted.`);
    } else {
      if (lobby.currentTurnIndex >= lobby.playerOrder.length) {
        lobby.currentTurnIndex = 0;
      }
      broadcastTurnUpdate(ws.lobbyId);
    }
  }
}

function startGame(ws) {
  const lobby = lobbies[ws.lobbyId];
  if (lobby && !lobby.gameStarted) {
    lobby.gameStarted = true;
    broadcastToLobby(ws.lobbyId, { action: 'gameStarted' });
    broadcastTurnUpdate(ws.lobbyId);
    console.log(`Game started in lobby ${ws.lobbyId}`);
  }
}

function handleWordSelection(ws, word) {
  const lobby = lobbies[ws.lobbyId];
  if (!lobby || !lobby.gameStarted) return;

  const currentPlayerId = lobby.playerOrder[lobby.currentTurnIndex];
  if (ws.playerId !== currentPlayerId) {
    ws.send(JSON.stringify({ action: 'error', message: 'Not your turn' }));
    return;
  }

  const playerData = lobby.players[ws.playerId];
  if (!playerData.words.includes(word) || playerData.usedWords.includes(word)) {
    ws.send(JSON.stringify({ action: 'error', message: 'Word not available or already used' }));
    return;
  }

  playerData.usedWords.push(word);

  broadcastToLobby(ws.lobbyId, {
    action: 'wordChosen',
    playerId: ws.playerId,
    word,
  });

  lobby.currentTurnIndex = (lobby.currentTurnIndex + 1) % lobby.playerOrder.length;

  const allWordsUsed = Object.values(lobby.players).every(player => player.words.length === player.usedWords.length);
  if (allWordsUsed) {
    broadcastToLobby(ws.lobbyId, { action: 'gameOver', message: 'All players have used all their words' });
    lobby.gameStarted = false;
  } else {
    broadcastTurnUpdate(ws.lobbyId);
  }
}

function submitWords(ws, words) {
  const lobby = lobbies[ws.lobbyId];
  if (!lobby || lobby.gameStarted) {
    ws.send(JSON.stringify({ action: 'error', message: 'Cannot submit words after the game has started' }));
    return;
  }

  const player = lobby.players[ws.playerId];
  if (player) {
    player.words = words;
    player.usedWords = [];

    broadcastToLobby(ws.lobbyId, {
      action: 'wordsUpdated',
      playerId: ws.playerId,
      words,
    });
    console.log(`Player ${player.name} updated words in lobby ${ws.lobbyId}`);
  } else {
    ws.send(JSON.stringify({ action: 'error', message: 'Player not found in the lobby' }));
  }
}

function broadcastTurnUpdate(lobbyId) {
  const lobby = lobbies[lobbyId];
  if (!lobby || !lobby.gameStarted) return;

  const currentPlayerId = lobby.playerOrder[lobby.currentTurnIndex];
  const currentPlayer = lobby.players[currentPlayerId];

  broadcastToLobby(lobbyId, {
    action: 'turnUpdate',
    currentPlayerId,
    availableWords: currentPlayer.words.filter(word => !currentPlayer.usedWords.includes(word)),
  });
}
