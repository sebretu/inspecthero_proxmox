
require('dotenv').config({ path: '.env.local' });
const fetch = require('node-fetch');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

console.log("Token:", BOT_TOKEN ? "present" : "missing");
console.log("Chat ID:", ADMIN_CHAT_ID ? "present" : "missing");

async function test() {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text: "🔔 Test powiadomienia z serwera!",
        parse_mode: "HTML",
      }),
    });
    const data = await res.json();
    console.log("Response:", data);
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
