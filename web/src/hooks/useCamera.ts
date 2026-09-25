"use client";

import { useState, useCallback } from 'react';
import { CameraService, CapturedPhoto } from '@/lib/native';

export interface UseCameraResult {
    photo: CapturedPhoto | null;
    isLoading: boolean;
    error: string | null;
    takePhoto: () => Promise<void>;
    selectFromGallery: () => Promise<void>;
    clearPhoto: () => void;
    isAvailable: boolean;
}

/**
 * React hook for using the camera
 */
export function useCamera(): UseCameraResult {
    const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const takePhoto = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const capturedPhoto = await CameraService.getPhotoForUpload('camera');
            if (capturedPhoto) {
                setPhoto(capturedPhoto);
            } else {
                setError('Failed to capture photo');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const selectFromGallery = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const capturedPhoto = await CameraService.getPhotoForUpload('gallery');
            if (capturedPhoto) {
                setPhoto(capturedPhoto);
            } else {
                setError('Failed to select photo');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const clearPhoto = useCallback(() => {
        setPhoto(null);
        setError(null);
    }, []);

    return {
        photo,
        isLoading,
        error,
        takePhoto,
        selectFromGallery,
        clearPhoto,
        isAvailable: CameraService.isAvailable(),
    };
}
