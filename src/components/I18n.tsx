'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

type Language = 'pl' | 'en';

// Translation type
type TranslationKey = keyof typeof translations.pl;

const translations = {
    pl: {
        // Navigation
        'nav.home': 'Strona główna',
        'nav.favorites': 'Ulubione',
        'nav.tools': 'Narzędzia',
        'nav.search': 'Szukaj narzędzia...',
        'nav.notifications': 'Powiadomienia',
        'nav.shortcuts': 'Skróty klawiszowe',
        'nav.settings': 'Ustawienia',

        // Dashboard
        'dashboard.greeting.morning': 'Dzień dobry',
        'dashboard.greeting.afternoon': 'Cześć',
        'dashboard.greeting.evening': 'Dobry wieczór',
        'dashboard.greeting.night': 'Nocna zmiana?',
        'dashboard.subtitle': 'Twoje centrum dowodzenia e-commerce. Co dzisiaj robimy?',
        'dashboard.allTools': 'Wszystkie narzędzia',
        'dashboard.stats.filesProcessed': 'Przetworzone pliki',
        'dashboard.stats.timeSaved': 'Zaoszczędzony czas',
        'dashboard.stats.favorites': 'Ulubione narzędzia',

        // Drag & Drop
        'dragdrop.title': 'Upuść plik tutaj',
        'dragdrop.subtitle': 'Wybierzesz narzędzie do przetworzenia',
        'dragdrop.selectTool': 'Wybierz narzędzie',
        'dragdrop.file': 'Plik',
        'dragdrop.cancel': 'Anuluj',

        // Common
        'common.cancel': 'Anuluj',
        'common.save': 'Zapisz',
        'common.download': 'Pobierz',
        'common.delete': 'Usuń',
        'common.clear': 'Wyczyść',
        'common.close': 'Zamknij',
        'common.back': 'Wstecz',
        'common.next': 'Dalej',
        'common.loading': 'Ładowanie...',
        'common.processing': 'Przetwarzanie...',
        'common.error': 'Błąd',
        'common.success': 'Sukces',
        'common.warning': 'Ostrzeżenie',
        'common.info': 'Informacja',
        'common.min': 'min',

        // Stats Panel
        'stats.title': 'Statystyki',
        'stats.filesProcessed': 'Plików przetworzonych',
        'stats.totalOperations': 'Wszystkich operacji',
        'stats.lastUsed': 'Ostatnio używane',
        'stats.byTool': 'Według narzędzia',
        'stats.reset': 'Resetuj statystyki',
        'stats.noData': 'Brak danych',

        // History Panel
        'history.title': 'Historia',
        'history.empty': 'Historia jest pusta',
        'history.clear': 'Wyczyść historię',
        'history.download': 'Pobierz',
        'history.today': 'Dzisiaj',
        'history.yesterday': 'Wczoraj',

        // Queue Panel
        'queue.title': 'Kolejka',
        'queue.empty': 'Kolejka jest pusta',
        'queue.clearCompleted': 'Wyczyść ukończone',
        'queue.pending': 'Oczekujące',
        'queue.processing': 'Przetwarzanie',
        'queue.completed': 'Ukończone',
        'queue.failed': 'Błąd',

        // Footer
        'footer.backendOnline': 'Backend Online',
        'footer.backendOffline': 'Backend Offline',

        // Tips
        'tip.dragdrop': 'Przeciągnij plik na stronę aby automatycznie wybrać odpowiednie narzędzie!',
        'tip.search': 'Użyj Ctrl+K aby szybko wyszukać narzędzie lub plik.',
        'tip.favorites': 'Kliknij gwiazdkę przy narzędziu, aby dodać je do ulubionych.',
        'tip.theme': 'Kliknij ikonę 🎨 w nawigacji, aby zmienić kolor akcentu.',
        'tip.darkmode': 'Kliknij ikonę słońca/księżyca aby przełączyć tryb jasny/ciemny.',
        'tip.stats': 'Wszystkie przetworzone pliki są liczone w statystykach!',
        'tip.excel': 'Excel Splitter może podzielić plik na setki arkuszy w sekundy.',
    },
    en: {
        // Navigation
        'nav.home': 'Home',
        'nav.favorites': 'Favorites',
        'nav.tools': 'Tools',
        'nav.search': 'Search tools...',
        'nav.notifications': 'Notifications',
        'nav.shortcuts': 'Keyboard shortcuts',
        'nav.settings': 'Settings',

        // Dashboard
        'dashboard.greeting.morning': 'Good morning',
        'dashboard.greeting.afternoon': 'Hello',
        'dashboard.greeting.evening': 'Good evening',
        'dashboard.greeting.night': 'Night shift?',
        'dashboard.subtitle': 'Your e-commerce command center. What are we doing today?',
        'dashboard.allTools': 'All tools',
        'dashboard.stats.filesProcessed': 'Files processed',
        'dashboard.stats.timeSaved': 'Time saved',
        'dashboard.stats.favorites': 'Favorite tools',

        // Drag & Drop
        'dragdrop.title': 'Drop file here',
        'dragdrop.subtitle': 'You will choose a tool to process it',
        'dragdrop.selectTool': 'Select tool',
        'dragdrop.file': 'File',
        'dragdrop.cancel': 'Cancel',

        // Common
        'common.cancel': 'Cancel',
        'common.save': 'Save',
        'common.download': 'Download',
        'common.delete': 'Delete',
        'common.clear': 'Clear',
        'common.close': 'Close',
        'common.back': 'Back',
        'common.next': 'Next',
        'common.loading': 'Loading...',
        'common.processing': 'Processing...',
        'common.error': 'Error',
        'common.success': 'Success',
        'common.warning': 'Warning',
        'common.info': 'Info',
        'common.min': 'min',

        // Stats Panel
        'stats.title': 'Statistics',
        'stats.filesProcessed': 'Files processed',
        'stats.totalOperations': 'Total operations',
        'stats.lastUsed': 'Last used',
        'stats.byTool': 'By tool',
        'stats.reset': 'Reset statistics',
        'stats.noData': 'No data',

        // History Panel
        'history.title': 'History',
        'history.empty': 'History is empty',
        'history.clear': 'Clear history',
        'history.download': 'Download',
        'history.today': 'Today',
        'history.yesterday': 'Yesterday',

        // Queue Panel
        'queue.title': 'Queue',
        'queue.empty': 'Queue is empty',
        'queue.clearCompleted': 'Clear completed',
        'queue.pending': 'Pending',
        'queue.processing': 'Processing',
        'queue.completed': 'Completed',
        'queue.failed': 'Failed',

        // Footer
        'footer.backendOnline': 'Backend Online',
        'footer.backendOffline': 'Backend Offline',

        // Tips
        'tip.dragdrop': 'Drag a file onto the page to automatically select the right tool!',
        'tip.search': 'Use Ctrl+K to quickly search for a tool or file.',
        'tip.favorites': 'Click the star next to a tool to add it to favorites.',
        'tip.theme': 'Click the 🎨 icon in the navbar to change the accent color.',
        'tip.darkmode': 'Click the sun/moon icon to switch between light and dark mode.',
        'tip.stats': 'All processed files are counted in the statistics!',
        'tip.excel': 'Excel Splitter can split a file into hundreds of sheets in seconds.',
    }
};

interface I18nContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

const STORAGE_KEY = 'toolbox-language';

export function I18nProvider({ children }: { children: ReactNode }) {
    const [language, setLanguageState] = useState<Language>('pl');

    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY) as Language | null;
        if (saved && (saved === 'pl' || saved === 'en')) {
            setLanguageState(saved);
        }
    }, []);

    const setLanguage = useCallback((lang: Language) => {
        setLanguageState(lang);
        localStorage.setItem(STORAGE_KEY, lang);
    }, []);

    const t = useCallback((key: TranslationKey): string => {
        return translations[language][key] || key;
    }, [language]);

    return (
        <I18nContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </I18nContext.Provider>
    );
}

export function useI18n() {
    const context = useContext(I18nContext);
    if (!context) {
        throw new Error('useI18n must be used within I18nProvider');
    }
    return context;
}

// Language Switcher Component
export function LanguageSwitcher() {
    const { language, setLanguage } = useI18n();

    return (
        <button
            onClick={() => setLanguage(language === 'pl' ? 'en' : 'pl')}
            className="navbar-icon"
            title={language === 'pl' ? 'Switch to English' : 'Przełącz na polski'}
            style={{
                fontSize: '0.85rem',
                fontWeight: 700,
                color: 'var(--accent)',
                letterSpacing: '0.5px'
            }}
        >
            {language.toUpperCase()}
        </button>
    );
}
