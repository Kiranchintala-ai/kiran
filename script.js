const API_KEY = "PASTE_YOUR_OPENROUTER_API_KEY_HERE";

document.getElementById("imageUpload").addEventListener("change", function () {
    const file = this.files[0];
    if (!file) return;

    const preview = document.getElementById("preview");
    preview.src = URL.createObjectURL(file);
    preview.style.display = "block";
});

async function analyzeChart() {
    const result = document.getElementById("result");
    result.innerHTML = "🤖 AI is analyzing...";

    const file = document.getElementById("imageUpload").files[0];

    if (!file) {
        result.innerHTML = "Please select an image first.";
        return;
    }

    result.innerHTML =
`✅ Frontend is working!

Image Selected:
${file.name}

Next Step:
Now we will connect the AI API.`;
}