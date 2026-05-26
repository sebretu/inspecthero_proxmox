"use client";

import { useEffect, useState } from 'react';
import { SyncService, SyncStatus } from '@/lib/offline';

export interface UseSyncResult {
    status: SyncStatus;
    pendingCount: number;
    sync: () => Promise<void>;
    isSyncing: boolean;
}

/**
 * React hook for background sync management
 */
export function useSync(): UseSyncResult {
    const [status, setStatus] = useState<SyncStatus>('idle');
    const [pendingCount, setPendingCount] = useState(0);

    useEffect(() => {
        // Initialize sync service
        SyncService.initialize().catch(console.error);

        // Add status listener
        const handleStatusChange = (newStatus: SyncStatus) => {
            setStatus(newStatus);
        };

        SyncService.addListener(handleStatusChange);

        // Update pending count periodically
        const updatePendingCount = async () => {
            const count = await SyncService.getPendingCount();
            setPendingCount(count);
        };

        updatePendingCount();
        const interval = setInterval(updatePendingCount, 5000); // Check every 5 seconds

        return () => {
            SyncService.removeListener(handleStatusChange);
            clearInterval(interval);
        };
    }, []);

    const sync = async () => {
        await SyncService.sync();
        const count = await SyncService.getPendingCount();
        setPendingCount(count);
    };

    return {
        status,
        pendingCount,
        sync,
        isSyncing: status === 'syncing',
    };
}
