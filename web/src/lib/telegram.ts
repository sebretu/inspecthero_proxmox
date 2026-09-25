const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

export async function sendTelegramMessage(text: string, replyMarkup?: any) {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
    console.warn("[telegram] Missing token or admin chat id");
    return null;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text,
        parse_mode: "HTML",
        reply_markup: replyMarkup,
      }),
    });
    return await res.json();
  } catch (err) {
    console.error("[telegram] send failed:", err);
    return null;
  }
}

export async function editTelegramMessage(chatId: string | number, messageId: number, text: string) {
  if (!BOT_TOKEN) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "HTML",
      }),
    });
    return await res.json();
  } catch (err) {
    console.error("[telegram] edit failed:", err);
    return null;
  }
}

export async function sendApprovalRequest(cableId: string, cableName: string, projectName: string, userName: string) {
  const text = `🔌 <b>Nowy kabel do zatwierdzenia</b>\n\n` +
    `📦 <b>Kabel:</b> ${cableName}\n` +
    `🏢 <b>Projekt:</b> ${projectName}\n` +
    `👤 <b>Zgłosił:</b> ${userName}\n\n` +
    `Kliknij poniżej, aby zatwierdzić wykonanie:`;

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: "✅ Zatwierdź", callback_data: `approve:${cableId}` },
        { text: "❌ Odrzuć", callback_data: `reject:${cableId}` }
      ]
    ]
  };

  return await sendTelegramMessage(text, replyMarkup);
}

export async function sendStromkreisApprovalRequest(markerId: string, subCable: string, projectName: string, planName: string, userName: string) {
  const text = `🔌 <b>Wykonanie kabla w Stromkreise</b>\n\n` +
    `📦 <b>Kabel:</b> ${subCable}\n` +
    `🏢 <b>Projekt:</b> ${projectName}\n` +
    `📄 <b>Plan:</b> ${planName}\n` +
    `👤 <b>Zgłosił:</b> ${userName}\n\n` +
    `Kliknij poniżej, aby zatwierdzić wykonanie:`;

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: "✅ Zatwierdź", callback_data: `sk_approve:${markerId}:${subCable}` },
        { text: "❌ Odrzuć", callback_data: `sk_reject:${markerId}:${subCable}` }
      ]
    ]
  };

  return await sendTelegramMessage(text, replyMarkup);
}

export async function sendBmaCableApprovalRequest(connectionId: string, cableName: string, projectName: string, planName: string, userName: string) {
  const text = `🔌 <b>Wykonanie kabla na planie</b>\n\n` +
    `📦 <b>Kabel:</b> ${cableName}\n` +
    `🏢 <b>Projekt:</b> ${projectName}\n` +
    `📄 <b>Plan:</b> ${planName}\n` +
    `👤 <b>Zgłosił:</b> ${userName}\n\n` +
    `Kliknij poniżej, aby zatwierdzić wykonanie:`;

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: "✅ Zatwierdź", callback_data: `bma_cable_approve:${connectionId}` },
        { text: "❌ Odrzuć", callback_data: `bma_cable_reject:${connectionId}` }
      ]
    ]
  };

  return await sendTelegramMessage(text, replyMarkup);
}
