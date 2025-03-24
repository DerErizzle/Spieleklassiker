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
            gameStarted: false,
            finishedOrder: [], // Speichert die Reihenfolge, in der Spieler fertig werden
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
    isCardPlayable(board, card, finishedOrder = []) {
        const { suit, value } = card;
        const suitValues = board[suit];
        
        // Grundregel: Karte muss zu einer bereits auf dem Tisch liegenden Karte passen
        const isAdjacent = suitValues.includes(value - 1) || suitValues.includes(value + 1);
        
        if (!isAdjacent) {
            return false;
        }
        
        // Wenn mindestens ein Spieler fertig ist, prüfe ob Lücken vorhanden sind
        if (finishedOrder && finishedOrder.length > 0) {
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
        
        return true;
    },
    
    /**
     * Prüft, ob eine Karte direkt an eine bestehende Karte angrenzt (für Aufgabe)
     */
    isCardPlayableForSurrender(board, card) {
        const { suit, value } = card;
        const suitValues = board[suit];
        
        // Bei Aufgabe ist eine Karte spielbar, wenn sie direkt an eine andere Karte angrenzt
        return suitValues.includes(value - 1) || suitValues.includes(value + 1);
    },
    
    /**
     * Legt alle möglichen Karten auf das Brett
     * Optimierte Implementation für den Aufgabefall
     */
    placePlayableCardsForSurrender(board, cards) {
        let placedCards = [];
        let remainingCards = [...cards];
        
        // Iterativ versuchen, so viele Karten wie möglich zu platzieren
        let foundPlayable = true;
        while (foundPlayable && remainingCards.length > 0) {
            foundPlayable = false;
            
            for (let i = remainingCards.length - 1; i >= 0; i--) {
                const card = remainingCards[i];
                
                // Bei Aufgabe verwenden wir die einfachere Regel
                if (this.isCardPlayableForSurrender(board, card)) {
                    // Karte auf das Brett legen
                    board[card.suit].push(card.value);
                    // Karte aus der Hand entfernen
                    const removedCard = remainingCards.splice(i, 1)[0];
                    placedCards.push(removedCard);
                    foundPlayable = true;
                }
            }
            
            // Sortieren der Karten auf dem Brett nach jedem Durchlauf
            for (const suit in board) {
                board[suit].sort((a, b) => a - b);
            }
        }
        
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
    
    /**
     * Prüft, ob ein Spieler Karten spielen kann
     */
    canPlayerPlayCards(board, hand, finishedOrder = []) {
        return hand.some(card => this.isCardPlayable(board, card, finishedOrder));
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
        room.gameState.finishedOrder = [];
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
                        cardsLeft: p.isBot ? room.gameState.playerHands[room.players.indexOf(p)].length : null,
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
        if (this.canPlayerPlayCards(room.gameState.board, hand, room.gameState.finishedOrder)) {
            debug.log('Spieler könnte Karten spielen, aber will aufgeben:', {
                roomCode,
                username: room.players[playerIndex].username
            });
            return false;
        }
        
        // Spieler hat aufgegeben
        room.gameState.surrendered[playerIndex] = true;
        
        debug.log('Spieler gibt auf:', {
            roomCode,
            username: room.players[playerIndex].username
        });
        
        // Alle spielbaren Karten auf das Brett legen
        const { placedCards, remainingCards } = this.placePlayableCardsForSurrender(
            room.gameState.board, 
            hand
        );
        
        // Die Karten des Spielers aktualisieren - hier behalten wir die nicht spielbaren Karten
        room.gameState.playerHands[playerIndex] = remainingCards;
        
        // Den Spieler zur Rangliste hinzufügen, aber am Ende (niedrigster Rang)
        const playerUsername = room.players[playerIndex].username;
        
        // Sicherstellen, dass der Spieler nicht bereits in der finishedOrder ist
        if (!room.gameState.finishedOrder.includes(playerUsername)) {
            // Spieler am Ende hinzufügen (niedrigster Rang)
            room.gameState.finishedOrder.push(playerUsername);
        }
        
        // Der Rang ist der Index in der finishedOrder
        const rank = room.gameState.finishedOrder.length - 1;
        
        debug.log('Spieler aufgegeben, Rangzuweisung:', {
            username: playerUsername,
            rank: rank,
            finishedOrder: room.gameState.finishedOrder,
            remainingCardsCount: remainingCards.length,
            placedCardsCount: placedCards.length
        });
        
        // Nächster Spieler ist dran
        this.moveToNextPlayer(io, roomCode, room, {
            type: 'surrender',
            player: playerUsername,
            remainingCards: remainingCards.length,
            playableCardsPlaced: placedCards.length,
            placedCards: placedCards,
            rank: rank,
            finishedOrder: room.gameState.finishedOrder
        });
        
        // Prüfen, ob das Spiel beendet werden soll (3 Spieler fertig)
        if (room.gameState.finishedOrder.length >= 3) {
            // Spiel beenden - letzte Platzierung vergeben
            this.assignLastPlace(io, roomCode, room);
            return true;
        }
        
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
        
        // Prüfen, ob die Karte spielbar ist
        if (!this.isCardPlayable(room.gameState.board, card)) {
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
            
            // Spieler zur Liste der fertig gewordenen Spieler hinzufügen (wenn nicht bereits vorhanden)
            if (!room.gameState.finishedOrder.includes(room.players[playerIndex].username)) {
                room.gameState.finishedOrder.push(room.players[playerIndex].username);
            }
            
            const finishRank = room.gameState.finishedOrder.length - 1; // Der erste Spieler bekommt Rang 0
            
            // Prüfen, ob das Spiel beendet werden soll (3 Spieler fertig)
            if (room.gameState.finishedOrder.length >= 3) {
                // Spiel beenden - letzte Platzierung vergeben
                this.assignLastPlace(io, roomCode, room);
                return true;
            }
        }
        
        // Nächster Spieler ist dran
        this.moveToNextPlayer(io, roomCode, room, {
            type: 'play',
            player: room.players[playerIndex].username,
            card: playedCard,
            remainingCards: hand.length,
            rank: hand.length === 0 ? room.gameState.finishedOrder.length - 1 : undefined
        });
        
        return true;
    },

    /**
     * Weist dem letzten Spieler seine Platzierung zu und beendet das Spiel
     */
    assignLastPlace(io, roomCode, room) {
        // Finde den letzten verbleibenden aktiven Spieler
        const activePlayers = room.players.filter((p, index) => 
            !room.gameState.finishedOrder.includes(p.username)
        );
        
        if (activePlayers.length === 1) {
            const lastPlayer = activePlayers[0];
            const lastPlayerIndex = room.players.findIndex(p => p.username === lastPlayer.username);
            
            // Dem letzten Spieler die letzte Platzierung zuweisen
            room.gameState.finishedOrder.push(lastPlayer.username);
            
            // Eventuell noch spielbare Karten ablegen
            const { placedCards, remainingCards } = this.placePlayableCardsForSurrender(
                room.gameState.board, 
                room.gameState.playerHands[lastPlayerIndex]
            );
            
            // Hand auf die restlichen Karten setzen
            room.gameState.playerHands[lastPlayerIndex] = remainingCards;
            
            debug.log('Letzter Spieler zugewiesen:', {
                username: lastPlayer.username,
                rank: room.gameState.finishedOrder.length - 1,
                remainingCards: remainingCards.length,
                placedCards: placedCards.length
            });
            
            // Beende das Spiel mit vollständigem Ranking
            this.endGame(io, roomCode, room);
        } else {
            // Falls aus irgendeinem Grund kein oder mehrere Spieler übrig sind, 
            // beende das Spiel trotzdem
            this.endGame(io, roomCode, room);
        }
    },
    
    /**
     * Wechselt zum nächsten Spieler
     */
    moveToNextPlayer(io, roomCode, room, lastMove) {
        // Nächsten aktiven Spieler finden (der nicht aufgegeben hat und nicht fertig ist)
        let nextPlayerIndex = (room.currentTurn + 1) % room.players.length;
        let loopCount = 0;
        
        // Finde den nächsten nicht-aufgegebenen und nicht-fertigen Spieler
        while (loopCount < room.players.length) {
            if (!room.gameState.finishedOrder.includes(room.players[nextPlayerIndex].username)) {
                break; // Gefunden!
            }
            
            nextPlayerIndex = (nextPlayerIndex + 1) % room.players.length;
            loopCount++;
        }
        
        // Falls alle Spieler fertig sind, beende das Spiel
        if (loopCount >= room.players.length) {
            debug.log('Alle Spieler sind fertig, beende Spiel:', { roomCode });
            this.endGame(io, roomCode, room);
            return;
        }
        
        // Zum nächsten Spieler wechseln
        room.currentTurn = nextPlayerIndex;
        
        // Die Positionen der Spieler im Ranking hinzufügen
        if ((lastMove.type === 'surrender' || (lastMove.type === 'play' && lastMove.remainingCards === 0)) 
             && lastMove.rank !== undefined) {
            // Rang und Fertig-Reihenfolge zum Zug hinzufügen
            lastMove.finishedOrder = room.gameState.finishedOrder;
        }
        
        // Alle Spieler über den Zug informieren
        io.to(roomCode).emit('moveUpdate', {
            ...lastMove,
            nextPlayer: room.players[room.currentTurn].username,
            board: room.gameState.board
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
            const botMove = SevensBotHandler.decideBotMove(room.gameState.board, botHand, room.gameState.passCount[botIndex]);
            
            if (botMove.type === 'play') {
                this.handleCardPlay(io, roomCode, room, botIndex, botMove.cardIndex);
            } else if (botMove.type === 'pass') {
                this.handlePass(io, roomCode, room, botIndex);
            } else if (botMove.type === 'surrender') {
                this.handleSurrender(io, roomCode, room, botIndex);
            }
        }, 1000);
    },
    
    /**
     * Beendet das Spiel
     */
    endGame(io, roomCode, room) {
        debug.log('Spiel beendet, finishedOrder:', {
            roomCode,
            finishedOrder: room.gameState.finishedOrder
        });
        
        // Erstelle eine Rangliste basierend auf der Reihenfolge, in der Spieler fertig wurden
        const finishedOrder = room.gameState.finishedOrder || [];
        
        const ranking = room.players.map(player => {
            // Finde die Position des Spielers in der Fertig-Reihenfolge
            const rank = finishedOrder.indexOf(player.username);
            const remainingCards = room.gameState.playerHands[room.players.indexOf(player)].length;
            
            return {
                username: player.username,
                isBot: player.isBot || false,
                cardsLeft: remainingCards,
                rank: rank !== -1 ? rank : finishedOrder.length // Wenn nicht in der Liste, dann letzter Platz
            };
        });
        
        // Ermittle den Gewinner (erster Platz bzw. Rang 0)
        const winner = finishedOrder.length > 0 ? finishedOrder[0] : null;
        
        // Alle Spieler über das Spielende informieren
        io.to(roomCode).emit('gameOver', {
            winner: winner,
            ranking: ranking,
            board: room.gameState.board,
            finishedOrder: finishedOrder
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