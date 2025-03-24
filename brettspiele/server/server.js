const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const gameManager = require('./game-manager');
const debug = require('./debug-utils');

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

gameManager.registerGame('vier-gewinnt', connectFourHandler);
gameManager.registerGame('kartendomino', sevensHandler);

app.use(express.static(path.join(__dirname, '..')));

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

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'login.html'));
});

app.get('/spiele/:spieltyp', (req, res) => {
    const spieltyp = req.params.spieltyp;

    const spielPfad = path.join(__dirname, '..', 'spiele', spieltyp, 'index.html');

    fs.access(spielPfad, fs.constants.F_OK, (err) => {
        if (err) {

            res.status(404).send('Spiel nicht gefunden');
        } else {

            res.sendFile(spielPfad);
        }
    });
});

app.get('/debug', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'debug.html'));
});

if (debug.DEBUG) {

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

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

io.on('connection', (socket) => {
    debug.log('Neuer Benutzer verbunden:', { socketId: socket.id });

    socket.on('hoverUpdate', (data) => {
        const { roomCode, column, username, userColor } = data;

        if (!gameManager.rooms[roomCode]) {
            return;
        }

        socket.to(roomCode).emit('hoverUpdate', {
            column,
            username,
            userColor
        });

        if (debug.DEBUG) {
            debug.log('Hover-Update gesendet:', { roomCode, username, column });
        }
    });

    socket.on('createRoom', (data) => {
        gameManager.createRoom(data.gameType, socket, data);
    });

    socket.on('joinRoom', (data) => {
        gameManager.joinRoom(data.roomCode, socket, data);
    });

    socket.on('requestGameState', (data) => {
        const { roomCode } = data;

        if (!gameManager.rooms[roomCode]) {
            debug.log('Spielstatus-Anfrage für nicht existierenden Raum:', { roomCode });
            return;
        }

        const room = gameManager.rooms[roomCode];

        const player = room.players.find(p => p.id === socket.id);
        if (!player) {
            debug.log('Spielstatus-Anfrage von unbekanntem Spieler:', { roomCode, socketId: socket.id });
            return;
        }

        debug.log('Sende Spielstatus an Spieler:', { 
            roomCode, 
            username: player.username
        });

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

    socket.on('makeMove', (data) => {
        gameManager.makeMove(data.roomCode, socket, data);
    });

    socket.on('restartGame', (data) => {
        gameManager.restartGame(data.roomCode, socket);
    });

    socket.on('leaveRoom', (data) => {
        gameManager.leaveRoom(data.roomCode, socket);
    });

    socket.on('startGame', (data) => {
        const { roomCode } = data;

        if (!gameManager.rooms[roomCode]) {
            debug.log('Spielstart-Anfrage für nicht existierenden Raum:', { roomCode });
            return;
        }

        const room = gameManager.rooms[roomCode];

        const player = room.players.find(p => p.id === socket.id);
        if (!player || !player.isHost) {
            debug.log('Spielstart-Anfrage von Nicht-Host-Spieler:', { 
                roomCode, 
                username: player ? player.username : 'Unbekannt'
            });
            return;
        }

        if (room.handler && room.handler.startGame) {
            debug.log('Starte Spiel mit Bots:', { roomCode });
            room.handler.startGame(io, roomCode, room);
        }
    });

    socket.on('disconnect', () => {
        gameManager.handleTemporaryDisconnect(socket);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});