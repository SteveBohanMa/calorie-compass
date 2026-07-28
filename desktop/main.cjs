const { app, BrowserWindow, Menu, dialog, ipcMain } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const CONTENT_WIDTH = 460;
const CONTENT_HEIGHT = 860;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

let localServer;
let mainWindow;

ipcMain.handle("report:export-png", async (event, payload) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    return { saved: false, canceled: false, error: "Invalid window" };
  }
  const source = payload?.rect ?? {};
  const rect = {
    x: Math.max(0, Math.floor(Number(source.x) || 0)),
    y: Math.max(0, Math.floor(Number(source.y) || 0)),
    width: Math.min(1600, Math.max(1, Math.ceil(Number(source.width) || 1))),
    height: Math.min(2400, Math.max(1, Math.ceil(Number(source.height) || 1))),
  };
  try {
    const image = await mainWindow.webContents.capturePage(rect);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "导出周报图片",
      defaultPath: String(payload?.defaultName || "燃卡快查-周报.png").replace(/[\\/:*?"<>|]/g, "-"),
      filters: [{ name: "PNG 图片", extensions: ["png"] }],
    });
    if (result.canceled || !result.filePath) return { saved: false, canceled: true };
    fs.writeFileSync(result.filePath, image.toPNG());
    return { saved: true, canceled: false, filePath: result.filePath };
  } catch (error) {
    return { saved: false, canceled: false, error: error instanceof Error ? error.message : String(error) };
  }
});

function verifyOutputDirectory() {
  const prefix = "--verify-output=";
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? path.resolve(argument.slice(prefix.length)) : null;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function appRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app")
    : path.join(__dirname, "..", "dist", "client");
}

function resolveRequest(root, requestPath) {
  const cleanPath = decodeURIComponent(requestPath).replace(/^\/+/, "");
  const resolved = path.resolve(root, cleanPath || "index.html");
  const relative = path.relative(root, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
  return path.join(root, "index.html");
}

function startLocalServer() {
  const root = appRoot();

  return new Promise((resolve, reject) => {
    localServer = http.createServer((request, response) => {
      try {
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.writeHead(405, { Allow: "GET, HEAD" });
          response.end();
          return;
        }

        const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
        const filePath = resolveRequest(root, requestUrl.pathname);

        if (!filePath || !fs.existsSync(filePath)) {
          response.writeHead(404);
          response.end("Not found");
          return;
        }

        const extension = path.extname(filePath).toLowerCase();
        response.writeHead(200, {
          "Cache-Control": "no-store",
          "Content-Type": mimeTypes[extension] || "application/octet-stream",
          "X-Content-Type-Options": "nosniff",
        });

        if (request.method === "HEAD") {
          response.end();
          return;
        }

        fs.createReadStream(filePath).pipe(response);
      } catch {
        response.writeHead(500);
        response.end("Internal error");
      }
    });

    localServer.once("error", reject);
    localServer.listen(0, "127.0.0.1", () => {
      const address = localServer.address();
      resolve(`http://127.0.0.1:${address.port}/`);
    });
  });
}

async function createWindow() {
  const localUrl = await startLocalServer();
  const verifyDirectory = verifyOutputDirectory();
  const verificationConsoleIssues = [];

  mainWindow = new BrowserWindow({
    width: CONTENT_WIDTH,
    height: CONTENT_HEIGHT,
    useContentSize: true,
    minWidth: 400,
    minHeight: 680,
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    show: false,
    title: "燃卡快查",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false,
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  if (verifyDirectory) {
    mainWindow.webContents.on("console-message", (_event, ...args) => {
      const details = typeof args[0] === "object" ? args[0] : { level: args[0], message: args[1], lineNumber: args[2], sourceId: args[3] };
      if (Number(details.level) >= 2) verificationConsoleIssues.push(details);
    });
  }
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(localUrl)) event.preventDefault();
  });
  if (!verifyDirectory) {
    mainWindow.once("ready-to-show", () => mainWindow.show());
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(localUrl);

  if (verifyDirectory) {
    await delay(700);
    fs.mkdirSync(verifyDirectory, { recursive: true });
    const pageMetrics = await mainWindow.webContents.executeJavaScript(`(() => {
      const runtime = document.querySelector('[data-testid="frameless-runtime"]');
      const runtimeRect = runtime?.getBoundingClientRect();
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        framelessRuntime: runtimeRect ? { width: runtimeRect.width, height: runtimeRect.height } : null,
        hasPhoneFrame: Boolean(document.querySelector('[data-testid="phone-frame"]')),
        hasDevicePicker: Boolean(document.querySelector('[data-testid="device-picker"]')),
        hasStatusBar: Boolean(document.querySelector('.status-bar')),
        title: document.title,
      };
    })()`);
    const [contentWidth, contentHeight] = mainWindow.getContentSize();
    const image = await mainWindow.webContents.capturePage();
    mainWindow.showInactive();

    await mainWindow.webContents.executeJavaScript(`localStorage.removeItem('calorie-compass-v2.5-custom-foods'); localStorage.removeItem('calorie-compass-v2.5-compare-foods')`);

    await mainWindow.webContents.executeJavaScript(`document.querySelector('.lookup-hero')?.click()`);
    await delay(450);
    await mainWindow.webContents.executeJavaScript(`document.querySelector('.quick-bubble')?.click()`);
    await delay(450);
    const foodMetrics = await mainWindow.webContents.executeJavaScript(`(() => ({
      renderedRows: document.querySelectorAll('.food-row').length,
      hasFoodSource: Boolean(document.querySelector('.food-list')),
    }))()`);
    const foodImage = await mainWindow.webContents.capturePage();

    await mainWindow.webContents.executeJavaScript(`location.reload()`);
    await delay(700);
    await mainWindow.webContents.executeJavaScript(`document.querySelector('.lookup-hero')?.click()`);
    await delay(500);
    await mainWindow.webContents.executeJavaScript(`document.querySelectorAll('.quick-bubble')[1]?.click()`);
    await delay(700);
    const nutritionMetrics = await mainWindow.webContents.executeJavaScript(`(() => ({
      tabCount: document.querySelectorAll('.nutrient-tabs button').length,
      selectedTab: document.querySelector('.nutrient-tabs button[aria-selected="true"]')?.textContent || '',
      renderedRows: document.querySelectorAll('.food-row').length,
    }))()`);
    const nutritionImage = await mainWindow.webContents.capturePage();

    await mainWindow.webContents.executeJavaScript(`localStorage.removeItem('calorie-compass-v2.4-planner'); location.reload()`);
    await delay(700);
    await mainWindow.webContents.executeJavaScript(`document.querySelector('.feature-card')?.click()`);
    await delay(450);
    await mainWindow.webContents.executeJavaScript(`document.querySelector('.advanced-button')?.click()`);
    await delay(220);
    await mainWindow.webContents.executeJavaScript(`document.querySelector('.primary-action')?.click()`);
    await delay(450);
    const workoutMetrics = await mainWindow.webContents.executeJavaScript(`(() => ({
      inputCount: document.querySelectorAll('.form-card input').length,
      hasGrossResult: Boolean(document.querySelector('.workout-result-card > strong')),
      resultFactCount: document.querySelectorAll('.workout-result-card > div > span').length,
    }))()`);
    const workoutImage = await mainWindow.webContents.capturePage();

    await mainWindow.webContents.executeJavaScript(`location.reload()`);
    await delay(700);
    await mainWindow.webContents.executeJavaScript(`document.querySelector('.weekly-card')?.click()`);
    await delay(1100);
    const planIsOpen = await mainWindow.webContents.executeJavaScript(`Boolean(document.querySelector('.day-tabs'))`);
    if (!planIsOpen) {
      await mainWindow.webContents.executeJavaScript(`document.querySelectorAll('.bottom-nav button')[3]?.click()`);
      await delay(1100);
    }
    const initialPlanMetrics = await mainWindow.webContents.executeJavaScript(`(() => ({
      dayTabs: document.querySelectorAll('.day-tabs button').length,
      hasMealEditorLink: document.querySelectorAll('.daily-edit-card button').length >= 1,
      hasWorkoutEditorLink: document.querySelectorAll('.daily-edit-card button').length >= 2,
      hasReportExport: Boolean(document.querySelector('.export-report-button')),
      hasDesktopExportBridge: typeof window.calorieCompass?.exportReport === 'function',
      bodyStart: document.body.innerText.slice(0, 120),
    }))()`);
    await mainWindow.webContents.executeJavaScript(`document.querySelectorAll('.daily-edit-card button')[0]?.click()`);
    await delay(700);
    await mainWindow.webContents.executeJavaScript(`document.querySelector('.primary-action')?.click()`);
    await delay(250);
    const mealEditorCount = await mainWindow.webContents.executeJavaScript(`document.querySelectorAll('.editor-card').length`);
    await mainWindow.webContents.executeJavaScript(`document.querySelector('.back-button')?.click()`);
    await delay(700);
    await mainWindow.webContents.executeJavaScript(`document.querySelectorAll('.daily-edit-card button')[1]?.click()`);
    await delay(700);
    await mainWindow.webContents.executeJavaScript(`document.querySelector('.primary-action')?.click()`);
    await delay(250);
    const workoutEditorCount = await mainWindow.webContents.executeJavaScript(`document.querySelectorAll('.editor-card').length`);
    await mainWindow.webContents.executeJavaScript(`document.querySelector('.back-button')?.click()`);
    await delay(700);
    const weeklyMetrics = await mainWindow.webContents.executeJavaScript(`(() => ({
      reportDayRows: document.querySelectorAll('.report-days > div').length,
      reportText: document.querySelector('[data-testid="weekly-report-card"]')?.innerText || '',
    }))()`);
    for (let index = 0; index < 5; index += 1) {
      mainWindow.webContents.sendInputEvent({ type: "mouseWheel", x: 230, y: 360, deltaY: -720, canScroll: true });
      await delay(80);
    }
    const weeklyImage = await mainWindow.webContents.capturePage();
    await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-testid="weekly-report-card"]')?.scrollIntoView({ block: 'center', behavior: 'auto' })`);
    await delay(150);
    const reportRect = await mainWindow.webContents.executeJavaScript(`(() => {
      const rect = document.querySelector('[data-testid="weekly-report-card"]')?.getBoundingClientRect();
      return rect ? { x: Math.max(0, Math.floor(rect.x)), y: Math.max(0, Math.floor(rect.y)), width: Math.ceil(rect.width), height: Math.ceil(rect.height) } : null;
    })()`);
    const reportImage = reportRect ? await mainWindow.webContents.capturePage(reportRect) : null;

    await mainWindow.webContents.executeJavaScript(`location.reload()`);
    await delay(650);
    await mainWindow.webContents.executeJavaScript(`document.querySelectorAll('.feature-card')[1]?.click()`);
    await delay(350);
    await mainWindow.webContents.executeJavaScript(`(() => { const inputs = document.querySelectorAll('.converter-card input'); if (inputs[1]) { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(inputs[1], '418.4'); inputs[1].dispatchEvent(new Event('input', { bubbles: true })); } })()`);
    await delay(250);
    const converterMetrics = await mainWindow.webContents.executeJavaScript(`(() => { const inputs = [...document.querySelectorAll('.converter-card input')]; return { inputCount: inputs.length, kcal: inputs[0]?.value, kj: inputs[1]?.value }; })()`);
    const converterImage = await mainWindow.webContents.capturePage();

    await mainWindow.webContents.executeJavaScript(`location.reload()`);
    await delay(650);
    await mainWindow.webContents.executeJavaScript(`document.querySelectorAll('.round-tool')[1]?.click()`);
    await delay(400);
    await mainWindow.webContents.executeJavaScript(`document.querySelector('.custom-add-button')?.click()`);
    await delay(200);
    await mainWindow.webContents.executeJavaScript(`(() => {
      const inputs = [...document.querySelectorAll('.custom-editor input')];
      const values = ['测试鸡肉卷', 'Test chicken wrap', '210', '150', '18', '20', '6', '3'];
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      inputs.forEach((input, index) => { setter.call(input, values[index]); input.dispatchEvent(new Event('input', { bubbles: true })); });
      document.querySelector('.custom-editor')?.requestSubmit();
    })()`);
    await delay(450);
    await mainWindow.webContents.executeJavaScript(`document.querySelector('.custom-actions button')?.click()`);
    await delay(220);
    await mainWindow.webContents.executeJavaScript(`(() => {
      const input = document.querySelectorAll('.custom-editor input')[2];
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '225'); input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('.custom-editor')?.requestSubmit();
    })()`);
    await delay(400);
    const customMetrics = await mainWindow.webContents.executeJavaScript(`(() => ({
      rowCount: document.querySelectorAll('.custom-row').length,
      storedCount: JSON.parse(localStorage.getItem('calorie-compass-v2.5-custom-foods') || '[]').length,
      updatedText: document.querySelector('.custom-row small')?.textContent || '',
      hasEdit: Boolean(document.querySelector('.custom-actions button')),
      hasDelete: document.querySelectorAll('.custom-actions button').length >= 2,
    }))()`);
    const customImage = await mainWindow.webContents.capturePage();

    await mainWindow.webContents.executeJavaScript(`location.reload()`);
    await delay(650);
    await mainWindow.webContents.executeJavaScript(`document.querySelectorAll('.round-tool')[0]?.click()`);
    await delay(400);
    await mainWindow.webContents.executeJavaScript(`document.querySelector('.compare-add-button')?.click()`);
    await delay(150);
    await mainWindow.webContents.executeJavaScript(`(() => {
      const input = document.querySelector('.compare-picker input');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '测试鸡肉卷'); input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await delay(200);
    await mainWindow.webContents.executeJavaScript(`document.querySelector('.compare-picker-list button')?.click()`);
    await delay(300);
    await mainWindow.webContents.executeJavaScript(`document.querySelector('.compare-add-button')?.click()`);
    await delay(150);
    await mainWindow.webContents.executeJavaScript(`(() => {
      const input = document.querySelector('.compare-picker input');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'Apple'); input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await delay(200);
    await mainWindow.webContents.executeJavaScript(`document.querySelector('.compare-picker-list button')?.click()`);
    await delay(300);
    const compareMetrics = await mainWindow.webContents.executeJavaScript(`(() => ({
      rowCount: document.querySelectorAll('.compare-row').length,
      storedCount: JSON.parse(localStorage.getItem('calorie-compass-v2.5-compare-foods') || '[]').length,
      hasCustomDish: document.querySelector('.comparison-card')?.innerText.includes('测试鸡肉卷') || false,
      hasRemoveButtons: document.querySelectorAll('.compare-remove').length === document.querySelectorAll('.compare-row').length,
    }))()`);
    const compareImage = await mainWindow.webContents.capturePage();
    const result = {
      responsive: mainWindow.isResizable(),
      contentSize: { width: contentWidth, height: contentHeight },
      bundledFoodRecords: 128,
      food: foodMetrics,
      nutrition: nutritionMetrics,
      workout: workoutMetrics,
      plan: { ...initialPlanMetrics, ...weeklyMetrics, mealEntries: mealEditorCount, workoutEntries: workoutEditorCount },
      converter: converterMetrics,
      customData: customMetrics,
      compare: compareMetrics,
      consoleIssues: verificationConsoleIssues,
      ...pageMetrics,
    };

    fs.writeFileSync(path.join(verifyDirectory, "desktop-verification.json"), JSON.stringify(result, null, 2));
    fs.writeFileSync(path.join(verifyDirectory, "desktop-verification.png"), image.toPNG());
    fs.writeFileSync(path.join(verifyDirectory, "food-verification.png"), foodImage.toPNG());
    fs.writeFileSync(path.join(verifyDirectory, "nutrition-verification.png"), nutritionImage.toPNG());
    fs.writeFileSync(path.join(verifyDirectory, "workout-verification.png"), workoutImage.toPNG());
    fs.writeFileSync(path.join(verifyDirectory, "weekly-verification.png"), weeklyImage.toPNG());
    if (reportImage) fs.writeFileSync(path.join(verifyDirectory, "weekly-report-verification.png"), reportImage.toPNG());
    fs.writeFileSync(path.join(verifyDirectory, "converter-verification.png"), converterImage.toPNG());
    fs.writeFileSync(path.join(verifyDirectory, "custom-data-verification.png"), customImage.toPNG());
    fs.writeFileSync(path.join(verifyDirectory, "compare-verification.png"), compareImage.toPNG());
    mainWindow.hide();
    app.quit();
  }
}

const hasLock = verifyOutputDirectory() ? true : app.requestSingleInstanceLock();

if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(createWindow).catch((error) => {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    try {
      fs.writeFileSync(path.join(app.getPath("userData"), "startup-error.log"), message);
    } catch {
      // If logging fails there is no remaining recovery path during startup.
    }
    app.quit();
  });

  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => {
    if (localServer) localServer.close();
  });
}
