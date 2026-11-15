require('dotenv').config();
const express = require('express');
const cors = require('cors');
const webpush = require('web-push');
const https = require('https');

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
    body: 'Notification system is working! BTC signals will arrive here.',
    url: '/'
  });
  await broadcastPush(payload);
  res.json({ success: true, message: 'Test push notification sent', activeSubscribers: subscribers.length });
});

app.get('/api/signals', (req, res) => {
  res.json({
    btc: latestBtcSetup,
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
function detectPatterns(candles) {
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
      asset: 'BTC/USD',
      pattern: 'Hammer (Rejection of Lows)',
      signal: 'BUY',
      entry: current.close,
      stopLoss: sl,
      target: current.close + (risk * 2)
    };
  }

  // 2. Shooting Star (Bearish Rejection)
  if (upperWick >= 2 * body && lowerWick <= 0.15 * range && range > 0) {
    const sl = current.high;
    const risk = sl - current.close;
    return {
      asset: 'BTC/USD',
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
      asset: 'BTC/USD',
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
      asset: 'BTC/USD',
      pattern: 'Bearish Engulfing',
      signal: 'SELL',
      entry: current.close,
      stopLoss: sl,
      target: current.close - (risk * 2)
    };
  }

  // 5. Morning Star
  if (pprev.close < pprev.open && body > 0 && current.close > current.open && current.close > (pprev.open + pprev.close) / 2) {
    const sl = Math.min(current.low, prev.low, pprev.low);
    const risk = current.close - sl;
    return {
      asset: 'BTC/USD',
      pattern: 'Morning Star Pattern',
      signal: 'BUY',
      entry: current.close,
      stopLoss: sl,
      target: current.close + (risk * 2)
    };
  }

  return null;
}

// ---------------- 24/7 BTC LIVE FEED (15M OHLC CANDLES) ----------------
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
            // Exclude currently forming candle; use completed candles
            const candles = raw.slice(0, -1).map(c => ({
              time: c[0],
              open: parseFloat(c[1]),
              high: parseFloat(c[2]),
              low: parseFloat(c[3]),
              close: parseFloat(c[4])
            }));
            const livePrice = parseFloat(raw[raw.length - 1][4]);
            resolve({ candles, livePrice });
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

// ---------------- SCANNER LOOP ----------------
async function runScanner() {
  try {
    const btcData = await fetchBtcCandles();
    if (btcData && btcData.candles && btcData.candles.length >= 5) {
      const tradeSetup = detectPatterns(btcData.candles);
      const formattedPrice = btcData.livePrice.toLocaleString('en-US', { minimumFractionDigits: 2 });

      if (tradeSetup) {
        latestBtcSetup = tradeSetup;
        console.log(`🚨 [BTC ALERT]: ${tradeSetup.pattern} -> ${tradeSetup.signal}`);
        await broadcastPush(JSON.stringify({
          title: `🚨 BTC/USD ${tradeSetup.signal} Alert`,
          body: `${tradeSetup.pattern}\nEntry: $${tradeSetup.entry.toFixed(1)} | SL: $${tradeSetup.stopLoss.toFixed(1)} | Target: $${tradeSetup.target.toFixed(1)}`,
          url: '/'
        }));
      } else {
        latestBtcSetup = {
          status: `Live Price: $${formattedPrice} | Scanning 15M Candles (No Reversal Pattern - NO TRADE)`
        };
      }
    }
  } catch (e) {
    console.error('Scan Error:', e.message);
  }
}

setInterval(runScanner, 15000);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`BTC/USD AI SCANNER ACTIVE (PORT ${PORT})`);
  console.log(`=================================`);
  runScanner();
});
