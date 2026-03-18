'use strict';

const { addExtra } = require('puppeteer-extra');
const puppeteer = addExtra(require('puppeteer-core'));
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cheerio = require('cheerio');
const fs = require('fs');

puppeteer.use(StealthPlugin());

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

let globalBrowser = null;

async function getBrowser() {
  if (globalBrowser) return globalBrowser;

  let executablePath = undefined;
  if (fs.existsSync('/usr/bin/chromium-browser')) {
    executablePath = '/usr/bin/chromium-browser';
  } else if (fs.existsSync('/usr/bin/chromium')) {
    executablePath = '/usr/bin/chromium';
  }

  const launchArgs = {
    headless: 'new',
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox', 
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1920,1080'
    ],
  };

  if (executablePath) {
    launchArgs.executablePath = executablePath;
  } else {
    // Fallback for local development (macOS/Windows) if chromium isn't in /usr/bin/
    launchArgs.channel = 'chrome';
  }

  globalBrowser = await puppeteer.launch(launchArgs);
  return globalBrowser;
}

async function fetchWithStealth(url) {
  const browser = await getBrowser();
  let page;
  try {
    page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    
    // Cloudflare challenges sometimes require a realistic viewport size
    await page.setViewport({ width: 1920, height: 1080 });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    
    // Wait a brief moment to ensure Cloudflare JS challenge is complete if any
    await new Promise(r => setTimeout(r, 4000));
    
    const text = await page.content();
    return { $: cheerio.load(text), text };
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

async function closeStealthBrowser() {
  if (globalBrowser) {
    await globalBrowser.close().catch(() => {});
    globalBrowser = null;
  }
}

module.exports = { fetchWithStealth, closeStealthBrowser };
