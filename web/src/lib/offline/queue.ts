import { IDBStorage } from './idb';

export type MutationType = 'CREATE' | 'UPDATE' | 'DELETE' | 'CREATE_COMPOSITE_TASK';

export interface QueuedMutation {
    id: string;
    type: MutationType;
    resource: string; // e.g., 'tasks', 'task_photos', 'task_comments'
    data: any;
    timestamp: number;
    retryCount: number;
    lastError?: string;
}

/**
 * Mutation queue for offline operations
 * Stores pending creates/updates/deletes to be synced when online
 */
export class MutationQueue {
    private static readonly QUEUE_KEY = 'mutation_queue';
    private static readonly MAX_RETRIES = 3;

    /**
     * Add a mutation to the queue
     */
    static async enqueue(
        type: MutationType,
        resource: string,
        data: any
    ): Promise<string> {
        const queue = await this.getQueue();

        const mutation: QueuedMutation = {
            id: this.generateId(),
            type,
            resource,
            data,
            timestamp: Date.now(),
            retryCount: 0,
        };

        queue.push(mutation);
        await this.saveQueue(queue);

        console.log(`Queued ${type} mutation for ${resource}:`, mutation.id);
        return mutation.id;
    }

    /**
     * Get all pending mutations
     */
    static async getQueue(): Promise<QueuedMutation[]> {
        const queue = await IDBStorage.get<QueuedMutation[]>(this.QUEUE_KEY);
        return queue || [];
    }

    /**
     * Save the queue
     */
    private static async saveQueue(queue: QueuedMutation[]): Promise<void> {
        await IDBStorage.set(this.QUEUE_KEY, queue);
    }

    /**
     * Remove a mutation from the queue
     */
    static async dequeue(mutationId: string): Promise<void> {
        const queue = await this.getQueue();
        const filtered = queue.filter((m) => m.id !== mutationId);
        await this.saveQueue(filtered);
        console.log(`Dequeued mutation:`, mutationId);
    }
    /**
     * Mark a mutation as failed and increment retry count
     * Returns true if should retry, false if max retries reached
     */
    static async markFailed(mutationId: string, error: string): Promise<boolean> {
        const queue = await this.getQueue();
        const mutation = queue.find((m) => m.id === mutationId);

        if (!mutation) {
            return false;
        }

        mutation.retryCount = (mutation.retryCount || 0) + 1;
        mutation.lastError = error;

        await this.saveQueue(queue);

        return mutation.retryCount < this.MAX_RETRIES;
    }

    /**
     * Clear the entire queue
     */
    static async clear(): Promise<void> {
        await IDBStorage.remove(this.QUEUE_KEY);
        console.log('Mutation queue cleared');
    }

    /**
     * Get queue size
     */
    static async size(): Promise<number> {
        const queue = await this.getQueue();
        return queue.length;
    }

    /**
     * Get failed mutations that still have retries left
     */
    static async getFailedMutations(): Promise<QueuedMutation[]> {
        const queue = await this.getQueue();
        return queue.filter(
            (m) => m.retryCount > 0 && m.retryCount < this.MAX_RETRIES
        );
    }

    /**
     * Generate a unique ID for mutations
     */
    private static generateId(): string {
        return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
