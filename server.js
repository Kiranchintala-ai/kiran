require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

const app = express();

app.use(cors());
app.use(express.json({ limit: "30mb" }));

// =====================================
// CONFIGURATION
// =====================================

const PORT = process.env.PORT || 3000;
const MODEL = "gemini-3.6-flash";

// =====================================
// GEMINI API KEY CHECK
// =====================================

if (!process.env.GEMINI_API_KEY) {
    console.error("ERROR: GEMINI_API_KEY is missing in .env");
    process.exit(1);
}

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

// =====================================
// HOME
// =====================================

app.get("/", (req, res) => {
    res.send("AI Trading Server Running");
});

// =====================================
// HEALTH CHECK
// =====================================

app.get("/health", (req, res) => {
    res.json({
        success: true,
        message: "AI Trading Server is running"
    });
});

// =====================================
// TEST AI
// =====================================

app.get("/test-ai", async (req, res) => {

    try {

        const response = await ai.models.generateContent({
            model: MODEL,
            contents: "Reply with only one word: SUCCESS"
        });

        res.json({
            success: true,
            reply: response.text
        });

    } catch (error) {

        console.error("Test AI Error:", error);

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

        if (!image1H || !image30M || !image5M) {

            return res.status(400).json({
                success: false,
                error: "Please provide all 3 charts: 1H, 30M and 5M."
            });

        }

        // =================================
        // REMOVE DATA URL PREFIX
        // =================================

        const cleanBase64 = (image) => {

            if (typeof image !== "string") {
                return image;
            }

            return image.replace(
                /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
                ""
            );
        };

        const chart1H = cleanBase64(image1H);
        const chart30M = cleanBase64(image30M);
        const chart5M = cleanBase64(image5M);

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

=====================================
1H — HIGHER TIMEFRAME TREND
=====================================

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

=====================================
30M — PRIMARY SETUP
=====================================

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

=====================================
5M — ENTRY CONFIRMATION
=====================================

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

=====================================
BUY CONDITIONS
=====================================

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

=====================================
SELL CONDITIONS
=====================================

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

=====================================
NO TRADE CONDITIONS
=====================================

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

=====================================
PRICE RULE
=====================================

Technical analysis must be based ONLY on the charts provided.

Do not invent price levels.

Do not invent volume if volume is not visible.

If volume is not visible, return:

Volume: Not visible

=====================================
OUTPUT FORMAT
=====================================

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
        // SEND 3 IMAGES TO GEMINI
        // =================================

        const response = await ai.models.generateContent({

            model: MODEL,

            contents: [

                {
                    text: "IMAGE 1 — 1H BTC/USD CHART"
                },

                {
                    inlineData: {
                        mimeType: "image/png",
                        data: chart1H
                    }
                },

                {
                    text: "IMAGE 2 — 30M BTC/USD CHART"
                },

                {
                    inlineData: {
                        mimeType: "image/png",
                        data: chart30M
                    }
                },

                {
                    text: "IMAGE 3 — 5M BTC/USD CHART"
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

        const text = response.text || "";

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

            const regex = new RegExp(
                "^\\s*" +
                label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
                "\\s*:\\s*(.+)$",
                "im"
            );

            const match = text.match(regex);

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

        console.error("Analyze Error:", error);

        res.status(500).json({

            success: false,

            error: error.message

        });

    }

});

// =====================================
// START SERVER
// =====================================

app.listen(PORT, "0.0.0.0", () => {

    console.log("");
    console.log("=================================");
    console.log("AI TRADING SERVER RUNNING");
    console.log("=================================");
    console.log("1H = TREND");
    console.log("30M = PRIMARY SETUP");
    console.log("5M = ENTRY CONFIRMATION");
    console.log("SIGNALS = BUY / SELL / NO TRADE");
    console.log("MODEL =", MODEL);
    console.log("=================================");
    console.log(`Local:   http://localhost:${PORT}`);
    console.log(`Network: http://0.0.0.0:${PORT}`);
    console.log("");
});
