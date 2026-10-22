import { CanvasTexture, SRGBColorSpace } from "three";

// Text drawn on a canvas once and cached (signs, name tags). No web fonts are fetched:
// it uses the system UI font, so nothing loads from a CDN at runtime.
const cache = new Map();

export function textTexture(
  text,
  {
    width = 512,
    height = 128,
    background = "#12352a",
    color = "#f8fafc",
    border = "#f5b70a",
    size = 54,
  } = {},
) {
  const key = [text, width, height, background, color, border, size].join("|");
  if (cache.has(key)) return cache.get(key);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (background) {
    ctx.fillStyle = background;
    ctx.beginPath();
    ctx.roundRect?.(4, 4, width - 8, height - 8, 18);
    ctx.fill();
    if (border) {
      ctx.lineWidth = 6;
      ctx.strokeStyle = border;
      ctx.stroke();
    }
  }
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let fontSize = size;
  // shrink long names to fit
  do {
    ctx.font = `700 ${fontSize}px system-ui, "Segoe UI", sans-serif`;
    fontSize -= 2;
  } while (ctx.measureText(text).width > width - 40 && fontSize > 14);
  ctx.fillText(text, width / 2, height / 2 + 2);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  cache.set(key, texture);
  return texture;
}
