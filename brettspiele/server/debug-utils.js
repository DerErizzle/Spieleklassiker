const DEBUG = true;

function log(message, data = {}) {
    if (DEBUG) {
        console.log(`[DEBUG] ${message}`, data);
    }
}

module.exports = {
    DEBUG,
    log
};