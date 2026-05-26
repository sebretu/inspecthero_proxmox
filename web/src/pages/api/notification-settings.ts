import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

type ApiOk = { ok: true; data: any };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

type NotificationSettings = {
  notify_on_create: boolean;
  notify_on_status: boolean;
  notify_on_assign: boolean;
};

const DEFAULT_SETTINGS: NotificationSettings = {
  notify_on_create: true,
  notify_on_status: true,
  notify_on_assign: true,
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  let supabase: any;
  let userId: string | null = null;

  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
  } catch (e: any) {
    return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing Bearer token" } });
  }

  if (!userId) {
    return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing user id" } });
  }

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("profiles")
      .select("notification_settings")
      .eq("id", userId)
      .single();

    if (error) {
      return res.status((error as any).status || 400).json({
        ok: false,
        error: { code: "SUPABASE", message: error.message, meta: { code: (error as any).code, details: (error as any).details } },
      });
    }

    const settings = (data as any)?.notification_settings || DEFAULT_SETTINGS;
    return res.status(200).json({ ok: true, data: settings });
  }

  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const next: NotificationSettings = {
      notify_on_create: !!body?.notify_on_create,
      notify_on_status: !!body?.notify_on_status,
      notify_on_assign: !!body?.notify_on_assign,
    };

    const { data, error } = await supabase
      .from("profiles")
      .update({ notification_settings: next })
      .eq("id", userId)
      .select("notification_settings")
      .single();

    if (error) {
      return res.status((error as any).status || 400).json({
        ok: false,
        error: { code: "SUPABASE", message: error.message, meta: { code: (error as any).code, details: (error as any).details } },
      });
    }

    return res.status(200).json({ ok: true, data: (data as any)?.notification_settings || next });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or POST" } });
}
