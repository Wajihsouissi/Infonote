/**
 * AdminDashboard — secure admin panel for user management and analytics.
 *
 * Requires authentication. Fetches data exclusively via Supabase RPCs
 * so every number is backed by the live database cluster.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ArrowLeft,
    Shield,
    Users,
    BarChart3,
    Trash2,
    Loader2,
    AlertCircle,
    Activity,
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { supabase, isSupabaseConfigured } from '../../services/supabase/client';
import styles from './AdminDashboard.module.css';

type AdminUser = {
    id: string;
    email: string;
    display_name: string | null;
    created_at: string;
    account_status: string;
    last_active_at: string | null;
};

type Metric = { metric: string; value: number };

type DailyTraffic = { day: string; visits: number };

export const AdminDashboard: React.FC = () => {
    const setCurrentView = useStore((s) => s.setCurrentView);
    const auth = useStore((s) => s.auth);

    const [users, setUsers] = useState<AdminUser[]>([]);
    const [metrics, setMetrics] = useState<Metric[]>([]);
    const [dailyTraffic, setDailyTraffic] = useState<DailyTraffic[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [, setLoadingMetrics] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showInactiveOnly, setShowInactiveOnly] = useState(false);

    const isAuthenticated = auth.isAuthenticated;

    const fetchData = useCallback(async () => {
        if (!isSupabaseConfigured || !isAuthenticated) return;
        setError(null);

        // Fetch users
        setLoadingUsers(true);
        try {
            const { data, error: rpcErr } = await supabase.rpc('admin_list_users');
            if (rpcErr) throw rpcErr;
            setUsers((data as AdminUser[]) ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoadingUsers(false);
        }

        // Fetch analytics
        setLoadingMetrics(true);
        try {
            const { data: mData, error: mErr } = await supabase.rpc('admin_get_analytics');
            if (mErr) throw mErr;
            setMetrics((mData as Metric[]) ?? []);
        } catch {
            // Non-fatal
        }

        try {
            const { data: tData, error: tErr } = await supabase.rpc('admin_get_daily_traffic');
            if (tErr) throw tErr;
            setDailyTraffic((tData as DailyTraffic[]) ?? []);
        } catch {
            // Non-fatal
        } finally {
            setLoadingMetrics(false);
        }
    }, [isAuthenticated]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleDelete = useCallback(
        async (userId: string) => {
            if (!window.confirm('Permanently delete this user and all their data? This cannot be undone.'))
                return;
            setDeletingId(userId);
            try {
                const { data, error: rpcErr } = await supabase.rpc('admin_delete_user', {
                    _user_id: userId,
                });
                if (rpcErr) throw rpcErr;
                if (data) {
                    setUsers((prev) => prev.filter((u) => u.id !== userId));
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                setDeletingId(null);
            }
        },
        []
    );

    const totalUsers = users.length;
    const totalVisits = metrics.find((m) => m.metric === 'total_visits')?.value ?? 0;
    const uniqueVisitors = metrics.find((m) => m.metric === 'unique_visitors')?.value ?? 0;
    const todayVisits = metrics.find((m) => m.metric === 'today_visits')?.value ?? 0;

    const filteredUsers = useMemo(() => {
        if (!showInactiveOnly) return users;
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return users.filter(u => {
            if (!u.last_active_at) return true; // Never active = inactive
            return new Date(u.last_active_at) < thirtyDaysAgo;
        });
    }, [users, showInactiveOnly]);

    const maxDailyVisits = useMemo(() => {
        if (!dailyTraffic.length) return 1;
        return Math.max(...dailyTraffic.map((d) => d.visits), 1);
    }, [dailyTraffic]);

    // Guard: redirect unauthenticated users back to landing
    if (!isAuthenticated) {
        return (
            <div className={styles.shell}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
                    <Shield size={48} style={{ opacity: 0.4 }} />
                    <div style={{ fontSize: 16, fontWeight: 600 }}>Admin access requires authentication.</div>
                    <button className={styles.backButton} onClick={() => setCurrentView('landing')}>
                        <ArrowLeft size={14} /> Back to Home
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.shell}>
            <header className={styles.header}>
                <div className={styles.headerLeft}>
                    <Shield size={20} style={{ color: 'var(--color-primary, #8b5cf6)' }} />
                    <span className={styles.headerTitle}>Admin Dashboard</span>
                </div>
                <button className={styles.backButton} onClick={() => setCurrentView('landing')}>
                    <ArrowLeft size={14} />
                    Back to Home
                </button>
            </header>

            <main className={styles.content}>
                {error && (
                    <div className={styles.errorBanner} role="alert">
                        <AlertCircle size={16} />
                        <span>{error}</span>
                    </div>
                )}

                {/* Analytics Cards */}
                <div className={styles.grid}>
                    <div className={styles.statCard}>
                        <div className={styles.statLabel}>Total Users</div>
                        <div className={styles.statValue}>{totalUsers}</div>
                    </div>
                    <div className={styles.statCard}>
                        <div className={styles.statLabel}>Total Visits</div>
                        <div className={styles.statValue}>{totalVisits}</div>
                    </div>
                    <div className={styles.statCard}>
                        <div className={styles.statLabel}>Unique Visitors</div>
                        <div className={styles.statValue}>{uniqueVisitors}</div>
                    </div>
                    <div className={styles.statCard}>
                        <div className={styles.statLabel}>Today&apos;s Visits</div>
                        <div className={styles.statValue}>{todayVisits}</div>
                    </div>
                </div>

                {/* Daily Traffic Chart */}
                {dailyTraffic.length > 0 && (
                    <div className={styles.section}>
                        <div className={styles.sectionTitle}>
                            <BarChart3 size={16} />
                            Daily Traffic (last 30 days)
                        </div>
                        <div className={styles.chartArea}>
                            {dailyTraffic.map((d) => (
                                <div key={d.day} className={styles.barRow}>
                                    <span className={styles.barLabel}>{d.day}</span>
                                    <div className={styles.barTrack}>
                                        <div
                                            className={styles.barFill}
                                            style={{ width: `${Math.round((d.visits / maxDailyVisits) * 100)}%` }}
                                        />
                                    </div>
                                    <span className={styles.barValue}>{d.visits}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* User Management Table */}
                <div className={styles.section}>
                    <div className={styles.sectionTitle}>
                        <Users size={16} />
                        Registered Users
                        {loadingUsers && <Loader2 size={14} className={styles.spinner} />}
                    </div>

                    <div style={{ marginBottom: 12 }}>
                        <button
                            onClick={() => setShowInactiveOnly(v => !v)}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '8px',
                                border: showInactiveOnly ? '1px solid #f87171' : '1px solid rgba(255,255,255,0.1)',
                                background: showInactiveOnly ? 'rgba(248,113,113,0.15)' : 'rgba(255,255,255,0.05)',
                                color: showInactiveOnly ? '#f87171' : 'rgba(255,255,255,0.7)',
                                fontSize: '13px',
                                fontWeight: 500,
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                            }}
                        >
                            {showInactiveOnly ? `Showing Inactive (${filteredUsers.length})` : 'Show Inactive (30+ days)'}
                        </button>
                    </div>

                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>User ID</th>
                                    <th>Email</th>
                                    <th>Display Name</th>
                                    <th>Created</th>
                                    <th>Last Active</th>
                                    <th>Status</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.length === 0 && !loadingUsers ? (
                                    <tr>
                                        <td colSpan={7} className={styles.emptyState}>
                                            {showInactiveOnly ? 'No inactive users found.' : 'No registered users found.'}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredUsers.map((u) => (
                                        <tr key={u.id}>
                                            <td className={styles.idCell} title={u.id}>
                                                {u.id}
                                            </td>
                                            <td>{u.email}</td>
                                            <td>{u.display_name || '—'}</td>
                                            <td>{new Date(u.created_at).toLocaleDateString()}</td>
                                            <td>{u.last_active_at ? new Date(u.last_active_at).toLocaleDateString() : 'Never'}</td>
                                            <td>
                                                <span
                                                    className={`${styles.statusBadge} ${
                                                        u.account_status === 'active'
                                                            ? styles.statusActive
                                                            : styles.statusInactive
                                                    }`}
                                                >
                                                    <Activity size={10} />
                                                    {u.account_status}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button
                                                    className={styles.deleteBtn}
                                                    onClick={() => handleDelete(u.id)}
                                                    disabled={deletingId === u.id}
                                                    aria-label={`Delete user ${u.email}`}
                                                >
                                                    {deletingId === u.id ? (
                                                        <Loader2 size={12} className={styles.spinner} />
                                                    ) : (
                                                        <Trash2 size={12} />
                                                    )}
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default AdminDashboard;
