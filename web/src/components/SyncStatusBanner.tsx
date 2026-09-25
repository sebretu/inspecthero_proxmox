"use client";

import { useEffect } from 'react';
import { useNetwork } from '@/hooks/useNetwork';
import { useSync } from '@/hooks/useSync';
import { SyncService } from '@/lib/offline';

/**
 * Component to show sync status banner
 */
export function SyncStatusBanner() {
    const { isOnline } = useNetwork();
    const { pendingCount, isSyncing } = useSync();

    useEffect(() => {
        // Initialize sync on mount
        SyncService.initialize().catch(console.error);
    }, []);

    if (!pendingCount && !isSyncing) {
        return null;
    }

    return (
        <div
            style={{
                background: isSyncing ? '#4CAF50' : '#ff9800',
                color: 'white',
                padding: '8px 16px',
                textAlign: 'center',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
            }}
        >
            {isSyncing ? (
                <>
                    <span>🔄</span>
                    <span>Synchronizowanie zmian...</span>
                </>
            ) : (
                <>
                    <span>📤</span>
                    <span>
                        {pendingCount} {pendingCount === 1 ? 'zmiana' : 'zmian'} oczekuje na
                        synchronizację
                    </span>
                    {!isOnline && <span>• Offline</span>}
                </>
            )}
        </div>
    );
}
