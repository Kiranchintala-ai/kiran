require('dotenv').config();
const express = require('express');
const cors = require('cors');
const webpush = require('web-push');
const https = require('https');
const yahooFinance = require('yahoo-finance2').default;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure Web Push Keys
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:tradingalert@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  console.log('WEB PUSH = ENABLED');
}

let subscribers = [];
let latestBtcSetup = { status: "Scanning BTC/USD..." };
let latestNiftySetup = { status: "Scanning Nifty 50..." };

// ---------------- SUBSCRIPTION ENDPOINTS ----------------
app.post('/subscribe', (req, res) => {
  const subscription = req.body;
  if (!subscribers.some(s => s.endpoint === subscription.endpoint)) {
    subscribers.push(subscription);
  }
  res.status(201).json({ status: 'subscribed' });
});

app.get('/test-notification', async (req, res) => {
  const payload = JSON.stringify({
    title: '🔔 AI Trading Assistant Test',
    body: 'Notification system is fully working! Signals will arrive here.',
    url: '/'
  });
  await broadcastPush(payload);
  res.json({ success: true, message: 'Test push notification sent', activeSubscribers: subscribers.length });
});

app.get('/api/signals', (req, res) => {
  res.json({
    btc: latestBtcSetup,
    nifty: latestNiftySetup,
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

// ---------------- 5 HIGH-PROBABILITY PATTERN ENGINE ----------------
function detectPatterns(candles, assetName) {
  if (!candles || candles.length < 5) return null;

  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const pprev = candles[candles.length - 3];

  const body = Math.abs(current.close - current.open);
  const range = current.high - current.low;
  const upperWick = current.high - Math.max(current.open, current.close);
  const lowerWick = Math.min(current.open, current.close) - current.low;

  const prevBody = Math.abs(prev.close - prev.open);

  // 1. Hammer (Bullish Reversal)
  if (lowerWick >= 2 * body && upperWick <= 0.1 * range && range > 0) {
    const sl = current.low;
    const risk = current.close - sl;
    return {
      asset: assetName,
      pattern: 'Hammer (Rejection of Lows)',
      signal: 'BUY',
      entry: current.close,
      stopLoss: sl,
      target: current.close + (risk * 2)
    };
  }

  // 2. Shooting Star (Bearish Rejection)
  if (upperWick >= 2 * body && lowerWick <= 0.1 * range && range > 0) {
    const sl = current.high;
    const risk = sl - current.close;
    return {
      asset: assetName,
      pattern: 'Shooting Star (Top Rejection)',
      signal: 'SELL',
      entry: current.close,
      stopLoss: sl,
      target: current.close - (risk * 2)
    };
  }

  // 3. Bullish Engulfing
  if (prev.close < prev.open && current.close > current.open && current.close > prev.open && current.open < prev.close) {
    const sl = Math.min(current.low, prev.low);
    const risk = current.close - sl;
    return {
      asset: assetName,
      pattern: 'Bullish Engulfing',
      signal: 'BUY',
      entry: current.close,
      stopLoss: sl,
      target: current.close + (risk * 2)
    };
  }

  // 4. Bearish Engulfing
  if (prev.close > prev.open && current.close < current.open && current.close < prev.open && current.open > prev.close) {
    const sl = Math.max(current.high, prev.high);
    const risk = sl - current.close;
    return {
      asset: assetName,
      pattern: 'Bearish Engulfing',
      signal: 'SELL',
      entry: current.close,
      stopLoss: sl,
      target: current.close - (risk * 2)
    };
  }

  // 5. Morning / Evening Star (3-Candle)
  if (pprev.close < pprev.open && body > 0 && current.close > current.open && current.close > (pprev.open + pprev.close) / 2) {
    const sl = Math.min(current.low, prev.low, pprev.low);
    const risk = current.close - sl;
    return {
      asset: assetName,
      pattern: 'Morning Star Pattern',
      signal: 'BUY',
      entry: current.close,
      stopLoss: sl,
      target: current.close + (risk * 2)
    };
  }

  return null;
}

// ---------------- DATA FETCHING ----------------

// 1. Fetch BTC/USD from Delta Exchange (24/7)
function fetchDeltaCandles() {
  return new Promise((resolve) => {
    const endTime = Math.floor(Date.now() / 1000);
    const startTime = endTime - (20 * 15 * 60);
    const url = `https://api.delta.exchange/v2/history/candles?resolution=15m&symbol=BTCUSD&start=${startTime}&end=${endTime}`;

    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.result && Array.isArray(json.result)) {
            const candles = json.result.map(c => ({
              open: parseFloat(c.open),
              high: parseFloat(c.high),
              low: parseFloat(c.low),
              close: parseFloat(c.close),
              time: c.time
            })).reverse();
            resolve(candles);
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

// 2. Fetch Nifty 50 from Yahoo Finance (^NSEI)
async function fetchNiftyCandles() {
  try {
    const result = await yahooFinance.chart('^NSEI', {
      period1: '5d',
      interval: '15m'
    });
    if (result && result.quotes) {
      return result.quotes.filter(q => q.open && q.close && q.high && q.low);
    }
    return null;
  } catch (err) {
    console.error('Nifty Fetch Error:', err.message);
    return null;
  }
}

function isIndianMarketOpen() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const day = now.getDay();
  const hour = now.getHours();
  const minute = now.getMinutes();

  if (day === 0 || day === 6) return false;
  const totalMins = hour * 60 + minute;
  return totalMins >= 555 && totalMins <= 930; // 9:15 AM to 3:30 PM IST
}

// ---------------- MASTER SCANNER LOOP ----------------
async function runMasterScan() {
  // A. SCAN BTC/USD (24/7)
  const btcCandles = await fetchDeltaCandles();
  if (btcCandles && btcCandles.length >= 5) {
    const btcTrade = detectPatterns(btcCandles, 'BTC/USD');
    if (btcTrade) {
      latestBtcSetup = btcTrade;
      console.log(`🚨 [BTC ALERT]: ${btcTrade.pattern} -> ${btcTrade.signal}`);
      await broadcastPush(JSON.stringify({
        title: `🚨 BTC/USD ${btcTrade.signal} Alert`,
        body: `${btcTrade.pattern}\nEntry: $${btcTrade.entry.toFixed(1)} | SL: $${btcTrade.stopLoss.toFixed(1)} | Target: $${btcTrade.target.toFixed(1)}`,
        url: '/'
      }));
    }
  }

  // B. SCAN NIFTY 50 (Market Hours only)
  if (isIndianMarketOpen()) {
    const niftyCandles = await fetchNiftyCandles();
    if (niftyCandles && niftyCandles.length >= 5) {
      const niftyTrade = detectPatterns(niftyCandles, 'NIFTY 50');
      if (niftyTrade) {
        latestNiftySetup = niftyTrade;
        console.log(`🚨 [NIFTY ALERT]: ${niftyTrade.pattern} -> ${niftyTrade.signal}`);
        await broadcastPush(JSON.stringify({
          title: `🚨 NIFTY 50 ${niftyTrade.signal} Alert`,
          body: `${niftyTrade.pattern}\nEntry: ₹${niftyTrade.entry.toFixed(1)} | SL: ₹${niftyTrade.stopLoss.toFixed(1)} | Target: ₹${niftyTrade.target.toFixed(1)}`,
          url: '/'
        }));
      }
    }
  } else {
    latestNiftySetup = { status: "Market Closed (Opens 9:15 AM Mon-Fri)" };
  }
}

// Run scanner every 60 seconds
setInterval(runMasterScan, 60000);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`DUAL AI SCANNER ACTIVE: BTC & NIFTY 50`);
  console.log(`PORT = ${PORT}`);
  console.log(`=================================`);
  runMasterScan();
});
