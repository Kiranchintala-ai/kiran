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
// GEMINI API KEY
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

    const publicIndex = path.join(
        __dirname,
        "public",
        "index.html"
    );

    const rootIndex = path.join(
        __dirname,
        "index.html"
    );

    if (fs.existsSync(publicIndex)) {
        return res.sendFile(publicIndex);
    }

    if (fs.existsSync(rootIndex)) {
        return res.sendFile(rootIndex);
    }

    res.send("AI Trading Server Running");
});

// =====================================
// HEALTH CHECK
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

            reply: response.text

        });

    } catch (error) {

        console.error(
            "Test AI Error:",
            error
        );

        res.status(500).json({

            success: false,

            error: error.message

        });

    }

});

// =====================================
// ANALYZE 3 CHARTS
// =====================================

app.post("/analyze", async (req, res) => {

    try {

        const {
            image1H,
            image30M,
            image5M
        } = req.body;

        // =================================
        // CHECK IMAGES
        // =================================

        if (
            !image1H ||
            !image30M ||
            !image5M
        ) {

            return res.status(400).json({

                success: false,

                error:
                    "Please provide all 3 charts: 1H, 30M and 5M."

            });

        }

        // =================================
        // CLEAN BASE64
        // =================================

        const cleanBase64 = (image) => {

            if (
                typeof image !== "string"
            ) {
                return image;
            }

            return image.replace(
                /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
                ""
            );

        };

        const chart1H =
            cleanBase64(image1H);

        const chart30M =
            cleanBase64(image30M);

        const chart5M =
            cleanBase64(image5M);

        // =================================
        // AI PROMPT
        // =================================

        const prompt = `

You are a disciplined BTC/USD technical-analysis assistant.

The user has provided THREE TradingView charts of the SAME BTC/USD market.

1H chart = HIGHER-TIMEFRAME TREND
30M chart = PRIMARY SETUP
5M chart = ENTRY CONFIRMATION

IMPORTANT:

Do NOT automatically choose BUY.

Do NOT automatically choose SELL.

Do NOT force a trade.

The final decision MUST be exactly ONE:

BUY
SELL
NO TRADE

Use the 1H chart to determine the higher-timeframe direction.

Check:

- Overall trend
- Higher highs
- Higher lows
- Lower highs
- Lower lows
- Major support
- Major resistance
- Breakout
- Breakdown
- Market structure

Classify the 1H trend as:

Bullish
Bearish
Sideways

The 30M chart is the PRIMARY trading timeframe.

Check:

- Market structure
- Support
- Resistance
- Price action
- Breakout
- Breakdown
- Retest
- Rejection
- Momentum
- Volume if visible
- Potential entry area
- Logical stop-loss location
- Target
- Risk/reward

Use the 5M chart ONLY for entry confirmation.

Check:

- Confirmation candle
- Breakout confirmation
- Rejection
- Short-term momentum
- Higher low
- Lower high
- Entry timing

Do NOT use the 5M chart to override a strong higher-timeframe trend without a clear reason.

Choose BUY only if:

1H direction is reasonably bullish

AND

30M has a valid bullish setup

AND

5M provides reasonable entry confirmation

AND

logical stop loss exists

AND

target is clear

AND

risk/reward is acceptable.

Choose SELL only if:

1H direction is reasonably bearish

AND

30M has a valid bearish setup

AND

5M provides reasonable entry confirmation

AND

logical stop loss exists

AND

target is clear

AND

risk/reward is acceptable.

Choose NO TRADE when:

- 1H is unclear
- 30M is unclear
- 5M confirmation is missing
- Timeframes conflict
- Price is in the middle of a range
- Setup is too late
- Entry is risky
- Stop loss cannot be placed logically
- Target is unclear
- Risk/reward is poor
- Chart information is insufficient
- Market conditions are too uncertain

NO TRADE is a valid and preferred result when there is no high-quality setup.

Technical analysis must be based ONLY on the charts provided.

Do not invent price levels.

Do not invent volume if volume is not visible.

If volume is not visible, return:

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
Risk Reward: ratio or -
Reason: short reason

Do not return Confidence.
Do not return markdown.
Do not return a table.
Do not add extra text.

`;

        // =================================
        // SEND CHARTS TO GEMINI
        // =================================

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

                            mimeType: "image/png",

                            data: chart1H

                        }

                    },

                    {
                        text:
                            "IMAGE 2 — 30M BTC/USD CHART"
                    },

                    {
                        inlineData: {

                            mimeType: "image/png",

                            data: chart30M

                        }

                    },

                    {
                        text:
                            "IMAGE 3 — 5M BTC/USD CHART"
                    },

                    {
                        inlineData: {

                            mimeType: "image/png",

                            data: chart5M

                        }

                    },

                    {
                        text: prompt
                    }

                ]

            });

        // =================================
        // GET AI RESPONSE
        // =================================

        const text =
            response.text || "";

        console.log("");
        console.log("=================================");
        console.log("AI 3-TIMEFRAME ANALYSIS");
        console.log("=================================");
        console.log(text);
        console.log("=================================");
        console.log("");

        // =================================
        // VALUE EXTRACTOR
        // =================================

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

        // =================================
        // FINAL RESPONSE
        // =================================

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
                getValue("Entry Confirmation"),

            rr:
                getValue("Risk Reward"),

            reason:
                getValue("Reason"),

            raw:
                text

        });

    } catch (error) {

        console.error(
            "Analyze Error:",
            error
        );

        res.status(500).json({

            success: false,

            error: error.message

        });

    }

});

// =====================================
// BACKTEST HELPER FUNCTIONS
// =====================================

// =====================================
// NORMALIZE CANDLE
// =====================================

function normalizeCandle(candle) {

    return {

        time: Number(candle.time),

        open: Number(candle.open),

        high: Number(candle.high),

        low: Number(candle.low),

        close: Number(candle.close)

    };

}

// =====================================
// EMA CALCULATOR
// =====================================

function calculateEMA(candles, period) {

    if (
        !Array.isArray(candles) ||
        candles.length < period
    ) {

        return [];

    }

    const emaValues =
        new Array(candles.length).fill(null);

    let sum = 0;

    // =================================
    // FIRST EMA = SMA
    // =================================

    for (
        let i = 0;
        i < period;
        i++
    ) {

        sum += candles[i].close;

    }

    let previousEMA =
        sum / period;

    emaValues[period - 1] =
        previousEMA;

    // =================================
    // EMA MULTIPLIER
    // =================================

    const multiplier =
        2 / (period + 1);

    // =================================
    // CONTINUE EMA
    // =================================

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
// FIND LAST CLOSED CANDLE
// =====================================

function findLastClosedCandle(
    candles,
    targetCloseTime
) {

    let left = 0;

    let right =
        candles.length - 1;

    let answer = -1;

    while (
        left <= right
    ) {

        const middle =
            Math.floor(
                (left + right) / 2
            );

        const candle =
            candles[middle];

        const candleCloseTime =
            candle.time +
            candle.intervalSeconds;

        if (
            candleCloseTime <=
            targetCloseTime
        ) {

            answer =
                middle;

            left =
                middle + 1;

        } else {

            right =
                middle - 1;

        }

    }

    return answer;

}

// =====================================
// SLEEP
// =====================================

function sleep(ms) {

    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                ms
            )
    );

}

// =====================================
// DOWNLOAD DELTA CANDLES
// =====================================

async function downloadDeltaCandles(
    resolution,
    startTime,
    endTime
) {

    const intervalSeconds = {

        "30m":
            30 * 60,

        "1h":
            60 * 60,

        "4h":
            4 * 60 * 60

    };

    if (
        !intervalSeconds[resolution]
    ) {

        throw new Error(
            `Unsupported resolution: ${resolution}`
        );

    }

    // =================================
    // DELTA LIMIT
    // =================================

    const candlesPerRequest =
        2000;

    const step =
        candlesPerRequest *
        intervalSeconds[resolution];

    const candles = [];

    let batchStart =
        startTime;

    let requestCount = 0;

    // =================================
    // DOWNLOAD IN BATCHES
    // =================================

    while (
        batchStart < endTime
    ) {

        const batchEnd =
            Math.min(
                batchStart + step,
                endTime
            );

        const url =
            DELTA_API +
            `?resolution=${encodeURIComponent(resolution)}` +
            `&symbol=${encodeURIComponent(SYMBOL)}` +
            `&start=${batchStart}` +
            `&end=${batchEnd}`;

        console.log(
            `Downloading ${resolution}: ` +
            `${new Date(batchStart * 1000).toISOString()} -> ` +
            `${new Date(batchEnd * 1000).toISOString()}`
        );

        const response =
            await fetch(
                url,
                {
                    headers: {
                        "Accept":
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
            data.success === false
        ) {

            throw new Error(
                `${resolution} API returned unsuccessful response`
            );

        }

        if (
            Array.isArray(data.result)
        ) {

            for (
                const candle
                of data.result
            ) {

                candles.push(
                    normalizeCandle(
                        candle
                    )
                );

            }

        }

        requestCount++;

        // =================================
        // MOVE TO NEXT BATCH
        // =================================

        batchStart =
            batchEnd +
            intervalSeconds[resolution];

        // =================================
        // RATE LIMIT PROTECTION
        // =================================

        if (
            batchStart < endTime
        ) {

            await sleep(150);

        }

    }

    // =================================
    // REMOVE DUPLICATES
    // =================================

    const unique =
        new Map();

    for (
        const candle
        of candles
    ) {

        unique.set(
            candle.time,
            candle
        );

    }

    // =================================
    // SORT
    // =================================

    const cleaned =
        Array.from(
            unique.values()
        )
        .sort(
            (a, b) =>
                a.time - b.time
        );

    // =================================
    // ADD INTERVAL
    // =================================

    for (
        const candle
        of cleaned
    ) {

        candle.intervalSeconds =
            intervalSeconds[
                resolution
            ];

    }

    console.log(
        `${resolution}: ${cleaned.length} candles downloaded using ${requestCount} requests`
    );

    return cleaned;

}

// =====================================
// CALCULATE TRADE RESULT
// =====================================

function calculateTradeResult(
    direction,
    entry,
    stopLoss,
    candlesAfterEntry,
    rr
) {

    const risk =
        direction === "BUY"
            ? entry - stopLoss
            : stopLoss - entry;

    if (
        !Number.isFinite(risk) ||
        risk <= 0
    ) {

        return {

            result:
                "INVALID",

            r: 0

        };

    }

    const target =
        direction === "BUY"
            ? entry + risk * rr
            : entry - risk * rr;

    let result =
        "OPEN";

    let exitPrice =
        null;

    let exitTime =
        null;

    // =================================
    // CHECK FUTURE CANDLES
    // =================================

    for (
        const candle
        of candlesAfterEntry
    ) {

        // =================================
        // BUY
        // =================================

        if (
            direction === "BUY"
        ) {

            const hitSL =
                candle.low <=
                stopLoss;

            const hitTP =
                candle.high >=
                target;

            // =================================
            // BOTH HIT
            // CONSERVATIVE = LOSS
            // =================================

            if (
                hitSL &&
                hitTP
            ) {

                result =
                    "LOSS";

                exitPrice =
                    stopLoss;

                exitTime =
                    candle.time;

                break;

            }

            // =================================
            // SL
            // =================================

            if (
                hitSL
            ) {

                result =
                    "LOSS";

                exitPrice =
                    stopLoss;

                exitTime =
                    candle.time;

                break;

            }

            // =================================
            // TP
            // =================================

            if (
                hitTP
            ) {

                result =
                    "WIN";

                exitPrice =
                    target;

                exitTime =
                    candle.time;

                break;

            }

        }

        // =================================
        // SELL
        // =================================

        else {

            const hitSL =
                candle.high >=
                stopLoss;

            const hitTP =
                candle.low <=
                target;

            // =================================
            // BOTH HIT
            // CONSERVATIVE = LOSS
            // =================================

            if (
                hitSL &&
                hitTP
            ) {

                result =
                    "LOSS";

                exitPrice =
                    stopLoss;

                exitTime =
                    candle.time;

                break;

            }

            // =================================
            // SL
            // =================================

            if (
                hitSL
            ) {

                result =
                    "LOSS";

                exitPrice =
                    stopLoss;

                exitTime =
                    candle.time;

                break;

            }

            // =================================
            // TP
            // =================================

            if (
                hitTP
            ) {

                result =
                    "WIN";

                exitPrice =
                    target;

                exitTime =
                    candle.time;

                break;

            }

        }

    }

    // =================================
    // WIN
    // =================================

    if (
        result === "WIN"
    ) {

        return {

            result:
                "WIN",

            r:
                rr,

            exitPrice,

            exitTime

        };

    }

    // =================================
    // LOSS
    // =================================

    if (
        result === "LOSS"
    ) {

        return {

            result:
                "LOSS",

            r:
                -1,

            exitPrice,

            exitTime

        };

    }

    // =================================
    // STILL OPEN
    // =================================

    return {

        result:
            "OPEN",

        r:
            0,

        exitPrice:
            null,

        exitTime:
            null

    };

}

// =====================================
// 5-YEAR BACKTEST FUNCTION
// =====================================

async function runFiveYearBacktest(
    req,
    res
) {

    const startedAt =
        Date.now();

    try {

        console.log("");

        console.log(
            "================================="
        );

        console.log(
            "STARTING 5-YEAR BTCUSD BACKTEST"
        );

        console.log(
            "================================="
        );

        const now =
            Math.floor(
                Date.now() / 1000
            );

        const fiveYearsAgo =
            now -
            (
                5 *
                365 *
                24 *
                60 *
                60
            );

        // =================================
        // DOWNLOAD 30M
        // =================================

        console.log(
            "STEP 1/3: DOWNLOADING 30M DATA"
        );

        const candles30m =
            await downloadDeltaCandles(
                "30m",
                fiveYearsAgo,
                now
            );

        // =================================
        // DOWNLOAD 1H
        // =================================

        console.log(
            "STEP 2/3: DOWNLOADING 1H DATA"
        );

        const candles1h =
            await downloadDeltaCandles(
                "1h",
                fiveYearsAgo,
                now
            );

        // =================================
        // DOWNLOAD 4H
        // =================================

        console.log(
            "STEP 3/3: DOWNLOADING 4H DATA"
        );

        const candles4h =
            await downloadDeltaCandles(
                "4h",
                fiveYearsAgo,
                now
            );

        // =================================
        // CHECK DATA
        // =================================

        if (
            candles30m.length < 100 ||
            candles1h.length < 100 ||
            candles4h.length < 100
        ) {

            throw new Error(
                "Not enough historical candles were downloaded."
            );

        }

        // =================================
        // EMA 9 / 26
        // =================================

        console.log(
            "CALCULATING EMA 9/26..."
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

        // =================================
        // RR VALUES
        // =================================

        const rrValues = [
            1,
            1.5,
            2,
            2.5,
            3
        ];

        // =================================
        // RESULTS STORAGE
        // =================================

        const results = {};

        for (
            const rr
            of rrValues
        ) {

            results[String(rr)] = {

                total:
                    0,

                buy: {

                    trades:
                        0,

                    wins:
                        0,

                    losses:
                        0,

                    open:
                        0,

                    netR:
                        0

                },

                sell: {

                    trades:
                        0,

                    wins:
                        0,

                    losses:
                        0,

                    open:
                        0,

                    netR:
                        0

                }

            };

        }

        // =================================
        // YEARLY RESULTS
        // =================================

        const yearly = {};

        // =================================
        // TRADE LIST
        // =================================

        const trades = [];

        // =================================
        // SCAN 30M CROSSOVERS
        // =================================

        console.log(
            "SCANNING 30M EMA CROSSOVERS..."
        );

        for (
            let i = 26;
            i < candles30m.length - 1;
            i++
        ) {

            const previousEMA9 =
                ema30m9[i - 1];

            const previousEMA26 =
                ema30m26[i - 1];

            const currentEMA9 =
                ema30m9[i];

            const currentEMA26 =
                ema30m26[i];

            if (
                previousEMA9 === null ||
                previousEMA26 === null ||
                currentEMA9 === null ||
                currentEMA26 === null
            ) {

                continue;

            }

            // =================================
            // DIRECTION
            // =================================

            let direction =
                null;

            // =================================
            // BUY CROSSOVER
            // =================================

            if (
                previousEMA9 <=
                previousEMA26 &&
                currentEMA9 >
                currentEMA26
            ) {

                direction =
                    "BUY";

            }

            // =================================
            // SELL CROSSOVER
            // =================================

            if (
                previousEMA9 >=
                previousEMA26 &&
                currentEMA9 <
                currentEMA26
            ) {

                direction =
                    "SELL";

            }

            if (
                !direction
            ) {

                continue;

            }

            // =================================
            // SIGNAL CANDLE
            // =================================

            const signalCandle =
                candles30m[i];

            const signalCloseTime =
                signalCandle.time +
                signalCandle.intervalSeconds;

            // =================================
            // FIND 4H TREND
            // =================================

            const index4h =
                findLastClosedCandle(
                    candles4h,
                    signalCloseTime
                );

            // =================================
            // FIND 1H TREND
            // =================================

            const index1h =
                findLastClosedCandle(
                    candles1h,
                    signalCloseTime
                );

            if (
                index4h < 26 ||
                index1h < 26
            ) {

                continue;

            }

            // =================================
            // 4H TREND
            // =================================

            const trend4h =
                ema4h9[index4h] >
                ema4h26[index4h]
                    ? "BULLISH"
                    : "BEARISH";

            // =================================
            // 1H TREND
            // =================================

            const trend1h =
                ema1h9[index1h] >
                ema1h26[index1h]
                    ? "BULLISH"
                    : "BEARISH";

            // =================================
            // BUY FILTER
            // =================================

            if (
                direction === "BUY" &&
                (
                    trend4h !== "BULLISH" ||
                    trend1h !== "BULLISH"
                )
            ) {

                continue;

            }

            // =================================
            // SELL FILTER
            // =================================

            if (
                direction === "SELL" &&
                (
                    trend4h !== "BEARISH" ||
                    trend1h !== "BEARISH"
                )
            ) {

                continue;

            }

            // =================================
            // ENTRY = NEXT 30M OPEN
            // =================================

            const entryIndex =
                i + 1;

            if (
                entryIndex >=
                candles30m.length
            ) {

                continue;

            }

            const entryCandle =
                candles30m[
                    entryIndex
                ];

            const entry =
                entryCandle.open;

            // =================================
            // STOP LOSS
            // =================================

            let stopLoss;

            if (
                direction === "BUY"
            ) {

                stopLoss =
                    signalCandle.low;

            } else {

                stopLoss =
                    signalCandle.high;

            }

            // =================================
            // RISK
            // =================================

            const risk =
                direction === "BUY"
                    ? entry - stopLoss
                    : stopLoss - entry;

            if (
                !Number.isFinite(risk) ||
                risk <= 0
            ) {

                continue;

            }

            // =================================
            // FUTURE CANDLES
            // =================================

            const futureCandles =
                candles30m.slice(
                    entryIndex
                );

            // =================================
            // TRADE RECORD
            // =================================

            const tradeRecord = {

                time:
                    signalCandle.time,

                date:
                    new Date(
                        signalCandle.time *
                        1000
                    ).toISOString(),

                direction,

                entry,

                stopLoss,

                risk,

                trend4h,

                trend1h,

                rr: {}

            };

            // =================================
            // TEST ALL RR
            // =================================

            for (
                const rr
                of rrValues
            ) {

                const result =
                    calculateTradeResult(
                        direction,
                        entry,
                        stopLoss,
                        futureCandles,
                        rr
                    );

                const bucket =
                    results[
                        String(rr)
                    ];

                bucket.total++;

                // =================================
                // BUY TRADE
                // =================================

                if (
                    direction === "BUY"
                ) {

                    bucket.buy.trades++;

                }

                // =================================
                // SELL TRADE
                // =================================

                else {

                    bucket.sell.trades++;

                }

                // =================================
                // WIN
                // =================================

                if (
                    result.result ===
                    "WIN"
                ) {

                    if (
                        direction ===
                        "BUY"
                    ) {

                        bucket.buy.wins++;

                        bucket.buy.netR +=
                            result.r;

                    } else {

                        bucket.sell.wins++;

                        bucket.sell.netR +=
                            result.r;

                    }

                }

                // =================================
                // LOSS
                // =================================

                else if (
                    result.result ===
                    "LOSS"
                ) {

                    if (
                        direction ===
                        "BUY"
                    ) {

                        bucket.buy.losses++;

                        bucket.buy.netR +=
                            result.r;

                    } else {

                        bucket.sell.losses++;

                        bucket.sell.netR +=
                            result.r;

                    }

                }

                // =================================
                // OPEN
                // =================================

                else {

                    if (
                        direction ===
                        "BUY"
                    ) {

                        bucket.buy.open++;

                    } else {

                        bucket.sell.open++;

                    }

                }

                // =================================
                // STORE TRADE RESULT
                // =================================

                tradeRecord.rr[
                    String(rr)
                ] = {

                    result:
                        result.result,

                    r:
                        result.r,

                    exitPrice:
                        result.exitPrice,

                    exitTime:
                        result.exitTime

                };

            }

            trades.push(
                tradeRecord
            );

        }

        // =================================
        // YEARLY AGGREGATION
        // =================================

        for (
            const trade
            of trades
        ) {

            const year =
                new Date(
                    trade.time *
                    1000
                ).getUTCFullYear();

            if (
                !yearly[year]
            ) {

                yearly[year] = {};

                for (
                    const rr
                    of rrValues
                ) {

                    yearly[year][
                        String(rr)
                    ] = {

                        total:
                            0,

                        buy: {

                            wins:
                                0,

                            losses:
                                0,

                            open:
                                0,

                            netR:
                                0

                        },

                        sell: {

                            wins:
                                0,

                            losses:
                                0,

                            open:
                                0,

                            netR:
                                0

                        }

                    };

                }

            }

            for (
                const rr
                of rrValues
            ) {

                const result =
                    trade.rr[
                        String(rr)
                    ];

                const bucket =
                    yearly[year][
                        String(rr)
                    ];

                const side =
                    trade.direction
                        .toLowerCase();

                bucket.total++;

                if (
                    result.result ===
                    "OPEN"
                ) {

                    bucket[
                        side
                    ].open++;

                }

                if (
                    result.result ===
                    "WIN"
                ) {

                    bucket[
                        side
                    ].wins++;

                    bucket[
                        side
                    ].netR +=
                        result.r;

                }

                if (
                    result.result ===
                    "LOSS"
                ) {

                    bucket[
                        side
                    ].losses++;

                    bucket[
                        side
                    ].netR +=
                        result.r;

                }

            }

        }

        // =================================
        // FINAL SUMMARY
        // =================================

        const summary = {};

        for (
            const rr
            of rrValues
        ) {

            const bucket =
                results[
                    String(rr)
                ];

            const completed =
                bucket.buy.wins +
                bucket.buy.losses +
                bucket.sell.wins +
                bucket.sell.losses;

            const wins =
                bucket.buy.wins +
                bucket.sell.wins;

            const losses =
                bucket.buy.losses +
                bucket.sell.losses;

            const netR =
                bucket.buy.netR +
                bucket.sell.netR;

            const winRate =
                completed > 0
                    ? (
                        wins /
                        completed
                    ) * 100
                    : 0;

            // =================================
            // BUY WIN RATE
            // =================================

            const buyCompleted =
                bucket.buy.wins +
                bucket.buy.losses;

            const buyWinRate =
                buyCompleted > 0
                    ? (
                        bucket.buy.wins /
                        buyCompleted
                    ) * 100
                    : 0;

            // =================================
            // SELL WIN RATE
            // =================================

            const sellCompleted =
                bucket.sell.wins +
                bucket.sell.losses;

            const sellWinRate =
                sellCompleted > 0
                    ? (
                        bucket.sell.wins /
                        sellCompleted
                    ) * 100
                    : 0;

            summary[
                String(rr)
            ] = {

                totalSignals:
                    bucket.total,

                buyTrades:
                    bucket.buy.trades,

                sellTrades:
                    bucket.sell.trades,

                wins,

                losses,

                open:
                    bucket.buy.open +
                    bucket.sell.open,

                completed,

                winRate:
                    Number(
                        winRate.toFixed(2)
                    ),

                netR:
                    Number(
                        netR.toFixed(2)
                    ),

                buy: {

                    trades:
                        bucket.buy.trades,

                    wins:
                        bucket.buy.wins,

                    losses:
                        bucket.buy.losses,

                    open:
                        bucket.buy.open,

                    winRate:
                        Number(
                            buyWinRate.toFixed(2)
                        ),

                    netR:
                        Number(
                            bucket.buy.netR.toFixed(2)
                        )

                },

                sell: {

                    trades:
                        bucket.sell.trades,

                    wins:
                        bucket.sell.wins,

                    losses:
                        bucket.sell.losses,

                    open:
                        bucket.sell.open,

                    winRate:
                        Number(
                            sellWinRate.toFixed(2)
                        ),

                    netR:
                        Number(
                            bucket.sell.netR.toFixed(2)
                        )

                }

            };

        }

        // =================================
        // EXECUTION TIME
        // =================================

        const executionTime =
            (
                Date.now() -
                startedAt
            ) / 1000;

        // =================================
        // LOG RESULTS
        // =================================

        console.log("");

        console.log(
            "================================="
        );

        console.log(
            "5-YEAR BACKTEST COMPLETE"
        );

        console.log(
            "================================="
        );

        console.log(
            `30M candles: ${candles30m.length}`
        );

        console.log(
            `1H candles: ${candles1h.length}`
        );

        console.log(
            `4H candles: ${candles4h.length}`
        );

        console.log(
            `Qualified trades: ${trades.length}`
        );

        console.log(
            `Execution time: ${executionTime.toFixed(2)} seconds`
        );

        console.log(
            "================================="
        );

        // =================================
        // RESPONSE
        // =================================

        res.json({

            success:
                true,

            symbol:
                SYMBOL,

            period: {

                from:
                    new Date(
                        fiveYearsAgo *
                        1000
                    ).toISOString(),

                to:
                    new Date(
                        now *
                        1000
                    ).toISOString()

            },

            strategy: {

                sameStrategyForBuyAndSell:
                    true,

                timeframeTrend:
                    "4H",

                timeframeConfirmation:
                    "1H",

                timeframeEntry:
                    "30M",

                emaFast:
                    9,

                emaSlow:
                    26,

                buy:
                    "30M EMA 9 crosses ABOVE EMA 26 + 1H and 4H bullish",

                sell:
                    "30M EMA 9 crosses BELOW EMA 26 + 1H and 4H bearish",

                entry:
                    "Next 30M candle OPEN after crossover candle closes",

                buyStopLoss:
                    "30M crossover candle LOW",

                sellStopLoss:
                    "30M crossover candle HIGH",

                target:
                    "Entry +/- Risk × R:R"

            },

            data: {

                candles30m:
                    candles30m.length,

                candles1h:
                    candles1h.length,

                candles4h:
                    candles4h.length

            },

            summary,

            yearly,

            qualifiedSignals:
                trades.length,

            executionSeconds:
                Number(
                    executionTime.toFixed(2)
                )

        });

    }

    catch (error) {

        console.error("");

        console.error(
            "================================="
        );

        console.error(
            "5-YEAR BACKTEST ERROR"
        );

        console.error(
            "================================="
        );

        console.error(
            error
        );

        console.error(
            "================================="
        );

        res.status(500).json({

            success:
                false,

            error:
                error.message,

            message:
                "5-year backtest failed. Check Render logs."

        });

    }

}

// =====================================
// BACKTEST ROUTES
// =====================================

// MAIN BACKTEST ROUTE

app.get(
    "/backtest-5years",
    runFiveYearBacktest
);

// ALIAS ROUTE
// This is the URL we were trying earlier.

app.get(
    "/backtest-data",
    runFiveYearBacktest
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
            "1H = TREND"
        );

        console.log(
            "30M = PRIMARY SETUP"
        );

        console.log(
            "5M = ENTRY CONFIRMATION"
        );

        console.log(
            "BACKTEST = 4H + 1H + 30M EMA 9/26"
        );

        console.log(
            "BUY = EMA 9 CROSS ABOVE EMA 26"
        );

        console.log(
            "SELL = EMA 9 CROSS BELOW EMA 26"
        );

        console.log(
            "SAME BUY/SELL STRATEGY = TRUE"
        );

        console.log(
            "RR TEST = 1 / 1.5 / 2 / 2.5 / 3"
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

        console.log(
            `Server started on port ${PORT}`
        );

        console.log("");

    }
);
