require('dotenv').config();
const express = require('express');
const cors = require('cors');
const webpush = require('web-push');
const https = require('https');
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:tradingalert@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

let subscribers = [];
let latestState = {
  livePrice: null,
  setup: 'NO TRADE',
  pattern: 'None',
  entry: null,
  stopLoss: null,
  target: null,
  why: 'Syncing Delta Exchange BTCUSD Perpetual...'
};

// ---------------- ENDPOINTS ----------------
app.post('/subscribe', (req, res) => {
  const subscription = req.body;
  if (!subscribers.some(s => s.endpoint === subscription.endpoint)) {
    subscribers.push(subscription);
  }
  res.status(201).json({ status: 'subscribed' });
});

app.get('/test-notification', async (req, res) => {
  await broadcastPush(JSON.stringify({
    title: '🔔 BTCUSD Perpetual Alert Test',
    body: 'Notifications are active!',
    url: '/'
  }));
  res.json({ success: true, activeSubscribers: subscribers.length });
});

app.get('/api/signals', (req, res) => {
  res.json({
    ...latestState,
    subscribers: subscribers.length
  });
});

async function broadcastPush(payloadString) {
  const stale = [];
  for (const sub of subscribers) {
    try {
      await webpush.sendNotification(sub, payloadString);
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) stale.push(sub);
    }
  }
  subscribers = subscribers.filter(s => !stale.includes(s));
}

// ---------------- 5-PATTERN DETECTOR ----------------
function analyzeCandles(candles) {
  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const pprev = candles[candles.length - 3];

  const body = Math.abs(current.close - current.open);
  const range = current.high - current.low;
  const upperWick = current.high - Math.max(current.open, current.close);
  const lowerWick = Math.min(current.open, current.close) - current.low;

  // 1. Hammer (Bullish)
  if (lowerWick >= 2 * body && upperWick <= 0.15 * range && range > 0) {
    const sl = current.low;
    const risk = current.close - sl;
    return {
      setup: 'BUY',
      pattern: 'Hammer',
      entry: current.close,
      stopLoss: sl,
      target: current.close + (risk * 2),
      why: `Completed 15M candle formed a Bullish Hammer with a long lower wick ($${sl.toFixed(1)}), showing strong buyer rejection of lower prices.`
    };
  }

  // 2. Shooting Star (Bearish)
  if (upperWick >= 2 * body && lowerWick <= 0.15 * range && range > 0) {
    const sl = current.high;
    const risk = sl - current.close;
    return {
      setup: 'SELL',
      pattern: 'Shooting Star',
      entry: current.close,
      stopLoss: sl,
      target: current.close - (risk * 2),
      why: `Completed 15M candle formed a Bearish Shooting Star with a long upper wick ($${sl.toFixed(1)}), showing heavy seller rejection at the highs.`
    };
  }

  // 3. Bullish Engulfing
  if (prev.close < prev.open && current.close > current.open && current.close > prev.open && current.open < prev.close) {
    const sl = Math.min(current.low, prev.low);
    const risk = current.close - sl;
    return {
      setup: 'BUY',
      pattern: 'Bullish Engulfing',
      entry: current.close,
      stopLoss: sl,
      target: current.close + (risk * 2),
      why: `Green 15M candle completely engulfed the prior red candle, signaling an immediate shift in momentum toward buyers.`
    };
  }

  // 4. Bearish Engulfing
  if (prev.close > prev.open && current.close < current.open && current.close < prev.open && current.open > prev.close) {
    const sl = Math.max(current.high, prev.high);
    const risk = sl - current.close;
    return {
      setup: 'SELL',
      pattern: 'Bearish Engulfing',
      entry: current.close,
      stopLoss: sl,
      target: current.close - (risk * 2),
      why: `Red 15M candle completely engulfed the prior green candle, confirming strong selling pressure.`
    };
  }

  // 5. Morning Star
  if (pprev.close < pprev.open && body > 0 && current.close > current.open && current.close > (pprev.open + pprev.close) / 2) {
    const sl = Math.min(current.low, prev.low, pprev.low);
    const risk = current.close - sl;
    return {
      setup: 'BUY',
      pattern: 'Morning Star',
      entry: current.close,
      stopLoss: sl,
      target: current.close + (risk * 2),
      why: `3-candle Morning Star reversal confirmed on the 15M timeframe as buyers reclaimed more than 50% of the prior drop.`
    };
  }

  const trend = current.close >= current.open ? 'bullish' : 'bearish';
  return {
    setup: 'NO TRADE',
    pattern: 'None',
    entry: null,
    stopLoss: null,
    target: null,
    why: `Last completed 15M candle closed at $${current.close.toFixed(1)} (${trend} body), with no confirmed reversal pattern among the top 5 setups. Waiting for clean confirmation.`
  };
}

async function refineWhyWithAI(analysis, livePrice) {
  if (!ai) return analysis.why;
  try {
    const prompt = `Delta Exchange India BTCUSD Perpetual Live Traded Price: $${livePrice}. Status: ${analysis.setup} (${analysis.pattern}). Note: ${analysis.why}. Write a crisp 1-2 sentence trader explanation for "Why" this is the setup right now.`;
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });
    return response.text.trim() || analysis.why;
  } catch {
    return analysis.why;
  }
}

// ---------------- 1. INSTANT LIVE TRADED PRICE (MATCHES MOBILE CHART) ----------------
function fetchDeltaLiveTicker() {
  return new Promise((resolve) => {
    const url = 'https://api.india.delta.exchange/v2/tickers/BTCUSD';
    https.get(url, { headers: { 'User-Agent': 'NodeApp/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.result && json.result.close) {
            resolve(parseFloat(json.result.close)); // Exact Last Traded Price shown on mobile
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

// ---------------- 2. 15M COMPLETED CANDLES FOR PATTERN SCAN ----------------
function fetchDeltaCandles() {
  return new Promise((resolve) => {
    const end = Math.floor(Date.now() / 1000);
    const start = end - (15 * 15 * 60);
    const url = `https://api.india.delta.exchange/v2/history/candles?resolution=15m&symbol=BTCUSD&start=${start}&end=${end}`;

    https.get(url, { headers: { 'User-Agent': 'NodeApp/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.result && Array.isArray(json.result) && json.result.length >= 6) {
            const sorted = json.result.sort((a, b) => a.time - b.time);
            const completedCandles = sorted.slice(0, -1).map(c => ({
              open: parseFloat(c.open),
              high: parseFloat(c.high),
              low: parseFloat(c.low),
              close: parseFloat(c.close)
            }));
            resolve(completedCandles);
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

let lastAlertSignature = '';
let lastScannedCandleClose = null;

async function updateLiveTickAndScan() {
  // Fast 5-second live traded price sync
  const liveTradedPrice = await fetchDeltaLiveTicker();
  if (liveTradedPrice) {
    latestState.livePrice = liveTradedPrice;
  }

  // Pattern scan on 15M candles
  const candles = await fetchDeltaCandles();
  if (!candles || candles.length < 5) return;

  const latestClosed = candles[candles.length - 1].close;
  if (latestClosed !== lastScannedCandleClose) {
    lastScannedCandleClose = latestClosed;
    const analysis = analyzeCandles(candles);
    const whyText = await refineWhyWithAI(analysis, latestState.livePrice || latestClosed);

    latestState = {
      livePrice: latestState.livePrice || latestClosed,
      setup: analysis.setup,
      pattern: analysis.pattern,
      entry: analysis.entry,
      stopLoss: analysis.stopLoss,
      target: analysis.target,
      why: whyText
    };

    if (analysis.setup !== 'NO TRADE') {
      const sig = `${analysis.setup}-${analysis.entry}`;
      if (sig !== lastAlertSignature) {
        lastAlertSignature = sig;
        await broadcastPush(JSON.stringify({
          title: `🚨 BTCUSD ${analysis.setup} (${analysis.pattern})`,
          body: `Entry: $${analysis.entry.toFixed(1)} | SL: $${analysis.stopLoss.toFixed(1)} | Target: $${analysis.target.toFixed(1)}`,
          url: '/'
        }));
      }
    }
  }
}

// Poll every 5 seconds so live price matches mobile app in real time
setInterval(updateLiveTickAndScan, 5000);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Delta India BTCUSD Live Ticker & 15M Scanner Active on Port ${PORT}`);
  updateLiveTickAndScan();
});
