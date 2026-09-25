import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient, createServiceSupabaseClient, isAuthRequiredError } from "@/lib/supabaseServer";
import { isAdminRole, requireRequesterProfile } from "@/lib/requesterProfile";

type ApiOk<T = any> = { ok: true; data: T };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  try {
    const { client, userId } = await createServerSupabaseClient(req);

    if (req.method === "GET") {
      const { data: projects, error } = await client
        .from("projects")
        .select("id,name,address,is_archived,created_at,updated_at,company_id")
        .eq("is_archived", false)
        .order("created_at", { ascending: true });

      if (error) {
        return res.status((error as any).status || 400).json({
          ok: false,
          error: {
            code: "SUPABASE",
            message: error.message,
            meta: { code: (error as any).code, details: (error as any).details },
          },
        });
      }

      const projectsData = projects ?? [];

      if (projectsData.length > 0) {
        const companyIds = Array.from(new Set(projectsData.map((p: any) => p.company_id).filter(Boolean)));
        if (companyIds.length > 0) {
          try {
            const serviceClient = createServiceSupabaseClient();
            const { data: companies, error: cError } = await serviceClient
              .from("companies")
              .select("id, name")
              .in("id", companyIds);
            
            if (!cError && companies) {
              const companyMap = new Map(companies.map((c: any) => [c.id, c.name]));
              projectsData.forEach((p: any) => {
                if (p.company_id && companyMap.has(p.company_id)) {
                  p.companies = { name: companyMap.get(p.company_id) };
                } else {
                  p.companies = null;
                }
              });
            }
          } catch (cErr) {
            console.error("Error fetching companies in /api/projects:", cErr);
          }
        }
      }

      return res.status(200).json({ ok: true, data: projectsData });
    }

    const requester = await requireRequesterProfile(client, userId);
    if (!isAdminRole(requester.role)) {
      return res.status(403).json({
        ok: false,
        error: { code: "FORBIDDEN", message: "Only admins can modify projects" },
      });
    }

    const serviceClient = createServiceSupabaseClient();

    if (req.method === "POST") {
      const rawName = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      if (!rawName) {
        return res.status(400).json({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Project name is required" },
        });
      }

      const requestedCompanyId = typeof req.body?.company_id === "string" ? req.body.company_id.trim() : "";
      if (requestedCompanyId && !isUuid(requestedCompanyId)) {
        return res.status(400).json({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Invalid company id" },
        });
      }

      const companyIdToUse = requestedCompanyId || requester.company_id || "";
      if (!companyIdToUse) {
        return res.status(400).json({
          ok: false,
          error: { code: "MISSING_COMPANY", message: "Assign a company before creating a project" },
        });
      }

      const { data, error } = await serviceClient
        .from("projects")
        .insert({ name: rawName, company_id: companyIdToUse, is_archived: false })
        .select("id,name,address,is_archived,created_at,updated_at")
        .single();

      if (error) {
        return res.status((error as any).status || 400).json({
          ok: false,
          error: {
            code: "SUPABASE",
            message: error.message,
            meta: { code: (error as any).code, details: (error as any).details },
          },
        });
      }

      // Handle subprojects creation if provided
      const rawSubprojects = req.body?.subprojects;
      const subprojectsList: Array<{ name: string; parent_group?: string }> = [];

      // Default General subproject
      subprojectsList.push({ name: "General" });

      if (Array.isArray(rawSubprojects)) {
        for (const item of rawSubprojects) {
          if (typeof item === 'string' && item.trim() && item.trim().toLowerCase() !== 'general') {
            subprojectsList.push({ name: item.trim() });
          } else if (item && typeof item === 'object' && item.name && String(item.name).trim().toLowerCase() !== 'general') {
            subprojectsList.push({ name: String(item.name).trim(), parent_group: item.parent_group ? String(item.parent_group).trim() : undefined });
          }
        }
      } else if (typeof rawSubprojects === 'string' && rawSubprojects.trim()) {
        const parts = rawSubprojects.split(/[,;\n]+/).map(s => s.trim()).filter(s => s && s.toLowerCase() !== 'general');
        for (const p of parts) {
          subprojectsList.push({ name: p });
        }
      }

      for (const sp of subprojectsList) {
        try {
          await serviceClient.from('project_subprojects').upsert(
            {
              project_id: data.id,
              company_id: companyIdToUse,
              name: sp.name,
              parent_group: sp.parent_group || null,
              created_by: requester.id,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'project_id,name' }
          );
        } catch (spErr) {
          console.error("Error creating initial subproject:", spErr);
        }
      }

      return res.status(201).json({ ok: true, data });
    }

    if (req.method === "DELETE") {
      const projectId = typeof req.query.id === "string" ? req.query.id.trim() : "";
      if (!projectId || !isUuid(projectId)) {
        return res.status(400).json({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Invalid project id" },
        });
      }

      const { data, error } = await serviceClient
        .from("projects")
        .update({ is_archived: true })
        .eq("id", projectId)
        .select("id,name,address,is_archived,created_at,updated_at")
        .single();

      if (error) {
        return res.status((error as any).status || 400).json({
          ok: false,
          error: {
            code: "SUPABASE",
            message: error.message,
            meta: { code: (error as any).code, details: (error as any).details },
          },
        });
      }

      return res.status(200).json({ ok: true, data });
    }

    if (req.method === "PATCH") {
      const projectId = typeof req.body?.id === "string" ? req.body.id.trim() : "";
      if (!projectId || !isUuid(projectId)) {
        return res.status(400).json({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Invalid project id" },
        });
      }

      const updates: Record<string, any> = {};
      if (typeof req.body?.name === "string" && req.body.name.trim()) {
        updates.name = req.body.name.trim();
      }
      if (typeof req.body?.company_id === "string") {
        const cid = req.body.company_id.trim();
        if (cid && !isUuid(cid)) {
          return res.status(400).json({
            ok: false,
            error: { code: "BAD_REQUEST", message: "Invalid company_id" },
          });
        }
        updates.company_id = cid || null;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({
          ok: false,
          error: { code: "BAD_REQUEST", message: "No fields to update" },
        });
      }

      const { data, error } = await serviceClient
        .from("projects")
        .update(updates)
        .eq("id", projectId)
        .select("id,name,address,is_archived,created_at,updated_at,company_id")
        .single();
      if (error) {
        return res.status((error as any).status || 400).json({
          ok: false,
          error: {
            code: "SUPABASE",
            message: error.message,
            meta: { code: (error as any).code, details: (error as any).details },
          },
        });
      }
      return res.status(200).json({ ok: true, data });
    }

    res.setHeader("Allow", "GET, POST, DELETE, PATCH");
    return res.status(405).json({
      ok: false,
      error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
    });
  } catch (err) {
    if (isAuthRequiredError(err)) {
      return res.status(401).json({
        ok: false,
        error: { code: "AUTH_INVALID", message: "Missing Bearer token" },
      });
    }

    console.error("Error in /api/projects", err);
    return res.status(500).json({
      ok: false,
      error: {
        code: "SERVER_ERROR",
        message: err instanceof Error ? err.message : "Internal server error",
      },
    });
  }
}
