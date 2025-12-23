'use client';

import { useCallback } from 'react';

interface ToolboxSettings {
    version: string;
    exportedAt: string;
    theme: 'dark' | 'light';
    shortcuts: Record<string, string[]>;
    favorites: string[];
    recentTools: string[];
    presets: Record<string, BatchPreset>;
}

interface BatchPreset {
    id: string;
    name: string;
    toolId: string;
    settings: Record<string, unknown>;
    createdAt: string;
}

const SETTINGS_VERSION = '1.0.0';

/**
 * Hook to export/import user settings
 */
export function useSettingsExportImport() {
    const exportSettings = useCallback(() => {
        try {
            // Gather all settings from localStorage
            const settings: ToolboxSettings = {
                version: SETTINGS_VERSION,
                exportedAt: new Date().toISOString(),
                theme: (localStorage.getItem('toolbox-theme') as 'dark' | 'light') || 'dark',
                shortcuts: JSON.parse(localStorage.getItem('toolbox-shortcuts') || '{}'),
                favorites: JSON.parse(localStorage.getItem('toolbox-favorites') || '[]'),
                recentTools: JSON.parse(localStorage.getItem('toolbox-recent') || '[]'),
                presets: JSON.parse(localStorage.getItem('toolbox-presets') || '{}'),
            };

            // Create and download file
            const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `toolbox-settings-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            return { success: true };
        } catch (error) {
            console.error('Export failed:', error);
            return { success: false, error: String(error) };
        }
    }, []);

    const importSettings = useCallback((file: File): Promise<{ success: boolean; error?: string }> => {
        return new Promise((resolve) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const content = e.target?.result as string;
                    const settings: ToolboxSettings = JSON.parse(content);

                    // Validate version
                    if (!settings.version) {
                        resolve({ success: false, error: 'Nieprawidłowy plik ustawień' });
                        return;
                    }

                    // Apply settings
                    if (settings.theme) {
                        localStorage.setItem('toolbox-theme', settings.theme);
                    }
                    if (settings.shortcuts && Object.keys(settings.shortcuts).length > 0) {
                        localStorage.setItem('toolbox-shortcuts', JSON.stringify(settings.shortcuts));
                    }
                    if (settings.favorites) {
                        localStorage.setItem('toolbox-favorites', JSON.stringify(settings.favorites));
                    }
                    if (settings.recentTools) {
                        localStorage.setItem('toolbox-recent', JSON.stringify(settings.recentTools));
                    }
                    if (settings.presets) {
                        localStorage.setItem('toolbox-presets', JSON.stringify(settings.presets));
                    }

                    resolve({ success: true });
                } catch (error) {
                    resolve({ success: false, error: 'Błąd parsowania pliku' });
                }
            };

            reader.onerror = () => {
                resolve({ success: false, error: 'Błąd odczytu pliku' });
            };

            reader.readAsText(file);
        });
    }, []);

    return { exportSettings, importSettings };
}

/**
 * Settings Export/Import Panel Component
 */
interface SettingsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onSettingsImported?: () => void;
}

export function SettingsExportImportPanel({ isOpen, onClose, onSettingsImported }: SettingsPanelProps) {
    const { exportSettings, importSettings } = useSettingsExportImport();

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const result = await importSettings(file);
        if (result.success) {
            onSettingsImported?.();
            onClose();
            // Reload to apply settings
            window.location.reload();
        } else {
            alert(`Import nie powiódł się: ${result.error}`);
        }
    };

    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.7)',
                backdropFilter: 'blur(8px)',
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: 'var(--bg-card)',
                    borderRadius: '16px',
                    padding: '2rem',
                    width: '100%',
                    maxWidth: '400px',
                    border: '1px solid var(--border)',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
                }}
            >
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1.5rem',
                }}>
                    <h2 style={{
                        fontSize: '1.25rem',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                    }}>
                        ⚙️ Ustawienia
                    </h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            fontSize: '1.5rem',
                            cursor: 'pointer',
                            color: 'var(--text-muted)',
                        }}
                    >
                        ×
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Export Button */}
                    <button
                        onClick={() => {
                            const result = exportSettings();
                            if (result.success) {
                                onClose();
                            }
                        }}
                        style={{
                            padding: '1rem',
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--border)',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            transition: 'all 0.2s',
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                    >
                        <span style={{ fontSize: '1.5rem' }}>📤</span>
                        <div style={{ textAlign: 'left' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-white)' }}>Eksportuj ustawienia</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Zapisz motyw, skróty i preferencje
                            </div>
                        </div>
                    </button>

                    {/* Import Button */}
                    <label
                        style={{
                            padding: '1rem',
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--border)',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            transition: 'all 0.2s',
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                    >
                        <span style={{ fontSize: '1.5rem' }}>📥</span>
                        <div style={{ textAlign: 'left' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-white)' }}>Importuj ustawienia</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Wczytaj z pliku JSON
                            </div>
                        </div>
                        <input
                            type="file"
                            accept=".json"
                            onChange={handleFileSelect}
                            style={{ display: 'none' }}
                        />
                    </label>
                </div>

                <div style={{
                    marginTop: '1.5rem',
                    padding: '0.75rem',
                    background: 'var(--bg-input)',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    textAlign: 'center',
                }}>
                    💡 Eksportowane: motyw, skróty, ulubione, ostatnio używane, presety
                </div>
            </div>
        </div>
    );
}
