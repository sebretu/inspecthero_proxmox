import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

export interface StorageItem<T = any> {
    data: T;
    timestamp: number;
    expiresAt?: number;
}

/**
 * Local storage service using Capacitor Preferences
 * Provides key-value storage with JSON support and expiration
 */
export class StorageService {
    private static readonly PREFIX = 'taskmanager_';

    /**
     * Check if storage is available
     */
    static isAvailable(): boolean {
        return Capacitor.isNativePlatform() || typeof localStorage !== 'undefined';
    }

    /**
     * Get full key with prefix
     */
    private static getKey(key: string): string {
        return `${this.PREFIX}${key}`;
    }

    /**
     * Set an item in storage
     */
    static async set<T>(
        key: string,
        value: T,
        expiresInMs?: number
    ): Promise<void> {
        const fullKey = this.getKey(key);
        const item: StorageItem<T> = {
            data: value,
            timestamp: Date.now(),
            ...(expiresInMs && { expiresAt: Date.now() + expiresInMs }),
        };

        try {
            await Preferences.set({
                key: fullKey,
                value: JSON.stringify(item),
            });
        } catch (error) {
            console.error(`Failed to set storage item ${key}:`, error);
            throw error;
        }
    }

    /**
     * Get an item from storage
     */
    static async get<T>(key: string): Promise<T | null> {
        const fullKey = this.getKey(key);

        try {
            const { value } = await Preferences.get({ key: fullKey });

            if (!value) return null;

            const item: StorageItem<T> = JSON.parse(value);

            // Check if item has expired
            if (item.expiresAt && Date.now() > item.expiresAt) {
                await this.remove(key);
                return null;
            }

            return item.data;
        } catch (error) {
            console.error(`Failed to get storage item ${key}:`, error);
            return null;
        }
    }

    /**
     * Remove an item from storage
     */
    static async remove(key: string): Promise<void> {
        const fullKey = this.getKey(key);

        try {
            await Preferences.remove({ key: fullKey });
        } catch (error) {
            console.error(`Failed to remove storage item ${key}:`, error);
            throw error;
        }
    }

    /**
     * Clear all items with our prefix
     */
    static async clear(): Promise<void> {
        try {
            const { keys } = await Preferences.keys();
            const ourKeys = keys.filter((k) => k.startsWith(this.PREFIX));

            await Promise.all(
                ourKeys.map((key) => Preferences.remove({ key }))
            );
        } catch (error) {
            console.error('Failed to clear storage:', error);
            throw error;
        }
    }

    /**
     * Get all keys with our prefix
     */
    static async keys(): Promise<string[]> {
        try {
            const { keys } = await Preferences.keys();
            return keys
                .filter((k) => k.startsWith(this.PREFIX))
                .map((k) => k.replace(this.PREFIX, ''));
        } catch (error) {
            console.error('Failed to get keys:', error);
            return [];
        }
    }

    /**
     * Check if a key exists
     */
    static async has(key: string): Promise<boolean> {
        const value = await this.get(key);
        return value !== null;
    }

    /**
     * Get multiple items at once
     */
    static async getMultiple<T>(keys: string[]): Promise<Map<string, T>> {
        const results = new Map<string, T>();

        await Promise.all(
            keys.map(async (key) => {
                const value = await this.get<T>(key);
                if (value !== null) {
                    results.set(key, value);
                }
            })
        );

        return results;
    }

    /**
     * Set multiple items at once
     */
    static async setMultiple<T>(
        items: Map<string, T>,
        expiresInMs?: number
    ): Promise<void> {
        await Promise.all(
            Array.from(items.entries()).map(([key, value]) =>
                this.set(key, value, expiresInMs)
            )
        );
    }
}
