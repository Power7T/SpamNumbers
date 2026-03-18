'use strict';
const { fetchRawWithStealth } = require('./scripts/lib/stealth-browser');

async function checkDates() {
  let found = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    const csvUrl = `https://www.ftc.gov/sites/default/files/DNC_Complaint_Numbers_${date}.csv`;
    
    try {
      const { text } = await fetchRawWithStealth(csvUrl);
      if (text && text.length > 500 && !text.includes('<!DOCTYPE html>')) {
        console.log(`[FOUND] ${date}`);
        found++;
      } else {
        console.log(`[MISSING] ${date}`);
      }
    } catch (e) {
      console.log(`[ERROR] ${date}`);
    }
  }
  console.log(`Total found: ${found}`);
  process.exit(0);
}
checkDates();
