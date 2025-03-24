document.addEventListener('DOMContentLoaded', function () {
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

    const spadesCardsEl = document.getElementById('spades-cards');
    const clubsCardsEl = document.getElementById('clubs-cards');
    const heartsCardsEl = document.getElementById('hearts-cards');
    const diamondsCardsEl = document.getElementById('diamonds-cards');

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
    let finishedOrder = [];

    usernameDisplayEl.textContent = username;
    userColorDisplayEl.style.backgroundColor = userColor;
    roomCodeEl.textContent = roomCode;
    gameTableEl.style.display = 'none';
    passButton.disabled = true;
    surrenderButton.disabled = true;
    surrenderButton.style.display = 'none';

    renderBoard();

    function renderPlayerHand() {
        playerHandEl.innerHTML = '';

        hand.forEach((card, index) => {
            const cardEl = document.createElement('div');
            cardEl.className = 'card';

            const isPlayable = isCardPlayable(board, card);
            if (isPlayable) {
                cardEl.classList.add('playable');
            } else {
                cardEl.classList.add('not-playable');
            }

            const cardValue = getCardValueName(card.value);
            const cardSuit = card.suit;
            const cardImageUrl = getCdnUrl(`/games/kartendomino/${cardValue}_of_${cardSuit}.png`);
            cardEl.style.backgroundImage = `url('${cardImageUrl}')`;

            if (isPlayable && currentPlayerUsername === username && gameActive && !gameOver) {
                cardEl.addEventListener('click', () => {
                    playCard(index);
                });
            }

            playerHandEl.appendChild(cardEl);
        });

        passCountEl.textContent = passCount;

        updateActionButtons();
    }

    function updateActionButtons() {
        const isCurrentPlayer = currentPlayerUsername === username;
        const canPass = passCount < 3;
        const canSurrender = !canPlayerPlayCards(board, hand) && passCount >= 3;

        if (canSurrender && isCurrentPlayer && gameActive && !gameOver) {
            passButton.style.display = 'none';
            surrenderButton.style.display = 'inline-block';
            surrenderButton.disabled = false;
        } else {
            passButton.style.display = 'inline-block';
            surrenderButton.style.display = 'none';
            passButton.disabled = !isCurrentPlayer || !canPass || !gameActive || gameOver;
        }
    }

    function renderBoard() {

        renderSuit(spadesCardsEl, 'spades', board.spades);

        renderSuit(clubsCardsEl, 'clubs', board.clubs);

        renderSuit(heartsCardsEl, 'hearts', board.hearts);

        renderSuit(diamondsCardsEl, 'diamonds', board.diamonds);
    }

    function renderSuit(container, suit, values) {
        container.innerHTML = '';

        for (let i = 1; i <= 13; i++) {
            const cardPlaceholder = document.createElement('div');
            cardPlaceholder.className = 'card-placeholder';
            cardPlaceholder.dataset.value = i;

            if (values.includes(i)) {
                const cardEl = document.createElement('div');
                cardEl.className = 'board-card';

                const cardValue = getCardValueName(i);
                const cardImageUrl = getCdnUrl(`/games/kartendomino/${cardValue}_of_${suit}.png`);
                cardEl.style.backgroundImage = `url('${cardImageUrl}')`;

                cardPlaceholder.appendChild(cardEl);
            }

            container.appendChild(cardPlaceholder);
        }
    }

    function renderOpponents() {

        opponents.forEach(opponent => {
            opponent.el.style.display = 'none';
        });

        const sortedPlayers = [...players];
        if (playerIndex !== -1) {

            const otherPlayers = sortedPlayers.slice(0, playerIndex).concat(sortedPlayers.slice(playerIndex + 1));

            const positions = ['left', 'top', 'right'];

            for (let i = 0; i < otherPlayers.length && i < positions.length; i++) {
                const position = positions[i];
                const opponent = opponents.find(op => op.el.id === `opponent-${position}`);
                const player = otherPlayers[i];

                if (opponent && player) {
                    opponent.el.style.display = 'flex';
                    opponent.nameEl.textContent = player.username;

                    const cardsToRender = finishedOrder.includes(player.username) ? 0 : (player.cardsLeft || 12);
                    renderOpponentCards(opponent.cardsEl, cardsToRender);

                    if (player.passCount !== undefined) {
                        opponent.passCountEl.textContent = i18n.t('sevens.passCountShort') + ': ' + player.passCount + '/3';
                    } else {
                        opponent.passCountEl.textContent = '';
                    }

                    if (finishedOrder.includes(player.username)) {
                        const rank = finishedOrder.indexOf(player.username);
                        opponent.nameEl.textContent = `${player.username} (#${rank + 1})`;
                        if (opponent.passCountEl) {
                            opponent.passCountEl.textContent = '';
                        }
                    }

                    if (player.username === currentPlayerUsername) {
                        opponent.el.classList.add('active-player');
                    } else {
                        opponent.el.classList.remove('active-player');
                    }
                }
            }
        } else {

            let opponentIndex = 0;

            players.forEach((player, index) => {
                if (player.username !== username && opponentIndex < opponents.length) {
                    const opponent = opponents[opponentIndex];
                    opponent.el.style.display = 'flex';
                    opponent.nameEl.textContent = player.username;

                    const cardsToRender = finishedOrder.includes(player.username) ? 0 : (player.cardsLeft || 12);
                    renderOpponentCards(opponent.cardsEl, cardsToRender);

                    if (player.passCount !== undefined) {
                        opponent.passCountEl.textContent = i18n.t('sevens.passCountShort') + ': ' + player.passCount + '/3';
                    } else {
                        opponent.passCountEl.textContent = '';
                    }

                    if (finishedOrder.includes(player.username)) {
                        const rank = finishedOrder.indexOf(player.username);
                        opponent.nameEl.textContent = `${player.username} (#${rank + 1})`;
                        if (opponent.passCountEl) {
                            opponent.passCountEl.textContent = '';
                        }
                    }

                    if (player.username === currentPlayerUsername) {
                        opponent.el.classList.add('active-player');
                    } else {
                        opponent.el.classList.remove('active-player');
                    }

                    opponentIndex++;
                }
            });
        }
    }

    function renderOpponentCards(container, cardCount) {
        container.innerHTML = '';

        for (let i = 0; i < cardCount; i++) {
            const cardEl = document.createElement('div');
            cardEl.className = 'opponent-card';
            container.appendChild(cardEl);
        }
    }

    function updatePlayerList(playersList) {
        playerListEl.innerHTML = '';

        playersList.forEach(player => {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'player';
            if (player.username === currentPlayerUsername) {
                playerDiv.classList.add('active-player');
            }

            if (finishedOrder.includes(player.username)) {
                playerDiv.classList.add('finished-player');
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

            if (finishedOrder.includes(player.username)) {
                const rank = finishedOrder.indexOf(player.username);
                playerNameText += ` (#${rank + 1})`;
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
                gameControls.style.display = (isHost && gameOver) ? 'block' : 'none';
            }
        });
    }

    function updateGameStatus() {
        if (!gameActive && !gameOver) {
            gameStatusEl.textContent = i18n.t('sevens.waitingForPlayers');
            gameStatusEl.className = 'game-status';
            return;
        }

        if (gameOver) {
            return;
        }

        if (finishedOrder.includes(username)) {
            const rank = finishedOrder.indexOf(username);
            gameStatusEl.textContent = i18n.replaceParams(i18n.t('sevens.finishedWatching'), { rank: rank + 1 });
            gameStatusEl.className = 'game-status finished-status';
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

    function updateConnectionStatus(isDisconnected) {
        connectionStatusEl.style.display = isDisconnected ? 'block' : 'none';
    }

    function getCardValueName(value) {
        switch (value) {
            case 1: return 'ace';
            case 11: return 'jack';
            case 12: return 'queen';
            case 13: return 'king';
            default: return value.toString();
        }
    }

    function isCardPlayable(board, card) {
        const { suit, value } = card;
        const suitValues = board[suit];

        const isAdjacent = suitValues.includes(value - 1) || suitValues.includes(value + 1);

        if (!isAdjacent) {
            return false;
        }

        if (finishedOrder.length > 0) {
            const middleValue = 7;

            if (value < middleValue) {

                for (let i = value + 1; i < middleValue; i++) {
                    if (!suitValues.includes(i)) {
                        return false;
                    }
                }
            }

            else if (value > middleValue) {

                for (let i = middleValue + 1; i < value; i++) {
                    if (!suitValues.includes(i)) {
                        return false;
                    }
                }
            }
        }

        return true;
    }

    function canPlayerPlayCards(board, hand) {
        return hand.some(card => isCardPlayable(board, card));
    }

    function playCard(cardIndex) {
        if (gameActive && currentPlayerUsername === username && !gameOver) {
            gameSocket.socket.emit('makeMove', {
                roomCode: roomCode,
                cardIndex: cardIndex
            });
        }
    }

    function pass() {
        if (gameActive && currentPlayerUsername === username && !gameOver) {
            gameSocket.socket.emit('makeMove', {
                roomCode: roomCode,
                pass: true
            });
        }
    }

    function surrender() {
        if (gameActive && currentPlayerUsername === username && !gameOver) {
            gameSocket.socket.emit('makeMove', {
                roomCode: roomCode,
                surrender: true
            });
        }
    }

    function placeMultipleCards(placedCards) {
        if (!placedCards || !placedCards.length) return;

        console.log("Platziere Karten:", placedCards);

        placedCards.forEach(card => {
            if (!board[card.suit].includes(card.value)) {
                board[card.suit].push(card.value);
            }
        });

        for (const suit in board) {
            board[suit].sort((a, b) => a - b);
        }

        renderBoard();
    }

    function showGameOverModal(data) {
        const { winner, ranking, finishedOrder } = data;

        if (winner === username) {
            winnerMessageEl.textContent = i18n.t('sevens.youWon');
        } else {
            winnerMessageEl.textContent = i18n.replaceParams(i18n.t('sevens.otherWon'), { player: winner });
        }

        rankingListEl.innerHTML = '';

        for (let i = 0; i < finishedOrder.length; i++) {
            const playerUsername = finishedOrder[i];
            const playerInfo = ranking.find(p => p.username === playerUsername);

            if (playerInfo) {
                const rankingItem = document.createElement('div');
                rankingItem.className = 'ranking-item';

                rankingItem.classList.add(`place-${i + 1}`);

                if (i === 0) {
                    rankingItem.classList.add('winner');
                }

                const playerName = document.createElement('span');
                let playerNameText = `${i + 1}. ${playerInfo.username}`;

                if (playerInfo.username === username) {
                    playerNameText += ' (Du)';
                }
                if (playerInfo.isBot) {
                    playerNameText += ` (${i18n.t('sevens.bot')})`;
                }

                playerName.textContent = playerNameText;

                rankingItem.appendChild(playerName);
                rankingListEl.appendChild(rankingItem);
            }
        }

        gameOverModal.style.display = 'block';

        if (isHost) {
            gameControls.style.display = 'block';
        }
    }

    i18n.onLoaded(() => {
        i18n.translatePage();
        updateGameStatus();
    });

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
        finishedOrder = [];

        players = data.players;
        currentPlayerUsername = data.currentPlayer;
        board = data.board;

        gameTableEl.style.display = 'flex';
        startGameContainer.style.display = 'none';

        renderBoard();
        updatePlayerList(players);
        updateGameStatus();
        renderOpponents();
    });

    gameSocket.on('handDealt', (data) => {
        hand = data.hand;
        playerIndex = data.playerIndex;
        renderPlayerHand();
        renderOpponents();
    });

    gameSocket.on('moveUpdate', (data) => {
        currentPlayerUsername = data.nextPlayer;
        board = data.board;

        if (data.finishedOrder) {
            finishedOrder = data.finishedOrder;
        }

        if (data.type === 'pass' && data.player === username) {
            passCount = data.passCount;
        } else if (data.type === 'play' && data.player === username) {

            const playedCard = data.card;
            hand = hand.filter(card =>
                !(card.suit === playedCard.suit && card.value === playedCard.value)
            );
        } else if (data.type === 'surrender') {

            if (data.player === username) {
                surrendered = true;
                hand = [];
            }

            if (data.placedCards && data.placedCards.length > 0) {
                placeMultipleCards(data.placedCards);
            }

            const playerObj = players.find(p => p.username === data.player);
            if (playerObj) {
                playerObj.cardsLeft = data.remainingCards;

                if (data.rank !== undefined) {
                    updateFinishedPlayerInfo(data.player, data.rank);
                }
            }
        }

        renderBoard();
        renderPlayerHand();

        if (data.type === 'play') {
            const playerObj = players.find(p => p.username === data.player);
            if (playerObj) {
                playerObj.cardsLeft = data.remainingCards;

                if (data.remainingCards === 0 && !finishedOrder.includes(data.player)) {
                    if (data.rank !== undefined) {
                        updateFinishedPlayerInfo(data.player, data.rank);
                    }
                }
            }
        } else if (data.type === 'pass') {
            const playerObj = players.find(p => p.username === data.player);
            if (playerObj) {
                playerObj.passCount = data.passCount;
            }
        }

        renderOpponents();
        updatePlayerList(players);
        updateGameStatus();

        if (data.type === 'play') {

            const audio = new Audio(getCdnUrl('/games/kartendomino/sounds/card-play.mp3'));
            audio.volume = 0.3;
            audio.play().catch(e => console.error('Audio konnte nicht abgespielt werden:', e));
        } else if (data.type === 'pass') {

            const audio = new Audio(getCdnUrl('/games/kartendomino/sounds/pass.mp3'));
            audio.volume = 0.3;
            audio.play().catch(e => console.error('Audio konnte nicht abgespielt werden:', e));
        } else if (data.type === 'surrender') {

            const audio = new Audio(getCdnUrl('/games/kartendomino/sounds/card-play.mp3'));
            audio.volume = 0.3;
            audio.play().catch(e => console.error('Audio konnte nicht abgespielt werden:', e));
        }
    });

    function updateFinishedPlayerInfo(playerUsername, rank) {

        finishedOrder = finishedOrder.filter(p => p !== playerUsername);

        while (finishedOrder.length <= rank) {
            finishedOrder.push(null);
        }

        finishedOrder[rank] = playerUsername;

        finishedOrder = finishedOrder.filter(p => p !== null);

        const playerObj = players.find(p => p.username === playerUsername);
        if (playerObj) {
            playerObj.finished = true;
            playerObj.rank = rank;

            console.log(`Spieler ${playerUsername} hat Rang ${rank} erhalten`, {
                finishedOrder,
                players
            });
        }
    }

    gameSocket.on('gameOver', (data) => {
        gameActive = false;
        gameOver = true;

        board = data.board;

        if (data.finishedOrder) {
            finishedOrder = data.finishedOrder;
        }

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
        finishedOrder = [];
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
        hand = data.hand || [];
        passCount = data.passCount || 0;
        surrendered = data.surrendered || false;
        playerIndex = data.playerIndex;

        if (data.finishedOrder) {
            finishedOrder = data.finishedOrder;
        }

        if (players) {
            players.forEach(player => {
                if (player.finished && player.rank !== undefined && !finishedOrder.includes(player.username)) {
                    updateFinishedPlayerInfo(player.username, player.rank);
                }
            });
        }

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

    updateGameStatus();

    if (gameSocket.isConnected()) {
        gameSocket.socket.emit('requestGameState', { roomCode });
    }
});