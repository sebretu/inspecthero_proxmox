import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { editTelegramMessage } from "@/lib/telegram";
import { generateSymbolCrop } from "@/lib/symbolCropper";


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Validate Telegram webhook secret token if configured
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (webhookSecret) {
    const receivedSecret = req.headers["x-telegram-bot-api-secret-token"];
    if (receivedSecret !== webhookSecret) {
      console.warn("[telegram webhook] Invalid or missing secret token header");
      return res.status(401).json({ error: "Invalid webhook secret" });
    }
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

  const parts = data.split(":");
  const action = parts[0];
  const cableId = parts[1]; // Or markerId for sk_
  const subCable = parts[2]; // Only for sk_

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
    } else if (action === "bma_cable_approve" || action === "bma_cable_reject") {
      const connId = cableId;
      const { data: conn, error: fetchErr } = await supabase
        .from("bma_connections")
        .select("metadata")
        .eq("id", connId)
        .single();

      if (fetchErr || !conn) throw new Error("Cable connection not found");

      const metadata = conn.metadata || {};
      const history = metadata.execution_history || [];
      const now = new Date().toISOString();

      if (action === "bma_cable_approve") {
        metadata.execution_status = "APPROVED";
        metadata.approved_by = "Admin (Telegram)";
        metadata.approved_at = now;
        history.push({ action: "APPROVED", timestamp: now, user: "Admin (Telegram)" });
        metadata.execution_history = history;

        const { error: updErr } = await supabase
          .from("bma_connections")
          .update({ metadata })
          .eq("id", connId);
        if (updErr) throw updErr;

        await editTelegramMessage(
          message.chat.id,
          message.message_id,
          message.text + "\n\n✅ <b>Zatwierdzono wykonanie kabla!</b>"
        );
      } else {
        metadata.execution_status = "REJECTED";
        metadata.rejected_by = "Admin (Telegram)";
        metadata.rejected_at = now;
        history.push({ action: "REJECTED", timestamp: now, user: "Admin (Telegram)" });
        metadata.execution_history = history;

        const { error: updErr } = await supabase
          .from("bma_connections")
          .update({ metadata })
          .eq("id", connId);
        if (updErr) throw updErr;

        await editTelegramMessage(
          message.chat.id,
          message.message_id,
          message.text + "\n\n❌ <b>Odrzucono wykonanie kabla.</b>"
        );
      }
    } else if (action === "sk_approve" || action === "sk_reject") {
      const markerId = cableId;
      const { data: marker, error: fetchErr } = await supabase
        .from("stromkreise")
        .select("metadata")
        .eq("id", markerId)
        .single();
      
      if (fetchErr) throw fetchErr;

      const metadata = marker.metadata || {};
      const executions = metadata.executions || {};
      const ex = executions[subCable];

      if (!ex) {
        throw new Error("Execution not found");
      }

      // Find an admin profile to assign Telegram actions to
      const { data: adminProf } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "ADMIN")
        .limit(1)
        .maybeSingle();
      const adminProfileId = adminProf?.id || null;

      if (action === "sk_approve") {
        ex.status = "APPROVED";
        ex.approved_at = new Date().toISOString();
        ex.approved_by = "Admin (Telegram)";
        ex.history = ex.history || [];
        ex.history.push({
          action: "APPROVED",
          timestamp: ex.approved_at,
          user: ex.approved_by
        });

        const { error: updErr } = await supabase
          .from("stromkreise")
          .update({ metadata })
          .eq("id", markerId);
        if (updErr) throw updErr;

        generateSymbolCrop(markerId).catch(err => {
          console.error("[telegram webhook] Background symbol crop generation failed:", err);
        });


        // Record activity in stromkreis_history
        await supabase.from("stromkreis_history").insert({
          marker_id: markerId,
          action: "APPROVED",
          sub_cable: subCable,
          old_value: { status: "PENDING_APPROVAL" },
          new_value: { status: "APPROVED", user: "Admin (Telegram)" },
          changed_by: adminProfileId
        });

        await editTelegramMessage(
          message.chat.id,
          message.message_id,
          message.text + "\n\n✅ <b>Zatwierdzono wykonanie kabla w Stromkreise!</b>"
        );
      } else {
        // sk_reject
        const originalStatus = ex.status;
        delete executions[subCable]; // Revert completely
        const { error: updErr } = await supabase
          .from("stromkreise")
          .update({ metadata })
          .eq("id", markerId);
        if (updErr) throw updErr;

        // Record activity in stromkreis_history
        await supabase.from("stromkreis_history").insert({
          marker_id: markerId,
          action: "REJECTED",
          sub_cable: subCable,
          old_value: { status: originalStatus },
          new_value: { status: "REJECTED", user: "Admin (Telegram)" },
          changed_by: adminProfileId
        });

        await editTelegramMessage(
          message.chat.id,
          message.message_id,
          message.text + "\n\n❌ <b>Odrzucono wykonanie kabla w Stromkreise.</b>"
        );
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("[telegram webhook] Error:", err.message);
    return res.status(200).send("Error");
  }
}
