// Diese Datei als brettspiele/js/debug.js speichern

// Debug-Funktion, die sowohl auf der Konsole ausgibt als auch in einem Debug-Bereich auf der Seite
function debugLog(message, data) {
    // In Konsole ausgeben
    console.log(`[DEBUG] ${message}`, data);
    
    // In Debug-Bereich auf der Seite ausgeben, falls vorhanden
    const debugArea = document.getElementById('debug-area');
    if (debugArea) {
        const logEntry = document.createElement('div');
        logEntry.className = 'debug-entry';
        logEntry.innerHTML = `<strong>${message}</strong>: ${JSON.stringify(data)}`;
        debugArea.appendChild(logEntry);
        
        // Nach unten scrollen
        debugArea.scrollTop = debugArea.scrollHeight;
    }
}

// Socket.io-Debug-Wrapper erstellen
class DebugGameSocketClient extends GameSocketClient {
    constructor() {
        super();
        debugLog('Debug-Socket initialisiert', {});
    }
    
    connect() {
        debugLog('Socket-Verbindung wird hergestellt', {});
        super.connect();
        
        // Debug-Listener für alle Socket-Events
        if (this.socket) {
            this.socket.onAny((event, ...args) => {
                debugLog(`Socket-Event empfangen: ${event}`, args);
            });
            
            // Original-Methoden sichern
            const originalEmit = this.socket.emit;
            
            // Debug-Wrapper für emit
            this.socket.emit = function(event, ...args) {
                debugLog(`Socket-Event gesendet: ${event}`, args);
                return originalEmit.apply(this, [event, ...args]);
            };
        }
    }
    
    // Debug-Wrapper für alle Methoden
    createRoom(gameType, username, userColor) {
        debugLog('createRoom aufgerufen', { gameType, username, userColor });
        super.createRoom(gameType, username, userColor);
    }
    
    joinRoom(roomCode, username, userColor) {
        debugLog('joinRoom aufgerufen', { roomCode, username, userColor });
        super.joinRoom(roomCode, username, userColor);
    }
    
    makeMove(roomCode, column) {
        debugLog('makeMove aufgerufen', { roomCode, column });
        super.makeMove(roomCode, column);
    }
    
    restartGame(roomCode) {
        debugLog('restartGame aufgerufen', { roomCode });
        super.restartGame(roomCode);
    }
    
    leaveRoom(roomCode) {
        debugLog('leaveRoom aufgerufen', { roomCode });
        super.leaveRoom(roomCode);
    }
    
    on(event, callback) {
        debugLog(`Event-Handler registriert: ${event}`, {});
        return super.on(event, callback);
    }
}

// Original-Socket überschreiben
window.GameSocketClient = DebugGameSocketClient;
window.gameSocket = new DebugGameSocketClient();