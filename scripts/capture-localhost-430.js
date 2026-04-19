const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const outDir = path.join(__dirname, '..', 'output', 'playwright');

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true });

  const win = new BrowserWindow({
    show: false,
    width: 430,
    height: 932,
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
    fs.writeFileSync(path.join(outDir, 'w430-h932.png'), image.toPNG());
    const metrics = await win.webContents.executeJavaScript(
      `({innerWidth: window.innerWidth, innerHeight: window.innerHeight, dpr: window.devicePixelRatio, href: location.href})`,
      true
    );
    fs.writeFileSync(path.join(outDir, 'w430-h932.metrics.json'), JSON.stringify(metrics, null, 2));
    console.log('ok');
  } catch (error) {
    console.error(String(error));
  }

  app.quit();
});
