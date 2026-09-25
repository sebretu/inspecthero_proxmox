import { useState, useCallback } from 'react';
import { startPrefetchProcess, PrefetchProgress } from '../lib/offline/prefetch';

export function usePrefetch() {
    const [isPrefetching, setIsPrefetching] = useState(false);
    const [progress, setProgress] = useState<PrefetchProgress | null>(null);
    const [error, setError] = useState<string | null>(null);

    const startPrefetch = useCallback(async () => {
        setIsPrefetching(true);
        setError(null);
        setProgress({ current: 0, total: 100, phase: 'Inicjalizacja...' });

        try {
            await startPrefetchProcess((p) => {
                setProgress(p);
            });
        } catch (err: any) {
            setError(err?.message || String(err));
        } finally {
            setIsPrefetching(false);
        }
    }, []);

    return {
        isPrefetching,
        progress,
        error,
        startPrefetch,
    };
}
