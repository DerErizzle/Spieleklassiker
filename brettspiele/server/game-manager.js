const debug = require('./debug-utils');

/**
 * Game Manager für Brettspiele
 * Verwaltet Räume und Spielerverbindungen und dient als zentrales Framework für alle Spiele
 */
class GameManager {
    constructor() {
        this.rooms = {};
        this.gameRegistry = {};
        this.disconnectTimers = {};
        this.DISCONNECT_TIMEOUT = 3000;
        this.AVAILABLE_COLORS = [
            '#e74c3c', // rot
            '#3498db', // blau
            '#2ecc71', // grün
            '#f1c40f', // gelb
            '#9b59b6', // lila
            '#e67e22'  // orange
        ];
    }

    /**
     * Registriert einen Spieltyp im Game Manager
     * @param {string} gameType - Typ des Spiels (z.B. 'vier-gewinnt')
     * @param {object} gameHandler - Objekt mit Spiellogik-Methoden
     */
    registerGame(gameType, gameHandler) {
        this.gameRegistry[gameType] = gameHandler;
        debug.log(`Spieltyp registriert: ${gameType}`, gameHandler);
    }

    /**
     * Generiert einen eindeutigen Raumcode
     * @returns {string} - Eindeutiger vierstelliger Raumcode
     */
    generateRoomCode() {
        let code;
        do {
            code = Math.floor(1000 + Math.random() * 9000).toString();
        } while (this.rooms[code]);
        
        return code;
    }

    /**
     * Erstellt einen neuen Spielraum
     * @param {string} gameType - Typ des Spiels (z.B. 'vier-gewinnt')
     * @param {object} socket - Socket.io-Socket des erstellenden Spielers
     * @param {object} data - Spielerdaten {username, userColor}
     * @returns {string|null} - Raumcode oder null bei Fehler
     */
    createRoom(gameType, socket, data) {
        const roomCode = this.generateRoomCode();
        const { username, userColor } = data;
        
        debug.log('Raum wird erstellt:', { roomCode, gameType, username, socketId: socket.id });
        
        // Prüfen, ob der Spieltyp registriert ist
        if (!this.gameRegistry[gameType]) {
            debug.log(`Spieltyp nicht unterstützt: ${gameType}`);
            socket.emit('error', { message: 'Spieltyp wird nicht unterstützt' });
            return null;
        }
        
        // Initialisieren des Spielzustands über den registrierten Handler
        const gameHandler = this.gameRegistry[gameType];
        const initialGameState = gameHandler.initializeGameState();
        
        // Raum erstellen
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
        
        // Socket tritt dem Raum bei
        socket.join(roomCode);
        
        // Bestätigung an den Client senden
        socket.emit('roomCreated', {
            roomCode,
            gameType
        });
        
        debug.log(`Raum erstellt: ${roomCode} für Spiel ${gameType}`);
        return roomCode;
    }
    
    /**
     * Lässt einen Spieler einem Raum beitreten
     * @param {string} roomCode - Code des Raums
     * @param {object} socket - Socket.io-Socket des beitretenden Spielers
     * @param {object} data - Spielerdaten {username, userColor}
     * @returns {boolean} - Erfolg des Beitritts
     */
    joinRoom(roomCode, socket, data) {
        const { username, userColor } = data;
        
        debug.log('Raumbeitrittsanfrage:', { roomCode, username, socketId: socket.id });
        
        // Überprüfen, ob der Raum existiert
        if (!this.rooms[roomCode]) {
            debug.log('Raum existiert nicht:', { roomCode });
            socket.emit('joinError', 'Der Raum existiert nicht.');
            return false;
        }
        
        const room = this.rooms[roomCode];
        
        // Überprüfen, ob der Spieler bereits im Raum ist (Wiederverbindung)
        const existingPlayerIndex = room.players.findIndex(p => p.username === username);
        if (existingPlayerIndex >= 0) {
            // Spieler ist bereits im Raum - Socket-ID aktualisieren und Verbindungsstatus aktualisieren
            debug.log('Spieler bereits im Raum, aktualisiere Socket-ID', { 
                username, 
                oldSocketId: room.players[existingPlayerIndex].id, 
                newSocketId: socket.id 
            });
            
            room.players[existingPlayerIndex].id = socket.id;
            room.players[existingPlayerIndex].connected = true;
            
            // Falls es einen Verbindungsverlust-Timer für diesen Spieler gibt, diesen löschen
            if (this.disconnectTimers[roomCode] && this.disconnectTimers[roomCode][username]) {
                clearTimeout(this.disconnectTimers[roomCode][username]);
                delete this.disconnectTimers[roomCode][username];
                
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
                gameType: room.gameType
            });
            
            // Spielerliste an alle Spieler im Raum senden
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
            
            // Spielspezifische Logik für Wiederverbindung an den Handler delegieren
            if (room.handler && room.handler.onPlayerReconnected) {
                room.handler.onPlayerReconnected(io, roomCode, room, username);
            }
            
            return true;
        }
        
        // Maximale Spielerzahl über den Handler prüfen
        const maxPlayers = room.handler.getMaxPlayers ? room.handler.getMaxPlayers() : 4;
        if (room.players.length >= maxPlayers) {
            debug.log('Raum ist voll:', { roomCode, playerCount: room.players.length, maxPlayers });
            socket.emit('joinError', 'Der Raum ist voll.');
            return false;
        }
        
        // Überprüfe auf Farbkonflikte und weise gegebenenfalls eine andere Farbe zu
        let assignedColor = userColor;
        const existingColors = room.players.map(p => p.color);
        
        if (existingColors.includes(userColor)) {
            // Farbkonflikt entdeckt, wähle eine andere Farbe
            debug.log('Farbkonflikt erkannt:', { 
                roomCode, 
                username, 
                requestedColor: userColor,
                existingColors 
            });
            
            // Finde eine Farbe, die noch nicht in Verwendung ist
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
            
            // Falls alle Farben verwendet werden, nimm die erste
            if (assignedColor === userColor) {
                assignedColor = this.AVAILABLE_COLORS[0];
            }
        }
        
        // Spieler zum Raum hinzufügen
        room.players.push({
            id: socket.id,
            username,
            color: assignedColor,
            isHost: false,
            connected: true
        });
        
        // Socket tritt dem Raum bei
        socket.join(roomCode);
        
        debug.log('Spieler tritt Raum bei:', { 
            roomCode, 
            username, 
            playerCount: room.players.length,
            allPlayers: room.players.map(p => p.username)
        });
        
        // Bestätigung an den Client senden
        socket.emit('joinSuccess', {
            roomCode,
            gameType: room.gameType
        });
        
        // Alle Spieler im Raum über den neuen Spieler informieren
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

        // Spielspezifische Logik für neuen Spieler an den Handler delegieren
        if (room.handler && room.handler.onPlayerJoined) {
            room.handler.onPlayerJoined(io, roomCode, room, username);
        }
        
        return true;
    }
    
    /**
     * Verarbeitet einen Spielzug
     * @param {string} roomCode - Raumcode
     * @param {object} socket - Socket des Spielers
     * @param {object} data - Zugdaten (spielspezifisch)
     * @returns {boolean} - Erfolg des Zugs
     */
    makeMove(roomCode, socket, data) {
        if (!this.rooms[roomCode]) {
            debug.log('Zug in nicht-existierendem Raum:', { roomCode, socketId: socket.id });
            return false;
        }
        
        const room = this.rooms[roomCode];
        
        // Spieler identifizieren
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex === -1) {
            debug.log('Spieler nicht im Raum gefunden:', { roomCode, socketId: socket.id });
            return false;
        }
        
        const player = room.players[playerIndex];
        
        // Überprüfen, ob der Spieler am Zug ist
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
        
        // Spielzug an den spielspezifischen Handler delegieren
        if (room.handler && room.handler.processMove) {
            const io = socket.server;
            return room.handler.processMove(io, roomCode, room, player, data);
        }
        
        return false;
    }
    
    /**
     * Startet ein Spiel neu
     * @param {string} roomCode - Raumcode
     * @param {object} socket - Socket des anfragenden Spielers
     * @returns {boolean} - Erfolg des Neustarts
     */
    restartGame(roomCode, socket) {
        if (!this.rooms[roomCode]) {
            debug.log('Neustart in nicht-existierendem Raum:', { roomCode });
            return false;
        }
        
        const room = this.rooms[roomCode];
        
        // Spieler identifizieren
        const player = room.players.find(p => p.id === socket.id);
        if (!player) {
            debug.log('Spieler nicht im Raum gefunden:', { roomCode, socketId: socket.id });
            return false;
        }
        
        // Nur der Host kann das Spiel neu starten
        if (!player.isHost) {
            debug.log('Nicht-Host versucht Spiel neu zu starten:', { 
                roomCode, 
                username: player.username 
            });
            return false;
        }
        
        debug.log('Spiel wird neu gestartet:', { roomCode, username: player.username });
        
        // Spielspezifischen Handler für Neustart aufrufen
        if (room.handler && room.handler.restartGame) {
            const io = socket.server;
            return room.handler.restartGame(io, roomCode, room);
        }
        
        return false;
    }
    
    /**
     * Lässt einen Spieler einen Raum verlassen
     * @param {string} roomCode - Raumcode
     * @param {object} socket - Socket des verlassenden Spielers
     * @returns {boolean} - Erfolg des Verlassens
     */
    leaveRoom(roomCode, socket) {
        debug.log('Spieler verlässt Raum (explizit):', { roomCode, socketId: socket.id });
        return this.handlePlayerDisconnect(socket, roomCode, true);
    }
    
    /**
     * Verarbeitet eine temporäre Verbindungsunterbrechung
     * @param {object} socket - Socket des getrennten Spielers
     */
    handleTemporaryDisconnect(socket) {
        debug.log('Benutzer temporär getrennt:', { socketId: socket.id });
        
        // Alle Räume finden, in denen dieser Spieler ist
        for (const roomCode in this.rooms) {
            const playerIndex = this.rooms[roomCode].players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                const room = this.rooms[roomCode];
                const username = room.players[playerIndex].username;
                
                // Spieler als getrennt markieren
                room.players[playerIndex].connected = false;
                
                debug.log('Spieler vorübergehend getrennt:', { 
                    roomCode, 
                    socketId: socket.id,
                    username: username
                });
                
                // Initialisiere das Timer-Objekt für diesen Raum, falls es noch nicht existiert
                if (!this.disconnectTimers[roomCode]) {
                    this.disconnectTimers[roomCode] = {};
                }
                
                // Starte einen Timer für diesen Spieler
                this.disconnectTimers[roomCode][username] = setTimeout(() => {
                    debug.log('Verbindungs-Timeout für Spieler:', { 
                        roomCode, 
                        username 
                    });
                    
                    // Entferne den Timer
                    delete this.disconnectTimers[roomCode][username];
                    
                    // Behandle den tatsächlichen Disconnect
                    this.handlePlayerDisconnect(socket, roomCode, false);
                }, this.DISCONNECT_TIMEOUT);
                
                // Informiere andere Spieler über den vorübergehenden Verbindungsverlust
                socket.to(roomCode).emit('playerDisconnected', {
                    username: username
                });
            }
        }
    }
    
    /**
     * Handhabt die Trennung eines Spielers (temporär oder dauerhaft)
     * @param {object} socket - Socket des getrennten Spielers
     * @param {string} roomCode - Raumcode
     * @param {boolean} isExplicit - Ob die Trennung explizit war (durch leaveRoom)
     * @returns {boolean} - Erfolg der Bearbeitung
     */
    handlePlayerDisconnect(socket, roomCode, isExplicit = false) {
        if (!this.rooms[roomCode]) {
            debug.log('Spielerabbruch in nicht-existierendem Raum:', { roomCode });
            return false;
        }
        
        const room = this.rooms[roomCode];
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        
        if (playerIndex !== -1) {
            const player = room.players[playerIndex];
            
            // Bereinige Timer, falls vorhanden
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
            
            // Spieler aus dem Raum entfernen
            room.players.splice(playerIndex, 1);
            
            // Socket verlässt den Raum, wenn die Trennung explizit war
            if (isExplicit && socket.connected) {
                socket.leave(roomCode);
            }
            
            // Wenn keine Spieler mehr im Raum sind, Raum löschen
            if (room.players.length === 0) {
                debug.log('Letzter Spieler hat Raum verlassen, lösche Raum:', { roomCode });
                delete this.rooms[roomCode];
                
                // Timer für diesen Raum bereinigen
                if (this.disconnectTimers[roomCode]) {
                    delete this.disconnectTimers[roomCode];
                }
                
                return true;
            }
            
            // Wenn der Host den Raum verlässt, neuen Host bestimmen
            if (player.isHost && room.players.length > 0) {
                debug.log('Host verlässt Raum, bestimme neuen Host:', { 
                    roomCode, 
                    newHost: room.players[0].username 
                });
                room.players[0].isHost = true;
            }
            
            // Wenn der aktuelle Spieler den Raum verlässt, zum nächsten wechseln
            if (room.currentTurn >= room.players.length) {
                room.currentTurn = 0;
            }
            
            // Spielspezifische Behandlung des Spieleraustritts
            if (room.handler && room.handler.onPlayerLeft) {
                const io = socket.server;
                room.handler.onPlayerLeft(io, roomCode, room, player.username);
            } else {
                // Standard-Verhalten: Alle verbleibenden Spieler informieren
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