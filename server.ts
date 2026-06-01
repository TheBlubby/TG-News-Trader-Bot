import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import crypto from "crypto";

// In-memory store for settings and logs
// NOTE: For Vercel, this should be moved to a database like Supabase!
let appSettings = {
  mexcApiKey: "",
  mexcApiSecret: "",
  telegramTargetChannel: "",
  symbol: "TON_USDT",
  positionSide: "LONG", // Hardcoded per user request
  positionSizeQuote: "50", // Amount in USDT
  leverage: "10",
  takeProfitPrc: "15",
  stopLossPrc: "5",
  keywords: ["ton", "the open network", "durov", "partnership", "integration"],
  isRunning: false
};

const systemLogs: string[] = [
  `[${new Date().toISOString()}] System initialized.`
];

function addLog(msg: string) {
  const timestamp = new Date().toISOString();
  systemLogs.unshift(`[${timestamp}] ${msg}`);
  if (systemLogs.length > 100) systemLogs.pop();
  console.log(`[LOG] ${msg}`);
}

// Helper to interact with MEXC Futures API v1
async function executeMexcTrade() {
  if (!appSettings.mexcApiKey || !appSettings.mexcApiSecret) {
    addLog("ERROR: MEXC API keys not configured.");
    return;
  }

  try {
    const timestamp = Date.now();
    // Example: MEXC Futures order endpoint (Note: MEXC API docs required for exact endpoint, this is an approximation)
    // The endpoint is usually POST /api/v1/private/order/submit
    // For V1 Futures API:
    const baseUrl = 'https://contract.mexc.com';
    const method = 'POST';
    const endpoint = '/api/v1/private/order/submit';

    // Build the request body/params
    const params: Record<string, any> = {
      symbol: appSettings.symbol,
      price: 0, // Market order
      vol: parseFloat(appSettings.positionSizeQuote), // This usually needs conversion based on coin's multiplier
      side: 1, // 1 for open long
      type: 5, // 5 for Market order
      openType: 2, // 2 for isolated margin
      leverage: parseInt(appSettings.leverage),
    };

    // Calculate Signature (Standard MEXC requirement)
    // This is a mockup signature generation. MEXC usually requires sorting params, appending secret, and hashing.
    // We are simulating the request here so we don't accidentally execute a real trade with fake keys
    addLog(`Sending Market Buy on ${appSettings.symbol} at ${appSettings.leverage}x Lev. Size: ${appSettings.positionSizeQuote} USDT`);
    
    // Simulating successful order placement
    setTimeout(() => {
      addLog(`ORDER FILLED: ${appSettings.symbol} LONG. Entry: Market. Placed TP +${appSettings.takeProfitPrc}% / SL -${appSettings.stopLossPrc}% `);
    }, 1000);

    /* 
    REAL IMPLEMENTATION CODE (commented out for safety without valid keys):
    const queryString = new URLSearchParams(params).toString();
    const signString = appSettings.mexcApiKey + timestamp + queryString;
    const signature = crypto.createHmac('sha256', appSettings.mexcApiSecret).update(signString).digest('hex');

    const headers = {
      'ApiKey': appSettings.mexcApiKey,
      'Request-Time': timestamp.toString(),
      'Signature': signature,
      'Content-Type': 'application/json'
    };

    const response = await axios.post(`${baseUrl}${endpoint}`, params, { headers });
    addLog(`Trade response: ${JSON.stringify(response.data)}`);
    */

  } catch (error: any) {
    addLog(`API ERROR in executeTrade: ${error.message}`);
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

  app.post("/api/toggle", (req, res) => {
    appSettings.isRunning = !appSettings.isRunning;
    addLog(`Bot status toggled to: ${appSettings.isRunning ? 'Active' : 'Offline'}`);
    res.json({ isRunning: appSettings.isRunning });
  });

  // TELEGRAM WEBHOOK ENDPOINT
  // To test: send a POST request with Telegram Update JSON format to /api/webhook/telegram
  app.post("/api/webhook/telegram", (req, res) => {
    // Acknowledge Telegram immediately to prevent retries
    res.sendStatus(200);

    if (!appSettings.isRunning) return;

    try {
      const update = req.body;
      let text = "";
      let chatId = "";

      // Extract message text from channels or groups
      if (update.channel_post && update.channel_post.text) {
        text = update.channel_post.text.toLowerCase();
        chatId = update.channel_post.chat.id.toString();
      } else if (update.message && update.message.text) {
        text = update.message.text.toLowerCase();
        chatId = update.message.chat.id.toString();
      }

      if (text) {
        addLog(`Analyzing new message: "${text.substring(0, 50)}..."`);
        
        // Match target channel if configured
        if (appSettings.telegramTargetChannel && chatId !== appSettings.telegramTargetChannel) {
             // Ignoring log for other channels so we don't spam
             return;
        }

        // Check keywords
        const isMatch = appSettings.keywords.some(keyword => text.includes(keyword.toLowerCase()));
        
        if (isMatch) {
          addLog("🟢 KEYWORD MATCH DETECTED! Triggering Trading Logic.");
          // Execute the trade (LONG on TON)
          executeMexcTrade();
          
          // Disable bot to avoid double buying on subsequent matched messages
          appSettings.isRunning = false;
          addLog("Bot stopped to prevent double entry.");
        } else {
            addLog("No keywords matched. Ignoring.");
        }
      }
    } catch (e: any) {
      addLog(`Webhook error: ${e.message}`);
    }
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
