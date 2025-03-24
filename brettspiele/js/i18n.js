class I18nService {
    constructor() {
        this.currentLanguage = 'de'; 
        this.translations = {};
        this.isLoaded = false;
        this.loadCallbacks = [];

        this.init();
    }

    async init() {

        const savedLang = getCookie('language');
        if (savedLang && ['de', 'en'].includes(savedLang)) {
            this.currentLanguage = savedLang;
        }

        document.documentElement.lang = this.currentLanguage;

        await this.loadTranslations();

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

    async loadTranslations() {
        try {
            const response = await fetch(`/api/translations/${this.currentLanguage}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            this.translations = data;
            this.isLoaded = true;

            this.loadCallbacks.forEach(callback => callback());
            this.loadCallbacks = [];

            this.translatePage();

            return true;
        } catch (error) {
            console.error('Fehler beim Laden der Übersetzungen:', error);
            return false;
        }
    }

    async setLanguage(lang) {
        if (lang === this.currentLanguage) return true;

        if (!['de', 'en'].includes(lang)) {
            console.error(`Nicht unterstützte Sprache: ${lang}`);
            return false;
        }

        this.currentLanguage = lang;

        setCookie('language', lang, 30);

        document.documentElement.lang = lang;

        const success = await this.loadTranslations();

        if (success) {
            this.translatePage();
        }

        return success;
    }

    translatePage() {
        if (!this.isLoaded) return;

        const elementsToTranslate = document.querySelectorAll('[data-i18n]');

        elementsToTranslate.forEach(element => {
            const key = element.getAttribute('data-i18n');
            const text = this.t(key);

            if (text) {

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

        const elementsWithPlaceholders = document.querySelectorAll('[data-i18n-placeholder]');
        elementsWithPlaceholders.forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            const text = this.t(key);

            if (text) {
                element.placeholder = text;
            }
        });

        const elementsWithTitle = document.querySelectorAll('[data-i18n-title]');
        elementsWithTitle.forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            const text = this.t(key);

            if (text) {
                element.title = text;
            }
        });
    }

    replaceParams(text, params) {
        return text.replace(/\{(\w+)\}/g, (_, key) => {
            return params[key] !== undefined ? params[key] : `{${key}}`;
        });
    }

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

    onLoaded(callback) {
        if (this.isLoaded) {
            callback();
        } else {
            this.loadCallbacks.push(callback);
        }
    }
}

const i18n = new I18nService();

function t(key, params) {
    const text = i18n.t(key);
    return params ? i18n.replaceParams(text, params) : text;
}