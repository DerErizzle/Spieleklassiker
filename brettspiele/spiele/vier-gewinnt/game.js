/**
 * Vier Gewinnt - Spiellogik
 */

document.addEventListener('DOMContentLoaded', function() {
    // Überprüfen, ob der Benutzer eingeloggt ist
    if (!isUserLoggedIn()) {
        window.location.href = '../../login.html';
        return;
    }
    
    // Benutzerdaten abrufen
    const username = getCookie('username');
    const userColor = getCookie('userColor');
    
    // Raumcode abrufen
    const roomCode = sessionStorage.getItem('currentRoom');
    if (!roomCode) {
        window.location.href = '../../index.html';
        return;
    }
    
    // DOM-Elemente abrufen
    const boardEl = document.getElementById('game-board');
    const playerListEl = document.getElementById('player-list');
    const gameStatusEl = document.getElementById('game-status');
    const roomCodeEl = document.getElementById('room-code-display');
    const usernameDisplayEl = document.getElementById('username-display');
    const userColorDisplayEl = document.getElementById('user-color-display');
    const backButton = document.getElementById('back-button');
    const restartButton = document.getElementById('restart-button');
    const gameControls = document.getElementById('game-controls');
    
    // Benutzerdaten anzeigen
    usernameDisplayEl.textContent = username;
    userColorDisplayEl.style.backgroundColor = userColor;
    roomCodeEl.textContent = roomCode;
    
    // Spielvariablen
    let players = [];
    let currentPlayerUsername = '';
    let gameActive = false;
    let isHost = false;
    let gameBoard = [];
    let hoverPiece = null;
    
    // Spielbrett initialisieren
    function initializeBoard() {
        boardEl.innerHTML = '';
        
        // 7 Spalten erstellen
        for (let col = 0; col < 7; col++) {
            const columnDiv = document.createElement('div');
            columnDiv.className = 'board-column';
            columnDiv.dataset.column = col;
            
            // 6 Zellen pro Spalte erstellen
            for (let row = 0; row < 6; row++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = row;
                cell.dataset.column = col;
                columnDiv.appendChild(cell);
            }
            
            // Event-Listener für Spalte
            columnDiv.addEventListener('click', () => {
                if (gameActive && currentPlayerUsername === username) {
                    makeMoveInColumn(col);
                }
            });
            
            // Hover-Effekt
            columnDiv.addEventListener('mouseover', () => {
                if (gameActive && currentPlayerUsername === username) {
                    showHoverPiece(col);
                }
            });
            
            columnDiv.addEventListener('mouseout', () => {
                hideHoverPiece();
            });
            
            boardEl.appendChild(columnDiv);
        }
        
        // Hover-Stück erstellen
        hoverPiece = document.createElement('div');
        hoverPiece.className = 'column-hover';
        hoverPiece.style.display = 'none';
        hoverPiece.style.backgroundColor = userColor;
        boardEl.appendChild(hoverPiece);
    }
    
    // Hover-Stück anzeigen
    function showHoverPiece(column) {
        if (!hoverPiece || !gameActive) return;
        
        const columnEl = boardEl.querySelector(`.board-column[data-column="${column}"]`);
        if (columnEl) {
            const columnRect = columnEl.getBoundingClientRect();
            const boardRect = boardEl.getBoundingClientRect();
            
            hoverPiece.style.display = 'block';
            hoverPiece.style.left = (columnRect.left - boardRect.left + 7) + 'px';
        }
    }
    
    // Hover-Stück verstecken
    function hideHoverPiece() {
        if (hoverPiece) {
            hoverPiece.style.display = 'none';
        }
    }
    
    // Spielzug in einer Spalte
    function makeMoveInColumn(column) {
        gameSocket.makeMove(roomCode, column);
    }
    
    // Spielstein setzen
    function placePiece(row, column, playerUsername, playerColor) {
        const cell = boardEl.querySelector(`.cell[data-row="${row}"][data-column="${column}"]`);
        
        if (cell) {
            // Zelle färben
            cell.style.backgroundColor = playerColor;
            
            // Animation hinzufügen
            cell.classList.add('drop-animation');
            
            // HTML5 Audio für Sound
            const audio = new Audio('../../assets/sounds/piece_drop.mp3');
            audio.volume = 0.3;
            audio.play().catch(e => console.log('Audio konnte nicht abgespielt werden:', e));
            
            // Animation nach Abschluss entfernen
            setTimeout(() => {
                cell.classList.remove('drop-animation');
            }, 500);
        }
    }
    
    // Spieler-Liste aktualisieren
    function updatePlayerList(playersList) {
        playerListEl.innerHTML = '';
        
        playersList.forEach(player => {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'player';
            if (player.username === currentPlayerUsername) {
                playerDiv.classList.add('active-player');
            }
            
            const playerColorDiv = document.createElement('div');
            playerColorDiv.className = 'player-color';
            playerColorDiv.style.backgroundColor = player.color;
            
            const playerName = document.createElement('span');
            playerName.textContent = player.username;
            if (player.isHost) {
                playerName.textContent += ' (Host)';
            }
            if (player.username === username) {
                playerName.textContent += ' (Du)';
            }
            
            playerDiv.appendChild(playerColorDiv);
            playerDiv.appendChild(playerName);
            playerListEl.appendChild(playerDiv);
            
            // Host-Status speichern
            if (player.username === username && player.isHost) {
                isHost = true;
                gameControls.style.display = isHost ? 'block' : 'none';
            }
        });
    }
    
    // Spielstatus aktualisieren
    function updateGameStatus() {
        if (!gameActive) {
            gameStatusEl.textContent = 'Warte auf Spieler...';
            gameStatusEl.className = 'game-status';
            boardEl.classList.add('inactive-game');
            return;
        }
        
        boardEl.classList.remove('inactive-game');
        
        if (currentPlayerUsername === username) {
            gameStatusEl.textContent = 'Du bist am Zug!';
            gameStatusEl.className = 'game-status your-turn';
        } else {
            const currentPlayer = players.find(p => p.username === currentPlayerUsername);
            if (currentPlayer) {
                gameStatusEl.textContent = `${currentPlayerUsername} ist am Zug`;
                gameStatusEl.className = 'game-status not-your-turn';
            }
        }
    }
    
    // Gewinnzellen markieren
    function highlightWinningCells(cells) {
        cells.forEach(([row, col]) => {
            const cell = boardEl.querySelector(`.cell[data-row="${row}"][data-column="${col}"]`);
            if (cell) {
                cell.classList.add('winning-cell');
            }
        });
    }
    
    // Spiel zurücksetzen
    function resetGame() {
        // Alle Zellen zurücksetzen
        const cells = boardEl.querySelectorAll('.cell');
        cells.forEach(cell => {
            cell.style.backgroundColor = 'white';
            cell.classList.remove('winning-cell');
        });
        
        gameActive = true;
        updateGameStatus();
    }
    
    // Event-Listener für Socket.io-Ereignisse
    gameSocket.connect();
    
    // Beim ersten Laden
    gameSocket.on('connect', () => {
        // Raum beitreten
        gameSocket.joinRoom(roomCode, username, userColor);
    });
    
    // Spieler betritt den Raum
    gameSocket.on('playerJoined', (data) => {
        players = data.players;
        
        // Spieleranzahl prüfen (Vier Gewinnt benötigt genau 2 Spieler)
        const wasActive = gameActive;
        gameActive = players.length === 2;
        
        // Ersten Spieler als aktiven Spieler setzen
        if (gameActive && !currentPlayerUsername) {
            currentPlayerUsername = players[0].username;
        }
        
        // Wenn das Spiel jetzt aktiv ist, aber vorher nicht war
        // (d.h. der zweite Spieler ist gerade beigetreten)
        if (gameActive && !wasActive) {
            // Aktualisiere den Spielstatus
            updatePlayerList(players);
            updateGameStatus();
        } else {
            updatePlayerList(players);
            updateGameStatus();
        }
    });
    
    // Spieler verlässt den Raum
    gameSocket.on('playerLeft', (data) => {
        players = data.players;
        currentPlayerUsername = data.currentPlayer;
        
        // Spiel pausieren, wenn nicht genug Spieler da sind
        gameActive = players.length === 2;
        
        updatePlayerList(players);
        updateGameStatus();
    });
    
    // Spielzug aktualisieren
    gameSocket.on('moveUpdate', (data) => {
        placePiece(data.row, data.column, data.player.username, data.player.color);
        currentPlayerUsername = data.nextPlayer;
        gameBoard = data.gameState.board;
        
        updatePlayerList(players);
        updateGameStatus();
    });
    
    // Spielende
    gameSocket.on('gameOver', (data) => {
        gameActive = false;
        
        if (data.winner) {
            gameStatusEl.textContent = data.winner === username ? 
                'Du hast gewonnen! 🎉' : 
                `${data.winner} hat gewonnen!`;
        } else {
            gameStatusEl.textContent = 'Unentschieden!';
        }
        
        gameStatusEl.className = 'game-status winner-message';
        
        if (data.winningCells && data.winningCells.length > 0) {
            highlightWinningCells(data.winningCells);
        }
        
        // Neustart-Button anzeigen (nur für Host)
        gameControls.style.display = isHost ? 'block' : 'none';
    });
    
    // Spielneustart
    gameSocket.on('gameRestarted', (data) => {
        resetGame();
        gameBoard = data.gameState.board;
        currentPlayerUsername = data.currentPlayer;
        
        updatePlayerList(players);
        updateGameStatus();
    });
    
    // Button-Event-Listener
    backButton.addEventListener('click', () => {
        // Raum verlassen
        gameSocket.leaveRoom(roomCode);
        
        // Zurück zur Hauptseite
        window.location.href = '../../index.html';
    });
    
    restartButton.addEventListener('click', () => {
        if (isHost) {
            gameSocket.restartGame(roomCode);
        }
    });
    
    // Spielbrett initialisieren
    initializeBoard();
    updateGameStatus();
});