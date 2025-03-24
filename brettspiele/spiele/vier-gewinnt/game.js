document.addEventListener('DOMContentLoaded', function() {
    if (!isUserLoggedIn()) {
        window.location.href = '/login';
        return;
    }
    
    const username = getCookie('username');
    const userColor = getCookie('userColor');
    
    const roomCode = sessionStorage.getItem('currentRoom');
    if (!roomCode) {
        window.location.href = '/';
        return;
    }
    
    const boardEl = document.getElementById('game-board');
    const playerListEl = document.getElementById('player-list');
    const gameStatusEl = document.getElementById('game-status');
    const roomCodeEl = document.getElementById('room-code-display');
    const usernameDisplayEl = document.getElementById('username-display');
    const userColorDisplayEl = document.getElementById('user-color-display');
    const backButton = document.getElementById('back-button');
    const restartButton = document.getElementById('restart-button');
    const gameControls = document.getElementById('game-controls');
    
    const connectionStatusEl = document.getElementById('connection-status') || document.createElement('div');
    if (!document.getElementById('connection-status')) {
        connectionStatusEl.className = 'connection-status';
        connectionStatusEl.id = 'connection-status';
        connectionStatusEl.setAttribute('data-i18n', 'connectFour.connectionLost');
        connectionStatusEl.textContent = i18n.t('connectFour.connectionLost');
        connectionStatusEl.style.display = 'none';
        document.querySelector('.game-info-panel').appendChild(connectionStatusEl);
    }
    
    usernameDisplayEl.textContent = username;
    userColorDisplayEl.style.backgroundColor = userColor;
    roomCodeEl.textContent = roomCode;
    
    let players = [];
    let currentPlayerUsername = '';
    let gameActive = false;
    let isHost = false;
    let gameBoard = [];
    let hoverPiece = null;
    let opponentHoverPiece = null;
    let activePlayerColor = userColor;
    let animationRunning = false;
    let hoverRowEl = null;
    let boardRowsEl = null;
    let lastHoverColumn = null;
    let gameOver = false;
    let animationLayer = null;
    
    const CELL_WIDTH = 70;
    const CELL_MARGIN = 7;
    const CELL_TOTAL_WIDTH = CELL_WIDTH + (CELL_MARGIN * 2);
    const NUM_COLUMNS = 7;
    const NUM_ROWS = 6;
    let colWidth = 0;
    
    function initializeBoard() {
        boardEl.innerHTML = '';
        
        animationLayer = document.createElement('div');
        animationLayer.className = 'animation-layer';
        boardEl.appendChild(animationLayer);
        
        boardRowsEl = document.createElement('div');
        boardRowsEl.className = 'board-rows';
        boardEl.appendChild(boardRowsEl);
        
        hoverRowEl = document.createElement('div');
        hoverRowEl.className = 'hover-row';
        boardEl.insertBefore(hoverRowEl, boardRowsEl);
        
        hoverPiece = document.createElement('div');
        hoverPiece.className = 'hover-piece';
        hoverPiece.style.display = 'none';
        hoverPiece.style.backgroundColor = activePlayerColor;
        hoverRowEl.appendChild(hoverPiece);
        
        opponentHoverPiece = document.createElement('div');
        opponentHoverPiece.className = 'hover-piece opponent-hover';
        opponentHoverPiece.style.display = 'none';
        hoverRowEl.appendChild(opponentHoverPiece);
        
        for (let row = 0; row < NUM_ROWS; row++) {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'board-row';
            rowDiv.dataset.row = row;
            
            for (let col = 0; col < NUM_COLUMNS; col++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = row;
                cell.dataset.column = col;
                
                rowDiv.appendChild(cell);
            }
            
            boardRowsEl.appendChild(rowDiv);
        }
        
        calculateColumnWidth();
        addColumnHitboxes();
    }
    
    function calculateColumnWidth() {
        colWidth = boardRowsEl.offsetWidth / NUM_COLUMNS;
    }
    
    function addColumnHitboxes() {
        const existingHitboxes = boardEl.querySelectorAll('.column-hitbox');
        existingHitboxes.forEach(hitbox => hitbox.remove());
        
        for (let col = 0; col < NUM_COLUMNS; col++) {
            const hitbox = document.createElement('div');
            hitbox.className = 'column-hitbox';
            hitbox.dataset.column = col;
            
            hitbox.style.left = (col * colWidth + 15) + 'px';
            hitbox.style.width = colWidth + 'px';
            
            hitbox.addEventListener('click', () => {
                if (gameActive && !gameOver && currentPlayerUsername === username && !animationRunning) {
                    makeMoveInColumn(col);
                }
            });
            
            hitbox.addEventListener('mouseover', () => {
                lastHoverColumn = col;
                if (gameActive && !gameOver && currentPlayerUsername === username && !animationRunning) {
                    showHoverPiece(col);
                    sendHoverUpdate(col);
                }
            });
            
            hitbox.addEventListener('mouseout', () => {
                lastHoverColumn = null;
                if (gameActive && currentPlayerUsername === username) {
                    hideHoverPiece();
                    sendHoverUpdate(null);
                }
            });
            
            boardEl.appendChild(hitbox);
        }
    }
    
    function updateBoardDisplay() {
        if (!gameBoard || !gameBoard.length) return;
        
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
    
    function showHoverPiece(column) {
        if (!hoverPiece || !gameActive || gameOver || animationRunning) return;
        
        if (currentPlayerUsername !== username) {
            hideHoverPiece();
            return;
        }
        
        const leftPosition = (column * colWidth) + ((colWidth - CELL_WIDTH) / 2);
        
        hoverPiece.style.display = 'block';
        hoverPiece.style.left = leftPosition + 'px';
    }
    
    function showOpponentHoverPiece(column, color) {
        if (!opponentHoverPiece || !gameActive) return;
        
        if (column === null) {
            opponentHoverPiece.style.display = 'none';
            return;
        }
        
        const leftPosition = (column * colWidth) + ((colWidth - CELL_WIDTH) / 2);
        
        opponentHoverPiece.style.display = 'block';
        opponentHoverPiece.style.backgroundColor = color;
        opponentHoverPiece.style.left = leftPosition + 'px';
    }
    
    function hideHoverPiece() {
        if (hoverPiece) {
            hoverPiece.style.display = 'none';
        }
    }
    
    function hideOpponentHoverPiece() {
        if (opponentHoverPiece) {
            opponentHoverPiece.style.display = 'none';
        }
    }
    
    function updateHoverVisibility() {
        if (gameActive && !gameOver && currentPlayerUsername === username && !animationRunning) {
            const column = lastHoverColumn;
            if (column !== null) {
                showHoverPiece(column);
            }
        } else {
            hideHoverPiece();
        }
    }
    
    function makeMoveInColumn(column) {
        gameSocket.makeMove(roomCode, column);
    }
    
    function placePiece(row, column, playerUsername, playerColor) {
        if (row === null || column === null || animationRunning) return;
        
        animationRunning = true;
        
        hideHoverPiece();
        hideOpponentHoverPiece();
        
        const targetCell = boardEl.querySelector(`.cell[data-row="${row}"][data-column="${column}"]`);
        if (!targetCell) {
            animationRunning = false;
            return;
        }
        
        const cellRect = targetCell.getBoundingClientRect();
        const boardRect = boardEl.getBoundingClientRect();
        const cellCenterX = cellRect.left + (cellRect.width / 2) - boardRect.left;
        
        const leftPosition = cellCenterX - (CELL_WIDTH / 2);
        
        const animatedPiece = document.createElement('div');
        animatedPiece.className = 'animation-placeholder';
        animatedPiece.style.backgroundColor = playerColor;
        animatedPiece.style.left = leftPosition + 'px';
        
        const hoverRowTop = hoverRowEl.getBoundingClientRect().top - boardEl.getBoundingClientRect().top;
        animatedPiece.style.top = hoverRowTop + 'px';
        
        animationLayer.appendChild(animatedPiece);
        
        const targetTop = targetCell.getBoundingClientRect().top - boardEl.getBoundingClientRect().top;
        
        const randomNumber = Math.floor(Math.random() * 30) + 1;
        const formattedNumber = randomNumber.toString().padStart(2, '0');
        
        const audio = new Audio();
        audio.volume = 0.3;
        
        const audioSources = [
            `/spiele/vier-gewinnt/assets/sounds/drop_${formattedNumber}.mp3`,
            `/spiele/vier-gewinnt/assets/sounds/drop_${formattedNumber}.ogg`,
            `/spiele/vier-gewinnt/assets/sounds/drop_${formattedNumber}.wav`
        ];
        
        for (const source of audioSources) {
            try {
                audio.src = source;
                audio.play();
                break;
            } catch (e) {
                continue;
            }
        }
        
        setTimeout(() => {
            animatedPiece.style.transform = `translateY(${targetTop - hoverRowTop}px)`;
            
            setTimeout(() => {
                animationLayer.removeChild(animatedPiece);
                targetCell.style.backgroundColor = playerColor;
                animationRunning = false;
                
                updateHoverVisibility();
            }, 600);
        }, 50);
    }
    
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
            let playerNameText = player.username;
            
            if (player.isHost) {
                playerNameText += ` (${i18n.t('connectFour.host')})`;
            }
            if (player.username === username) {
                playerNameText += ' (Du)';
                if (player.color !== userColor) {
                    activePlayerColor = player.color;
                    if (hoverPiece) {
                        hoverPiece.style.backgroundColor = activePlayerColor;
                    }
                }
            }
            
            playerName.textContent = playerNameText;
            
            playerDiv.appendChild(playerColorDiv);
            playerDiv.appendChild(playerName);
            playerListEl.appendChild(playerDiv);
            
            if (player.username === username && player.isHost) {
                isHost = true;
                gameControls.style.display = isHost ? 'block' : 'none';
            }
        });
    }
    
    function updateGameStatus() {
        if (!gameActive && !gameOver) {
            gameStatusEl.textContent = i18n.t('connectFour.waitingForPlayers');
            gameStatusEl.className = 'game-status';
            boardEl.classList.add('inactive-game');
            return;
        }
        
        boardEl.classList.remove('inactive-game');
        
        if (gameOver) {
            return;
        }
        
        if (currentPlayerUsername === username) {
            gameStatusEl.textContent = i18n.t('connectFour.yourTurn');
            gameStatusEl.className = 'game-status your-turn';
        } else {
            const currentPlayer = players.find(p => p.username === currentPlayerUsername);
            if (currentPlayer) {
                gameStatusEl.setAttribute('data-i18n', 'connectFour.otherTurn');
                gameStatusEl.setAttribute('data-i18n-params', JSON.stringify({ player: currentPlayerUsername }));
                gameStatusEl.textContent = i18n.replaceParams(i18n.t('connectFour.otherTurn'), { player: currentPlayerUsername });
                gameStatusEl.className = 'game-status not-your-turn';
            }
        }
    }
    
    function highlightWinningCells(cells) {
        cells.forEach(([row, col]) => {
            const cell = boardEl.querySelector(`.cell[data-row="${row}"][data-column="${col}"]`);
            if (cell) {
                cell.classList.add('winning-cell');
            }
        });
    }
    
    function resetGame() {
        const cells = boardEl.querySelectorAll('.cell');
        cells.forEach(cell => {
            cell.style.backgroundColor = 'white';
            cell.classList.remove('winning-cell');
        });
        
        gameActive = true;
        gameOver = false;
        updateGameStatus();
    }
    
    function updateConnectionStatus(isDisconnected) {
        connectionStatusEl.style.display = isDisconnected ? 'block' : 'none';
    }
    
    // Internationalisierungs-Handler
    i18n.onLoaded(() => {
        i18n.translatePage();
        updateGameStatus(); // Um sicherzustellen, dass Texte übersetzt sind
    });
    
    // Sprachauswahl-Handler
    const languageSwitcher = document.getElementById('language-switcher');
    if (languageSwitcher) {
        languageSwitcher.addEventListener('change', function() {
            i18n.setLanguage(this.value).then(() => {
                updateGameStatus(); // Status mit neuer Sprache aktualisieren
            });
        });
    }
    
    gameSocket.on('connect', () => {
        gameSocket.joinRoom(roomCode, username, userColor);
    });
    
    gameSocket.on('playerJoined', (data) => {
        players = data.players;
        
        updateConnectionStatus(false);
        
        gameActive = players.length === 2;
        
        if (gameActive && !currentPlayerUsername) {
            currentPlayerUsername = players[0].username;
        }
        
        updatePlayerList(players);
        updateGameStatus();
    });
    
    gameSocket.on('playerLeft', (data) => {
        players = data.players;
        currentPlayerUsername = data.currentPlayer;
        
        gameActive = players.length === 2;
        
        updatePlayerList(players);
        updateGameStatus();
    });
    
    gameSocket.on('playerDisconnected', (data) => {
        updateConnectionStatus(true);
    });
    
    gameSocket.on('playerReconnected', (data) => {
        updateConnectionStatus(false);
    });
    
    gameSocket.on('hoverUpdate', (data) => {
        const { column, username: hoverUsername, userColor: hoverColor } = data;
        
        if (hoverUsername !== username) {
            showOpponentHoverPiece(column, hoverColor);
        }
    });
    
    gameSocket.on('moveUpdate', (data) => {
        if (data.player) {
            placePiece(data.row, data.column, data.player.username, data.player.color);
        }
        
        currentPlayerUsername = data.nextPlayer;
        gameBoard = data.gameState.board;
        
        setTimeout(() => {
            updateBoardDisplay();
            updatePlayerList(players);
            updateGameStatus();
            updateHoverVisibility();
        }, 650);
    });
    
    gameSocket.on('gameOver', (data) => {
        gameActive = false;
        gameOver = true;
        
        if (data.winner) {
            if (data.winner === username) {
                gameStatusEl.textContent = i18n.t('connectFour.youWon');
                gameStatusEl.setAttribute('data-i18n', 'connectFour.youWon');
                gameStatusEl.removeAttribute('data-i18n-params');
            } else {
                gameStatusEl.setAttribute('data-i18n', 'connectFour.otherWon');
                gameStatusEl.setAttribute('data-i18n-params', JSON.stringify({ player: data.winner }));
                gameStatusEl.textContent = i18n.replaceParams(i18n.t('connectFour.otherWon'), { player: data.winner });
            }
        } else {
            gameStatusEl.textContent = i18n.t('connectFour.draw');
            gameStatusEl.setAttribute('data-i18n', 'connectFour.draw');
            gameStatusEl.removeAttribute('data-i18n-params');
        }
        
        gameStatusEl.className = 'game-status winner-message';
        
        boardEl.classList.remove('inactive-game');
        hideHoverPiece();
        
        if (data.winningCells && data.winningCells.length > 0) {
            setTimeout(() => {
                highlightWinningCells(data.winningCells);
            }, 700);
        }
        
        gameControls.style.display = isHost ? 'block' : 'none';
    });
    
    gameSocket.on('gameRestarted', (data) => {
        resetGame();
        gameBoard = data.gameState.board;
        currentPlayerUsername = data.currentPlayer;
        
        updatePlayerList(players);
        updateGameStatus();
    });
    
    gameSocket.on('gameState', (data) => {
        gameBoard = data.gameState.board;
        currentPlayerUsername = data.currentPlayer;
        
        updateBoardDisplay();
        updatePlayerList(data.players);
        updateGameStatus();
    });
    
    gameSocket.on('joinError', (error) => {
        alert(error);
        window.location.href = '/';
    });
    
    backButton.addEventListener('click', () => {
        gameSocket.leaveRoom(roomCode);
        window.location.href = '/';
    });
    
    restartButton.addEventListener('click', () => {
        if (isHost) {
            gameSocket.restartGame(roomCode);
        }
    });
    
    window.addEventListener('resize', () => {
        setTimeout(() => {
            calculateColumnWidth();
            addColumnHitboxes();
            
            if (lastHoverColumn !== null) {
                showHoverPiece(lastHoverColumn);
            }
        }, 200);
    });
    
    initializeBoard();
    updateGameStatus();
    
    if (gameSocket.isConnected()) {
        gameSocket.socket.emit('requestGameState', { roomCode });
    }
});