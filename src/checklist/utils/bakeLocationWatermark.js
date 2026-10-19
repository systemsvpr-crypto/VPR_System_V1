// Burns the capture time and GPS coordinates into the bottom of a photo, so
// the proof survives even if the image is downloaded and the stored
// metadata is lost. Returns a new JPEG File; non-images pass through.

export const formatLocationLines = (meta) => {
  if (!meta) return [];
  const lat = Number(meta.latitude ?? meta.lat);
  const lng = Number(meta.longitude ?? meta.lng);
  const when = meta.captured_at ? new Date(meta.captured_at) : new Date();
  const lines = [
    when.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }),
  ];
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    lines.push(`Lat ${lat.toFixed(6)}, Lng ${lng.toFixed(6)}`);
  }
  if (meta.address) lines.push(meta.address);
  if (meta.accuracy) lines.push(`Accuracy ±${meta.accuracy} m`);
  return lines;
};

// Splits `text` into lines that fit `maxWidth` with the context's font.
const wrapLine = (ctx, text, maxWidth) => {
  const out = [];
  let current = "";
  for (const word of text.split(" ")) {
    const next = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(next).width > maxWidth) {
      out.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) out.push(current);
  return out;
};

export const bakeLocationWatermark = async (file, meta) => {
  if (!file || !file.type?.startsWith("image/") || !meta) return file;
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    URL.revokeObjectURL(url);

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    const fontSize = Math.max(14, Math.round(img.width / 45));
    const pad = Math.round(fontSize * 0.6);
    const lineH = Math.round(fontSize * 1.3);
    ctx.font = `600 ${fontSize}px sans-serif`;
    const lines = formatLocationLines(meta).flatMap((l) =>
      wrapLine(ctx, l, img.width - pad * 2),
    );
    const boxH = lines.length * lineH + pad * 2;

    // No backing box — a dark shadow keeps the text legible on light photos.
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
    ctx.shadowBlur = Math.round(fontSize * 0.4);
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.textBaseline = "top";
    lines.forEach((line, i) => {
      ctx.fillText(line, pad, img.height - boxH + pad + i * lineH);
    });

    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.88));
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
};
