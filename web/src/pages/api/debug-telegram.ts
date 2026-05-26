
import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

  res.status(200).json({
    token_present: !!token,
    token_start: token ? token.substring(0, 5) : null,
    chat_id_present: !!chatId,
    chat_id: chatId,
    env_keys: Object.keys(process.env).filter(k => k.includes("TELEGRAM"))
  });
}
