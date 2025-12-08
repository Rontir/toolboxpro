'use client';

import { useEffect, useCallback, useState, createContext, useContext, ReactNode } from 'react';

// Default shortcuts configuration
const DEFAULT_SHORTCUTS: Record<string, string[]> = {
    spotlight: ['ctrl', 'k'],
    stats: ['ctrl', 's'],
    queue: ['ctrl', 'q'],
    history: ['ctrl', 'h'],
    help: ['ctrl', '/'],
};

interface ShortcutsContextType {
    shortcuts: Record<string, string[]>;
    updateShortcut: (action: string, keys: string[]) => void;
    resetToDefault: () => void;
}

const ShortcutsContext = createContext<ShortcutsContextType | null>(null);
const STORAGE_KEY = 'toolbox-shortcuts';

export function ShortcutsProvider({ children }: { children: ReactNode }) {
    const [shortcuts, setShortcuts] = useState<Record<string, string[]>>(DEFAULT_SHORTCUTS);

    // Load from localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                setShortcuts(JSON.parse(saved));
            }
        } catch (e) {
            console.error('Failed to load shortcuts', e);
        }
    }, []);

    // Save to localStorage
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts));
    }, [shortcuts]);

    const updateShortcut = useCallback((action: string, keys: string[]) => {
        setShortcuts(prev => ({ ...prev, [action]: keys }));
    }, []);

    const resetToDefault = useCallback(() => {
        setShortcuts(DEFAULT_SHORTCUTS);
    }, []);

    return (
        <ShortcutsContext.Provider value={{ shortcuts, updateShortcut, resetToDefault }}>
            {children}
        </ShortcutsContext.Provider>
    );
}

export function useShortcutsConfig() {
    const context = useContext(ShortcutsContext);
    if (!context) {
        return { shortcuts: DEFAULT_SHORTCUTS, updateShortcut: () => { }, resetToDefault: () => { } };
    }
    return context;
}

interface ShortcutHandlers {
    onSpotlight?: () => void;
    onTool?: (index: number) => void;
    onStats?: () => void;
    onQueue?: () => void;
    onHistory?: () => void;
    onHelp?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
    const { shortcuts } = useShortcutsConfig();

    const matchShortcut = useCallback((e: KeyboardEvent, keys: string[]): boolean => {
        const hasCtrl = keys.includes('ctrl');
        const hasShift = keys.includes('shift');
        const hasAlt = keys.includes('alt');
        const keyToMatch = keys.find(k => !['ctrl', 'shift', 'alt', 'meta'].includes(k.toLowerCase()));

        if (hasCtrl !== (e.ctrlKey || e.metaKey)) return false;
        if (hasShift !== e.shiftKey) return false;
        if (hasAlt !== e.altKey) return false;
        if (keyToMatch && e.key.toLowerCase() !== keyToMatch.toLowerCase()) return false;

        return true;
    }, []);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Ignore if typing in input/textarea
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
            return;
        }

        // Check custom shortcuts
        if (matchShortcut(e, shortcuts.spotlight || DEFAULT_SHORTCUTS.spotlight)) {
            e.preventDefault();
            handlers.onSpotlight?.();
            return;
        }

        if (matchShortcut(e, shortcuts.help || DEFAULT_SHORTCUTS.help)) {
            e.preventDefault();
            handlers.onHelp?.();
            return;
        }

        if (matchShortcut(e, shortcuts.stats || DEFAULT_SHORTCUTS.stats)) {
            e.preventDefault();
            handlers.onStats?.();
            return;
        }

        if (matchShortcut(e, shortcuts.queue || DEFAULT_SHORTCUTS.queue)) {
            e.preventDefault();
            handlers.onQueue?.();
            return;
        }

        if (matchShortcut(e, shortcuts.history || DEFAULT_SHORTCUTS.history)) {
            e.preventDefault();
            handlers.onHistory?.();
            return;
        }

        // Ctrl+1-9 - Tool selection (hardcoded)
        if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '9') {
            e.preventDefault();
            const index = parseInt(e.key) - 1;
            handlers.onTool?.(index);
            return;
        }
    }, [handlers, shortcuts, matchShortcut]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
}

interface KeyboardShortcutsPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

const SHORTCUT_LABELS: Record<string, string> = {
    spotlight: 'Otwórz wyszukiwarkę',
    stats: 'Statystyki',
    queue: 'Kolejka zadań',
    history: 'Historia',
    help: 'Pokaż skróty',
};

export function KeyboardShortcutsPanel({ isOpen, onClose }: KeyboardShortcutsPanelProps) {
    const { shortcuts, updateShortcut, resetToDefault } = useShortcutsConfig();
    const [editingAction, setEditingAction] = useState<string | null>(null);
    const [recordedKeys, setRecordedKeys] = useState<string[]>([]);

    useEffect(() => {
        if (!isOpen) return;
        const handleEsc = (e: KeyboardEvent) => {
            if (editingAction) {
                setEditingAction(null);
                setRecordedKeys([]);
            } else if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose, editingAction]);

    // Record new shortcut when editing
    useEffect(() => {
        if (!editingAction) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            const keys: string[] = [];
            if (e.ctrlKey || e.metaKey) keys.push('ctrl');
            if (e.shiftKey) keys.push('shift');
            if (e.altKey) keys.push('alt');

            const key = e.key.toLowerCase();
            if (!['control', 'shift', 'alt', 'meta'].includes(key)) {
                keys.push(key === ' ' ? 'space' : key);
                updateShortcut(editingAction, keys);
                setEditingAction(null);
                setRecordedKeys([]);
            } else {
                setRecordedKeys(keys);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [editingAction, updateShortcut]);

    if (!isOpen) return null;

    const formatKeys = (keys: string[]): string[] => {
        return keys.map(k => {
            if (k === 'ctrl') return 'Ctrl';
            if (k === 'shift') return 'Shift';
            if (k === 'alt') return 'Alt';
            if (k === 'space') return 'Space';
            return k.toUpperCase();
        });
    };

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.6)',
                    zIndex: 999,
                    animation: 'fadeIn 0.2s ease',
                }}
            />
            {/* Panel */}
            <div
                style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: '16px',
                    padding: '2rem',
                    zIndex: 1000,
                    minWidth: '450px',
                    animation: 'tooltipFadeIn 0.2s ease',
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
                }}
            >
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1.5rem',
                }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>⌨️ Skróty klawiszowe</h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            fontSize: '1.5rem',
                            cursor: 'pointer',
                            color: 'var(--text-muted)',
                        }}
                    >×</button>
                </div>

                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                    Kliknij na skrót aby go zmienić. Naciśnij Esc aby anulować.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {Object.entries(shortcuts).map(([action, keys]) => (
                        <div
                            key={action}
                            onClick={() => setEditingAction(action)}
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '0.75rem',
                                background: editingAction === action ? 'rgba(var(--accent-rgb), 0.1)' : 'var(--bg-tertiary)',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                border: editingAction === action ? '2px solid var(--accent)' : '2px solid transparent',
                                transition: 'all 0.2s',
                            }}
                        >
                            <span style={{ color: 'var(--text-gray)' }}>{SHORTCUT_LABELS[action] || action}</span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                {editingAction === action ? (
                                    recordedKeys.length > 0 ? (
                                        formatKeys(recordedKeys).map((key, j) => (
                                            <kbd
                                                key={j}
                                                style={{
                                                    padding: '4px 8px',
                                                    background: 'var(--accent)',
                                                    color: 'black',
                                                    border: '1px solid var(--accent)',
                                                    borderRadius: '6px',
                                                    fontSize: '12px',
                                                    fontFamily: 'monospace',
                                                    fontWeight: 600,
                                                }}
                                            >
                                                {key}
                                            </kbd>
                                        ))
                                    ) : (
                                        <span style={{ color: 'var(--accent)', fontSize: '12px' }}>Naciśnij klawisze...</span>
                                    )
                                ) : (
                                    formatKeys(keys).map((key, j) => (
                                        <kbd
                                            key={j}
                                            style={{
                                                padding: '4px 8px',
                                                background: 'var(--bg-input)',
                                                border: '1px solid var(--border)',
                                                borderRadius: '6px',
                                                fontSize: '12px',
                                                fontFamily: 'monospace',
                                                fontWeight: 600,
                                            }}
                                        >
                                            {key}
                                        </kbd>
                                    ))
                                )}
                            </div>
                        </div>
                    ))}

                    {/* Static shortcuts */}
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '0.75rem',
                            background: 'var(--bg-tertiary)',
                            borderRadius: '8px',
                            opacity: 0.6,
                        }}
                    >
                        <span style={{ color: 'var(--text-gray)' }}>Przełącz narzędzie</span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <kbd style={{
                                padding: '4px 8px',
                                background: 'var(--bg-input)',
                                border: '1px solid var(--border)',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontFamily: 'monospace',
                                fontWeight: 600,
                            }}>Ctrl</kbd>
                            <kbd style={{
                                padding: '4px 8px',
                                background: 'var(--bg-input)',
                                border: '1px solid var(--border)',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontFamily: 'monospace',
                                fontWeight: 600,
                            }}>1-9</kbd>
                        </div>
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '0.75rem',
                            background: 'var(--bg-tertiary)',
                            borderRadius: '8px',
                            opacity: 0.6,
                        }}
                    >
                        <span style={{ color: 'var(--text-gray)' }}>Zamknij panel</span>
                        <kbd style={{
                            padding: '4px 8px',
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontFamily: 'monospace',
                            fontWeight: 600,
                        }}>Esc</kbd>
                    </div>
                </div>

                <button
                    onClick={resetToDefault}
                    className="btn btn-secondary"
                    style={{ width: '100%', marginTop: '1.5rem' }}
                >
                    🔄 Przywróć domyślne
                </button>
            </div>
        </>
    );
}
