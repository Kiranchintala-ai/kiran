// =====================================
// LIVE MARKET DATA
// =====================================

const LIVE_INTERVALS = {
    "30m": 30 * 60,
    "1h": 60 * 60,
    "4h": 4 * 60 * 60
};

const TRADE_RR = 2;

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
        Math.floor(Date.now() / 1000);

    const start =
        now - count * interval;

    const url =
        DELTA_API +
        `?resolution=${encodeURIComponent(resolution)}` +
        `&symbol=${encodeURIComponent(SYMBOL)}` +
        `&start=${start}` +
        `&end=${now}`;

    const response =
        await fetch(url, {
            headers: {
                Accept: "application/json"
            }
        });

    if (!response.ok) {

        const errorText =
            await response.text();

        throw new Error(
            `${resolution} API error ${response.status}: ${errorText}`
        );
    }

    const data =
        await response.json();

    if (!Array.isArray(data.result)) {

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

    for (const candle of candles) {
        candle.intervalSeconds =
            interval;
    }

    return candles;
}

// =====================================
// LAST CLOSED CANDLE
// =====================================

function getLastClosedCandle(candles) {

    if (
        !candles ||
        candles.length === 0
    ) {
        return null;
    }

    const now =
        Math.floor(Date.now() / 1000);

    for (
        let i = candles.length - 1;
        i >= 0;
        i--
    ) {

        const candle =
            candles[i];

        if (
            candle.time +
            candle.intervalSeconds <= now
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
        new Array(candles.length)
            .fill(null);

    let sum = 0;

    for (
        let i = 0;
        i < period;
        i++
    ) {
        sum += candles[i].close;
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
                current - previous
            ) * multiplier + previous;

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

    // BUY CROSSOVER
    if (
        previousFast <= previousSlow &&
        currentFast > currentSlow
    ) {
        return "BULLISH";
    }

    // SELL CROSSOVER
    if (
        previousFast >= previousSlow &&
        currentFast < currentSlow
    ) {
        return "BEARISH";
    }

    return "NONE";
}

// =====================================
// LIVE ANALYSIS
// =====================================

app.get(
    "/live-analysis",
    async (req, res) => {

        try {

            // ---------------------------------
            // ONLY 30M + 1H + 4H
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

            const trend30m =
                ema30m9[i30] >
                ema30m26[i30]
                    ? "BULLISH"
                    : "BEARISH";

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
            // DEFAULT
            // ---------------------------------

            let signal =
                "NO TRADE";

            let entry = null;
            let stopLoss = null;
            let target = null;

            let alert =
                "NONE";

            // ---------------------------------
            // RECENT 30M CANDLES
            // ---------------------------------

            const recent30 =
                candles30m.slice(-20);

            // ---------------------------------
            // BUY SETUP
            // ---------------------------------

            if (
                trend4h === "BULLISH" &&
                trend1h === "BULLISH" &&
                crossover === "BULLISH"
            ) {

                const currentEntry =
                    closed30m.candle.close;

                const swingLow =
                    Math.min(
                        ...candles30m
                            .slice(
                                Math.max(
                                    0,
                                    i30 - 9
                                ),
                                i30 + 1
                            )
                            .map(
                                c => c.low
                            )
                    );

                const risk =
                    currentEntry -
                    swingLow;

                if (risk > 0) {

                    const calculatedTarget =
                        currentEntry +
                        risk * TRADE_RR;

                    const resistance =
                        Math.max(
                            ...recent30.map(
                                c => c.high
                            )
                        );

                    // 2R target must have room
                    if (
                        calculatedTarget <=
                        resistance
                    ) {

                        signal =
                            "BUY";

                        entry =
                            Number(
                                currentEntry.toFixed(2)
                            );

                        stopLoss =
                            Number(
                                swingLow.toFixed(2)
                            );

                        target =
                            Number(
                                calculatedTarget.toFixed(2)
                            );

                        alert =
                            "🟢 BUY CROSSOVER — 30M EMA9 crossed ABOVE EMA26";
                    }
                }
            }

            // ---------------------------------
            // SELL SETUP
            // ---------------------------------

            if (
                trend4h === "BEARISH" &&
                trend1h === "BEARISH" &&
                crossover === "BEARISH"
            ) {

                const currentEntry =
                    closed30m.candle.close;

                const swingHigh =
                    Math.max(
                        ...candles30m
                            .slice(
                                Math.max(
                                    0,
                                    i30 - 9
                                ),
                                i30 + 1
                            )
                            .map(
                                c => c.high
                            )
                    );

                const risk =
                    swingHigh -
                    currentEntry;

                if (risk > 0) {

                    const calculatedTarget =
                        currentEntry -
                        risk * TRADE_RR;

                    const support =
                        Math.min(
                            ...recent30.map(
                                c => c.low
                            )
                        );

                    // 2R target must have room
                    if (
                        calculatedTarget >=
                        support
                    ) {

                        signal =
                            "SELL";

                        entry =
                            Number(
                                currentEntry.toFixed(2)
                            );

                        stopLoss =
                            Number(
                                swingHigh.toFixed(2)
                            );

                        target =
                            Number(
                                calculatedTarget.toFixed(2)
                            );

                        alert =
                            "🔴 SELL CROSSOVER — 30M EMA9 crossed BELOW EMA26";
                    }
                }
            }

            // ---------------------------------
            // CROSSOVER ALERT
            // ---------------------------------

            const crossoverCandleTime =
                new Date(
                    closed30m.candle.time * 1000
                ).toISOString();

            const alertId =
                crossover !== "NONE"
                    ? `${crossover}-${crossoverCandleTime}`
                    : null;

            // ---------------------------------
            // PRICE
            // ---------------------------------

            const price =
                closed30m.candle.close;

            // ---------------------------------
            // RESPONSE
            // ---------------------------------

            res.json({

                success: true,

                symbol:
                    SYMBOL,

                price:
                    Number(
                        price.toFixed(2)
                    ),

                signal,

                entry,

                stopLoss,

                target,

                trend4h,

                trend1h,

                trend30m,

                crossover,

                alert,

                alertId,

                crossoverCandleTime,

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
