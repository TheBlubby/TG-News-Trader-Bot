import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import input from "input";

(async () => {
  console.log("=== Telegram Session Generator ===");
  const apiIdStr = await input.text("Enter your API_ID (from my.telegram.org): ");
  const apiHash = await input.text("Enter your API_HASH (from my.telegram.org): ");
  
  const apiId = parseInt(apiIdStr);
  const stringSession = new StringSession("");

  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
    useWSS: true,
    deviceModel: "Desktop",
    systemVersion: "Windows 10",
    appVersion: "1.0.0",
    systemLangCode: "en",
  });

  console.log("\n⏳ ИНСТРУКЦИЯ (Если код не приходит):");
  console.log("1. Откройте ОФИЦИАЛЬНОЕ мобильное приложение Telegram на ТЕЛЕФОНЕ (не на ПК).");
  console.log("2. Код приходит в системный чат 'Telegram' от зеленой галочки.");
  console.log("3. Проблема для номеров (+380 / +7) - Telegram часто не присылает коды на неофициальные клиенты.");
  console.log("РЕШЕНИЕ: Если код так и не пришел, попробуйте войти с включенным VPN на телефоне и ПК, или подождите пару часов (API может быть 'слишком новым').\n");

  await client.start({
    phoneNumber: async () => await input.text("Please enter your phone number (+1...): "),
    password: async () => await input.text("Please enter your 2FA password (leave blank if none): "),
    phoneCode: async () => await input.text("Please enter the login code you received: "),
    onError: (err) => console.log(err),
  });

  console.log("\n✅ You successfully connected!");
  console.log("Your Session String:");
  console.log(client.session.save());
  console.log("\n⚠️ PASTE THE STRING INTO THE WEB UI. DO NOT SHARE IT WITH ANYONE.");
  
  try {
    await client.disconnect();
  } catch (e) {
    // Ignore timeout error on disconnect
  }
  process.exit(0);
})();
