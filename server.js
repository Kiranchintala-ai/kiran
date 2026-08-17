require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { GoogleGenAI } = require("@google/genai");

const app = express();

// =====================================
// CONFIG
// =====================================

const PORT = process.env.PORT || 3000;

const MODEL = "gemini-3.6-flash";

const DELTA_API =
    "https://api.india.delta.exchange/v2/history/candles";

const SYMBOL = "BTCUSD";

// =====================================
// MIDDLEWARE
// =====================================

app.use(cors());

app.use(
    express.json({
        limit: "30mb"
    })
);

// =====================================
// GEMINI
// =====================================

if (!process.env.GEMINI_API_KEY) {
    console.error("ERROR: GEMINI_API_KEY is missing.");
    process.exit(1);
}

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

// =====================================
// FRONTEND
// =====================================

const publicFolder =
    path.join(__dirname, "public");

if (fs.existsSync(publicFolder)) {
    app.use(express.static(publicFolder));
}

// =====================================
// HOME
// =====================================

app.get("/", (req, res) => {

    const indexPath =
        path.join(
            publicFolder,
            "index.html"
        );

    if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
    }

    res.send(
        "AI Trading Server Running"
    );
});

// =====================================
// HEALTH
// =====================================

app.get("/health", (req, res) => {

    res.json({
        success: true,
        message:
            "AI Trading Server is running",
        model: MODEL,
        time:
            new Date().toISOString()
    });

});

// =====================================
// TEST AI
// =====================================

app.get("/test-ai", async (req, res) => {

    try {

        const response =
            await ai.models.generateContent({

                model: MODEL,

                contents:
                    "Reply with only one word: SUCCESS"

            });

        res.json({

            success: true,

            reply:
                response.text || "SUCCESS"

        });

    } catch (error) {

        console.error(
            "TEST AI ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            error:
                error.message

        });

    }

});

// =====================================
// IMAGE CLEANER
// =====================================

function cleanBase64(image) {

    if (
        typeof image !== "string"
    ) {
        return image;
    }

    return image.replace(
        /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
        ""
    );

}

// =====================================
// VALUE EXTRACTOR
// =====================================

function getValue(text, label) {

    const escapedLabel =
        label.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );

    const regex =
        new RegExp(
            "^\\s*" +
            escapedLabel +
            "\\s*:\\s*(.+)$",
            "im"
        );

    const match =
        text.match(regex);

    return match
        ? match[1].trim()
        : "-";

}

// =====================================
// IMAGE ANALYSIS
// =====================================

app.post("/analyze", async (req, res) => {

    try {

        const {
            image1H,
            image30M
        } = req.body;

        if (
            !image1H ||
            !image30M
        ) {

            return res.status(400).json({

                success: false,

                error:
                    "Please upload both 1H and 30M charts."

            });

        }

        const chart1H =
            cleanBase64(image1H);

        const chart30M =
            cleanBase64(image30M);

        const prompt = `

You are a disciplined BTC/USD technical analysis assistant.

The user supplied two TradingView BTC/USD charts.

1H = higher timeframe direction
30M = primary setup and entry timeframe

Analyze ONLY the supplied charts.

Do NOT force a trade.

The final signal must be exactly:

BUY
SELL
NO TRADE

Use:

1H:
- Overall trend
- Market structure
- Higher highs
- Higher lows
- Lower highs
- Lower lows
- Major support
- Major resistance

30M:
- EMA9
- EMA26
- Crossover
- Breakout
- Breakdown
- Retest
- Rejection
- Momentum
- Entry area
- Stop loss area
- Target area

Important rules:

1. Do NOT automatically choose BUY.
2. Do NOT automatically choose SELL.
3. If the setup is unclear, return NO TRADE.
4. If 1H and 30M conflict, return NO TRADE.
5. Do not invent prices.
6. Do not invent support or resistance.
7. Do not invent volume.
8. Risk Reward must be at least 1:2.
9. If Risk Reward is below 1:2, return NO TRADE.

Return ONLY:

Signal: BUY or SELL or NO TRADE
Entry: price or -
Stop Loss: price or -
Target: price or -
Risk Reward: 1:2 or better, or -
Reason: short reason

Do NOT return:

5M
Confidence
EMA values
Support
Resistance
Trend
Confirmation
Long explanations
Markdown
Tables
`;

        const response =
            await ai.models.generateContent({

                model: MODEL,

                contents: [

                    {
                        text:
                            "IMAGE 1 — 1H BTC/USD CHART"
                    },

                    {
                        inlineData: {

                            mimeType:
                                "image/png",

                            data:
                                chart1H

                        }

                    },

                    {
                        text:
                            "IMAGE 2 — 30M BTC/USD CHART"
                    },

                    {
                        inlineData: {

                            mimeType:
                                "image/png",

                            data:
                                chart30M

                        }

                    },

                    {
                        text:
                            prompt
                    }

                ]

            });

        const text =
            response.text || "";

        console.log("");
        console.log(
            "================================="
        );
        console.log(
            "AI IMAGE ANALYSIS"
        );
        console.log(
            "================================="
        );
        console.log(text);
        console.log(
            "================================="
        );

        res.json({

            success: true,

            signal:
                getValue(text, "Signal"),

            entry:
                getValue(text, "Entry"),

            stopLoss:
                getValue(text, "Stop Loss"),

            target:
                getValue(text, "Target"),

            riskReward:
                getValue(
                    text,
                    "Risk Reward"
                ),

            reason:
                getValue(text, "Reason"),

            raw:
                text

        });

    } catch (error) {

        console.error(
            "IMAGE ANALYSIS ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            error:
                error.message

        });

    }

});

// =====================================
// LIVE MARKET INTERVALS
// =====================================

const LIVE_INTERVALS = {

    "30m":
        30 * 60,

    "1h":
        60 * 60,

    "4h":
        4 * 60 * 60

};

// =====================================
// NORMALIZE CANDLE
// =====================================

function normalizeCandle(candle) {

    return {

        time:
            Number(candle.time),

        open:
            Number(candle.open),

        high:
            Number(candle.high),

        low:
            Number(candle.low),

        close:
            Number(candle.close)

    };

}

// =====================================
// GET RECENT CANDLES
// =====================================

async function getRecentCandles(
    resolution,
    count = 100
) {

    const interval =
        LIVE_INTERVALS[resolution];

    if (!interval) {

        throw new Error(
            `Unsupported resolution: ${resolution}`
        );

    }

    const now =
        Math.floor(
            Date.now() / 1000
        );

    const start =
        now -
        count * interval;

    const url =
        DELTA_API +
        `?resolution=${encodeURIComponent(resolution)}` +
        `&symbol=${encodeURIComponent(SYMBOL)}` +
        `&start=${start}` +
        `&end=${now}`;

    const response =
        await fetch(
            url,
            {
                headers: {
                    Accept:
                        "application/json"
                }
            }
        );

    if (!response.ok) {

        const errorText =
            await response.text();

        throw new Error(
            `${resolution} API error ${response.status}: ${errorText}`
        );

    }

    const data =
        await response.json();

    if (
        !Array.isArray(
            data.result
        )
    ) {

        throw new Error(
            `${resolution}: candle data unavailable`
        );

    }

    const candles =
        data.result
            .map(normalizeCandle)
            .sort(
                (a, b) =>
                    a.time - b.time
            );

    for (
        const candle of candles
    ) {

        candle.intervalSeconds =
            interval;

    }

    return candles;

}

// =====================================
// LAST CLOSED CANDLE
// =====================================

function getLastClosedCandle(
    candles
) {

    if (
        !candles ||
        candles.length === 0
    ) {

        return null;

    }

    const now =
        Math.floor(
            Date.now() / 1000
        );

    for (
        let i =
            candles.length - 1;
        i >= 0;
        i--
    ) {

        const candle =
            candles[i];

        if (
            candle.time +
            candle.intervalSeconds
            <= now
        ) {

            return {

                candle,

                index: i

            };

        }

    }

    return null;

}

// =====================================
// EMA
// =====================================

function calculateEMA(
    candles,
    period
) {

    if (
        !Array.isArray(candles) ||
        candles.length < period
    ) {

        return [];

    }

    const ema =
        new Array(
            candles.length
        ).fill(null);

    let sum = 0;

    for (
        let i = 0;
        i < period;
        i++
    ) {

        sum +=
            candles[i].close;

    }

    let previous =
        sum / period;

    ema[period - 1] =
        previous;

    const multiplier =
        2 / (period + 1);

    for (
        let i = period;
        i < candles.length;
        i++
    ) {

        const current =
            candles[i].close;

        const value =
            (
                current -
                previous
            ) *
            multiplier +
            previous;

        ema[i] =
            value;

        previous =
            value;

    }

    return ema;

}

// =====================================
// CROSSOVER DETECTOR
// =====================================

function detectCrossover(
    fastEMA,
    slowEMA,
    index
) {

    if (
        !Array.isArray(fastEMA) ||
        !Array.isArray(slowEMA)
    ) {

        return "NONE";

    }

    if (index < 1) {

        return "NONE";

    }

    const previousFast =
        fastEMA[index - 1];

    const previousSlow =
        slowEMA[index - 1];

    const currentFast =
        fastEMA[index];

    const currentSlow =
        slowEMA[index];

    if (
        previousFast === null ||
        previousSlow === null ||
        currentFast === null ||
        currentSlow === null
    ) {

        return "NONE";

    }

    // BUY crossover
    if (
        previousFast <= previousSlow &&
        currentFast > currentSlow
    ) {

        return "BULLISH";

    }

    // SELL crossover
    if (
        previousFast >= previousSlow &&
        currentFast < currentSlow
    ) {

        return "BEARISH";

    }

    return "NONE";

}

// =====================================
// TRADE LEVEL CALCULATION
// =====================================

function calculateTradeLevels(
    signal,
    entry,
    support,
    resistance
) {

    if (
        signal !== "BUY" &&
        signal !== "SELL"
    ) {

        return null;

    }

    entry =
        Number(entry);

    support =
        Number(support);

    resistance =
        Number(resistance);

    if (
        !Number.isFinite(entry) ||
        !Number.isFinite(support) ||
        !Number.isFinite(resistance)
    ) {

        return null;

    }

    let stopLoss;
    let target;

    // =================================
    // BUY
    // =================================

    if (
        signal === "BUY"
    ) {

        stopLoss =
            support;

        const risk =
            entry - stopLoss;

        if (
            risk <= 0
        ) {

            return null;

        }

        target =
            entry +
            risk * 2;

        // There must be enough room
        // before resistance.

        if (
            target > resistance
        ) {

            return null;

        }

    }

    // =================================
    // SELL
    // =================================

    if (
        signal === "SELL"
    ) {

        stopLoss =
            resistance;

        const risk =
            stopLoss - entry;

        if (
            risk <= 0
        ) {

            return null;

        }

        target =
            entry -
            risk * 2;

        // There must be enough room
        // before support.

        if (
            target < support
        ) {

            return null;

        }

    }

    const risk =
        Math.abs(
            entry - stopLoss
        );

    const reward =
        Math.abs(
            target - entry
        );

    if (
        risk <= 0 ||
        reward <= 0
    ) {

        return null;

    }

    const rr =
        reward / risk;

    if (
        rr < 2
    ) {

        return null;

    }

    return {

        entry:
            Number(
                entry.toFixed(2)
            ),

        stopLoss:
            Number(
                stopLoss.toFixed(2)
            ),

        target:
            Number(
                target.toFixed(2)
            ),

        riskReward:
            `1:${rr.toFixed(2)}`

    };

}

// =====================================
// LIVE ANALYSIS
// =====================================

app.get(
    "/live-analysis",
    async (req, res) => {

        try {

            // ---------------------------------
            // GET 30M / 1H / 4H
            // ---------------------------------

            const candles30m =
                await getRecentCandles(
                    "30m",
                    100
                );

            const candles1h =
                await getRecentCandles(
                    "1h",
                    100
                );

            const candles4h =
                await getRecentCandles(
                    "4h",
                    100
                );

            // ---------------------------------
            // EMA
            // ---------------------------------

            const ema30m9 =
                calculateEMA(
                    candles30m,
                    9
                );

            const ema30m26 =
                calculateEMA(
                    candles30m,
                    26
                );

            const ema1h9 =
                calculateEMA(
                    candles1h,
                    9
                );

            const ema1h26 =
                calculateEMA(
                    candles1h,
                    26
                );

            const ema4h9 =
                calculateEMA(
                    candles4h,
                    9
                );

            const ema4h26 =
                calculateEMA(
                    candles4h,
                    26
                );

            // ---------------------------------
            // CLOSED CANDLES
            // ---------------------------------

            const closed30m =
                getLastClosedCandle(
                    candles30m
                );

            const closed1h =
                getLastClosedCandle(
                    candles1h
                );

            const closed4h =
                getLastClosedCandle(
                    candles4h
                );

            if (
                !closed30m ||
                !closed1h ||
                !closed4h
            ) {

                throw new Error(
                    "Not enough closed candles"
                );

            }

            const i30 =
                closed30m.index;

            const i1 =
                closed1h.index;

            const i4 =
                closed4h.index;

            // ---------------------------------
            // 4H TREND
            // ---------------------------------

            const trend4h =
                ema4h9[i4] >
                ema4h26[i4]
                    ? "BULLISH"
                    : "BEARISH";

            // ---------------------------------
            // 1H TREND
            // ---------------------------------

            const trend1h =
                ema1h9[i1] >
                ema1h26[i1]
                    ? "BULLISH"
                    : "BEARISH";

            // ---------------------------------
            // 30M TREND
            // ---------------------------------

            let ema30mTrend =
                "SIDEWAYS";

            if (
                ema30m9[i30] >
                ema30m26[i30]
            ) {

                ema30mTrend =
                    "BULLISH";

            }

            else if (
                ema30m9[i30] <
                ema30m26[i30]
            ) {

                ema30mTrend =
                    "BEARISH";

            }

            // ---------------------------------
            // 30M CROSSOVER
            // ---------------------------------

            const crossover =
                detectCrossover(
                    ema30m9,
                    ema30m26,
                    i30
                );

            // ---------------------------------
            // CROSSOVER ALERT
            // ---------------------------------

            let alert =
                "NONE";

            if (
                crossover ===
                "BULLISH"
            ) {

                alert =
                    "🟢 BUY CROSSOVER — EMA9 crossed ABOVE EMA26 on 30M";

            }

            else if (
                crossover ===
                "BEARISH"
            ) {

                alert =
                    "🔴 SELL CROSSOVER — EMA9 crossed BELOW EMA26 on 30M";

            }

            // ---------------------------------
            // INITIAL SIGNAL
            // ---------------------------------

            let signal =
                "NO TRADE";

            if (
                trend4h === "BULLISH" &&
                trend1h === "BULLISH" &&
                ema30mTrend === "BULLISH"
            ) {

                signal =
                    "BUY";

            }

            else if (
                trend4h === "BEARISH" &&
                trend1h === "BEARISH" &&
                ema30mTrend === "BEARISH"
            ) {

                signal =
                    "SELL";

            }

            // ---------------------------------
            // ENTRY PRICE
            // ---------------------------------

            const entryPrice =
                closed30m.candle.close;

            // ---------------------------------
            // SUPPORT / RESISTANCE
            // ---------------------------------

            const recent30 =
                candles30m.slice(-20);

            const support =
                Math.min(
                    ...recent30.map(
                        candle =>
                            candle.low
                    )
                );

            const resistance =
                Math.max(
                    ...recent30.map(
                        candle =>
                            candle.high
                    )
                );

            // ---------------------------------
            // TRADE LEVELS
            // ---------------------------------

            const trade =
                calculateTradeLevels(
                    signal,
                    entryPrice,
                    support,
                    resistance
                );

            // ---------------------------------
            // FINAL DECISION
            // ---------------------------------

            if (!trade) {

                signal =
                    "NO TRADE";

            }

            // ---------------------------------
            // RESPONSE
            // ---------------------------------

            res.json({

                success: true,

                symbol:
                    SYMBOL,

                signal:

                    signal,

                price:
                    Number(
                        entryPrice.toFixed(2)
                    ),

                trend4h,

                trend1h,

                ema30mTrend,

                crossover,

                alert,

                entry:
                    trade
                        ? trade.entry
                        : null,

                stopLoss:
                    trade
                        ? trade.stopLoss
                        : null,

                target:
                    trade
                        ? trade.target
                        : null,

                riskReward:
                    trade
                        ? trade.riskReward
                        : null,

                candleTime:
                    new Date(
                        closed30m.candle.time *
                        1000
                    ).toISOString(),

                crossoverCandleTime:

                    crossover !== "NONE"
                        ? new Date(
                            closed30m.candle.time *
                            1000
                        ).toISOString()
                        : null,

                updatedAt:
                    new Date().toISOString()

            });

        } catch (error) {

            console.error(
                "LIVE ANALYSIS ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    error.message

            });

        }

    }
);

// =====================================
// START SERVER
// =====================================

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log("");

        console.log(
            "================================="
        );

        console.log(
            "AI TRADING SERVER RUNNING"
        );

        console.log(
            "================================="
        );

        console.log(
            "HOME       = /"
        );

        console.log(
            "HEALTH     = /health"
        );

        console.log(
            "TEST AI    = /test-ai"
        );

        console.log(
            "IMAGE AI   = /analyze"
        );

        console.log(
            "LIVE AI    = /live-analysis"
        );

        console.log(
            "================================="
        );

        console.log(
            "STRATEGY = 4H + 1H + 30M"
        );

        console.log(
            "ENTRY = 30M CLOSED CANDLE"
        );

        console.log(
            "MINIMUM RR = 1:2"
        );

        console.log(
            "5M = DISABLED"
        );

        console.log(
            "MODEL =",
            MODEL
        );

        console.log(
            "PORT =",
            PORT
        );

        console.log(
            "================================="
        );

    }
);
