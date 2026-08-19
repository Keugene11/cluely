// Generates build/icon.png — a dark rounded tile with a white 4-point sparkle,
// matching the app's mark. No image libraries: raw RGBA -> PNG via zlib.
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const S = 512;
const data = Buffer.alloc(S * S * 4);

const cx = S / 2;
const cy = S / 2;
const radius = 96; // corner radius
const bg = [14, 14, 15]; // #0e0e0f

function inRoundedTile(x, y) {
  const dx = Math.max(0, radius - x, x - (S - radius));
  const dy = Math.max(0, radius - y, y - (S - radius));
  return dx * dx + dy * dy <= radius * radius;
}

// Astroid-style 4-point sparkle: (|x|/r)^p + (|y|/r)^p <= 1 with p < 1 gives
// concave points. A second, smaller sparkle adds the classic twinkle.
function sparkle(x, y, r, p) {
  const nx = Math.abs(x - cx) / r;
  const ny = Math.abs(y - cy) / r;
  return Math.pow(nx, p) + Math.pow(ny, p) <= 1;
}

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const tile = inRoundedTile(x, y);
    const isStar =
      sparkle(x, y, 150, 0.5) || sparkle(x - 96, y - 96, 46, 0.5);

    if (!tile) {
      data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0; // transparent
    } else if (isStar) {
      data[i] = 245;
      data[i + 1] = 245;
      data[i + 2] = 245;
      data[i + 3] = 255;
    } else {
      data[i] = bg[0];
      data[i + 1] = bg[1];
      data[i + 2] = bg[2];
      data[i + 3] = 255;
    }
  }
}

// PNG: filter byte (0) per scanline, then zlib deflate.
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  data.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}

function chunk(type, payload) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(payload.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, payload])) >>> 0);
  return Buffer.concat([len, typeBuf, payload, crc]);
}

const crcTable = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = path.join(process.cwd(), "build", "icon.png");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log("wrote", out, `(${png.length} bytes, ${S}x${S})`);
