/**
 * Internationalisierungs-Service für Erizzle Games
 */

class I18nService {
    constructor() {
        this.currentLanguage = 'de'; // Standard-Sprache
        this.translations = {};
        this.isLoaded = false;
        this.loadCallbacks = [];
        
        // Initialisierung beim Start
        this.init();
    }
    
    /**
     * Initialisiert den Internationalisierungs-Service
     */
    async init() {
        // Gespeicherte Sprache aus dem Cookie laden
        const savedLang = getCookie('language');
        if (savedLang && ['de', 'en'].includes(savedLang)) {
            this.currentLanguage = savedLang;
        }
        
        // HTML lang-Attribut setzen
        document.documentElement.lang = this.currentLanguage;
        
        // Übersetzungen laden
        await this.loadTranslations();
        
        // Event-Listener für Sprachänderungen einrichten (nur auf Login-Seite)
        document.addEventListener('DOMContentLoaded', () => {
            const langSwitcher = document.getElementById('language-switcher');
            if (langSwitcher) {
                langSwitcher.value = this.currentLanguage;
                langSwitcher.addEventListener('change', (e) => {
                    this.setLanguage(e.target.value);
                });
            }
        });
    }
    
    /**
     * Lädt die Übersetzungen für die aktuelle Sprache
     */
    async loadTranslations() {
        try {
            const response = await fetch(`/api/translations/${this.currentLanguage}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            this.translations = data;
            this.isLoaded = true;
            
            // Alle registrierten Callbacks ausführen
            this.loadCallbacks.forEach(callback => callback());
            this.loadCallbacks = [];
            
            // Seite übersetzen
            this.translatePage();
            
            return true;
        } catch (error) {
            console.error('Fehler beim Laden der Übersetzungen:', error);
            return false;
        }
    }
    
    /**
     * Ändert die aktuelle Sprache
     * @param {string} lang - Sprachcode (z.B. 'de', 'en')
     */
    async setLanguage(lang) {
        if (lang === this.currentLanguage) return true;
        
        if (!['de', 'en'].includes(lang)) {
            console.error(`Nicht unterstützte Sprache: ${lang}`);
            return false;
        }
        
        this.currentLanguage = lang;
        
        // Sprache in Cookie speichern
        setCookie('language', lang, 30);
        
        document.documentElement.lang = lang;
        
        // Übersetzungen neu laden
        const success = await this.loadTranslations();
        
        // Falls erfolgreich, die Seite übersetzen
        if (success) {
            this.translatePage();
        }
        
        return success;
    }
    
    /**
     * Übersetzt die Seite basierend auf den data-i18n-Attributen
     */
    translatePage() {
        if (!this.isLoaded) return;
        
        const elementsToTranslate = document.querySelectorAll('[data-i18n]');
        
        elementsToTranslate.forEach(element => {
            const key = element.getAttribute('data-i18n');
            const text = this.t(key);
            
            if (text) {
                // Prüfen, ob Platzhalter benötigt werden
                if (element.hasAttribute('data-i18n-params')) {
                    try {
                        const params = JSON.parse(element.getAttribute('data-i18n-params'));
                        element.textContent = this.replaceParams(text, params);
                    } catch (e) {
                        console.error('Fehler beim Parsen der i18n-Params:', e);
                        element.textContent = text;
                    }
                } else {
                    element.textContent = text;
                }
            }
        });
        
        // Elemente mit Platzhalter-Attributen übersetzen
        const elementsWithPlaceholders = document.querySelectorAll('[data-i18n-placeholder]');
        elementsWithPlaceholders.forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            const text = this.t(key);
            
            if (text) {
                element.placeholder = text;
            }
        });
        
        // Title-Attribute übersetzen
        const elementsWithTitle = document.querySelectorAll('[data-i18n-title]');
        elementsWithTitle.forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            const text = this.t(key);
            
            if (text) {
                element.title = text;
            }
        });
    }
    
    /**
     * Ersetzt Platzhalter in einem String
     * @param {string} text - Text mit Platzhaltern {name}
     * @param {object} params - Objekt mit Ersetzungen
     * @returns {string} - Text mit ersetzten Platzhaltern
     */
    replaceParams(text, params) {
        return text.replace(/\{(\w+)\}/g, (_, key) => {
            return params[key] !== undefined ? params[key] : `{${key}}`;
        });
    }
    
    /**
     * Übersetzt einen Schlüssel in die aktuelle Sprache
     * @param {string} key - Übersetzungsschlüssel im Format 'section.key'
     * @returns {string} - Übersetzter Text oder der Schlüssel selbst, wenn nicht gefunden
     */
    t(key) {
        if (!this.isLoaded) {
            console.warn('Übersetzungen noch nicht geladen');
            return key;
        }
        
        const keys = key.split('.');
        let result = this.translations;
        
        for (const k of keys) {
            if (result && result[k] !== undefined) {
                result = result[k];
            } else {
                console.warn(`Übersetzungsschlüssel nicht gefunden: ${key}`);
                return key;
            }
        }
        
        return typeof result === 'string' ? result : key;
    }
    
    /**
     * Registriert einen Callback für den Fall, dass die Übersetzungen geladen sind
     * @param {Function} callback - Funktion, die aufgerufen wird, wenn Übersetzungen geladen sind
     */
    onLoaded(callback) {
        if (this.isLoaded) {
            callback();
        } else {
            this.loadCallbacks.push(callback);
        }
    }
}

// Globale Instanz erstellen
const i18n = new I18nService();

// Zur einfacheren Verwendung im Code
function t(key, params) {
    const text = i18n.t(key);
    return params ? i18n.replaceParams(text, params) : text;
}