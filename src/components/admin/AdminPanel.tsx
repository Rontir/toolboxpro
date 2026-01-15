'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/config';

interface GroupInfo {
    id: number;
    name: string;
    color: string;
}

interface User {
    id: number;
    email: string;
    display_name: string | null;
    role: string;
    is_active: boolean;
    created_at: string | null;
    tool_permissions: string[];
    groups: GroupInfo[];
}

interface Group {
    id: number;
    name: string;
    color: string;
    description: string;
    tool_ids: string[];
    user_ids: number[];
    user_count: number;
    created_at: string | null;
}

const TOOL_LABELS: Record<string, string> = {
    'piko_empiko': '📥 PikoEmpiko',
    'structure_matcher': '🔗 Dopasowywacz'
};

const ALL_TOOLS = Object.keys(TOOL_LABELS);

interface AdminPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function AdminPanel({ isOpen, onClose }: AdminPanelProps) {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'users' | 'groups'>('users');
    const [users, setUsers] = useState<User[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    // Group creation modal
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [editingGroup, setEditingGroup] = useState<Group | null>(null);
    const [groupName, setGroupName] = useState('');
    const [groupColor, setGroupColor] = useState('#6366f1');
    const [groupDescription, setGroupDescription] = useState('');
    const [groupTools, setGroupTools] = useState<string[]>([]);

    const getToken = () => localStorage.getItem('toolboxpro_access_token');

    const fetchUsers = async () => {
        if (!user || user.role !== 'admin') return;
        setIsLoading(true);
        try {
            const res = await fetch(apiUrl('/api/admin/users'), {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) setUsers(await res.json());
            else setError('Nie udało się pobrać użytkowników');
        } catch { setError('Błąd połączenia'); }
        finally { setIsLoading(false); }
    };

    const fetchGroups = async () => {
        if (!user || user.role !== 'admin') return;
        setIsLoading(true);
        try {
            const res = await fetch(apiUrl('/api/admin/groups'), {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) setGroups(await res.json());
            else setError('Nie udało się pobrać grup');
        } catch { setError('Błąd połączenia'); }
        finally { setIsLoading(false); }
    };

    useEffect(() => {
        if (isOpen) {
            fetchUsers();
            fetchGroups();
        }
    }, [isOpen]);

    const showSuccess = (msg: string) => {
        setSuccessMessage(msg);
        setTimeout(() => setSuccessMessage(''), 3000);
    };

    // User actions
    const setRole = async (userId: number, role: string) => {
        try {
            const res = await fetch(apiUrl(`/api/admin/set-role?user_id=${userId}&role=${role}`), {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) { showSuccess(`Zmieniono rolę na ${role}`); fetchUsers(); }
        } catch { setError('Błąd zmiany roli'); }
    };

    const addUserToGroup = async (userId: number, groupId: number) => {
        try {
            const res = await fetch(apiUrl(`/api/admin/groups/${groupId}/add-user/${userId}`), {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) { showSuccess('Dodano do grupy'); fetchUsers(); fetchGroups(); }
        } catch { setError('Błąd dodawania do grupy'); }
    };

    const removeUserFromGroup = async (userId: number, groupId: number) => {
        try {
            const res = await fetch(apiUrl(`/api/admin/groups/${groupId}/remove-user/${userId}`), {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) { showSuccess('Usunięto z grupy'); fetchUsers(); fetchGroups(); }
        } catch { setError('Błąd usuwania z grupy'); }
    };

    // Group actions
    const openGroupModal = (group?: Group) => {
        if (group) {
            setEditingGroup(group);
            setGroupName(group.name);
            setGroupColor(group.color);
            setGroupDescription(group.description);
            setGroupTools(group.tool_ids);
        } else {
            setEditingGroup(null);
            setGroupName('');
            setGroupColor('#6366f1');
            setGroupDescription('');
            setGroupTools([]);
        }
        setShowGroupModal(true);
    };

    const saveGroup = async () => {
        if (!groupName.trim()) { setError('Nazwa grupy jest wymagana'); return; }

        try {
            if (editingGroup) {
                // Update existing group
                await fetch(apiUrl(`/api/admin/groups/${editingGroup.id}?name=${encodeURIComponent(groupName)}&color=${encodeURIComponent(groupColor)}&description=${encodeURIComponent(groupDescription)}`), {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${getToken()}` }
                });
                // Update tools
                await fetch(apiUrl(`/api/admin/groups/${editingGroup.id}/tools`), {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(groupTools)
                });
                showSuccess('Zaktualizowano grupę');
            } else {
                // Create new group
                const res = await fetch(apiUrl(`/api/admin/groups?name=${encodeURIComponent(groupName)}&color=${encodeURIComponent(groupColor)}&description=${encodeURIComponent(groupDescription)}`), {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${getToken()}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    // Set tools for new group
                    if (groupTools.length > 0) {
                        await fetch(apiUrl(`/api/admin/groups/${data.id}/tools`), {
                            method: 'PUT',
                            headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify(groupTools)
                        });
                    }
                    showSuccess('Utworzono grupę');
                }
            }
            setShowGroupModal(false);
            fetchGroups();
        } catch { setError('Błąd zapisywania grupy'); }
    };

    const deleteGroup = async (groupId: number) => {
        if (!confirm('Czy na pewno usunąć tę grupę?')) return;
        try {
            await fetch(apiUrl(`/api/admin/groups/${groupId}`), {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            showSuccess('Usunięto grupę');
            fetchGroups();
            fetchUsers();
        } catch { setError('Błąd usuwania grupy'); }
    };

    if (!isOpen) return null;

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
                    width: '100%', maxWidth: '1000px', maxHeight: '85vh',
                    background: 'var(--bg-primary)', borderRadius: '16px',
                    border: '1px solid var(--border)', overflow: 'hidden',
                    display: 'flex', flexDirection: 'column'
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>⚙️ Panel Administratora</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '0.25rem', padding: '0 1.5rem', borderBottom: '1px solid var(--border)' }}>
                    <button style={tabStyle(activeTab === 'users')} onClick={() => setActiveTab('users')}>
                        👥 Użytkownicy ({users.length})
                    </button>
                    <button style={tabStyle(activeTab === 'groups')} onClick={() => setActiveTab('groups')}>
                        🏷️ Grupy ({groups.length})
                    </button>
                </div>

                {/* Messages */}
                {error && <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>{error}</div>}
                {successMessage && <div style={{ padding: '1rem', background: 'rgba(34, 197, 94, 0.1)', color: 'var(--accent)' }}>✅ {successMessage}</div>}

                {/* Content */}
                <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
                    {isLoading ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Ładowanie...</div>
                    ) : activeTab === 'users' ? (
                        /* Users Tab */
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Użytkownik</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Rola</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Grupy</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 500 }}>Dodaj do grupy</th>
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
                                            <select value={u.role} onChange={e => setRole(u.id, e.target.value)}
                                                style={{ padding: '0.5rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '6px', color: 'white', fontSize: '0.875rem' }}>
                                                <option value="user">👤 User</option>
                                                <option value="premium">⭐ Premium</option>
                                                <option value="admin">👑 Admin</option>
                                            </select>
                                        </td>
                                        <td style={{ padding: '0.75rem' }}>
                                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                {u.groups.map(g => (
                                                    <span key={g.id} style={{
                                                        padding: '0.25rem 0.5rem',
                                                        background: g.color + '33',
                                                        color: g.color,
                                                        borderRadius: '4px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.25rem'
                                                    }}>
                                                        {g.name}
                                                        <button onClick={() => removeUserFromGroup(u.id, g.id)}
                                                            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: '0.9rem' }}>×</button>
                                                    </span>
                                                ))}
                                                {u.groups.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Brak grup</span>}
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                            {groups.filter(g => !u.groups.some(ug => ug.id === g.id)).length > 0 ? (
                                                <select onChange={e => { if (e.target.value) addUserToGroup(u.id, Number(e.target.value)); e.target.value = ''; }}
                                                    style={{ padding: '0.5rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '6px', color: 'white', fontSize: '0.8rem' }}>
                                                    <option value="">+ Dodaj...</option>
                                                    {groups.filter(g => !u.groups.some(ug => ug.id === g.id)).map(g => (
                                                        <option key={g.id} value={g.id}>{g.name}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Wszystkie grupy</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        /* Groups Tab */
                        <div>
                            <button onClick={() => openGroupModal()} style={{
                                padding: '0.75rem 1.5rem', background: 'var(--accent)', color: 'black',
                                border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, marginBottom: '1rem'
                            }}>
                                ➕ Nowa grupa
                            </button>

                            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                                {groups.map(g => (
                                    <div key={g.id} style={{
                                        background: 'var(--bg-secondary)', borderRadius: '12px', padding: '1.25rem',
                                        border: `2px solid ${g.color}33`
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: g.color }} />
                                                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>{g.name}</h3>
                                                </div>
                                                {g.description && <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{g.description}</p>}
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button onClick={() => openGroupModal(g)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}>✏️</button>
                                                <button onClick={() => deleteGroup(g.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}>🗑️</button>
                                            </div>
                                        </div>

                                        <div style={{ marginBottom: '0.75rem' }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Narzędzia ({g.tool_ids.length})</div>
                                            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                                {g.tool_ids.map(t => (
                                                    <span key={t} style={{ padding: '0.2rem 0.5rem', background: 'var(--accent)', color: 'black', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600 }}>
                                                        {TOOL_LABELS[t]?.split(' ')[1] || t}
                                                    </span>
                                                ))}
                                                {g.tool_ids.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Brak</span>}
                                            </div>
                                        </div>

                                        <div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>👥 {g.user_count} użytkowników</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Group Modal */}
            {showGroupModal && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    background: 'var(--bg-primary)', borderRadius: '16px', padding: '1.5rem', width: '400px',
                    border: '1px solid var(--border)', zIndex: 10001
                }} onClick={e => e.stopPropagation()}>
                    <h3 style={{ margin: '0 0 1rem 0' }}>{editingGroup ? '✏️ Edytuj grupę' : '➕ Nowa grupa'}</h3>

                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Nazwa</label>
                        <input value={groupName} onChange={e => setGroupName(e.target.value)}
                            style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'white' }}
                            placeholder="np. Empik Team" />
                    </div>

                    <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Kolor</label>
                            <input type="color" value={groupColor} onChange={e => setGroupColor(e.target.value)}
                                style={{ width: '100%', height: '40px', border: 'none', borderRadius: '8px', cursor: 'pointer' }} />
                        </div>
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Opis</label>
                        <input value={groupDescription} onChange={e => setGroupDescription(e.target.value)}
                            style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'white' }}
                            placeholder="Opcjonalny opis..." />
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Dostęp do narzędzi</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {ALL_TOOLS.map(toolId => (
                                <label key={toolId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={groupTools.includes(toolId)}
                                        onChange={e => {
                                            if (e.target.checked) setGroupTools([...groupTools, toolId]);
                                            else setGroupTools(groupTools.filter(t => t !== toolId));
                                        }}
                                        style={{ width: '18px', height: '18px', accentColor: 'var(--accent)' }} />
                                    <span>{TOOL_LABELS[toolId]}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button onClick={() => setShowGroupModal(false)}
                            style={{ padding: '0.75rem 1.25rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                            Anuluj
                        </button>
                        <button onClick={saveGroup}
                            style={{ padding: '0.75rem 1.25rem', background: 'var(--accent)', border: 'none', borderRadius: '8px', color: 'black', cursor: 'pointer', fontWeight: 600 }}>
                            {editingGroup ? 'Zapisz' : 'Utwórz'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
