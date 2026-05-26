import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

export interface CapturedPhoto {
    dataUrl: string;
    format: string;
    blob?: Blob;
}

/**
 * Camera service wrapper for Capacitor Camera plugin
 * Provides methods to capture photos from camera or select from gallery
 */
export class CameraService {
    /**
     * Check if camera is available on this platform
     */
    static isAvailable(): boolean {
        return Capacitor.isNativePlatform();
    }

    /**
     * Request camera permissions
     */
    static async requestPermissions(): Promise<boolean> {
        try {
            const result = await Camera.requestPermissions();
            return result.camera === 'granted' && result.photos === 'granted';
        } catch (error) {
            console.error('Camera permission request failed:', error);
            return false;
        }
    }

    /**
     * Check if camera permissions are granted
     */
    static async checkPermissions(): Promise<boolean> {
        try {
            const result = await Camera.checkPermissions();
            return result.camera === 'granted' && result.photos === 'granted';
        } catch (error) {
            console.error('Camera permission check failed:', error);
            return false;
        }
    }

    /**
     * Take a photo using the device camera
     */
    static async takePhoto(): Promise<CapturedPhoto | null> {
        try {
            // Check permissions first
            const hasPermission = await this.checkPermissions();
            if (!hasPermission) {
                const granted = await this.requestPermissions();
                if (!granted) {
                    throw new Error('Camera permission denied');
                }
            }

            const photo: Photo = await Camera.getPhoto({
                quality: 90,
                allowEditing: false,
                resultType: CameraResultType.DataUrl,
                source: CameraSource.Camera,
                saveToGallery: true,
            });

            return {
                dataUrl: photo.dataUrl!,
                format: photo.format,
            };
        } catch (error) {
            console.error('Failed to take photo:', error);
            return null;
        }
    }

    /**
     * Select a photo from the device gallery
     */
    static async selectFromGallery(): Promise<CapturedPhoto | null> {
        try {
            // Check permissions first
            const hasPermission = await this.checkPermissions();
            if (!hasPermission) {
                const granted = await this.requestPermissions();
                if (!granted) {
                    throw new Error('Photos permission denied');
                }
            }

            const photo: Photo = await Camera.getPhoto({
                quality: 90,
                allowEditing: false,
                resultType: CameraResultType.DataUrl,
                source: CameraSource.Photos,
            });

            return {
                dataUrl: photo.dataUrl!,
                format: photo.format,
            };
        } catch (error) {
            console.error('Failed to select photo:', error);
            return null;
        }
    }

    /**
     * Convert data URL to Blob for upload
     */
    static async dataUrlToBlob(dataUrl: string): Promise<Blob> {
        const response = await fetch(dataUrl);
        return await response.blob();
    }

    /**
     * Get photo with blob data ready for upload
     */
    static async getPhotoForUpload(source: 'camera' | 'gallery'): Promise<CapturedPhoto | null> {
        const photo = source === 'camera'
            ? await this.takePhoto()
            : await this.selectFromGallery();

        if (!photo) return null;

        // Convert to blob for upload
        const blob = await this.dataUrlToBlob(photo.dataUrl);
        return {
            ...photo,
            blob,
        };
    }
}
