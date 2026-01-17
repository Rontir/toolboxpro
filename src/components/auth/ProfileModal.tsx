'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/config';

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
    const { user, refreshUser } = useAuth();
    const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile');
    const [displayName, setDisplayName] = useState(user?.display_name || '');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const getToken = () => localStorage.getItem('toolboxpro_access_token');

    const updateProfile = async () => {
        setIsLoading(true);
        setError('');
        setSuccess('');

        try {
            const res = await fetch(apiUrl(`/api/auth/profile?display_name=${encodeURIComponent(displayName)}`), {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });

            if (res.ok) {
                setSuccess('Profil zaktualizowany!');
                refreshUser?.();
            } else {
                const data = await res.json();
                setError(data.detail || 'Błąd aktualizacji profilu');
            }
        } catch {
            setError('Błąd połączenia');
        } finally {
            setIsLoading(false);
        }
    };

    const changePassword = async () => {
        if (newPassword !== confirmPassword) {
            setError('Hasła nie są identyczne');
            return;
        }
        if (newPassword.length < 8) {
            setError('Nowe hasło musi mieć minimum 8 znaków');
            return;
        }

        setIsLoading(true);
        setError('');
        setSuccess('');

        try {
            const res = await fetch(apiUrl(`/api/auth/change-password?current_password=${encodeURIComponent(currentPassword)}&new_password=${encodeURIComponent(newPassword)}`), {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });

            if (res.ok) {
                setSuccess('Hasło zmienione!');
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
            } else {
                const data = await res.json();
                setError(data.detail || 'Błąd zmiany hasła');
            }
        } catch {
            setError('Błąd połączenia');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen || !user) return null;

    const tabStyle = (active: boolean) => ({
        padding: '0.75rem 1.5rem',
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? 'black' : 'var(--text-muted)',
        border: 'none',
        borderRadius: '8px 8px 0 0',
        cursor: 'pointer',
        fontWeight: active ? 600 : 400,
        fontSize: '0.9rem'
    });

    const inputStyle = {
        width: '100%',
        padding: '0.75rem 1rem',
        background: 'var(--bg-tertiary)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        color: 'white',
        fontSize: '0.9rem'
    };

    return (
        <div
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0, 0, 0, 0.85)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 10000, backdropFilter: 'blur(4px)'
            }}
            onClick={onClose}
        >
            <div
                style={{
                    width: '100%', maxWidth: '500px',
                    background: 'var(--bg-primary)', borderRadius: '16px',
                    border: '1px solid var(--border)', overflow: 'hidden'
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>👤 Mój Profil</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '0.25rem', padding: '0 1.5rem', borderBottom: '1px solid var(--border)' }}>
                    <button style={tabStyle(activeTab === 'profile')} onClick={() => setActiveTab('profile')}>
                        ✏️ Dane
                    </button>
                    <button style={tabStyle(activeTab === 'password')} onClick={() => setActiveTab('password')}>
                        🔐 Hasło
                    </button>
                </div>

                {/* Messages */}
                {error && <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>{error}</div>}
                {success && <div style={{ padding: '1rem', background: 'rgba(34, 197, 94, 0.1)', color: 'var(--accent)' }}>✅ {success}</div>}

                {/* Content */}
                <div style={{ padding: '1.5rem' }}>
                    {activeTab === 'profile' ? (
                        <div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Email</label>
                                <input value={user.email} disabled style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }} />
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Rola</label>
                                <input value={user.role === 'admin' ? '👑 Administrator' : user.role === 'premium' ? '⭐ Premium' : '👤 Użytkownik'} disabled style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }} />
                            </div>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Nazwa wyświetlana</label>
                                <input value={displayName} onChange={e => setDisplayName(e.target.value)} style={inputStyle} placeholder="Twoja nazwa..." />
                            </div>
                            <button onClick={updateProfile} disabled={isLoading} style={{
                                width: '100%', padding: '0.875rem', background: 'var(--accent)', color: 'black',
                                border: 'none', borderRadius: '8px', cursor: isLoading ? 'wait' : 'pointer', fontWeight: 600
                            }}>
                                {isLoading ? 'Zapisywanie...' : '💾 Zapisz zmiany'}
                            </button>
                        </div>
                    ) : (
                        <div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Aktualne hasło</label>
                                <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} style={inputStyle} placeholder="••••••••" />
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Nowe hasło</label>
                                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={inputStyle} placeholder="Min. 8 znaków" />
                            </div>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Powtórz nowe hasło</label>
                                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} style={inputStyle} placeholder="••••••••" />
                            </div>
                            <button onClick={changePassword} disabled={isLoading} style={{
                                width: '100%', padding: '0.875rem', background: 'var(--accent)', color: 'black',
                                border: 'none', borderRadius: '8px', cursor: isLoading ? 'wait' : 'pointer', fontWeight: 600
                            }}>
                                {isLoading ? 'Zmienianie...' : '🔐 Zmień hasło'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
