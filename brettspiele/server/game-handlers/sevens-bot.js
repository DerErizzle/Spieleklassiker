const SevensBotHandler = {

    decideBotMove(board, hand, passCount) {

        const playableCards = this.getPlayableCards(board, hand);

        if (playableCards.length > 0) {

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

            return {
                type: 'pass'
            };
        } else {

            return {
                type: 'surrender'
            };
        }
    },

    getPlayableCards(board, hand) {
        return hand.filter(card => this.isCardPlayable(board, card));
    },

    isCardPlayable(board, card) {
        const { suit, value } = card;
        const suitValues = board[suit];

        return suitValues.includes(value - 1) || suitValues.includes(value + 1);
    }
};

module.exports = SevensBotHandler;