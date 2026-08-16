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

                <div id="confirmation">
                    5M Confirmation: Loading...
                </div>

            </div>


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

            </div>


            <div
                id="notification"
                class="result-card"
            >

                🔔 Waiting for crossover...

            </div>


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

    const confirmation =
        document.getElementById(
            "confirmation"
        );

    const signal =
        document.getElementById(
            "signal"
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


    // ======================================
    // PRICE
    // ======================================

    if (price) {

        price.textContent =
            "Price: $" +
            Number(data.price)
                .toLocaleString();

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
    // CONFIRMATION
    // ======================================

    if (confirmation) {

        confirmation.textContent =
            "5M Confirmation: " +
            data.confirmation;

    }


    // ======================================
    // FINAL SIGNAL
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
    // SUPPORT
    // ======================================

    if (support) {

        support.textContent =
            "Support: $" +
            Number(data.support)
                .toLocaleString();

    }


    // ======================================
    // RESISTANCE
    // ======================================

    if (resistance) {

        resistance.textContent =
            "Resistance: $" +
            Number(data.resistance)
                .toLocaleString();

    }


    // ======================================
    // REASON
    // ======================================

    if (reason) {

        if (data.signal === "BUY") {

            reason.textContent =
                "Reason: 4H + 1H bullish and 5M/30M EMA structure confirms BUY.";

        }

        else if (data.signal === "SELL") {

            reason.textContent =
                "Reason: 4H + 1H bearish and 5M/30M EMA structure confirms SELL.";

        }

        else {

            reason.textContent =
                "Reason: Timeframes are not fully aligned.";

        }

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
    "Backend:",
    API_BASE_URL
);

console.log(
    "Auto refresh: 30 seconds"
);

console.log(
    "================================="
);
