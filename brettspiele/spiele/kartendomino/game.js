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
    
    // DOM-Elemente
    const gameTableEl = document.getElementById('game-table');
    const playerHandEl = document.getElementById('player-hand');
    const playerListEl = document.getElementById('player-list');
    const gameStatusEl = document.getElementById('game-status');
    const roomCodeEl = document.getElementById('room-code-display');
    const usernameDisplayEl = document.getElementById('username-display');
    const userColorDisplayEl = document.getElementById('user-color-display');
    const backButton = document.getElementById('back-button');
    const restartButton = document.getElementById('restart-button');
    const gameControls = document.getElementById('game-controls');
    const passButton = document.getElementById('pass-button');
    const surrenderButton = document.getElementById('surrender-button');
    const passCounterEl = document.getElementById('pass-counter');
    const passCountEl = document.getElementById('pass-count');
    const startGameContainer = document.getElementById('start-game-container');
    const startGameButton = document.getElementById('start-game-button');
    const gameOverModal = document.getElementById('game-over-modal');
    const winnerMessageEl = document.getElementById('winner-message');
    const rankingListEl = document.getElementById('ranking-list');
    const closeModalButton = document.getElementById('close-modal-button');
    
    // Spielfeld-Elemente
    const spadesCardsEl = document.getElementById('spades-cards');
    const clubsCardsEl = document.getElementById('clubs-cards');
    const heartsCardsEl = document.getElementById('hearts-cards');
    const diamondsCardsEl = document.getElementById('diamonds-cards');
    
    // Gegner-Elemente
    const opponents = [
        {
            el: document.getElementById('opponent-left'),
            nameEl: document.getElementById('opponent-left').querySelector('.opponent-name'),
            cardsEl: document.getElementById('opponent-left').querySelector('.opponent-cards'),
            passCountEl: document.getElementById('opponent-left').querySelector('.opponent-pass-count')
        },
        {
            el: document.getElementById('opponent-top'),
            nameEl: document.getElementById('opponent-top').querySelector('.opponent-name'),
            cardsEl: document.getElementById('opponent-top').querySelector('.opponent-cards'),
            passCountEl: document.getElementById('opponent-top').querySelector('.opponent-pass-count')
        },
        {
            el: document.getElementById('opponent-right'),
            nameEl: document.getElementById('opponent-right').querySelector('.opponent-name'),
            cardsEl: document.getElementById('opponent-right').querySelector('.opponent-cards'),
            passCountEl: document.getElementById('opponent-right').querySelector('.opponent-pass-count')
        }
    ];
    
    const connectionStatusEl = document.getElementById('connection-status') || document.createElement('div');
    if (!document.getElementById('connection-status')) {
        connectionStatusEl.className = 'connection-status';
        connectionStatusEl.id = 'connection-status';
        connectionStatusEl.setAttribute('data-i18n', 'sevens.connectionLost');
        connectionStatusEl.textContent = i18n.t('sevens.connectionLost');
        connectionStatusEl.style.display = 'none';
        document.querySelector('.game-info-panel').appendChild(connectionStatusEl);
    }
    
    // Spielzustand
    let players = [];
    let playerIndex = -1;
    let currentPlayerUsername = '';
    let gameActive = false;
    let isHost = false;
    let hand = [];
    let board = {
        spades: [7],
        clubs: [7],
        hearts: [7],
        diamonds: [7]
    };
    let passCount = 0;
    let surrendered = false;
    let gameOver = false;
    
    // UI initialisieren
    usernameDisplayEl.textContent = username;
    userColorDisplayEl.style.backgroundColor = userColor;
    roomCodeEl.textContent = roomCode;
    gameTableEl.style.display = 'none';
    passButton.disabled = true;
    surrenderButton.disabled = true;
    
    // Spielbrett initial rendern
    renderBoard();
    
    // Herzfarbe für rote Symbole
    document.querySelector('#hearts-row .suit-label').classList.add('red');
    document.querySelector('#diamonds-row .suit-label').classList.add('red');
    
    /**
     * Zeigt die Karten eines Spielers an
     */
    function renderPlayerHand() {
        playerHandEl.innerHTML = '';
        
        hand.forEach((card, index) => {
            const cardEl = document.createElement('div');
            cardEl.className = 'card';
            
            // Prüfen, ob die Karte spielbar ist
            const isPlayable = isCardPlayable(board, card);
            if (isPlayable) {
                cardEl.classList.add('playable');
            } else {
                cardEl.classList.add('not-playable');
            }
            
            // Kartenbilder vom CDN laden
            const cardValue = getCardValueName(card.value);
            const cardSuit = card.suit;
            const cardImageUrl = getCdnUrl(`/games/kartendomino/${cardValue}_of_${cardSuit}.png`);
            cardEl.style.backgroundImage = `url('${cardImageUrl}')`;
            
            // Event-Listener für spielbare Karten
            if (isPlayable && currentPlayerUsername === username && gameActive && !gameOver) {
                cardEl.addEventListener('click', () => {
                    playCard(index);
                });
            }
            
            playerHandEl.appendChild(cardEl);
        });
        
        // Aktualisiere den Pass-Counter
        passCountEl.textContent = passCount;
        
        // Aktiviere/Deaktiviere Buttons je nach Spielzustand
        updateActionButtons();
    }
    
    /**
     * Aktualisiert die Aktions-Buttons basierend auf dem Spielzustand
     */
    function updateActionButtons() {
        const isCurrentPlayer = currentPlayerUsername === username;
        const canPass = passCount < 3; // Immer erlaubt wenn noch Pässe übrig
        const canSurrender = !canPlayerPlayCards(board, hand) && passCount >= 3;
        
        passButton.disabled = !isCurrentPlayer || !canPass || !gameActive || gameOver;
        surrenderButton.disabled = !isCurrentPlayer || !canSurrender || !gameActive || gameOver;
    }
    
    /**
     * Aktualisiert das Spielbrett
     */
    function renderBoard() {
        // Pik-Karten
        renderSuit(spadesCardsEl, 'spades', board.spades);
        
        // Kreuz-Karten
        renderSuit(clubsCardsEl, 'clubs', board.clubs);
        
        // Herz-Karten
        renderSuit(heartsCardsEl, 'hearts', board.hearts);
        
        // Karo-Karten
        renderSuit(diamondsCardsEl, 'diamonds', board.diamonds);
    }
    
    /**
     * Rendert die Karten einer Farbe
     */
    function renderSuit(container, suit, values) {
        container.innerHTML = '';
        
        // Sortiere die Werte
        const sortedValues = [...values].sort((a, b) => a - b);
        
        // Erstelle für jeden Wert eine Karte
        sortedValues.forEach(value => {
            const cardEl = document.createElement('div');
            cardEl.className = 'board-card';
            
            // Kartenbild vom CDN laden
            const cardValue = getCardValueName(value);
            const cardImageUrl = getCdnUrl(`/games/kartendomino/${cardValue}_of_${suit}.png`);
            cardEl.style.backgroundImage = `url('${cardImageUrl}')`;
            
            container.appendChild(cardEl);
        });
    }
    
    /**
     * Aktualisiert die Gegner-Anzeige
     */
    function renderOpponents() {
        // Verstecken aller Gegner
        opponents.forEach(opponent => {
            opponent.el.style.display = 'none';
        });
        
        // Gegner-Information aktualisieren
        let opponentIndex = 0;
        
        players.forEach((player, index) => {
            if (index === playerIndex) return; // Eigener Spieler
            
            if (opponentIndex < opponents.length) {
                const opponent = opponents[opponentIndex];
                opponent.el.style.display = 'flex';
                opponent.nameEl.textContent = player.username;
                
                // Karten rendern (nur Rückseiten)
                renderOpponentCards(opponent.cardsEl, player.cardsLeft || 12);
                
                // Pass-Zähler (falls bekannt)
                if (player.passCount !== undefined) {
                    opponent.passCountEl.textContent = i18n.t('sevens.passCountShort') + ': ' + player.passCount + '/3';
                } else {
                    opponent.passCountEl.textContent = '';
                }
                
                // Markieren, wenn dieser Spieler dran ist
                if (player.username === currentPlayerUsername) {
                    opponent.el.classList.add('active-player');
                } else {
                    opponent.el.classList.remove('active-player');
                }
                
                opponentIndex++;
            }
        });
    }
    
    /**
     * Rendert die Karten eines Gegners (nur Rückseiten)
     */
    function renderOpponentCards(container, cardCount) {
        container.innerHTML = '';
        
        for (let i = 0; i < cardCount; i++) {
            const cardEl = document.createElement('div');
            cardEl.className = 'opponent-card';
            container.appendChild(cardEl);
        }
    }
    
    /**
     * Aktualisiert die Spielerliste
     */
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
                playerNameText += ` (${i18n.t('sevens.host')})`;
            }
            if (player.username === username) {
                playerNameText += ' (Du)';
            }
            if (player.isBot) {
                playerNameText += ` (${i18n.t('sevens.bot')})`;
            }
            
            playerName.textContent = playerNameText;
            
            playerDiv.appendChild(playerColorDiv);
            playerDiv.appendChild(playerName);
            playerListEl.appendChild(playerDiv);
            
            if (player.username === username && player.isHost) {
                isHost = true;
                if (!gameActive && players.length > 0) {
                    startGameContainer.style.display = 'block';
                } else {
                    startGameContainer.style.display = 'none';
                }
                gameControls.style.display = isHost && gameOver ? 'block' : 'none';
            }
        });
    }
    
    /**
     * Aktualisiert den Spielstatus-Text
     */
    function updateGameStatus() {
        if (!gameActive && !gameOver) {
            gameStatusEl.textContent = i18n.t('sevens.waitingForPlayers');
            gameStatusEl.className = 'game-status';
            return;
        }
        
        if (gameOver) {
            return;
        }
        
        if (currentPlayerUsername === username) {
            gameStatusEl.textContent = i18n.t('sevens.yourTurn');
            gameStatusEl.className = 'game-status your-turn';
        } else {
            const currentPlayer = players.find(p => p.username === currentPlayerUsername);
            if (currentPlayer) {
                gameStatusEl.setAttribute('data-i18n', 'sevens.otherTurn');
                gameStatusEl.setAttribute('data-i18n-params', JSON.stringify({ player: currentPlayerUsername }));
                gameStatusEl.textContent = i18n.replaceParams(i18n.t('sevens.otherTurn'), { player: currentPlayerUsername });
                gameStatusEl.className = 'game-status not-your-turn';
            }
        }
    }
    
    /**
     * Aktualisiert die Verbindungsstatus-Anzeige
     */
    function updateConnectionStatus(isDisconnected) {
        connectionStatusEl.style.display = isDisconnected ? 'block' : 'none';
    }
    
    /**
     * Konvertiert einen Kartenwert in einen Namen
     */
    function getCardValueName(value) {
        switch (value) {
            case 1: return 'ace';
            case 11: return 'jack';
            case 12: return 'queen';
            case 13: return 'king';
            default: return value.toString();
        }
    }
    
    /**
     * Prüft, ob eine Karte spielbar ist
     */
    function isCardPlayable(board, card) {
        const { suit, value } = card;
        const suitValues = board[suit];
        
        return suitValues.includes(value - 1) || suitValues.includes(value + 1);
    }
    
    /**
     * Prüft, ob der Spieler Karten spielen kann
     */
    function canPlayerPlayCards(board, hand) {
        return hand.some(card => isCardPlayable(board, card));
    }
    
    /**
     * Spielt eine Karte
     */
    function playCard(cardIndex) {
        if (gameActive && currentPlayerUsername === username && !gameOver) {
            gameSocket.socket.emit('makeMove', {
                roomCode: roomCode,
                cardIndex: cardIndex
            });
        }
    }
    
    /**
     * Passt (kein Zug)
     */
    function pass() {
        if (gameActive && currentPlayerUsername === username && !gameOver) {
            gameSocket.socket.emit('makeMove', {
                roomCode: roomCode,
                pass: true
            });
        }
    }
    
    /**
     * Gibt auf (nach 3x Passen)
     */
    function surrender() {
        if (gameActive && currentPlayerUsername === username && !gameOver) {
            gameSocket.socket.emit('makeMove', {
                roomCode: roomCode,
                surrender: true
            });
        }
    }
    
    /**
     * Zeigt das Spielende-Modal an
     */
    function showGameOverModal(data) {
        const { winner, ranking } = data;
        
        // Gewinner-Nachricht
        if (winner === username) {
            winnerMessageEl.textContent = i18n.t('sevens.youWon');
        } else {
            winnerMessageEl.textContent = i18n.replaceParams(i18n.t('sevens.otherWon'), { player: winner });
        }
        
        // Rangliste
        rankingListEl.innerHTML = '';
        
        ranking.forEach((player, index) => {
            const rankingItem = document.createElement('div');
            rankingItem.className = 'ranking-item';
            if (player.username === winner) {
                rankingItem.classList.add('winner');
            }
            
            const playerName = document.createElement('span');
            let playerNameText = `${index + 1}. ${player.username}`;
            
            if (player.username === username) {
                playerNameText += ' (Du)';
            }
            if (player.isBot) {
                playerNameText += ` (${i18n.t('sevens.bot')})`;
            }
            
            playerName.textContent = playerNameText;
            
            const cardsLeft = document.createElement('span');
            cardsLeft.textContent = `${player.cardsLeft} ${i18n.t('sevens.cardsLeft')}`;
            
            rankingItem.appendChild(playerName);
            rankingItem.appendChild(cardsLeft);
            rankingListEl.appendChild(rankingItem);
        });
        
        // Modal anzeigen
        gameOverModal.style.display = 'block';
        
        // Host-Controls anzeigen
        if (isHost) {
            gameControls.style.display = 'block';
        }
    }
    
    /**
     * Internationalisierungs-Handler
     */
    i18n.onLoaded(() => {
        i18n.translatePage();
        updateGameStatus();
    });
    
    // Event-Listener
    backButton.addEventListener('click', () => {
        gameSocket.leaveRoom(roomCode);
        window.location.href = '/';
    });
    
    restartButton.addEventListener('click', () => {
        if (isHost) {
            gameSocket.restartGame(roomCode);
            gameOverModal.style.display = 'none';
        }
    });
    
    startGameButton.addEventListener('click', () => {
        if (isHost) {
            gameSocket.socket.emit('startGame', {
                roomCode: roomCode
            });
        }
    });
    
    passButton.addEventListener('click', pass);
    surrenderButton.addEventListener('click', surrender);
    
    closeModalButton.addEventListener('click', () => {
        gameOverModal.style.display = 'none';
    });
    
    // Socket-Event-Handler
    gameSocket.on('connect', () => {
        gameSocket.joinRoom(roomCode, username, userColor);
    });
    
    gameSocket.on('playerJoined', (data) => {
        players = data.players;
        
        updateConnectionStatus(false);
        updatePlayerList(players);
        updateGameStatus();
    });
    
    gameSocket.on('playerLeft', (data) => {
        players = data.players;
        
        updatePlayerList(players);
        updateGameStatus();
    });
    
    gameSocket.on('playerDisconnected', (data) => {
        updateConnectionStatus(true);
    });
    
    gameSocket.on('playerReconnected', (data) => {
        updateConnectionStatus(false);
    });
    
    gameSocket.on('gameStarted', (data) => {
        gameActive = true;
        gameOver = false;
        gameTableEl.style.display = 'flex';
        startGameContainer.style.display = 'none';
        
        players = data.players;
        currentPlayerUsername = data.currentPlayer;
        board = data.board;
        
        // Karten initial rendern
        renderBoard();
        renderOpponents();
        updatePlayerList(players);
        updateGameStatus();
    });
    
    gameSocket.on('handDealt', (data) => {
        hand = data.hand;
        playerIndex = data.playerIndex;
        renderPlayerHand();
    });
    
    gameSocket.on('moveUpdate', (data) => {
        currentPlayerUsername = data.nextPlayer;
        board = data.board;
        
        if (data.type === 'pass' && data.player === username) {
            passCount = data.passCount;
        } else if (data.type === 'play' && data.player === username) {
            // Entferne die gespielte Karte aus der Hand
            const playedCard = data.card;
            hand = hand.filter(card => 
                !(card.suit === playedCard.suit && card.value === playedCard.value)
            );
        }
        
        renderBoard();
        renderPlayerHand();
        renderOpponents();
        updatePlayerList(players);
        updateGameStatus();
        
        // Audio-Feedback für verschiedene Zugtypen
        if (data.type === 'play') {
            // Kartenspiel-Geräusch
            const audio = new Audio(getCdnUrl('/games/kartendomino/sounds/card-play.mp3'));
            audio.volume = 0.3;
            audio.play().catch(e => console.error('Audio konnte nicht abgespielt werden:', e));
            
            // Aktualisiere die Karten-Anzahl dieses Spielers
            const playerObj = players.find(p => p.username === data.player);
            if (playerObj) {
                playerObj.cardsLeft = data.remainingCards;
            }
        } else if (data.type === 'pass') {
            // Pass-Geräusch
            const audio = new Audio(getCdnUrl('/games/kartendomino/sounds/pass.mp3'));
            audio.volume = 0.3;
            audio.play().catch(e => console.error('Audio konnte nicht abgespielt werden:', e));
            
            // Aktualisiere den Pass-Zähler dieses Spielers
            const playerObj = players.find(p => p.username === data.player);
            if (playerObj) {
                playerObj.passCount = data.passCount;
            }
        }
    });
    
    gameSocket.on('gameOver', (data) => {
        gameActive = false;
        gameOver = true;
        
        board = data.board;
        renderBoard();
        
        updateGameStatus();
        showGameOverModal(data);
    });
    
    gameSocket.on('gameRestarted', (data) => {
        gameActive = false;
        gameOver = false;
        gameTableEl.style.display = 'none';
        hand = [];
        passCount = 0;
        surrendered = false;
        board = {
            spades: [7],
            clubs: [7],
            hearts: [7],
            diamonds: [7]
        };
        
        players = data.players;
        
        renderBoard();
        renderPlayerHand();
        renderOpponents();
        updatePlayerList(players);
        updateGameStatus();
        
        gameControls.style.display = 'none';
        startGameContainer.style.display = isHost ? 'block' : 'none';
    });
    
    gameSocket.on('gameState', (data) => {
        gameActive = true;
        gameTableEl.style.display = 'flex';
        
        players = data.players;
        currentPlayerUsername = data.currentPlayer;
        board = data.board;
        hand = data.hand;
        passCount = data.passCount;
        surrendered = data.surrendered;
        playerIndex = data.playerIndex;
        
        renderBoard();
        renderPlayerHand();
        renderOpponents();
        updatePlayerList(players);
        updateGameStatus();
    });
    
    gameSocket.on('joinError', (error) => {
        alert(error);
        window.location.href = '/';
    });
    
    // Initialisieren
    updateGameStatus();
    
    // Spielstand anfragen, falls der Client bereits verbunden ist
    if (gameSocket.isConnected()) {
        gameSocket.socket.emit('requestGameState', { roomCode });
    }
});