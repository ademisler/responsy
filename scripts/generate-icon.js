const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const assetsDir = path.join(root, "assets");
const iconSetDir = path.join(assetsDir, "icon.iconset");

const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#101626"/>
      <stop offset="100%" stop-color="#21334a"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="48%" r="40%">
      <stop offset="0%" stop-color="#4fe5d5" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#4fe5d5" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="barA" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#8dfff3"/>
      <stop offset="100%" stop-color="#59dbc9"/>
    </linearGradient>
    <linearGradient id="barB" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#5fead8"/>
      <stop offset="100%" stop-color="#34b4a2"/>
    </linearGradient>
  </defs>

  <rect width="1024" height="1024" rx="220" fill="url(#bg)"/>
  <circle cx="512" cy="500" r="360" fill="url(#glow)"/>

  <rect x="122" y="122" width="780" height="780" rx="190" fill="#081220" fill-opacity="0.92" stroke="#6fe6d8" stroke-opacity="0.45" stroke-width="6"/>
  <rect x="140" y="140" width="744" height="744" rx="174" fill="none" stroke="white" stroke-opacity="0.12" stroke-width="2"/>

  <rect x="330" y="350" width="92" height="340" rx="34" fill="url(#barA)"/>
  <rect x="466" y="286" width="92" height="404" rx="34" fill="url(#barB)"/>
  <rect x="602" y="410" width="92" height="280" rx="34" fill="url(#barA)"/>

  <path d="M302 582c56-118 165-194 284-196 46-1 90 9 131 28"
        fill="none" stroke="#cafff9" stroke-opacity="0.58" stroke-width="24" stroke-linecap="round"/>
</svg>
`;

const sizes = [
  { name: "icon_16x16.png", size: 16 },
  { name: "icon_16x16@2x.png", size: 32 },
  { name: "icon_32x32.png", size: 32 },
  { name: "icon_32x32@2x.png", size: 64 },
  { name: "icon_128x128.png", size: 128 },
  { name: "icon_128x128@2x.png", size: 256 },
  { name: "icon_256x256.png", size: 256 },
  { name: "icon_256x256@2x.png", size: 512 },
  { name: "icon_512x512.png", size: 512 },
  { name: "icon_512x512@2x.png", size: 1024 }
];

async function generate() {
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.mkdirSync(iconSetDir, { recursive: true });

  const sourcePng = path.join(assetsDir, "icon-1024.png");
  await sharp(Buffer.from(iconSvg)).png({ compressionLevel: 9 }).toFile(sourcePng);

  for (const entry of sizes) {
    const outPath = path.join(iconSetDir, entry.name);
    await sharp(sourcePng).resize(entry.size, entry.size).png({ compressionLevel: 9 }).toFile(outPath);
  }
}

generate().catch((error) => {
  console.error(error);
  process.exit(1);
});
