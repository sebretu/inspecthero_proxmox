import { Capacitor } from '@capacitor/core';

/**
 * Platform detection and utility functions for Capacitor apps
 */
export class PlatformService {
    /**
     * Check if running as a native app
     */
    static isNative(): boolean {
        return Capacitor.isNativePlatform();
    }

    /**
     * Check if running in a web browser
     */
    static isWeb(): boolean {
        return !Capacitor.isNativePlatform();
    }

    /**
     * Get the current platform
     */
    static getPlatform(): 'ios' | 'android' | 'web' {
        return Capacitor.getPlatform() as 'ios' | 'android' | 'web';
    }

    /**
     * Check if running on iOS
     */
    static isIOS(): boolean {
        return Capacitor.getPlatform() === 'ios';
    }

    /**
     * Check if running on Android
     */
    static isAndroid(): boolean {
        return Capacitor.getPlatform() === 'android';
    }

    /**
     * Check if a specific plugin is available
     */
    static isPluginAvailable(pluginName: string): boolean {
        return Capacitor.isPluginAvailable(pluginName);
    }

    /**
     * Convert a web path to native path if needed
     */
    static convertFileSrc(url: string): string {
        return Capacitor.convertFileSrc(url);
    }
}
