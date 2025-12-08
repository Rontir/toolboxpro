'use client';

import { useState, useEffect } from 'react';
import { useTheme } from './Theme';

const ACCENTS = [
    { name: 'Green', value: '#22c55e', hover: '#16a34a', rgb: '34, 197, 94' },
    { name: 'Blue', value: '#3b82f6', hover: '#2563eb', rgb: '59, 130, 246' },
    { name: 'Purple', value: '#a855f7', hover: '#9333ea', rgb: '168, 85, 247' },
    { name: 'Orange', value: '#f97316', hover: '#ea580c', rgb: '249, 115, 22' },
    { name: 'Pink', value: '#ec4899', hover: '#db2777', rgb: '236, 72, 153' },
    { name: 'Red', value: '#ef4444', hover: '#dc2626', rgb: '239, 68, 68' },
    { name: 'Cyan', value: '#06b6d4', hover: '#0891b2', rgb: '6, 182, 212' },
];

// Preset themes with BOTH dark and light variants
const PRESET_THEMES = [
    {
        id: 'default',
        name: 'Domyślny',
        icon: '⚡',
        dark: {
            bgMain: '#0a0a0a',
            bgSidebar: '#0f0f0f',
            bgCard: '#161616',
            bgCardHover: '#1c1c1c',
            bgInput: '#1a1a1a',
            bgTertiary: '#2a2a2a',
            border: '#222222',
            borderLight: '#2a2a2a',
            textWhite: '#ffffff',
            textGray: '#a1a1aa',
            textMuted: '#5c5c5c',
        },
        light: {
            bgMain: '#f5f5f7',
            bgSidebar: '#ffffff',
            bgCard: '#ffffff',
            bgCardHover: '#f0f0f2',
            bgInput: '#f5f5f7',
            bgTertiary: '#f0f0f2',
            border: '#d1d1d6',
            borderLight: '#e5e5ea',
            textWhite: '#1d1d1f',
            textGray: '#6e6e73',
            textMuted: '#8e8e93',
        }
    },
    {
        id: 'ocean',
        name: 'Ocean',
        icon: '🌊',
        dark: {
            bgMain: '#0a1628',
            bgSidebar: '#0c1a30',
            bgCard: '#0d1f3c',
            bgCardHover: '#112a4d',
            bgInput: '#0f2340',
            bgTertiary: '#11294d',
            border: '#1e3a5f',
            borderLight: '#254a75',
            textWhite: '#e0f2fe',
            textGray: '#7dd3fc',
            textMuted: '#38bdf8',
        },
        light: {
            bgMain: '#e0f2fe',
            bgSidebar: '#f0f9ff',
            bgCard: '#ffffff',
            bgCardHover: '#e0f2fe',
            bgInput: '#f0f9ff',
            bgTertiary: '#e0f2fe',
            border: '#7dd3fc',
            borderLight: '#bae6fd',
            textWhite: '#0c4a6e',
            textGray: '#0369a1',
            textMuted: '#0284c7',
        }
    },
    {
        id: 'forest',
        name: 'Forest',
        icon: '🌲',
        dark: {
            bgMain: '#0a1a0f',
            bgSidebar: '#0c1f12',
            bgCard: '#0f2616',
            bgCardHover: '#14321d',
            bgInput: '#112b18',
            bgTertiary: '#14321d',
            border: '#1a4027',
            borderLight: '#225532',
            textWhite: '#ecfdf5',
            textGray: '#86efac',
            textMuted: '#4ade80',
        },
        light: {
            bgMain: '#ecfdf5',
            bgSidebar: '#f0fdf4',
            bgCard: '#ffffff',
            bgCardHover: '#dcfce7',
            bgInput: '#f0fdf4',
            bgTertiary: '#dcfce7',
            border: '#86efac',
            borderLight: '#bbf7d0',
            textWhite: '#14532d',
            textGray: '#166534',
            textMuted: '#15803d',
        }
    },
    {
        id: 'sunset',
        name: 'Sunset',
        icon: '🌅',
        dark: {
            bgMain: '#1a0a0a',
            bgSidebar: '#1f0c0c',
            bgCard: '#261010',
            bgCardHover: '#321414',
            bgInput: '#2b1212',
            bgTertiary: '#321414',
            border: '#4a1c1c',
            borderLight: '#5c2424',
            textWhite: '#fef2f2',
            textGray: '#fca5a5',
            textMuted: '#f87171',
        },
        light: {
            bgMain: '#fef2f2',
            bgSidebar: '#fff5f5',
            bgCard: '#ffffff',
            bgCardHover: '#fee2e2',
            bgInput: '#fff5f5',
            bgTertiary: '#fee2e2',
            border: '#fca5a5',
            borderLight: '#fecaca',
            textWhite: '#7f1d1d',
            textGray: '#b91c1c',
            textMuted: '#dc2626',
        }
    },
    {
        id: 'midnight',
        name: 'Midnight',
        icon: '🌙',
        dark: {
            bgMain: '#0f0a1a',
            bgSidebar: '#120c1f',
            bgCard: '#161026',
            bgCardHover: '#1c1432',
            bgInput: '#18122b',
            bgTertiary: '#1c1432',
            border: '#2e1f4a',
            borderLight: '#3a285c',
            textWhite: '#f5f3ff',
            textGray: '#c4b5fd',
            textMuted: '#a78bfa',
        },
        light: {
            bgMain: '#f5f3ff',
            bgSidebar: '#faf5ff',
            bgCard: '#ffffff',
            bgCardHover: '#ede9fe',
            bgInput: '#faf5ff',
            bgTertiary: '#ede9fe',
            border: '#c4b5fd',
            borderLight: '#ddd6fe',
            textWhite: '#4c1d95',
            textGray: '#6d28d9',
            textMuted: '#7c3aed',
        }
    },
    {
        id: 'highcontrast',
        name: 'Wysoki kontrast',
        icon: '◐',
        dark: {
            bgMain: '#000000',
            bgSidebar: '#000000',
            bgCard: '#0a0a0a',
            bgCardHover: '#141414',
            bgInput: '#0a0a0a',
            bgTertiary: '#141414',
            border: '#333333',
            borderLight: '#444444',
            textWhite: '#ffffff',
            textGray: '#e0e0e0',
            textMuted: '#b0b0b0',
        },
        light: {
            bgMain: '#ffffff',
            bgSidebar: '#ffffff',
            bgCard: '#f5f5f5',
            bgCardHover: '#ebebeb',
            bgInput: '#f5f5f5',
            bgTertiary: '#ebebeb',
            border: '#333333',
            borderLight: '#666666',
            textWhite: '#000000',
            textGray: '#1a1a1a',
            textMuted: '#333333',
        }
    },
];

export function ThemeCustomizer() {
    const { theme } = useTheme();
    const [isOpen, setIsOpen] = useState(false);
    const [currentAccent, setCurrentAccent] = useState(ACCENTS[0].value);
    const [currentPreset, setCurrentPreset] = useState('default');

    // Get the localStorage key for accent based on current theme
    const getAccentKey = (themeMode: 'dark' | 'light') => `accent-color-${themeMode}`;
    const getPresetKey = (themeMode: 'dark' | 'light') => `theme-preset-${themeMode}`;

    // Load saved preferences on mount and when theme changes
    useEffect(() => {
        const savedAccent = localStorage.getItem(getAccentKey(theme));

        if (savedAccent) {
            const accent = ACCENTS.find(a => a.value === savedAccent) || ACCENTS[0];
            applyAccentColors(accent);
            setCurrentAccent(accent.value);
        } else {
            // Default accent if none saved for this mode
            applyAccentColors(ACCENTS[0]);
            setCurrentAccent(ACCENTS[0].value);
        }

        // Load preset for current theme mode
        const savedPresetMode = localStorage.getItem(getPresetKey(theme));
        if (savedPresetMode) {
            setCurrentPreset(savedPresetMode);
            applyPresetColors(savedPresetMode, theme);
        } else {
            // Default preset if none saved
            setCurrentPreset('default');
            applyPresetColors('default', theme);
        }
    }, [theme]);

    // Apply accent colors to CSS variables without saving
    const applyAccentColors = (accent: typeof ACCENTS[0]) => {
        document.documentElement.style.setProperty('--accent', accent.value);
        document.documentElement.style.setProperty('--accent-hover', accent.hover);
        document.documentElement.style.setProperty('--accent-glow', `rgba(${accent.rgb}, 0.25)`);
        document.documentElement.style.setProperty('--accent-rgb', accent.rgb);
        document.documentElement.style.setProperty('--bg-pill-active', accent.value);
    };

    // Apply and save accent for current theme mode
    const applyAccent = (accent: typeof ACCENTS[0]) => {
        setCurrentAccent(accent.value);
        applyAccentColors(accent);
        localStorage.setItem(getAccentKey(theme), accent.value);
    };

    // Apply preset colors to CSS variables without saving
    const applyPresetColors = (presetId: string, currentTheme: 'dark' | 'light') => {
        const preset = PRESET_THEMES.find(p => p.id === presetId);
        if (!preset) return;

        const colors = currentTheme === 'dark' ? preset.dark : preset.light;

        document.documentElement.style.setProperty('--bg-main', colors.bgMain);
        document.documentElement.style.setProperty('--bg-sidebar', colors.bgSidebar);
        document.documentElement.style.setProperty('--bg-card', colors.bgCard);
        document.documentElement.style.setProperty('--bg-card-hover', colors.bgCardHover);
        document.documentElement.style.setProperty('--bg-input', colors.bgInput);
        document.documentElement.style.setProperty('--bg-tertiary', colors.bgTertiary);
        document.documentElement.style.setProperty('--border', colors.border);
        document.documentElement.style.setProperty('--border-light', colors.borderLight);
        document.documentElement.style.setProperty('--text-white', colors.textWhite);
        document.documentElement.style.setProperty('--text-gray', colors.textGray);
        document.documentElement.style.setProperty('--text-muted', colors.textMuted);
    };

    // Apply and save preset for current theme mode
    const applyPreset = (presetId: string) => {
        setCurrentPreset(presetId);
        applyPresetColors(presetId, theme);
        localStorage.setItem(getPresetKey(theme), presetId);
    };

    return (
        <div style={{ position: 'relative' }}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="navbar-icon"
                title="Dostosuj motyw"
                style={{ color: currentAccent }}
            >
                🎨
            </button>

            {isOpen && (
                <>
                    <div
                        style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                        onClick={() => setIsOpen(false)}
                    />
                    <div style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: '0.5rem',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                        padding: '1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1rem',
                        zIndex: 100,
                        boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                        minWidth: '280px',
                        animation: 'spotlight-fade-in 0.2s ease-out'
                    }}>
                        {/* Preset Themes */}
                        <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                Motyw kolorystyczny
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                                {PRESET_THEMES.map(preset => (
                                    <button
                                        key={preset.id}
                                        onClick={() => applyPreset(preset.id)}
                                        title={preset.name}
                                        style={{
                                            padding: '0.5rem',
                                            borderRadius: '8px',
                                            background: currentPreset === preset.id ? 'var(--accent)' : 'var(--bg-tertiary)',
                                            border: currentPreset === preset.id ? '2px solid var(--accent)' : '2px solid transparent',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            gap: '0.25rem',
                                            transition: 'all 0.2s ease',
                                            color: currentPreset === preset.id ? 'white' : 'var(--text-white)',
                                        }}
                                    >
                                        <span style={{ fontSize: '1.25rem' }}>{preset.icon}</span>
                                        <span style={{ fontSize: '0.65rem' }}>{preset.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Accent Colors */}
                        <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                Kolor akcentu
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {ACCENTS.map(accent => (
                                    <button
                                        key={accent.name}
                                        onClick={() => applyAccent(accent)}
                                        title={accent.name}
                                        style={{
                                            width: '28px',
                                            height: '28px',
                                            borderRadius: '50%',
                                            background: accent.value,
                                            border: currentAccent === accent.value ? '2px solid var(--text-white)' : '2px solid transparent',
                                            outline: currentAccent === accent.value ? `2px solid ${accent.value}` : 'none',
                                            cursor: 'pointer',
                                            transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.15)'}
                                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                    >
                                        {currentAccent === accent.value && <span style={{ color: 'white', fontSize: '10px', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>✓</span>}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
