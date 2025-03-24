const debug = require('../debug-utils');

/**
 * Spiellogik-Handler für "Vier Gewinnt"
 */
const ConnectFourHandler = {
    /**
     * Gibt die maximale Spielerzahl zurück
     */
    getMaxPlayers() {
        return 2;
    },
    
    /**
     * Initialisiert den Spielzustand
     */
    initializeGameState() {
        return {
            board: Array(6).fill().map(() => Array(7).fill(null)),
            moves: 0
        };
    },
    
    /**
     * Wählt zufällig einen Startspieler
     */
    getRandomStartingPlayer() {
        return Math.floor(Math.random() * 2);
    },
    
    /**
     * Wird aufgerufen, wenn ein Spieler einem Raum beitritt
     */
    onPlayerJoined(io, roomCode, room, username) {
        // Bei "Vier Gewinnt" startet das Spiel, wenn 2 Spieler im Raum sind
        if (room.players.length === 2) {
            debug.log('Spiel startet (2 Spieler im Raum):', { roomCode });
            room.currentTurn = this.getRandomStartingPlayer();
            io.to(roomCode).emit('moveUpdate', {
                column: null,
                row: null,
                player: null,
                nextPlayer: room.players[room.currentTurn].username,
                gameState: room.gameState
            });
        }
    },
    
    /**
     * Wird aufgerufen, wenn ein Spieler wiederverbunden ist
     */
    onPlayerReconnected(io, roomCode, room, username) {
        // Sende aktuellen Spielstand bei Wiederverbindung
        const socket = Array.from(io.sockets.sockets.values())
            .find(s => s.rooms.has(roomCode) && 
                  room.players.some(p => p.id === s.id && p.username === username));
                  
        if (socket) {
            debug.log('Sende aktuellen Spielstand an wiederverbundenen Spieler:', { 
                roomCode, 
                username
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
        }
    },
    
    /**
     * Verarbeitet einen Spielzug
     */
    processMove(io, roomCode, room, player, data) {
        const { column } = data;
        
        const result = this.makeVierGewinntMove(room.gameState, column, {
            username: player.username,
            color: player.color
        });
        
        if (result.valid) {
            // Zug ist gültig
            room.gameState = result.newState;
            
            // Nächster Spieler ist dran
            room.currentTurn = (room.currentTurn + 1) % room.players.length;
            
            debug.log('Gültiger Zug ausgeführt:', {
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
                debug.log('Spiel ist vorbei:', {
                    roomCode,
                    winner: result.winner ? player.username : null
                });
                
                io.to(roomCode).emit('gameOver', {
                    winner: result.winner ? player.username : null,
                    winningCells: result.winningCells || []
                });
            }
            
            return true;
        } else {
            debug.log('Ungültiger Zug:', {
                roomCode,
                username: player.username,
                column
            });
            return false;
        }
    },
    
    /**
     * Startet das Spiel neu
     */
    restartGame(io, roomCode, room) {
        // Spielstatus zurücksetzen
        room.gameState = this.initializeGameState();
        room.currentTurn = this.getRandomStartingPlayer();
        
        // Alle Spieler über den Neustart informieren
        io.to(roomCode).emit('gameRestarted', {
            gameState: room.gameState,
            currentPlayer: room.players[room.currentTurn].username
        });
        
        return true;
    },
    
    /**
     * Führt einen Spielzug bei Vier Gewinnt aus
     */
    makeVierGewinntMove(gameState, column, player) {
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
                const winCheck = this.checkWin(newState.board, row, column);
                
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
    },
    
    /**
     * Überprüft, ob ein Sieg vorliegt
     */
    checkWin(board, lastRow, lastCol) {
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
};

module.exports = ConnectFourHandler;