import { Network } from '@capacitor/network';
import { IDBStorage } from './idb';
import { MutationQueue, QueuedMutation } from './queue';
import { supabase } from '@/lib/supabase';
import { apiPost, apiPatch } from '@/lib/apiClient';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export interface SyncResult {
    success: boolean;
    syncedCount: number;
    failedCount: number;
    errors: string[];
}

/**
 * Background sync manager
 * Handles syncing queued mutations when connection is restored
 */
export class SyncService {
    private static isSyncing = false;
    private static syncListeners: Array<(status: SyncStatus) => void> = [];

    /**
     * Initialize sync service and set up network listeners
     */
    static async initialize(): Promise<void> {
        // 1. Capacitor Listener (if available)
        try {
            Network.addListener('networkStatusChange', async (status) => {
                console.log('Capacitor: Network status changed:', status);
                if (status.connected && !this.isSyncing) {
                    console.log('Capacitor: Connection restored, starting sync...');
                    await this.sync();
                }
            });
        } catch (e) {
            console.warn('Capacitor Network listener not available:', e);
        }

        // 2. Browser Fallback (Standard Online Event)
        if (typeof window !== 'undefined') {
            window.addEventListener('online', async () => {
                console.log('Browser: Online event detected');
                if (!this.isSyncing) {
                    await this.sync();
                }
            });

            // Listen for custom trigger from Flutter
            window.addEventListener('sync-requested', async () => {
                console.log('Flutter: Sync request received');
                if (!this.isSyncing) {
                    await this.sync();
                }
            });
        }

        // Check initial network status and sync if online
        try {
            const status = await Network.getStatus();
            if (status.connected) {
                await this.sync();
            }
        } catch (e) {
            // Fallback check
            if (typeof navigator !== 'undefined' && navigator.onLine) {
                await this.sync();
            }
        }
    }

    /**
     * Add a sync status listener
     */
    static addListener(callback: (status: SyncStatus) => void): void {
        this.syncListeners.push(callback);
    }

    /**
     * Remove a sync status listener
     */
    static removeListener(callback: (status: SyncStatus) => void): void {
        this.syncListeners = this.syncListeners.filter((cb) => cb !== callback);
    }

    /**
     * Notify all listeners of status change
     */
    private static notifyListeners(status: SyncStatus): void {
        this.syncListeners.forEach((callback) => callback(status));
    }

    /**
     * Sync all pending mutations
     */
    static async sync(): Promise<SyncResult> {
        if (this.isSyncing) {
            console.log('Sync already in progress');
            return {
                success: false,
                syncedCount: 0,
                failedCount: 0,
                errors: ['Sync already in progress'],
            };
        }

        this.isSyncing = true;
        this.notifyListeners('syncing');

        const result: SyncResult = {
            success: true,
            syncedCount: 0,
            failedCount: 0,
            errors: [],
        };

        try {
            const queue = await MutationQueue.getQueue();
            console.log(`Syncing ${queue.length} pending mutations...`);

            for (const mutation of queue) {
                try {
                    await this.processMutation(mutation);
                    await MutationQueue.dequeue(mutation.id);
                    result.syncedCount++;
                } catch (error) {
                    const errorMessage =
                        error instanceof Error ? error.message : String(error);
                    console.error(`Failed to sync mutation ${mutation.id}:`, error);

                    const shouldRetry = await MutationQueue.markFailed(
                        mutation.id,
                        errorMessage
                    );

                    if (!shouldRetry) {
                        result.errors.push(
                            `Mutation ${mutation.id} failed permanently: ${errorMessage}`
                        );
                    }

                    result.failedCount++;
                    result.success = false;
                }
            }

            console.log(
                `Sync completed: ${result.syncedCount} succeeded, ${result.failedCount} failed`
            );
            this.notifyListeners('success');
        } catch (error) {
            console.error('Sync error:', error);
            result.success = false;
            result.errors.push(error instanceof Error ? error.message : String(error));
            this.notifyListeners('error');
        } finally {
            this.isSyncing = false;
            this.notifyListeners('idle');
        }

        return result;
    }

    /**
     * Process a single mutation
     */
    private static async processMutation(
        mutation: QueuedMutation
    ): Promise<void> {
        const { type, resource, data } = mutation;

        console.log(`Processing ${type} mutation for ${resource}`);

        switch (type) {
            case 'CREATE':
                await this.handleCreate(resource, data);
                break;
            case 'UPDATE':
                await this.handleUpdate(resource, data);
                break;
            case 'DELETE':
                await this.handleDelete(resource, data);
                break;
            // @ts-ignore
            case 'CREATE_COMPOSITE_TASK':
                // @ts-ignore
                await this.handleCreateCompositeTask(data);
                break;
            default:
                throw new Error(`Unknown mutation type: ${type}`);
        }
    }

    /**
     * Handle CREATE_COMPOSITE_TASK
     * Creates a task and uploads associated photos
     */
    private static async handleCreateCompositeTask(data: {
        taskData: any;
        photos: Array<{ fileName: string; caption: string | null; base64: string; photoType: string }>;
    }): Promise<void> {
        const { taskData, photos } = data;

        // 1. Create the task via API (reuses server logic)
        // We use apiPost because it handles things like notifying other users, etc.
        const newTask = await apiPost<{ id: string }>('/api/tasks', taskData);

        if (!newTask?.id) {
            throw new Error('Failed to create task: No ID returned');
        }

        console.log('Offline task created with ID:', newTask.id);

        // 2. Upload photos
        if (photos && photos.length > 0) {
            console.log(`Uploading ${photos.length} offline photos for task ${newTask.id}...`);
            for (const p of photos) {
                await apiPost('/api/task-photos', {
                    task_id: newTask.id,
                    file_name: p.fileName,
                    caption: p.caption,
                    base64: p.base64,
                    photo_type: p.photoType,
                });
            }
        }
    }

    /**
     * Handle CREATE mutation
     */
    private static async handleCreate(
        resource: string,
        data: any
    ): Promise<void> {
        // Use API for key resources to trigger server-side logic
        if (resource === 'tasks') {
            await apiPost('/api/tasks', data);
            return;
        }
        if (resource === 'task_photos') {
            await apiPost('/api/task-photos', data);
            return;
        }

        const { error } = await supabase.from(resource).insert(data);
        if (error) {
            throw new Error(`Failed to create ${resource}: ${error.message}`);
        }
    }

    /**
     * Handle UPDATE mutation
     */
    private static async handleUpdate(
        resource: string,
        data: any
    ): Promise<void> {
        const { id, ...updateData } = data;

        if (!id) {
            throw new Error('Update mutation missing id');
        }

        // Use API for key resources
        if (resource === 'tasks') {
            await apiPatch('/api/tasks', data);
            return;
        }

        const { error } = await supabase
            .from(resource)
            .update(updateData)
            .eq('id', id);

        if (error) {
            throw new Error(`Failed to update ${resource}: ${error.message}`);
        }
    }

    /**
     * Handle DELETE mutation
     */
    private static async handleDelete(
        resource: string,
        data: any
    ): Promise<void> {
        const { id } = data;

        if (!id) {
            throw new Error('Delete mutation missing id');
        }

        const { error } = await supabase.from(resource).delete().eq('id', id);

        if (error) {
            throw new Error(`Failed to delete ${resource}: ${error.message}`);
        }
    }

    /**
     * Get current sync status
     */
    static getSyncStatus(): SyncStatus {
        return this.isSyncing ? 'syncing' : 'idle';
    }

    /**
     * Check if currently syncing
     */
    static isCurrentlySyncing(): boolean {
        return this.isSyncing;
    }

    /**
     * Get pending mutations count
     */
    static async getPendingCount(): Promise<number> {
        return await MutationQueue.size();
    }
}
