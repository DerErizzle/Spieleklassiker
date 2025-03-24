const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

// Eigene Module importieren
const gameManager = require('./game-manager');
const debug = require('./debug-utils');

// Spielehandler importieren
const connectFourHandler = require('./game-handlers/connect-four-handler');
const sevensHandler = require('./game-handlers/sevens-handler');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    transports: ['polling'],
    cors: {
        origin: "https://erizzle.de",
        methods: ["GET", "POST"]
    }
});

// Spieltypen registrieren
gameManager.registerGame('vier-gewinnt', connectFourHandler);
gameManager.registerGame('kartendomino', sevensHandler);

// Statische Dateien bereitstellen
app.use(express.static(path.join(__dirname, '..')));

// Route zum Abrufen von Übersetzungen
app.get('/api/translations/:lang', (req, res) => {
    const lang = req.params.lang;
    const validLangs = ['de', 'en'];
    
    if (!validLangs.includes(lang)) {
        return res.status(400).json({ error: 'Unsupported language' });
    }
    
    const filePath = path.join(__dirname, '..', 'translations', `${lang}.json`);
    
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            debug.log('Fehler beim Lesen der Übersetzungsdatei:', { lang, error: err.message });
            return res.status(500).json({ error: 'Error loading translations' });
        }
        
        try {
            const translations = JSON.parse(data);
            res.json(translations);
        } catch (e) {
            debug.log('Fehler beim Parsen der Übersetzungsdatei:', { lang, error: e.message });
            res.status(500).json({ error: 'Error parsing translations' });
        }
    });
});

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
    
    // Prüfen, ob ein Ordner für diesen Spieltyp existiert
    const spielPfad = path.join(__dirname, '..', 'spiele', spieltyp, 'index.html');
    
    fs.access(spielPfad, fs.constants.F_OK, (err) => {
        if (err) {
            // Spiel nicht gefunden
            res.status(404).send('Spiel nicht gefunden');
        } else {
            // Spiel gefunden, HTML-Datei senden
            res.sendFile(spielPfad);
        }
    });
});

// Debug-Route
app.get('/debug', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'debug.html'));
});

// Hilfsrouten für Debugging (behalte diesen Block)
if (debug.DEBUG) {
    // Liste aller Räume als JSON abrufen
    app.get('/debug/rooms', (req, res) => {
        const roomInfo = {};
        for (const roomCode in gameManager.rooms) {
            roomInfo[roomCode] = {
                gameType: gameManager.rooms[roomCode].gameType,
                playerCount: gameManager.rooms[roomCode].players.length,
                players: gameManager.rooms[roomCode].players.map(p => ({
                    username: p.username,
                    color: p.color,
                    isHost: p.isHost
                })),
                currentTurn: gameManager.rooms[roomCode].currentTurn
            };
        }
        res.json(roomInfo);
    });
}

// Weiterleitung aller anderen Routen zur index.html (Catch-All-Handler)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Socket.io-Verbindungshandler
io.on('connection', (socket) => {
    debug.log('Neuer Benutzer verbunden:', { socketId: socket.id });
  
    // Hover-Update
    socket.on('hoverUpdate', (data) => {
        const { roomCode, column, username, userColor } = data;
        
        if (!gameManager.rooms[roomCode]) {
            return;
        }
        
        // Nur an andere Spieler im gleichen Raum senden
        socket.to(roomCode).emit('hoverUpdate', {
            column,
            username,
            userColor
        });
        
        if (debug.DEBUG) {
            debug.log('Hover-Update gesendet:', { roomCode, username, column });
        }
    });

    // Raum erstellen
    socket.on('createRoom', (data) => {
        gameManager.createRoom(data.gameType, socket, data);
    });
    
    // Raum beitreten
    socket.on('joinRoom', (data) => {
        gameManager.joinRoom(data.roomCode, socket, data);
    });
    
    // Aktuellen Spielstand anfordern
    socket.on('requestGameState', (data) => {
        const { roomCode } = data;
        
        if (!gameManager.rooms[roomCode]) {
            debug.log('Spielstatus-Anfrage für nicht existierenden Raum:', { roomCode });
            return;
        }
        
        const room = gameManager.rooms[roomCode];
        
        // Identifiziere den Spieler
        const player = room.players.find(p => p.id === socket.id);
        if (!player) {
            debug.log('Spielstatus-Anfrage von unbekanntem Spieler:', { roomCode, socketId: socket.id });
            return;
        }
        
        debug.log('Sende Spielstatus an Spieler:', { 
            roomCode, 
            username: player.username
        });
        
        // Sende den aktuellen Spielstand an den Client
        socket.emit('gameState', {
            gameState: room.gameState,
            currentPlayer: room.players[room.currentTurn].username,
            players: room.players.map(p => ({
                username: p.username,
                color: p.color,
                isHost: p.isHost
            }))
        });
    });
    
    // Spielzug
    socket.on('makeMove', (data) => {
        gameManager.makeMove(data.roomCode, socket, data);
    });
    
    // Spielneustart
    socket.on('restartGame', (data) => {
        gameManager.restartGame(data.roomCode, socket);
    });
    
    // Raum verlassen
    socket.on('leaveRoom', (data) => {
        gameManager.leaveRoom(data.roomCode, socket);
    });
    
    // Spiel mit Bots starten (für Kartendomino)
    socket.on('startGame', (data) => {
        const { roomCode } = data;
        
        if (!gameManager.rooms[roomCode]) {
            debug.log('Spielstart-Anfrage für nicht existierenden Raum:', { roomCode });
            return;
        }
        
        const room = gameManager.rooms[roomCode];
        
        // Prüfen, ob der Spieler der Host ist
        const player = room.players.find(p => p.id === socket.id);
        if (!player || !player.isHost) {
            debug.log('Spielstart-Anfrage von Nicht-Host-Spieler:', { 
                roomCode, 
                username: player ? player.username : 'Unbekannt'
            });
            return;
        }
        
        // Prüfen, ob der Handler eine startGame-Methode hat
        if (room.handler && room.handler.startGame) {
            debug.log('Starte Spiel mit Bots:', { roomCode });
            room.handler.startGame(io, roomCode, room);
        }
    });
    
    // Verbindungsabbruch
    socket.on('disconnect', () => {
        gameManager.handleTemporaryDisconnect(socket);
    });
});

// Server starten
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});