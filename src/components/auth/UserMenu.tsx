'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import LoginModal from './LoginModal';
import RegisterModal from './RegisterModal';
import ProfileModal from './ProfileModal';

interface UserMenuProps {
    onOpenAdmin?: () => void;
}

export default function UserMenu({ onOpenAdmin }: UserMenuProps) {
    const { user, isAuthenticated, logout, isLoading } = useAuth();
    const { showToast } = useToast();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogout = () => {
        logout();
        showToast('Wylogowano pomyślnie', 'info', '🚪');
        setIsDropdownOpen(false);
    };

    const getRoleColor = (role: string) => {
        switch (role) {
            case 'admin': return '#ef4444';
            case 'premium': return '#f59e0b';
            default: return 'var(--accent)';
        }
    };

    const getRoleBadge = (role: string) => {
        switch (role) {
            case 'admin': return '👑 Admin';
            case 'premium': return '⭐ Premium';
            default: return '👤 User';
        }
    };

    if (isLoading) {
        return (
            <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'var(--bg-tertiary)',
                animation: 'pulse 1.5s infinite'
            }} />
        );
    }

    return (
        <>
            <div ref={dropdownRef} style={{ position: 'relative' }}>
                <button
                    onClick={() => isAuthenticated ? setIsDropdownOpen(!isDropdownOpen) : setShowLoginModal(true)}
                    style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '50%',
                        background: isAuthenticated ? 'linear-gradient(135deg, var(--accent), #15803d)' : 'var(--bg-tertiary)',
                        border: '2px solid',
                        borderColor: isAuthenticated ? 'var(--accent)' : 'var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        fontSize: '1.25rem'
                    }}
                    title={isAuthenticated ? user?.display_name || user?.email : 'Zaloguj się'}
                >
                    {isAuthenticated ? (
                        user?.display_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '👤'
                    ) : '👤'}
                </button>

                {/* Dropdown Menu */}
                {isDropdownOpen && isAuthenticated && (
                    <div style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: '0.5rem',
                        minWidth: '220px',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                        overflow: 'hidden',
                        zIndex: 1000,
                        animation: 'fadeIn 0.15s ease-out'
                    }}>
                        {/* User Info */}
                        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ fontWeight: 600, color: 'white', marginBottom: '0.25rem' }}>
                                {user?.display_name || user?.email}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {user?.email}
                            </div>
                            <span style={{
                                display: 'inline-block',
                                marginTop: '0.5rem',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '999px',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                background: getRoleColor(user?.role || 'user'),
                                color: 'white'
                            }}>
                                {getRoleBadge(user?.role || 'user')}
                            </span>
                        </div>

                        {/* Menu Items */}
                        <div style={{ padding: '0.5rem 0' }}>
                            <button
                                onClick={() => { setIsDropdownOpen(false); setShowProfileModal(true); }}
                                style={{
                                    width: '100%',
                                    padding: '0.75rem 1rem',
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--text-white)',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    fontSize: '0.875rem'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'none'}
                            >
                                👤 Mój Profil
                            </button>
                            {user?.role === 'admin' && onOpenAdmin && (
                                <button
                                    onClick={() => { setIsDropdownOpen(false); onOpenAdmin(); }}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem 1rem',
                                        background: 'none',
                                        border: 'none',
                                        color: 'var(--text-white)',
                                        textAlign: 'left',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.75rem',
                                        fontSize: '0.875rem'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                >
                                    ⚙️ Panel Admina
                                </button>
                            )}
                            <button
                                onClick={handleLogout}
                                style={{
                                    width: '100%',
                                    padding: '0.75rem 1rem',
                                    background: 'none',
                                    border: 'none',
                                    color: '#ef4444',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    fontSize: '0.875rem'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'none'}
                            >
                                🚪 Wyloguj
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Modals */}
            <LoginModal
                isOpen={showLoginModal}
                onClose={() => setShowLoginModal(false)}
                onSwitchToRegister={() => { setShowLoginModal(false); setShowRegisterModal(true); }}
            />
            <RegisterModal
                isOpen={showRegisterModal}
                onClose={() => setShowRegisterModal(false)}
                onSwitchToLogin={() => { setShowRegisterModal(false); setShowLoginModal(true); }}
            />
            <ProfileModal
                isOpen={showProfileModal}
                onClose={() => setShowProfileModal(false)}
            />

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            `}</style>
        </>
    );
}
