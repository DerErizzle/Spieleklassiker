/**
 * Vier Gewinnt - Verbesserte Spiellogik
 */

document.addEventListener('DOMContentLoaded', function() {
    // Überprüfen, ob der Benutzer eingeloggt ist
    if (!isUserLoggedIn()) {
        window.location.href = '/login';
        return;
    }
    
    // Benutzerdaten abrufen
    const username = getCookie('username');
    const userColor = getCookie('userColor');
    
    // Raumcode abrufen
    const roomCode = sessionStorage.getItem('currentRoom');
    if (!roomCode) {
        window.location.href = '/';
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
    
    // Neues Element für Verbindungsstatus hinzufügen
    const connectionStatusEl = document.getElementById('connection-status') || document.createElement('div');
    if (!document.getElementById('connection-status')) {
        connectionStatusEl.className = 'connection-status';
        connectionStatusEl.id = 'connection-status';
        connectionStatusEl.textContent = 'Der andere Spieler hat die Verbindung verloren...';
        connectionStatusEl.style.display = 'none';
        document.querySelector('.game-info-panel').appendChild(connectionStatusEl);
    }
    
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
    let activePlayerColor = userColor; // Tatsächliche Spielerfarbe (kann bei Konflikt geändert werden)
    let animationRunning = false; // Verhindert mehrere gleichzeitige Animationen
    let hoverRowEl = null;
    let lastHoverColumn = null; // Verfolgt den letzten Hover-Zustand
    
    // Spielbrett initialisieren (verbessert)
    function initializeBoard() {
        boardEl.innerHTML = '';
        
        // Container für die Zeilen erstellen
        const boardRows = document.createElement('div');
        boardRows.className = 'board-rows';
        boardEl.appendChild(boardRows);
        
        // Hover-Reihe über dem Brett erstellen
        hoverRowEl = document.createElement('div');
        hoverRowEl.className = 'hover-row';
        boardEl.insertBefore(hoverRowEl, boardRows);
        
        // Hover-Stück für den aktuellen Spieler erstellen
        hoverPiece = document.createElement('div');
        hoverPiece.className = 'hover-piece';
        hoverPiece.style.display = 'none';
        hoverPiece.style.backgroundColor = activePlayerColor;
        hoverRowEl.appendChild(hoverPiece);
        
        // Hover-Stück für den Gegner erstellen
        opponentHoverPiece = document.createElement('div');
        opponentHoverPiece.className = 'hover-piece opponent-hover';
        opponentHoverPiece.style.display = 'none';
        hoverRowEl.appendChild(opponentHoverPiece);
        
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
                
                rowDiv.appendChild(cell);
            }
            
            boardRows.appendChild(rowDiv);
        }
        
        // Hitboxes für Spalten hinzufügen
        addColumnHitboxes();
    }
    
    // Verbesserte Spalten-Hitboxen mit exakten Positionierungen
    function addColumnHitboxes() {
        // Vorhandene Hitboxes entfernen (falls vorhanden)
        const existingHitboxes = boardEl.querySelectorAll('.column-hitbox');
        existingHitboxes.forEach(hitbox => hitbox.remove());
        
        // Neue Hitboxes mit exakten Positionierungen hinzufügen
        for (let col = 0; col < 7; col++) {
            const hitbox = document.createElement('div');
            hitbox.className = 'column-hitbox';
            hitbox.dataset.column = col;
            
            // Exakte Positionierung (mittig über jeder Spalte)
            const cellWidth = 84; // 70px Zelle + 14px Margin
            hitbox.style.left = col * cellWidth + 'px';
            hitbox.style.width = cellWidth + 'px';
            
            // Event-Listener für die Hitbox
            hitbox.addEventListener('click', () => {
                if (gameActive && currentPlayerUsername === username && !animationRunning) {
                    makeMoveInColumn(col);
                }
            });
            
            hitbox.addEventListener('mouseover', () => {
                lastHoverColumn = col;
                if (gameActive && currentPlayerUsername === username && !animationRunning) {
                    showHoverPiece(col);
                    // Sende hover-Information an andere Spieler
                    sendHoverUpdate(col);
                }
            });
            
            hitbox.addEventListener('mouseout', () => {
                lastHoverColumn = null;
                if (gameActive && currentPlayerUsername === username) {
                    hideHoverPiece();
                    // Informiere Spieler, dass der Hover beendet wurde
                    sendHoverUpdate(null);
                }
            });
            
            boardEl.appendChild(hitbox);
        }
    }
    
    // Spielbrett mit dem aktuellen Spielstand aktualisieren
    function updateBoardDisplay() {
        if (!gameBoard || !gameBoard.length) return;
        
        // Alle Zellen basierend auf dem aktuellen Spielstand aktualisieren
        for (let row = 0; row < gameBoard.length; row++) {
            for (let col = 0; col < gameBoard[row].length; col++) {
                const piece = gameBoard[row][col];
                if (piece) {
                    const cell = boardEl.querySelector(`.cell[data-row="${row}"][data-column="${col}"]`);
                    if (cell) {
                        cell.style.backgroundColor = piece.color;
                    }
                }
            }
        }
    }
    
    // Sende Hover-Update an andere Spieler
    function sendHoverUpdate(column) {
        if (gameSocket.isConnected()) {
            gameSocket.socket.emit('hoverUpdate', {
                roomCode: roomCode,
                column: column,
                username: username,
                userColor: activePlayerColor
            });
        }
    }
    
    // Hover-Stück anzeigen (verbessert)
    function showHoverPiece(column) {
        if (!hoverPiece || !gameActive || animationRunning) return;
        
        // Keine Anzeige wenn der Spieler nicht am Zug ist
        if (currentPlayerUsername !== username) {
            hideHoverPiece();
            return;
        }
        
        // Exakte Position berechnen (mittig in der Spalte)
        const cellWidth = 84; // 70px Breite + 14px Margin
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
    
    // Funktion zum Verstecken des gegnerischen Hover-Effekts
    function hideOpponentHoverPiece() {
        if (opponentHoverPiece) {
            opponentHoverPiece.style.display = 'none';
        }
    }
    
    // Helferfunktion zur Aktualisierung der Hover-Sichtbarkeit basierend auf dem Spielzustand
    function updateHoverVisibility() {
        if (gameActive && currentPlayerUsername === username && !animationRunning) {
            // Wenn der Mauszeiger über einer Spalte ist, den Hover-Effekt dort anzeigen
            const column = lastHoverColumn;
            if (column !== null) {
                showHoverPiece(column);
            }
        } else {
            hideHoverPiece();
        }
    }
    
    // Spielzug in einer Spalte
    function makeMoveInColumn(column) {
        gameSocket.makeMove(roomCode, column);
    }
    
    // Verbesserte Animation für fallenden Spielstein
    function placePiece(row, column, playerUsername, playerColor) {
        if (row === null || column === null || animationRunning) return;
        
        animationRunning = true;
        
        // Hover-Effekt verstecken während der Animation
        hideHoverPiece();
        hideOpponentHoverPiece();
        
        // Berechne die Position (mittig zentriert)
        const cellWidth = 84; // 70px Breite + 14px Margin
        const leftPosition = column * cellWidth + 7; // +7px für den linken Rand
        
        // Finde die Zielzelle
        const targetCell = boardEl.querySelector(`.cell[data-row="${row}"][data-column="${column}"]`);
        if (!targetCell) {
            animationRunning = false;
            return;
        }
        
        // Erstelle den animierten Spielstein
        const animatedPiece = document.createElement('div');
        animatedPiece.className = 'animation-placeholder';
        animatedPiece.style.backgroundColor = playerColor;
        animatedPiece.style.left = leftPosition + 'px';
        
        // Starte die Animation von der Position der Hover-Reihe aus
        const hoverRowTop = hoverRowEl.getBoundingClientRect().top - boardEl.getBoundingClientRect().top;
        animatedPiece.style.top = hoverRowTop + 'px';
        
        // Füge den animierten Stein dem Spielbrett hinzu
        boardEl.appendChild(animatedPiece);
        
        // Berechne die Zielposition für die Animation
        const targetTop = targetCell.getBoundingClientRect().top - boardEl.getBoundingClientRect().top;
        
        // HTML5 Audio für Sound
        const audio = new Audio('../../assets/sounds/piece_drop.mp3');
        audio.volume = 0.3;
        audio.play().catch(e => console.log('Audio konnte nicht abgespielt werden:', e));
        
        // Starte die Animation nach einem kurzen Delay
        setTimeout(() => {
            animatedPiece.style.transform = `translateY(${targetTop - hoverRowTop}px)`;
            
            // Nach Abschluss der Animation den animierten Stein entfernen und die Zielzelle einfärben
            setTimeout(() => {
                boardEl.removeChild(animatedPiece);
                targetCell.style.backgroundColor = playerColor;
                animationRunning = false;
                
                // Hover-Effekt wieder anzeigen, falls der Spieler am Zug ist
                updateHoverVisibility();
            }, 600); // Entspricht der Animationsdauer in CSS
        }, 50);
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
                // Aktualisiere die aktive Spielerfarbe falls sie durch Konflikt geändert wurde
                if (player.color !== userColor) {
                    activePlayerColor = player.color;
                    // Aktualisiere auch die Farbe im Hover-Stück
                    if (hoverPiece) {
                        hoverPiece.style.backgroundColor = activePlayerColor;
                    }
                }
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
    
    // Verbindungsstatusanzeige aktualisieren
    function updateConnectionStatus(isDisconnected) {
        connectionStatusEl.style.display = isDisconnected ? 'block' : 'none';
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
        
        // Verbindungsstatus aktualisieren
        updateConnectionStatus(false);
        
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
    
    // Spieler hat die Verbindung verloren
    gameSocket.on('playerDisconnected', (data) => {
        console.log('Spieler hat Verbindung verloren:', data);
        // Zeige Verbindungsstatusanzeige
        updateConnectionStatus(true);
    });
    
    // Spieler ist wieder verbunden
    gameSocket.on('playerReconnected', (data) => {
        console.log('Spieler ist wieder verbunden:', data);
        // Verstecke Verbindungsstatusanzeige
        updateConnectionStatus(false);
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
        
        // Aktualisiere den Spielstatus nach der Animation
        setTimeout(() => {
            updateBoardDisplay();
            updatePlayerList(players);
            updateGameStatus();
            updateHoverVisibility(); // Hover-Effekt basierend auf dem neuen Zustand aktualisieren
        }, 650);
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
            // Markiere Gewinnzellen nach Ende der Animation
            setTimeout(() => {
                highlightWinningCells(data.winningCells);
            }, 700);
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
    
    // Aktuellen Spielstand empfangen (für reconnects)
    gameSocket.on('gameState', (data) => {
        console.log('Aktuellen Spielstand empfangen:', data);
        gameBoard = data.gameState.board;
        currentPlayerUsername = data.currentPlayer;
        
        // Aktualisiere das Brett mit dem aktuellen Spielstand
        updateBoardDisplay();
        updatePlayerList(data.players);
        updateGameStatus();
    });
    
    // Fehler beim Beitreten
    gameSocket.on('joinError', (error) => {
        console.error('Fehler beim Beitreten zum Raum:', error);
        alert('Fehler: ' + error);
        window.location.href = '/';
    });
    
    // Button-Event-Listener
    backButton.addEventListener('click', () => {
        // Raum verlassen
        gameSocket.leaveRoom(roomCode);
        
        // Zurück zur Hauptseite
        window.location.href = '/';
    });
    
    restartButton.addEventListener('click', () => {
        if (isHost) {
            gameSocket.restartGame(roomCode);
        }
    });
    
    // Spielbrett initialisieren
    initializeBoard();
    updateGameStatus();
    
    // Spiel-Status explizit anfragen (für Reconnect-Szenario)
    if (gameSocket.isConnected()) {
        gameSocket.socket.emit('requestGameState', { roomCode });
    }
    
    // DEBUG: Status anzeigen
    console.log('Spielseite geladen', {
        roomCode,
        username,
        userColor
    });
});