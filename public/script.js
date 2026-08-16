// ==========================================
// AI TRADING ASSISTANT - FRONTEND
// ==========================================

let image1H = null;
let image30M = null;
let image5M = null;


// ==========================================
// IMAGE READER
// ==========================================

function readImage(file) {

    return new Promise((resolve, reject) => {

        if (!file) {
            reject(new Error("No image selected"));
            return;
        }

        const reader = new FileReader();

        reader.onload = () => {
            resolve(reader.result);
        };

        reader.onerror = () => {
            reject(new Error("Could not read image"));
        };

        reader.readAsDataURL(file);
    });
}


// ==========================================
// IMAGE PREVIEW
// ==========================================

function setupImageInput(inputId, previewId, type) {

    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);

    if (!input || !preview) {
        return;
    }

    input.addEventListener("change", async function () {

        const file = this.files[0];

        if (!file) {
            return;
        }

        try {

            const image = await readImage(file);

            preview.src = image;
            preview.style.display = "block";

            if (type === "1H") {
                image1H = image;
            }

            if (type === "30M") {
                image30M = image;
            }

            if (type === "5M") {
                image5M = image;
            }

        } catch (error) {

            console.error(error);

            showStatus(
                "❌ Could not load image.",
                true
            );
        }

    });
}


// ==========================================
// SETUP ALL THREE CHART INPUTS
// ==========================================

setupImageInput(
    "chart1H",
    "preview1H",
    "1H"
);

setupImageInput(
    "chart30M",
    "preview30M",
    "30M"
);

setupImageInput(
    "chart5M",
    "preview5M",
    "5M"
);


// ==========================================
// STATUS MESSAGE
// ==========================================

function showStatus(message, error = false) {

    const result =
        document.getElementById("result");

    if (!result) {
        return;
    }

    result.textContent = message;

    result.style.display = "block";

    if (error) {
        result.className = "error";
    } else {
        result.className = "status";
    }
}


// ==========================================
// ANALYZE CHARTS
// ==========================================

async function analyzeChart() {

    // --------------------------------------
    // CHECK ALL THREE IMAGES
    // --------------------------------------

    if (!image1H || !image30M || !image5M) {

        showStatus(
            "⚠️ Please upload all 3 charts: 1H, 30M and 5M.",
            true
        );

        return;
    }


    // --------------------------------------
    // SHOW LOADING
    // --------------------------------------

    showStatus(
        "🔄 Analyzing 1H + 30M + 5M charts..."
    );


    const analyzeButton =
        document.querySelector(".analyze-btn");

    if (analyzeButton) {

        analyzeButton.disabled = true;

        analyzeButton.textContent =
            "⏳ Analyzing...";
    }


    try {

        // ----------------------------------
        // SEND TO SERVER
        // ----------------------------------

        const response =
            await fetch("/analyze", {

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

            });


        // ----------------------------------
        // READ RESPONSE
        // ----------------------------------

        const data =
            await response.json();


        // ----------------------------------
        // SERVER ERROR
        // ----------------------------------

        if (!response.ok || !data.success) {

            throw new Error(
                data.error ||
                "Analysis failed"
            );
        }


        // ----------------------------------
        // DISPLAY RESULTS
        // ----------------------------------

        displayResult(data);


        showStatus(
            "✅ Analysis completed."
        );


    } catch (error) {

        console.error(
            "ANALYSIS ERROR:",
            error
        );


        showStatus(
            "❌ " + error.message,
            true
        );


    } finally {

        if (analyzeButton) {

            analyzeButton.disabled = false;

            analyzeButton.textContent =
                "🔍 Analyze Charts";
        }

    }
}


// ==========================================
// DISPLAY RESULT
// ==========================================

function displayResult(data) {

    setText(
        "signal",
        "Signal: ",
        data.signal
    );

    setText(
        "entry",
        "Entry: ",
        data.entry
    );

    setText(
        "stoploss",
        "Stop Loss: ",
        data.stopLoss
    );

    setText(
        "target",
        "Target: ",
        data.target
    );

    setText(
        "reason",
        "Reason: ",
        data.reason
    );

    setText(
        "confirmation",
        "Confirmation: ",
        data.confirmation
    );

    setText(
        "trend",
        "Trend: ",
        data.trend
    );

    setText(
        "support",
        "Support: ",
        data.support
    );

    setText(
        "resistance",
        "Resistance: ",
        data.resistance
    );


    // --------------------------------------
    // SIGNAL STYLE
    // --------------------------------------

    const signal =
        document.getElementById("signal");

    if (signal) {

        signal.classList.remove(
            "buy",
            "sell",
            "no-trade"
        );


        const value =
            String(
                data.signal || ""
            ).toUpperCase();


        if (value === "BUY") {

            signal.classList.add(
                "buy"
            );

        } else if (value === "SELL") {

            signal.classList.add(
                "sell"
            );

        } else {

            signal.classList.add(
                "no-trade"
            );

        }

    }

}


// ==========================================
// SET RESULT TEXT
// ==========================================

function setText(
    elementId,
    label,
    value
) {

    const element =
        document.getElementById(
            elementId
        );

    if (!element) {
        return;
    }

    element.textContent =
        label +
        (
            value !== undefined &&
            value !== null &&
            value !== ""
                ? value
                : "-"
        );
}


// ==========================================
// CLEAR RESULTS
// ==========================================

function clearResult() {

    image1H = null;
    image30M = null;
    image5M = null;


    // --------------------------------------
    // CLEAR FILE INPUTS
    // --------------------------------------

    const inputs = [
        "chart1H",
        "chart30M",
        "chart5M"
    ];


    inputs.forEach(id => {

        const input =
            document.getElementById(id);

        if (input) {
            input.value = "";
        }

    });


    // --------------------------------------
    // CLEAR PREVIEWS
    // --------------------------------------

    const previews = [
        "preview1H",
        "preview30M",
        "preview5M"
    ];


    previews.forEach(id => {

        const preview =
            document.getElementById(id);

        if (preview) {

            preview.src = "";

            preview.style.display =
                "none";
        }

    });


    // --------------------------------------
    // CLEAR RESULTS
    // --------------------------------------

    const resultIds = [

        "signal",
        "entry",
        "stoploss",
        "target",
        "reason",
        "confirmation",
        "trend",
        "support",
        "resistance"

    ];


    resultIds.forEach(id => {

        const element =
            document.getElementById(id);

        if (element) {

            element.textContent =
                "";

            element.classList.remove(
                "buy",
                "sell",
                "no-trade"
            );
        }

    });


    const result =
        document.getElementById("result");

    if (result) {

        result.textContent = "";

        result.style.display =
            "none";

    }

}


// ==========================================
// INITIAL MESSAGE
// ==========================================

console.log(
    "AI Trading Assistant frontend loaded."
);
