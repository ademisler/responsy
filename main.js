const fs = require("node:fs/promises");
const path = require("path");

const sharp = require("sharp");
const {
  app,
  BrowserWindow,
  WebContentsView,
  clipboard,
  ipcMain,
  nativeImage,
  screen,
  shell
} = require("electron");

const WINDOW_MARGIN = 24;
const PANEL_MARGIN = 14;
const PANEL_WIDTH = 296;
const PANEL_MIN_WIDTH = 252;
const HANDLE_WIDTH = 58;
const HANDLE_HEIGHT = 118;
const COLLAPSED_RAIL = 68;
const TOP_DRAG_HEIGHT = 14;
const VIEW_BORDER_RADIUS = 28;
const PANEL_BORDER_RADIUS = 24;
const SCREENSHOT_SETTLE_MS = 140;
const VIEWPORTS = {
  mobile: { width: 430, height: 932 },
  tablet: { width: 834, height: 1112 },
  desktop: { width: 1440, height: 900 }
};
const WINDOW_REGISTRY = new Map();
const INTERNAL_URL_PREFIX = "data:text/html;charset=utf-8,";

function getStateBySender(sender) {
  for (const state of WINDOW_REGISTRY.values()) {
    if (
      state.panelView.webContents === sender ||
      state.siteView.webContents === sender ||
      state.window.webContents === sender
    ) {
      return state;
    }
  }

  return null;
}

function normalizeUrl(input) {
  if (!input || typeof input !== "string") {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    return null;
  }

  return null;
}

function isInternalUrl(url) {
  return typeof url === "string" && url.startsWith(INTERNAL_URL_PREFIX);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getShortcutLabel() {
  return process.platform === "darwin" ? "Command+L" : "Ctrl+L";
}

function getHostnameLabel(url) {
  if (!url) {
    return "preview";
  }

  try {
    return new URL(url).hostname.replace(/^www\./i, "") || "preview";
  } catch {
    return "preview";
  }
}

function sanitizeFilenamePart(value) {
  return String(value || "preview")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "preview";
}

function getTimestampLabel() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");

  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate())
  ].join("") + "-" + [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join("");
}

function serializeState(state, extra = {}) {
  return {
    url: state.currentUrl,
    title: state.title,
    loading: state.loading,
    loadingTarget: state.loadingTarget,
    activeView: state.activeView,
    panelOpen: state.panelOpen,
    canGoBack: state.siteView.webContents.navigationHistory.canGoBack(),
    canGoForward: state.siteView.webContents.navigationHistory.canGoForward(),
    ...extra
  };
}

function emitState(state, extra = {}) {
  state.panelView.webContents.send("responsy:state", serializeState(state, extra));
}

function emitNotice(state, message, tone = "info") {
  state.panelView.webContents.send("responsy:notice", { message, tone });
}

function getClampedContentSize(win, activeView, panelOpen) {
  const viewport = VIEWPORTS[activeView] || VIEWPORTS.mobile;
  const display = screen.getDisplayMatching(win.getBounds());
  const maxWidth = Math.max(360, display.workArea.width - WINDOW_MARGIN);
  const maxHeight = Math.max(520, display.workArea.height - WINDOW_MARGIN);
  const chromeWidth = panelOpen ? PANEL_WIDTH + PANEL_MARGIN * 2 : COLLAPSED_RAIL;

  return {
    width: Math.min(viewport.width + chromeWidth, maxWidth),
    height: Math.min(viewport.height, maxHeight)
  };
}

function clampWindowToWorkArea(win) {
  const bounds = win.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const maxX = display.workArea.x + Math.max(0, display.workArea.width - bounds.width);
  const maxY = display.workArea.y + Math.max(0, display.workArea.height - bounds.height);
  const nextX = Math.min(Math.max(bounds.x, display.workArea.x), maxX);
  const nextY = Math.min(Math.max(bounds.y, display.workArea.y), maxY);

  if (nextX !== bounds.x || nextY !== bounds.y) {
    win.setPosition(nextX, nextY);
  }
}

function updateLoadingView(state) {
  if (!state.loading) {
    state.loadingView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    return;
  }

  const siteBounds = state.siteView.getBounds();
  state.loadingView.setBounds(siteBounds);
  state.loadingView.setBorderRadius(VIEW_BORDER_RADIUS);
}

function layoutWindow(state) {
  const [windowWidth, windowHeight] = state.window.getContentSize();
  const panelWidth = state.panelOpen
    ? Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_WIDTH, windowWidth - PANEL_MARGIN * 2 - 160))
    : HANDLE_WIDTH;
  const panelHeight = state.panelOpen
    ? Math.max(280, windowHeight - PANEL_MARGIN * 2)
    : Math.min(HANDLE_HEIGHT, Math.max(72, windowHeight - PANEL_MARGIN * 2));
  const siteWidth = state.panelOpen
    ? Math.max(1, windowWidth - panelWidth - PANEL_MARGIN * 2)
    : Math.max(1, windowWidth - COLLAPSED_RAIL);
  const panelX = state.panelOpen
    ? Math.max(PANEL_MARGIN, windowWidth - panelWidth - PANEL_MARGIN)
    : Math.max(siteWidth + 6, windowWidth - panelWidth - 4);
  const panelY = state.panelOpen
    ? PANEL_MARGIN
    : Math.max(PANEL_MARGIN, Math.round((windowHeight - panelHeight) / 2));

  state.siteView.setBounds({
    x: 0,
    y: 0,
    width: siteWidth,
    height: windowHeight
  });
  state.siteView.setBorderRadius(VIEW_BORDER_RADIUS);

  updateLoadingView(state);

  state.dragView.setBounds({
    x: 0,
    y: 0,
    width: windowWidth,
    height: TOP_DRAG_HEIGHT
  });

  state.panelView.setBounds({
    x: panelX,
    y: panelY,
    width: panelWidth,
    height: panelHeight
  });
  state.panelView.setBorderRadius(state.panelOpen ? PANEL_BORDER_RADIUS : HANDLE_WIDTH / 2);
}

function applyWindowGeometry(state, shouldCenter = false) {
  const { width, height } = getClampedContentSize(state.window, state.activeView, state.panelOpen);
  const [currentWidth, currentHeight] = state.window.getContentSize();

  if (currentWidth !== width || currentHeight !== height) {
    state.window.setContentSize(width, height);
    if (shouldCenter) {
      state.window.center();
    } else {
      clampWindowToWorkArea(state.window);
    }
  }

  layoutWindow(state);
  emitState(state);
}

function buildLandingDataUrl({
  eyebrow = "Responsy",
  title = "Live preview is ready.",
  body = `Open the slim tab on the right to enter a URL, then switch device sizes from the same panel. Press ${getShortcutLabel()} anytime to focus the address field.`
} = {}) {
  const html = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Responsy</title>
        <style>
          html, body {
            margin: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
            background:
              radial-gradient(circle at top, rgba(104, 197, 182, 0.12), transparent 28%),
              linear-gradient(180deg, #060707, #0b0f0e 52%, #060707);
            color: #eef6f2;
          }

          body {
            display: grid;
            place-items: center;
          }

          .card {
            width: min(360px, calc(100vw - 48px));
            padding: 20px 22px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 24px;
            background: rgba(13, 17, 16, 0.72);
            box-shadow:
              0 18px 44px rgba(0, 0, 0, 0.34),
              inset 0 1px 0 rgba(255, 255, 255, 0.04);
            backdrop-filter: blur(18px);
          }

          .eyebrow {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 7px 11px;
            border-radius: 999px;
            font-size: 11px;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: #8be8db;
            background: rgba(47, 87, 81, 0.28);
          }

          h1 {
            margin: 14px 0 8px;
            font-size: clamp(24px, 4vw, 34px);
            line-height: 1;
            letter-spacing: -0.04em;
          }

          p {
            margin: 0;
            font-size: 14px;
            line-height: 1.55;
            color: rgba(239, 246, 243, 0.72);
          }
        </style>
      </head>
      <body>
        <section class="card">
          <div class="eyebrow">${escapeHtml(eyebrow)}</div>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(body)}</p>
        </section>
      </body>
    </html>
  `;

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function buildLoadingDataUrl(targetUrl) {
  const host = escapeHtml(getHostnameLabel(targetUrl));
  const html = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Loading</title>
        <style>
          :root {
            color-scheme: dark;
          }

          * {
            box-sizing: border-box;
          }

          html, body {
            margin: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
            background:
              radial-gradient(circle at top, rgba(118, 234, 219, 0.14), transparent 24%),
              linear-gradient(180deg, #071010 0%, #081112 100%);
            color: #eff7f4;
          }

          body {
            display: grid;
            place-items: center;
          }

          .shell {
            width: min(320px, calc(100vw - 40px));
            padding: 22px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 28px;
            background: rgba(9, 14, 13, 0.76);
            box-shadow:
              0 26px 56px rgba(0, 0, 0, 0.34),
              inset 0 1px 0 rgba(255, 255, 255, 0.04);
            backdrop-filter: blur(18px);
          }

          .host {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 7px 11px;
            border-radius: 999px;
            font-size: 11px;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            color: #8be8db;
            background: rgba(50, 95, 89, 0.3);
          }

          .loader {
            position: relative;
            width: 64px;
            height: 64px;
            margin: 18px 0 16px;
          }

          .loader::before,
          .loader::after {
            content: "";
            position: absolute;
            inset: 0;
            border-radius: 50%;
            border: 1px solid rgba(135, 230, 219, 0.35);
            animation: pulse 1.6s ease-out infinite;
          }

          .loader::after {
            inset: 12px;
            border-color: rgba(135, 230, 219, 0.85);
            animation: spin 1.1s linear infinite;
          }

          h1 {
            margin: 0 0 8px;
            font-size: 24px;
            line-height: 1;
            letter-spacing: -0.04em;
          }

          p {
            margin: 0;
            font-size: 14px;
            line-height: 1.55;
            color: rgba(239, 246, 243, 0.7);
          }

          @keyframes pulse {
            0% {
              opacity: 0.35;
              transform: scale(0.9);
            }

            70% {
              opacity: 1;
              transform: scale(1.02);
            }

            100% {
              opacity: 0.35;
              transform: scale(0.9);
            }
          }

          @keyframes spin {
            from {
              transform: rotate(0deg);
            }

            to {
              transform: rotate(360deg);
            }
          }
        </style>
      </head>
      <body>
        <section class="shell">
          <div class="host">${host}</div>
          <div class="loader" aria-hidden="true"></div>
          <h1>Loading live preview</h1>
          <p>The page is opening in the current device width. This panel will disappear as soon as the page is ready.</p>
        </section>
      </body>
    </html>
  `;

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function buildDragLayerDataUrl() {
  const html = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <style>
          html, body {
            margin: 0;
            width: 100%;
            height: 100%;
            background: transparent;
          }

          body {
            -webkit-app-region: drag;
          }
        </style>
      </head>
      <body></body>
    </html>
  `;

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function setLoadingState(state, loading, targetUrl = state.pendingUrl || state.currentUrl) {
  state.loading = loading;
  state.loadingTarget = loading ? targetUrl || state.loadingTarget || state.currentUrl : "";

  if (loading) {
    void state.loadingView.webContents.loadURL(buildLoadingDataUrl(state.loadingTarget));
  }

  layoutWindow(state);
  emitState(state);
}

async function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function captureVisibleScreenshot(state) {
  const image = await state.siteView.webContents.capturePage();
  return image.toPNG();
}

async function getDocumentMetrics(webContents) {
  return webContents.executeJavaScript(
    `(() => {
      const doc = document.documentElement;
      const body = document.body;
      const width = Math.max(
        window.innerWidth || 0,
        doc ? doc.clientWidth : 0,
        body ? body.clientWidth : 0,
        doc ? doc.scrollWidth : 0,
        body ? body.scrollWidth : 0
      );
      const height = Math.max(
        window.innerHeight || 0,
        doc ? doc.scrollHeight : 0,
        body ? body.scrollHeight : 0,
        doc ? doc.offsetHeight : 0,
        body ? body.offsetHeight : 0
      );
      return {
        width: Math.ceil(width),
        height: Math.ceil(height),
        scrollX: Math.max(window.scrollX || 0, window.pageXOffset || 0),
        scrollY: Math.max(window.scrollY || 0, window.pageYOffset || 0)
      };
    })();`,
    true
  );
}

async function captureFullPageScreenshot(state) {
  const { siteView } = state;
  const viewportBounds = siteView.getBounds();
  const viewportWidth = Math.max(1, viewportBounds.width);
  const viewportHeight = Math.max(1, viewportBounds.height);
  const metrics = await getDocumentMetrics(siteView.webContents);
  const totalHeight = Math.max(viewportHeight, metrics.height);
  const totalWidth = Math.max(viewportWidth, metrics.width);
  const slices = [];
  const originalScrollX = Math.max(0, Math.round(metrics.scrollX || 0));
  const originalScrollY = Math.max(0, Math.round(metrics.scrollY || 0));
  let pixelsPerDip = 1;
  let pixelWidth = 0;

  try {
    for (let offset = 0; offset < totalHeight; offset += viewportHeight) {
      await siteView.webContents.executeJavaScript(
        `(() => {
          const root = document.documentElement;
          const body = document.body;
          const rootBehavior = root ? root.style.scrollBehavior : "";
          const bodyBehavior = body ? body.style.scrollBehavior : "";
          if (root) root.style.scrollBehavior = "auto";
          if (body) body.style.scrollBehavior = "auto";
          window.scrollTo(0, ${offset});
          if (root) root.style.scrollBehavior = rootBehavior;
          if (body) body.style.scrollBehavior = bodyBehavior;
        })();`,
        true
      );
      await wait(SCREENSHOT_SETTLE_MS);

      const image = await siteView.webContents.capturePage({
        x: 0,
        y: 0,
        width: viewportWidth,
        height: viewportHeight
      });
      const png = image.toPNG();
      const metadata = await sharp(png).metadata();

      if (!pixelWidth) {
        pixelWidth = metadata.width || viewportWidth;
        pixelsPerDip = pixelWidth / viewportWidth || 1;
      }

      const remainingHeight = Math.min(viewportHeight, totalHeight - offset);
      const pixelHeight = metadata.height || Math.round(viewportHeight * pixelsPerDip);
      const cropHeight = Math.max(1, Math.min(pixelHeight, Math.round(remainingHeight * pixelsPerDip)));
      const input = cropHeight === pixelHeight
        ? png
        : await sharp(png)
            .extract({
              left: 0,
              top: 0,
              width: metadata.width || pixelWidth,
              height: cropHeight
            })
            .png()
            .toBuffer();

      slices.push({
        input,
        top: Math.round(offset * pixelsPerDip),
        left: 0
      });
    }
  } finally {
    await siteView.webContents
      .executeJavaScript(
        `(() => {
          const root = document.documentElement;
          const body = document.body;
          const rootBehavior = root ? root.style.scrollBehavior : "";
          const bodyBehavior = body ? body.style.scrollBehavior : "";
          if (root) root.style.scrollBehavior = "auto";
          if (body) body.style.scrollBehavior = "auto";
          window.scrollTo(${originalScrollX}, ${originalScrollY});
          if (root) root.style.scrollBehavior = rootBehavior;
          if (body) body.style.scrollBehavior = bodyBehavior;
        })();`,
        true
      )
      .catch(() => {});
  }

  const canvas = sharp({
    create: {
      width: Math.max(1, Math.round(totalWidth * pixelsPerDip)),
      height: Math.max(1, Math.round(totalHeight * pixelsPerDip)),
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  });

  return canvas.composite(slices).png().toBuffer();
}

function buildScreenshotPath(state, mode) {
  const downloadsPath = app.getPath("downloads");
  const host = sanitizeFilenamePart(getHostnameLabel(state.currentUrl));
  const filename = `responsy-${host}-${state.activeView}-${mode}-${getTimestampLabel()}.png`;

  return path.join(downloadsPath, filename);
}

async function storeScreenshot(buffer, state, mode) {
  const outputPath = buildScreenshotPath(state, mode);
  await fs.writeFile(outputPath, buffer);
  clipboard.writeImage(nativeImage.createFromBuffer(buffer));
  return outputPath;
}

function attachSiteEvents(state) {
  const { siteView } = state;

  siteView.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        shell.openExternal(url);
      }
    } catch {
      // Ignore malformed targets coming from remote pages.
    }

    return { action: "deny" };
  });

  siteView.webContents.on("before-input-event", (event, input) => {
    const key = String(input.key || "").toLowerCase();
    const isMeta = Boolean(input.meta || input.control);

    if (isMeta && key === "l") {
      event.preventDefault();
      state.panelOpen = true;
      applyWindowGeometry(state, false);
      emitState(state, { focusAddress: true });
      return;
    }

    if (key === "escape" && state.panelOpen) {
      event.preventDefault();
      state.panelOpen = false;
      applyWindowGeometry(state, false);
    }
  });

  siteView.webContents.on("did-start-loading", () => {
    const target = state.pendingUrl || state.siteView.webContents.getURL() || state.currentUrl;
    if (isInternalUrl(target)) {
      return;
    }

    setLoadingState(state, true, target);
  });

  siteView.webContents.on("did-stop-loading", () => {
    state.pendingUrl = "";
    const currentUrl = siteView.webContents.getURL();

    if (!isInternalUrl(currentUrl) && currentUrl) {
      state.currentUrl = currentUrl;
      state.title = siteView.webContents.getTitle() || state.title;
    }

    setLoadingState(state, false);
  });

  siteView.webContents.on("page-title-updated", (event, title) => {
    event.preventDefault();
    state.title = title || "Responsy";
    emitState(state);
  });

  siteView.webContents.on("did-navigate", (_event, url) => {
    if (!isInternalUrl(url)) {
      state.currentUrl = url;
      emitState(state);
    }
  });

  siteView.webContents.on("did-navigate-in-page", (_event, url) => {
    if (!isInternalUrl(url)) {
      state.currentUrl = url;
      emitState(state);
    }
  });

  siteView.webContents.on("did-fail-load", (_event, errorCode, _description, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) {
      return;
    }

    state.pendingUrl = "";
    state.title = "Load error";
    state.loading = false;
    state.loadingTarget = "";
    layoutWindow(state);
    emitState(state);
    emitNotice(state, "The page could not be loaded.", "error");

    if (validatedURL && !isInternalUrl(validatedURL)) {
      state.currentUrl = validatedURL;
    }

    void siteView.webContents.loadURL(
      buildLandingDataUrl({
        eyebrow: "Load error",
        title: "This page could not be loaded.",
        body: "Check the address and try again from the control panel."
      })
    );
  });
}

function createWindow() {
  const initial = VIEWPORTS.mobile;
  const mainWindow = new BrowserWindow({
    width: initial.width + COLLAPSED_RAIL,
    height: initial.height,
    useContentSize: true,
    minWidth: 360,
    minHeight: 520,
    frame: false,
    show: true,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    title: "Responsy"
  });

  const siteView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      partition: "persist:responsy"
    }
  });
  siteView.setBackgroundColor("#00000000");

  const loadingView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });
  loadingView.setBackgroundColor("#00000000");

  const dragView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true
    }
  });
  dragView.setBackgroundColor("#00000000");

  const panelView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });
  panelView.setBackgroundColor("#00000000");

  const state = {
    window: mainWindow,
    siteView,
    loadingView,
    dragView,
    panelView,
    activeView: "mobile",
    panelOpen: false,
    loading: false,
    loadingTarget: "",
    pendingUrl: "",
    currentUrl: "",
    title: "Responsy",
    handleDragOrigin: null
  };

  WINDOW_REGISTRY.set(mainWindow.id, state);

  mainWindow.contentView.addChildView(siteView);
  mainWindow.contentView.addChildView(loadingView);
  mainWindow.contentView.addChildView(dragView);
  mainWindow.contentView.addChildView(panelView);

  attachSiteEvents(state);

  void loadingView.webContents.loadURL(buildLoadingDataUrl(""));
  void dragView.webContents.loadURL(buildDragLayerDataUrl());
  void panelView.webContents.loadFile(path.join(__dirname, "renderer", "index.html"));
  void siteView.webContents.loadURL(buildLandingDataUrl());

  applyWindowGeometry(state, true);

  mainWindow.on("resize", () => {
    layoutWindow(state);
  });

  mainWindow.on("moved", () => {
    layoutWindow(state);
  });

  mainWindow.on("closed", () => {
    WINDOW_REGISTRY.delete(mainWindow.id);
  });
}

ipcMain.handle("responsy:get-state", (event) => {
  const state = getStateBySender(event.sender);
  if (!state) {
    return null;
  }

  return serializeState(state);
});

ipcMain.handle("responsy:load-url", async (event, input) => {
  const state = getStateBySender(event.sender);
  const normalized = normalizeUrl(input);

  if (!state || !normalized) {
    return { ok: false };
  }

  state.pendingUrl = normalized;
  state.panelOpen = false;
  applyWindowGeometry(state, false);
  setLoadingState(state, true, normalized);
  state.siteView.webContents.focus();

  try {
    await state.siteView.webContents.loadURL(normalized);
    state.currentUrl = state.siteView.webContents.getURL() || normalized;
    state.title = state.siteView.webContents.getTitle() || state.title;
    emitState(state);
    return { ok: true, url: state.currentUrl };
  } catch {
    state.pendingUrl = "";
    setLoadingState(state, false);
    return { ok: false };
  }
});

ipcMain.handle("responsy:resize-window", (event, view) => {
  const state = getStateBySender(event.sender);
  if (!state) {
    return { ok: false };
  }

  state.activeView = VIEWPORTS[view] ? view : "mobile";
  applyWindowGeometry(state, false);
  return { ok: true, view: state.activeView };
});

ipcMain.handle("responsy:set-panel-open", (event, open) => {
  const state = getStateBySender(event.sender);
  if (!state) {
    return { ok: false };
  }

  state.panelOpen = Boolean(open);
  applyWindowGeometry(state, false);

  if (state.panelOpen) {
    state.panelView.webContents.focus();
    emitState(state, { focusAddress: true });
  } else {
    state.siteView.webContents.focus();
  }

  return { ok: true, panelOpen: state.panelOpen };
});

ipcMain.handle("responsy:toggle-panel", (event) => {
  const state = getStateBySender(event.sender);
  if (!state) {
    return { ok: false };
  }

  state.panelOpen = !state.panelOpen;
  applyWindowGeometry(state, false);
  if (state.panelOpen) {
    state.panelView.webContents.focus();
  } else {
    state.siteView.webContents.focus();
  }

  emitState(state, { focusAddress: state.panelOpen });
  return { ok: true, panelOpen: state.panelOpen };
});

ipcMain.handle("responsy:navigate", (event, action) => {
  const state = getStateBySender(event.sender);
  if (!state) {
    return { ok: false };
  }

  switch (action) {
    case "back":
      if (state.siteView.webContents.navigationHistory.canGoBack()) {
        state.siteView.webContents.navigationHistory.goBack();
      }
      break;
    case "forward":
      if (state.siteView.webContents.navigationHistory.canGoForward()) {
        state.siteView.webContents.navigationHistory.goForward();
      }
      break;
    case "reload":
      state.siteView.webContents.reload();
      break;
    default:
      return { ok: false };
  }

  emitState(state);
  return { ok: true };
});

ipcMain.handle("responsy:window-action", (event, action) => {
  const state = getStateBySender(event.sender);
  if (!state) {
    return { ok: false };
  }

  if (action === "close") {
    state.window.close();
    return { ok: true };
  }

  if (action === "minimize") {
    state.window.minimize();
    return { ok: true };
  }

  return { ok: false };
});

ipcMain.handle("responsy:drag-window", (event, payload) => {
  const state = getStateBySender(event.sender);
  if (!state || !payload || typeof payload.phase !== "string") {
    return { ok: false };
  }

  if (payload.phase === "start") {
    const [windowX, windowY] = state.window.getPosition();
    state.handleDragOrigin = {
      pointerX: Number(payload.screenX) || 0,
      pointerY: Number(payload.screenY) || 0,
      windowX,
      windowY
    };
    return { ok: true };
  }

  if (payload.phase === "move") {
    if (!state.handleDragOrigin) {
      return { ok: false };
    }

    const nextX = Math.round(
      state.handleDragOrigin.windowX + (Number(payload.screenX) || 0) - state.handleDragOrigin.pointerX
    );
    const nextY = Math.round(
      state.handleDragOrigin.windowY + (Number(payload.screenY) || 0) - state.handleDragOrigin.pointerY
    );

    state.window.setPosition(nextX, nextY);
    return { ok: true };
  }

  if (payload.phase === "end") {
    state.handleDragOrigin = null;
    return { ok: true };
  }

  return { ok: false };
});

ipcMain.handle("responsy:capture-screenshot", async (event, mode) => {
  const state = getStateBySender(event.sender);
  if (!state) {
    return { ok: false };
  }

  try {
    const buffer = mode === "full"
      ? await captureFullPageScreenshot(state)
      : await captureVisibleScreenshot(state);
    const outputPath = await storeScreenshot(buffer, state, mode === "full" ? "full-page" : "visible");
    const message = mode === "full"
      ? "Full-page screenshot copied and saved to Downloads."
      : "Visible screenshot copied and saved to Downloads.";

    emitNotice(state, message, "success");
    return { ok: true, path: outputPath };
  } catch {
    emitNotice(state, "Screenshot failed. Try again after the page finishes loading.", "error");
    return { ok: false };
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
