/**
 * InspectHero Sync Protocol - Core Types & Protocol Definition
 * Protocol Version: 1
 */

export const SYNC_PROTOCOL_VERSION = 1;

export type SyncOperation = 'INSERT' | 'UPDATE' | 'DELETE';

export type SyncEntityType =
  | 'projects'
  | 'buildings'
  | 'floors'
  | 'plans'
  | 'tasks'
  | 'task_photos'
  | 'task_comments'
  | 'cables'
  | 'trommels'
  | 'cable_routes'
  | 'cable_buses'
  | 'bma_devices'
  | 'stromkreise'
  | 'materials'
  | 'orders'
  | 'order_items'
  | 'attendance';

export interface SyncChange<T = Record<string, any>> {
  cursor: number;
  table: SyncEntityType;
  record_id: string;
  operation: SyncOperation;
  version: number;
  data: T | { id: string; deleted_at: string };
  changed_at: string;
}

export interface SyncPullRequest {
  protocol_version: number;
  cursor: number;
  limit?: number;
  tables?: SyncEntityType[];
  project_id?: string;
}

export interface SyncPullResponse {
  ok: boolean;
  protocol_version: number;
  next_cursor: number;
  has_more: boolean;
  count: number;
  changes: SyncChange[];
  error?: {
    code: string;
    message: string;
  };
}

export interface SyncMutation<T = Record<string, any>> {
  mutation_id: string;
  entity_type: SyncEntityType;
  entity_id: string;
  operation: SyncOperation;
  base_version: number;
  payload: T;
  client_created_at: string;
}

export interface SyncPushRequest {
  protocol_version: number;
  mutations: SyncMutation[];
}

export interface MutationResult {
  mutation_id: string;
  status: 'APPLIED' | 'CONFLICT' | 'DUPLICATE' | 'REJECTED';
  version?: number;
  error?: {
    code: string;
    message: string;
  };
}

export interface SyncPushResponse {
  ok: boolean;
  protocol_version: number;
  processed: MutationResult[];
  error?: {
    code: string;
    message: string;
  };
}
