import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import crypto from "crypto";
import ccxt from "ccxt";

// In-memory store for settings and logs
let appSettings = {
  mexcApiKey: "",
  mexcApiSecret: "",
  telegramTargetChannel: "durov", // E.g., durov
  tgApiId: "",
  tgApiHash: "",
  tgSessionString: "",
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
  isLiveTradingEnabled: false,
};

// Global error handler to prevent crashes from unhandled promise rejections (like GramJS async throws)
process.on('unhandledRejection', (reason: any, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  if (reason && reason.errorMessage === 'AUTH_KEY_UNREGISTERED') {
      addLog('❌ FATAL ERROR: Telegram Session String is INVALID or REVOKED. Please generate a new one and update settings.');
      appSettings.isRunning = false;
  }
});

const systemLogs: string[] = [
  `[${new Date().toISOString()}] System initialized.`
];

function addLog(msg: string) {
  const timestamp = new Date().toISOString();
  systemLogs.unshift(`[${timestamp}] ${msg}`);
  if (systemLogs.length > 100) systemLogs.pop();
  console.log(`[LOG] ${msg}`);
}

let tgClient: TelegramClient | null = null;

async function startTgClient() {
  if (!appSettings.tgApiId || !appSettings.tgApiHash || !appSettings.tgSessionString) {
    addLog("ERROR: Telegram API ID, Hash, or Session String missing. Cannot start fast listener.");
    appSettings.isRunning = false;
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

    await tgClient.connect();
    addLog("✅ Connected to Telegram MTProto instantly.");

    tgClient.addEventHandler(async (event: any) => {
      const message = event.message;
      let text = message.message || "";
      if (!text) return;
      text = text.toLowerCase();

      addLog(`⚡ Instant Message Detected: "${text.substring(0, 50)}..."`);
      
      const matchedKeyword = appSettings.keywords.find(keyword => text.includes(keyword.toLowerCase()));
      if (matchedKeyword) {
         addLog(`🟢 KEYWORD MATCH DETECTED OVER SOCKET! Triggering Trading Logic. (Matched phrase: "${matchedKeyword}")`);
         executeMexcTrade();
         
         // Disable to avoid double
         appSettings.isRunning = false;
         await stopTgClient();
         addLog("Bot stopped and disconnected to prevent duplicate executions.");
      }

    }, new NewMessage({ chats: [appSettings.telegramTargetChannel] }));

    addLog(`Ear listening on socket for: ${appSettings.telegramTargetChannel} with ~0ms delay.`);
  } catch (err: any) {
    addLog(`Telegram Client Error: ${err.message}`);
    appSettings.isRunning = false;
  }
}

async function stopTgClient() {
  if (tgClient) {
    await tgClient.disconnect();
    tgClient = null;
    addLog("Telegram real-time listener stopped.");
  }
}

// Helper to interact with MEXC Futures API v1 through CCXT
async function executeMexcTrade() {
  if (!appSettings.mexcApiKey || !appSettings.mexcApiSecret) {
    addLog("ERROR: MEXC API keys not configured.");
    return;
  }

  try {
    const exchange = new ccxt.mexc({
      apiKey: appSettings.mexcApiKey,
      secret: appSettings.mexcApiSecret,
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
    
    const leverage = parseInt(appSettings.leverage) || 5;
    const isLong = appSettings.positionSide?.toLowerCase() !== 'short';
    const side = isLong ? 'buy' : 'sell';

    const marginModeString = appSettings.marginMode || 'cross';
    const openType = marginModeString === 'isolated' ? 1 : 2;
    
    addLog(`Sending Market ${side.toUpperCase()} on ${symbol} at ${leverage}x Lev. Margin risk (USDT): ${appSettings.positionSizeQuote} Mode: ${marginModeString}`);
    
    if (!appSettings.isLiveTradingEnabled) {
      addLog(`[SIMULATION MODE] Order request NOT sent to MEXC (Safe Mode is ON).`);
      setTimeout(() => {
        let tpMsg = appSettings.enableTakeProfit ? `+${appSettings.takeProfitPrc}%` : "OFF";
        let slMsg = appSettings.enableStopLoss ? `-${appSettings.stopLossPrc}%` : "OFF";
        addLog(`[SIMULATION] ORDER FILLED: ${symbol} ${side.toUpperCase()}. Placed TP ${tpMsg} / SL ${slMsg} `);
      }, 1000);
      return;
    }

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
    const marginRisk = parseFloat(appSettings.positionSizeQuote);
    const notionalUsdt = marginRisk * leverage;
    
    // Amount in base currency
    const amount = notionalUsdt / price;
    const formattedAmount = exchange.amountToPrecision(symbol, amount);
    
    addLog(`Calculated quantity: ${formattedAmount} (Notional: ~${notionalUsdt} USDT) at price ${price}`);

    // Execute Main Market Order
    const order = await exchange.createMarketOrder(symbol, side, parseFloat(formattedAmount), undefined, {
      marginMode: marginModeString,
      leverage: leverage
    });
    addLog(`✅ LIVE Trade Executed: ${order.id} | Status: ${order.status}`);

    // TP / SL setup using Trigger Orders (Plan Orders)
    const tpDist = price * (parseFloat(appSettings.takeProfitPrc) / 100);
    const slDist = price * (parseFloat(appSettings.stopLossPrc) / 100);
    const tpPriceStr = exchange.priceToPrecision(symbol, isLong ? price + tpDist : price - tpDist);
    const slPriceStr = exchange.priceToPrecision(symbol, isLong ? price - slDist : price + slDist);
    const closeSide = isLong ? 'sell' : 'buy';
    
    // Take Profit Trigger
    if (appSettings.enableTakeProfit && tpDist > 0) {
      try {
        const tpOrder = await exchange.createOrder(symbol, 'market', closeSide, parseFloat(formattedAmount), undefined, {
          triggerPrice: tpPriceStr,
          triggerType: isLong ? 1 : 2, // 1: >= triggerPrice, 2: <= triggerPrice
          reduceOnly: true,
          orderType: 5, // 5 for Market order when triggered
          marginMode: marginModeString,
          leverage: leverage
        });
        addLog(`✅ Take Profit Plan Order Set at ${tpPriceStr}`);
      } catch (e: any) {
        addLog(`❌ Failed to set Take Profit: ${e.message}`);
      }
    }
    
    // Stop Loss Trigger
    if (appSettings.enableStopLoss && slDist > 0) {
      try {
        const slOrder = await exchange.createOrder(symbol, 'market', closeSide, parseFloat(formattedAmount), undefined, {
          triggerPrice: slPriceStr,
          triggerType: isLong ? 2 : 1, // 2: <= triggerPrice, 1: >= triggerPrice
          reduceOnly: true,
          orderType: 5, // 5 for Market order when triggered
          marginMode: marginModeString,
          leverage: leverage
        });
        addLog(`✅ Stop Loss Plan Order Set at ${slPriceStr}`);
      } catch (e: any) {
        addLog(`❌ Failed to set Stop Loss: ${e.message}`);
      }
    }

  } catch (error: any) {
    addLog(`API ERROR in executeTrade: ${error.message || error}`);
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
    addLog(`Settings updated. Bot is ${appSettings.isRunning ? 'Active' : 'Offline'}`);
    res.json({ success: true, settings: appSettings });
  });

  app.get("/api/logs", (req, res) => {
    res.json(systemLogs);
  });

  app.post("/api/toggle", async (req, res) => {
    appSettings.isRunning = !appSettings.isRunning;
    
    if (appSettings.isRunning) {
        addLog(`Bot status toggled to: Active. Starting fast socket listener...`);
        await startTgClient();
    } else {
        addLog(`Bot status toggled to: Offline. Stopping socket listener...`);
        await stopTgClient();
    }
    
    res.json({ isRunning: appSettings.isRunning });
  });

  // Manual trigger for testing
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
  });
}

startServer();
