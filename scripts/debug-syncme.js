'use strict';
const { fetchWithStealth, closeStealthBrowser } = require('./lib/stealth-browser');

async function debug() {
  const { text, $ } = await fetchWithStealth('https://sync.me/top-spammers/us/');
  // Print first 10 rows of any table
  console.log('TABLE ROWS:');
  $('table tr').each((i, el) => {
    if (i > 10) return;
    console.log($(el).text().replace(/\s+/g, ' ').trim());
  });
  // Print any links containing 'phone'
  console.log('PHONE LINKS:');
  $('a[href*="phone"]').each((i, el) => {
    if (i > 10) return;
    console.log($(el).attr('href'), '|', $(el).text().trim());
  });
  await closeStealthBrowser();
}

debug();
