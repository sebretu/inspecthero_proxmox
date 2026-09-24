
import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile, isAdminRole } from "@/lib/requesterProfile";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ ok: false, error: "Not found" });
  }

  let supabaseServer: any;
  let userId: string | null = null;
  try {
    ({ client: supabaseServer, userId } = createServerSupabaseClient(req));
  } catch {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    const requester = await requireRequesterProfile(supabaseServer, userId);
    if (!isAdminRole(requester.role)) {
      return res.status(403).json({ ok: false, error: "Forbidden: Admins only" });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

    return res.status(200).json({
      token_present: !!token,
      token_start: token ? token.substring(0, 5) : null,
      chat_id_present: !!chatId,
      chat_id: chatId,
      env_keys: Object.keys(process.env).filter(k => k.includes("TELEGRAM"))
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
