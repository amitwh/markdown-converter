// src/main/menu/index.js
// buildMenu() composes the app menu from items; register() sets it on the app

const { Menu } = require('electron');
const {
  fileItems,
  editItems,
  viewItems,
  batchItems,
  convertItems,
  pdfEditorItems,
  toolsItems,
  helpItems
} = require('./items');

function buildMenu(mainWindow) {
  const template = [
    { label: '&File', submenu: fileItems(mainWindow) },
    { label: '&Edit', submenu: editItems(mainWindow) },
    { label: '&View', submenu: viewItems(mainWindow) },
    { label: '&Batch', submenu: batchItems(mainWindow) },
    { label: '&Convert', submenu: convertItems(mainWindow) },
    { label: 'PDF Editor', submenu: pdfEditorItems(mainWindow) },
    { label: '&Tools', submenu: toolsItems(mainWindow) },
    { label: '&Help', submenu: helpItems(mainWindow) }
  ];
  return Menu.buildFromTemplate(template);
}

function register(mainWindow) {
  Menu.setApplicationMenu(buildMenu(mainWindow));
}

module.exports = { register, buildMenu };