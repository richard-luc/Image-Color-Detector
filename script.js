const fileInput = document.querySelector("#fileInput");
const dropZone = document.querySelector("#dropZone");
const canvas = document.querySelector("#previewCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const analysisCanvas = document.createElement("canvas");
const analysisCtx = analysisCanvas.getContext("2d", { willReadFrequently: true });
const emptyState = document.querySelector("#emptyState");
const paletteGrid = document.querySelector("#paletteGrid");
const smartModeButton = document.querySelector("#smartMode");
const exactModeButton = document.querySelector("#exactMode");
const copyButton = document.querySelector("#copyButton");
const coverageRange = document.querySelector("#coverageRange");
const precisionRange = document.querySelector("#precisionRange");
const coverageValue = document.querySelector("#coverageValue");
const precisionValue = document.querySelector("#precisionValue");
const fileName = document.querySelector("#fileName");
const metaLine = document.querySelector("#metaLine");
const colorCount = document.querySelector("#colorCount");
const pixelCount = document.querySelector("#pixelCount");
const coverageTop = document.querySelector("#coverageTop");
const paletteTitle = document.querySelector("#paletteTitle");

const state = {
  mode: "smart",
  sourceName: "",
  imageData: null,
  visiblePixels: 0,
  exactColors: [],
  smartColors: [],
};

fileInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) loadFile(file);
});

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  });
});

dropZone.addEventListener("drop", (event) => {
  const [file] = event.dataTransfer.files;
  if (file && file.type.startsWith("image/")) loadFile(file);
});

smartModeButton.addEventListener("click", () => setMode("smart"));
exactModeButton.addEventListener("click", () => setMode("exact"));
coverageRange.addEventListener("input", renderPalette);
precisionRange.addEventListener("input", () => {
  precisionValue.value = precisionRange.value;
  recomputeSmartPalette();
  renderPalette();
});

copyButton.addEventListener("click", async () => {
  const colors = getVisiblePalette().map((color) => color.hex).join(", ");
  await copyText(colors);
  copyButton.textContent = "Copied";
  window.setTimeout(() => {
    copyButton.textContent = "Copy HEX";
  }, 1200);
});

function loadFile(file) {
  loadImage(URL.createObjectURL(file), file.name, true);
}

function loadImage(src, name, revokeWhenLoaded = false) {
  const image = new Image();
  image.onload = () => {
    drawImageToCanvas(image);
    analyzeImage(image);
    state.sourceName = name;
    fileName.textContent = name;
    emptyState.classList.add("hidden");
    if (revokeWhenLoaded) URL.revokeObjectURL(src);
  };
  image.onerror = () => {
    metaLine.textContent = "This image could not be loaded. Try another image file.";
    if (revokeWhenLoaded) URL.revokeObjectURL(src);
  };
  image.src = src;
}

function drawImageToCanvas(image) {
  const maxWidth = 1400;
  const maxHeight = 900;
  const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1);
  const drawWidth = Math.max(1, Math.round(image.naturalWidth * scale));
  const drawHeight = Math.max(1, Math.round(image.naturalHeight * scale));

  canvas.width = drawWidth;
  canvas.height = drawHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, drawWidth, drawHeight);
}

function analyzeImage(image) {
  const maxAnalysisSide = 4096;
  const analysisScale = Math.min(
    maxAnalysisSide / image.naturalWidth,
    maxAnalysisSide / image.naturalHeight,
    1,
  );
  const analysisWidth = Math.max(1, Math.round(image.naturalWidth * analysisScale));
  const analysisHeight = Math.max(1, Math.round(image.naturalHeight * analysisScale));

  analysisCanvas.width = analysisWidth;
  analysisCanvas.height = analysisHeight;
  analysisCtx.clearRect(0, 0, analysisWidth, analysisHeight);
  analysisCtx.drawImage(image, 0, 0, analysisWidth, analysisHeight);

  let imageData;
  try {
    imageData = analysisCtx.getImageData(0, 0, analysisWidth, analysisHeight);
  } catch (error) {
    metaLine.textContent =
      "This file cannot be analyzed because the browser blocked pixel access. Try exporting it as PNG.";
    return;
  }

  const resizedNote =
    analysisScale < 1
      ? ` - analyzed at ${analysisWidth} x ${analysisHeight}px for browser safety`
      : "";
  metaLine.textContent = `${image.naturalWidth} x ${image.naturalHeight}px analyzed on-device${resizedNote}`;
  state.imageData = imageData;
  const counts = new Map();
  let visiblePixels = 0;

  for (let index = 0; index < imageData.data.length; index += 4) {
    const alpha = imageData.data[index + 3];
    if (alpha < 10) continue;

    const red = flattenChannel(imageData.data[index], alpha);
    const green = flattenChannel(imageData.data[index + 1], alpha);
    const blue = flattenChannel(imageData.data[index + 2], alpha);
    const key = `${red},${green},${blue}`;
    counts.set(key, (counts.get(key) || 0) + 1);
    visiblePixels += 1;
  }

  state.visiblePixels = visiblePixels;
  state.exactColors = [...counts.entries()]
    .map(([key, count]) => makeColor(key.split(",").map(Number), count, visiblePixels))
    .sort((a, b) => b.count - a.count);

  recomputeSmartPalette();
  renderPalette();
}

function flattenChannel(channel, alpha) {
  if (alpha >= 255) return channel;
  return Math.round((channel * alpha + 255 * (255 - alpha)) / 255);
}

function recomputeSmartPalette() {
  if (!state.exactColors.length) {
    state.smartColors = [];
    return;
  }

  const bucketSize = Number(precisionRange.value);
  const buckets = new Map();

  state.exactColors.forEach((color) => {
    const key = [
      Math.round(color.rgb[0] / bucketSize),
      Math.round(color.rgb[1] / bucketSize),
      Math.round(color.rgb[2] / bucketSize),
    ].join(",");

    if (!buckets.has(key)) {
      buckets.set(key, { count: 0, red: 0, green: 0, blue: 0 });
    }

    const bucket = buckets.get(key);
    bucket.count += color.count;
    bucket.red += color.rgb[0] * color.count;
    bucket.green += color.rgb[1] * color.count;
    bucket.blue += color.rgb[2] * color.count;
  });

  state.smartColors = [...buckets.values()]
    .map((bucket) =>
      makeColor(
        [
          Math.round(bucket.red / bucket.count),
          Math.round(bucket.green / bucket.count),
          Math.round(bucket.blue / bucket.count),
        ],
        bucket.count,
        state.visiblePixels,
      ),
    )
    .sort((a, b) => b.count - a.count);
}

function makeColor(rgb, count, total) {
  return {
    rgb,
    count,
    hex: rgbToHex(rgb),
    percent: total ? (count / total) * 100 : 0,
  };
}

function rgbToHex([red, green, blue]) {
  return `#${[red, green, blue]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function setMode(mode) {
  state.mode = mode;
  smartModeButton.classList.toggle("active", mode === "smart");
  exactModeButton.classList.toggle("active", mode === "exact");
  renderPalette();
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.inset = "-1000px auto auto -1000px";
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand("copy");
  textArea.remove();
}

function getVisiblePalette() {
  const minimum = Number(coverageRange.value);
  const colors = state.mode === "smart" ? state.smartColors : state.exactColors;
  return colors.filter((color) => color.percent >= minimum).slice(0, state.mode === "smart" ? 48 : 160);
}

function renderPalette() {
  coverageValue.value = `${Number(coverageRange.value).toFixed(coverageRange.value % 1 ? 1 : 0)}%`;
  precisionValue.value = precisionRange.value;
  paletteTitle.textContent = state.mode === "smart" ? "Detected palette" : "Exact pixel colors";

  const colors = getVisiblePalette();
  paletteGrid.innerHTML = "";
  copyButton.disabled = colors.length === 0;
  colorCount.textContent = colors.length.toLocaleString();
  pixelCount.textContent = state.visiblePixels.toLocaleString();
  coverageTop.textContent = colors[0] ? `${colors[0].percent.toFixed(1)}%` : "0%";

  if (!colors.length) {
    paletteGrid.innerHTML = `<p class="meta-line">No colors match the current settings.</p>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  colors.forEach((color) => {
    const card = document.createElement("article");
    card.className = "color-card";
    card.innerHTML = `
      <span class="swatch" style="background:${color.hex}" aria-hidden="true"></span>
      <span class="color-data">
        <span class="hex">${color.hex}</span>
        <span class="rgb">RGB ${color.rgb.join(", ")}</span>
        <span class="coverage">${color.percent.toFixed(2)}% - ${color.count.toLocaleString()} px</span>
      </span>
    `;
    fragment.appendChild(card);
  });

  paletteGrid.appendChild(fragment);
}
