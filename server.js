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

// Configure Web Push
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:tradingalert@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// Configure Gemini AI (optional enhancement if GEMINI_API_KEY is set in Render)
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

let subscribers = [];
let latestState = {
  livePrice: null,
  setup: 'NO TRADE',
  pattern: 'None',
  entry: null,
  stopLoss: null,
  target: null,
  why: 'Syncing live BTC/USD 15M candles...'
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
    title: '🔔 BTC/USD AI Alert Test',
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
function analyzeCandles(candles, livePrice) {
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
      why: `Completed 15M candle formed a Bullish Hammer with a long lower wick ($${sl.toFixed(2)}), showing strong buyer rejection of lower prices.`
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
      why: `Completed 15M candle formed a Bearish Shooting Star with a long upper wick ($${sl.toFixed(2)}), showing heavy seller rejection at the highs.`
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

  // No Pattern Found
  const trend = current.close >= current.open ? 'mild bullish' : 'mild bearish';
  return {
    setup: 'NO TRADE',
    pattern: 'None',
    entry: null,
    stopLoss: null,
    target: null,
    why: `Last completed 15M candle closed at $${current.close.toFixed(2)} (${trend} body), but none of the 5 high-probability reversal patterns formed. Waiting for clean confirmation to protect capital.`
  };
}

// Optional Gemini AI Explanation Refinement
async function refineWhyWithAI(analysis, livePrice) {
  if (!ai) return analysis.why;
  try {
    const prompt = `BTC/USD Live Price: $${livePrice}. Status: ${analysis.setup} (${analysis.pattern}). Technical note: ${analysis.why}. Write a crisp 1-2 sentence trader explanation for "Why" this is the setup right now.`;
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });
    return response.text.trim() || analysis.why;
  } catch {
    return analysis.why;
  }
}

// ---------------- 24/7 LIVE FEED ----------------
function fetchBtcCandles() {
  return new Promise((resolve) => {
    const url = 'https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=15';

    https.get(url, { headers: { 'User-Agent': 'NodeApp/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.result && json.result.XXBTZUSD) {
            const raw = json.result.XXBTZUSD.slice(-15);
            const completedCandles = raw.slice(0, -1).map(c => ({
              open: parseFloat(c[1]),
              high: parseFloat(c[2]),
              low: parseFloat(c[3]),
              close: parseFloat(c[4])
            }));
            const livePrice = parseFloat(raw[raw.length - 1][4]);
            resolve({ completedCandles, livePrice });
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

async function runScanner() {
  const data = await fetchBtcCandles();
  if (!data || data.completedCandles.length < 5) return;

  const analysis = analyzeCandles(data.completedCandles, data.livePrice);
  const whyText = await refineWhyWithAI(analysis, data.livePrice);

  latestState = {
    livePrice: data.livePrice,
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
        title: `🚨 BTC/USD ${analysis.setup} (${analysis.pattern})`,
        body: `Entry: $${analysis.entry.toFixed(2)} | SL: $${analysis.stopLoss.toFixed(2)} | Target: $${analysis.target.toFixed(2)}`,
        url: '/'
      }));
    }
  }
}

setInterval(runScanner, 20000);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`BTC/USD Scanner Running on Port ${PORT}`);
  runScanner();
});
