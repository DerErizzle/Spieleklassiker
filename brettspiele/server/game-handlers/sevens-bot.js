/**
 * Bot-Logik für das Kartendomino-Spiel
 */
const SevensBotHandler = {
    /**
     * Entscheidet, welchen Zug der Bot machen soll
     * @param {Object} board - Aktuelles Spielbrett
     * @param {Array} hand - Karten auf der Hand des Bots
     * @param {Number} passCount - Wie oft der Bot bereits gepasst hat
     * @returns {Object} - Der gewählte Zug
     */
    decideBotMove(board, hand, passCount) {
        // Prüfen, ob der Bot spielbare Karten hat
        const playableCards = this.getPlayableCards(board, hand);
        
        if (playableCards.length > 0) {
            // Wenn spielbare Karten vorhanden sind, wähle eine zufällig aus
            const randomIndex = Math.floor(Math.random() * playableCards.length);
            const selectedCardIndex = hand.findIndex(card => 
                card.suit === playableCards[randomIndex].suit && 
                card.value === playableCards[randomIndex].value
            );
            
            return {
                type: 'play',
                cardIndex: selectedCardIndex
            };
        } else if (passCount < 3) {
            // Wenn keine spielbaren Karten vorhanden sind und noch nicht 3 Mal gepasst wurde
            return {
                type: 'pass'
            };
        } else {
            // Wenn 3 Mal gepasst wurde und keine spielbaren Karten vorhanden sind
            return {
                type: 'surrender'
            };
        }
    },
    
    /**
     * Ermittelt alle spielbaren Karten
     * @param {Object} board - Aktuelles Spielbrett
     * @param {Array} hand - Karten auf der Hand des Bots
     * @returns {Array} - Liste der spielbaren Karten
     */
    getPlayableCards(board, hand) {
        return hand.filter(card => this.isCardPlayable(board, card));
    },
    
    /**
     * Prüft, ob eine Karte spielbar ist
     * @param {Object} board - Aktuelles Spielbrett
     * @param {Object} card - Zu prüfende Karte
     * @returns {Boolean} - Ist die Karte spielbar?
     */
    isCardPlayable(board, card) {
        const { suit, value } = card;
        const suitValues = board[suit];
        
        // Prüfen, ob die Karte direkt neben einem bereits vorhandenen Wert liegt
        return suitValues.includes(value - 1) || suitValues.includes(value + 1);
    }
};

module.exports = SevensBotHandler;