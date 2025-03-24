const debug = require('../debug-utils');
const SevensBotHandler = require('./sevens-bot');

const SevensHandler = {

    getMaxPlayers() {
        return 4;
    },

    initializeGameState() {
        const deck = this.createDeck();
        const deckWithoutSevens = deck.filter(card => card.value !== 7);
        const shuffledDeck = this.shuffleDeck(deckWithoutSevens);

        return {
            board: {
                spades: [7],    
                clubs: [7],     
                hearts: [7],    
                diamonds: [7]   
            },
            deck: shuffledDeck,
            playerHands: [],
            passCount: [],
            surrendered: [],
            normalFinishers: [], 
            surrenderedPlayers: [], 
            gameStarted: false,
            moves: 0
        };
    },

    getRandomStartingPlayer(numPlayers) {
        return Math.floor(Math.random() * numPlayers);
    },

    createDeck() {
        const suits = ['spades', 'clubs', 'hearts', 'diamonds'];
        const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]; 

        const deck = [];
        for (const suit of suits) {
            for (const value of values) {
                deck.push({ suit, value });
            }
        }

        return deck;
    },

    shuffleDeck(deck) {
        const newDeck = [...deck];
        for (let i = newDeck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
        }
        return newDeck;
    },

    sortCards(cards) {
        const suitOrder = { 'spades': 0, 'clubs': 1, 'hearts': 2, 'diamonds': 3 };
        return [...cards].sort((a, b) => {
            if (suitOrder[a.suit] !== suitOrder[b.suit]) {
                return suitOrder[a.suit] - suitOrder[b.suit];
            }
            return a.value - b.value;
        });
    },

    dealCards(gameState, numPlayers) {
        const playerHands = [];
        for (let i = 0; i < numPlayers; i++) {
            const hand = [];
            for (let j = 0; j < 12; j++) {
                if (gameState.deck.length > 0) {
                    hand.push(gameState.deck.pop());
                }
            }
            playerHands.push(this.sortCards(hand));
        }
        return playerHands;
    },

    isCardPlayable(board, card) {
        const { suit, value } = card;
        const suitValues = board[suit];
        return suitValues.includes(value - 1) || suitValues.includes(value + 1);
    },

    isCardPlayableWithSequenceRule(board, card) {
        const { suit, value } = card;
        const suitValues = board[suit];

        const isAdjacent = suitValues.includes(value - 1) || suitValues.includes(value + 1);
        if (!isAdjacent) {
            return false;
        }

        const middleValue = 7;

        if (value < middleValue) {

            for (let i = value + 1; i < middleValue; i++) {
                if (!suitValues.includes(i)) {
                    return false;
                }
            }
        } else if (value > middleValue) {

            for (let i = middleValue + 1; i < value; i++) {
                if (!suitValues.includes(i)) {
                    return false;
                }
            }
        }

        return true;
    },

    placePlayableCardsForSurrender(board, cards) {
        let placedCards = [];
        let remainingCards = [...cards];
        let cardWasPlaced;

        do {
            cardWasPlaced = false;

            for (let i = remainingCards.length - 1; i >= 0; i--) {
                const card = remainingCards[i];

                if (this.isCardPlayable(board, card)) {

                    board[card.suit].push(card.value);

                    const removedCard = remainingCards.splice(i, 1)[0];
                    placedCards.push(removedCard);
                    cardWasPlaced = true;
                }
            }

            for (const suit in board) {
                board[suit].sort((a, b) => a - b);
            }

        } while (cardWasPlaced && remainingCards.length > 0);

        debug.log('Platzierte Karten bei Aufgabe:', {
            placedCount: placedCards.length, 
            placedCards,
            remainingCount: remainingCards.length,
            remainingCards
        });

        return {
            placedCards,
            remainingCards
        };
    },

    canPlayerPlayCards(board, hand) {
        return hand.some(card => this.isCardPlayableWithSequenceRule(board, card));
    },

    onPlayerJoined(io, roomCode, room, username) {
        debug.log('Spieler tritt Sevens-Raum bei:', { roomCode, username });

        if (room.players.length === 4 && !room.gameState.gameStarted) {
            this.startGame(io, roomCode, room);
        }
    },

    startGame(io, roomCode, room) {
        if (room.gameState.gameStarted) {
            return; 
        }

        const humanPlayers = room.players.length;
        const totalPlayers = 4; 

        const botsNeeded = totalPlayers - humanPlayers;
        for (let i = 0; i < botsNeeded; i++) {
            const botName = `Bot ${i + 1}`;
            room.players.push({
                id: `bot-${i}`,
                username: botName,
                color: this.getRandomBotColor(room.players),
                isHost: false,
                connected: true,
                isBot: true
            });
        }

        room.gameState.playerHands = this.dealCards(room.gameState, totalPlayers);
        room.gameState.passCount = Array(totalPlayers).fill(0);
        room.gameState.surrendered = Array(totalPlayers).fill(false);
        room.gameState.normalFinishers = [];
        room.gameState.surrenderedPlayers = [];
        room.gameState.gameStarted = true;

        room.currentTurn = this.getRandomStartingPlayer(totalPlayers);

        io.to(roomCode).emit('gameStarted', {
            players: room.players.map(p => ({
                username: p.username,
                color: p.color,
                isHost: p.isHost,
                isBot: p.isBot || false
            })),
            currentPlayer: room.players[room.currentTurn].username,
            board: room.gameState.board,
            hand: room.gameState.playerHands[0] 
        });

        room.players.forEach((player, index) => {
            if (!player.isBot) {
                const socket = Array.from(io.sockets.sockets.values())
                    .find(s => s.rooms.has(roomCode) && s.id === player.id);

                if (socket) {
                    socket.emit('handDealt', {
                        hand: room.gameState.playerHands[index],
                        playerIndex: index
                    });
                }
            }
        });

        if (room.players[room.currentTurn].isBot) {
            this.handleBotTurn(io, roomCode, room);
        }
    },

    getRandomBotColor(existingPlayers) {
        const availableColors = [
            '#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22'
        ];

        const usedColors = existingPlayers.map(p => p.color);
        const availableOptions = availableColors.filter(color => !usedColors.includes(color));

        if (availableOptions.length > 0) {
            return availableOptions[0];
        }

        return availableColors[0];
    },

    onPlayerReconnected(io, roomCode, room, username) {
        const playerIndex = room.players.findIndex(p => p.username === username && !p.isBot);

        if (playerIndex !== -1 && room.gameState.gameStarted) {
            const socket = Array.from(io.sockets.sockets.values())
                .find(s => s.rooms.has(roomCode) && 
                      room.players.some(p => p.id === s.id && p.username === username));

            if (socket) {
                debug.log('Sende aktuellen Spielstand an wiederverbundenen Spieler:', { 
                    roomCode, 
                    username
                });

                const finishedOrder = [
                    ...room.gameState.normalFinishers,
                    ...room.gameState.surrenderedPlayers
                ];

                socket.emit('gameState', {
                    board: room.gameState.board,
                    hand: room.gameState.playerHands[playerIndex],
                    passCount: room.gameState.passCount[playerIndex],
                    surrendered: room.gameState.surrendered[playerIndex],
                    playerIndex: playerIndex,
                    currentPlayer: room.players[room.currentTurn].username,
                    players: room.players.map(p => ({
                        username: p.username,
                        color: p.color,
                        isHost: p.isHost,
                        isBot: p.isBot || false,
                        cardsLeft: p.isBot ? room.gameState.playerHands[room.players.indexOf(p)].length : null,
                        finished: finishedOrder.includes(p.username),
                        rank: finishedOrder.indexOf(p.username)
                    })),
                    finishedOrder: finishedOrder
                });
            }
        }
    },

    processMove(io, roomCode, room, player, data) {
        if (!room.gameState.gameStarted) {
            debug.log('Versuch, einen Zug zu machen, obwohl das Spiel nicht gestartet ist:', {
                roomCode,
                username: player.username
            });
            return false;
        }

        const playerIndex = room.players.findIndex(p => p.id === player.id);

        if (playerIndex !== room.currentTurn) {
            debug.log('Spieler nicht am Zug:', {
                roomCode,
                username: player.username,
                currentTurn: room.currentTurn
            });
            return false;
        }

        if (data.pass) {
            return this.handlePass(io, roomCode, room, playerIndex);
        }

        if (data.surrender) {
            return this.handleSurrender(io, roomCode, room, playerIndex);
        }

        if (data.cardIndex !== undefined) {
            return this.handleCardPlay(io, roomCode, room, playerIndex, data.cardIndex);
        }

        return false;
    },

    handlePass(io, roomCode, room, playerIndex) {
        if (room.gameState.passCount[playerIndex] >= 3) {
            debug.log('Spieler hat bereits 3 Mal gepasst:', {
                roomCode,
                username: room.players[playerIndex].username
            });
            return false;
        }

        room.gameState.passCount[playerIndex]++;

        debug.log('Spieler passt:', {
            roomCode,
            username: room.players[playerIndex].username,
            passCount: room.gameState.passCount[playerIndex]
        });

        this.moveToNextPlayer(io, roomCode, room, {
            type: 'pass',
            player: room.players[playerIndex].username,
            passCount: room.gameState.passCount[playerIndex]
        });

        return true;
    },

    handleSurrender(io, roomCode, room, playerIndex) {
        if (room.gameState.passCount[playerIndex] < 3) {
            debug.log('Spieler versucht aufzugeben, obwohl er weniger als 3 Mal gepasst hat:', {
                roomCode,
                username: room.players[playerIndex].username,
                passCount: room.gameState.passCount[playerIndex]
            });
            return false;
        }

        const hand = room.gameState.playerHands[playerIndex];
        if (this.canPlayerPlayCards(room.gameState.board, hand)) {
            debug.log('Spieler könnte Karten spielen, aber will aufgeben:', {
                roomCode,
                username: room.players[playerIndex].username
            });
            return false;
        }

        room.gameState.surrendered[playerIndex] = true;

        debug.log('Spieler gibt auf:', {
            roomCode,
            username: room.players[playerIndex].username
        });

        const { placedCards, remainingCards } = this.placePlayableCardsForSurrender(
            room.gameState.board, 
            hand
        );

        room.gameState.playerHands[playerIndex] = remainingCards;

        const playerUsername = room.players[playerIndex].username;

        if (!room.gameState.surrenderedPlayers.includes(playerUsername)) {
            room.gameState.surrenderedPlayers.push(playerUsername);
        }

        const finishedOrder = [
            ...room.gameState.normalFinishers,
            ...room.gameState.surrenderedPlayers
        ];

        const rank = finishedOrder.indexOf(playerUsername);

        debug.log('Spieler aufgegeben, Rangzuweisung:', {
            username: playerUsername,
            rank: rank,
            finishedOrder: finishedOrder,
            remainingCardsCount: remainingCards.length,
            placedCardsCount: placedCards.length
        });

        if (finishedOrder.length >= 3) {
            this.assignLastPlace(io, roomCode, room);
            return true;
        }

        this.moveToNextPlayer(io, roomCode, room, {
            type: 'surrender',
            player: playerUsername,
            remainingCards: remainingCards.length,
            playableCardsPlaced: placedCards.length,
            placedCards: placedCards,
            rank: rank,
            finishedOrder: finishedOrder
        });

        return true;
    },

    handleCardPlay(io, roomCode, room, playerIndex, cardIndex) {
        const hand = room.gameState.playerHands[playerIndex];

        if (cardIndex < 0 || cardIndex >= hand.length) {
            debug.log('Ungültiger Kartenindex:', {
                roomCode,
                username: room.players[playerIndex].username,
                cardIndex
            });
            return false;
        }

        const card = hand[cardIndex];

        if (!this.isCardPlayableWithSequenceRule(room.gameState.board, card)) {
            debug.log('Nicht spielbare Karte:', {
                roomCode,
                username: room.players[playerIndex].username,
                card
            });
            return false;
        }

        const playedCard = hand.splice(cardIndex, 1)[0];
        room.gameState.board[playedCard.suit].push(playedCard.value);
        room.gameState.board[playedCard.suit].sort((a, b) => a - b);

        debug.log('Spieler spielt Karte:', {
            roomCode,
            username: room.players[playerIndex].username,
            card: playedCard
        });

        if (hand.length === 0) {
            debug.log('Spieler hat alle Karten abgelegt:', {
                roomCode,
                username: room.players[playerIndex].username
            });

            const playerUsername = room.players[playerIndex].username;

            if (!room.gameState.normalFinishers.includes(playerUsername)) {
                room.gameState.normalFinishers.push(playerUsername);
            }

            const finishedOrder = [
                ...room.gameState.normalFinishers,
                ...room.gameState.surrenderedPlayers
            ];

            const finishRank = finishedOrder.indexOf(playerUsername);

            if (finishedOrder.length >= 3) {
                this.assignLastPlace(io, roomCode, room);
                return true;
            }

            this.moveToNextPlayer(io, roomCode, room, {
                type: 'play',
                player: room.players[playerIndex].username,
                card: playedCard,
                remainingCards: hand.length,
                rank: finishRank,
                finishedOrder: finishedOrder
            });

            return true;
        }

        this.moveToNextPlayer(io, roomCode, room, {
            type: 'play',
            player: room.players[playerIndex].username,
            card: playedCard,
            remainingCards: hand.length
        });

        return true;
    },

    assignLastPlace(io, roomCode, room) {

        const finishedOrder = [
            ...room.gameState.normalFinishers,
            ...room.gameState.surrenderedPlayers
        ];

        const activePlayers = room.players.filter(p => 
            !finishedOrder.includes(p.username)
        );

        if (activePlayers.length === 1) {
            const lastPlayer = activePlayers[0];
            const lastPlayerIndex = room.players.findIndex(p => p.username === lastPlayer.username);

            room.gameState.surrenderedPlayers.push(lastPlayer.username);

            const { placedCards, remainingCards } = this.placePlayableCardsForSurrender(
                room.gameState.board, 
                room.gameState.playerHands[lastPlayerIndex]
            );

            room.gameState.playerHands[lastPlayerIndex] = remainingCards;

            debug.log('Letzter Spieler zugewiesen:', {
                username: lastPlayer.username,
                rank: finishedOrder.length,
                remainingCards: remainingCards.length,
                placedCards: placedCards.length
            });
        }

        this.endGame(io, roomCode, room);
    },

    moveToNextPlayer(io, roomCode, room, lastMove) {

        const finishedOrder = [
            ...room.gameState.normalFinishers,
            ...room.gameState.surrenderedPlayers
        ];

        let nextPlayerIndex = (room.currentTurn + 1) % room.players.length;
        let loopCount = 0;

        while (loopCount < room.players.length) {
            if (!finishedOrder.includes(room.players[nextPlayerIndex].username)) {
                break; 
            }
            nextPlayerIndex = (nextPlayerIndex + 1) % room.players.length;
            loopCount++;
        }

        if (loopCount >= room.players.length) {
            debug.log('Alle Spieler sind fertig, beende Spiel:', { roomCode });
            this.endGame(io, roomCode, room);
            return;
        }

        room.currentTurn = nextPlayerIndex;

        if ((lastMove.type === 'surrender' || (lastMove.type === 'play' && lastMove.remainingCards === 0)) 
             && lastMove.rank !== undefined) {
            lastMove.finishedOrder = finishedOrder;
        }

        io.to(roomCode).emit('moveUpdate', {
            ...lastMove,
            nextPlayer: room.players[room.currentTurn].username,
            board: room.gameState.board
        });

        if (room.players[room.currentTurn].isBot) {
            this.handleBotTurn(io, roomCode, room);
        }
    },

    handleBotTurn(io, roomCode, room) {
        const botIndex = room.currentTurn;
        const botHand = room.gameState.playerHands[botIndex];
        const bot = room.players[botIndex];

        setTimeout(() => {
            const botMove = SevensBotHandler.decideBotMove(
                room.gameState.board, 
                botHand, 
                room.gameState.passCount[botIndex]
            );

            if (botMove.type === 'play') {
                this.handleCardPlay(io, roomCode, room, botIndex, botMove.cardIndex);
            } else if (botMove.type === 'pass') {
                this.handlePass(io, roomCode, room, botIndex);
            } else if (botMove.type === 'surrender') {
                this.handleSurrender(io, roomCode, room, botIndex);
            }
        }, 1000);
    },

    endGame(io, roomCode, room) {

        const finishedOrder = [
            ...room.gameState.normalFinishers,
            ...room.gameState.surrenderedPlayers
        ];

        debug.log('Spiel beendet, finishedOrder:', {
            roomCode,
            normalFinishers: room.gameState.normalFinishers,
            surrenderedPlayers: room.gameState.surrenderedPlayers,
            combinedOrder: finishedOrder
        });

        const ranking = room.players.map(player => {
            const rank = finishedOrder.indexOf(player.username);
            const remainingCards = room.gameState.playerHands[room.players.indexOf(player)].length;

            return {
                username: player.username,
                isBot: player.isBot || false,
                cardsLeft: remainingCards,
                rank: rank !== -1 ? rank : finishedOrder.length 
            };
        });

        const winner = finishedOrder.length > 0 ? finishedOrder[0] : null;

        io.to(roomCode).emit('gameOver', {
            winner: winner,
            ranking: ranking,
            board: room.gameState.board,
            finishedOrder: finishedOrder
        });

        room.gameState.gameStarted = false;
    },

    restartGame(io, roomCode, room) {
        debug.log('Spiel wird neu gestartet:', { roomCode });

        const humanPlayers = room.players.filter(p => !p.isBot);
        room.players = humanPlayers;

        room.gameState = this.initializeGameState();

        io.to(roomCode).emit('gameRestarted', {
            players: room.players.map(p => ({
                username: p.username,
                color: p.color,
                isHost: p.isHost
            }))
        });

        return true;
    }
};

module.exports = SevensHandler;