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

// Debug-Modus (auf true setzen für mehr Logging)
const DEBUG = true;

const DISCONNECT_TIMEOUT = 3000;

const AVAILABLE_COLORS = [
    '#e74c3c', // rot
    '#3498db', // blau
    '#2ecc71', // grün
    '#f1c40f', // gelb
    '#9b59b6', // lila
    '#e67e22'  // orange
];

const disconnectTimers = {};

// Debug-Logging-Funktion
function debugLog(message, data = {}) {
    if (DEBUG) {
        console.log(`[DEBUG] ${message}`, data);
    }
}

// Statische Dateien bereitstellen
app.use(express.static(path.join(__dirname, '..')));

// Hauptseite (statt index.html)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Login-Seite (statt login.html)
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'login.html'));
});

// Spiel-Routen (z.B. /spiele/vier-gewinnt)
app.get('/spiele/:spieltyp', (req, res) => {
    const spieltyp = req.params.spieltyp;
    if (spieltyp === 'vier-gewinnt') {
        res.sendFile(path.join(__dirname, '..', 'spiele', 'vier-gewinnt', 'index.html'));
    } else {
        // Für zukünftige Spiele kannst du hier weitere else-if-Blöcke hinzufügen
        res.status(404).send('Spiel nicht gefunden');
    }
});

// Debug-Route
app.get('/debug', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'debug.html'));
});

// Hilfsrouten für Debugging (behalte diesen Block)
if (DEBUG) {
    // Liste aller Räume als JSON abrufen
    app.get('/debug/rooms', (req, res) => {
        // ... bestehender Code ...
    });
}

// Weiterleitung aller anderen Routen zur index.html (Catch-All-Handler)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

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
    debugLog('Neuer Benutzer verbunden:', { socketId: socket.id });
  
    // Hover-Update
    socket.on('hoverUpdate', (data) => {
        const { roomCode, column, username, userColor } = data;
        
        if (!rooms[roomCode]) {
            return;
        }
        
        // Nur an andere Spieler im gleichen Raum senden
        socket.to(roomCode).emit('hoverUpdate', {
            column,
            username,
            userColor
        });
        
        if (DEBUG) {
            debugLog('Hover-Update gesendet:', { roomCode, username, column });
        }
    });

    // Raum erstellen
    socket.on('createRoom', (data) => {
        const roomCode = generateRoomCode();
        const { gameType, username, userColor } = data;
        
        debugLog('Raum wird erstellt:', { roomCode, gameType, username, socketId: socket.id });
        
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
        
        debugLog(`Raum erstellt: ${roomCode} für Spiel ${gameType}`);
    });
    
    // Raum beitreten
    socket.on('joinRoom', (data) => {
        const { roomCode, username, userColor } = data;
        
        debugLog('Raumbeitrittsanfrage:', { roomCode, username, socketId: socket.id });
        
        // Überprüfen, ob der Raum existiert
        if (!rooms[roomCode]) {
            debugLog('Raum existiert nicht:', { roomCode });
            socket.emit('joinError', 'Der Raum existiert nicht.');
            return;
        }
        
        // Überprüfen, ob der Spieler bereits im Raum ist
        const existingPlayerIndex = rooms[roomCode].players.findIndex(p => p.username === username);
        if (existingPlayerIndex >= 0) {
            // Spieler ist bereits im Raum - Socket-ID aktualisieren und nicht duplizieren
            debugLog('Spieler bereits im Raum, aktualisiere Socket-ID', { 
                username, 
                oldSocketId: rooms[roomCode].players[existingPlayerIndex].id, 
                newSocketId: socket.id 
            });
            
            rooms[roomCode].players[existingPlayerIndex].id = socket.id;
            
            // Falls es einen Verbindungsverlust-Timer für diesen Spieler gibt, diesen löschen
            if (disconnectTimers[roomCode] && disconnectTimers[roomCode][username]) {
                clearTimeout(disconnectTimers[roomCode][username]);
                delete disconnectTimers[roomCode][username];
                
                // Andere Spieler informieren, dass dieser Spieler wieder verbunden ist
                socket.to(roomCode).emit('playerReconnected', {
                    username: username
                });
            }
            
            // Socket tritt dem Raum bei
            socket.join(roomCode);
            
            // Bestätigung an den Client senden
            socket.emit('joinSuccess', {
                roomCode,
                gameType: rooms[roomCode].gameType
            });
            
            // Spielerliste an alle Spieler im Raum senden
            io.to(roomCode).emit('playerJoined', {
                player: {
                    username,
                    color: rooms[roomCode].players[existingPlayerIndex].color,
                    isHost: rooms[roomCode].players[existingPlayerIndex].isHost
                },
                players: rooms[roomCode].players.map(p => ({
                    username: p.username,
                    color: p.color,
                    isHost: p.isHost
                }))
            });
            
            if (rooms[roomCode].gameType === 'vier-gewinnt' && rooms[roomCode].players.length === 2) {
                io.to(roomCode).emit('moveUpdate', {
                    column: null,
                    row: null,
                    player: null,
                    nextPlayer: rooms[roomCode].players[0].username,
                    gameState: rooms[roomCode].gameState
                });
            }
            
            return;
        }
        
        // Überprüfen, ob der Raum voll ist (bei 4 Gewinnt max. 2 Spieler)
        if (rooms[roomCode].gameType === 'vier-gewinnt' && rooms[roomCode].players.length >= 2) {
            debugLog('Raum ist voll (Vier Gewinnt):', { roomCode, playerCount: rooms[roomCode].players.length });
            socket.emit('joinError', 'Der Raum ist voll.');
            return;
        }
        
        // Für andere Spiele (max. 4 Spieler)
        if (rooms[roomCode].players.length >= 4) {
            debugLog('Raum ist voll (max 4 Spieler):', { roomCode, playerCount: rooms[roomCode].players.length });
            socket.emit('joinError', 'Der Raum ist voll.');
            return;
        }
        
        // Überprüfe auf Farbkonflikte und weise gegebenenfalls eine andere Farbe zu
        let assignedColor = userColor;
        const existingColors = rooms[roomCode].players.map(p => p.color);
        
        if (existingColors.includes(userColor)) {
            // Farbkonflikt entdeckt, wähle eine andere Farbe
            debugLog('Farbkonflikt erkannt:', { 
                roomCode, 
                username, 
                requestedColor: userColor,
                existingColors 
            });
            
            // Finde eine Farbe, die noch nicht in Verwendung ist
            for (const color of AVAILABLE_COLORS) {
                if (!existingColors.includes(color)) {
                    assignedColor = color;
                    debugLog('Neue Farbe zugewiesen:', { 
                        roomCode, 
                        username, 
                        newColor: assignedColor 
                    });
                    break;
                }
            }
            
            // Falls alle Farben verwendet werden, nimm die erste (sollte bei max. 2 Spielern nicht passieren)
            if (assignedColor === userColor) {
                assignedColor = AVAILABLE_COLORS[0];
            }
        }
        
        // Spieler zum Raum hinzufügen
        rooms[roomCode].players.push({
            id: socket.id,
            username,
            color: assignedColor,
            isHost: false
        });
        
        // Socket tritt dem Raum bei
        socket.join(roomCode);
        
        debugLog('Spieler tritt Raum bei:', { 
            roomCode, 
            username, 
            playerCount: rooms[roomCode].players.length,
            allPlayers: rooms[roomCode].players.map(p => p.username)
        });
        
        // Bestätigung an den Client senden
        socket.emit('joinSuccess', {
            roomCode,
            gameType: rooms[roomCode].gameType
        });
        
        // Alle Spieler im Raum über den neuen Spieler informieren
        io.to(roomCode).emit('playerJoined', {
            player: {
                username,
                color: assignedColor,
                isHost: false
            },
            players: rooms[roomCode].players.map(p => ({
                username: p.username,
                color: p.color,
                isHost: p.isHost
            }))
        });
    
        if (rooms[roomCode].gameType === 'vier-gewinnt' && rooms[roomCode].players.length === 2) {
            debugLog('Spiel startet (2 Spieler im Raum):', { roomCode });
            io.to(roomCode).emit('moveUpdate', {
                column: null,
                row: null,
                player: null,
                nextPlayer: rooms[roomCode].players[0].username,
                gameState: rooms[roomCode].gameState
            });
        }
    });
    
    // Spielzug für Vier Gewinnt
    socket.on('makeMove', (data) => {
        const { roomCode, column } = data;
        
        if (!rooms[roomCode]) {
            debugLog('Zug in nicht-existierendem Raum:', { roomCode, socketId: socket.id });
            return;
        }
        
        const room = rooms[roomCode];
        
        // Spieler identifizieren
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex === -1) {
            debugLog('Spieler nicht im Raum gefunden:', { roomCode, socketId: socket.id });
            return;
        }
        
        const player = room.players[playerIndex];
        
        // Überprüfen, ob der Spieler am Zug ist
        if (playerIndex !== room.currentTurn) {
            debugLog('Spieler nicht am Zug:', { 
                roomCode, 
                username: player.username, 
                currentTurn: room.currentTurn 
            });
            return;
        }
        
        debugLog('Verarbeite Spielzug:', { 
            roomCode, 
            username: player.username, 
            column 
        });
        
        // Spiellogik basierend auf dem Spieltyp
        if (room.gameType === 'vier-gewinnt') {
            const result = makeVierGewinntMove(room.gameState, column, {
                username: player.username,
                color: player.color
            });
            
            if (result.valid) {
                // Zug ist gültig
                room.gameState = result.newState;
                
                // Nächster Spieler ist dran
                room.currentTurn = (room.currentTurn + 1) % room.players.length;
                
                debugLog('Gültiger Zug ausgeführt:', {
                    roomCode,
                    username: player.username,
                    column,
                    row: result.row,
                    nextPlayerIndex: room.currentTurn
                });
                
                // Alle Spieler über den Zug informieren
                io.to(roomCode).emit('moveUpdate', {
                    column,
                    row: result.row,
                    player: {
                        username: player.username,
                        color: player.color
                    },
                    nextPlayer: room.players[room.currentTurn].username,
                    gameState: room.gameState
                });
                
                // Überprüfen, ob das Spiel vorbei ist
                if (result.gameOver) {
                    debugLog('Spiel ist vorbei:', {
                        roomCode,
                        winner: result.winner ? player.username : null
                    });
                    
                    io.to(roomCode).emit('gameOver', {
                        winner: result.winner ? player.username : null,
                        winningCells: result.winningCells || []
                    });
                }
            } else {
                debugLog('Ungültiger Zug:', {
                    roomCode,
                    username: player.username,
                    column
                });
            }
        }
    });
    
    // Spielneustart
    socket.on('restartGame', (data) => {
        const { roomCode } = data;
        
        if (!rooms[roomCode]) {
            debugLog('Neustart in nicht-existierendem Raum:', { roomCode });
            return;
        }
        
        const room = rooms[roomCode];
        
        // Spieler identifizieren
        const player = room.players.find(p => p.id === socket.id);
        if (!player) {
            debugLog('Spieler nicht im Raum gefunden:', { roomCode, socketId: socket.id });
            return;
        }
        
        // Nur der Host kann das Spiel neu starten
        if (!player.isHost) {
            debugLog('Nicht-Host versucht Spiel neu zu starten:', { 
                roomCode, 
                username: player.username 
            });
            return;
        }
        
        debugLog('Spiel wird neu gestartet:', { roomCode, username: player.username });
        
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
        debugLog('Spieler verlässt Raum (explizit):', { roomCode, socketId: socket.id });
        handlePlayerDisconnect(socket, roomCode);
    });
    
    // Verbindungsabbruch
    socket.on('disconnect', () => {
        debugLog('Benutzer getrennt:', { socketId: socket.id });
        
        // Alle Räume finden, in denen dieser Spieler ist
        for (const roomCode in rooms) {
            const playerIndex = rooms[roomCode].players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                const username = rooms[roomCode].players[playerIndex].username;
                
                debugLog('Spieler vorübergehend getrennt:', { 
                    roomCode, 
                    socketId: socket.id,
                    username: username
                });
                
                // Initialisiere das Timer-Objekt für diesen Raum, falls es noch nicht existiert
                if (!disconnectTimers[roomCode]) {
                    disconnectTimers[roomCode] = {};
                }
                
                // Starte einen Timer für diesen Spieler
                disconnectTimers[roomCode][username] = setTimeout(() => {
                    debugLog('Verbindungs-Timeout für Spieler:', { 
                        roomCode, 
                        username 
                    });
                    
                    // Entferne den Timer
                    delete disconnectTimers[roomCode][username];
                    
                    // Behandle den tatsächlichen Disconnect
                    handlePlayerDisconnect(socket, roomCode);
                }, DISCONNECT_TIMEOUT);
                
                // Informiere andere Spieler über den vorübergehenden Verbindungsverlust
                socket.to(roomCode).emit('playerDisconnected', {
                    username: username
                });
            }
        }
    });
});

// Funktion zum Behandeln eines Spielerabbruchs
function handlePlayerDisconnect(socket, roomCode) {
    if (!rooms[roomCode]) {
        debugLog('Spielerabbruch in nicht-existierendem Raum:', { roomCode });
        return;
    }
    
    const room = rooms[roomCode];
    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    
    if (playerIndex !== -1) {
        const player = room.players[playerIndex];
        
        // Bereinige Timer, falls vorhanden
        if (disconnectTimers[roomCode] && disconnectTimers[roomCode][player.username]) {
            clearTimeout(disconnectTimers[roomCode][player.username]);
            delete disconnectTimers[roomCode][player.username];
        }
        
        debugLog('Entferne Spieler aus Raum:', { 
            roomCode, 
            username: player.username, 
            remainingPlayers: room.players.length - 1 
        });
        
        // Spieler aus dem Raum entfernen
        room.players.splice(playerIndex, 1);
        
        // Socket verlässt den Raum
        socket.leave(roomCode);
        
        // Wenn keine Spieler mehr im Raum sind, Raum löschen
        if (room.players.length === 0) {
            debugLog('Letzter Spieler hat Raum verlassen, lösche Raum:', { roomCode });
            delete rooms[roomCode];
        } else {
            // Wenn der Host den Raum verlässt, neuen Host bestimmen
            if (player.isHost && room.players.length > 0) {
                debugLog('Host verlässt Raum, bestimme neuen Host:', { 
                    roomCode, 
                    newHost: room.players[0].username 
                });
                room.players[0].isHost = true;
            }
            
            // Wenn der aktuelle Spieler den Raum verlässt, zum nächsten wechseln
            if (room.currentTurn >= room.players.length) {
                room.currentTurn = 0;
            }
            
            // Alle verbleibenden Spieler informieren
            debugLog('Informiere verbleibende Spieler:', { 
                roomCode, 
                remainingPlayers: room.players.map(p => p.username),
                currentPlayer: room.players[room.currentTurn].username 
            });
            
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

// Hilfsrouten für Debugging
if (DEBUG) {
    // Liste aller Räume als JSON abrufen
    app.get('/debug/rooms', (req, res) => {
        const roomInfo = {};
        for (const roomCode in rooms) {
            roomInfo[roomCode] = {
                gameType: rooms[roomCode].gameType,
                playerCount: rooms[roomCode].players.length,
                players: rooms[roomCode].players.map(p => ({
                    username: p.username,
                    color: p.color,
                    isHost: p.isHost
                })),
                currentTurn: rooms[roomCode].currentTurn
            };
        }
        res.json(roomInfo);
    });
}

// Weiterleitung aller anderen Routen zur index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Server starten
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});