// =====================================
// CONFIGURATION
// =====================================

const API_URL =
    "https://kiran-ai-server.onrender.com";


// =====================================
// CHART PREVIEW
// =====================================

function setupPreview(inputId, previewId) {

    const input =
        document.getElementById(inputId);

    const preview =
        document.getElementById(previewId);

    if (!input || !preview) {
        return;
    }

    input.addEventListener(
        "change",
        function () {

            const file =
                this.files[0];

            if (!file) {
                return;
            }

            preview.src =
                URL.createObjectURL(file);

            preview.style.display =
                "block";
        }
    );
}


// =====================================
// SETUP PREVIEWS
// =====================================

setupPreview(
    "chart1H",
    "preview1H"
);

setupPreview(
    "chart30M",
    "preview30M"
);

setupPreview(
    "chart5M",
    "preview5M"
);


// =====================================
// CONVERT IMAGE TO BASE64
// =====================================

function getBase64(file) {

    return new Promise(
        (resolve, reject) => {

            const reader =
                new FileReader();

            reader.onload = () => {

                const result =
                    reader.result;

                resolve(
                    result.split(",")[1]
                );

            };

            reader.onerror =
                reject;

            reader.readAsDataURL(
                file
            );

        }
    );
}


// =====================================
// ANALYZE CHARTS
// =====================================

async function analyzeChart() {

    const file1H =
        document.getElementById(
            "chart1H"
        ).files[0];

    const file30M =
        document.getElementById(
            "chart30M"
        ).files[0];

    const file5M =
        document.getElementById(
            "chart5M"
        ).files[0];


    // =================================
    // CHECK ALL THREE CHARTS
    // =================================

    if (
        !file1H ||
        !file30M ||
        !file5M
    ) {

        document.getElementById(
            "result"
        ).innerHTML =

            "<h3 style='color:red'>" +

            "⚠️ Please upload all 3 charts: " +

            "1H, 30M and 5M." +

            "</h3>";

        return;
    }


    // =================================
    // SHOW ANALYZING MESSAGE
    // =================================

    document.getElementById(
        "result"
    ).innerHTML =

        "<h3>⏳ AI is analyzing 1H + 30M + 5M charts...</h3>";


    try {

        // =============================
        // CONVERT IMAGES
        // =============================

        const image1H =
            await getBase64(file1H);

        const image30M =
            await getBase64(file30M);

        const image5M =
            await getBase64(file5M);


        // =============================
        // SEND TO NEW BACKEND
        // =============================

        const response =
            await fetch(

                API_URL +
                "/analyze",

                {

                    method:
                        "POST",

                    headers: {

                        "Content-Type":
                            "application/json"

                    },

                    body:
                        JSON.stringify({

                            image1H:
                                image1H,

                            image30M:
                                image30M,

                            image5M:
                                image5M

                        })

                }

            );


        // =============================
        // CHECK HTTP RESPONSE
        // =============================

        if (!response.ok) {

            throw new Error(
                "Server error: " +
                response.status
            );

        }


        // =============================
        // GET SERVER RESPONSE
        // =============================

        const data =
            await response.json();


        console.log(
            "AI Response:",
            data
        );


        // =============================
        // SUCCESS
        // =============================

        if (data.success) {


            // =========================
            // SIGNAL
            // =========================

            let signal =
                data.signal ||
                "NO TRADE";


            const upperSignal =
                signal.toUpperCase();


            let signalColor =
                "orange";


            if (
                upperSignal ===
                "BUY"
            ) {

                signalColor =
                    "green";

            }

            else if (
                upperSignal ===
                "SELL"
            ) {

                signalColor =
                    "red";

            }


            const signalElement =
                document.getElementById(
                    "signal"
                );


            if (signalElement) {

                signalElement.innerHTML =

                    `<h2 style="
                        color:${signalColor};
                        font-size:32px;
                        margin-bottom:15px;
                    ">
                        ${signal}
                    </h2>`;

            }


            // =========================
            // ENTRY
            // =========================

            const entryElement =
                document.getElementById(
                    "entry"
                );


            if (entryElement) {

                if (
                    upperSignal ===
                        "BUY" ||

                    upperSignal ===
                        "SELL"
                ) {

                    entryElement.innerHTML =

                        `<div style="
                            padding:15px;
                            margin-bottom:15px;
                            border:2px solid orange;
                            border-radius:10px;
                            background:#fff8e1;
                        ">

                            <h3 style="
                                margin-top:0;
                            ">
                                ⚠️ ENTRY RULE
                            </h3>

                            <b>
                                WAIT FOR 5M CANDLE CLOSE
                            </b>

                            <br><br>

                            Current 5M candle
                            must finish first.

                            <br><br>

                            ✅ If confirmation
                            remains valid after
                            the candle closes:

                            <br><br>

                            <b>
                                ENTER ON THE NEXT
                                5M CANDLE
                            </b>

                            <br><br>

                            ❌ If confirmation
                            disappears:

                            <br><br>

                            <b>
                                NO TRADE
                            </b>

                            <hr>

                            <b>AI Entry:</b>
                            ${data.entry || "-"}

                        </div>`;

                }

                else {

                    entryElement.innerHTML =

                        `<div style="
                            padding:15px;
                            margin-bottom:15px;
                            border:2px solid #999;
                            border-radius:10px;
                            background:#f5f5f5;
                        ">

                            <h3 style="
                                margin-top:0;
                            ">
                                🟡 NO TRADE
                            </h3>

                            No valid entry
                            at this time.

                        </div>`;

                }

            }


            // =========================
            // STOP LOSS
            // =========================

            const stoplossElement =
                document.getElementById(
                    "stoploss"
                );


            if (stoplossElement) {

                stoplossElement.innerHTML =

                    "<b>Stop Loss:</b> " +

                    (
                        data.stoploss ||
                        "-"
                    );

            }


            // =========================
            // TARGET
            // =========================

            const targetElement =
                document.getElementById(
                    "target"
                );


            if (targetElement) {

                targetElement.innerHTML =

                    "<b>Target:</b> " +

                    (
                        data.target ||
                        "-"
                    );

            }


            // =========================
            // RISK REWARD
            // =========================

            const rrElement =
                document.getElementById(
                    "rr"
                );


            if (rrElement) {

                rrElement.innerHTML =

                    "<b>Risk : Reward:</b> " +

                    (
                        data.rr ||
                        "-"
                    );

            }


            // =========================
            // REASON
            // =========================

            const reasonElement =
                document.getElementById(
                    "reason"
                );


            if (reasonElement) {

                reasonElement.innerHTML =

                    "<b>Reason:</b> " +

                    (
                        data.reason ||
                        "-"
                    );

            }


            // =========================
            // ANALYSIS COMPLETE
            // =========================

            document.getElementById(
                "result"
            ).innerHTML =

                "<h3 style='color:green'>" +

                "✅ Analysis Completed" +

                "</h3>";

        }


        // =============================
        // SERVER RETURNED ERROR
        // =============================

        else {

            document.getElementById(
                "result"
            ).innerHTML =

                "<h3 style='color:red'>" +

                "❌ " +

                (
                    data.error ||
                    "Analysis failed."
                ) +

                "</h3>";

        }

    }


    // =================================
    // CONNECTION ERROR
    // =================================

    catch (err) {

        console.error(
            "Analysis Error:",
            err
        );

        document.getElementById(
            "result"
        ).innerHTML =

            "<h3 style='color:red'>" +

            "❌ Connection Error: " +

            err.message +

            "</h3>";

    }

}


// =====================================
// CLEAR RESULTS
// =====================================

function clearResult() {

    // Clear status

    document.getElementById(
        "result"
    ).innerHTML = "";


    // Clear file inputs

    document.getElementById(
        "chart1H"
    ).value = "";

    document.getElementById(
        "chart30M"
    ).value = "";

    document.getElementById(
        "chart5M"
    ).value = "";


    // Hide previews

    const preview1H =
        document.getElementById(
            "preview1H"
        );

    const preview30M =
        document.getElementById(
            "preview30M"
        );

    const preview5M =
        document.getElementById(
            "preview5M"
        );


    if (preview1H) {

        preview1H.style.display =
            "none";

    }


    if (preview30M) {

        preview30M.style.display =
            "none";

    }


    if (preview5M) {

        preview5M.style.display =
            "none";

    }


    // Clear signal

    const signal =
        document.getElementById(
            "signal"
        );

    if (signal) {

        signal.innerHTML = "";

    }


    // Clear entry

    const entry =
        document.getElementById(
            "entry"
        );

    if (entry) {

        entry.innerHTML = "";

    }


    // Clear stop loss

    const stoploss =
        document.getElementById(
            "stoploss"
        );

    if (stoploss) {

        stoploss.innerHTML = "";

    }


    // Clear target

    const target =
        document.getElementById(
            "target"
        );

    if (target) {

        target.innerHTML = "";

    }


    // Clear R:R

    const rr =
        document.getElementById(
            "rr"
        );

    if (rr) {

        rr.innerHTML = "";

    }


    // Clear reason

    const reason =
        document.getElementById(
            "reason"
        );

    if (reason) {

        reason.innerHTML = "";

    }

}
