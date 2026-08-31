// ==========================================
// TOP 5 CANDLESTICK SCANNER FRONTEND
// ==========================================

const API_BASE_URL = window.location.origin;
let previousSignal = "NO TRADE";
let previousPattern = "";
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
      showNotificationStatus("⚠️ Notification permission not enabled. Allow notifications in browser settings.");
      return;
    }

    const keyResponse = await fetch(`${API_BASE_URL}/push-public-key`);
    const keyData = await keyResponse.json();

    if (!keyResponse.ok || !keyData.success || !keyData.publicKey) {
      throw new Error(keyData.error || "VAPID key unavailable.");
    }

    const applicationServerKey = urlBase64ToUint8Array(keyData.publicKey);
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey
      });
    }

    // Register with server
    const subscribeResponse = await fetch(`${API_BASE_URL}/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription)
    });

    const subscribeData = await subscribeResponse.json();
    if (!subscribeResponse.ok || !subscribeData.success) {
      throw new Error(subscribeData.error || "Subscription save failed.");
    }

    pushSetupDone = true;
    console.log("PUSH NOTIFICATION READY");
    showNotificationStatus("🔔 Phone alerts ACTIVE: Scanning 5 Patterns...");
  } catch (error) {
    console.error("PUSH SETUP ERROR:", error);
    showNotificationStatus("⚠️ Setup info: " + error.message);
  }
}

// ==========================================
// TEST PUSH TRIGGER
// ==========================================
async function testPhonePush() {
  try {
    const res = await fetch(`${API_BASE_URL}/test-notification`, { method: "POST" });
    const data = await res.json();
    if (data.success) {
      alert("✅ Test push sent! Check phone notification bar.");
    } else {
      alert("❌ Error: " + (data.error || "Failed to send"));
    }
  } catch (err) {
    alert("❌ Network Error: " + err.message);
  }
}

// ==========================================
// BASE64 CONVERTER
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
// STATUS DISPLAY
// ==========================================
function showNotificationStatus(message) {
  const notification = document.getElementById("notification");
  if (notification) {
    notification.textContent = message;
  }
}

// ==========================================
// LIVE FETCH ANALYSIS
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
    console.error("ANALYSIS ERROR:", error);
    const signal = document.getElementById("signal");
    if (signal) signal.textContent = "Signal: Connection Error";

    const notification = document.getElementById("notification");
    if (notification) notification.textContent = "❌ Server reconnecting...";
  }
}

// ==========================================
// RENDER DATA TO UI
// ==========================================
function displayLiveAnalysis(data) {
  const price = document.getElementById("livePrice");
  const updated = document.getElementById("updated");
  const trend1h = document.getElementById("trend1h");
  const activePattern = document.getElementById("activePattern");
  const signal = document.getElementById("signal");
  const entry = document.getElementById("entry");
  const stoploss = document.getElementById("stoploss");
  const target = document.getElementById("target");
  const rr = document.getElementById("rr");
  const reason = document.getElementById("signalReason");
  const futureTrigger = document.getElementById("futureTrigger");

  if (price) price.textContent = `Price: $${Number(data.price).toLocaleString()}`;
  if (updated) updated.textContent = `Updated: ${new Date(data.updatedAt).toLocaleTimeString()}`;
  if (trend1h) trend1h.textContent = `1H Trend: ${data.trend1h || 'NEUTRAL'}`;
  if (activePattern) activePattern.textContent = `Detected Pattern: ${data.pattern || 'Scanning 15M candles...'}`;

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

  if (rr) rr.textContent = data.riskReward ? `Risk Reward: ${data.riskReward}` : "Risk Reward: 1:2.0";
  if (reason) reason.textContent = `Pattern Detail: ${data.predictionReason || "Scanning for 5 High-Probability Patterns."}`;
  if (futureTrigger) futureTrigger.textContent = `Execution: ${data.futureTrigger || "Waiting for valid pattern close."}`;

  handlePatternNotification(data);
}

// ==========================================
// LOCAL NOTIFICATION & SOUND
// ==========================================
function handlePatternNotification(data) {
  const notification = document.getElementById("notification");
  if (!notification) return;

  if (data.signal !== "NO TRADE" && (data.signal !== previousSignal || data.pattern !== previousPattern)) {
    notification.textContent = `🚨 ${data.signal} ALERT: ${data.pattern}!`;
    notification.className = data.signal === "BUY" ? "result-card buy" : "result-card sell";
    playAlertSound();
  } else if (data.signal === "NO TRADE") {
    notification.className = "result-card";
    notification.textContent = pushSetupDone
      ? "🔔 Phone alerts ACTIVE: Scanning 5 Patterns..."
      : "🔔 Scanner Running...";
  }

  previousSignal = data.signal;
  previousPattern = data.pattern;
}

// ==========================================
// SOUND SYNTHESIZER
// ==========================================
function playAlertSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.2);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (err) {
    console.log("Audio not supported:", err);
  }
}

// ==========================================
// INITIALIZE
// ==========================================
window.addEventListener("DOMContentLoaded", () => {
  setupPushNotifications();
  getLiveAnalysis();
  setInterval(getLiveAnalysis, 30000); // 30s live refresh
});
