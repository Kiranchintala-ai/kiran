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

const publicFolder = path.join(__dirname, "public");

if (fs.existsSync(publicFolder)) {
    app.use(express.static(publicFolder));
}

// =====================================
// HOME
// =====================================

app.get("/", (req, res) => {

    const indexPath = path.join(
        publicFolder,
        "index.html"
    );

    if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
    }

    res.send("AI Trading Server Running");
});

// =====================================
// HEALTH
// =====================================

app.get("/health", (req, res) => {

    res.json({
        success: true,
        message: "AI Trading Server is running",
        model: MODEL,
        time: new Date().toISOString()
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
                    "Please upload all 3 charts: 1H, 30M and 5M."

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

You are a disciplined BTC/USD technical analysis assistant.

The user uploaded three TradingView charts of BTC/USD.

1H = higher timeframe trend
30M = primary setup
5M = entry confirmation

Analyze ONLY the supplied charts.

Do not force a trade.

The final signal must be exactly one of:

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
- Primary setup
- Support
- Resistance
- Breakout
- Breakdown
- Retest
- Rejection
- Momentum
- Price action

5M:
- Entry confirmation
- Confirmation candle
- Breakout/rejection
- Short-term momentum

Important:

Do NOT automatically choose BUY.

Do NOT automatically choose SELL.

If the setup is unclear, return NO TRADE.

If timeframes conflict, return NO TRADE.

If the information is insufficient, return NO TRADE.

Do not invent prices.

Do not invent support or resistance levels.

Do not invent volume.

Return ONLY the following lines:

Signal: BUY or SELL or NO TRADE
Entry: price or -
Stop Loss: price or -
Target: price or -
Trend: Bullish or Bearish or Sideways
Support: price/zone or -
Resistance: price/zone or -
Reason: short reason
Confirmation: Confirmed or Not confirmed

Do NOT return:

Confidence
Risk Reward
RR
EMA values
Long explanations
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
            "AI IMAGE ANALYSIS"
        );
        console.log(
            "================================="
        );
        console.log(text);
        console.log(
            "================================="
        );

        // =================================
        // VALUE EXTRACTOR
        // =================================

        function getValue(label) {

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

        }

        // =================================
        // RESPONSE
        // =================================

        res.json({

            success: true,

            signal:
                getValue("Signal"),

            entry:
                getValue("Entry"),

            stopLoss:
                getValue("Stop Loss"),

            target:
                getValue("Target"),

            trend:
                getValue("Trend"),

            support:
                getValue("Support"),

            resistance:
                getValue("Resistance"),

            reason:
                getValue("Reason"),

            confirmation:
                getValue("Confirmation"),

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
// LIVE MARKET DATA
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
        const candle
        of candles
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
        2 /
        (period + 1);

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
// LIVE ANALYSIS
// =====================================

app.get(
    "/live-analysis",
    async (req, res) => {

        try {

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
                    "Not enough closed candles"
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
            // TREND
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
                trend4h === "BULLISH" &&
                trend1h === "BULLISH" &&
                ema30m9[i30] >
                ema30m26[i30]
            ) {

                confirmation =
                    "BULLISH";

            }

            if (
                ema5m9[i5] <
                ema5m26[i5] &&
                trend4h === "BEARISH" &&
                trend1h === "BEARISH" &&
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
                trend4h === "BULLISH" &&
                trend1h === "BULLISH" &&
                ema30m9[i30] >
                ema30m26[i30] &&
                confirmation ===
                "BULLISH"
            ) {

                signal =
                    "BUY";

            }

            if (
                trend4h === "BEARISH" &&
                trend1h === "BEARISH" &&
                ema30m9[i30] <
                ema30m26[i30] &&
                confirmation ===
                "BEARISH"
            ) {

                signal =
                    "SELL";

            }

            // -----------------------------
            // PRICE
            // -----------------------------

            const price =
                closed5m.candle.close;

            // -----------------------------
            // SUPPORT / RESISTANCE
            // -----------------------------

            const recent30 =
                candles30m.slice(-20);

            const support =
                Math.min(
                    ...recent30.map(
                        c => c.low
                    )
                );

            const resistance =
                Math.max(
                    ...recent30.map(
                        c => c.high
                    )
                );

            // -----------------------------
            // RESPONSE
            // -----------------------------

            res.json({

                success: true,

                symbol:
                    SYMBOL,

                signal,

                price:
                    Number(
                        price.toFixed(2)
                    ),

                trend4h,

                trend1h,

                crossover,

                confirmation,

                support:
                    Number(
                        support.toFixed(2)
                    ),

                resistance:
                    Number(
                        resistance.toFixed(2)
                    ),

                candleTime:
                    new Date(
                        closed5m.candle.time *
                        1000
                    ).toISOString(),

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
