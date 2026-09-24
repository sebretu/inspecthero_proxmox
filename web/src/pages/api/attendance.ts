import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabaseServer";

type ApiOk = { ok: true; data: any };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
    if (req.method !== "POST" && req.method !== "DELETE") {
        res.setHeader("Allow", ["POST", "DELETE"]);
        return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use POST or DELETE" } });
    }

    let supabase: any;
    let userId: string | null = null;
    try {
        const clientObj = createServerSupabaseClient(req);
        supabase = clientObj.client;
        userId = clientObj.userId;
    } catch (e: any) {
        return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing Bearer token" } });
    }

    const { data: me, error: meError } = await supabase
        .from("profiles")
        .select("id, role, email, company_id")
        .eq("id", userId)
        .single();
    if (meError || !me) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Unauthorized" } });
    }

    const isMod = me.role === 'ADMIN' || me.role === 'MODERATOR' || me.role === 'MOD';

    // Only Admin or Moderator can manage others' attendance
    if (!isMod) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Insufficient permissions" } });
    }

    const db = createServiceSupabaseClient();

    // Tenant Isolation Helper: Verify target user or employee belongs to the requester's company
    const verifyTenantAccess = async (targetUserId?: any, targetEmployeeId?: any) => {
        if (!me.company_id) return true; // Superadmin / system level if no company set

        if (targetUserId) {
            const { data: targetProfile } = await db
                .from("profiles")
                .select("company_id")
                .eq("id", targetUserId)
                .single();
            if (!targetProfile || targetProfile.company_id !== me.company_id) {
                return false;
            }
        }

        if (targetEmployeeId) {
            const { data: targetEmployee } = await db
                .from("employees")
                .select("company_id")
                .eq("id", targetEmployeeId)
                .single();
            if (!targetEmployee || targetEmployee.company_id !== me.company_id) {
                return false;
            }
        }

        return true;
    };

    if (req.method === "DELETE") {
        const { user_id, employee_id, date } = req.query;
        if (!date || (!user_id && !employee_id)) {
            return res.status(400).json({ ok: false, error: { code: "MISSING_FIELDS", message: "date and (user_id OR employee_id) are required" } });
        }

        const isAllowed = await verifyTenantAccess(user_id, employee_id);
        if (!isAllowed) {
            return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Cross-tenant access denied" } });
        }

        const matchObj: any = { date };
        if (user_id) matchObj.user_id = user_id;
        if (employee_id) matchObj.employee_id = employee_id;

        const vacationMatch = { ...(user_id ? { user_id } : { employee_id }) };

        await db.from("attendance").delete().match(matchObj);
        await db.from("vacations").delete().match(vacationMatch).eq("start_date", date).eq("end_date", date);

        return res.status(200).json({ ok: true, data: { deleted: true } });
    }

    const { user_id, employee_id, date, status, start_time, end_time, break_time } = req.body;

    if (!date || !status || (!user_id && !employee_id)) {
        return res.status(400).json({ ok: false, error: { code: "MISSING_FIELDS", message: "date, status and (user_id OR employee_id) are required" } });
    }

    const isAllowed = await verifyTenantAccess(user_id, employee_id);
    if (!isAllowed) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Cross-tenant access denied" } });
    }

    const matchObj: any = { date };
    if (user_id) matchObj.user_id = user_id;
    if (employee_id) matchObj.employee_id = employee_id;

    const vacationMatch = { ...(user_id ? { user_id } : { employee_id }) };

    if (status === 'VACATION') {
        // 1. Delete any record for this day (both attendance and vacation to be clean)
        await db.from("attendance").delete().match(matchObj);
        await db.from("vacations").delete().match(vacationMatch).eq("start_date", date).eq("end_date", date);

        // 2. Insert into vacations
        const { data, error } = await db
            .from("vacations")
            .insert({
                ...vacationMatch,
                company_id: me.company_id || null,
                start_date: date,
                end_date: date,
                status: 'APPROVED',
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            return res.status(400).json({ ok: false, error: { code: "SUPABASE", message: error.message } });
        }
        return res.status(200).json({ ok: true, data });
    } else {
        // PRESENT or ABSENT
        // 1. Delete any existing record for this day
        await db.from("attendance").delete().match(matchObj);
        await db.from("vacations").delete().match(vacationMatch).eq("start_date", date).eq("end_date", date);

        // 2. Insert into attendance
        const { data, error } = await db
            .from("attendance")
            .insert({
                ...matchObj,
                company_id: me.company_id || null,
                status,
                start_time: start_time || null,
                end_time: end_time || null,
                break_time: break_time || 0,
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            return res.status(400).json({ ok: false, error: { code: "SUPABASE", message: error.message } });
        }
        return res.status(200).json({ ok: true, data });
    }
}
