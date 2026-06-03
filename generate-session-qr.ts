import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import input from "input";
import qrcode from "qrcode-terminal";

(async () => {
  console.log("=== Telegram Session Generator (QR/Link method) ===");
  console.log("Этот метод авторизации гораздо надежнее для новых аккаунтов или номеров +380 / +7.");
  
  const apiIdStr = await input.text("Enter your API_ID (from my.telegram.org): ");
  const apiHash = await input.text("Enter your API_HASH: ");
  
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

  await client.connect();

  console.log("\n🔄 Генерируем ссылку для входа...\n");

  try {
    await client.signInUserWithQrCode(
      { apiId, apiHash },
      {
        onError: (err) => {
          console.log("Ошибка обновления QR:", err.message);
          return false;
        },
        qrCode: async (code) => {
          // code.token - Buffer, преобразуем в base64url
          const tokenBase64Url = code.token.toString("base64").replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
          const loginLink = `tg://login?token=${tokenBase64Url}`;
          
          console.log("======================================================");
          console.log("✅ QR-код для входа сгенерирован!");
          console.log("\nИНСТРУКЦИЯ ПО ВХОДУ ЧЕРЕЗ QR КОД:");
          console.log("1. Откройте приложение Telegram на вашем телефоне.");
          console.log("2. Перейдите в Настройки (Settings) -> Устройства (Devices).");
          console.log("3. Нажмите 'Привязать устройство' (Link Desktop Device).");
          console.log("4. Наведите камеру телефона на этот QR-код на экране:");
          console.log("======================================================\n");
          
          qrcode.generate(loginLink, { small: true });

          console.log("\nЕсли QR-код не сканируется, вы можете использовать ссылку (отправьте её себе в 'Избранное' с другого устройства и нажмите на нее):");
          console.log(`\x1b[36m${loginLink}\x1b[0m\n`);
          console.log("Ожидаем вашего подтверждения (скрипт не нужно перезапускать)...");
        },
        password: async (hint) => {
          console.log(`\n🔒 На аккаунте установлена двухфакторная аутентификация (2FA).${hint ? ` Подсказка: ${hint}` : ''}`);
          return await input.text("Введите ваш облачный пароль (2FA): ");
        },
      }
    );

    console.log("\n✅ Вы успешно вошли!");
    console.log("Your Session String:");
    console.log(client.session.save());
    console.log("\n⚠️ PASTE THE STRING INTO THE WEB UI. DO NOT SHARE IT WITH ANYONE.");

  } catch (error: any) {
    console.log("Ошибка входа:", error.message);
  }

  try {
    await client.disconnect();
  } catch (e) {
    // Ignore timeout error on disconnect
  }
  process.exit(0);
})();
