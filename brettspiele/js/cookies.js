/**
 * Cookie-Funktionen für Geile Games
 */

// Cookie setzen
function setCookie(name, value, days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = "expires=" + date.toUTCString();
    document.cookie = name + "=" + value + ";" + expires + ";path=/";
}

// Cookie abrufen
function getCookie(name) {
    const cookieName = name + "=";
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
        let cookie = cookies[i].trim();
        if (cookie.indexOf(cookieName) === 0) {
            return cookie.substring(cookieName.length, cookie.length);
        }
    }
    return "";
}

// Cookie löschen
function deleteCookie(name) {
    document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
}

// Überprüfen, ob Benutzer eingeloggt ist
function isUserLoggedIn() {
    return getCookie('username') !== "" && getCookie('userColor') !== "";
}

// Benutzerabmeldung
function logoutUser() {
    deleteCookie('username');
    deleteCookie('userColor');
    window.location.href = '/login';
}