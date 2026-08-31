require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const webpush = require("web-push");
const { GoogleGenAI } = require("@google/genai");

const app = express();

// =====================================
// CONFIG
// =====================================
const PORT = process.env.PORT || 3000;
const MODEL = "gemini-2.5-flash";
const DELTA_BASE = "https://api.india.delta.exchange";
const DELTA_CANDLE_API = `${DELTA_BASE}/v2/history/candles`;
const DELTA_TICKER_API = `${DELTA_BASE}/v2/tickers`;
const SYMBOL = "BTCUSD";
const MONITOR_INTERVAL_MS = 60 * 1000; // Check every 60s
const SUBS_FILE = path.join(__dirname, "subscriptions.json");

// =====================================
// MIDDLEWARE
// =====================================
app.use(cors());
app.use(express.json({ limit: "30mb" }));

// =====================================
// GEMINI
// =====================================
if (!process.env.GEMINI_API_KEY) {
  console.error("ERROR: GEMINI_API_KEY is missing.");
  process.exit(1);
}
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// =====================================
// WEB PUSH CONFIGURATION
// =====================================
let pushEnabled = false;
if (
  process.env.VAPID_PUBLIC_KEY &&
  process.env.VAPID_PRIVATE_KEY &&
  process.env.VAPID_EMAIL
) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  pushEnabled = true;
  console.log("WEB PUSH = ENABLED");
} else {
  console.log("WEB PUSH = NOT CONFIGURED YET");
}

function loadSubscriptions() {
  try {
    if (fs.existsSync(SUBS_FILE)) {
      const data = fs.readFileSync(SUBS_FILE, "utf-8");
      return JSON.parse(data) || [];
    }
  } catch (err) {
    console.error("Error reading subscriptions.json:", err.message);
  }
  return [];
}

function saveSubscriptions(subs) {
  try {
    fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving subscriptions.json:", err.message);
  }
}

let subscriptions = loadSubscriptions();
const notificationHistory = [];
const MAX_HISTORY = 50;

// =====================================
// FRONTEND STATIC FILES (ANTI-CACHE)
// =====================================
const publicFolder = path.join(__dirname, "public");
if (fs.existsSync(publicFolder)) {
  app.use(
    express.static(publicFolder, {
      setHeaders: (res) => {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      }
    })
  );
}

// =====================================
// HOME & HEALTH
// =====================================
app.get("/", (req, res) => {
  const indexPath = path.join(publicFolder, "index.html");
  if (fs.existsSync(indexPath)) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    return res.sendFile(indexPath);
  }
  res.send("AI Trading Server Running");
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "AI Trading Server is running",
    strategy: "Top 5 Candlestick Multi-Scanner (15M / 1H Trend)",
    livePrice: "DELTA BTCUSD TICKER",
    notification: pushEnabled ? "ENABLED" : "NOT CONFIGURED",
    activeSubscriptions: subscriptions.length,
    historyCount: notificationHistory.length,
    time: new Date().toISOString()
  });
});

// =====================================
// LIVE BTC PRICE
// =====================================
async function getLiveBTCPrice() {
  const url = `${DELTA_TICKER_API}/${SYMBOL}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ticker API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  if (!data || !data.result) {
    throw new Error("Live BTC ticker unavailable.");
  }

  const ticker = data.result;
  const livePrice = Number(ticker.close);
  const markPrice = Number(ticker.mark_price);
  const spotPrice = Number(ticker.spot_price);

  let price = livePrice;
  if (!Number.isFinite(price) && Number.isFinite(markPrice)) price = markPrice;
  if (!Number.isFinite(price) && Number.isFinite(spotPrice)) price = spotPrice;
  if (!Number.isFinite(price)) throw new Error("Invalid live BTC price.");

  return {
    price,
    markPrice: Number.isFinite(markPrice) ? markPrice : null,
    spotPrice: Number.isFinite(spotPrice) ? spotPrice : null,
    timestamp: ticker.timestamp ? Number(ticker.timestamp) : null
  };
}

app.get("/live-price", async (req, res) => {
  try {
    const ticker = await getLiveBTCPrice();
    res.json({
      success: true,
      symbol: SYMBOL,
      price: Number(ticker.price.toFixed(2)),
      markPrice: ticker.markPrice,
      spotPrice: ticker.spotPrice,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("LIVE PRICE ERROR:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================
// NOTIFICATION UTILITIES
// =====================================
app.get("/push-public-key", (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY) {
    return res.status(500).json({ success: false, error: "VAPID public key not configured." });
  }
  res.json({ success: true, publicKey: process.env.VAPID_PUBLIC_KEY });
});

app.post("/subscribe", (req, res) => {
  try {
    const subscription = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ success: false, error: "Invalid push subscription." });
    }

    const exists = subscriptions.some((item) => item.endpoint === subscription.endpoint);
    if (!exists) {
      subscriptions.push(subscription);
      saveSubscriptions(subscriptions);
      console.log("NEW PUSH SUBSCRIPTION REGISTERED (Total:", subscriptions.length, ")");
    }

    res.json({ success: true, message: "Notification subscription saved." });
  } catch (error) {
    console.error("SUBSCRIBE ERROR:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

async function sendPushNotification(title, body, data = {}) {
  const entry = {
    id: Date.now(),
    title,
    body,
    data,
    timestamp: new Date().toISOString()
  };

  notificationHistory.unshift(entry);
  if (notificationHistory.length > MAX_HISTORY) {
    notificationHistory.pop();
  }

  if (!pushEnabled || subscriptions.length === 0) {
    return;
  }

  const payload = JSON.stringify({
    title,
    body,
    icon: "/icon.png",
    badge: "/icon.png",
    vibrate: [500, 150, 500, 150, 700],
    requireInteraction: true,
    data
  });

  let changed = false;
  for (let i = subscriptions.length - 1; i >= 0; i--) {
    try {
      await webpush.sendNotification(subscriptions[i], payload);
    } catch (error) {
      console.error("PUSH NOTIFICATION ERROR:", error.message);
      if (error.statusCode === 404 || error.statusCode === 410) {
        subscriptions.splice(i, 1);
        changed = true;
      }
    }
  }

  if (changed) {
    saveSubscriptions(subscriptions);
  }
}

app.get("/notifications/history", (req, res) => {
  res.json({ success: true, history: notificationHistory });
});

async function handleTestNotification(res) {
  if (!pushEnabled) {
    return res.status(500).json({ success: false, error: "Web Push is not configured." });
  }

  await sendPushNotification(
    "🔔 AI Trading Assistant",
    "Test notification with sound/vibration received.",
    { type: "TEST" }
  );

  res.json({
    success: true,
    message: "Test push notification sent",
    activeSubscribers: subscriptions.length
  });
}

app.post("/test-notification", async (req, res) => {
  await handleTestNotification(res);
});

app.get("/test-notification", async (req, res) => {
  await handleTestNotification(res);
});

// =====================================
// DATA FETCHING & CANDLE UTILS
// =====================================
const INTERVALS = {
  "15m": 15 * 60,
  "1h": 60 * 60,
  "4h": 4 * 60 * 60
};

function normalizeCandle(candle) {
  return {
    time: Number(candle.time),
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close)
  };
}

async function getRecentCandles(resolution, count = 120) {
  const interval = INTERVALS[resolution];
  const now = Math.floor(Date.now() / 1000);
  const start = now - count * interval;
  const url = `${DELTA_CANDLE_API}?resolution=${encodeURIComponent(resolution)}&symbol=${encodeURIComponent(SYMBOL)}&start=${start}&end=${now}`;

  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${resolution} API error: ${response.status}`);

  const data = await response.json();
  if (!Array.isArray(data.result)) throw new Error(`${resolution} candle data unavailable.`);

  const candles = data.result
    .map(normalizeCandle)
    .filter((c) => Number.isFinite(c.time) && Number.isFinite(c.close))
    .sort((a, b) => a.time - b.time);

  for (const c of candles) c.intervalSeconds = interval;
  return candles;
}

function getLastClosedCandle(candles) {
  if (!Array.isArray(candles) || candles.length === 0) return null;
  const now = Math.floor(Date.now() / 1000);
  for (let i = candles.length - 1; i >= 0; i--) {
    if (candles[i].time + candles[i].intervalSeconds <= now) {
      return { candle: candles[i], index: i };
    }
  }
  return null;
}

function calculateEMA(candles, period) {
  if (!Array.isArray(candles) || candles.length < period) return [];
  const ema = new Array(candles.length).fill(null);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += candles[i].close;
  let previous = sum / period;
  ema[period - 1] = previous;
  const multiplier = 2 / (period + 1);
  for (let i = period; i < candles.length; i++) {
    const value = (candles[i].close - previous) * multiplier + previous;
    ema[i] = value;
    previous = value;
  }
  return ema;
}

// =====================================
// TOP 5 CANDLESTICK PATTERN ENGINE
// =====================================
function scanTop5Patterns(candles, i, ema50, trend1h) {
  if (i < 3) return null;

  const c = candles[i];
  const prev1 = candles[i - 1];
  const prev2 = candles[i - 2];

  const range = c.high - c.low;
  if (range <= 0) return null;

  const body = Math.abs(c.close - c.open);
  const upperWick = c.high - Math.max(c.open, c.close);
  const lowerWick = Math.min(c.open, c.close) - c.low;
  const isGreen = c.close > c.open;
  const isRed = c.close < c.open;

  // 1. HAMMER (Dip Reversal)
  if (lowerWick >= 2 * body && upperWick <= body * 0.5 && body / range <= 0.4) {
    if (trend1h === "BULLISH" || c.close >= (ema50[i] || 0)) {
      const entry = c.high;
      const stopLoss = c.low;
      const risk = entry - stopLoss;
      return {
        pattern: "Hammer (Dip Reversal)",
        signal: "BUY",
        entry: Number(entry.toFixed(2)),
        stopLoss: Number(stopLoss.toFixed(2)),
        target: Number((entry + risk * 2).toFixed(2)),
        riskReward: "1:2.0",
        reason: "Bullish Hammer formed at key support with strong buyer rejection."
      };
    }
  }

  // 2. SHOOTING STAR (Top Rejection)
  if (upperWick >= 2 * body && lowerWick <= body * 0.5 && body / range <= 0.4) {
    if (trend1h === "BEARISH" || c.close <= (ema50[i] || Infinity)) {
      const entry = c.low;
      const stopLoss = c.high;
      const risk = stopLoss - entry;
      return {
        pattern: "Shooting Star (Top Rejection)",
        signal: "SELL",
        entry: Number(entry.toFixed(2)),
        stopLoss: Number(stopLoss.toFixed(2)),
        target: Number((entry - risk * 2).toFixed(2)),
        riskReward: "1:2.0",
        reason: "Shooting Star rejected higher prices, indicating seller aggression."
      };
    }
  }

  // 3. BULLISH / BEARISH ENGULFING
  const prevBody = Math.abs(prev1.close - prev1.open);
  if (isGreen && prev1.close < prev1.open && c.close > prev1.open && c.open < prev1.close && body > prevBody) {
    const entry = c.high;
    const stopLoss = Math.min(c.low, prev1.low);
    const risk = entry - stopLoss;
    return {
      pattern: "Bullish Engulfing",
      signal: "BUY",
      entry: Number(entry.toFixed(2)),
      stopLoss: Number(stopLoss.toFixed(2)),
      target: Number((entry + risk * 2).toFixed(2)),
      riskReward: "1:2.0",
      reason: "Bullish Engulfing completely engulfed prior bearish momentum."
    };
  }
  if (isRed && prev1.close > prev1.open && c.close < prev1.open && c.open > prev1.close && body > prevBody) {
    const entry = c.low;
    const stopLoss = Math.max(c.high, prev1.high);
    const risk = stopLoss - entry;
    return {
      pattern: "Bearish Engulfing",
      signal: "SELL",
      entry: Number(entry.toFixed(2)),
      stopLoss: Number(stopLoss.toFixed(2)),
      target: Number((entry - risk * 2).toFixed(2)),
      riskReward: "1:2.0",
      reason: "Bearish Engulfing overwhelmed buyers at the resistance area."
    };
  }

  // 4. MARUBOZU BREAKOUT
  if (body / range >= 0.85) {
    if (isGreen && (trend1h === "BULLISH" || c.close > prev1.high)) {
      const entry = c.high;
      const stopLoss = c.open + body * 0.5;
      const risk = entry - stopLoss;
      return {
        pattern: "Bullish Marubozu Breakout",
        signal: "BUY",
        entry: Number(entry.toFixed(2)),
        stopLoss: Number(stopLoss.toFixed(2)),
        target: Number((entry + risk * 2).toFixed(2)),
        riskReward: "1:2.0",
        reason: "Solid Bullish Marubozu indicates heavy institutional buying momentum."
      };
    }
    if (isRed && (trend1h === "BEARISH" || c.close < prev1.low)) {
      const entry = c.low;
      const stopLoss = c.open - body * 0.5;
      const risk = stopLoss - entry;
      return {
        pattern: "Bearish Marubozu Breakdown",
        signal: "SELL",
        entry: Number(entry.toFixed(2)),
        stopLoss: Number(stopLoss.toFixed(2)),
        target: Number((entry - risk * 2).toFixed(2)),
        riskReward: "1:2.0",
        reason: "Solid Bearish Marubozu breakdown confirms strong selling control."
      };
    }
  }

  // 5. MORNING STAR / EVENING STAR
  const isC1Bearish = prev2.close < prev2.open;
  const isC1Bullish = prev2.close > prev2.open;
  const isC2Doji = Math.abs(prev1.close - prev1.open) / (prev1.high - prev1.low || 1) < 0.35;

  if (isC1Bearish && isC2Doji && isGreen && c.close >= (prev2.open + prev2.close) / 2) {
    const entry = c.high;
    const stopLoss = Math.min(prev1.low, c.low);
    const risk = entry - stopLoss;
    return {
      pattern: "Morning Star (High Accuracy)",
      signal: "BUY",
      entry: Number(entry.toFixed(2)),
      stopLoss: Number(stopLoss.toFixed(2)),
      target: Number((entry + risk * 2).toFixed(2)),
      riskReward: "1:2.0",
      reason: "Morning Star 3-candle reversal pattern formed at bottom."
    };
  }

  if (isC1Bullish && isC2Doji && isRed && c.close <= (prev2.open + prev2.close) / 2) {
    const entry = c.low;
    const stopLoss = Math.max(prev1.high, c.high);
    const risk = stopLoss - entry;
    return {
      pattern: "Evening Star (High Accuracy)",
      signal: "SELL",
      entry: Number(entry.toFixed(2)),
      stopLoss: Number(stopLoss.toFixed(2)),
      target: Number((entry - risk * 2).toFixed(2)),
      riskReward: "1:2.0",
      reason: "Evening Star 3-candle reversal pattern formed at top."
    };
  }

  return null;
}

// =====================================
// STRATEGY EVALUATION
// =====================================
async function evaluateStrategy() {
  const candles15m = await getRecentCandles("15m", 120);
  const candles1h = await getRecentCandles("1h", 120);
  const liveTicker = await getLiveBTCPrice();

  const closed15m = getLastClosedCandle(candles15m);
  const closed1h = getLastClosedCandle(candles1h);

  if (!closed15m || !closed1h) {
    throw new Error("Candles unavailable.");
  }

  const i15 = closed15m.index;
  const i1 = closed1h.index;

  const ema1h20 = calculateEMA(candles1h, 20);
  const ema1h50 = calculateEMA(candles1h, 50);
  const ema15m50 = calculateEMA(candles15m, 50);

  const trend1h = ema1h20[i1] > ema1h50[i1] ? "BULLISH" : "BEARISH";

  const detectedSetup = scanTop5Patterns(candles15m, i15, ema15m50, trend1h);

  const signal = detectedSetup ? detectedSetup.signal : "NO TRADE";
  const patternName = detectedSetup ? detectedSetup.pattern : "Scanning 5 Patterns...";
  const predictionReason = detectedSetup
    ? detectedSetup.reason
    : "Waiting for Hammer, Engulfing, Marubozu or Star patterns.";

  return {
    liveTicker,
    strategyPrice: closed15m.candle.close,
    signal,
    patternName,
    trend1h,
    trade: detectedSetup,
    predictionReason,
    closed15m
  };
}

// =====================================
// BACKGROUND MONITOR
// =====================================
let lastNotifiedPattern = null;
let monitorRunning = false;

async function runBackgroundCheck() {
  if (monitorRunning) return;
  monitorRunning = true;

  try {
    const data = await evaluateStrategy();
    if (data.trade) {
      const eventId = `${data.trade.pattern}-${data.trade.signal}-${data.closed15m.candle.time}`;

      if (eventId !== lastNotifiedPattern) {
        const title =
          data.trade.signal === "BUY"
            ? `🟢 BTC BUY (${data.trade.pattern})`
            : `🔴 BTC SELL (${data.trade.pattern})`;

        const body = `Entry: $${data.trade.entry} | SL: $${data.trade.stopLoss} | Target: $${data.trade.target} (1:2 R:R)`;

        await sendPushNotification(title, body, {
          type: "PATTERN_TRIGGER",
          pattern: data.trade.pattern,
          signal: data.trade.signal,
          entry: data.trade.entry,
          stopLoss: data.trade.stopLoss,
          target: data.trade.target,
          livePrice: data.liveTicker.price
        });

        lastNotifiedPattern = eventId;
        console.log(`🚨 [CRON] Pattern Alert Dispatched: ${eventId}`);
      }
    }
  } catch (error) {
    console.error("BACKGROUND CHECK ERROR:", error.message);
  } finally {
    monitorRunning = false;
  }
}

// =====================================
// LIVE ANALYSIS ENDPOINT
// =====================================
app.get("/live-analysis", async (req, res) => {
  try {
    const data = await evaluateStrategy();
    res.json({
      success: true,
      symbol: SYMBOL,
      mode: "Top 5 Candlestick Multi-Scanner",
      price: Number(data.liveTicker.price.toFixed(2)),
      livePrice: Number(data.liveTicker.price.toFixed(2)),
      strategyPrice: Number(data.strategyPrice.toFixed(2)),
      signal: data.signal,
      pattern: data.patternName,
      trend1h: data.trend1h,
      trend4h: data.trend1h,
      crossover: data.patternName,
      entry: data.trade ? data.trade.entry : null,
      stopLoss: data.trade ? data.trade.stopLoss : null,
      target: data.trade ? data.trade.target : null,
      riskReward: data.trade ? data.trade.riskReward : null,
      futureTrigger: data.trade
        ? `${data.trade.signal} Triggered by ${data.trade.pattern}!`
        : "NO ACTIVE SETUP",
      predictionReason: data.predictionReason,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("LIVE ANALYSIS ERROR:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================
// START SERVER
// =====================================
app.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("=================================");
  console.log("AI CANDLESTICK SCANNER RUNNING");
  console.log("=================================");
  console.log("PORT =", PORT);
  console.log("STRATEGY = TOP 5 HIGH-PROBABILITY PATTERNS");
  console.log("TIMEFRAME = 15M EXECUTION + 1H TREND");
  console.log("=================================");

  runBackgroundCheck();
  setInterval(runBackgroundCheck, MONITOR_INTERVAL_MS);
});
