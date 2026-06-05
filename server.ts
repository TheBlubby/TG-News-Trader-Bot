import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import crypto from "crypto";
import ccxt from "ccxt";
import fs from "fs";

const SETTINGS_FILE = path.join(process.cwd(), "settings.json");

// Default settings structure
const defaultSettings = {
  mexcApiKey: "",
  mexcApiSecret: "",
  telegramTargetChannel: "durov", // E.g., durov
  tgApiId: "",
  tgApiHash: "",
  tgSessionString: "",
  telegramBotToken: "",
  telegramChatId: "",
  symbol: "TON_USDT",
  positionSide: "LONG", 
  positionSizeQuote: "50", 
  leverage: "10",
  marginMode: "cross",
  enableTakeProfit: true,
  takeProfitPrc: "15",
  enableStopLoss: true,
  stopLossPrc: "5",
  keywords: ["ton", "the open network", "durov", "partnership", "integration"],
  isRunning: false,
  mexcAccounts: [
    {
      id: "default-account",
      name: "Main Account",
      apiKey: "",
      apiSecret: "",
      useGlobalStrategy: true,
      positionSizeQuote: "50", 
      leverage: "10",
      marginMode: "cross",
      enableTakeProfit: true,
      takeProfitPrc: "15",
      enableStopLoss: true,
      stopLossPrc: "5",
    }
  ]
};

// In-memory store for settings and logs
let appSettings = { ...defaultSettings };

// Load settings from file if exists
try {
  if (fs.existsSync(SETTINGS_FILE)) {
    const fileData = fs.readFileSync(SETTINGS_FILE, "utf-8");
    const loadedSettings = JSON.parse(fileData);
    appSettings = { ...defaultSettings, ...loadedSettings };
  }
} catch (e) {
  console.error("Failed to load settings file:", e);
}

function saveSettings() {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(appSettings, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to save settings file:", e);
  }
}

// Global error handler to prevent crashes from unhandled promise rejections (like GramJS async throws)
process.on('unhandledRejection', (reason: any, promise) => {
  const msg = reason?.message || reason?.errorMessage || String(reason);
  if (msg.includes('AUTH_KEY_UNREGISTERED')) {
      addLog('❌ FATAL ERROR: Telegram Session String is INVALID or REVOKED. Please generate a new one and update settings.');
      appSettings.isRunning = false;
      saveSettings();
  } else if (msg.includes('Cannot send requests while disconnected') || msg.includes('TIMEOUT')) {
      // Ignore background GramJS disconnection errors
      console.log(`[Background Network Error]: ${msg}`);
  } else {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  }
});

const systemLogs: string[] = [
  `[${new Date().toISOString()}] System initialized.`
];

async function sendTelegramNotification(message: string, parseMode: string = "") {
  if (!appSettings.telegramBotToken || !appSettings.telegramChatId) return;
  try {
    const url = `https://api.telegram.org/bot${appSettings.telegramBotToken}/sendMessage`;
    const chatIds = appSettings.telegramChatId.split(',').map(id => id.trim()).filter(id => id);
    
    for (const chatId of chatIds) {
      const payload: any = {
        chat_id: chatId,
        text: message
      };
      if (parseMode) {
        payload.parse_mode = parseMode;
      }
      
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        console.error(`Telegram API Error for chat ${chatId}:`, data);
        addLog(`❌ Telegram Bot Error for ${chatId}: ${data.description || response.statusText}`);
      }
    }
  } catch (error: any) {
    console.error("Telegram notification error:", error);
    addLog(`❌ Telegram Network Error: ${error.message}`);
  }
}

function addLog(msg: string, notify: boolean = false) {
  const timestamp = new Date().toISOString();
  systemLogs.unshift(`[${timestamp}] ${msg}`);
  if (systemLogs.length > 100) systemLogs.pop();
  console.log(`[LOG] ${msg}`);
  if (notify) sendTelegramNotification(`[LOG] ${msg}`);
}

let tgClient: TelegramClient | null = null;

async function startTgClient() {
  if (!appSettings.tgApiId || !appSettings.tgApiHash || !appSettings.tgSessionString) {
    addLog("ERROR: Telegram API ID, Hash, or Session String missing. Cannot start fast listener.");
    appSettings.isRunning = false;
    saveSettings();
    return;
  }

  try {
    if (tgClient) {
      await tgClient.disconnect();
    }

    const stringSession = new StringSession(appSettings.tgSessionString);
    tgClient = new TelegramClient(stringSession, parseInt(appSettings.tgApiId), appSettings.tgApiHash, {
      connectionRetries: 5,
      useWSS: true,
      deviceModel: "Desktop",
      systemVersion: "Windows 10",
      appVersion: "1.0.0",
      systemLangCode: "en",
    });

    const tgPromise = tgClient.connect();
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Telegram connection timed out (bad session/network)")), 15000));
    
    await Promise.race([tgPromise, timeoutPromise]);
    addLog("✅ Connected to Telegram MTProto instantly.");

    tgClient.addEventHandler(async (event: any) => {
      const receiveTimeMs = Date.now();
      const message = event.message;
      let text = message.message || "";
      if (!text) return;
      text = text.toLowerCase();

      addLog(`⚡ Instant Message Detected: "${text.substring(0, 50)}..."`);
      
      const matchedKeyword = appSettings.keywords.find(keyword => text.includes(keyword.toLowerCase()));
      if (matchedKeyword) {
         addLog(`🟢 KEYWORD MATCH DETECTED OVER SOCKET! Triggering Trading Logic. (Matched phrase: "${matchedKeyword}")`, false);
         executeMexcTrade({ matchedKeyword, messageTimestampMs: receiveTimeMs });
         
         // Disable to avoid double
         appSettings.isRunning = false;
         saveSettings();
         await stopTgClient();
         addLog("Bot stopped and disconnected to prevent duplicate executions.");
      }

    }, new NewMessage({ chats: [appSettings.telegramTargetChannel] }));

    addLog(`Ear listening on socket for: ${appSettings.telegramTargetChannel} with ~0ms delay.`);
  } catch (err: any) {
    addLog(`Telegram Client Error: ${err.message}`);
    appSettings.isRunning = false;
    saveSettings();
  }
}

async function stopTgClient() {
  if (tgClient) {
    try {
      await tgClient.disconnect();
    } catch (err: any) {
      console.log(`Telegram Client disconnect error: ${err.message}`);
    }
    tgClient = null;
    addLog("Telegram real-time listener stopped.");
  }
}

// Helper to interact with MEXC Futures API v1 through CCXT
async function executeTradeForAccount(account: any, eventDetails?: { matchedKeyword: string, messageTimestampMs: number }) {
  if (!account.apiKey || !account.apiSecret) {
    addLog(`ERROR: MEXC API keys not configured for account ${account.name}.`);
    return;
  }

  try {
    const exchange = new ccxt.mexc({
      apiKey: account.apiKey,
      secret: account.apiSecret,
      options: {
        defaultType: 'swap',
      },
      enableRateLimit: false, // We want instant execution
    });

    // Formatting symbol for CCXT e.g., TON_USDT -> TON/USDT:USDT
    const baseSymbol = appSettings.symbol.replace('_', '/');
    let symbol = baseSymbol.includes(':') ? baseSymbol : `${baseSymbol}:USDT`;
    
    // Handle symbol translations properly
    await exchange.loadMarkets();

    // Verify if symbol exists in ccxt markets, or try to find it
    if (!exchange.markets[symbol]) {
      const parts = symbol.split('/');
      if (parts.length === 2 && exchange.markets[`${parts[0]}COIN/${parts[1]}`]) {
        symbol = `${parts[0]}COIN/${parts[1]}`;
      } else {
        // Fallback: look for a market that is active and perp that matches the base
        const base = parts[0];
        const possible = Object.keys(exchange.markets).find(m => m.startsWith(base) && m.endsWith(':USDT'));
        if (possible) {
          addLog(`Symbol ${symbol} not found, falling back to ${possible}`);
          symbol = possible;
        } else {
          throw new Error(`Symbol ${symbol} not found in MEXC markets.`);
        }
      }
    }
    
    // Use account specific settings if useGlobalStrategy is false
    const leverageSetting = account.useGlobalStrategy ? appSettings.leverage : account.leverage;
    const marginModeSetting = account.useGlobalStrategy ? appSettings.marginMode : account.marginMode;
    const marginRiskSetting = account.useGlobalStrategy ? appSettings.positionSizeQuote : account.positionSizeQuote;
    const enableTpSetting = account.useGlobalStrategy ? appSettings.enableTakeProfit : account.enableTakeProfit;
    const tpPrcSetting = account.useGlobalStrategy ? appSettings.takeProfitPrc : account.takeProfitPrc;
    const enableSlSetting = account.useGlobalStrategy ? appSettings.enableStopLoss : account.enableStopLoss;
    const slPrcSetting = account.useGlobalStrategy ? appSettings.stopLossPrc : account.stopLossPrc;

    const leverage = parseInt(leverageSetting) || 5;
    const isLong = appSettings.positionSide?.toLowerCase() !== 'short';
    const side = isLong ? 'buy' : 'sell';

    const marginModeString = marginModeSetting || 'cross';
    const openType = marginModeString === 'isolated' ? 1 : 2;
    
    addLog(`[${account.name}] Sending Market ${side.toUpperCase()} on ${symbol} at ${leverage}x Lev. Margin risk (USDT): ${marginRiskSetting} Mode: ${marginModeString}`);

    // Attempt to set leverage first
    try {
      await exchange.setLeverage(leverage, symbol, {
        openType: openType, 
        positionType: isLong ? 1 : 2 // 1 for long, 2 for short
      });
      addLog(`✅ Leverage set to ${leverage}x`);
    } catch (e: any) {
      addLog(`⚠️ Leverage setup (can be ignored if already set): ${e.message}`);
    }

    // To send the right amount, calculate quantity in base token based on current price
    // We treat positionSizeQuote as the Margin USDT to risk.
    const ticker = await exchange.fetchTicker(symbol);
    const price = ticker.last;
    if (!price) {
      throw new Error("Could not fetch current price for " + symbol);
    }
    
    // Notional value = Margin * Leverage
    const marginRisk = parseFloat(marginRiskSetting);
    const notionalUsdt = marginRisk * leverage;
    
    // Amount in base currency
    const amount = notionalUsdt / price;
    const formattedAmount = exchange.amountToPrecision(symbol, amount);
    
    addLog(`[${account.name}] Calculated quantity: ${formattedAmount} (Notional: ~${notionalUsdt} USDT) at price ${price}`);

    // Execute Main Market Order
    const order = await exchange.createMarketOrder(symbol, side, parseFloat(formattedAmount), undefined, {
      marginMode: marginModeString,
      leverage: leverage
    });
    
    addLog(`✅ [${account.name}] LIVE Trade Executed: ${order.id} | Status: ${order.status}`, false);

    // TP / SL setup using Trigger Orders (Plan Orders)
    const tpDist = price * (parseFloat(tpPrcSetting) / 100);
    const slDist = price * (parseFloat(slPrcSetting) / 100);
    const tpPriceStr = exchange.priceToPrecision(symbol, isLong ? price + tpDist : price - tpDist);
    const slPriceStr = exchange.priceToPrecision(symbol, isLong ? price - slDist : price + slDist);
    const closeSide = isLong ? 'sell' : 'buy';

    if (eventDetails) {
      const tradeTimeMs = Date.now();
      const delaySec = ((tradeTimeMs - eventDetails.messageTimestampMs) / 1000).toFixed(3);
      
      let msg = `🚀 <b>Сделка открыта!</b>\n\n` +
                  `🔹 Аккаунт: ${account.name}\n` +
                  `🔑 Триггер: "${eventDetails.matchedKeyword}"\n` +
                  `💰 Монета: ${symbol}\n` +
                  `📈 Направление: ${isLong ? 'LONG 🟢' : 'SHORT 🔴'}\n` +
                  `⚙️ Маржа: ${marginModeSetting.toUpperCase()}\n` +
                  `⚖️ Плечо: ${leverage}x\n` +
                  `💵 Риск: ${marginRiskSetting} USDT\n` +
                  `💲 Цена входа: ${price}\n` +
                  `📦 Размер: ${formattedAmount} монет (~${notionalUsdt.toFixed(2)} USDT)\n`;

      if (enableTpSetting && tpDist > 0) {
        msg += `🎯 Тейк-профит: ${tpPriceStr} (+${tpPrcSetting}%)\n`;
      } else {
        msg += `🎯 Тейк-профит: ВЫКЛ\n`;
      }
      if (enableSlSetting && slDist > 0) {
        msg += `🛑 Стоп-лосс: ${slPriceStr} (-${slPrcSetting}%)\n`;
      } else {
        msg += `🛑 Стоп-лосс: ВЫКЛ\n`;
      }

      msg += `⏱ Задержка: ${delaySec} сек`;
                  
      sendTelegramNotification(msg, 'HTML');
    }
    
    // Take Profit Trigger
    if (enableTpSetting && tpDist > 0) {
      try {
        const tpOrder = await exchange.createOrder(symbol, 'market', closeSide, parseFloat(formattedAmount), undefined, {
          triggerPrice: tpPriceStr,
          triggerType: isLong ? 1 : 2, // 1: >= triggerPrice, 2: <= triggerPrice
          reduceOnly: true,
          orderType: 5, // 5 for Market order when triggered
          marginMode: marginModeString,
          leverage: leverage
        });
        addLog(`✅ [${account.name}] Take Profit Plan Order Set at ${tpPriceStr}`);
      } catch (e: any) {
        addLog(`❌ [${account.name}] Failed to set Take Profit: ${e.message}`);
      }
    }
    
    // Stop Loss Trigger
    if (enableSlSetting && slDist > 0) {
      try {
        const slOrder = await exchange.createOrder(symbol, 'market', closeSide, parseFloat(formattedAmount), undefined, {
          triggerPrice: slPriceStr,
          triggerType: isLong ? 2 : 1, // 2: <= triggerPrice, 1: >= triggerPrice
          reduceOnly: true,
          orderType: 5, // 5 for Market order when triggered
          marginMode: marginModeString,
          leverage: leverage
        });
        addLog(`✅ [${account.name}] Stop Loss Plan Order Set at ${slPriceStr}`);
      } catch (e: any) {
        addLog(`❌ [${account.name}] Failed to set Stop Loss: ${e.message}`);
      }
    }

  } catch (error: any) {
    addLog(`API ERROR in executeTrade for [${account.name}]: ${error.message || error}`, true);
  }
}

async function executeMexcTrade(eventDetails?: { matchedKeyword: string, messageTimestampMs: number }) {
  if (!appSettings.mexcAccounts || appSettings.mexcAccounts.length === 0) {
    addLog("ERROR: No MEXC accounts configured.");
    return;
  }

  // Execute for all configured accounts
  for (const account of appSettings.mexcAccounts) {
    executeTradeForAccount(account, eventDetails);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- API Routes ---

  app.get("/api/settings", (req, res) => {
    res.json(appSettings);
  });

  app.post("/api/settings", (req, res) => {
    appSettings = { ...appSettings, ...req.body };
    if (appSettings.telegramBotToken) appSettings.telegramBotToken = appSettings.telegramBotToken.trim();
    if (appSettings.telegramChatId) appSettings.telegramChatId = appSettings.telegramChatId.trim();
    saveSettings();
    addLog(`Settings updated. Bot is ${appSettings.isRunning ? 'Active' : 'Offline'}`);
    res.json({ success: true, settings: appSettings });
  });

  app.get("/api/logs", (req, res) => {
    res.json(systemLogs);
  });

  app.post("/api/toggle", async (req, res) => {
    appSettings.isRunning = !appSettings.isRunning;
    saveSettings();
    
    if (appSettings.isRunning) {
        addLog(`Bot status toggled to: Active. Starting fast socket listener...`);
        startTgClient().catch(e => console.error(e));
    } else {
        addLog(`Bot status toggled to: Offline. Stopping socket listener...`);
        stopTgClient().catch(e => console.error(e));
    }
    
    res.json({ isRunning: appSettings.isRunning });
  });

  // Manual trigger for testing
  app.post("/api/test-notification", async (req, res) => {
    addLog("🔔 Test notification triggered from UI.");
    
    // Send mock formatted message
    let msg = `🚀 <b>Сделка открыта!</b>\n\n` +
                `🔹 Аккаунт: Test Account\n` +
                `🔑 Триггер: "test_keyword"\n` +
                `💰 Монета: TON/USDT\n` +
                `📈 Направление: LONG 🟢\n` +
                `⚙️ Маржа: ISOLATED\n` +
                `⚖️ Плечо: 10x\n` +
                `💵 Риск: 50 USDT\n` +
                `💲 Цена входа: 4.882\n` +
                `📦 Размер: 102.4 монет (~500.00 USDT)\n`;

    msg += `🎯 Тейк-профит: 4.930 (+1%)\n`;
    msg += `🛑 Стоп-лосс: 4.833 (-1%)\n`;
    msg += `⏱ Задержка: 0.134 сек`;
                
    sendTelegramNotification(msg, 'HTML');
    
    res.json({ success: true });
  });

  app.post("/api/test-buy", (req, res) => {
      addLog("Manual test buy triggered from UI.");
      executeMexcTrade();
      res.json({ success: true, message: "Test trade initiated." });
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    if (appSettings.isRunning) {
      addLog(`🟢 Server successfully restarted from previous state. Resuming fast socket listener...`, true);
      startTgClient();
    }
  });
}

startServer();
