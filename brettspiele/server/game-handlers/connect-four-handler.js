const debug = require('../debug-utils');

const ConnectFourHandler = {

    getMaxPlayers() {
        return 2;
    },

    initializeGameState() {
        return {
            board: Array(6).fill().map(() => Array(7).fill(null)),
            moves: 0
        };
    },

    getRandomStartingPlayer() {
        return Math.floor(Math.random() * 2);
    },

    onPlayerJoined(io, roomCode, room, username) {

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

    onPlayerReconnected(io, roomCode, room, username) {

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

    processMove(io, roomCode, room, player, data) {
        const { column } = data;

        const result = this.makeVierGewinntMove(room.gameState, column, {
            username: player.username,
            color: player.color
        });

        if (result.valid) {

            room.gameState = result.newState;

            room.currentTurn = (room.currentTurn + 1) % room.players.length;

            debug.log('Gültiger Zug ausgeführt:', {
                roomCode,
                username: player.username,
                column,
                row: result.row,
                nextPlayerIndex: room.currentTurn
            });

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

    restartGame(io, roomCode, room) {

        room.gameState = this.initializeGameState();
        room.currentTurn = this.getRandomStartingPlayer();

        io.to(roomCode).emit('gameRestarted', {
            gameState: room.gameState,
            currentPlayer: room.players[room.currentTurn].username
        });

        return true;
    },

    makeVierGewinntMove(gameState, column, player) {
        const board = gameState.board;

        if (column < 0 || column >= 7) {
            return { valid: false };
        }

        for (let row = 5; row >= 0; row--) {
            if (board[row][column] === null) {

                const newState = {
                    board: board.map(r => [...r]),
                    moves: gameState.moves + 1
                };
                newState.board[row][column] = {
                    username: player.username,
                    color: player.color
                };

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

        return { valid: false };
    },

    checkWin(board, lastRow, lastCol) {
        const directions = [
            [0, 1],  
            [1, 0],  
            [1, 1],  
            [1, -1]  
        ];

        const currentPlayer = board[lastRow][lastCol];

        for (const [dx, dy] of directions) {
            const cells = [[lastRow, lastCol]];

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

            if (count >= 4) {
                return { win: true, cells };
            }
        }

        return { win: false, cells: [] };
    }
};

module.exports = ConnectFourHandler;