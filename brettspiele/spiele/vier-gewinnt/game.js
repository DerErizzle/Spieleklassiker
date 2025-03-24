/**
 * Vier Gewinnt - Spiellogik (korrigierte Version)
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
    
    // Debug-Bereich hinzufügen (optional)
    const debugArea = document.createElement('div');
    debugArea.id = 'debug-area';
    debugArea.style.display = 'none'; // Auf 'block' setzen, um Debug-Ausgabe zu sehen
    debugArea.style.maxHeight = '200px';
    debugArea.style.overflow = 'auto';
    debugArea.style.border = '1px solid #ccc';
    debugArea.style.padding = '10px';
    debugArea.style.marginTop = '20px';
    document.querySelector('.game-container').appendChild(debugArea);
    
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
    let opponentHoverPiece = null;
    
    // Spielbrett initialisieren (KORRIGIERT)
    function initializeBoard() {
        boardEl.innerHTML = '';
        
        // Container für die Zeilen erstellen
        const boardRows = document.createElement('div');
        boardRows.className = 'board-rows';
        boardEl.appendChild(boardRows);
        
        // Erstelle das Spielbrett in der korrekten Orientierung (7x6)
        // Beginne mit Zeile 0 (oberste Zeile) und arbeite nach unten
        for (let row = 0; row < 6; row++) {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'board-row';
            rowDiv.dataset.row = row;
            
            // 7 Zellen pro Zeile erstellen
            for (let col = 0; col < 7; col++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = row;
                cell.dataset.column = col;
                
                // Klick-Event auf die Zelle (delegiert den Klick auf die Spalte)
                cell.addEventListener('click', () => {
                    if (gameActive && currentPlayerUsername === username) {
                        makeMoveInColumn(col);
                    }
                });
                
                // Hover-Events
                cell.addEventListener('mouseover', () => {
                    if (gameActive && currentPlayerUsername === username) {
                        showHoverPiece(col);
                        // Sende hover-Information an andere Spieler
                        sendHoverUpdate(col);
                    }
                });
                
                cell.addEventListener('mouseout', () => {
                    if (gameActive && currentPlayerUsername === username) {
                        hideHoverPiece();
                        // Informiere Spieler, dass der Hover beendet wurde
                        sendHoverUpdate(null);
                    }
                });
                
                rowDiv.appendChild(cell);
            }
            
            boardRows.appendChild(rowDiv);
        }
        
        // Hover-Reihe über dem Brett erstellen
        const hoverRow = document.createElement('div');
        hoverRow.className = 'hover-row';
        boardEl.insertBefore(hoverRow, boardRows);
        
        // Hover-Stück für den aktuellen Spieler erstellen
        hoverPiece = document.createElement('div');
        hoverPiece.className = 'hover-piece';
        hoverPiece.style.display = 'none';
        hoverPiece.style.backgroundColor = userColor;
        hoverRow.appendChild(hoverPiece);
        
        // Hover-Stück für den Gegner erstellen
        opponentHoverPiece = document.createElement('div');
        opponentHoverPiece.className = 'hover-piece opponent-hover';
        opponentHoverPiece.style.display = 'none';
        hoverRow.appendChild(opponentHoverPiece);
    }
    
    // Sende Hover-Update an andere Spieler
    function sendHoverUpdate(column) {
        if (gameSocket.isConnected()) {
            gameSocket.socket.emit('hoverUpdate', {
                roomCode: roomCode,
                column: column,
                username: username,
                userColor: userColor
            });
        }
    }
    
    // Hover-Stück anzeigen (KORRIGIERT)
    function showHoverPiece(column) {
        if (!hoverPiece || !gameActive) return;
        
        // Berechne die Position basierend auf der Spalte
        const cellWidth = 84; // 70px Breite + 14px Margin (7px auf jeder Seite)
        const leftPosition = column * cellWidth + 7; // +7px für den linken Rand
        
        hoverPiece.style.display = 'block';
        hoverPiece.style.left = leftPosition + 'px';
    }
    
    // Gegnerisches Hover-Stück anzeigen
    function showOpponentHoverPiece(column, color) {
        if (!opponentHoverPiece || !gameActive) return;
        
        if (column === null) {
            opponentHoverPiece.style.display = 'none';
            return;
        }
        
        // Berechne die Position basierend auf der Spalte
        const cellWidth = 84; // 70px Breite + 14px Margin
        const leftPosition = column * cellWidth + 7;
        
        opponentHoverPiece.style.display = 'block';
        opponentHoverPiece.style.backgroundColor = color;
        opponentHoverPiece.style.left = leftPosition + 'px';
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
    
    // Spielstein setzen (KORRIGIERT)
    function placePiece(row, column, playerUsername, playerColor) {
        if (row === null || column === null) return;
        
        const cell = boardEl.querySelector(`.cell[data-row="${row}"][data-column="${column}"]`);
        
        if (cell) {
            // Zelle färben
            cell.style.backgroundColor = playerColor;
            
            // Animation hinzufügen (geändert auf drop-animation)
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
        console.log("Aktualisiere Spielerliste:", playersList);
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
    
    // Bei erfolgreicher Socket-Verbindung
    gameSocket.on('connect', () => {
        console.log('Socket verbunden, trete Raum bei:', roomCode, username, userColor);
        // Raum beitreten
        gameSocket.joinRoom(roomCode, username, userColor);
    });
    
    // Spieler betritt den Raum
    gameSocket.on('playerJoined', (data) => {
        console.log('Spieler beigetreten Event empfangen:', data);
        players = data.players;
        
        // Spieleranzahl prüfen (Vier Gewinnt benötigt genau 2 Spieler)
        const wasActive = gameActive;
        gameActive = players.length === 2;
        
        // Ersten Spieler als aktiven Spieler setzen, falls noch nicht geschehen
        if (gameActive && !currentPlayerUsername) {
            currentPlayerUsername = players[0].username;
        }
        
        // Aktualisiere UI
        updatePlayerList(players);
        updateGameStatus();
    });
    
    // Spieler verlässt den Raum
    gameSocket.on('playerLeft', (data) => {
        console.log('Spieler verlassen Event empfangen:', data);
        players = data.players;
        currentPlayerUsername = data.currentPlayer;
        
        // Spiel pausieren, wenn nicht genug Spieler da sind
        gameActive = players.length === 2;
        
        updatePlayerList(players);
        updateGameStatus();
    });
    
    // Hover-Update von anderen Spielern
    gameSocket.on('hoverUpdate', (data) => {
        const { column, username: hoverUsername, userColor: hoverColor } = data;
        
        // Zeige nur den Hover-Effekt von anderen Spielern an
        if (hoverUsername !== username) {
            showOpponentHoverPiece(column, hoverColor);
        }
    });
    
    // Spielzug aktualisieren
    gameSocket.on('moveUpdate', (data) => {
        console.log('Spielzug-Update empfangen:', data);
        
        if (data.player) {
            placePiece(data.row, data.column, data.player.username, data.player.color);
        }
        
        currentPlayerUsername = data.nextPlayer;
        gameBoard = data.gameState.board;
        
        updatePlayerList(players);
        updateGameStatus();
    });
    
    // Spielende
    gameSocket.on('gameOver', (data) => {
        console.log('Spielende empfangen:', data);
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
        console.log('Spielneustart empfangen:', data);
        resetGame();
        gameBoard = data.gameState.board;
        currentPlayerUsername = data.currentPlayer;
        
        updatePlayerList(players);
        updateGameStatus();
    });
    
    // Fehler beim Beitreten
    gameSocket.on('joinError', (error) => {
        console.error('Fehler beim Beitreten zum Raum:', error);
        alert('Fehler: ' + error);
        window.location.href = '../../index.html';
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
    
    // DEBUG: Status anzeigen
    console.log('Spielseite geladen', {
        roomCode,
        username,
        userColor
    });
});