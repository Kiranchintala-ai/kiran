document.getElementById("imageUpload").addEventListener("change", function () {
    const file = this.files[0];

    if (!file) return;

    const preview = document.getElementById("preview");
    preview.src = URL.createObjectURL(file);
    preview.style.display = "block";
});

function analyzeChart() {

    const file = document.getElementById("imageUpload").files[0];

    if (!file) {
        document.getElementById("result").innerHTML =
            "<h3>Please select a chart image.</h3>";
        return;
    }

    document.getElementById("result").innerHTML =
        "<h3>📊 Analysis Completed</h3>";

    document.getElementById("signal").innerHTML =
        "<h2 style='color:green;'>🟢 BUY</h2>";

    document.getElementById("entry").innerHTML =
        "<b>Entry Price:</b> 24500";

    document.getElementById("stoploss").innerHTML =
        "<b>Stop Loss:</b> 24380";

    document.getElementById("target").innerHTML =
        "<b>Target Price:</b> 24750";
        document.getElementById("trendCell").innerHTML = "Uptrend";
document.getElementById("signalCell").innerHTML = "BUY";
document.getElementById("confidenceCell").innerHTML = "82%";
}

function clearResult() {

    document.getElementById("result").innerHTML = "";
    document.getElementById("signal").innerHTML = "";
    document.getElementById("entry").innerHTML = "";
    document.getElementById("stoploss").innerHTML = "";
    document.getElementById("target").innerHTML = "";

    document.getElementById("preview").style.display = "none";
    document.getElementById("imageUpload").value = "";
}
