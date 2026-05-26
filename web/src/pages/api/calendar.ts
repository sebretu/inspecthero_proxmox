import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabaseServer";

type ApiOk = { ok: true; data: any };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET" } });
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
        .select("id, role, company_id")
        .eq("id", userId)
        .single();
    if (meError || !me) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Unauthorized" } });
    }

    const isMod = me.role === 'ADMIN' || me.role === 'MODERATOR' || me.role === 'MOD';

    // Authorized check: only MOD/ADMIN for now
    if (!isMod) {
        return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Insufficient permissions" } });
    }

    const yearNum = parseInt(req.query.year as string) || new Date().getFullYear();
    const startDate = `${yearNum}-01-01`;
    const endDate = `${yearNum}-12-31`;

    // Use service client to bypass RLS for authorized MODs, as RLS is currently restrictive
    const db = createServiceSupabaseClient();

    try {
        console.log(`[calendar api] fetching data for year ${yearNum}, company ${me.company_id} by ${me.role} (via service client)`);
        const [
            { data: workers, error: employeesError },
            { data: attendance, error: attendanceError },
            { data: vacations, error: vacationsError },
            { data: holidays, error: holidaysError },
        ] = await Promise.all([
            // Fetch ONLY employees (manual addition only, no internal profiles)
            db.from("employees")
                .select("id, full_name, is_active, photo_url")
                .eq("company_id", me.company_id)
                .eq("is_active", true)
                .then((res: any) => {
                    console.log(`[calendar api] found ${res.data?.length || 0} employees`);
                    return {
                        data: (res.data || []).map((x: any) => ({ ...x, type: 'EMPLOYEE' })),
                        error: res.error
                    };
                }),
            db.from("attendance")
                .select("user_id, employee_id, date, status, start_time, end_time, break_time")
                .gte("date", startDate)
                .lte("date", endDate),
            db.from("vacations")
                .select("user_id, employee_id, start_date, end_date, status")
                .or(`start_date.gte.${startDate},end_date.lte.${endDate}`),
            db.from("public_holidays")
                .select("date, name")
                .gte("date", startDate)
                .lte("date", endDate),
        ]);

        if (employeesError || attendanceError || vacationsError || holidaysError) {
            const firstError = employeesError || attendanceError || vacationsError || holidaysError;
            console.error(`[calendar api] database error:`, firstError);
            return res.status(400).json({ ok: false, error: { code: "SUPABASE", message: firstError?.message } });
        }

        console.log(`[calendar api] success: workers=${workers?.length}, attendance=${attendance?.length}, holidays=${holidays?.length}`);

        return res.status(200).json({
            ok: true,
            data: {
                year: yearNum,
                workers: workers || [],
                attendance: attendance || [],
                vacations: vacations || [],
                holidays: holidays || [],
            },
        });
    } catch (err: any) {
        return res.status(500).json({ ok: false, error: { code: "SERVER_ERROR", message: err.message } });
    }
}
