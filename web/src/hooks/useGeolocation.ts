"use client";

import { useState, useCallback, useEffect } from 'react';
import { GeolocationService, LocationCoordinates } from '@/lib/native';

export interface UseGeolocationResult {
    location: LocationCoordinates | null;
    isLoading: boolean;
    error: string | null;
    getCurrentLocation: () => Promise<void>;
    startWatching: () => Promise<void>;
    stopWatching: () => void;
    isWatching: boolean;
    isAvailable: boolean;
}

/**
 * React hook for geolocation
 */
export function useGeolocation(): UseGeolocationResult {
    const [location, setLocation] = useState<LocationCoordinates | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isWatching, setIsWatching] = useState(false);
    const [watchId, setWatchId] = useState<string | null>(null);

    const getCurrentLocation = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const position = await GeolocationService.getCurrentPosition();
            if (position) {
                setLocation(position);
            } else {
                setError('Failed to get location');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const startWatching = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const id = await GeolocationService.watchPosition(
                (position) => {
                    setLocation(position);
                    setIsLoading(false);
                },
                (err) => {
                    setError(err instanceof Error ? err.message : 'Unknown error');
                    setIsLoading(false);
                }
            );

            if (id) {
                setWatchId(id);
                setIsWatching(true);
            } else {
                setError('Failed to start watching location');
                setIsLoading(false);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
            setIsLoading(false);
        }
    }, []);

    const stopWatching = useCallback(() => {
        if (watchId) {
            GeolocationService.clearWatch(watchId);
            setWatchId(null);
            setIsWatching(false);
        }
    }, [watchId]);

    // Clean up on unmount
    useEffect(() => {
        return () => {
            if (watchId) {
                GeolocationService.clearWatch(watchId);
            }
        };
    }, [watchId]);

    return {
        location,
        isLoading,
        error,
        getCurrentLocation,
        startWatching,
        stopWatching,
        isWatching,
        isAvailable: GeolocationService.isAvailable(),
    };
}
