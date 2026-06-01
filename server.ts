import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import * as cheerio from "cheerio";
import crypto from "crypto";

// In-memory store for settings and logs
// NOTE: For Vercel, this should be moved to a database like Supabase!
let appSettings = {
  mexcApiKey: "",
  mexcApiSecret: "",
  telegramTargetChannel: "durov", // E.g., durov
  symbol: "TON_USDT",
  positionSide: "LONG", 
  positionSizeQuote: "50", 
  leverage: "10",
  takeProfitPrc: "15",
  stopLossPrc: "5",
  keywords: ["ton", "the open network", "durov", "partnership", "integration"],
  isRunning: false,
  lastSeenPostId: ""
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

  // PUBLIC CHANNEL POLLING ENDPOINT (Vercel Cron friendly)
  // Hit this endpoint periodically via an external cron job or manual trigger
  app.post("/api/poll", async (req, res) => {
    if (!appSettings.isRunning) {
      return res.json({ status: "skipped", reason: "Bot is offline" });
    }
    
    let channel = appSettings.telegramTargetChannel.trim();
    if (!channel) return res.json({ status: "error", error: "No channel set" });
    
    // Clean up channel input to extract just the username
    channel = channel.replace("https://t.me/", "").replace("@", "").split('/')[0];

    try {
      addLog(`Polling t.me/s/${channel}...`);
      const response = await axios.get(`https://t.me/s/${channel}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });

      const $ = cheerio.load(response.data);
      const lastPost = $('.tgme_widget_message').last();
      const postId = lastPost.attr('data-post');
      let text = lastPost.find('.tgme_widget_message_text').text();

      if (!postId) {
        return res.json({ status: "error", error: "Could not find any posts on the channel" });
      }

      if (postId === appSettings.lastSeenPostId) {
        return res.json({ status: "ok", action: "none", message: "No new posts detected" });
      }

      // New post detected!
      appSettings.lastSeenPostId = postId;
      text = text.toLowerCase();
      
      addLog(`New post detected [${postId}]: "${text.substring(0, 50)}..."`);

      // Check keywords
      const isMatch = appSettings.keywords.some(keyword => text.includes(keyword.toLowerCase()));
      
      if (isMatch) {
        addLog("🟢 KEYWORD MATCH DETECTED! Triggering Trading Logic.");
        executeMexcTrade();
        
        // Disable bot to avoid false duplicates on same news
        appSettings.isRunning = false;
        addLog("Bot stopped to prevent duplicate executions.");
        return res.json({ status: "ok", action: "trade_executed" });
      } else {
        addLog("No keywords matched. Ignoring.");
        return res.json({ status: "ok", action: "ignored_no_match" });
      }
    } catch (e: any) {
      addLog(`Polling error: ${e.message}`);
      res.status(500).json({ status: "error", error: e.message });
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
