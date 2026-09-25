import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile, isAdminRole } from "@/lib/requesterProfile";

export const SYNC_PROTOCOL_VERSION = 1;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

const ALLOWED_SYNC_TABLES = new Set([
  "projects",
  "buildings",
  "floors",
  "plans",
  "tasks",
  "task_photos",
  "task_comments",
  "cables",
  "trommels",
  "cable_routes",
  "cable_buses",
  "bma_devices",
  "stromkreise",
  "materials",
  "orders",
  "order_items",
  "attendance",
]);

interface PullRequestBody {
  protocol_version?: number;
  cursor?: number | string;
  limit?: number;
  tables?: string[];
  project_id?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      ok: false,
      error: { code: "METHOD_NOT_ALLOWED", message: "Only POST is supported for /api/sync/pull" },
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

  // 2. Validate request parameters
  const body: PullRequestBody = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
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

  const rawCursor = typeof body.cursor === "string" ? parseInt(body.cursor, 10) : Number(body.cursor ?? 0);
  const cursor = isNaN(rawCursor) || rawCursor < 0 ? 0 : rawCursor;

  const requestedLimit = Number(body.limit ?? DEFAULT_LIMIT);
  const limit = Math.min(Math.max(1, isNaN(requestedLimit) ? DEFAULT_LIMIT : requestedLimit), MAX_LIMIT);

  const filterTables = Array.isArray(body.tables)
    ? body.tables.filter((t) => typeof t === "string" && ALLOWED_SYNC_TABLES.has(t))
    : null;

  const filterProjectId = typeof body.project_id === "string" && body.project_id.trim().length > 0
    ? body.project_id.trim()
    : null;

  const db = createServiceSupabaseClient();

  try {
    // 3. Determine accessible project IDs for the user
    let accessibleProjectIds: string[] = [];
    const isAdmin = isAdminRole(requester.role);

    if (requester.company_id) {
      const { data: companyProjects } = await db
        .from("projects")
        .select("id")
        .eq("company_id", requester.company_id);
      const allCompanyProjectIds = (companyProjects || []).map((p: any) => p.id);

      if (isAdmin) {
        accessibleProjectIds = allCompanyProjectIds;
      } else {
        const { data: memberships } = await db
          .from("project_members")
          .select("project_id")
          .eq("user_id", requester.id);
        const memberIds = (memberships || []).map((m: any) => m.project_id);
        accessibleProjectIds = memberIds.length > 0 ? memberIds : allCompanyProjectIds;
      }
    } else {
      // Default: all projects if user has no company constraint
      const { data: allProj } = await db.from("projects").select("id");
      accessibleProjectIds = (allProj || []).map((p: any) => p.id);
    }

    if (filterProjectId) {
      if (accessibleProjectIds.length > 0 && !accessibleProjectIds.includes(filterProjectId) && !isAdmin) {
        return res.status(403).json({
          ok: false,
          error: { code: "FORBIDDEN", message: "Access denied to the requested project" },
        });
      }
    }

    // 4. Query sync_changes with pagination limit + 1 to detect has_more
    let query = db
      .from("sync_changes")
      .select("cursor, table_name, record_id, operation, version, company_id, project_id, changed_at")
      .gt("cursor", cursor)
      .order("cursor", { ascending: true })
      .limit(limit + 1);

    // Apply tenant filter if not superadmin
    if (!isAdmin && requester.company_id) {
      if (accessibleProjectIds.length > 0) {
        query = query.or(`company_id.eq.${requester.company_id},project_id.in.(${accessibleProjectIds.join(",")}),company_id.is.null`);
      } else {
        query = query.or(`company_id.eq.${requester.company_id},company_id.is.null`);
      }
    }

    if (filterProjectId) {
      query = query.eq("project_id", filterProjectId);
    }

    if (filterTables && filterTables.length > 0) {
      query = query.in("table_name", filterTables);
    }

    const { data: rawChanges, error: changesError } = await query;

    if (changesError) {
      console.warn("[/api/sync/pull] sync_changes tenant query fallback:", changesError);
      // Fallback to basic cursor query
      const { data: fallbackChanges, error: fallbackError } = await db
        .from("sync_changes")
        .select("cursor, table_name, record_id, operation, version, changed_at")
        .gt("cursor", cursor)
        .order("cursor", { ascending: true })
        .limit(limit + 1);

      if (fallbackError) {
        console.error("[/api/sync/pull] Fallback query error:", fallbackError);
        return res.status(200).json({
          ok: true,
          data: { changes: [], next_cursor: cursor, has_more: false },
        });
      }
      const fRows = fallbackChanges || [];
      const fHasMore = fRows.length > limit;
      const fPaginated = fHasMore ? fRows.slice(0, limit) : fRows;
      return res.status(200).json({
        ok: true,
        data: {
          changes: fPaginated.map((r: any) => ({
            cursor: r.cursor,
            table: r.table_name,
            operation: r.operation,
            record_id: r.record_id,
            version: r.version,
            data: { id: r.record_id },
          })),
          next_cursor: fPaginated.length > 0 ? fPaginated[fPaginated.length - 1].cursor : cursor,
          has_more: fHasMore,
        },
      });
    }

    const changeRows = rawChanges || [];
    const hasMore = changeRows.length > limit;
    const paginatedChanges = hasMore ? changeRows.slice(0, limit) : changeRows;

    // 5. Hydrate row data for INSERT and UPDATE operations
    // Group records to fetch per table to minimize database roundtrips
    const idsToHydrateByTable: Record<string, Set<string>> = {};
    for (const change of paginatedChanges) {
      if (change.operation !== "DELETE" && ALLOWED_SYNC_TABLES.has(change.table_name)) {
        if (!idsToHydrateByTable[change.table_name]) {
          idsToHydrateByTable[change.table_name] = new Set();
        }
        idsToHydrateByTable[change.table_name].add(change.record_id);
      }
    }

    // Fetch batch records from each relevant table
    const tableDataCache: Record<string, Record<string, any>> = {};
    for (const [tableName, idSet] of Object.entries(idsToHydrateByTable)) {
      const ids = Array.from(idSet);
      if (ids.length === 0) continue;

      try {
        const { data: rows, error: fetchErr } = await db
          .from(tableName)
          .select("*")
          .in("id", ids);

        if (!fetchErr && rows) {
          tableDataCache[tableName] = {};
          for (const row of rows) {
            tableDataCache[tableName][row.id] = row;
          }
        }
      } catch (e) {
        console.warn(`[/api/sync/pull] Error hydrating table ${tableName}:`, e);
      }
    }

    // 6. Build change objects
    let maxCursor = cursor;
    const changes = paginatedChanges.map((change: any) => {
      if (change.cursor > maxCursor) {
        maxCursor = change.cursor;
      }

      const isDelete = change.operation === "DELETE";
      let rowData: any = null;

      if (!isDelete && tableDataCache[change.table_name]) {
        rowData = tableDataCache[change.table_name][change.record_id] || null;
      }

      // If record was soft-deleted or removed from live table, represent as DELETE tombstone
      const effectiveOperation = isDelete || !rowData || rowData.deleted_at ? "DELETE" : change.operation;

      return {
        cursor: change.cursor,
        table: change.table_name,
        record_id: change.record_id,
        operation: effectiveOperation,
        version: rowData?.version ?? change.version,
        data: effectiveOperation === "DELETE" ? { id: change.record_id, deleted_at: change.changed_at } : rowData,
        changed_at: change.changed_at,
      };
    });

    return res.status(200).json({
      ok: true,
      protocol_version: SYNC_PROTOCOL_VERSION,
      next_cursor: maxCursor,
      has_more: hasMore,
      count: changes.length,
      changes,
    });
  } catch (error: any) {
    console.error("[/api/sync/pull] Unhandled error:", error);
    return res.status(500).json({
      ok: false,
      error: { code: "SERVER_ERROR", message: error?.message || "Internal server error" },
    });
  }
}
