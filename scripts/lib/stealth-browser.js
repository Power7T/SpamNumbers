'use strict';

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cheerio = require('cheerio');
const fs = require('fs');

puppeteer.use(StealthPlugin());

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

async function fetchWithStealth(url) {
  let executablePath = undefined;
  if (fs.existsSync('/usr/bin/chromium-browser')) {
    executablePath = '/usr/bin/chromium-browser';
  } else if (fs.existsSync('/usr/bin/chromium')) {
    executablePath = '/usr/bin/chromium';
  }

  const browser = await puppeteer.launch({
    executablePath, // will use bundled if undefined, but good for Ubuntu
    headless: 'new',
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox', 
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1920,1080'
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    
    // Cloudflare challenges sometimes require a realistic viewport size
    await page.setViewport({ width: 1920, height: 1080 });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    
    // Wait a brief moment to ensure Cloudflare JS challenge is complete if any
    await new Promise(r => setTimeout(r, 4000));
    
    const text = await page.content();
    return { $: cheerio.load(text), text };
  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports = { fetchWithStealth };
