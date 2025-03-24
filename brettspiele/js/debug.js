function debugLog(message, data) {

    console.log(`[DEBUG] ${message}`, data);

    const debugArea = document.getElementById('debug-area');
    if (debugArea) {
        const logEntry = document.createElement('div');
        logEntry.className = 'debug-entry';
        logEntry.innerHTML = `<strong>${message}</strong>: ${JSON.stringify(data)}`;
        debugArea.appendChild(logEntry);

        debugArea.scrollTop = debugArea.scrollHeight;
    }
}

class DebugGameSocketClient extends GameSocketClient {
    constructor() {
        super();
        debugLog('Debug-Socket initialisiert', {});
    }

    connect() {
        debugLog('Socket-Verbindung wird hergestellt', {});
        super.connect();

        if (this.socket) {
            this.socket.onAny((event, ...args) => {
                debugLog(`Socket-Event empfangen: ${event}`, args);
            });

            const originalEmit = this.socket.emit;

            this.socket.emit = function(event, ...args) {
                debugLog(`Socket-Event gesendet: ${event}`, args);
                return originalEmit.apply(this, [event, ...args]);
            };
        }
    }

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

window.GameSocketClient = DebugGameSocketClient;
window.gameSocket = new DebugGameSocketClient();