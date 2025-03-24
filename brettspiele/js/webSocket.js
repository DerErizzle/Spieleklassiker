/**
 * WebSocket-Client für Erizzle Games
 */

class GameSocketClient {
    constructor() {
        this.socket = null;
        this.callbacks = {
            connect: [],
            disconnect: [],
            playerJoined: [],
            playerLeft: [],
            moveUpdate: [],
            gameOver: [],
            gameRestarted: [],
            roomCreated: [],
            joinSuccess: [],
            joinError: [],
            playerDisconnected: [],
            playerReconnected: [],
            gameState: [],
            hoverUpdate: [],
            error: []
        };
        
        // Verbindung automatisch herstellen
        this.connect();
    }
    
    // Verbindung herstellen
    connect() {
        if (this.socket) return;
        
        console.log("Socket.io-Verbindung wird hergestellt...");
        
        this.socket = io({
            transports: ['polling'],
            path: '/socket.io',
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 5
        });
        
        // Standard-Ereignisbehandlung
        this.socket.on('connect', () => {
            console.log('Verbunden mit dem Server');
            this._triggerCallback('connect');
        });
        
        this.socket.on('connect_error', (error) => {
            console.error('Verbindungsfehler:', error);
            this._triggerCallback('error', { message: 'Verbindungsfehler', error });
        });
        
        this.socket.on('disconnect', (reason) => {
            console.log('Verbindung zum Server getrennt:', reason);
            this._triggerCallback('disconnect', { reason });
        });
        
        this.socket.on('playerJoined', (data) => {
            console.log('Spieler beigetreten:', data);
            this._triggerCallback('playerJoined', data);
        });
        
        this.socket.on('playerLeft', (data) => {
            console.log('Spieler hat verlassen:', data);
            this._triggerCallback('playerLeft', data);
        });
        
        this.socket.on('moveUpdate', (data) => {
            console.log('Spielzug-Update:', data);
            this._triggerCallback('moveUpdate', data);
        });
        
        this.socket.on('gameOver', (data) => {
            console.log('Spiel beendet:', data);
            this._triggerCallback('gameOver', data);
        });
        
        this.socket.on('gameRestarted', (data) => {
            console.log('Spiel neugestartet:', data);
            this._triggerCallback('gameRestarted', data);
        });
        
        this.socket.on('roomCreated', (data) => {
            console.log('Raum erstellt:', data);
            this._triggerCallback('roomCreated', data);
        });
        
        this.socket.on('joinSuccess', (data) => {
            console.log('Raumbeitritt erfolgreich:', data);
            this._triggerCallback('joinSuccess', data);
        });
        
        this.socket.on('joinError', (data) => {
            console.error('Raumbeitritt fehlgeschlagen:', data);
            this._triggerCallback('joinError', data);
        });
        
        this.socket.on('playerDisconnected', (data) => {
            console.log('Spieler hat Verbindung verloren:', data);
            this._triggerCallback('playerDisconnected', data);
        });

        this.socket.on('playerReconnected', (data) => {
            console.log('Spieler ist wieder verbunden:', data);
            this._triggerCallback('playerReconnected', data);
        });

        this.socket.on('gameState', (data) => {
            console.log('Aktueller Spielstand empfangen:', data);
            this._triggerCallback('gameState', data);
        });
        
        this.socket.on('hoverUpdate', (data) => {
            // Hier kein console.log für bessere Performance
            this._triggerCallback('hoverUpdate', data);
        });
        
        this.socket.on('error', (data) => {
            console.error('Fehler vom Server:', data);
            this._triggerCallback('error', data);
        });
    }
    
    // Prüfen, ob Socket verbunden ist
    isConnected() {
        return this.socket && this.socket.connected;
    }
    
    // Ereignisbehandlung registrieren
    on(event, callback) {
        if (this.callbacks[event]) {
            this.callbacks[event].push(callback);
        }
        return this;
    }
    
    // Ereignisbehandlung auslösen
    _triggerCallback(event, data) {
        if (this.callbacks[event]) {
            this.callbacks[event].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Fehler beim Ausführen des Event-Handlers für ${event}:`, error);
                }
            });
        }
    }
    
    // Raum erstellen
    createRoom(gameType, username, userColor) {
        if (!this.isConnected()) {
            console.error("Kann keinen Raum erstellen: Keine Verbindung zum Server");
            return;
        }
        
        console.log('Erstelle Raum:', { gameType, username, userColor });
        
        this.socket.emit('createRoom', {
            gameType,
            username,
            userColor
        });
    }
    
    // Raum beitreten
    joinRoom(roomCode, username, userColor) {
        if (!this.isConnected()) {
            console.error("Kann keinem Raum beitreten: Keine Verbindung zum Server");
            return;
        }
        
        console.log('Trete Raum bei:', { roomCode, username, userColor });
        
        this.socket.emit('joinRoom', {
            roomCode,
            username,
            userColor
        });
    }
    
    // Spielzug ausführen
    makeMove(roomCode, column) {
        if (!this.isConnected()) {
            console.error("Kann keinen Zug ausführen: Keine Verbindung zum Server");
            return;
        }
        
        this.socket.emit('makeMove', {
            roomCode,
            column
        });
    }
    
    // Spiel neu starten
    restartGame(roomCode) {
        if (!this.isConnected()) {
            console.error("Kann Spiel nicht neu starten: Keine Verbindung zum Server");
            return;
        }
        
        this.socket.emit('restartGame', {
            roomCode
        });
    }
    
    // Raum verlassen
    leaveRoom(roomCode) {
        if (!this.isConnected()) {
            console.error("Kann Raum nicht verlassen: Keine Verbindung zum Server");
            return;
        }
        
        this.socket.emit('leaveRoom', {
            roomCode
        });
    }
    
    // Aktuellen Spielstand anfordern
    requestGameState(roomCode) {
        if (!this.isConnected()) {
            console.error("Kann Spielstand nicht anfordern: Keine Verbindung zum Server");
            return;
        }
        
        this.socket.emit('requestGameState', {
            roomCode
        });
    }
}

// Eine globale Instanz erstellen, um überall im Code verwenden zu können
const gameSocket = new GameSocketClient();