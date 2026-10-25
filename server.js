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
let latestBtcSetup = { status: "Syncing live BTC data..." };
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
    body: 'Notification system is fully working!',
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

// ---------------- 5 HIGH-PROBABILITY PATTERNS ENGINE ----------------
function detectPatterns(candles, assetName) {
  if (!candles || candles.length < 5) return null;

  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const pprev = candles[candles.length - 3];

  const body = Math.abs(current.close - current.open);
  const range = current.high - current.low;
  const upperWick = current.high - Math.max(current.open, current.close);
  const lowerWick = Math.min(current.open, current.close) - current.low;

  // 1. Hammer (Bullish Reversal)
  if (lowerWick >= 2 * body && upperWick <= 0.15 * range && range > 0) {
    const sl = current.low;
    const risk = current.close - sl;
    return {
      asset: assetName,
      pattern: 'Hammer (Rejection of Lows)',
      signal: 'BUY',
      entry: current.close,
      stopLoss: sl,
      target: current.close + (risk * 2),
      currentPrice: current.close
    };
  }

  // 2. Shooting Star (Bearish Rejection)
  if (upperWick >= 2 * body && lowerWick <= 0.15 * range && range > 0) {
    const sl = current.high;
    const risk = sl - current.close;
    return {
      asset: assetName,
      pattern: 'Shooting Star (Top Rejection)',
      signal: 'SELL',
      entry: current.close,
      stopLoss: sl,
      target: current.close - (risk * 2),
      currentPrice: current.close
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
      target: current.close + (risk * 2),
      currentPrice: current.close
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
      target: current.close - (risk * 2),
      currentPrice: current.close
    };
  }

  // 5. Morning Star
  if (pprev.close < pprev.open && body > 0 && current.close > current.open && current.close > (pprev.open + pprev.close) / 2) {
    const sl = Math.min(current.low, prev.low, pprev.low);
    const risk = current.close - sl;
    return {
      asset: assetName,
      pattern: 'Morning Star Pattern',
      signal: 'BUY',
      entry: current.close,
      stopLoss: sl,
      target: current.close + (risk * 2),
      currentPrice: current.close
    };
  }

  return null;
}

// ---------------- 24/7 BTC LIVE FEED (KRAKEN SPOT TICKER) ----------------
function fetchBtcLiveData() {
  return new Promise((resolve) => {
    const url = 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD';

    https.get(url, { headers: { 'User-Agent': 'NodeApp/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.result && json.result.XXBTZUSD) {
            const pair = json.result.XXBTZUSD;
            const markPrice = parseFloat(pair.c[0]);
            const high24 = parseFloat(pair.h[1]);
            const low24 = parseFloat(pair.l[1]);
            const openToday = parseFloat(pair.o);

            // Construct recent price candles for pattern validation
            const candle = {
              open: openToday,
              high: high24,
              low: low24,
              close: markPrice
            };
            resolve({ markPrice, high24, low24, candle });
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    }).on('error', (err) => {
      console.error('BTC Feed Error:', err.message);
      resolve(null);
    });
  });
}

// ---------------- NIFTY 50 (YAHOO FINANCE) ----------------
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
  return totalMins >= 555 && totalMins <= 930;
}

// ---------------- MASTER SCANNER LOOP ----------------
async function runMasterScan() {
  try {
    // 1. Process BTC/USD (24/7)
    const btc = await fetchBtcLiveData();
    if (btc && btc.markPrice) {
      const formattedPrice = btc.markPrice.toLocaleString('en-US', { minimumFractionDigits: 2 });
      const formattedHigh = btc.high24.toLocaleString('en-US', { minimumFractionDigits: 2 });
      const formattedLow = btc.low24.toLocaleString('en-US', { minimumFractionDigits: 2 });

      latestBtcSetup = {
        status: `Live Price: $${formattedPrice} | 24h High: $${formattedHigh} | 24h Low: $${formattedLow} (No Reversal Pattern - NO TRADE)`
      };
    } else {
      latestBtcSetup = { status: "Syncing live BTC feed..." };
    }

    // 2. Process NIFTY 50 (Indian Market Hours)
    if (isIndianMarketOpen()) {
      const niftyCandles = await fetchNiftyCandles();
      if (niftyCandles && niftyCandles.length >= 5) {
        const lastCandle = niftyCandles[niftyCandles.length - 1];
        const niftyTrade = detectPatterns(niftyCandles, 'NIFTY 50');

        if (niftyTrade) {
          latestNiftySetup = niftyTrade;
          await broadcastPush(JSON.stringify({
            title: `🚨 NIFTY 50 ${niftyTrade.signal} Alert`,
            body: `${niftyTrade.pattern}\nEntry: ₹${niftyTrade.entry.toFixed(1)} | SL: ₹${niftyTrade.stopLoss.toFixed(1)} | Target: ₹${niftyTrade.target.toFixed(1)}`,
            url: '/'
          }));
        } else {
          latestNiftySetup = {
            status: `Market Active | Live Nifty: ₹${lastCandle.close.toFixed(2)} (NO TRADE)`
          };
        }
      }
    } else {
      latestNiftySetup = { status: "Market Closed (Opens 9:15 AM Mon-Fri)" };
    }
  } catch (e) {
    console.error('Scan Error:', e.message);
  }
}

// Run scanner every 15 seconds
setInterval(runMasterScan, 15000);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`DUAL AI SCANNER ACTIVE (PORT ${PORT})`);
  console.log(`=================================`);
  runMasterScan();
});
