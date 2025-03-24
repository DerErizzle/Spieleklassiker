/**
 * Debug-Utilities für Brettspiele
 */

// Debug-Modus (auf true setzen für mehr Logging)
const DEBUG = true;

/**
 * Debug-Logging-Funktion
 * @param {string} message - Nachricht
 * @param {object} data - Zugehörige Daten
 */
function log(message, data = {}) {
    if (DEBUG) {
        console.log(`[DEBUG] ${message}`, data);
    }
}

module.exports = {
    DEBUG,
    log
};