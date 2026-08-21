// ==========================================
// LIVE BTC/USD AI TRADING ASSISTANT
// PUSH NOTIFICATION + SOUND
// ==========================================

const API_BASE_URL =
    "https://kiran-ai-server.onrender.com";

let previousCrossover = "NONE";
let firstLoad = true;
let pushSetupDone = false;


// ==========================================
// CREATE LIVE UI
// ==========================================

function createLiveUI() {

    document.body.innerHTML = `

        <div class="container">

            <h1>📈 AI Trading Assistant</h1>

            <p class="subtitle">
                Live BTC/USD EMA9 + EMA26 Analysis
            </p>

            <div class="result-card">

                <h2>₿ BTC/USD</h2>

                <div id="livePrice">
                    Price: Loading...
                </div>

                <div id="updated">
                    Updated: -
                </div>

            </div>


            <div class="result-card">

                <h2>📊 Market Trend</h2>

                <div id="trend4h">
                    4H Trend: Loading...
                </div>

                <div id="trend1h">
                    1H Trend: Loading...
                </div>

                <div id="crossover">
                    30M Crossover: Loading...
                </div>

            </div>


            <div id="liveSignal" class="result-card">

                <h2>🎯 Trading Decision</h2>

                <div id="signal" class="result-row">
                    Signal: Loading...
                </div>

                <div id="entry" class="result-row">
                    Entry: -
                </div>

                <div id="stoploss" class="result-row">
                    Stop Loss: -
                </div>

                <div id="target" class="result-row">
                    Target: -
                </div>

                <div id="rr" class="result-row">
                    Risk Reward: -
                </div>

                <div id="support" class="result-row">
                    Support: -
                </div>

                <div id="resistance" class="result-row">
                    Resistance: -
                </div>

                <div id="signalReason" class="result-row">
                    Reason: -
                </div>

                <div id="futureTrigger" class="result-row">
                    Future Trigger: -
                </div>

            </div>


            <div id="notification" class="result-card">

                🔔 Setting up notifications...

            </div>


            <button
                id="refreshButton"
                class="analyze-btn"
            >
                🔄 Refresh Now
            </button>

        </div>

    `;

    const button =
        document.getElementById(
            "refreshButton"
        );

    if (button) {

        button.addEventListener(
            "click",
            getLiveAnalysis
        );

    }

}


// ==========================================
// SETUP PUSH NOTIFICATIONS
// ==========================================

async function setupPushNotifications() {

    try {

        if (
            !("serviceWorker" in navigator)
        ) {

            console.log(
                "Service Worker not supported."
            );

            return;

        }


        if (
            !("PushManager" in window)
        ) {

            console.log(
                "Push notifications not supported."
            );

            return;

        }


        if (
            !("Notification" in window)
        ) {

            console.log(
                "Browser notifications not supported."
            );

            return;

        }


        // ----------------------------------
        // REGISTER SERVICE WORKER
        // ----------------------------------

        const registration =
            await navigator.serviceWorker.register(
                "/sw.js"
            );

        console.log(
            "SERVICE WORKER REGISTERED"
        );


        // ----------------------------------
        // ASK NOTIFICATION PERMISSION
        // ----------------------------------

        let permission =
            Notification.permission;


        if (
            permission === "default"
        ) {

            permission =
                await Notification.requestPermission();

        }


        if (
            permission !== "granted"
        ) {

            console.log(
                "Notification permission denied."
            );

            showNotificationStatus(
                "⚠️ Notification permission is not enabled."
            );

            return;

        }


        // ----------------------------------
        // GET VAPID PUBLIC KEY
        // ----------------------------------

        const keyResponse =
            await fetch(
                API_BASE_URL +
                "/push-public-key"
            );


        const keyData =
            await keyResponse.json();


        if (
            !keyResponse.ok ||
            !keyData.success ||
            !keyData.publicKey
        ) {

            throw new Error(
                keyData.error ||
                "VAPID public key unavailable."
            );

        }


        // ----------------------------------
        // CONVERT VAPID KEY
        // ----------------------------------

        const applicationServerKey =
            urlBase64ToUint8Array(
                keyData.publicKey
            );


        // ----------------------------------
        // GET EXISTING SUBSCRIPTION
        // ----------------------------------

        let subscription =
            await registration.pushManager.getSubscription();


        // ----------------------------------
        // CREATE SUBSCRIPTION
        // ----------------------------------

        if (!subscription) {

            subscription =
                await registration.pushManager.subscribe({

                    userVisibleOnly:
                        true,

                    applicationServerKey:
                        applicationServerKey

                });

        }


        // ----------------------------------
        // SEND SUBSCRIPTION TO SERVER
        // ----------------------------------

        const subscribeResponse =
            await fetch(
                API_BASE_URL +
                "/subscribe",
                {

                    method:
                        "POST",

                    headers: {

                        "Content-Type":
                            "application/json"

                    },

                    body:
                        JSON.stringify(
                            subscription
                        )

                }
            );


        const subscribeData =
            await subscribeResponse.json();


        if (
            !subscribeResponse.ok ||
            !subscribeData.success
        ) {

            throw new Error(
                subscribeData.error ||
                "Subscription failed."
            );

        }


        pushSetupDone = true;


        console.log(
            "PUSH NOTIFICATION READY"
        );


        showNotificationStatus(
            "🔔 Phone notifications are ENABLED."
        );


    } catch (error) {

        console.error(
            "PUSH SETUP ERROR:",
            error
        );


        showNotificationStatus(
            "⚠️ Push notification setup failed."
        );

    }

}


// ==========================================
// BASE64 → UINT8 ARRAY
// ==========================================

function urlBase64ToUint8Array(
    base64String
) {

    const padding =
        "=".repeat(
            (4 - base64String.length % 4) % 4
        );

    const base64 =
        (
            base64String +
            padding
        )
        .replace(
            /-/g,
            "+"
        )
        .replace(
            /_/g,
            "/"
        );


    const rawData =
        window.atob(
            base64
        );


    const outputArray =
        new Uint8Array(
            rawData.length
        );


    for (
        let i = 0;
        i < rawData.length;
        ++i
    ) {

        outputArray[i] =
            rawData.charCodeAt(i);

    }


    return outputArray;

}


// ==========================================
// NOTIFICATION STATUS
// ==========================================

function showNotificationStatus(
    message
) {

    const notification =
        document.getElementById(
            "notification"
        );


    if (!notification) {
        return;
    }


    notification.textContent =
        message;

}


// ==========================================
// LIVE ANALYSIS
// ==========================================

async function getLiveAnalysis() {

    try {

        const response =
            await fetch(
                API_BASE_URL +
                "/live-analysis"
            );


        const data =
            await response.json();


        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.error ||
                "Live analysis failed."
            );

        }


        displayLiveAnalysis(
            data
        );


    } catch (error) {

        console.error(
            "LIVE ANALYSIS ERROR:",
            error
        );


        const signal =
            document.getElementById(
                "signal"
            );


        if (signal) {

            signal.textContent =
                "❌ Connection error";

        }


        const notification =
            document.getElementById(
                "notification"
            );


        if (notification) {

            notification.textContent =
                "❌ Server connection failed.";

        }

    }

}


// ==========================================
// DISPLAY LIVE DATA
// ==========================================

function displayLiveAnalysis(
    data
) {

    const price =
        document.getElementById(
            "livePrice"
        );

    const updated =
        document.getElementById(
            "updated"
        );

    const trend4h =
        document.getElementById(
            "trend4h"
        );

    const trend1h =
        document.getElementById(
            "trend1h"
        );

    const crossover =
        document.getElementById(
            "crossover"
        );

    const signal =
        document.getElementById(
            "signal"
        );

    const entry =
        document.getElementById(
            "entry"
        );

    const stoploss =
        document.getElementById(
            "stoploss"
        );

    const target =
        document.getElementById(
            "target"
        );

    const rr =
        document.getElementById(
            "rr"
        );

    const support =
        document.getElementById(
            "support"
        );

    const resistance =
        document.getElementById(
            "resistance"
        );

    const reason =
        document.getElementById(
            "signalReason"
        );

    const futureTrigger =
        document.getElementById(
            "futureTrigger"
        );


    // ======================================
    // PRICE
    // ======================================

    if (price) {

        price.textContent =
            "Price: $" +
            Number(
                data.price
            ).toLocaleString();

    }


    // ======================================
    // UPDATED
    // ======================================

    if (updated) {

        updated.textContent =
            "Updated: " +
            new Date(
                data.updatedAt
            ).toLocaleTimeString();

    }


    // ======================================
    // TRENDS
    // ======================================

    if (trend4h) {

        trend4h.textContent =
            "4H Trend: " +
            data.trend4h;

    }


    if (trend1h) {

        trend1h.textContent =
            "1H Trend: " +
            data.trend1h;

    }


    // ======================================
    // CROSSOVER
    // ======================================

    if (crossover) {

        crossover.textContent =
            "30M Crossover: " +
            data.crossover;

    }


    // ======================================
    // SIGNAL
    // ======================================

    if (signal) {

        signal.classList.remove(
            "buy",
            "sell",
            "no-trade"
        );


        signal.textContent =
            "Signal: " +
            data.signal;


        if (
            data.signal === "BUY"
        ) {

            signal.classList.add(
                "buy"
            );

        }

        else if (
            data.signal === "SELL"
        ) {

            signal.classList.add(
                "sell"
            );

        }

        else {

            signal.classList.add(
                "no-trade"
            );

        }

    }


    // ======================================
    // ENTRY
    // ======================================

    if (entry) {

        entry.textContent =
            data.entry !== null &&
            data.entry !== undefined
                ? "Entry: $" +
                  Number(
                      data.entry
                  ).toLocaleString()
                : "Entry: -";

    }


    // ======================================
    // STOP LOSS
    // ======================================

    if (stoploss) {

        stoploss.textContent =
            data.stopLoss !== null &&
            data.stopLoss !== undefined
                ? "Stop Loss: $" +
                  Number(
                      data.stopLoss
                  ).toLocaleString()
                : "Stop Loss: -";

    }


    // ======================================
    // TARGET
    // ======================================

    if (target) {

        target.textContent =
            data.target !== null &&
            data.target !== undefined
                ? "Target: $" +
                  Number(
                      data.target
                  ).toLocaleString()
                : "Target: -";

    }


    // ======================================
    // RISK REWARD
    // ======================================

    if (rr) {

        rr.textContent =
            data.riskReward
                ? "Risk Reward: " +
                  data.riskReward
                : "Risk Reward: -";

    }


    // ======================================
    // SUPPORT
    // ======================================

    if (support) {

        support.textContent =
            data.support !== null &&
            data.support !== undefined
                ? "Support: $" +
                  Number(
                      data.support
                  ).toLocaleString()
                : "Support: -";

    }


    // ======================================
    // RESISTANCE
    // ======================================

    if (resistance) {

        resistance.textContent =
            data.resistance !== null &&
            data.resistance !== undefined
                ? "Resistance: $" +
                  Number(
                      data.resistance
                  ).toLocaleString()
                : "Resistance: -";

    }


    // ======================================
    // REASON
    // ======================================

    if (reason) {

        reason.textContent =
            "Reason: " +
            (
                data.predictionReason ||
                "Timeframes are not fully aligned."
            );

    }


    // ======================================
    // FUTURE TRIGGER
    // ======================================

    if (futureTrigger) {

        futureTrigger.textContent =
            "Future Trigger: " +
            (
                data.futureTrigger ||
                "NO TRADE"
            );

    }


    // ======================================
    // CROSSOVER ALERT
    // ======================================

    handleCrossoverNotification(
        data.crossover
    );

}


// ==========================================
// CROSSOVER NOTIFICATION
// ==========================================

function handleCrossoverNotification(
    crossover
) {

    const notification =
        document.getElementById(
            "notification"
        );


    if (!notification) {
        return;
    }


    // ======================================
    // FIRST LOAD
    // ======================================

    if (firstLoad) {

        previousCrossover =
            crossover;

        firstLoad =
            false;

        notification.textContent =
            pushSetupDone
                ? "🔔 Monitoring 30M EMA9 / EMA26 crossover..."
                : "🔔 Monitoring crossover...";

        return;

    }


    // ======================================
    // BULLISH
    // ======================================

    if (
        crossover === "BULLISH" &&
        previousCrossover !== "BULLISH"
    ) {

        notification.textContent =
            "🟢 BUY ALERT — EMA9 crossed ABOVE EMA26!";

        notification.className =
            "result-card buy";


        playAlert();


        showBrowserNotification(
            "🟢 BTC/USD BUY ALERT",
            "30M EMA9 crossed ABOVE EMA26!"
        );

    }


    // ======================================
    // BEARISH
    // ======================================

    else if (
        crossover === "BEARISH" &&
        previousCrossover !== "BEARISH"
    ) {

        notification.textContent =
            "🔴 SELL ALERT — EMA9 crossed BELOW EMA26!";

        notification.className =
            "result-card sell";


        playAlert();


        showBrowserNotification(
            "🔴 BTC/USD SELL ALERT",
            "30M EMA9 crossed BELOW EMA26!"
        );

    }


    // ======================================
    // NO NEW CROSSOVER
    // ======================================

    else {

        notification.className =
            "result-card";

    }


    previousCrossover =
        crossover;

}


// ==========================================
// BROWSER NOTIFICATION
// ==========================================

function showBrowserNotification(
    title,
    body
) {

    if (
        !("Notification" in window)
    ) {

        return;

    }


    if (
        Notification.permission !==
        "granted"
    ) {

        return;

    }


    try {

        new Notification(
            title,
            {
                body: body,
                requireInteraction: true
            }
        );

    } catch (error) {

        console.log(
            "Browser notification unavailable."
        );

    }

}


// ==========================================
// SOUND ALERT
// ==========================================

function playAlert() {

    try {

        const AudioContext =
            window.AudioContext ||
            window.webkitAudioContext;


        if (!AudioContext) {

            return;

        }


        const audioContext =
            new AudioContext();


        const oscillator =
            audioContext.createOscillator();


        const gain =
            audioContext.createGain();


        oscillator.connect(
            gain
        );


        gain.connect(
            audioContext.destination
        );


        oscillator.type =
            "sine";


        oscillator.frequency.value =
            900;


        gain.gain.value =
            0.2;


        oscillator.start();


        setTimeout(
            function () {

                oscillator.stop();

                audioContext.close();

            },
            700
        );


    } catch (error) {

        console.log(
            "Audio alert unavailable:",
            error
        );

    }

}


// ==========================================
// CREATE UI
// ==========================================

createLiveUI();


// ==========================================
// START PUSH SETUP
// ==========================================

setupPushNotifications();


// ==========================================
// FIRST ANALYSIS
// ==========================================

getLiveAnalysis();


// ==========================================
// AUTO REFRESH
// ==========================================

setInterval(
    getLiveAnalysis,
    30000
);


// ==========================================
// STARTUP LOG
// ==========================================

console.log(
    "================================="
);

console.log(
    "LIVE BTC/USD TRADING ASSISTANT"
);

console.log(
    "EMA9 + EMA26"
);

console.log(
    "Timeframes: 4H + 1H + 30M"
);

console.log(
    "5M: COMPLETELY DISABLED"
);

console.log(
    "Push notifications: ENABLED"
);

console.log(
    "Auto refresh: 30 seconds"
);

console.log(
    "Backend:",
    API_BASE_URL
);

console.log(
    "================================="
);
