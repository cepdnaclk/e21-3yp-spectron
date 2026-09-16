const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('spectronDesktop', {
  platform: process.platform,
});
