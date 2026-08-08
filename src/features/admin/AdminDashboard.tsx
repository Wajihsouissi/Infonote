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
    Search,
    RefreshCw,
    Bug,
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { supabase, isSupabaseConfigured } from '../../services/supabase/client';
import styles from './AdminDashboard.module.css';

type ClientError = {
    id: string;
    occurred_at: string;
    user_id: string | null;
    source: string;
    message: string;
    stack: string | null;
    url: string | null;
    user_agent: string | null;
};

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

type AdminDashboardProps = {
    ownerEmail: string;
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ ownerEmail }) => {
    const setCurrentView = useStore((s) => s.setCurrentView);
    const auth = useStore((s) => s.auth);

    const [users, setUsers] = useState<AdminUser[]>([]);
    const [metrics, setMetrics] = useState<Metric[]>([]);
    const [dailyTraffic, setDailyTraffic] = useState<DailyTraffic[]>([]);
    const [clientErrors, setClientErrors] = useState<ClientError[]>([]);
    const [clientErrorsError, setClientErrorsError] = useState<string | null>(null);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [, setLoadingMetrics] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showInactiveOnly, setShowInactiveOnly] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

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

        /* Report a failed load rather than leaving the table empty. An empty
           table here reads as "the app is healthy", so an RLS denial or an
           unapplied migration would look identical to zero crashes — in the one
           panel whose job is telling you the app is broken. */
        try {
            const { data: eData, error: eErr } = await supabase.rpc('admin_get_client_errors', { _limit: 50 });
            if (eErr) throw eErr;
            setClientErrors((eData as ClientError[]) ?? []);
            setClientErrorsError(null);
        } catch (err) {
            setClientErrors([]);
            setClientErrorsError(err instanceof Error ? err.message : String(err));
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
        const query = searchQuery.trim().toLowerCase();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return users.filter(u => {
            const inactive = !u.last_active_at || new Date(u.last_active_at) < thirtyDaysAgo;
            if (showInactiveOnly && !inactive) return false;
            if (!query) return true;
            return [
                u.email,
                u.display_name ?? '',
                u.id,
                u.account_status,
            ].some(value => value.toLowerCase().includes(query));
        });
    }, [users, showInactiveOnly, searchQuery]);

    const inactiveCount = useMemo(() => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return users.filter(u => !u.last_active_at || new Date(u.last_active_at) < thirtyDaysAgo).length;
    }, [users]);

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
                    <Shield size={20} style={{ color: 'var(--color-primary, #f95d2e)' }} />
                    <div>
                        <span className={styles.headerTitle}>Admin Dashboard</span>
                        <span className={styles.ownerLabel}>{ownerEmail}</span>
                    </div>
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
                        <div className={styles.statLabel}>Inactive 30+ Days</div>
                        <div className={styles.statValue}>{inactiveCount}</div>
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

                    <div className={styles.tableToolbar}>
                        <div className={styles.searchBox}>
                            <Search size={15} />
                            <input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search email, display name, status, or user id"
                                aria-label="Search user accounts"
                            />
                        </div>
                        <button
                            onClick={() => setShowInactiveOnly(v => !v)}
                            className={`${styles.filterBtn} ${showInactiveOnly ? styles.filterBtnActive : ''}`}
                        >
                            {showInactiveOnly ? `Showing Inactive (${filteredUsers.length})` : `Show Inactive (${inactiveCount})`}
                        </button>
                        <button
                            onClick={fetchData}
                            className={styles.filterBtn}
                            disabled={loadingUsers}
                        >
                            <RefreshCw size={14} className={loadingUsers ? styles.spinner : undefined} />
                            Refresh
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

                {/* Client Errors Table */}
                <div className={styles.section}>
                    <div className={styles.sectionTitle}>
                        <Bug size={16} />
                        Recent Client Errors (Last 50)
                    </div>
                    <div className={styles.tableWrap} style={{ overflowX: 'auto' }}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Source</th>
                                    <th>Message</th>
                                    <th>URL</th>
                                    <th>User ID</th>
                                </tr>
                            </thead>
                            <tbody>
                                {clientErrorsError ? (
                                    <tr>
                                        <td colSpan={5} className={styles.emptyState} style={{ color: '#f87171' }}>
                                            Could not load client errors: {clientErrorsError}
                                        </td>
                                    </tr>
                                ) : clientErrors.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className={styles.emptyState}>No client errors recorded.</td>
                                    </tr>
                                ) : (
                                    clientErrors.map((err) => (
                                        <tr key={err.id}>
                                            <td style={{ whiteSpace: 'nowrap' }}>{new Date(err.occurred_at).toLocaleString()}</td>
                                            <td>
                                                <span className={styles.statusBadge} style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#f87171' }}>
                                                    {err.source}
                                                </span>
                                            </td>
                                            <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={err.message}>
                                                {err.message}
                                            </td>
                                            <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={err.url || ''}>
                                                {err.url || '—'}
                                            </td>
                                            <td className={styles.idCell} title={err.user_id || 'anonymous'}>
                                                {err.user_id || 'anonymous'}
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
