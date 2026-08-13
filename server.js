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

// If public/index.html exists,
// serve the public folder.

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
// 6 MONTH HISTORICAL DATA TEST
// =====================================

app.get("/backtest-data", async (req, res) => {

    try {

        const resolutions = ["4h", "1h", "30m"];

        const now = Math.floor(Date.now() / 1000);

        // Approximately 6 months
        const sixMonthsAgo = now - (180 * 24 * 60 * 60);

        const intervalSeconds = {
            "30m": 30 * 60,
            "1h": 60 * 60,
            "4h": 4 * 60 * 60
        };

        const allData = {};

        for (const resolution of resolutions) {

            const candles = [];

            const step =
                2000 * intervalSeconds[resolution];

            let batchStart = sixMonthsAgo;

            while (batchStart < now) {

                const batchEnd =
                    Math.min(
                        batchStart + step,
                        now
                    );

                const url =
                    "https://api.india.delta.exchange/v2/history/candles" +
                    `?resolution=${resolution}` +
                    `&symbol=BTCUSD` +
                    `&start=${batchStart}` +
                    `&end=${batchEnd}`;

                const response =
                    await fetch(url, {
                        headers: {
                            "Accept": "application/json"
                        }
                    });

                if (!response.ok) {

                    throw new Error(
                        `${resolution} API error: ${response.status}`
                    );

                }

                const data =
                    await response.json();

                if (!data.success) {

                    throw new Error(
                        `${resolution} API returned unsuccessful response`
                    );

                }

                if (Array.isArray(data.result)) {

                    candles.push(
                        ...data.result
                    );

                }

                batchStart =
                    batchEnd + intervalSeconds[resolution];

            }

            // Remove duplicate candles
            const unique = new Map();

            for (const candle of candles) {

                unique.set(
                    candle.time,
                    candle
                );

            }

            // Keep only CLOSED candles
            const closedCandles =
                Array.from(unique.values())
                    .filter(candle =>
                        Number(candle.time) +
                        intervalSeconds[resolution] <= now
                    )
                    .sort(
                        (a, b) =>
                            Number(a.time) -
                            Number(b.time)
                    );

            allData[resolution] = {

                candles: closedCandles,

                count: closedCandles.length,

                firstTime:
                    closedCandles.length
                        ? closedCandles[0].time
                        : null,

                lastTime:
                    closedCandles.length
                        ? closedCandles[
                            closedCandles.length - 1
                        ].time
                        : null

            };

        }

        res.json({

            success: true,

            message:
                "6-month BTCUSD historical data loaded successfully.",

            symbol: "BTCUSD",

            data: allData

        });

    }

    catch (error) {

        console.error(
            "Backtest Data Error:",
            error
        );

        res.status(500).json({

            success: false,

            error: error.message

        });

    }

});
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
