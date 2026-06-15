const { app, BrowserWindow } = require('electron');

let mainWindow;

function createWindow() {
  // Création de la fenêtre de l'application
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    autoHideMenuBar: true, // Cache la barre de menu classique
    webPreferences: {
      nodeIntegration: true
    }
  });

  // Charge l'interface React
  mainWindow.loadURL('http://localhost:5173');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});