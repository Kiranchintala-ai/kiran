require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { GoogleGenAI } = require("@google/genai");

const app = express();

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
// CONFIGURATION
// =====================================

const PORT = process.env.PORT || 3000;

const MODEL = "gemini-3.6-flash";

const DELTA_API =
    "https://api.india.delta.exchange/v2/history/candles";

const SYMBOL = "BTCUSD";

// =====================================
// GEMINI API
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

    const publicIndex =
        path.join(
            __dirname,
            "public",
            "index.html"
        );

    const rootIndex =
        path.join(
            __dirname,
            "index.html"
        );

    if (fs.existsSync(publicIndex)) {
        return res.sendFile(publicIndex);
    }

    if (fs.existsSync(rootIndex)) {
        return res.sendFile(rootIndex);
    }

    res.send(
        "AI Trading Server Running"
    );
});

// =====================================
// HEALTH CHECK
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
                response.text

        });

    }

    catch (error) {

        console.error(
            "Test AI Error:",
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
// CLEAN BASE64
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
// IMAGE ANALYSIS
// =====================================

app.post("/analyze", async (req, res) => {

    try {

        const {
            image1H,
            image30M,
            image5M
        } = req.body;

        // -----------------------------
        // CHECK IMAGES
        // -----------------------------

        if (
            !image1H ||
            !image30M ||
            !image5M
        ) {

            return res.status(400).json({

                success: false,

                error:
                    "Please provide 1H, 30M and 5M charts."

            });

        }

        const chart1H =
            cleanBase64(image1H);

        const chart30M =
            cleanBase64(image30M);

        const chart5M =
            cleanBase64(image5M);

        // -----------------------------
        // AI PROMPT
        // -----------------------------

        const prompt = `

You are a disciplined BTC/USD technical-analysis assistant.

Three charts are provided:

1H = higher timeframe trend
30M = primary setup
5M = entry confirmation

Analyze ONLY the charts provided.

Do not force a trade.

The final signal must be exactly:

BUY
SELL
NO TRADE

BUY requires:

1H reasonably bullish
30M bullish setup
5M bullish confirmation
Logical entry
Logical stop loss
Clear target

SELL requires:

1H reasonably bearish
30M bearish setup
5M bearish confirmation
Logical entry
Logical stop loss
Clear target

Otherwise choose:

NO TRADE

Check:

- Market structure
- Higher highs
- Higher lows
- Lower highs
- Lower lows
- Support
- Resistance
- Breakout
- Breakdown
- Retest
- Rejection
- Momentum
- Volume if visible
- Entry confirmation

Do not invent price levels.

Do not invent volume.

If volume is not visible, say:
Volume: Not visible

Return ONLY these lines:

Signal: BUY or SELL or NO TRADE
Entry: price or -
Stop Loss: price or -
Target: price or -
Trend: Bullish or Bearish or Sideways
Support: price/zone or -
Resistance: price/zone or -
Price Action: short description
Momentum: Strong or Weak or Neutral
Volume: short description or Not visible
Entry Confirmation: Confirmed or Not confirmed
Reason: short reason

Do NOT return:

Confidence
Risk Reward
EMA values
Crossover values
Extra explanation
Markdown
Tables

`;

        // -----------------------------
        // SEND IMAGES TO GEMINI
        // -----------------------------

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
                            "IMAGE 3 — 5M BTC/USD CHART"
                    },

                    {
                        inlineData: {

                            mimeType:
                                "image/png",

                            data:
                                chart5M

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
            "AI CHART ANALYSIS"
        );
        console.log(
            "================================="
        );
        console.log(text);
        console.log(
            "================================="
        );
        console.log("");

        // -----------------------------
        // VALUE EXTRACTOR
        // -----------------------------

        const getValue = (label) => {

            const regex =
                new RegExp(
                    "^\\s*" +
                    label.replace(
                        /[.*+?^${}()|[\]\\]/g,
                        "\\$&"
                    ) +
                    "\\s*:\\s*(.+)$",
                    "im"
                );

            const match =
                text.match(regex);

            return match
                ? match[1].trim()
                : "-";

        };

        // -----------------------------
        // RESPONSE
        // -----------------------------

        res.json({

            success: true,

            signal:
                getValue("Signal"),

            entry:
                getValue("Entry"),

            stoploss:
                getValue("Stop Loss"),

            target:
                getValue("Target"),

            trend:
                getValue("Trend"),

            support:
                getValue("Support"),

            resistance:
                getValue("Resistance"),

            priceAction:
                getValue("Price Action"),

            momentum:
                getValue("Momentum"),

            volume:
                getValue("Volume"),

            entryConfirmation:
                getValue(
                    "Entry Confirmation"
                ),

            reason:
                getValue("Reason"),

            raw:
                text

        });

    }

    catch (error) {

        console.error(
            "Analyze Error:",
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
// CANDLE INTERVALS
// =====================================

const LIVE_INTERVALS = {

    "5m":
        5 * 60,

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
// EMA CALCULATOR
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

    const emaValues =
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

    let previousEMA =
        sum / period;

    emaValues[
        period - 1
    ] =
        previousEMA;

    const multiplier =
        2 /
        (period + 1);

    for (
        let i = period;
        i < candles.length;
        i++
    ) {

        const currentClose =
            candles[i].close;

        const currentEMA =
            (
                currentClose -
                previousEMA
            ) *
            multiplier +
            previousEMA;

        emaValues[i] =
            currentEMA;

        previousEMA =
            currentEMA;

    }

    return emaValues;

}

// =====================================
// GET RECENT CANDLES
// =====================================

async function getRecentCandles(
    resolution,
    count = 100
) {

    const intervalSeconds =
        LIVE_INTERVALS[
            resolution
        ];

    if (!intervalSeconds) {

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
        (
            count *
            intervalSeconds
        );

    const url =
        DELTA_API +
        `?resolution=${encodeURIComponent(
            resolution
        )}` +
        `&symbol=${encodeURIComponent(
            SYMBOL
        )}` +
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
            `${resolution}: candle data not available`
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
        const candle
        of candles
    ) {

        candle.intervalSeconds =
            intervalSeconds;

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
        !candles.length
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
// LIVE BTC/USD ANALYSIS
// =====================================

app.get(
    "/live-analysis",
    async (req, res) => {

        try {

            console.log("");
            console.log(
                "================================="
            );
            console.log(
                "LIVE BTC/USD ANALYSIS"
            );
            console.log(
                "================================="
            );

            // -----------------------------
            // DOWNLOAD CANDLES
            // -----------------------------

            const candles5m =
                await getRecentCandles(
                    "5m",
                    100
                );

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

            if (
                candles5m.length < 30 ||
                candles30m.length < 30 ||
                candles1h.length < 30 ||
                candles4h.length < 30
            ) {

                throw new Error(
                    "Not enough candle data."
                );

            }

            // -----------------------------
            // EMA
            // -----------------------------

            const ema5m9 =
                calculateEMA(
                    candles5m,
                    9
                );

            const ema5m26 =
                calculateEMA(
                    candles5m,
                    26
                );

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

            // -----------------------------
            // CLOSED CANDLES
            // -----------------------------

            const closed5m =
                getLastClosedCandle(
                    candles5m
                );

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
                !closed5m ||
                !closed30m ||
                !closed1h ||
                !closed4h
            ) {

                throw new Error(
                    "Not enough closed candles."
                );

            }

            const i5 =
                closed5m.index;

            const i30 =
                closed30m.index;

            const i1 =
                closed1h.index;

            const i4 =
                closed4h.index;

            // -----------------------------
            // HIGHER TIMEFRAME TREND
            // -----------------------------

            const trend4h =
                ema4h9[i4] >
                ema4h26[i4]
                    ? "BULLISH"
                    : "BEARISH";

            const trend1h =
                ema1h9[i1] >
                ema1h26[i1]
                    ? "BULLISH"
                    : "BEARISH";

            // -----------------------------
            // 30M CROSSOVER
            // -----------------------------

            let crossover =
                "NONE";

            if (
                i30 >= 1 &&
                ema30m9[i30 - 1] <=
                ema30m26[i30 - 1] &&
                ema30m9[i30] >
                ema30m26[i30]
            ) {

                crossover =
                    "BULLISH";

            }

            if (
                i30 >= 1 &&
                ema30m9[i30 - 1] >=
                ema30m26[i30 - 1] &&
                ema30m9[i30] <
                ema30m26[i30]
            ) {

                crossover =
                    "BEARISH";

            }

            // -----------------------------
            // 5M CONFIRMATION
            // -----------------------------

            let confirmation =
                "NOT CONFIRMED";

            if (
                ema5m9[i5] >
                ema5m26[i5] &&
                trend4h ===
                    "BULLISH" &&
                trend1h ===
                    "BULLISH" &&
                ema30m9[i30] >
                ema30m26[i30]
            ) {

                confirmation =
                    "BULLISH";

            }

            if (
                ema5m9[i5] <
                ema5m26[i5] &&
                trend4h ===
                    "BEARISH" &&
                trend1h ===
                    "BEARISH" &&
                ema30m9[i30] <
                ema30m26[i30]
            ) {

                confirmation =
                    "BEARISH";

            }

            // -----------------------------
            // FINAL SIGNAL
            // -----------------------------

            let signal =
                "NO TRADE";

            if (
                trend4h ===
                    "BULLISH" &&
                trend1h ===
                    "BULLISH" &&
                crossover ===
                    "BULLISH" &&
                confirmation ===
                    "BULLISH"
            ) {

                signal =
                    "BUY";

            }

            if (
                trend4h ===
                    "BEARISH" &&
                trend1h ===
                    "BEARISH" &&
                crossover ===
                    "BEARISH" &&
                confirmation ===
                    "BEARISH"
            ) {

                signal =
                    "SELL";

            }

            // -----------------------------
            // CURRENT PRICE
            // -----------------------------

            const price =
                candles5m[
                    candles5m.length - 1
                ].close;

            // -----------------------------
            // SUPPORT / RESISTANCE
            // -----------------------------

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

            // -----------------------------
            // ENTRY / SL / TARGET
            // -----------------------------

            let entry =
                null;

            let stopLoss =
                null;

            let target =
                null;

            let reason =
                "";

            if (
                signal ===
                "BUY"
            ) {

                entry =
                    price;

                stopLoss =
                    support;

                const risk =
                    entry -
                    stopLoss;

                if (
                    risk > 0
                ) {

                    target =
                        entry +
                        risk * 2;

                    reason =
                        "4H and 1H bullish, 30M bullish crossover and 5M confirmation.";

                }

                else {

                    signal =
                        "NO TRADE";

                    entry =
                        null;

                    stopLoss =
                        null;

                    target =
                        null;

                    reason =
                        "Bullish conditions exist but a logical stop loss is not available.";

                }

            }

            else if (
                signal ===
                "SELL"
            ) {

                entry =
                    price;

                stopLoss =
                    resistance;

                const risk =
                    stopLoss -
                    entry;

                if (
                    risk > 0
                ) {

                    target =
                        entry -
                        risk * 2;

                    reason =
                        "4H and 1H bearish, 30M bearish crossover and 5M confirmation.";

                }

                else {

                    signal =
                        "NO TRADE";

                    entry =
                        null;

                    stopLoss =
                        null;

                    target =
                        null;

                    reason =
                        "Bearish conditions exist but a logical stop loss is not available.";

                }

            }

            else {

                reason =
                    "No complete multi-timeframe setup is confirmed.";

            }

            // -----------------------------
            // FINAL RESULT
            // -----------------------------

            const result = {

                success:
                    true,

                symbol:
                    SYMBOL,

                signal,

                price:
                    Number(
                        price.toFixed(2)
                    ),

                entry:
                    entry !== null
                        ? Number(
                            entry.toFixed(2)
                        )
                        : null,

                stopLoss:
                    stopLoss !== null
                        ? Number(
                            stopLoss.toFixed(2)
                        )
                        : null,

                target:
                    target !== null
                        ? Number(
                            target.toFixed(2)
                        )
                        : null,

                reason,

                updatedAt:
                    new Date().toISOString()

            };

            console.log(
                JSON.stringify(
                    result,
                    null,
                    2
                )
            );

            res.json(
                result
            );

        }

        catch (error) {

            console.error(
                "LIVE ANALYSIS ERROR:",
                error
            );

            res.status(500).json({

                success:
                    false,

                error:
                    error.message

            });

        }

    }
);

// =====================================
// SERVER START
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
            "BTC/USD"
        );
        console.log(
            "4H + 1H = TREND"
        );
        console.log(
            "30M = PRIMARY SETUP"
        );
        console.log(
            "5M = CONFIRMATION"
        );
        console.log(
            "SIGNALS = BUY / SELL / NO TRADE"
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
        console.log("");

    }
);
