#!/usr/bin/env node

/**
 * Auto-reload script for Chrome extension development
 * Watches for file changes and triggers extension reload
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const chokidar = require('chokidar');

const EXTENSION_ID = process.env.EXTENSION_ID || 'your-extension-id';
const WATCH_PATH = path.resolve(__dirname, '../dist');

console.log('🔄 Extension auto-reload watcher started');
console.log(`📁 Watching: ${WATCH_PATH}`);
console.log(`🔌 Extension ID: ${EXTENSION_ID}`);
console.log('Press Ctrl+C to stop\n');

// Watch for changes in dist directory
const watcher = chokidar.watch(WATCH_PATH, {
  ignored: /(^|[\/\\])\../,
  persistent: true,
});

const reloadExtension = () => {
  console.log('📦 Reloading extension...');

  const reloadCommand = `chrome-cli reload ${EXTENSION_ID}`;

  exec(reloadCommand, (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Failed to reload extension');
      console.error('Make sure chrome-cli is installed: brew install chrome-cli');
      console.error('Or manually reload the extension in chrome://extensions/');
      return;
    }
    console.log('✅ Extension reloaded successfully');
  });
};

// Debounce reload to avoid multiple rapid reloads
let reloadTimeout;
const scheduleReload = () => {
  clearTimeout(reloadTimeout);
  reloadTimeout = setTimeout(reloadExtension, 500);
};

watcher
  .on('change', (filePath) => {
    console.log(`📝 File changed: ${path.relative(WATCH_PATH, filePath)}`);
    scheduleReload();
  })
  .on('add', (filePath) => {
    console.log(`➕ File added: ${path.relative(WATCH_PATH, filePath)}`);
    scheduleReload();
  })
  .on('unlink', (filePath) => {
    console.log(`➖ File removed: ${path.relative(WATCH_PATH, filePath)}`);
    scheduleReload();
  });

process.on('SIGINT', () => {
  console.log('\n👋 Stopping watcher...');
  watcher.close();
  process.exit(0);
});
