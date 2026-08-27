// ==========================================
// LIVE BTC/USD AI TRADING ASSISTANT
// PUSH NOTIFICATION + SOUND
// ==========================================

const API_BASE_URL = window.location.origin;

let previousCrossover = "NONE";
let pushSetupDone = false;

// ==========================================
// SETUP PUSH NOTIFICATIONS
// ==========================================
async function setupPushNotifications() {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      showNotificationStatus("⚠️ Push notifications not supported in this browser.");
      return;
    }

    const registration = await navigator.serviceWorker.register("/sw.js");
    console.log("SERVICE WORKER REGISTERED");

    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }

    if (permission !== "granted") {
      showNotificationStatus("⚠️ Notification permission is not enabled. Tap browser lock icon to allow.");
      return;
    }

    const keyResponse = await fetch(`${API_BASE_URL}/push-public-key`);
    const keyData = await keyResponse.json();

    if (!keyResponse.ok || !keyData.success || !keyData.publicKey) {
      throw new Error(keyData.error || "VAPID public key unavailable.");
    }

    const applicationServerKey = urlBase64ToUint8Array(keyData.publicKey);
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey
      });
    }

    const subscribeResponse = await fetch(`${API_BASE_URL}/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription)
    });

    const subscribeData = await subscribeResponse.json();
    if (!subscribeResponse.ok || !subscribeData.success) {
      throw new Error(subscribeData.error || "Subscription failed.");
    }

    pushSetupDone = true;
    console.log("PUSH NOTIFICATION READY");
    showNotificationStatus("🔔 Phone notifications are ENABLED & Monitoring.");
  } catch (error) {
    console.error("PUSH SETUP ERROR:", error);
    showNotificationStatus("⚠️ Push notification setup failed: " + error.message);
  }
}

// ==========================================
// TEST NOTIFICATION BUTTON TRIGGER
// ==========================================
async function testPhonePush() {
  try {
    const res = await fetch(`${API_BASE_URL}/test-notification`, { method: "POST" });
    const data = await res.json();
    if (data.success) {
      alert("✅ Test push triggered! Check your phone tray.");
    } else {
      alert("❌ Error: " + (data.error || "Failed to send"));
    }
  } catch (err) {
    alert("❌ Network Error: " + err.message);
  }
}

// ==========================================
// BASE64 → UINT8 ARRAY
// ==========================================
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ==========================================
// NOTIFICATION STATUS
// ==========================================
function showNotificationStatus(message) {
  const notification = document.getElementById("notification");
  if (notification) {
    notification.textContent = message;
  }
}

// ==========================================
// LIVE ANALYSIS
// ==========================================
async function getLiveAnalysis() {
  try {
    const response = await fetch(`${API_BASE_URL}/live-analysis`);
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Live analysis failed.");
    }

    displayLiveAnalysis(data);
  } catch (error) {
    console.error("LIVE ANALYSIS ERROR:", error);
    const signal = document.getElementById("signal");
    if (signal) signal.textContent = "Signal: Connection error";

    const notification = document.getElementById("notification");
    if (notification) notification.textContent = "❌ Server connection failed. Retrying...";
  }
}

// ==========================================
// DISPLAY LIVE DATA
// ==========================================
function displayLiveAnalysis(data) {
  const price = document.getElementById("livePrice");
  const updated = document.getElementById("updated");
  const trend4h = document.getElementById("trend4h");
  const trend1h = document.getElementById("trend1h");
  const crossover = document.getElementById("crossover");
  const signal = document.getElementById("signal");
  const entry = document.getElementById("entry");
  const stoploss = document.getElementById("stoploss");
  const target = document.getElementById("target");
  const rr = document.getElementById("rr");
  const support = document.getElementById("support");
  const resistance = document.getElementById("resistance");
  const reason = document.getElementById("signalReason");
  const futureTrigger = document.getElementById("futureTrigger");

  if (price) {
    price.textContent = `Price: $${Number(data.price).toLocaleString()}`;
  }

  if (updated) {
    updated.textContent = `Updated: ${new Date(data.updatedAt).toLocaleTimeString()}`;
  }

  if (trend4h) {
    trend4h.textContent = `4H Trend: ${data.trend4h}`;
  }

  if (trend1h) {
    trend1h.textContent = `1H Trend: ${data.trend1h}`;
  }

  if (crossover) {
    crossover.textContent = `30M Crossover: ${data.crossover}`;
  }

  if (signal) {
    signal.className = "result-row";
    signal.textContent = `Signal: ${data.signal}`;

    if (data.signal === "BUY") {
      signal.classList.add("buy");
    } else if (data.signal === "SELL") {
      signal.classList.add("sell");
    } else {
      signal.classList.add("no-trade");
    }
  }

  if (entry) {
    entry.textContent = data.entry !== null && data.entry !== undefined
      ? `Entry: $${Number(data.entry).toLocaleString()}`
      : "Entry: -";
  }

  if (stoploss) {
    stoploss.textContent = data.stopLoss !== null && data.stopLoss !== undefined
      ? `Stop Loss: $${Number(data.stopLoss).toLocaleString()}`
      : "Stop Loss: -";
  }

  if (target) {
    target.textContent = data.target !== null && data.target !== undefined
      ? `Target: $${Number(data.target).toLocaleString()}`
      : "Target: -";
  }

  if (rr) {
    rr.textContent = data.riskReward ? `Risk Reward: ${data.riskReward}` : "Risk Reward: -";
  }

  if (support) {
    support.textContent = data.support !== null && data.support !== undefined
      ? `Support: $${Number(data.support).toLocaleString()}`
      : "Support: -";
  }

  if (resistance) {
    resistance.textContent = data.resistance !== null && data.resistance !== undefined
      ? `Resistance: $${Number(data.resistance).toLocaleString()}`
      : "Resistance: -";
  }

  if (reason) {
    reason.textContent = `Reason: ${data.predictionReason || "Timeframes are not fully aligned."}`;
  }

  if (futureTrigger) {
    futureTrigger.textContent = `Future Trigger: ${data.futureTrigger || "NO TRADE"}`;
  }

  handleCrossoverNotification(data.crossover);
}

// ==========================================
// CROSSOVER NOTIFICATION
// ==========================================
function handleCrossoverNotification(crossover) {
  const notification = document.getElementById("notification");
  if (!notification) return;

  if (crossover === "BULLISH" && previousCrossover !== "BULLISH") {
    notification.textContent = "🟢 BUY ALERT — EMA9 crossed ABOVE EMA26!";
    notification.className = "result-card buy";
    playAlert();
  } else if (crossover === "BEARISH" && previousCrossover !== "BEARISH") {
    notification.textContent = "🔴 SELL ALERT — EMA9 crossed BELOW EMA26!";
    notification.className = "result-card sell";
    playAlert();
  } else if (crossover === "NONE") {
    notification.className = "result-card";
    notification.textContent = pushSetupDone
      ? "🔔 Monitoring 30M EMA9 / EMA26 crossover..."
      : "🔔 Monitoring crossover...";
  }

  previousCrossover = crossover;
}

// ==========================================
// SOUND ALERT (TAB OPEN)
// ==========================================
function playAlert() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch (error) {
    console.log("Foreground audio alert unavailable:", error);
  }
}

// ==========================================
// INITIALIZE
// ==========================================
window.addEventListener("DOMContentLoaded", () => {
  setupPushNotifications();
  getLiveAnalysis();
  setInterval(getLiveAnalysis, 30000);
});
