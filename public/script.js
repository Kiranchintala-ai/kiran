// ==========================================
// LIVE BTC/USD AI TRADING ASSISTANT
// ==========================================

const API_BASE_URL =
    "https://kiran-ai-server.onrender.com";

let previousCrossover = "NONE";
let firstLoad = true;


// ==========================================
// PAGE ELEMENTS
// ==========================================

const result =
    document.getElementById("result");


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

            <!-- ========================== -->
            <!-- BTC PRICE -->
            <!-- ========================== -->

            <div class="result-card">

                <h2>₿ BTC/USD</h2>

                <div id="livePrice">
                    Price: Loading...
                </div>

                <div id="updated">
                    Updated: -
                </div>

            </div>


            <!-- ========================== -->
            <!-- MARKET TREND -->
            <!-- ========================== -->

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


            <!-- ========================== -->
            <!-- TRADING DECISION -->
            <!-- ========================== -->

            <div
                id="liveSignal"
                class="result-card"
            >

                <h2>🎯 Trading Decision</h2>

                <div
                    id="signal"
                    class="result-row"
                >
                    Signal: Loading...
                </div>

                <div
                    id="entry"
                    class="result-row"
                >
                    Entry: -
                </div>

                <div
                    id="stoploss"
                    class="result-row"
                >
                    Stop Loss: -
                </div>

                <div
                    id="target"
                    class="result-row"
                >
                    Target: -
                </div>

                <div
                    id="rr"
                    class="result-row"
                >
                    Risk Reward: -
                </div>

                <div
                    id="support"
                    class="result-row"
                >
                    Support: -
                </div>

                <div
                    id="resistance"
                    class="result-row"
                >
                    Resistance: -
                </div>

                <div
                    id="signalReason"
                    class="result-row"
                >
                    Reason: -
                </div>

                <div
                    id="futureTrigger"
                    class="result-row"
                >
                    Future Trigger: -
                </div>

            </div>


            <!-- ========================== -->
            <!-- NOTIFICATION -->
            <!-- ========================== -->

            <div
                id="notification"
                class="result-card"
            >

                🔔 Waiting for crossover...

            </div>


            <!-- ========================== -->
            <!-- REFRESH -->
            <!-- ========================== -->

            <button
                onclick="getLiveAnalysis()"
                class="analyze-btn"
            >
                🔄 Refresh Now
            </button>

        </div>

    `;

}


// ==========================================
// GET LIVE ANALYSIS
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
                "Live analysis failed"
            );

        }


        displayLiveAnalysis(data);


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
                "❌ Server connection failed";

        }

    }

}


// ==========================================
// DISPLAY LIVE DATA
// ==========================================

function displayLiveAnalysis(data) {

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
    // UPDATED TIME
    // ======================================

    if (updated) {

        updated.textContent =
            "Updated: " +
            new Date(
                data.updatedAt
            ).toLocaleTimeString();

    }


    // ======================================
    // 4H TREND
    // ======================================

    if (trend4h) {

        trend4h.textContent =
            "4H Trend: " +
            data.trend4h;

    }


    // ======================================
    // 1H TREND
    // ======================================

    if (trend1h) {

        trend1h.textContent =
            "1H Trend: " +
            data.trend1h;

    }


    // ======================================
    // 30M CROSSOVER
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
    // CROSSOVER NOTIFICATION
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


    // --------------------------------------
    // FIRST LOAD
    // --------------------------------------

    if (firstLoad) {

        previousCrossover =
            crossover;

        firstLoad = false;

        notification.textContent =
            "🔔 Monitoring 30M EMA9 / EMA26 crossover...";

        return;

    }


    // --------------------------------------
    // NEW BULLISH CROSSOVER
    // --------------------------------------

    if (
        crossover === "BULLISH" &&
        previousCrossover !== "BULLISH"
    ) {

        notification.textContent =
            "🟢 BUY ALERT — EMA9 crossed ABOVE EMA26!";

        notification.className =
            "result-card buy";


        playAlert();

    }


    // --------------------------------------
    // NEW BEARISH CROSSOVER
    // --------------------------------------

    else if (
        crossover === "BEARISH" &&
        previousCrossover !== "BEARISH"
    ) {

        notification.textContent =
            "🔴 SELL ALERT — EMA9 crossed BELOW EMA26!";

        notification.className =
            "result-card sell";


        playAlert();

    }


    // --------------------------------------
    // NO NEW CROSSOVER
    // --------------------------------------

    else {

        notification.className =
            "result-card";

    }


    previousCrossover =
        crossover;

}


// ==========================================
// SOUND ALERT
// ==========================================

function playAlert() {

    try {

        const audioContext =
            new (
                window.AudioContext ||
                window.webkitAudioContext
            )();


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


        oscillator.frequency.value =
            800;


        gain.gain.value =
            0.15;


        oscillator.start();


        setTimeout(
            () => {

                oscillator.stop();

            },
            500
        );


    } catch (error) {

        console.log(
            "Audio alert unavailable"
        );

    }

}


// ==========================================
// CREATE UI
// ==========================================

createLiveUI();


// ==========================================
// FIRST REQUEST
// ==========================================

getLiveAnalysis();


// ==========================================
// AUTO REFRESH
// ==========================================

// Refresh every 30 seconds.

setInterval(
    getLiveAnalysis,
    30000
);


// ==========================================
// STARTUP MESSAGE
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
    "Backend:",
    API_BASE_URL
);

console.log(
    "Auto refresh: 30 seconds"
);

console.log(
    "================================="
);
