import { Geolocation, Position, PositionOptions } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

export interface LocationCoordinates {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude?: number | null;
    altitudeAccuracy?: number | null;
    heading?: number | null;
    speed?: number | null;
    timestamp: number;
}

/**
 * Geolocation service wrapper for Capacitor Geolocation plugin
 * Provides methods to get current position and track position changes
 */
export class GeolocationService {
    private static watchId: string | null = null;

    /**
     * Check if geolocation is available on this platform
     */
    static isAvailable(): boolean {
        return Capacitor.isNativePlatform() || 'geolocation' in navigator;
    }

    /**
     * Request location permissions
     */
    static async requestPermissions(): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) {
            return true; // Browser handles permissions during getCurrentPosition
        }
        try {
            const result = await Geolocation.requestPermissions();
            return result.location === 'granted' || result.coarseLocation === 'granted';
        } catch (error) {
            console.error('Geolocation permission request failed:', error);
            return false;
        }
    }

    /**
     * Check if location permissions are granted
     */
    static async checkPermissions(): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) {
            return true; // Browser handles permissions during getCurrentPosition
        }
        try {
            const result = await Geolocation.checkPermissions();
            return result.location === 'granted' || result.coarseLocation === 'granted';
        } catch (error) {
            console.error('Geolocation permission check failed:', error);
            return false;
        }
    }

    /**
     * Get current GPS position
     */
    static async getCurrentPosition(
        options?: PositionOptions
    ): Promise<LocationCoordinates | null> {
        try {
            // On web, we skip permission checks as they are not implemented/needed in Capacitor web plugin
            // The browser will prompt automatically when we call getCurrentPosition
            if (Capacitor.isNativePlatform()) {
                const hasPermission = await this.checkPermissions();
                if (!hasPermission) {
                    const granted = await this.requestPermissions();
                    if (!granted) {
                        throw new Error('Location permission denied');
                    }
                }
            }

            try {
                const position: Position = await Geolocation.getCurrentPosition({
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0,
                    ...options,
                });

                return {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    altitude: position.coords.altitude,
                    altitudeAccuracy: position.coords.altitudeAccuracy,
                    heading: position.coords.heading,
                    speed: position.coords.speed,
                    timestamp: position.timestamp,
                };
            } catch (capError) {
                // Fallback to native browser API if Capacitor fails on web
                if (!Capacitor.isNativePlatform() && 'geolocation' in navigator) {
                    console.warn('Capacitor geolocation failed on web, falling back to navigator.geolocation');
                    return new Promise((resolve) => {
                        navigator.geolocation.getCurrentPosition(
                            (pos) => {
                                resolve({
                                    latitude: pos.coords.latitude,
                                    longitude: pos.coords.longitude,
                                    accuracy: pos.coords.accuracy,
                                    altitude: pos.coords.altitude,
                                    altitudeAccuracy: pos.coords.altitudeAccuracy,
                                    heading: pos.coords.heading,
                                    speed: pos.coords.speed,
                                    timestamp: pos.timestamp,
                                });
                            },
                            (err) => {
                                console.error('Navigator geolocation failed:', err);
                                resolve(null);
                            },
                            {
                                enableHighAccuracy: true,
                                timeout: 10000,
                                maximumAge: 0,
                                ...options,
                            }
                        );
                    });
                }
                throw capError;
            }
        } catch (error) {
            console.error('Failed to get current position:', error);
            return null;
        }
    }

    /**
     * Start watching position changes
     */
    static async watchPosition(
        callback: (position: LocationCoordinates) => void,
        errorCallback?: (error: any) => void,
        options?: PositionOptions
    ): Promise<string | null> {
        try {
            // On web, we skip permission checks as they are not implemented/needed in Capacitor web plugin
            if (Capacitor.isNativePlatform()) {
                const hasPermission = await this.checkPermissions();
                if (!hasPermission) {
                    const granted = await this.requestPermissions();
                    if (!granted) {
                        throw new Error('Location permission denied');
                    }
                }
            }

            this.watchId = await Geolocation.watchPosition(
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0,
                    ...options,
                },
                (position, err) => {
                    if (err) {
                        console.error('Position watch error:', err);
                        if (errorCallback) errorCallback(err);
                        return;
                    }

                    if (position) {
                        callback({
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                            accuracy: position.coords.accuracy,
                            altitude: position.coords.altitude,
                            altitudeAccuracy: position.coords.altitudeAccuracy,
                            heading: position.coords.heading,
                            speed: position.coords.speed,
                            timestamp: position.timestamp,
                        });
                    }
                }
            );

            return this.watchId;
        } catch (error) {
            console.error('Failed to watch position:', error);
            if (errorCallback) errorCallback(error);
            return null;
        }
    }

    /**
     * Stop watching position changes
     */
    static async clearWatch(watchId?: string): Promise<void> {
        try {
            const idToClear = watchId || this.watchId;
            if (idToClear) {
                await Geolocation.clearWatch({ id: idToClear });
                if (idToClear === this.watchId) {
                    this.watchId = null;
                }
            }
        } catch (error) {
            console.error('Failed to clear watch:', error);
        }
    }

    /**
     * Get distance between two coordinates in meters (Haversine formula)
     */
    static calculateDistance(
        lat1: number,
        lon1: number,
        lat2: number,
        lon2: number
    ): number {
        const R = 6371e3; // Earth's radius in meters
        const φ1 = (lat1 * Math.PI) / 180;
        const φ2 = (lat2 * Math.PI) / 180;
        const Δφ = ((lat2 - lat1) * Math.PI) / 180;
        const Δλ = ((lon2 - lon1) * Math.PI) / 180;

        const a =
            Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }
}
