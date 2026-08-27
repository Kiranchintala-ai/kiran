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
const MONITOR_INTERVAL_MS = 60 * 1000;
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
// FRONTEND STATIC FILES
// =====================================
const publicFolder = path.join(__dirname, "public");
if (fs.existsSync(publicFolder)) {
  app.use(express.static(publicFolder));
}

// =====================================
// HOME & HEALTH
// =====================================
app.get("/", (req, res) => {
  const indexPath = path.join(publicFolder, "index.html");
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.send("AI Trading Server Running");
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "AI Trading Server is running",
    strategy: "4H + 1H + 30M EMA9/EMA26",
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
  if (!Number.isFinite(price) && Number.isFinite(markPrice)) {
    price = markPrice;
  }
  if (!Number.isFinite(price) && Number.isFinite(spotPrice)) {
    price = spotPrice;
  }
  if (!Number.isFinite(price)) {
    throw new Error("Invalid live BTC price.");
  }

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
// NOTIFICATION ENDPOINTS
// =====================================
app.get("/push-public-key", (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY) {
    return res.status(500).json({
      success: false,
      error: "VAPID public key not configured."
    });
  }
  res.json({ success: true, publicKey: process.env.VAPID_PUBLIC_KEY });
});

app.post("/subscribe", (req, res) => {
  try {
    const subscription = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({
        success: false,
        error: "Invalid push subscription."
      });
    }

    const exists = subscriptions.some(
      (item) => item.endpoint === subscription.endpoint
    );
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
    console.log("No active subscriptions or push not enabled.");
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
  res.json({
    success: true,
    history: notificationHistory
  });
});

async function handleTestNotification(res) {
  if (!pushEnabled) {
    return res.status(500).json({
      success: false,
      error: "Web Push is not configured."
    });
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
// AI IMAGE ANALYSIS
// =====================================
function cleanBase64(image) {
  if (typeof image !== "string") return image;
  return image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
}

function getValue(text, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp("^\\s*" + escapedLabel + "\\s*:\\s*(.+)$", "im");
  const match = text.match(regex);
  return match ? match[1].trim() : "-";
}

app.get("/test-ai", async (req, res) => {
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: "Reply with only one word: SUCCESS"
    });
    res.json({ success: true, reply: response.text || "SUCCESS" });
  } catch (error) {
    console.error("TEST AI ERROR:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/analyze", async (req, res) => {
  try {
    const { image1H, image30M } = req.body;
    if (!image1H || !image30M) {
      return res.status(400).json({
        success: false,
        error: "Please upload both 1H and 30M charts."
      });
    }

    const chart1H = cleanBase64(image1H);
    const chart30M = cleanBase64(image30M);

    const prompt = `You are a disciplined BTC/USD technical analysis assistant.
1H = higher timeframe direction.
30M = setup timeframe.
The goal is a FUTURE CONDITIONAL TRADE SETUP.
Do not claim to know the future. Do not guarantee any result. Do not invent prices.

Analyze:
1H:
- Overall direction
- Market structure
- Higher highs, Higher lows, Lower highs, Lower lows

30M:
- EMA9, EMA26
- EMA crossover
- Breakout, Breakdown, Retest, Rejection, Momentum
- Possible future entry, Stop loss, Target

Rules:
1. Do NOT force a trade.
2. If 1H and 30M conflict, return NO TRADE.
3. If setup is unclear, return NO TRADE.
4. Do not invent prices or volume.
5. Risk Reward must be at least 1:2.
6. Entry must be a future trigger.
7. If there is no clear future trigger, return NO TRADE.

Return ONLY:
Signal: BUY or SELL or NO TRADE
Entry: price or -
Stop Loss: price or -
Target: price or -
Risk Reward: 1:2 or better, or -
Reason: short reason

Do NOT return: 5M, Confidence, Support, Resistance, Trend, Confirmation, Long explanations, Markdown, Tables`;

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        { text: "IMAGE 1 — 1H BTC/USD CHART" },
        { inlineData: { mimeType: "image/png", data: chart1H } },
        { text: "IMAGE 2 — 30M BTC/USD CHART" },
        { inlineData: { mimeType: "image/png", data: chart30M } },
        { text: prompt }
      ]
    });

    const text = response.text || "";
    res.json({
      success: true,
      signal: getValue(text, "Signal"),
      entry: getValue(text, "Entry"),
      stopLoss: getValue(text, "Stop Loss"),
      target: getValue(text, "Target"),
      riskReward: getValue(text, "Risk Reward"),
      reason: getValue(text, "Reason"),
      raw: text
    });
  } catch (error) {
    console.error("IMAGE ANALYSIS ERROR:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================
// TECHNICAL STRATEGY UTILS
// =====================================
const INTERVALS = {
  "30m": 30 * 60,
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
  if (!interval) {
    throw new Error(`Unsupported resolution: ${resolution}`);
  }

  const now = Math.floor(Date.now() / 1000);
  const start = now - count * interval;
  const url = `${DELTA_CANDLE_API}?resolution=${encodeURIComponent(resolution)}&symbol=${encodeURIComponent(SYMBOL)}&start=${start}&end=${now}`;

  const response = await fetch(url, {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${resolution} API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  if (!Array.isArray(data.result)) {
    throw new Error(`${resolution}: candle data unavailable`);
  }

  const candles = data.result
    .map(normalizeCandle)
    .filter(
      (candle) =>
        Number.isFinite(candle.time) &&
        Number.isFinite(candle.open) &&
        Number.isFinite(candle.high) &&
        Number.isFinite(candle.low) &&
        Number.isFinite(candle.close)
    )
    .sort((a, b) => a.time - b.time);

  for (const candle of candles) {
    candle.intervalSeconds = interval;
  }

  return candles;
}

function getLastClosedCandle(candles) {
  if (!Array.isArray(candles) || candles.length === 0) return null;
  const now = Math.floor(Date.now() / 1000);
  for (let i = candles.length - 1; i >= 0; i--) {
    const candle = candles[i];
    if (candle.time + candle.intervalSeconds <= now) {
      return { candle, index: i };
    }
  }
  return null;
}

function calculateEMA(candles, period) {
  if (!Array.isArray(candles) || candles.length < period) return [];
  const ema = new Array(candles.length).fill(null);
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += candles[i].close;
  }
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

function detectCrossover(fastEMA, slowEMA, index) {
  if (!Array.isArray(fastEMA) || !Array.isArray(slowEMA)) return "NONE";
  if (index < 1) return "NONE";

  const previousFast = fastEMA[index - 1];
  const previousSlow = slowEMA[index - 1];
  const currentFast = fastEMA[index];
  const currentSlow = slowEMA[index];

  if (
    previousFast === null ||
    previousSlow === null ||
    currentFast === null ||
    currentSlow === null
  ) {
    return "NONE";
  }

  if (previousFast <= previousSlow && currentFast > currentSlow) {
    return "BULLISH";
  }
  if (previousFast >= previousSlow && currentFast < currentSlow) {
    return "BEARISH";
  }
  return "NONE";
}

function calculateMomentum(candles, index, lookback = 3) {
  if (index < lookback) return "NEUTRAL";
  const current = candles[index].close;
  const previous = candles[index - lookback].close;
  if (current > previous) return "BULLISH";
  if (current < previous) return "BEARISH";
  return "NEUTRAL";
}

function getCandleStructure(candle) {
  const body = Math.abs(candle.close - candle.open);
  const range = candle.high - candle.low;
  if (range <= 0) return "NEUTRAL";
  const bodyRatio = body / range;
  if (candle.close > candle.open && bodyRatio >= 0.5) return "BULLISH";
  if (candle.close < candle.open && bodyRatio >= 0.5) return "BEARISH";
  return "NEUTRAL";
}

function getRecentHigh(candles, endIndex, lookback = 10) {
  const start = Math.max(0, endIndex - lookback + 1);
  let highest = -Infinity;
  for (let i = start; i <= endIndex; i++) {
    highest = Math.max(highest, candles[i].high);
  }
  return Number.isFinite(highest) ? highest : null;
}

function getRecentLow(candles, endIndex, lookback = 10) {
  const start = Math.max(0, endIndex - lookback + 1);
  let lowest = Infinity;
  for (let i = start; i <= endIndex; i++) {
    lowest = Math.min(lowest, candles[i].low);
  }
  return Number.isFinite(lowest) ? lowest : null;
}

function calculateFuturePrediction(trend4h, trend1h, ema30mTrend, momentum30m, crossover) {
  if (
    trend4h === "BULLISH" &&
    trend1h === "BULLISH" &&
    ema30mTrend === "BULLISH" &&
    momentum30m === "BULLISH"
  ) {
    return {
      signal: "BUY",
      reason:
        crossover === "BULLISH"
          ? "4H and 1H are bullish and a fresh 30M bullish EMA crossover confirms the setup."
          : "4H, 1H and 30M are bullish, but no fresh 30M crossover is active."
    };
  }

  if (
    trend4h === "BEARISH" &&
    trend1h === "BEARISH" &&
    ema30mTrend === "BEARISH" &&
    momentum30m === "BEARISH"
  ) {
    return {
      signal: "SELL",
      reason:
        crossover === "BEARISH"
          ? "4H and 1H are bearish and a fresh 30M bearish EMA crossover confirms the setup."
          : "4H, 1H and 30M are bearish, but no fresh 30M crossover is active."
    };
  }

  return {
    signal: "NO TRADE",
    reason: "4H, 1H and 30M conditions are not aligned."
  };
}

function calculateFutureSetup(signal, recentHigh, recentLow) {
  if (signal !== "BUY" && signal !== "SELL") return null;
  if (!Number.isFinite(recentHigh) || !Number.isFinite(recentLow)) return null;

  const range = recentHigh - recentLow;
  if (range <= 0) return null;

  let entry, stopLoss, target;
  if (signal === "BUY") {
    entry = recentHigh;
    stopLoss = recentLow;
    const risk = entry - stopLoss;
    if (risk <= 0) return null;
    target = entry + risk * 2;
  } else {
    entry = recentLow;
    stopLoss = recentHigh;
    const risk = stopLoss - entry;
    if (risk <= 0) return null;
    target = entry - risk * 2;
  }

  const risk = Math.abs(entry - stopLoss);
  const reward = Math.abs(target - entry);
  if (risk <= 0 || reward <= 0) return null;

  const rr = reward / risk;
  if (rr < 2) return null;

  return {
    entry: Number(entry.toFixed(2)),
    stopLoss: Number(stopLoss.toFixed(2)),
    target: Number(target.toFixed(2)),
    riskReward: `1:${rr.toFixed(2)}`
  };
}

// =====================================
// STRATEGY EVALUATION
// =====================================
async function evaluateStrategy() {
  const candles30m = await getRecentCandles("30m", 120);
  const candles1h = await getRecentCandles("1h", 120);
  const candles4h = await getRecentCandles("4h", 120);
  const liveTicker = await getLiveBTCPrice();

  const closed30m = getLastClosedCandle(candles30m);
  const closed1h = getLastClosedCandle(candles1h);
  const closed4h = getLastClosedCandle(candles4h);

  if (!closed30m || !closed1h || !closed4h) {
    throw new Error("Not enough closed candles.");
  }

  const i30 = closed30m.index;
  const i1 = closed1h.index;
  const i4 = closed4h.index;

  const ema30m9 = calculateEMA(candles30m, 9);
  const ema30m26 = calculateEMA(candles30m, 26);
  const ema1h9 = calculateEMA(candles1h, 9);
  const ema1h26 = calculateEMA(candles1h, 26);
  const ema4h9 = calculateEMA(candles4h, 9);
  const ema4h26 = calculateEMA(candles4h, 26);

  const trend4h = ema4h9[i4] > ema4h26[i4] ? "BULLISH" : "BEARISH";
  const trend1h = ema1h9[i1] > ema1h26[i1] ? "BULLISH" : "BEARISH";

  let ema30mTrend = "SIDEWAYS";
  if (ema30m9[i30] > ema30m26[i30]) {
    ema30mTrend = "BULLISH";
  } else if (ema30m9[i30] < ema30m26[i30]) {
    ema30mTrend = "BEARISH";
  }

  const crossover = detectCrossover(ema30m9, ema30m26, i30);
  const momentum30m = calculateMomentum(candles30m, i30, 3);
  const candleStructure = getCandleStructure(closed30m.candle);
  const strategyPrice = closed30m.candle.close;

  const recentHigh = getRecentHigh(candles30m, i30, 10);
  const recentLow = getRecentLow(candles30m, i30, 10);

  const prediction = calculateFuturePrediction(
    trend4h,
    trend1h,
    ema30mTrend,
    momentum30m,
    crossover
  );

  let signal = prediction.signal;
  if (crossover !== "BULLISH" && crossover !== "BEARISH") {
    signal = "NO TRADE";
  }
  if (crossover === "BULLISH" && signal !== "BUY") {
    signal = "NO TRADE";
  }
  if (crossover === "BEARISH" && signal !== "SELL") {
    signal = "NO TRADE";
  }

  const trade = calculateFutureSetup(signal, recentHigh, recentLow);
  if (!trade) {
    signal = "NO TRADE";
  }

  return {
    liveTicker,
    strategyPrice,
    signal,
    prediction,
    trend4h,
    trend1h,
    ema30mTrend,
    momentum30m,
    candleStructure,
    crossover,
    trade,
    recentHigh,
    recentLow,
    closed30m
  };
}

// =====================================
// BACKGROUND MONITOR
// =====================================
let lastNotifiedCrossover = null;
let monitorRunning = false;

async function runBackgroundCheck() {
  if (monitorRunning) return;
  monitorRunning = true;

  try {
    const data = await evaluateStrategy();
    const crossoverId = `${data.crossover}-${data.closed30m.candle.time}`;

    if (
      (data.crossover === "BULLISH" || data.crossover === "BEARISH") &&
      crossoverId !== lastNotifiedCrossover
    ) {
      const notificationTitle =
        data.crossover === "BULLISH"
          ? "🟢 BTC/USD BUY Setup"
          : "🔴 BTC/USD SELL Setup";

      const notificationBody =
        data.crossover === "BULLISH"
          ? `30M EMA9 crossed ABOVE EMA26. Entry: $${data.trade ? data.trade.entry : '-'}`
          : `30M EMA9 crossed BELOW EMA26. Entry: $${data.trade ? data.trade.entry : '-'}`;

      await sendPushNotification(notificationTitle, notificationBody, {
        type: "CROSSOVER",
        signal: data.signal,
        crossover: data.crossover,
        livePrice: data.liveTicker.price,
        entry: data.trade ? data.trade.entry : null,
        stopLoss: data.trade ? data.trade.stopLoss : null,
        target: data.trade ? data.trade.target : null
      });

      lastNotifiedCrossover = crossoverId;
      console.log(`🚨 [CRON] Notified crossover event: ${crossoverId}`);
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
    const crossoverId = `${data.crossover}-${data.closed30m.candle.time}`;
    let notificationSent = false;

    if (
      (data.crossover === "BULLISH" || data.crossover === "BEARISH") &&
      crossoverId !== lastNotifiedCrossover
    ) {
      const notificationTitle =
        data.crossover === "BULLISH"
          ? "🟢 BTC/USD BUY Setup"
          : "🔴 BTC/USD SELL Setup";

      const notificationBody =
        data.crossover === "BULLISH"
          ? `30M EMA9 crossed ABOVE EMA26. Entry: $${data.trade ? data.trade.entry : '-'}`
          : `30M EMA9 crossed BELOW EMA26. Entry: $${data.trade ? data.trade.entry : '-'}`;

      await sendPushNotification(notificationTitle, notificationBody, {
        type: "CROSSOVER",
        signal: data.signal,
        crossover: data.crossover,
        livePrice: data.liveTicker.price,
        entry: data.trade ? data.trade.entry : null,
        stopLoss: data.trade ? data.trade.stopLoss : null,
        target: data.trade ? data.trade.target : null
      });

      lastNotifiedCrossover = crossoverId;
      notificationSent = true;
    }

    res.json({
      success: true,
      symbol: SYMBOL,
      mode: "4H + 1H + 30M",
      price: Number(data.liveTicker.price.toFixed(2)),
      livePrice: Number(data.liveTicker.price.toFixed(2)),
      markPrice: data.liveTicker.markPrice,
      spotPrice: data.liveTicker.spotPrice,
      strategyPrice: Number(data.strategyPrice.toFixed(2)),
      signal: data.signal,
      prediction: data.signal,
      predictionReason: data.prediction.reason,
      trend4h: data.trend4h,
      trend1h: data.trend1h,
      ema30mTrend: data.ema30mTrend,
      momentum30m: data.momentum30m,
      candleStructure: data.candleStructure,
      crossover: data.crossover,
      notificationSent,
      futureEntry: data.trade ? data.trade.entry : null,
      entry: data.trade ? data.trade.entry : null,
      stopLoss: data.trade ? data.trade.stopLoss : null,
      target: data.trade ? data.trade.target : null,
      riskReward: data.trade ? data.trade.riskReward : null,
      futureTrigger: data.trade
        ? data.signal === "BUY"
          ? `BUY only if 30M price breaks above ${data.trade.entry}.`
          : `SELL only if 30M price breaks below ${data.trade.entry}.`
        : "NO TRADE",
      support: data.recentLow,
      resistance: data.recentHigh,
      candleTime: new Date(data.closed30m.candle.time * 1000).toISOString(),
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
  console.log("AI TRADING SERVER RUNNING");
  console.log("=================================");
  console.log("PORT =", PORT);
  console.log("TIMEFRAMES = 4H + 1H + 30M");
  console.log("EMA = 9 / 26");
  console.log("BACKGROUND MONITOR = EVERY 60 SECONDS");
  console.log("=================================");

  runBackgroundCheck();
  setInterval(runBackgroundCheck, MONITOR_INTERVAL_MS);
});
