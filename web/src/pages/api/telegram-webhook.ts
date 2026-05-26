import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { editTelegramMessage } from "@/lib/telegram";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body;
  if (!body.callback_query) {
    return res.status(200).send("OK");
  }

  const { id: callbackQueryId, data, message, from } = body.callback_query;
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

  // Only allow admin to perform actions
  if (String(from.id) !== adminChatId) {
    console.warn("[telegram webhook] Unauthorized click from:", from.id);
    return res.status(200).send("Unauthorized");
  }

  const [action, cableId] = data.split(":");
  const supabase = getSupabaseAdminClient();

  try {
    if (action === "approve") {
      const { error } = await supabase
        .from("cables")
        .update({ status: "done" })
        .eq("id", cableId);

      if (error) throw error;

      await editTelegramMessage(
        message.chat.id,
        message.message_id,
        message.text + "\n\n✅ <b>Zatwierdzono pomyślnie!</b>"
      );
    } else if (action === "reject") {
      const { error } = await supabase
        .from("cables")
        .update({ status: "in_progress" })
        .eq("id", cableId);

      if (error) throw error;

      await editTelegramMessage(
        message.chat.id,
        message.message_id,
        message.text + "\n\n❌ <b>Odrzucono.</b> Status przywrócony do 'W trakcie'."
      );
    }

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("[telegram webhook] Error:", err.message);
    return res.status(200).send("Error");
  }
}
