const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const outDir = path.join(__dirname, '..', 'output', 'playwright');
const cases = [
  { name: 'w390-h932', width: 390, height: 932 },
  { name: 'w430-h932', width: 430, height: 932 }
];

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function captureCase(item) {
  const win = new BrowserWindow({
    show: false,
    width: item.width,
    height: item.height,
    useContentSize: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true
    }
  });

  try {
    await win.loadURL('http://localhost:3000/');
    await wait(1800);
    const image = await win.webContents.capturePage();
    const outPath = path.join(outDir, `${item.name}.png`);
    fs.writeFileSync(outPath, image.toPNG());

    const metrics = await win.webContents.executeJavaScript(
      `({innerWidth: window.innerWidth, innerHeight: window.innerHeight, dpr: window.devicePixelRatio, href: location.href})`,
      true
    );

    return { ok: true, outPath, metrics };
  } catch (error) {
    return { ok: false, error: String(error) };
  } finally {
    win.destroy();
  }
}

app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];
  for (const item of cases) {
    // eslint-disable-next-line no-await-in-loop
    const result = await captureCase(item);
    results.push({ case: item, result });
  }

  const resultsPath = path.join(outDir, 'capture-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`saved:${resultsPath}`);
  app.quit();
});
