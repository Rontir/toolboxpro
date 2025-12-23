'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<Theme>('dark');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const savedTheme = localStorage.getItem('toolbox-theme') as Theme | null;
        if (savedTheme) {
            setThemeState(savedTheme);
        } else {
            // Auto-detect system preference if no saved theme
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            setThemeState(prefersDark ? 'dark' : 'light');
        }
        setMounted(true);

        // Listen for system theme changes
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = (e: MediaQueryListEvent) => {
            // Only auto-switch if user hasn't manually set a preference
            if (!localStorage.getItem('toolbox-theme')) {
                setThemeState(e.matches ? 'dark' : 'light');
            }
        };
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    useEffect(() => {
        if (!mounted) return;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('toolbox-theme', theme);
    }, [theme, mounted]);

    const toggleTheme = () => {
        setThemeState(prev => prev === 'dark' ? 'light' : 'dark');
    };

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}

// Elegant theme toggle with glassmorphism flash + corner glows
export function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();
    const [isAnimating, setIsAnimating] = useState(false);

    const handleClick = () => {
        if (isAnimating) return;

        setIsAnimating(true);
        const isGoingLight = theme === 'dark';

        // Toggle theme immediately
        toggleTheme();

        // Create glassmorphism sweep flash
        const flash = document.createElement('div');
        flash.className = `theme-glass-flash ${isGoingLight ? 'to-light' : 'to-dark'}`;
        document.body.appendChild(flash);

        // Create corner glows for accent
        const glowTR = document.createElement('div');
        glowTR.className = `theme-corner-glow top-right ${isGoingLight ? 'to-light' : 'to-dark'}`;
        document.body.appendChild(glowTR);

        const glowBL = document.createElement('div');
        glowBL.className = `theme-corner-glow bottom-left ${isGoingLight ? 'to-light' : 'to-dark'}`;
        document.body.appendChild(glowBL);

        // Cleanup
        setTimeout(() => {
            flash.remove();
            glowTR.remove();
            glowBL.remove();
            setIsAnimating(false);
        }, 1500);
    };

    return (
        <button
            onClick={handleClick}
            className={`theme-toggle navbar-icon ${isAnimating ? 'animating' : ''}`}
            title={theme === 'dark' ? 'Jasny motyw' : 'Ciemny motyw'}
            disabled={isAnimating}
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.25rem'
            }}
        >
            <span
                style={{
                    display: 'inline-block',
                    transition: 'transform 0.3s ease-out',
                    transform: isAnimating ? 'scale(1.2)' : 'scale(1)',
                }}
            >
                {theme === 'dark' ? '🌙' : '☀️'}
            </span>
        </button>
    );
}
