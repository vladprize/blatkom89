// БЛАТКОМ ’89 for macOS, offline: the game's offline build (apps/web/dist-demo) in an Electron window —
// the story, practice against bots and the soundtrack, no network needed. The files are served from
// inside the app as app://blatkom/… (one fixed origin, so the progress and settings the game keeps in
// its storage stay in ~/Library/Application Support/BLATKOM 89 between launches). Links to the website
// open in the browser; nothing is sent anywhere. Built by tools/build-mac-app.py.
const { app, BrowserWindow, Menu, net, protocol, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const GAME = path.join(__dirname, 'game');
const ORIGIN = 'app://blatkom';

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);
// the menu soundtrack starts with the game (a game, not a web page)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (!app.requestSingleInstanceLock()) app.quit();

const ru = () => /^(ru|be|kk|ky|uk)/i.test(app.getLocale());

function menu() {
  const r = ru();
  const name = 'BLATKOM 89';
  return Menu.buildFromTemplate([
    {
      label: name,
      submenu: [
        { role: 'about', label: r ? `О программе ${name}` : `About ${name}` },
        { type: 'separator' },
        { role: 'hide', label: r ? `Скрыть ${name}` : `Hide ${name}` },
        { role: 'hideOthers', label: r ? 'Скрыть остальные' : 'Hide Others' },
        { role: 'unhide', label: r ? 'Показать все' : 'Show All' },
        { type: 'separator' },
        { role: 'quit', label: r ? `Завершить ${name}` : `Quit ${name}` },
      ],
    },
    {
      label: r ? 'Правка' : 'Edit',
      submenu: [
        { role: 'undo', label: r ? 'Отменить' : 'Undo' },
        { role: 'redo', label: r ? 'Повторить' : 'Redo' },
        { type: 'separator' },
        { role: 'cut', label: r ? 'Вырезать' : 'Cut' },
        { role: 'copy', label: r ? 'Скопировать' : 'Copy' },
        { role: 'paste', label: r ? 'Вставить' : 'Paste' },
        { role: 'selectAll', label: r ? 'Выбрать все' : 'Select All' },
      ],
    },
    {
      label: r ? 'Вид' : 'View',
      submenu: [
        { role: 'togglefullscreen', label: r ? 'Полноэкранный режим' : 'Full Screen' },
        { type: 'separator' },
        { role: 'resetZoom', label: r ? 'Обычный размер' : 'Actual Size' },
        { role: 'zoomIn', label: r ? 'Увеличить' : 'Zoom In' },
        { role: 'zoomOut', label: r ? 'Уменьшить' : 'Zoom Out' },
      ],
    },
    { label: r ? 'Окно' : 'Window', submenu: [{ role: 'minimize', label: r ? 'Свернуть' : 'Minimize' }, { role: 'close', label: r ? 'Закрыть' : 'Close' }] },
  ]);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: '#0d0b0a',
    title: 'BLATKOM ’89',
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  win.once('ready-to-show', () => win.show());
  // the game stays in its window; links out (the website, Telegram) open in the browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith(ORIGIN + '/')) return;
    e.preventDefault();
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
  });
  void win.loadURL(`${ORIGIN}/index.html`);
  return win;
}

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const { host, pathname } = new URL(req.url);
    const file = path.normalize(path.join(GAME, decodeURIComponent(pathname)));
    if (host !== 'blatkom' || (file !== GAME && !file.startsWith(GAME + path.sep))) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  app.setAboutPanelOptions({ applicationName: 'BLATKOM ’89', applicationVersion: app.getVersion(), copyright: '«Районные дела — серьёзные дела»' });
  Menu.setApplicationMenu(menu());
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('second-instance', () => {
  const w = BrowserWindow.getAllWindows()[0];
  if (!w) return;
  if (w.isMinimized()) w.restore();
  w.focus();
});

app.on('window-all-closed', () => app.quit());
