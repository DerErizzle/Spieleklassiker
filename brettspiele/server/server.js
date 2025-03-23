const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    transports: ['polling'],
    cors: {
        origin: "https://erizzle.de",
        methods: ["GET", "POST"]
    }
});

// Statische Dateien bereitstellen
app.use(express.static(path.join(__dirname, '..')));

// Spieleräume und aktive Spiele
const rooms = {};

// Hilfsfunktion: Zufälligen 4-stelligen Code generieren
function generateRoomCode() {
    let code;
    do {
        code = Math.floor(1000 + Math.random() * 9000).toString();
    } while (rooms[code]); // Stellt sicher, dass der Code einzigartig ist
    
    return code;
}

// Socket.io-Verbindungshandler
io.on('connection', (socket) => {
    console.log('Neuer Benutzer verbunden:', socket.id);
    
    // Raum erstellen
    socket.on('createRoom', (data) => {
        const roomCode = generateRoomCode();
        const { gameType, username, userColor } = data;
        
        // Raum erstellen
        rooms[roomCode] = {
            gameType,
            players: [{
                id: socket.id,
                username,
                color: userColor,
                isHost: true
            }],
            gameState: initializeGameState(gameType),
            currentTurn: 0
        };
        
        // Socket tritt dem Raum bei
        socket.join(roomCode);
        
        // Bestätigung an den Client senden
        socket.emit('roomCreated', {
            roomCode,
            gameType
        });
        
        console.log(`Raum erstellt: ${roomCode} für Spiel ${gameType}`);
    });
    
    // Raum beitreten
    socket.on('joinRoom', (data) => {
        const { roomCode, username, userColor } = data;
        
        // Überprüfen, ob der Raum existiert
        if (!rooms[roomCode]) {
            socket.emit('joinError', 'Der Raum existiert nicht.');
            return;
        }
        
        // Überprüfen, ob der Raum voll ist (bei 4 Gewinnt max. 2 Spieler)
        if (rooms[roomCode].gameType === 'vier-gewinnt' && rooms[roomCode].players.length >= 2) {
            socket.emit('joinError', 'Der Raum ist voll.');
            return;
        }
        
        // Für andere Spiele (max. 4 Spieler)
        if (rooms[roomCode].players.length >= 4) {
            socket.emit('joinError', 'Der Raum ist voll.');
            return;
        }
        
        // Überprüfen, ob der Benutzername bereits im Raum ist
        if (rooms[roomCode].players.some(player => player.username === username)) {
            socket.emit('joinError', 'Dieser Benutzername wird bereits verwendet.');
            return;
        }
        
        // Spieler zum Raum hinzufügen
        rooms[roomCode].players.push({
            id: socket.id,
            username,
            color: userColor,
            isHost: false
        });
        
        // Socket tritt dem Raum bei
        socket.join(roomCode);
        
        // Bestätigung an den Client senden
        socket.emit('joinSuccess', {
            roomCode,
            gameType: rooms[roomCode].gameType
        });
        
        // Alle Spieler im Raum über den neuen Spieler informieren
        io.to(roomCode).emit('playerJoined', {
            player: {
                username,
                color: userColor,
                isHost: false
            },
            players: rooms[roomCode].players.map(p => ({
                username: p.username,
                color: p.color,
                isHost: p.isHost
            }))
        });
        
        console.log(`Spieler ${username} trat Raum ${roomCode} bei`);
    });
    
    // Spielzug für Vier Gewinnt
    socket.on('makeMove', (data) => {
        const { roomCode, column } = data;
        
        if (!rooms[roomCode]) return;
        
        const room = rooms[roomCode];
        const currentPlayer = room.players[room.currentTurn];
        
        // Überprüfen, ob der Spieler am Zug ist
        if (currentPlayer.id !== socket.id) return;
        
        // Spiellogik basierend auf dem Spieltyp
        if (room.gameType === 'vier-gewinnt') {
            const result = makeVierGewinntMove(room.gameState, column, {
                username: currentPlayer.username,
                color: currentPlayer.color
            });
            
            if (result.valid) {
                // Zug ist gültig
                room.gameState = result.newState;
                
                // Nächster Spieler ist dran
                room.currentTurn = (room.currentTurn + 1) % room.players.length;
                
                // Alle Spieler über den Zug informieren
                io.to(roomCode).emit('moveUpdate', {
                    column,
                    row: result.row,
                    player: {
                        username: currentPlayer.username,
                        color: currentPlayer.color
                    },
                    nextPlayer: room.players[room.currentTurn].username,
                    gameState: room.gameState
                });
                
                // Überprüfen, ob das Spiel vorbei ist
                if (result.gameOver) {
                    io.to(roomCode).emit('gameOver', {
                        winner: result.winner ? currentPlayer.username : null,
                        winningCells: result.winningCells || []
                    });
                }
            }
        }
    });
    
    // Spielneustart
    socket.on('restartGame', (data) => {
        const { roomCode } = data;
        
        if (!rooms[roomCode]) return;
        
        const room = rooms[roomCode];
        
        // Nur der Host kann das Spiel neu starten
        const player = room.players.find(p => p.id === socket.id);
        if (!player || !player.isHost) return;
        
        // Spielstatus zurücksetzen
        room.gameState = initializeGameState(room.gameType);
        room.currentTurn = 0;
        
        // Alle Spieler über den Neustart informieren
        io.to(roomCode).emit('gameRestarted', {
            gameState: room.gameState,
            currentPlayer: room.players[0].username
        });
    });
    
    // Raum verlassen
    socket.on('leaveRoom', (data) => {
        const { roomCode } = data;
        handlePlayerDisconnect(socket, roomCode);
    });
    
    // Verbindungsabbruch
    socket.on('disconnect', () => {
        console.log('Benutzer getrennt:', socket.id);
        
        // Alle Räume finden, in denen dieser Spieler ist
        for (const roomCode in rooms) {
            handlePlayerDisconnect(socket, roomCode);
        }
    });
});

// Funktion zum Behandeln eines Spielerabbruchs
function handlePlayerDisconnect(socket, roomCode) {
    if (!rooms[roomCode]) return;
    
    const room = rooms[roomCode];
    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    
    if (playerIndex !== -1) {
        const player = room.players[playerIndex];
        
        // Spieler aus dem Raum entfernen
        room.players.splice(playerIndex, 1);
        
        // Socket verlässt den Raum
        socket.leave(roomCode);
        
        // Wenn keine Spieler mehr im Raum sind, Raum löschen
        if (room.players.length === 0) {
            delete rooms[roomCode];
            console.log(`Raum ${roomCode} gelöscht`);
        } else {
            // Wenn der Host den Raum verlässt, neuen Host bestimmen
            if (player.isHost && room.players.length > 0) {
                room.players[0].isHost = true;
            }
            
            // Wenn der aktuelle Spieler den Raum verlässt, zum nächsten wechseln
            if (room.currentTurn >= room.players.length) {
                room.currentTurn = 0;
            }
            
            // Alle verbleibenden Spieler informieren
            io.to(roomCode).emit('playerLeft', {
                username: player.username,
                players: room.players.map(p => ({
                    username: p.username,
                    color: p.color,
                    isHost: p.isHost
                })),
                currentPlayer: room.players[room.currentTurn].username
            });
        }
        
        console.log(`Spieler ${player.username} verließ Raum ${roomCode}`);
    }
}

// Spiel-spezifische Funktionen
function initializeGameState(gameType) {
    // Vier Gewinnt
    if (gameType === 'vier-gewinnt') {
        return {
            board: Array(6).fill().map(() => Array(7).fill(null)),
            moves: 0
        };
    }
    
    // Andere Spiele hier implementieren
    
    return {};
}

// Funktion für einen Spielzug bei Vier Gewinnt
function makeVierGewinntMove(gameState, column, player) {
    const board = gameState.board;
    
    // Spalte überprüfen
    if (column < 0 || column >= 7) {
        return { valid: false };
    }
    
    // Von unten nach oben prüfen, ob ein Platz frei ist
    for (let row = 5; row >= 0; row--) {
        if (board[row][column] === null) {
            // Spielstein platzieren
            const newState = {
                board: board.map(r => [...r]),
                moves: gameState.moves + 1
            };
            newState.board[row][column] = {
                username: player.username,
                color: player.color
            };
            
            // Prüfen, ob ein Gewinn vorliegt
            const winCheck = checkWin(newState.board, row, column);
            
            return {
                valid: true,
                newState,
                row,
                gameOver: winCheck.win || newState.moves === 42,
                winner: winCheck.win,
                winningCells: winCheck.cells
            };
        }
    }
    
    // Spalte ist voll
    return { valid: false };
}

// Funktion zum Überprüfen eines Siegs bei Vier Gewinnt
function checkWin(board, lastRow, lastCol) {
    const directions = [
        [0, 1],  // horizontal
        [1, 0],  // vertikal
        [1, 1],  // diagonal nach rechts unten
        [1, -1]  // diagonal nach links unten
    ];
    
    const currentPlayer = board[lastRow][lastCol];
    
    for (const [dx, dy] of directions) {
        const cells = [[lastRow, lastCol]];
        
        // In eine Richtung zählen
        let count = 1;
        let r = lastRow + dx;
        let c = lastCol + dy;
        
        while (
            r >= 0 && r < 6 && c >= 0 && c < 7 &&
            board[r][c] && board[r][c].username === currentPlayer.username
        ) {
            cells.push([r, c]);
            count++;
            r += dx;
            c += dy;
        }
        
        // In die entgegengesetzte Richtung zählen
        r = lastRow - dx;
        c = lastCol - dy;
        
        while (
            r >= 0 && r < 6 && c >= 0 && c < 7 &&
            board[r][c] && board[r][c].username === currentPlayer.username
        ) {
            cells.push([r, c]);
            count++;
            r -= dx;
            c -= dy;
        }
        
        // 4 oder mehr in einer Reihe bedeutet Sieg
        if (count >= 4) {
            return { win: true, cells };
        }
    }
    
    return { win: false, cells: [] };
}

// Server starten
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});