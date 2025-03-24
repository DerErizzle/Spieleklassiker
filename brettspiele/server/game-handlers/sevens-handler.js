const debug = require('../debug-utils');
const SevensBotHandler = require('./sevens-bot');

/**
 * Spiellogik-Handler für "Kartendomino"
 */
const SevensHandler = {
    /**
     * Gibt die maximale Spielerzahl zurück
     */
    getMaxPlayers() {
        return 4;
    },
    
    /**
     * Initialisiert den Spielzustand
     */
    initializeGameState() {
        const deck = this.createDeck();
        
        // Entferne die Siebenen vor dem Mischen
        const deckWithoutSevens = deck.filter(card => card.value !== 7);
        const shuffledDeck = this.shuffleDeck(deckWithoutSevens);
        
        // Spielstatus
        return {
            board: {
                spades: [7],    // 7 of Spades
                clubs: [7],     // 7 of Clubs
                hearts: [7],    // 7 of Hearts
                diamonds: [7]   // 7 of Diamonds
            },
            deck: shuffledDeck,
            playerHands: [],
            passCount: [],
            surrendered: [],
            finishedOrder: [],  // Liste der Reihenfolge, in der Spieler fertig werden
            gameStarted: false,
            moves: 0
        };
    },
    
    /**
     * Wählt zufällig einen Startspieler
     */
    getRandomStartingPlayer(numPlayers) {
        return Math.floor(Math.random() * numPlayers);
    },
    
    /**
     * Erstellt ein komplettes Kartendeck
     */
    createDeck() {
        const suits = ['spades', 'clubs', 'hearts', 'diamonds'];
        const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]; // 1=A, 11=J, 12=Q, 13=K
        
        const deck = [];
        for (const suit of suits) {
            for (const value of values) {
                deck.push({ suit, value });
            }
        }
        
        return deck;
    },
    
    /**
     * Mischt das Kartendeck
     */
    shuffleDeck(deck) {
        const newDeck = [...deck];
        
        for (let i = newDeck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
        }
        
        return newDeck;
    },
    
    /**
     * Sortiert Karten nach Farbe und Wert für die Hand eines Spielers
     * @param {Array} cards - Zu sortierende Karten
     * @returns {Array} - Sortierte Karten
     */
    sortCards(cards) {
        const suitOrder = { 'spades': 0, 'clubs': 1, 'hearts': 2, 'diamonds': 3 };
        
        return [...cards].sort((a, b) => {
            // Zuerst nach Farbe sortieren
            if (suitOrder[a.suit] !== suitOrder[b.suit]) {
                return suitOrder[a.suit] - suitOrder[b.suit];
            }
            // Dann nach Wert sortieren
            return a.value - b.value;
        });
    },
    
    /**
     * Teilt Karten an die Spieler aus
     */
    dealCards(gameState, numPlayers) {
        const playerHands = [];
        
        for (let i = 0; i < numPlayers; i++) {
            const hand = [];
            for (let j = 0; j < 12; j++) {
                if (gameState.deck.length > 0) {
                    hand.push(gameState.deck.pop());
                }
            }
            // Sortiere die Hand nach Farbe und Wert
            playerHands.push(this.sortCards(hand));
        }
        
        return playerHands;
    },
    
    /**
     * Prüft, ob eine Karte spielbar ist
     */
    isCardPlayable(board, card) {
        const { suit, value } = card;
        const suitValues = board[suit];
        
        // Prüfen, ob die Karte direkt neben einem bereits vorhandenen Wert liegt
        return suitValues.includes(value - 1) || suitValues.includes(value + 1);
    },
    
    /**
     * Prüft, ob ein Spieler Karten spielen kann
     */
    canPlayerPlayCards(board, hand) {
        return hand.some(card => this.isCardPlayable(board, card));
    },
    
    /**
     * Wird aufgerufen, wenn ein Spieler einem Raum beitritt
     */
    onPlayerJoined(io, roomCode, room, username) {
        debug.log('Spieler tritt Sevens-Raum bei:', { roomCode, username });
        
        // Wenn 4 menschliche Spieler da sind, starte das Spiel automatisch
        if (room.players.length === 4 && !room.gameState.gameStarted) {
            this.startGame(io, roomCode, room);
        }
    },
    
    /**
     * Startet das Spiel (wird vom Host aufgerufen oder automatisch bei 4 Spielern)
     */
    startGame(io, roomCode, room) {
        if (room.gameState.gameStarted) {
            return; // Spiel bereits gestartet
        }
        
        const humanPlayers = room.players.length;
        const totalPlayers = 4; // Immer 4 Spieler (mit Bots)
        
        // Benötigte Bots hinzufügen
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
        
        // Karten austeilen
        room.gameState.playerHands = this.dealCards(room.gameState, totalPlayers);
        room.gameState.passCount = Array(totalPlayers).fill(0);
        room.gameState.surrendered = Array(totalPlayers).fill(false);
        room.gameState.finishedOrder = []; // Liste der fertig gewordenen Spieler zurücksetzen
        room.gameState.gameStarted = true;
        
        // Zufälligen Startspieler wählen
        room.currentTurn = this.getRandomStartingPlayer(totalPlayers);
        
        // Alle Spieler über den Spielstart informieren
        io.to(roomCode).emit('gameStarted', {
            players: room.players.map(p => ({
                username: p.username,
                color: p.color,
                isHost: p.isHost,
                isBot: p.isBot || false
            })),
            currentPlayer: room.players[room.currentTurn].username,
            board: room.gameState.board,
            hand: room.gameState.playerHands[0] // Nur die Hand des ersten Spielers senden
        });
        
        // Sendet jedem Spieler seine eigene Hand
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
        
        // Prüfen, ob der aktuelle Spieler ein Bot ist
        if (room.players[room.currentTurn].isBot) {
            this.handleBotTurn(io, roomCode, room);
        }
    },
    
    /**
     * Wählt eine zufällige Farbe für einen Bot
     */
    getRandomBotColor(existingPlayers) {
        const availableColors = [
            '#e74c3c', // rot
            '#3498db', // blau
            '#2ecc71', // grün
            '#f1c40f', // gelb
            '#9b59b6', // lila
            '#e67e22'  // orange
        ];
        
        // Entferne bereits verwendete Farben
        const usedColors = existingPlayers.map(p => p.color);
        const availableOptions = availableColors.filter(color => !usedColors.includes(color));
        
        if (availableOptions.length > 0) {
            return availableOptions[0];
        }
        
        // Fallback: Erste verfügbare Farbe
        return availableColors[0];
    },
    
    /**
     * Wird aufgerufen, wenn ein Spieler wiederverbunden ist
     */
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
                
                // Aktuellen Spielstand senden
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
                        cardsLeft: room.gameState.playerHands[room.players.indexOf(p)].length,
                        finished: room.gameState.finishedOrder.includes(p.username),
                        rank: room.gameState.finishedOrder.indexOf(p.username)
                    })),
                    finishedOrder: room.gameState.finishedOrder
                });
            }
        }
    },
    
    /**
     * Verarbeitet einen Spielzug
     */
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
    
    /**
     * Behandelt das Passen eines Spielers
     */
    handlePass(io, roomCode, room, playerIndex) {
        // Prüfen, ob der Spieler noch passen kann
        if (room.gameState.passCount[playerIndex] >= 3) {
            debug.log('Spieler hat bereits 3 Mal gepasst:', {
                roomCode,
                username: room.players[playerIndex].username
            });
            return false;
        }
        
        // Pass-Zähler erhöhen (erlaubt taktisches Passen)
        room.gameState.passCount[playerIndex]++;
        
        debug.log('Spieler passt:', {
            roomCode,
            username: room.players[playerIndex].username,
            passCount: room.gameState.passCount[playerIndex]
        });
        
        // Nächster Spieler ist dran
        this.moveToNextPlayer(io, roomCode, room, {
            type: 'pass',
            player: room.players[playerIndex].username,
            passCount: room.gameState.passCount[playerIndex]
        });
        
        return true;
    },
    
    /**
     * Versucht, eine Karte aus der Hand eines Spielers auf dem Brett zu platzieren
     * Berücksichtigt die spezielle Regel, dass nach Aufgabe eines Spielers alle Karten
     * zwischen 7 und der neuen Karte bereits gelegt sein müssen
     */
    placeCardOnBoard(board, card, hasPlayerSurrendered) {
        const { suit, value } = card;
        const suitValues = board[suit];
        
        // Grundregel: Karte muss zu einer bereits auf dem Tisch liegenden Karte passen
        const isAdjacent = suitValues.includes(value - 1) || suitValues.includes(value + 1);
        
        if (!isAdjacent) {
            return false;
        }
        
        // Wenn jemand bereits aufgegeben hat, muss geprüft werden, ob alle Karten 
        // zwischen 7 und der neuen Karte bereits auf dem Tisch liegen
        if (hasPlayerSurrendered) {
            const middleValue = 7;
            
            // Wenn die Karte kleiner als 7 ist
            if (value < middleValue) {
                // Prüfe alle Karten zwischen der neuen Karte und 7
                for (let i = value + 1; i < middleValue; i++) {
                    if (!suitValues.includes(i)) {
                        return false; // Lücke in der Sequenz gefunden
                    }
                }
            } 
            // Wenn die Karte größer als 7 ist
            else if (value > middleValue) {
                // Prüfe alle Karten zwischen 7 und der neuen Karte
                for (let i = middleValue + 1; i < value; i++) {
                    if (!suitValues.includes(i)) {
                        return false; // Lücke in der Sequenz gefunden
                    }
                }
            }
        }
        
        // Karte auf das Board legen
        board[suit].push(value);
        board[suit].sort((a, b) => a - b);
        return true;
    },
    
    /**
     * Bestimmt alle spielbaren Karten in der gegebenen Hand
     */
    getPlayableCards(board, hand, hasPlayerSurrendered) {
        return hand.filter(card => {
            // Erstelle eine Kopie des Boards, um zu prüfen, ob die Karte spielbar ist
            const boardCopy = JSON.parse(JSON.stringify(board));
            return this.placeCardOnBoard(boardCopy, card, hasPlayerSurrendered);
        });
    },
    
    /**
     * Behandelt die Aufgabe eines Spielers (wenn er 3 Mal gepasst hat und nicht spielen kann)
     */
    handleSurrender(io, roomCode, room, playerIndex) {
        // Prüfen, ob der Spieler aufgeben darf (3 Mal gepasst)
        if (room.gameState.passCount[playerIndex] < 3) {
            debug.log('Spieler versucht aufzugeben, obwohl er weniger als 3 Mal gepasst hat:', {
                roomCode,
                username: room.players[playerIndex].username,
                passCount: room.gameState.passCount[playerIndex]
            });
            return false;
        }
        
        // Prüfen, ob der Spieler keine spielbaren Karten hat
        const hand = room.gameState.playerHands[playerIndex];
        const hasPlayerSurrendered = room.gameState.surrendered.some(s => s);
        const playableCards = this.getPlayableCards(room.gameState.board, hand, hasPlayerSurrendered);
        
        if (playableCards.length > 0) {
            debug.log('Spieler könnte Karten spielen, aber will aufgeben:', {
                roomCode,
                username: room.players[playerIndex].username,
                playableCards
            });
            return false;
        }
        
        // Spieler hat aufgegeben
        room.gameState.surrendered[playerIndex] = true;
        
        debug.log('Spieler gibt auf:', {
            roomCode,
            username: room.players[playerIndex].username
        });
        
        // Alle Karten des Spielers
        const cardsToPlace = [...hand];
        room.gameState.playerHands[playerIndex] = []; // Hand leeren
        
        // Rang des Spielers bestimmen (basierend auf der Reihenfolge der Aufgaben/Siege)
        const finishPosition = room.gameState.finishedOrder.length;
        
        // Spieler zur Liste der fertig gewordenen Spieler hinzufügen
        room.gameState.finishedOrder.push(room.players[playerIndex].username);
        
        // Versuche, alle spielbaren Karten auf dem Brett zu platzieren
        // Wiederhole, bis keine Karten mehr platziert werden können
        let placedCards = [];
        let continueProcessing = true;
        let iterationCount = 0;
        const maxIterations = 100; // Sicherheit gegen Endlosschleifen
        
        while (continueProcessing && iterationCount < maxIterations) {
            iterationCount++;
            continueProcessing = false;
            
            for (let i = 0; i < cardsToPlace.length; i++) {
                const card = cardsToPlace[i];
                
                // Versuche, die Karte zu platzieren
                if (this.placeCardOnBoard(room.gameState.board, card, true)) {
                    // Karte wurde platziert
                    placedCards.push(card);
                    cardsToPlace.splice(i, 1);
                    i--; // Index anpassen, da wir ein Element entfernt haben
                    continueProcessing = true; // Weiter versuchen, da sich das Brett geändert hat
                }
            }
        }
        
        // Übrige Karten, die nicht platziert werden konnten
        const unplacedCards = cardsToPlace.length;
        
        // Prüfen, ob genug Spieler fertig sind, um das Spiel zu beenden
        if (room.gameState.finishedOrder.length >= room.players.length - 1) {
            // Ermittle den letzten nicht-aufgegebenen Spieler
            const lastPlayerIndex = room.players.findIndex((player, idx) => 
                !room.gameState.finishedOrder.includes(player.username)
            );
            
            if (lastPlayerIndex !== -1) {
                // Füge den letzten Spieler zur Liste hinzu
                room.gameState.finishedOrder.push(room.players[lastPlayerIndex].username);
                
                // Leere seine Hand
                room.gameState.playerHands[lastPlayerIndex] = [];
                
                // Beende das Spiel
                this.endGame(io, roomCode, room, lastPlayerIndex);
                return true;
            }
        }
        
        // Nächster Spieler ist dran
        this.moveToNextPlayer(io, roomCode, room, {
            type: 'surrender',
            player: room.players[playerIndex].username,
            rank: finishPosition,
            placedCards: placedCards.length,
            unplacedCards: unplacedCards,
            finishedOrder: room.gameState.finishedOrder
        });
        
        return true;
    },
    
    /**
     * Behandelt das Spielen einer Karte
     */
    handleCardPlay(io, roomCode, room, playerIndex, cardIndex) {
        const hand = room.gameState.playerHands[playerIndex];
        
        // Prüfen, ob der Index gültig ist
        if (cardIndex < 0 || cardIndex >= hand.length) {
            debug.log('Ungültiger Kartenindex:', {
                roomCode,
                username: room.players[playerIndex].username,
                cardIndex
            });
            return false;
        }
        
        const card = hand[cardIndex];
        const hasPlayerSurrendered = room.gameState.surrendered.some(s => s);
        
        // Prüfen, ob die Karte spielbar ist (mit Berücksichtigung der speziellen Regeln)
        // Erstelle eine Kopie des Boards, um zu prüfen, ob die Karte spielbar ist
        const boardCopy = JSON.parse(JSON.stringify(room.gameState.board));
        if (!this.placeCardOnBoard(boardCopy, card, hasPlayerSurrendered)) {
            debug.log('Nicht spielbare Karte:', {
                roomCode,
                username: room.players[playerIndex].username,
                card
            });
            return false;
        }
        
        // Karte vom Spieler entfernen und auf das Board legen
        const playedCard = hand.splice(cardIndex, 1)[0];
        room.gameState.board[playedCard.suit].push(playedCard.value);
        room.gameState.board[playedCard.suit].sort((a, b) => a - b);
        
        debug.log('Spieler spielt Karte:', {
            roomCode,
            username: room.players[playerIndex].username,
            card: playedCard
        });
        
        // Prüfen, ob der Spieler alle Karten abgelegt hat
        if (hand.length === 0) {
            debug.log('Spieler hat alle Karten abgelegt:', {
                roomCode,
                username: room.players[playerIndex].username
            });
            
            // Rang des Spielers bestimmen (basierend auf der Reihenfolge der Aufgaben/Siege)
            const finishPosition = room.gameState.finishedOrder.length;
            
            // Spieler zur Liste der fertig gewordenen Spieler hinzufügen
            room.gameState.finishedOrder.push(room.players[playerIndex].username);
            
            // Prüfen, ob genug Spieler fertig sind, um das Spiel zu beenden
            if (room.gameState.finishedOrder.length >= room.players.length - 1) {
                // Ermittle den letzten nicht-aufgegebenen Spieler
                const lastPlayerIndex = room.players.findIndex((player, idx) => 
                    !room.gameState.finishedOrder.includes(player.username)
                );
                
                if (lastPlayerIndex !== -1) {
                    // Füge den letzten Spieler zur Liste hinzu
                    room.gameState.finishedOrder.push(room.players[lastPlayerIndex].username);
                    
                    // Leere seine Hand
                    room.gameState.playerHands[lastPlayerIndex] = [];
                }
                
                // Beende das Spiel
                this.endGame(io, roomCode, room, playerIndex);
                return true;
            }
        }
        
        // Nächster Spieler ist dran
        this.moveToNextPlayer(io, roomCode, room, {
            type: 'play',
            player: room.players[playerIndex].username,
            card: playedCard,
            remainingCards: hand.length,
            finishedRank: hand.length === 0 ? room.gameState.finishedOrder.length - 1 : undefined
        });
        
        return true;
    },
    
    /**
     * Wechselt zum nächsten Spieler
     */
    moveToNextPlayer(io, roomCode, room, lastMove) {
        // Nächsten aktiven Spieler finden (der nicht aufgegeben hat oder ausgeschieden ist)
        let nextPlayerIndex = (room.currentTurn + 1) % room.players.length;
        let loopCount = 0;
        
        // Finde den nächsten nicht-aufgegebenen und nicht-fertigen Spieler
        while ((room.gameState.surrendered[nextPlayerIndex] || 
                room.gameState.finishedOrder.includes(room.players[nextPlayerIndex].username)) && 
               loopCount < room.players.length) {
            nextPlayerIndex = (nextPlayerIndex + 1) % room.players.length;
            loopCount++;
        }
        
        // Falls alle Spieler fertig sind, beende das Spiel
        if (loopCount >= room.players.length) {
            debug.log('Alle Spieler sind fertig, beende Spiel:', { roomCode });
            // Finde den Spieler mit dem besten Rang (niedrigste Position in finishedOrder)
            const winnerIndex = room.players.findIndex(p => 
                room.gameState.finishedOrder.indexOf(p.username) === 0
            );
            this.endGame(io, roomCode, room, winnerIndex);
            return;
        }
        
        // Zum nächsten Spieler wechseln
        room.currentTurn = nextPlayerIndex;
        
        // Spielerinformationen für das moveUpdate-Event vorbereiten
        const playersInfo = room.players.map(p => {
            const playerIndex = room.players.indexOf(p);
            return {
                username: p.username,
                color: p.color,
                isHost: p.isHost,
                isBot: p.isBot || false,
                cardsLeft: room.gameState.playerHands[playerIndex].length,
                finished: room.gameState.finishedOrder.includes(p.username),
                rank: room.gameState.finishedOrder.indexOf(p.username)
            };
        });
        
        // Alle Spieler über den Zug informieren
        io.to(roomCode).emit('moveUpdate', {
            ...lastMove,
            nextPlayer: room.players[room.currentTurn].username,
            board: room.gameState.board,
            players: playersInfo,
            finishedOrder: room.gameState.finishedOrder
        });
        
        // Prüfen, ob der aktuelle Spieler ein Bot ist
        if (room.players[room.currentTurn].isBot) {
            this.handleBotTurn(io, roomCode, room);
        }
    },
    
    /**
     * Behandelt den Zug eines Bots
     */
    handleBotTurn(io, roomCode, room) {
        const botIndex = room.currentTurn;
        const botHand = room.gameState.playerHands[botIndex];
        const bot = room.players[botIndex];
        
        // Kurze Verzögerung, damit es natürlicher wirkt
        setTimeout(() => {
            // Bot-Logik in separaten Handler auslagern
            const hasPlayerSurrendered = room.gameState.surrendered.some(s => s);
            const playableCards = this.getPlayableCards(room.gameState.board, botHand, hasPlayerSurrendered);
            
            if (playableCards.length > 0) {
                // Finde den Index der spielbaren Karte in der Hand des Bots
                const selectedCard = playableCards[Math.floor(Math.random() * playableCards.length)];
                const cardIndex = botHand.findIndex(card => 
                    card.suit === selectedCard.suit && card.value === selectedCard.value
                );
                
                this.handleCardPlay(io, roomCode, room, botIndex, cardIndex);
            } else if (room.gameState.passCount[botIndex] < 3) {
                this.handlePass(io, roomCode, room, botIndex);
            } else {
                this.handleSurrender(io, roomCode, room, botIndex);
            }
        }, 1000);
    },
    
    /**
     * Beendet das Spiel
     */
    endGame(io, roomCode, room, winnerIndex) {
        debug.log('Spiel beendet, Gewinner:', {
            roomCode,
            winner: room.players[winnerIndex].username,
            finishedOrder: room.gameState.finishedOrder
        });
        
        // Erstelle eine Rangliste basierend auf der finishedOrder
        const ranking = room.players.map(player => {
            const finishPosition = room.gameState.finishedOrder.indexOf(player.username);
            const playerIndex = room.players.indexOf(player);
            
            return {
                username: player.username,
                isBot: player.isBot || false,
                cardsLeft: room.gameState.playerHands[playerIndex].length,
                rank: finishPosition
            };
        });
        
        // Alle Spieler über das Spielende informieren
        io.to(roomCode).emit('gameOver', {
            winner: room.players[winnerIndex].username,
            ranking: ranking,
            board: room.gameState.board,
            finishedOrder: room.gameState.finishedOrder
        });
        
        // Spiel zurücksetzen
        room.gameState.gameStarted = false;
    },
    
    /**
     * Startet das Spiel neu
     */
    restartGame(io, roomCode, room) {
        debug.log('Spiel wird neu gestartet:', { roomCode });
        
        // Anzahl der menschlichen Spieler beibehalten
        const humanPlayers = room.players.filter(p => !p.isBot);
        room.players = humanPlayers;
        
        // Spielstatus zurücksetzen
        room.gameState = this.initializeGameState();
        
        // Alle Spieler über den Neustart informieren
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