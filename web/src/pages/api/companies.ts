import { createServerSupabaseClient, isAuthRequiredError } from "@/lib/supabaseServer";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { NextApiRequest, NextApiResponse } from "next";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { client, userId } = await createServerSupabaseClient(req);
    const adminClient = getSupabaseAdminClient();
    let cachedRequester: { id: string; role: string | null } | null = null;

    async function getRequester() {
      if (cachedRequester) return cachedRequester;
      if (!userId) {
        throw {
          status: 401,
          code: "AUTH_INVALID",
          message: "Missing auth user",
        };
      }

      const { data, error } = await client
        .from("profiles")
        .select("id, role")
        .eq("id", userId)
        .single();

      if (error) {
        throw {
          status: error.status || 400,
          code: error.code || "PROFILE_ERROR",
          message: error.message,
          details: error.details,
        };
      }

      cachedRequester = data;
      return data;
    }

    async function ensureAdmin() {
      try {
        const requester = await getRequester();
        if (requester?.role !== "ADMIN") {
          res.status(403).json({ ok: false, error: { message: "Only admins can modify companies", code: "FORBIDDEN" } });
          return false;
        }
        return true;
      } catch (err: any) {
        res.status(err?.status || 400).json({
          ok: false,
          error: { message: err?.message || "Unable to load profile", code: err?.code || "PROFILE_ERROR", meta: err?.details },
        });
        return false;
      }
    }

    // GET /api/companies - list all companies
    if (req.method === "GET") {
      let profile: { id: string; role: string | null } | null = null;
      try {
        profile = await getRequester();
      } catch (err: any) {
        return res.status(err?.status || 400).json({
          ok: false,
          error: { message: err?.message || "Unable to load profile", code: err?.code || "PROFILE_ERROR", meta: err?.details },
        });
      }

      const supabaseForSelect = profile?.role === "ADMIN" ? adminClient : client;

      const { data, error } = await supabaseForSelect
        .from("companies")
        .select("id, name, slug, is_active, created_at")
        .order("name");

      if (error) {
        return res.status(400).json({ ok: false, error });
      }
      return res.status(200).json({ ok: true, data: data || [] });
    }

    if (req.method === "POST") {
      if (!(await ensureAdmin())) return;

      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      if (!name) {
        return res.status(400).json({ ok: false, error: { message: "Company name is required", code: "BAD_REQUEST" } });
      }

      const rawSlug = typeof req.body?.slug === "string" ? req.body.slug.trim().toLowerCase() : "";
      let resolvedSlug = rawSlug || slugify(name);
      if (!resolvedSlug) {
        resolvedSlug = `company-${Date.now()}`;
      }

      const isActive = req.body?.is_active === undefined ? true : Boolean(req.body.is_active);

      const { data, error } = await adminClient
        .from("companies")
        .insert({ name, slug: resolvedSlug, is_active: isActive })
        .select("id, name, slug, is_active, created_at")
        .single();

      if (error) {
        return res.status((error as any).status || 400).json({
          ok: false,
          error: { message: error.message, code: error.code, meta: error.details },
        });
      }

      return res.status(201).json({ ok: true, data });
    }

    if (req.method === "PATCH") {
      if (!(await ensureAdmin())) return;

      const companyId = typeof req.body?.id === "string" ? req.body.id.trim() : "";
      if (!companyId || !isUuid(companyId)) {
        return res.status(400).json({ ok: false, error: { message: "Missing or invalid company id", code: "BAD_REQUEST" } });
      }

      const updates: Record<string, any> = {};
      if (typeof req.body?.name === "string" && req.body.name.trim()) {
        updates.name = req.body.name.trim();
        updates.slug = slugify(updates.name);
      }
      if (req.body?.is_active !== undefined) {
        updates.is_active = Boolean(req.body.is_active);
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ ok: false, error: { message: "No fields to update", code: "BAD_REQUEST" } });
      }

      const { data, error } = await adminClient
        .from("companies")
        .update(updates)
        .eq("id", companyId)
        .select("id, name, slug, is_active, created_at")
        .single();

      if (error) {
        return res.status((error as any).status || 400).json({
          ok: false,
          error: { message: error.message, code: error.code, meta: error.details },
        });
      }

      return res.status(200).json({ ok: true, data });
    }

    if (req.method === "DELETE") {
      if (!(await ensureAdmin())) return;

      const companyId = typeof req.query.id === "string" ? req.query.id.trim() : "";
      if (!companyId || !isUuid(companyId)) {
        return res.status(400).json({ ok: false, error: { message: "Missing or invalid company id", code: "BAD_REQUEST" } });
      }

      await adminClient.from("profiles").update({ company_id: null }).eq("company_id", companyId);

      const { data, error } = await adminClient
        .from("companies")
        .delete()
        .eq("id", companyId)
        .select("id, name, slug, is_active, created_at")
        .single();

      if (error) {
        return res.status((error as any).status || 400).json({
          ok: false,
          error: { message: error.message, code: error.code, meta: error.details },
        });
      }

      return res.status(200).json({ ok: true, data });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (isAuthRequiredError(err)) {
      return res.status(401).json({
        ok: false,
        error: { message: "Missing Bearer token", code: "AUTH_REQUIRED" },
      });
    }

    console.error("Error in /api/companies:", err);
    return res.status(500).json({
      ok: false,
      error: "Internal server error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
