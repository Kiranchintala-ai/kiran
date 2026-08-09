// ===============================
// CHART PREVIEW
// ===============================

function setupPreview(inputId, previewId) {

    document.getElementById(inputId).addEventListener("change", function () {

        const file = this.files[0];

        if (!file) return;

        const preview = document.getElementById(previewId);

        preview.src = URL.createObjectURL(file);
        preview.style.display = "block";

    });

}


// Setup previews

setupPreview("chart1H", "preview1H");
setupPreview("chart30M", "preview30M");
setupPreview("chart5M", "preview5M");


// ===============================
// CONVERT IMAGE TO BASE64
// ===============================

function getBase64(file) {

    return new Promise((resolve, reject) => {

        const reader = new FileReader();

        reader.onload = () => {

            const result = reader.result;

            resolve(result.split(",")[1]);

        };

        reader.onerror = reject;

        reader.readAsDataURL(file);

    });

}


// ===============================
// ANALYZE CHARTS
// ===============================

async function analyzeChart() {

    const file1H =
        document.getElementById("chart1H").files[0];

    const file30M =
        document.getElementById("chart30M").files[0];

    const file5M =
        document.getElementById("chart5M").files[0];


    // ===============================
    // CHECK ALL THREE CHARTS
    // ===============================

    if (!file1H || !file30M || !file5M) {

        document.getElementById("result").innerHTML =

            "<h3 style='color:red'>" +
            "⚠️ Please upload all 3 charts: 1H, 30M and 5M." +
            "</h3>";

        return;

    }


    // ===============================
    // ANALYZING MESSAGE
    // ===============================

    document.getElementById("result").innerHTML =

        "<h3>⏳ AI is analyzing 1H + 30M + 5M charts...</h3>";


    try {

        // ===============================
        // CONVERT IMAGES
        // ===============================

        const image1H =
            await getBase64(file1H);

        const image30M =
            await getBase64(file30M);

        const image5M =
            await getBase64(file5M);


        // ===============================
        // SEND TO NODE SERVER
        // ===============================

        const response = await fetch(

            "http://10.46.91.207:3000/analyze",

            {

                method: "POST",

                headers: {

                    "Content-Type":
                        "application/json"

                },

                body: JSON.stringify({

                    image1H: image1H,

                    image30M: image30M,

                    image5M: image5M

                })

            }

        );


        // ===============================
        // GET SERVER RESPONSE
        // ===============================

        const data =
            await response.json();


        // ===============================
        // SUCCESS
        // ===============================

        if (data.success) {


            // ===============================
            // SIGNAL
            // ===============================

            let signal =
                data.signal || "NO TRADE";


            let signalColor =
                "orange";


            if (
                signal
                    .toUpperCase()
                    .includes("BUY")
            ) {

                signalColor =
                    "green";

            }

            else if (
                signal
                    .toUpperCase()
                    .includes("SELL")
            ) {

                signalColor =
                    "red";

            }


            document.getElementById("signal").innerHTML =

                `<h2 style="
                    color:${signalColor};
                    font-size:32px;
                    margin-bottom:15px;
                ">
                    ${signal}
                </h2>`;


            // ===============================
            // ENTRY + 5M CANDLE CLOSE RULE
            // ===============================

            if (
                signal.toUpperCase() === "BUY" ||
                signal.toUpperCase() === "SELL"
            ) {

                document.getElementById("entry").innerHTML =

                    `<div style="
                        padding:15px;
                        margin-bottom:15px;
                        border:2px solid orange;
                        border-radius:10px;
                        background:#fff8e1;
                    ">

                        <h3 style="margin-top:0;">
                            ⚠️ ENTRY RULE
                        </h3>

                        <b>
                            WAIT FOR 5M CANDLE CLOSE
                        </b>

                        <br><br>

                        Current 5M candle must finish first.

                        <br><br>

                        ✅ If confirmation remains valid
                        after the candle closes:

                        <br>

                        <b>
                            ENTER ON THE NEXT 5M CANDLE
                        </b>

                        <br><br>

                        ❌ If confirmation disappears:

                        <br>

                        <b>
                            NO TRADE
                        </b>

                        <hr>

                        <b>Entry:</b>
                        ${data.entry || "-"}

                    </div>`;

            }

            else {

                document.getElementById("entry").innerHTML =

                    `<div style="
                        padding:15px;
                        margin-bottom:15px;
                        border:2px solid #999;
                        border-radius:10px;
                        background:#f5f5f5;
                    ">

                        <h3 style="margin-top:0;">
                            🟡 NO TRADE
                        </h3>

                        No valid entry at this time.

                    </div>`;

            }


            // ===============================
            // STOP LOSS
            // ===============================

            document.getElementById("stoploss").innerHTML =

                "<b>Stop Loss:</b> " +

                (data.stoploss || "-");


            // ===============================
            // TARGET
            // ===============================

            document.getElementById("target").innerHTML =

                "<b>Target:</b> " +

                (data.target || "-");


            // ===============================
            // RISK : REWARD
            // ===============================

            if (
                document.getElementById("rr")
            ) {

                document.getElementById("rr").innerHTML =

                    "<b>Risk : Reward:</b> " +

                    (data.rr || "-");

            }


            // ===============================
            // REASON
            // ===============================

            if (
                document.getElementById("reason")
            ) {

                document.getElementById("reason").innerHTML =

                    "<b>Reason:</b> " +

                    (data.reason || "-");

            }


            // ===============================
            // RESULT
            // ===============================

            document.getElementById("result").innerHTML =

                "<h3 style='color:green'>" +
                "✅ Analysis Completed" +
                "</h3>";

        }


        // ===============================
        // SERVER ERROR
        // ===============================

        else {

            document.getElementById("result").innerHTML =

                "<h3 style='color:red'>" +

                (data.error ||
                    "Analysis failed.") +

                "</h3>";

        }

    }


    // ===============================
    // CONNECTION / JAVASCRIPT ERROR
    // ===============================

    catch (err) {

        console.error(err);

        document.getElementById("result").innerHTML =

            "<h3 style='color:red'>" +

            "❌ " +
            err.message +

            "</h3>";

    }

}


// ===============================
// CLEAR RESULTS
// ===============================

function clearResult() {


    // Clear status

    document.getElementById("result").innerHTML = "";


    // Clear file inputs

    document.getElementById("chart1H").value = "";

    document.getElementById("chart30M").value = "";

    document.getElementById("chart5M").value = "";


    // Hide previews

    document.getElementById(
        "preview1H"
    ).style.display = "none";


    document.getElementById(
        "preview30M"
    ).style.display = "none";


    document.getElementById(
        "preview5M"
    ).style.display = "none";


    // Clear signal

    document.getElementById(
        "signal"
    ).innerHTML = "";


    // Clear entry

    document.getElementById(
        "entry"
    ).innerHTML = "";


    // Clear stop loss

    document.getElementById(
        "stoploss"
    ).innerHTML = "";


    // Clear target

    document.getElementById(
        "target"
    ).innerHTML = "";


    // Clear R:R

    if (
        document.getElementById("rr")
    ) {

        document.getElementById(
            "rr"
        ).innerHTML = "";

    }


    // Clear reason

    if (
        document.getElementById("reason")
    ) {

        document.getElementById(
            "reason"
        ).innerHTML = "";

    }

}
