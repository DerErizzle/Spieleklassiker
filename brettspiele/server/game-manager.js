const debug = require('./debug-utils');

class GameManager {
    constructor() {
        this.rooms = {};
        this.gameRegistry = {};
        this.disconnectTimers = {};
        this.DISCONNECT_TIMEOUT = 3000;
        this.AVAILABLE_COLORS = [
            '#e74c3c', 
            '#3498db', 
            '#2ecc71', 
            '#f1c40f', 
            '#9b59b6', 
            '#e67e22'  
        ];
    }

    registerGame(gameType, gameHandler) {
        this.gameRegistry[gameType] = gameHandler;
        debug.log(`Spieltyp registriert: ${gameType}`, gameHandler);
    }

    generateRoomCode() {
        let code;
        do {
            code = Math.floor(1000 + Math.random() * 9000).toString();
        } while (this.rooms[code]);

        return code;
    }

    createRoom(gameType, socket, data) {
        const roomCode = this.generateRoomCode();
        const { username, userColor } = data;

        debug.log('Raum wird erstellt:', { roomCode, gameType, username, socketId: socket.id });

        if (!this.gameRegistry[gameType]) {
            debug.log(`Spieltyp nicht unterstützt: ${gameType}`);
            socket.emit('error', { message: 'Spieltyp wird nicht unterstützt' });
            return null;
        }

        const gameHandler = this.gameRegistry[gameType];
        const initialGameState = gameHandler.initializeGameState();

        this.rooms[roomCode] = {
            gameType,
            players: [{
                id: socket.id,
                username,
                color: userColor,
                isHost: true,
                connected: true
            }],
            gameState: initialGameState,
            currentTurn: 0,
            handler: gameHandler
        };

        socket.join(roomCode);

        socket.emit('roomCreated', {
            roomCode,
            gameType
        });

        debug.log(`Raum erstellt: ${roomCode} für Spiel ${gameType}`);
        return roomCode;
    }

    joinRoom(roomCode, socket, data) {
        const { username, userColor } = data;

        debug.log('Raumbeitrittsanfrage:', { roomCode, username, socketId: socket.id });

        if (!this.rooms[roomCode]) {
            debug.log('Raum existiert nicht:', { roomCode });
            socket.emit('joinError', 'Der Raum existiert nicht.');
            return false;
        }

        const room = this.rooms[roomCode];

        const existingPlayerIndex = room.players.findIndex(p => p.username === username);
        if (existingPlayerIndex >= 0) {

            debug.log('Spieler bereits im Raum, aktualisiere Socket-ID', { 
                username, 
                oldSocketId: room.players[existingPlayerIndex].id, 
                newSocketId: socket.id 
            });

            room.players[existingPlayerIndex].id = socket.id;
            room.players[existingPlayerIndex].connected = true;

            if (this.disconnectTimers[roomCode] && this.disconnectTimers[roomCode][username]) {
                clearTimeout(this.disconnectTimers[roomCode][username]);
                delete this.disconnectTimers[roomCode][username];

                socket.to(roomCode).emit('playerReconnected', {
                    username: username
                });
            }

            socket.join(roomCode);

            socket.emit('joinSuccess', {
                roomCode,
                gameType: room.gameType
            });

            const io = socket.server;
            io.to(roomCode).emit('playerJoined', {
                player: {
                    username,
                    color: room.players[existingPlayerIndex].color,
                    isHost: room.players[existingPlayerIndex].isHost
                },
                players: room.players.map(p => ({
                    username: p.username,
                    color: p.color,
                    isHost: p.isHost
                }))
            });

            if (room.handler && room.handler.onPlayerReconnected) {
                room.handler.onPlayerReconnected(io, roomCode, room, username);
            }

            return true;
        }

        const maxPlayers = room.handler.getMaxPlayers ? room.handler.getMaxPlayers() : 4;
        if (room.players.length >= maxPlayers) {
            debug.log('Raum ist voll:', { roomCode, playerCount: room.players.length, maxPlayers });
            socket.emit('joinError', 'Der Raum ist voll.');
            return false;
        }

        let assignedColor = userColor;
        const existingColors = room.players.map(p => p.color);

        if (existingColors.includes(userColor)) {

            debug.log('Farbkonflikt erkannt:', { 
                roomCode, 
                username, 
                requestedColor: userColor,
                existingColors 
            });

            for (const color of this.AVAILABLE_COLORS) {
                if (!existingColors.includes(color)) {
                    assignedColor = color;
                    debug.log('Neue Farbe zugewiesen:', { 
                        roomCode, 
                        username, 
                        newColor: assignedColor 
                    });
                    break;
                }
            }

            if (assignedColor === userColor) {
                assignedColor = this.AVAILABLE_COLORS[0];
            }
        }

        room.players.push({
            id: socket.id,
            username,
            color: assignedColor,
            isHost: false,
            connected: true
        });

        socket.join(roomCode);

        debug.log('Spieler tritt Raum bei:', { 
            roomCode, 
            username, 
            playerCount: room.players.length,
            allPlayers: room.players.map(p => p.username)
        });

        socket.emit('joinSuccess', {
            roomCode,
            gameType: room.gameType
        });

        const io = socket.server;
        io.to(roomCode).emit('playerJoined', {
            player: {
                username,
                color: assignedColor,
                isHost: false
            },
            players: room.players.map(p => ({
                username: p.username,
                color: p.color,
                isHost: p.isHost
            }))
        });

        if (room.handler && room.handler.onPlayerJoined) {
            room.handler.onPlayerJoined(io, roomCode, room, username);
        }

        return true;
    }

    makeMove(roomCode, socket, data) {
        if (!this.rooms[roomCode]) {
            debug.log('Zug in nicht-existierendem Raum:', { roomCode, socketId: socket.id });
            return false;
        }

        const room = this.rooms[roomCode];

        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex === -1) {
            debug.log('Spieler nicht im Raum gefunden:', { roomCode, socketId: socket.id });
            return false;
        }

        const player = room.players[playerIndex];

        if (playerIndex !== room.currentTurn) {
            debug.log('Spieler nicht am Zug:', { 
                roomCode, 
                username: player.username, 
                currentTurn: room.currentTurn 
            });
            return false;
        }

        debug.log('Verarbeite Spielzug:', { 
            roomCode, 
            username: player.username, 
            data
        });

        if (room.handler && room.handler.processMove) {
            const io = socket.server;
            return room.handler.processMove(io, roomCode, room, player, data);
        }

        return false;
    }

    restartGame(roomCode, socket) {
        if (!this.rooms[roomCode]) {
            debug.log('Neustart in nicht-existierendem Raum:', { roomCode });
            return false;
        }

        const room = this.rooms[roomCode];

        const player = room.players.find(p => p.id === socket.id);
        if (!player) {
            debug.log('Spieler nicht im Raum gefunden:', { roomCode, socketId: socket.id });
            return false;
        }

        if (!player.isHost) {
            debug.log('Nicht-Host versucht Spiel neu zu starten:', { 
                roomCode, 
                username: player.username 
            });
            return false;
        }

        debug.log('Spiel wird neu gestartet:', { roomCode, username: player.username });

        if (room.handler && room.handler.restartGame) {
            const io = socket.server;
            return room.handler.restartGame(io, roomCode, room);
        }

        return false;
    }

    leaveRoom(roomCode, socket) {
        debug.log('Spieler verlässt Raum (explizit):', { roomCode, socketId: socket.id });
        return this.handlePlayerDisconnect(socket, roomCode, true);
    }

    handleTemporaryDisconnect(socket) {
        debug.log('Benutzer temporär getrennt:', { socketId: socket.id });

        for (const roomCode in this.rooms) {
            const playerIndex = this.rooms[roomCode].players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                const room = this.rooms[roomCode];
                const username = room.players[playerIndex].username;

                room.players[playerIndex].connected = false;

                debug.log('Spieler vorübergehend getrennt:', { 
                    roomCode, 
                    socketId: socket.id,
                    username: username
                });

                if (!this.disconnectTimers[roomCode]) {
                    this.disconnectTimers[roomCode] = {};
                }

                this.disconnectTimers[roomCode][username] = setTimeout(() => {
                    debug.log('Verbindungs-Timeout für Spieler:', { 
                        roomCode, 
                        username 
                    });

                    delete this.disconnectTimers[roomCode][username];

                    this.handlePlayerDisconnect(socket, roomCode, false);
                }, this.DISCONNECT_TIMEOUT);

                socket.to(roomCode).emit('playerDisconnected', {
                    username: username
                });
            }
        }
    }

    handlePlayerDisconnect(socket, roomCode, isExplicit = false) {
        if (!this.rooms[roomCode]) {
            debug.log('Spielerabbruch in nicht-existierendem Raum:', { roomCode });
            return false;
        }

        const room = this.rooms[roomCode];
        const playerIndex = room.players.findIndex(p => p.id === socket.id);

        if (playerIndex !== -1) {
            const player = room.players[playerIndex];

            if (this.disconnectTimers[roomCode] && this.disconnectTimers[roomCode][player.username]) {
                clearTimeout(this.disconnectTimers[roomCode][player.username]);
                delete this.disconnectTimers[roomCode][player.username];
            }

            debug.log('Entferne Spieler aus Raum:', { 
                roomCode, 
                username: player.username, 
                remainingPlayers: room.players.length - 1,
                isExplicit
            });

            room.players.splice(playerIndex, 1);

            if (isExplicit && socket.connected) {
                socket.leave(roomCode);
            }

            if (room.players.length === 0) {
                debug.log('Letzter Spieler hat Raum verlassen, lösche Raum:', { roomCode });
                delete this.rooms[roomCode];

                if (this.disconnectTimers[roomCode]) {
                    delete this.disconnectTimers[roomCode];
                }

                return true;
            }

            if (player.isHost && room.players.length > 0) {
                debug.log('Host verlässt Raum, bestimme neuen Host:', { 
                    roomCode, 
                    newHost: room.players[0].username 
                });
                room.players[0].isHost = true;
            }

            if (room.currentTurn >= room.players.length) {
                room.currentTurn = 0;
            }

            if (room.handler && room.handler.onPlayerLeft) {
                const io = socket.server;
                room.handler.onPlayerLeft(io, roomCode, room, player.username);
            } else {

                const io = socket.server;
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

            return true;
        }

        return false;
    }
}

module.exports = new GameManager();