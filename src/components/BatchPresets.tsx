'use client';

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';

interface BatchPreset {
    id: string;
    name: string;
    toolId: string;
    icon: string;
    settings: Record<string, unknown>;
    createdAt: string;
    usageCount: number;
}

interface PresetsContextType {
    presets: BatchPreset[];
    addPreset: (preset: Omit<BatchPreset, 'id' | 'createdAt' | 'usageCount'>) => void;
    updatePreset: (id: string, updates: Partial<BatchPreset>) => void;
    deletePreset: (id: string) => void;
    getPresetsForTool: (toolId: string) => BatchPreset[];
    applyPreset: (id: string) => BatchPreset | undefined;
}

const PresetsContext = createContext<PresetsContextType | null>(null);
const STORAGE_KEY = 'toolbox-presets';

export function PresetsProvider({ children }: { children: ReactNode }) {
    const [presets, setPresets] = useState<BatchPreset[]>([]);

    // Load from localStorage
    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                setPresets(JSON.parse(saved));
            } catch (e) {
                console.error('Failed to load presets:', e);
            }
        }
    }, []);

    // Save to localStorage
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    }, [presets]);

    const addPreset = useCallback((preset: Omit<BatchPreset, 'id' | 'createdAt' | 'usageCount'>) => {
        const newPreset: BatchPreset = {
            ...preset,
            id: Date.now().toString(),
            createdAt: new Date().toISOString(),
            usageCount: 0,
        };
        setPresets(prev => [...prev, newPreset]);
    }, []);

    const updatePreset = useCallback((id: string, updates: Partial<BatchPreset>) => {
        setPresets(prev => prev.map(p =>
            p.id === id ? { ...p, ...updates } : p
        ));
    }, []);

    const deletePreset = useCallback((id: string) => {
        setPresets(prev => prev.filter(p => p.id !== id));
    }, []);

    const getPresetsForTool = useCallback((toolId: string) => {
        return presets.filter(p => p.toolId === toolId);
    }, [presets]);

    const applyPreset = useCallback((id: string) => {
        const preset = presets.find(p => p.id === id);
        if (preset) {
            // Increment usage count
            updatePreset(id, { usageCount: preset.usageCount + 1 });
            return preset;
        }
        return undefined;
    }, [presets, updatePreset]);

    return (
        <PresetsContext.Provider value={{
            presets,
            addPreset,
            updatePreset,
            deletePreset,
            getPresetsForTool,
            applyPreset,
        }}>
            {children}
        </PresetsContext.Provider>
    );
}

export function usePresets() {
    const context = useContext(PresetsContext);
    if (!context) {
        throw new Error('usePresets must be used within PresetsProvider');
    }
    return context;
}

/**
 * Preset selector dropdown component
 */
interface PresetSelectorProps {
    toolId: string;
    toolIcon: string;
    onSelect: (settings: Record<string, unknown>) => void;
    currentSettings?: Record<string, unknown>;
}

export function PresetSelector({ toolId, toolIcon, onSelect, currentSettings }: PresetSelectorProps) {
    const { getPresetsForTool, addPreset, deletePreset, applyPreset } = usePresets();
    const [isOpen, setIsOpen] = useState(false);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [presetName, setPresetName] = useState('');

    const toolPresets = getPresetsForTool(toolId);

    const handleSavePreset = () => {
        if (!presetName.trim() || !currentSettings) return;

        addPreset({
            name: presetName.trim(),
            toolId,
            icon: toolIcon,
            settings: currentSettings,
        });

        setPresetName('');
        setShowSaveModal(false);
    };

    const handleApplyPreset = (id: string) => {
        const preset = applyPreset(id);
        if (preset) {
            onSelect(preset.settings);
        }
        setIsOpen(false);
    };

    return (
        <div style={{ position: 'relative' }}>
            {/* Trigger button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    color: 'var(--text-gray)',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    transition: 'all 0.2s',
                }}
            >
                <span>📋</span>
                Presety ({toolPresets.length})
                <span style={{ fontSize: '0.75rem' }}>{isOpen ? '▲' : '▼'}</span>
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div
                    style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        marginTop: '0.5rem',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                        minWidth: '250px',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
                        zIndex: 100,
                        overflow: 'hidden',
                    }}
                >
                    {/* Presets list */}
                    {toolPresets.length > 0 ? (
                        <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                            {toolPresets.map(preset => (
                                <div
                                    key={preset.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.75rem',
                                        padding: '0.75rem 1rem',
                                        borderBottom: '1px solid var(--border)',
                                        cursor: 'pointer',
                                        transition: 'background 0.2s',
                                    }}
                                    onClick={() => handleApplyPreset(preset.id)}
                                    onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                                    onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    <span style={{ fontSize: '1.25rem' }}>{preset.icon}</span>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{preset.name}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                            Użyto {preset.usageCount}×
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            deletePreset(preset.id);
                                        }}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            color: 'var(--text-muted)',
                                            fontSize: '1rem',
                                            opacity: 0.6,
                                        }}
                                    >
                                        🗑️
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{
                            padding: '1.5rem',
                            textAlign: 'center',
                            color: 'var(--text-muted)',
                            fontSize: '0.875rem',
                        }}>
                            Brak zapisanych presetów
                        </div>
                    )}

                    {/* Add new preset */}
                    <button
                        onClick={() => setShowSaveModal(true)}
                        style={{
                            width: '100%',
                            padding: '0.75rem',
                            background: 'var(--bg-tertiary)',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--accent)',
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                        }}
                    >
                        ➕ Zapisz obecne ustawienia
                    </button>
                </div>
            )}

            {/* Save modal */}
            {showSaveModal && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.7)',
                        zIndex: 10000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                    onClick={() => setShowSaveModal(false)}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: 'var(--bg-card)',
                            borderRadius: '16px',
                            padding: '1.5rem',
                            width: '100%',
                            maxWidth: '300px',
                        }}
                    >
                        <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>💾 Zapisz preset</h3>
                        <input
                            type="text"
                            value={presetName}
                            onChange={(e) => setPresetName(e.target.value)}
                            placeholder="Nazwa presetu..."
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                background: 'var(--bg-input)',
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                color: 'var(--text-white)',
                                marginBottom: '1rem',
                            }}
                            autoFocus
                        />
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                onClick={() => setShowSaveModal(false)}
                                style={{
                                    flex: 1,
                                    padding: '0.5rem',
                                    background: 'var(--bg-tertiary)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    color: 'var(--text-gray)',
                                }}
                            >
                                Anuluj
                            </button>
                            <button
                                onClick={handleSavePreset}
                                disabled={!presetName.trim()}
                                style={{
                                    flex: 1,
                                    padding: '0.5rem',
                                    background: 'var(--accent)',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: presetName.trim() ? 'pointer' : 'not-allowed',
                                    color: 'white',
                                    fontWeight: 600,
                                    opacity: presetName.trim() ? 1 : 0.5,
                                }}
                            >
                                Zapisz
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
