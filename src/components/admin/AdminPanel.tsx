'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/config';

interface User {
    id: number;
    email: string;
    display_name: string | null;
    role: string;
    is_active: boolean;
    created_at: string | null;
    tool_permissions: string[];
}

const TOOL_LABELS: Record<string, string> = {
    'piko_empiko': '📥 PikoEmpiko',
    'structure_matcher': '🔗 Dopasowywacz'
};

interface AdminPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function AdminPanel({ isOpen, onClose }: AdminPanelProps) {
    const { user } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const fetchUsers = async () => {
        if (!user || user.role !== 'admin') return;

        setIsLoading(true);
        setError('');

        try {
            const token = localStorage.getItem('toolboxpro_access_token');
            const res = await fetch(apiUrl('/api/admin/users'), {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const data = await res.json();
                setUsers(data);
            } else {
                setError('Nie udało się pobrać użytkowników');
            }
        } catch (err) {
            setError('Błąd połączenia');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchUsers();
        }
    }, [isOpen]);

    const grantTool = async (userId: number, toolId: string) => {
        try {
            const token = localStorage.getItem('toolboxpro_access_token');
            const res = await fetch(apiUrl('/api/admin/grant-tool'), {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ user_id: userId, tool_id: toolId })
            });

            if (res.ok) {
                setSuccessMessage(`Nadano dostęp do ${TOOL_LABELS[toolId] || toolId}`);
                setTimeout(() => setSuccessMessage(''), 3000);
                fetchUsers();
            }
        } catch (err) {
            setError('Błąd nadawania uprawnień');
        }
    };

    const revokeTool = async (userId: number, toolId: string) => {
        try {
            const token = localStorage.getItem('toolboxpro_access_token');
            const res = await fetch(apiUrl('/api/admin/revoke-tool'), {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ user_id: userId, tool_id: toolId })
            });

            if (res.ok) {
                setSuccessMessage(`Odebrano dostęp do ${TOOL_LABELS[toolId] || toolId}`);
                setTimeout(() => setSuccessMessage(''), 3000);
                fetchUsers();
            }
        } catch (err) {
            setError('Błąd odbierania uprawnień');
        }
    };

    const setRole = async (userId: number, role: string) => {
        try {
            const token = localStorage.getItem('toolboxpro_access_token');
            const res = await fetch(apiUrl(`/api/admin/set-role?user_id=${userId}&role=${role}`), {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                setSuccessMessage(`Zmieniono rolę na ${role}`);
                setTimeout(() => setSuccessMessage(''), 3000);
                fetchUsers();
            }
        } catch (err) {
            setError('Błąd zmiany roli');
        }
    };

    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.85)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10000,
                backdropFilter: 'blur(4px)'
            }}
            onClick={onClose}
        >
            <div
                style={{
                    width: '100%',
                    maxWidth: '900px',
                    maxHeight: '80vh',
                    background: 'var(--bg-primary)',
                    borderRadius: '16px',
                    border: '1px solid var(--border)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    padding: '1.25rem 1.5rem',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
                        ⚙️ Panel Administratora
                    </h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            fontSize: '1.5rem',
                            cursor: 'pointer'
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Messages */}
                {error && (
                    <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                        {error}
                    </div>
                )}
                {successMessage && (
                    <div style={{ padding: '1rem', background: 'rgba(34, 197, 94, 0.1)', color: 'var(--accent)' }}>
                        ✅ {successMessage}
                    </div>
                )}

                {/* Content */}
                <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
                    {isLoading ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                            Ładowanie...
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Użytkownik</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Rola</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Uprawnienia</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 500 }}>Akcje</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(u => (
                                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '0.75rem' }}>
                                            <div style={{ fontWeight: 500 }}>{u.display_name || u.email}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.email}</div>
                                        </td>
                                        <td style={{ padding: '0.75rem' }}>
                                            <select
                                                value={u.role}
                                                onChange={e => setRole(u.id, e.target.value)}
                                                style={{
                                                    padding: '0.5rem',
                                                    background: 'var(--bg-tertiary)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '6px',
                                                    color: 'white',
                                                    fontSize: '0.875rem'
                                                }}
                                            >
                                                <option value="user">👤 User</option>
                                                <option value="premium">⭐ Premium</option>
                                                <option value="admin">👑 Admin</option>
                                            </select>
                                        </td>
                                        <td style={{ padding: '0.75rem' }}>
                                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                {u.tool_permissions.map(tool => (
                                                    <span key={tool} style={{
                                                        padding: '0.25rem 0.5rem',
                                                        background: 'var(--accent)',
                                                        color: 'black',
                                                        borderRadius: '4px',
                                                        fontSize: '0.7rem',
                                                        fontWeight: 600
                                                    }}>
                                                        {TOOL_LABELS[tool] || tool}
                                                    </span>
                                                ))}
                                                {u.tool_permissions.length === 0 && u.role === 'user' && (
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Brak</span>
                                                )}
                                                {(u.role === 'premium' || u.role === 'admin') && (
                                                    <span style={{ color: 'var(--accent)', fontSize: '0.75rem' }}>Pełny dostęp</span>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.75rem' }}>
                                            {u.role === 'user' && (
                                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                                                    {Object.keys(TOOL_LABELS).map(toolId => {
                                                        const hasAccess = u.tool_permissions.includes(toolId);
                                                        return (
                                                            <button
                                                                key={toolId}
                                                                onClick={() => hasAccess ? revokeTool(u.id, toolId) : grantTool(u.id, toolId)}
                                                                style={{
                                                                    padding: '0.375rem 0.75rem',
                                                                    background: hasAccess ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                                                                    border: `1px solid ${hasAccess ? '#ef4444' : 'var(--accent)'}`,
                                                                    borderRadius: '6px',
                                                                    color: hasAccess ? '#ef4444' : 'var(--accent)',
                                                                    cursor: 'pointer',
                                                                    fontSize: '0.75rem'
                                                                }}
                                                            >
                                                                {hasAccess ? '❌' : '✅'} {TOOL_LABELS[toolId].split(' ')[1]}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
