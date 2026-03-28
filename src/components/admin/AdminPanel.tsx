'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/config';
import { useI18n } from '@/components/I18n';
import { getAccessToken } from '@/lib/authStorage';

interface GroupInfo { id: number; name: string; color: string; }
interface User {
    id: number; email: string; display_name: string | null; role: string;
    is_active: boolean; created_at: string | null; tool_permissions: string[]; groups: GroupInfo[];
}
interface Group {
    id: number; name: string; color: string; description: string;
    tool_ids: string[]; user_ids: number[]; user_count: number; created_at: string | null;
}
interface ActivityLog {
    id: number; user_id: number | null; user_email: string | null;
    action: string; details: string | null; ip_address: string | null; created_at: string | null;
}
interface DashboardStats {
    total_users: number; active_users: number; total_groups: number;
    logins_24h: number; logins_7d: number;
    top_users: { user_id: number; email: string; display_name: string | null; activity_count: number }[];
}
interface SystemStatus {
    disk: {
        total_bytes: number;
        used_bytes: number;
        free_bytes: number;
        used_percent: number;
        pressure_high: boolean;
    };
    temp: {
        tmp_dir: string;
        result_zip_count: number;
        result_zip_bytes: number;
        processing_dir_bytes: number;
        ttl_seconds: number;
    };
    jobs: {
        active: number;
        finished: number;
        tracked_total: number;
        result_ttl_seconds: number;
    };
    cleanup: {
        min_free_disk_mb: number;
        max_disk_usage_percent: number;
    };
    database: {
        url: string;
        engine: string;
        path: string | null;
    };
    auth: {
        admin_email_count: number;
    };
    last_cleanup: {
        last_run_at: string | null;
        removed_result_zips: number;
        removed_processing_dirs: number;
        removed_jobs: number;
        pressure_triggered: boolean;
        disk_before: {
            free_bytes: number;
            used_percent: number;
        } | null;
        disk_after: {
            free_bytes: number;
            used_percent: number;
        } | null;
    };
}

const TOOL_LABELS: Record<string, string> = { 'piko_empiko': '📥 PikoEmpiko', 'structure_matcher': '🔗 Dopasowywacz' };
const ALL_TOOLS = Object.keys(TOOL_LABELS);

interface AdminPanelProps { isOpen: boolean; onClose: () => void; }

export default function AdminPanel({ isOpen, onClose }: AdminPanelProps) {
    const { user } = useAuth();
    const { t } = useI18n();
    const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'groups' | 'logs'>('dashboard');
    const [users, setUsers] = useState<User[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    // Group modal
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [editingGroup, setEditingGroup] = useState<Group | null>(null);
    const [groupName, setGroupName] = useState('');
    const [groupColor, setGroupColor] = useState('#6366f1');
    const [groupDescription, setGroupDescription] = useState('');
    const [groupTools, setGroupTools] = useState<string[]>([]);

    // Password reset modal
    const [showResetModal, setShowResetModal] = useState(false);
    const [resetUserId, setResetUserId] = useState<number | null>(null);
    const [resetUserEmail, setResetUserEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');

    const showSuccess = (msg: string) => { setSuccessMessage(msg); setTimeout(() => setSuccessMessage(''), 3000); };
    const formatBytes = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    };

    const fetchAll = async () => {
        if (!user || (user.role !== 'admin' && user.role !== 'owner')) return;
        setIsLoading(true);
        try {
            const [usersRes, groupsRes, logsRes, statsRes, systemRes] = await Promise.all([
                fetch(apiUrl('/api/admin/users'), { headers: { 'Authorization': `Bearer ${getAccessToken() || ''}` } }),
                fetch(apiUrl('/api/admin/groups'), { headers: { 'Authorization': `Bearer ${getAccessToken() || ''}` } }),
                fetch(apiUrl('/api/admin/activity-logs?limit=100'), { headers: { 'Authorization': `Bearer ${getAccessToken() || ''}` } }),
                fetch(apiUrl('/api/admin/dashboard-stats'), { headers: { 'Authorization': `Bearer ${getAccessToken() || ''}` } }),
                fetch(apiUrl('/api/admin/system-status'), { headers: { 'Authorization': `Bearer ${getAccessToken() || ''}` } })
            ]);
            if (usersRes.ok) setUsers(await usersRes.json());
            if (groupsRes.ok) setGroups(await groupsRes.json());
            if (logsRes.ok) {
                const logsData = await logsRes.json();
                // Handle both old array format and new {status, logs} format
                setLogs(Array.isArray(logsData) ? logsData : (logsData.logs || []));
            }
            if (statsRes.ok) setStats(await statsRes.json());
            if (systemRes.ok) setSystemStatus(await systemRes.json());
        } catch { setError(t('common.error')); }
        finally { setIsLoading(false); }
    };

    useEffect(() => { if (isOpen) fetchAll(); }, [isOpen]);

    // User actions
    const setRole = async (userId: number, role: string) => {
        await fetch(apiUrl(`/api/admin/set-role?user_id=${userId}&role=${role}`), {
            method: 'POST', headers: { 'Authorization': `Bearer ${getAccessToken() || ''}` }
        });
        showSuccess(`${t('common.success')}: ${role}`);
        fetchAll();
    };

    const addUserToGroup = async (userId: number, groupId: number) => {
        await fetch(apiUrl(`/api/admin/groups/${groupId}/add-user/${userId}`), {
            method: 'POST', headers: { 'Authorization': `Bearer ${getAccessToken() || ''}` }
        });
        showSuccess(t('common.success'));
        fetchAll();
    };

    const removeUserFromGroup = async (userId: number, groupId: number) => {
        await fetch(apiUrl(`/api/admin/groups/${groupId}/remove-user/${userId}`), {
            method: 'DELETE', headers: { 'Authorization': `Bearer ${getAccessToken() || ''}` }
        });
        showSuccess(t('common.success'));
        fetchAll();
    };

    const resetPassword = async () => {
        if (!resetUserId || newPassword.length < 8) {
            setError(t('auth.passwordMinLength'));
            return;
        }
        await fetch(apiUrl(`/api/admin/reset-password/${resetUserId}`), {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getAccessToken() || ''}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ new_password: newPassword }),
        });
        showSuccess(t('admin.resetPasswordSuccess'));
        setShowResetModal(false);
        setNewPassword('');
    };

    const runCleanup = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(apiUrl('/api/admin/run-cleanup'), {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getAccessToken() || ''}` },
            });
            if (!res.ok) throw new Error('Cleanup failed');
            setSystemStatus(await res.json());
            showSuccess('Cleanup zakończony');
        } catch {
            setError('Nie udało się uruchomić cleanupu');
        } finally {
            setIsLoading(false);
        }
    };

    const downloadDatabaseBackup = async () => {
        try {
            const res = await fetch(apiUrl('/api/admin/database-backup'), {
                headers: { 'Authorization': `Bearer ${getAccessToken() || ''}` },
            });
            if (!res.ok) throw new Error('Backup failed');

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `toolboxpro_db_backup_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.sqlite3`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
            showSuccess('Backup bazy pobrany');
        } catch {
            setError('Nie udało się pobrać backupu bazy');
        }
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
        if (!groupName.trim()) { setError(t('common.error')); return; }
        if (editingGroup) {
            await fetch(apiUrl(`/api/admin/groups/${editingGroup.id}?name=${encodeURIComponent(groupName)}&color=${encodeURIComponent(groupColor)}&description=${encodeURIComponent(groupDescription)}`), {
                method: 'PUT', headers: { 'Authorization': `Bearer ${getAccessToken() || ''}` }
            });
            await fetch(apiUrl(`/api/admin/groups/${editingGroup.id}/tools`), {
                method: 'PUT', headers: { 'Authorization': `Bearer ${getAccessToken() || ''}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(groupTools)
            });
            showSuccess(t('common.success'));
        } else {
            const res = await fetch(apiUrl(`/api/admin/groups?name=${encodeURIComponent(groupName)}&color=${encodeURIComponent(groupColor)}&description=${encodeURIComponent(groupDescription)}`), {
                method: 'POST', headers: { 'Authorization': `Bearer ${getAccessToken() || ''}` }
            });
            if (res.ok && groupTools.length > 0) {
                const data = await res.json();
                await fetch(apiUrl(`/api/admin/groups/${data.id}/tools`), {
                    method: 'PUT', headers: { 'Authorization': `Bearer ${getAccessToken() || ''}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(groupTools)
                });
            }
            showSuccess(t('common.success'));
        }
        setShowGroupModal(false);
        fetchAll();
    };

    const deleteGroup = async (groupId: number) => {
        if (!confirm(t('admin.confirmDeleteGroup'))) return;
        await fetch(apiUrl(`/api/admin/groups/${groupId}`), { method: 'DELETE', headers: { 'Authorization': `Bearer ${getAccessToken() || ''}` } });
        showSuccess(t('common.success'));
        fetchAll();
    };

    if (!isOpen) return null;

    const tabStyle = (active: boolean) => ({
        padding: '0.75rem 1.25rem', background: active ? 'var(--accent)' : 'transparent',
        color: active ? 'black' : 'var(--text-muted)', border: 'none', borderRadius: '8px 8px 0 0',
        cursor: 'pointer', fontWeight: active ? 600 : 400, fontSize: '0.85rem'
    });

    const cardStyle = { background: 'var(--bg-secondary)', borderRadius: '12px', padding: '1.25rem', border: '1px solid var(--border)' };
    const inputStyle = { width: '100%', padding: '0.75rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'white' };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, backdropFilter: 'blur(4px)' }} onClick={onClose}>
            <div style={{ width: '100%', maxWidth: '1100px', maxHeight: '90vh', background: 'var(--bg-primary)', borderRadius: '16px', border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>⚙️ {t('admin.title')}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '0.25rem', padding: '0 1.5rem', borderBottom: '1px solid var(--border)' }}>
                    <button style={tabStyle(activeTab === 'dashboard')} onClick={() => setActiveTab('dashboard')}>📊 {t('admin.tab.dashboard')}</button>
                    <button style={tabStyle(activeTab === 'users')} onClick={() => setActiveTab('users')}>👥 {t('admin.tab.users')} ({users.length})</button>
                    <button style={tabStyle(activeTab === 'groups')} onClick={() => setActiveTab('groups')}>🏷️ {t('admin.tab.groups')} ({groups.length})</button>
                    <button style={tabStyle(activeTab === 'logs')} onClick={() => setActiveTab('logs')}>📋 {t('admin.tab.logs')} ({logs.length})</button>
                </div>

                {/* Messages */}
                {error && <div style={{ padding: '1rem', background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>{error}</div>}
                {successMessage && <div style={{ padding: '1rem', background: 'rgba(34,197,94,0.1)', color: 'var(--accent)' }}>✅ {successMessage}</div>}

                {/* Content */}
                <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
                    {isLoading ? <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>{t('common.loading')}</div> :
                        activeTab === 'dashboard' ? (
                            /* Dashboard */
                            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                                <div style={cardStyle}>
                                    <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent)' }}>{stats?.total_users || 0}</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{t('admin.users')}</div>
                                </div>
                                <div style={cardStyle}>
                                    <div style={{ fontSize: '2rem', fontWeight: 700, color: '#3b82f6' }}>{stats?.total_groups || 0}</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{t('admin.groups')}</div>
                                </div>
                                <div style={cardStyle}>
                                    <div style={{ fontSize: '2rem', fontWeight: 700, color: '#f59e0b' }}>{stats?.logins_24h || 0}</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{t('admin.logins24h')}</div>
                                </div>
                                <div style={cardStyle}>
                                    <div style={{ fontSize: '2rem', fontWeight: 700, color: '#8b5cf6' }}>{stats?.logins_7d || 0}</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{t('admin.logins7d')}</div>
                                </div>
                                {systemStatus && (
                                    <>
                                        <div style={{ ...cardStyle, borderColor: systemStatus.disk.pressure_high ? '#ef444455' : 'var(--border)' }}>
                                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: systemStatus.disk.pressure_high ? '#ef4444' : '#22c55e' }}>
                                                {systemStatus.disk.used_percent}%
                                            </div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Zużycie dysku `/tmp`</div>
                                            <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                Wolne: {formatBytes(systemStatus.disk.free_bytes)}
                                            </div>
                                        </div>
                                        <div style={cardStyle}>
                                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#3b82f6' }}>
                                                {systemStatus.temp.result_zip_count}
                                            </div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Tymczasowe ZIP-y</div>
                                            <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                {formatBytes(systemStatus.temp.result_zip_bytes)}
                                            </div>
                                        </div>
                                        <div style={cardStyle}>
                                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b' }}>
                                                {systemStatus.jobs.active}
                                            </div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Aktywne joby</div>
                                            <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                Zakończone: {systemStatus.jobs.finished}
                                            </div>
                                        </div>
                                        <div style={{ ...cardStyle, gridColumn: 'span 2' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', gap: '1rem', flexWrap: 'wrap' }}>
                                                <div style={{ fontWeight: 600 }}>🧹 Cleanup</div>
                                                <button
                                                    onClick={runCleanup}
                                                    style={{ padding: '0.6rem 1rem', background: 'var(--accent)', border: 'none', borderRadius: '8px', color: 'black', cursor: 'pointer', fontWeight: 600 }}
                                                >
                                                    Wymuś cleanup
                                                </button>
                                                {systemStatus.database.engine === 'sqlite' && (
                                                    <button
                                                        onClick={downloadDatabaseBackup}
                                                        style={{ padding: '0.6rem 1rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'white', cursor: 'pointer', fontWeight: 600 }}
                                                    >
                                                        Pobierz backup DB
                                                    </button>
                                                )}
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', fontSize: '0.85rem' }}>
                                                <div>
                                                    <div style={{ color: 'var(--text-muted)' }}>TTL wyników</div>
                                                    <div>{Math.round(systemStatus.jobs.result_ttl_seconds / 60)} min</div>
                                                </div>
                                                <div>
                                                    <div style={{ color: 'var(--text-muted)' }}>TTL tempów</div>
                                                    <div>{Math.round(systemStatus.temp.ttl_seconds / 60)} min</div>
                                                </div>
                                                <div>
                                                    <div style={{ color: 'var(--text-muted)' }}>Min. wolnego miejsca</div>
                                                    <div>{systemStatus.cleanup.min_free_disk_mb} MB</div>
                                                </div>
                                                <div>
                                                    <div style={{ color: 'var(--text-muted)' }}>Próg użycia dysku</div>
                                                    <div>{systemStatus.cleanup.max_disk_usage_percent}%</div>
                                                </div>
                                                <div>
                                                    <div style={{ color: 'var(--text-muted)' }}>Katalog przetwarzania</div>
                                                    <div>{formatBytes(systemStatus.temp.processing_dir_bytes)}</div>
                                                </div>
                                                <div>
                                                    <div style={{ color: 'var(--text-muted)' }}>Śledzone joby</div>
                                                    <div>{systemStatus.jobs.tracked_total}</div>
                                                </div>
                                                <div>
                                                    <div style={{ color: 'var(--text-muted)' }}>Maile owner/admin z .env</div>
                                                    <div>{systemStatus.auth.admin_email_count}</div>
                                                </div>
                                                <div style={{ gridColumn: '1 / -1' }}>
                                                    <div style={{ color: 'var(--text-muted)' }}>Baza danych</div>
                                                    <div style={{ wordBreak: 'break-all' }}>
                                                        {systemStatus.database.engine}: {systemStatus.database.url || 'brak'}
                                                    </div>
                                                    {systemStatus.database.path && (
                                                        <div style={{ marginTop: '0.35rem', color: 'var(--text-muted)', wordBreak: 'break-all', fontSize: '0.75rem' }}>
                                                            Plik: {systemStatus.database.path}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            {systemStatus.last_cleanup.last_run_at && (
                                                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                                                    <div>
                                                        <div>Ostatni cleanup</div>
                                                        <div style={{ color: 'white' }}>{new Date(systemStatus.last_cleanup.last_run_at).toLocaleString('pl-PL')}</div>
                                                    </div>
                                                    <div>
                                                        <div>Usunięte ZIP-y</div>
                                                        <div style={{ color: 'white' }}>{systemStatus.last_cleanup.removed_result_zips}</div>
                                                    </div>
                                                    <div>
                                                        <div>Usunięte katalogi</div>
                                                        <div style={{ color: 'white' }}>{systemStatus.last_cleanup.removed_processing_dirs}</div>
                                                    </div>
                                                    <div>
                                                        <div>Usunięte joby</div>
                                                        <div style={{ color: 'white' }}>{systemStatus.last_cleanup.removed_jobs}</div>
                                                    </div>
                                                    <div>
                                                        <div>Tryb awaryjny</div>
                                                        <div style={{ color: systemStatus.last_cleanup.pressure_triggered ? '#ef4444' : 'white' }}>
                                                            {systemStatus.last_cleanup.pressure_triggered ? 'Tak' : 'Nie'}
                                                        </div>
                                                    </div>
                                                    {systemStatus.last_cleanup.disk_before && systemStatus.last_cleanup.disk_after && (
                                                        <div>
                                                            <div>Wolne miejsce</div>
                                                            <div style={{ color: 'white' }}>
                                                                {formatBytes(systemStatus.last_cleanup.disk_before.free_bytes)} -> {formatBytes(systemStatus.last_cleanup.disk_after.free_bytes)}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                                {stats?.top_users && stats.top_users.length > 0 && (
                                    <div style={{ ...cardStyle, gridColumn: 'span 2' }}>
                                        <div style={{ fontWeight: 600, marginBottom: '1rem' }}>🏆 {t('admin.activeUsers')}</div>
                                        {stats.top_users.map((u, i) => (
                                            <div key={u.user_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: i < stats.top_users.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                                <span>{u.display_name || u.email}</span>
                                                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{u.activity_count} akcji</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : activeTab === 'users' ? (
                            /* Users */
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                        <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>{t('role.user')}</th>
                                        <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>{t('profile.role')}</th>
                                        <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>{t('admin.groups')}</th>
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
                                                <select value={u.role} onChange={e => setRole(u.id, e.target.value)} style={{ padding: '0.5rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '6px', color: 'white', fontSize: '0.8rem' }}>
                                                    <option value="user">👤 {t('role.user')}</option>
                                                    <option value="premium">⭐ {t('role.premium')}</option>
                                                    <option value="admin">🛡️ {t('role.admin')}</option>
                                                    <option value="owner">👑 {t('role.owner')}</option>
                                                </select>
                                            </td>
                                            <td style={{ padding: '0.75rem' }}>
                                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                    {u.groups.map(g => (
                                                        <span key={g.id} style={{ padding: '0.25rem 0.5rem', background: g.color + '33', color: g.color, borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                            {g.name}
                                                            <button onClick={() => removeUserFromGroup(u.id, g.id)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: '0.9rem' }}>×</button>
                                                        </span>
                                                    ))}
                                                    {groups.filter(g => !u.groups.some(ug => ug.id === g.id)).length > 0 && (
                                                        <select onChange={e => { if (e.target.value) addUserToGroup(u.id, Number(e.target.value)); e.target.value = ''; }} style={{ padding: '0.25rem 0.5rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '4px', color: 'white', fontSize: '0.7rem' }}>
                                                            <option value="">+</option>
                                                            {groups.filter(g => !u.groups.some(ug => ug.id === g.id)).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                                        </select>
                                                    )}
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                                <button onClick={() => { setResetUserId(u.id); setResetUserEmail(u.email); setShowResetModal(true); }} style={{ padding: '0.4rem 0.75rem', background: 'rgba(239,68,68,0.2)', border: '1px solid #ef4444', borderRadius: '6px', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem' }}>
                                                    🔐 {t('admin.resetPassword')}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : activeTab === 'groups' ? (
                            /* Groups */
                            <div>
                                <button onClick={() => openGroupModal()} style={{ padding: '0.75rem 1.5rem', background: 'var(--accent)', color: 'black', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, marginBottom: '1rem' }}>➕ {t('admin.newGroup')}</button>
                                <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                                    {groups.map(g => (
                                        <div key={g.id} style={{ ...cardStyle, borderColor: g.color + '55' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: g.color }} />
                                                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{g.name}</h3>
                                                </div>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button onClick={() => openGroupModal(g)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem' }}>✏️</button>
                                                    <button onClick={() => deleteGroup(g.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem' }}>🗑️</button>
                                                </div>
                                            </div>
                                            {g.description && <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{g.description}</p>}
                                            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                                                {g.tool_ids.map(t => <span key={t} style={{ padding: '0.2rem 0.5rem', background: 'var(--accent)', color: 'black', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600 }}>{TOOL_LABELS[t]?.split(' ')[1] || t}</span>)}
                                                {g.tool_ids.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Brak narzędzi</span>}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>👥 {g.user_count} {t('admin.users')}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            /* Logs */
                            <div>
                                <div style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Ostatnie 100 akcji (włącznie z gośćmi)</div>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                            <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Czas</th>
                                            <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>{t('role.user')}</th>
                                            <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Akcja</th>
                                            <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>Szczegóły</th>
                                            <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500 }}>IP</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map(log => (
                                            <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{log.created_at ? new Date(log.created_at).toLocaleString('pl-PL') : '-'}</td>
                                                <td style={{ padding: '0.75rem', fontSize: '0.85rem' }}>
                                                    {log.user_email ? (
                                                        <span title={log.user_email}>{(log as any).user_name || log.user_email}</span>
                                                    ) : (
                                                        <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>👤 Gość</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '0.75rem' }}>
                                                    <span style={{ padding: '0.25rem 0.5rem', background: log.action.includes('login') ? 'rgba(34,197,94,0.2)' : log.action.includes('password') ? 'rgba(239,68,68,0.2)' : log.action.includes('tool') ? 'rgba(99,102,241,0.2)' : 'var(--bg-tertiary)', borderRadius: '4px', fontSize: '0.75rem' }}>
                                                        {log.action}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.details || '-'}</td>
                                                <td style={{ padding: '0.75rem', fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{log.ip_address || '-'}</td>
                                            </tr>
                                        ))}
                                        {logs.length === 0 && <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>{t('stats.noData')}</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        )}
                </div>
            </div>

            {/* Group Modal */}
            {showGroupModal && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'var(--bg-primary)', borderRadius: '16px', padding: '1.5rem', width: '400px', border: '1px solid var(--border)', zIndex: 10001 }} onClick={e => e.stopPropagation()}>
                    <h3 style={{ margin: '0 0 1rem 0' }}>{editingGroup ? `✏️ ${t('admin.editGroup')}` : `➕ ${t('admin.newGroup')}`}</h3>
                    <div style={{ marginBottom: '1rem' }}><label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>{t('admin.groupName')}</label><input value={groupName} onChange={e => setGroupName(e.target.value)} style={inputStyle} placeholder="np. Empik Team" /></div>
                    <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem' }}><div style={{ flex: 1 }}><label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>{t('admin.groupColor')}</label><input type="color" value={groupColor} onChange={e => setGroupColor(e.target.value)} style={{ width: '100%', height: '40px', border: 'none', borderRadius: '8px', cursor: 'pointer' }} /></div></div>
                    <div style={{ marginBottom: '1rem' }}><label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Opis</label><input value={groupDescription} onChange={e => setGroupDescription(e.target.value)} style={inputStyle} placeholder="Opcjonalny opis..." /></div>
                    <div style={{ marginBottom: '1.5rem' }}><label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>{t('admin.groupTools')}</label><div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>{ALL_TOOLS.map(toolId => (<label key={toolId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}><input type="checkbox" checked={groupTools.includes(toolId)} onChange={e => { if (e.target.checked) setGroupTools([...groupTools, toolId]); else setGroupTools(groupTools.filter(t => t !== toolId)); }} style={{ width: '18px', height: '18px', accentColor: 'var(--accent)' }} /><span>{TOOL_LABELS[toolId]}</span></label>))}</div></div>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button onClick={() => setShowGroupModal(false)} style={{ padding: '0.75rem 1.25rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-muted)', cursor: 'pointer' }}>{t('common.cancel')}</button>
                        <button onClick={saveGroup} style={{ padding: '0.75rem 1.25rem', background: 'var(--accent)', border: 'none', borderRadius: '8px', color: 'black', cursor: 'pointer', fontWeight: 600 }}>{editingGroup ? t('common.save') : t('admin.createGroup')}</button>
                    </div>
                </div>
            )}

            {/* Password Reset Modal */}
            {showResetModal && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'var(--bg-primary)', borderRadius: '16px', padding: '1.5rem', width: '400px', border: '1px solid var(--border)', zIndex: 10001 }} onClick={e => e.stopPropagation()}>
                    <h3 style={{ margin: '0 0 1rem 0' }}>🔐 {t('admin.resetPassword')}</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>{t('admin.resetPasswordTitle')}: <strong>{resetUserEmail}</strong></p>
                    <div style={{ marginBottom: '1.5rem' }}><label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>{t('profile.newPassword')}</label><input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={inputStyle} placeholder="Min. 8 znaków" /></div>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button onClick={() => { setShowResetModal(false); setNewPassword(''); }} style={{ padding: '0.75rem 1.25rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-muted)', cursor: 'pointer' }}>{t('common.cancel')}</button>
                        <button onClick={resetPassword} style={{ padding: '0.75rem 1.25rem', background: '#ef4444', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', fontWeight: 600 }}>{t('admin.resetPassword')}</button>
                    </div>
                </div>
            )}
        </div>
    );
}
