import {
    PushNotifications,
    Token,
    PushNotificationSchema,
    ActionPerformed,
    PermissionStatus,
} from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

export interface NotificationPayload {
    title: string;
    body: string;
    data?: Record<string, any>;
}

/**
 * Push Notifications service wrapper for Capacitor Push Notifications plugin
 * Provides methods to register for push notifications and handle incoming notifications
 */
export class PushNotificationService {
    private static deviceToken: string | null = null;
    private static isInitialized = false;

    /**
     * Check if push notifications are available on this platform
     */
    static isAvailable(): boolean {
        return Capacitor.isNativePlatform();
    }

    /**
     * Initialize push notifications and set up listeners
     */
    static async initialize(
        onTokenReceived: (token: string) => void,
        onNotificationReceived: (notification: PushNotificationSchema) => void,
        onNotificationActionPerformed: (action: ActionPerformed) => void
    ): Promise<void> {
        if (this.isInitialized) {
            console.warn('Push notifications already initialized');
            return;
        }

        if (!this.isAvailable()) {
            console.warn('Push notifications not available on this platform');
            return;
        }

        try {
            // Request permission
            const permResult = await PushNotifications.requestPermissions();

            if (permResult.receive !== 'granted') {
                throw new Error('Push notification permission not granted');
            }

            // Register with APNs / FCM
            await PushNotifications.register();

            // Set up listeners
            await this.addListeners(
                onTokenReceived,
                onNotificationReceived,
                onNotificationActionPerformed
            );

            this.isInitialized = true;
            console.log('Push notifications initialized successfully');
        } catch (error) {
            console.error('Failed to initialize push notifications:', error);
            throw error;
        }
    }

    /**
     * Add event listeners for push notifications
     */
    private static async addListeners(
        onTokenReceived: (token: string) => void,
        onNotificationReceived: (notification: PushNotificationSchema) => void,
        onNotificationActionPerformed: (action: ActionPerformed) => void
    ): Promise<void> {
        // Called when registration succeeds and we receive a device token
        await PushNotifications.addListener('registration', (token: Token) => {
            console.log('Push registration success, token:', token.value);
            this.deviceToken = token.value;
            onTokenReceived(token.value);
        });

        // Called when registration fails
        await PushNotifications.addListener('registrationError', (error: any) => {
            console.error('Push registration error:', error);
        });

        // Called when a notification is received while app is in foreground
        await PushNotifications.addListener(
            'pushNotificationReceived',
            (notification: PushNotificationSchema) => {
                console.log('Push notification received:', notification);
                onNotificationReceived(notification);
            }
        );

        // Called when user taps on a notification
        await PushNotifications.addListener(
            'pushNotificationActionPerformed',
            (action: ActionPerformed) => {
                console.log('Push notification action performed:', action);
                onNotificationActionPerformed(action);
            }
        );
    }

    /**
     * Check current permission status
     */
    static async checkPermissions(): Promise<PermissionStatus> {
        return await PushNotifications.checkPermissions();
    }

    /**
     * Request push notification permissions
     */
    static async requestPermissions(): Promise<PermissionStatus> {
        return await PushNotifications.requestPermissions();
    }

    /**
     * Get the current device token
     */
    static getDeviceToken(): string | null {
        return this.deviceToken;
    }

    /**
     * Get delivery status of notifications (iOS only)
     */
    static async getDeliveredNotifications(): Promise<PushNotificationSchema[]> {
        const result = await PushNotifications.getDeliveredNotifications();
        return result.notifications;
    }

    /**
     * Remove delivered notifications (iOS only)
     */
    static async removeDeliveredNotifications(
        notifications: PushNotificationSchema[]
    ): Promise<void> {
        await PushNotifications.removeDeliveredNotifications({ notifications });
    }

    /**
     * Remove all delivered notifications
     */
    static async removeAllDeliveredNotifications(): Promise<void> {
        await PushNotifications.removeAllDeliveredNotifications();
    }

    /**
     * Remove all listeners
     */
    static async removeAllListeners(): Promise<void> {
        await PushNotifications.removeAllListeners();
        this.isInitialized = false;
    }

    /**
     * Create a channel for notifications (Android only)
     * Required for Android 8.0 (API level 26) and higher
     */
    static async createChannel(
        id: string,
        name: string,
        description: string,
        importance: 1 | 2 | 3 | 4 | 5 = 3
    ): Promise<void> {
        if (Capacitor.getPlatform() === 'android') {
            // This would require additional Android-specific setup
            // For now, just log
            console.log('Create notification channel:', { id, name, description, importance });
        }
    }
}
