"use client";

import { useEffect, useState } from 'react';
import { Network } from '@capacitor/network';
import { Capacitor } from '@capacitor/core';

export interface UseNetworkResult {
    isOnline: boolean;
    connectionType: string;
    isConnected: boolean;
}

/**
 * React hook for monitoring network status
 */
export function useNetwork(): UseNetworkResult {
    const [isOnline, setIsOnline] = useState(true);
    const [connectionType, setConnectionType] = useState('unknown');

    useEffect(() => {
        // Only use Capacitor Network plugin on native platforms
        if (!Capacitor.isNativePlatform()) {
            // Use web APIs
            const handleOnline = () => setIsOnline(true);
            const handleOffline = () => setIsOnline(false);

            window.addEventListener('online', handleOnline);
            window.addEventListener('offline', handleOffline);

            setIsOnline(navigator.onLine);

            return () => {
                window.removeEventListener('online', handleOnline);
                window.removeEventListener('offline', handleOffline);
            };
        }

        // Use Capacitor Network plugin for native
        let cleanup: (() => void) | undefined;

        const setupNetworkListener = async () => {
            // Get initial status
            const status = await Network.getStatus();
            setIsOnline(status.connected);
            setConnectionType(status.connectionType);

            // Listen for changes
            const listener = await Network.addListener(
                'networkStatusChange',
                (status) => {
                    setIsOnline(status.connected);
                    setConnectionType(status.connectionType);
                }
            );

            cleanup = () => listener.remove();
        };

        setupNetworkListener();

        return () => {
            if (cleanup) cleanup();
        };
    }, []);

    return {
        isOnline,
        connectionType,
        isConnected: isOnline,
    };
}
