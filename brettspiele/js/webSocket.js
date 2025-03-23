/**
 * WebSocket-Client für Geile Games
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
            gameRestarted: []
        };
    }
    
    // Verbindung herstellen
    connect() {
        if (this.socket) return;
        
        this.socket = io({
            transports: ['polling'],
            path: '/socket.io'
        });
        
        // Standard-Ereignisbehandlung
        this.socket.on('connect', () => {
            console.log('Verbunden mit dem Server');
            this._triggerCallback('connect');
        });
        
        this.socket.on('disconnect', () => {
            console.log('Verbindung zum Server getrennt');
            this._triggerCallback('disconnect');
        });
        
        this.socket.on('playerJoined', (data) => {
            this._triggerCallback('playerJoined', data);
        });
        
        this.socket.on('playerLeft', (data) => {
            this._triggerCallback('playerLeft', data);
        });
        
        this.socket.on('moveUpdate', (data) => {
            this._triggerCallback('moveUpdate', data);
        });
        
        this.socket.on('gameOver', (data) => {
            this._triggerCallback('gameOver', data);
        });
        
        this.socket.on('gameRestarted', (data) => {
            this._triggerCallback('gameRestarted', data);
        });
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
            this.callbacks[event].forEach(callback => callback(data));
        }
    }
    
    // Raum erstellen
    createRoom(gameType, username, userColor) {
        if (!this.socket) return;
        
        this.socket.emit('createRoom', {
            gameType,
            username,
            userColor
        });
    }
    
    // Raum beitreten
    joinRoom(roomCode, username, userColor) {
        if (!this.socket) return;
        
        this.socket.emit('joinRoom', {
            roomCode,
            username,
            userColor
        });
    }
    
    // Spielzug ausführen
    makeMove(roomCode, column) {
        if (!this.socket) return;
        
        this.socket.emit('makeMove', {
            roomCode,
            column
        });
    }
    
    // Spiel neu starten
    restartGame(roomCode) {
        if (!this.socket) return;
        
        this.socket.emit('restartGame', {
            roomCode
        });
    }
    
    // Raum verlassen
    leaveRoom(roomCode) {
        if (!this.socket) return;
        
        this.socket.emit('leaveRoom', {
            roomCode
        });
    }
}

// Eine globale Instanz erstellen, um überall im Code verwenden zu können
const gameSocket = new GameSocketClient();