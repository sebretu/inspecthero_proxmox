import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile } from "@/lib/requesterProfile";

export const SYNC_PROTOCOL_VERSION = 1;

export type SyncOperation = 'INSERT' | 'UPDATE' | 'DELETE';

export interface SyncMutation<T = Record<string, any>> {
  mutation_id: string;
  entity_type: string;
  entity_id: string;
  operation: SyncOperation;
  base_version: number;
  payload: T;
  client_created_at: string;
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

const ALLOWED_MUTATION_TABLES = new Set([
  "tasks",
  "task_photos",
  "task_comments",
  "cables",
  "trommels",
  "materials",
  "orders",
  "order_items",
  "attendance",
]);

interface PushRequestBody {
  protocol_version?: number;
  mutations?: SyncMutation[];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      ok: false,
      error: { code: "METHOD_NOT_ALLOWED", message: "Only POST is supported for /api/sync/push" },
    });
  }

  // 1. Authenticate requester
  let supabaseServer: any;
  let userId: string | null = null;
  try {
    ({ client: supabaseServer, userId } = createServerSupabaseClient(req));
  } catch {
    return res.status(401).json({
      ok: false,
      error: { code: "AUTH_REQUIRED", message: "Missing or invalid Bearer authentication token" },
    });
  }

  let requester: { id: string; role: string | null; company_id: string | null };
  try {
    requester = await requireRequesterProfile(supabaseServer, userId);
  } catch (err: any) {
    return res.status(err?.status || 403).json({
      ok: false,
      error: { code: "FORBIDDEN", message: err?.message || "Unable to resolve requester profile" },
    });
  }

  // 2. Validate request
  const body: PushRequestBody = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const protocolVersion = body.protocol_version ?? SYNC_PROTOCOL_VERSION;

  if (protocolVersion !== SYNC_PROTOCOL_VERSION) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "UNSUPPORTED_PROTOCOL_VERSION",
        message: `Client protocol version ${protocolVersion} is not supported. Expected ${SYNC_PROTOCOL_VERSION}.`,
      },
    });
  }

  const mutations = Array.isArray(body.mutations) ? body.mutations : [];
  if (mutations.length === 0) {
    return res.status(200).json({
      ok: true,
      protocol_version: SYNC_PROTOCOL_VERSION,
      processed: [],
    });
  }

  const db = createServiceSupabaseClient();
  const processedResults: MutationResult[] = [];

  for (const mutation of mutations) {
    const { mutation_id, entity_type, entity_id, operation, base_version, payload } = mutation;

    if (!mutation_id || !entity_type || !entity_id || !operation) {
      processedResults.push({
        mutation_id: mutation_id || 'unknown',
        status: 'REJECTED',
        error: { code: 'INVALID_PAYLOAD', message: 'Missing required mutation fields' },
      });
      continue;
    }

    if (!ALLOWED_MUTATION_TABLES.has(entity_type)) {
      processedResults.push({
        mutation_id,
        status: 'REJECTED',
        error: { code: 'UNAUTHORIZED_ENTITY', message: `Mutations on entity '${entity_type}' are not permitted.` },
      });
      continue;
    }

    try {
      // 3. Idempotency check via processed_mutations
      const { data: existingProcessed } = await db
        .from('processed_mutations')
        .select('mutation_id, result')
        .eq('mutation_id', mutation_id)
        .maybeSingle();

      if (existingProcessed) {
        processedResults.push({
          mutation_id,
          status: 'DUPLICATE',
        });
        continue;
      }

      // 4. Check existing record
      const { data: currentRecord } = await db
        .from(entity_type)
        .select('*')
        .eq('id', entity_id)
        .maybeSingle();

      const now = new Date().toISOString();

      if (operation === 'INSERT') {
        if (currentRecord && !currentRecord.deleted_at) {
          processedResults.push({
            mutation_id,
            status: 'CONFLICT',
            version: currentRecord.version,
            error: { code: 'RECORD_ALREADY_EXISTS', message: 'Record already exists on server' },
          });
          continue;
        }

        const insertData = {
          ...payload,
          id: entity_id,
          version: 1,
          deleted_at: null,
          created_at: payload.created_at || now,
          updated_at: now,
        };

        const { error: insertErr } = await db.from(entity_type).upsert(insertData);
        if (insertErr) throw insertErr;

        await db.from('processed_mutations').insert({
          mutation_id,
          user_id: requester.id,
          company_id: requester.company_id,
          entity_type,
          entity_id,
          operation,
          result: { status: 'APPLIED', version: 1 },
        });

        processedResults.push({
          mutation_id,
          status: 'APPLIED',
          version: 1,
        });
      } else if (operation === 'UPDATE') {
        if (!currentRecord || currentRecord.deleted_at) {
          processedResults.push({
            mutation_id,
            status: 'REJECTED',
            error: { code: 'NOT_FOUND', message: 'Record does not exist or has been deleted on server' },
          });
          continue;
        }

        const serverVersion = Number(currentRecord.version || 1);
        if (base_version < serverVersion) {
          // Version conflict
          processedResults.push({
            mutation_id,
            status: 'CONFLICT',
            version: serverVersion,
            error: { code: 'VERSION_CONFLICT', message: `Server version is v${serverVersion}, base was v${base_version}` },
          });
          continue;
        }

        const nextVersion = serverVersion + 1;
        const updateData = {
          ...payload,
          version: nextVersion,
          updated_at: now,
        };

        const { error: updateErr } = await db
          .from(entity_type)
          .update(updateData)
          .eq('id', entity_id);

        if (updateErr) throw updateErr;

        await db.from('processed_mutations').insert({
          mutation_id,
          user_id: requester.id,
          company_id: requester.company_id,
          entity_type,
          entity_id,
          operation,
          result: { status: 'APPLIED', version: nextVersion },
        });

        processedResults.push({
          mutation_id,
          status: 'APPLIED',
          version: nextVersion,
        });
      } else if (operation === 'DELETE') {
        if (!currentRecord) {
          processedResults.push({
            mutation_id,
            status: 'APPLIED',
          });
          continue;
        }

        const nextVersion = Number(currentRecord.version || 1) + 1;
        const { error: deleteErr } = await db
          .from(entity_type)
          .update({ deleted_at: now, version: nextVersion, updated_at: now })
          .eq('id', entity_id);

        if (deleteErr) throw deleteErr;

        await db.from('processed_mutations').insert({
          mutation_id,
          user_id: requester.id,
          company_id: requester.company_id,
          entity_type,
          entity_id,
          operation,
          result: { status: 'APPLIED', version: nextVersion },
        });

        processedResults.push({
          mutation_id,
          status: 'APPLIED',
          version: nextVersion,
        });
      }
    } catch (err: any) {
      console.error(`[/api/sync/push] Error applying mutation ${mutation_id}:`, err);
      processedResults.push({
        mutation_id,
        status: 'REJECTED',
        error: { code: 'SERVER_ERROR', message: err?.message || 'Database write failure' },
      });
    }
  }

  return res.status(200).json({
    ok: true,
    protocol_version: SYNC_PROTOCOL_VERSION,
    processed: processedResults,
  });
}
