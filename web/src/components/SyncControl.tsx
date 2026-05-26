import React from 'react';
import { usePrefetch } from '../hooks/usePrefetch';
import { useSync } from '../hooks/useSync';
import { useLanguage } from '../contexts/LanguageContext';
import { getPrefetchLogs, getOfflineStats, resetOfflineCache } from '../lib/offline/prefetch';

export function SyncControl() {
    const { isPrefetching, progress, error, startPrefetch } = usePrefetch();
    const { isSyncing, pendingCount } = useSync();
    const { t } = useLanguage();
    const [stats, setStats] = React.useState<{ apiEntries: number; lastSync: string | null } | null>(null);
    const [showLogs, setShowLogs] = React.useState(false);
    const [logs, setLogs] = React.useState<string[]>([]);

    React.useEffect(() => {
        const loadStats = () => getOfflineStats().then(setStats);
        loadStats();
        const timer = setInterval(loadStats, 3000);
        return () => clearInterval(timer);
    }, [isPrefetching, isSyncing]);

    React.useEffect(() => {
        if (isPrefetching) {
            const interval = setInterval(() => {
                setLogs([...getPrefetchLogs()]);
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [isPrefetching]);

    const handleReset = async () => {
        if (confirm('Czy na pewno wyczyścić pamięć offline? Aplikacja zostanie przeładowana.')) {
            await resetOfflineCache();
            window.location.reload();
        }
    };

    return (
        <div style={{
            padding: '16px',
            background: '#ffffff',
            borderRadius: '16px',
            margin: '8px',
            display: 'grid',
            gap: '12px',
            border: '1px solid rgba(0,0,0,0.1)',
            color: '#111827'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, fontSize: 13, color: '#1f2937' }}>{t('common', 'offlineMode', 'Tryb Offline')}</span>
                <button
                    onClick={() => setShowLogs(!showLogs)}
                    style={{ fontSize: 10, background: 'none', border: 'none', color: '#6b7280', textDecoration: 'underline' }}
                >
                    {showLogs ? 'Ukryj logi' : 'Logi'}
                </button>
            </div>

            <button
                onClick={startPrefetch}
                disabled={isPrefetching}
                style={{
                    padding: '10px',
                    borderRadius: '12px',
                    border: 'none',
                    background: isPrefetching ? '#9ca3af' : 'linear-gradient(135deg, #0ea5e9, #2563eb)',
                    color: 'white',
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: isPrefetching ? 'not-allowed' : 'pointer',
                }}
            >
                {isPrefetching ? t('common', 'downloading', 'Pobieranie...') : t('common', 'downloadAll', 'Pobierz dane offline')}
            </button>

            {isPrefetching && progress && (
                <div style={{ fontSize: 11 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ fontWeight: 600 }}>{progress.phase}</span>
                        <span>{progress.current} / {progress.total}</span>
                    </div>
                </div>
            )}

            {showLogs && (
                <div style={{
                    fontSize: 10,
                    maxHeight: 120,
                    overflowY: 'auto',
                    background: '#f9fafb',
                    padding: 8,
                    borderRadius: 8,
                    fontFamily: 'monospace',
                    border: '1px solid #e5e7eb'
                }}>
                    {logs.length === 0 ? 'Brak logów...' : logs.map((l, i) => <div key={i}>{l}</div>)}
                </div>
            )}

            {stats && (
                <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4, display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f3f4f6', paddingTop: 8 }}>
                    <span>Pliki: <b>{stats.apiEntries}</b></span>
                    <button onClick={handleReset} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 10 }}>Resetuj</button>
                </div>
            )}
        </div>
    );
}
