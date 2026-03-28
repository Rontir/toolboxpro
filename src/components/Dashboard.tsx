'use client';

import { useFavorites } from './Favorites';
import { useStats } from './Stats';
import { useEffect, useState } from 'react';

interface DashboardProps {
    tools: any[];
    onNavigate: (toolId: string) => void;
}

const TIPS = [
    { icon: '💡', text: 'Przeciągnij plik na stronę aby automatycznie wybrać odpowiednie narzędzie!' },
    { icon: '⌨️', text: 'Użyj Ctrl+K aby szybko wyszukać narzędzie lub plik.' },
    { icon: '⭐', text: 'Kliknij gwiazdkę przy narzędziu, aby dodać je do ulubionych.' },
    { icon: '🎨', text: 'Kliknij ikonę 🎨 w nawigacji, aby zmienić kolor akcentu.' },
    { icon: '☀️', text: 'Kliknij ikonę słońca/księżyca aby przełączyć tryb jasny/ciemny.' },
    { icon: '📊', text: 'Wszystkie przetworzone pliki są liczone w statystykach!' },
    { icon: '🚀', text: 'Excel Splitter może podzielić plik na setki arkuszy w sekundy.' },
];

function getGreeting(): { text: string; emoji: string } {
    const hour = new Date().getHours();

    if (hour >= 5 && hour < 12) {
        return { text: 'Dzień dobry', emoji: '☀️' };
    } else if (hour >= 12 && hour < 18) {
        return { text: 'Cześć', emoji: '👋' };
    } else if (hour >= 18 && hour < 22) {
        return { text: 'Dobry wieczór', emoji: '🌆' };
    } else {
        return { text: 'Nocna zmiana?', emoji: '🌙' };
    }
}

export function Dashboard({ tools, onNavigate }: DashboardProps) {
    const { favorites } = useFavorites();
    const { stats } = useStats();
    const [mounted, setMounted] = useState(false);
    const [tipIndex, setTipIndex] = useState(0);
    const [greeting, setGreeting] = useState({ text: 'Cześć', emoji: '👋' });

    useEffect(() => {
        const timer = setTimeout(() => setMounted(true), 50);

        // Set greeting based on time
        setGreeting(getGreeting());

        // Random tip on load
        setTipIndex(Math.floor(Math.random() * TIPS.length));

        // Rotate tips every 8 seconds
        const rotateTip = () => {
            if (!document.hidden) {
                setTipIndex(prev => (prev + 1) % TIPS.length);
            }
        };

        const tipInterval = setInterval(rotateTip, 8000);

        return () => {
            clearTimeout(timer);
            clearInterval(tipInterval);
        };
    }, []);

    const favoriteTools = tools.filter(t => favorites.includes(t.id) && t.id !== 'dashboard');

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const card = e.currentTarget;
        const rect = card.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        card.style.setProperty('--mouse-x', `${x}%`);
        card.style.setProperty('--mouse-y', `${y}%`);
    };

    const currentTip = TIPS[tipIndex];

    return (
        <div className={`dashboard-container ${mounted ? 'mounted' : ''}`} style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
            <header style={{ marginBottom: '2rem' }}>
                <h1 style={{
                    fontSize: '2.5rem',
                    fontWeight: 800,
                    marginBottom: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                }}>
                    <span style={{
                        background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent'
                    }}>
                        {greeting.text}
                    </span>
                    <span className="animate-wave" style={{ fontSize: '2.5rem' }}>{greeting.emoji}</span>
                </h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
                    Twoje centrum dowodzenia e-commerce. Co dzisiaj robimy?
                </p>
            </header>

            {/* Rotating Tip */}
            <div
                className="card"
                style={{
                    padding: '1rem 1.5rem',
                    marginBottom: '2rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    borderLeft: '3px solid var(--accent)',
                    animation: 'spotlight-fade-in 0.5s ease-out'
                }}
                key={tipIndex}
            >
                <span style={{ fontSize: '1.5rem' }}>{currentTip.icon}</span>
                <span style={{ color: 'var(--text-gray)', fontSize: '0.95rem' }}>
                    {currentTip.text}
                </span>
            </div>

            {/* Stats Overview */}
            <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
                <div className="card stat-card" style={{ padding: '1.5rem' }} onMouseMove={handleMouseMove}>
                    <div className="stat-icon" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📊</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Przetworzone pliki</div>
                    <div className="stat-value" style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--accent)' }}>{stats.filesProcessed}</div>
                </div>
                <div className="card stat-card" style={{ padding: '1.5rem' }} onMouseMove={handleMouseMove}>
                    <div className="stat-icon" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏱️</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Zaoszczędzony czas</div>
                    <div className="stat-value" style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--accent)' }}>~{Math.round(stats.filesProcessed * 2)} min</div>
                </div>
                <div className="card stat-card" style={{ padding: '1.5rem' }} onMouseMove={handleMouseMove}>
                    <div className="stat-icon" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⭐</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Ulubione narzędzia</div>
                    <div className="stat-value" style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--accent)' }}>{favorites.length}</div>
                </div>
            </div>

            {/* Favorites */}
            {favoriteTools.length > 0 && (
                <section style={{ marginBottom: '3rem' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>⭐</span> Ulubione
                    </h2>
                    <div className="tools-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1.5rem' }}>
                        {favoriteTools.map(tool => (
                            <div
                                key={tool.id}
                                className="card tool-card"
                                onClick={() => onNavigate(tool.id)}
                                onMouseMove={handleMouseMove}
                                style={{
                                    padding: '1.5rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '1rem'
                                }}
                            >
                                <div className="tool-icon" style={{ fontSize: '2.5rem' }}>{tool.icon}</div>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.25rem' }}>{tool.name}</div>
                                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{tool.desc}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* All Tools Grid */}
            <section>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>🚀</span> Wszystkie narzędzia
                </h2>
                <div className="tools-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1.5rem' }}>
                    {tools.filter(t => !favorites.includes(t.id) && t.id !== 'dashboard').map(tool => (
                        <div
                            key={tool.id}
                            className="card tool-card"
                            onClick={() => onNavigate(tool.id)}
                            onMouseMove={handleMouseMove}
                            style={{
                                padding: '1.5rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1rem'
                            }}
                        >
                            <div className="tool-icon" style={{ fontSize: '2rem' }}>{tool.icon}</div>
                            <div>
                                <div style={{ fontWeight: 600 }}>{tool.name}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{tool.desc}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
