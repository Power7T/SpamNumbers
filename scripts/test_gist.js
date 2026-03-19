'use strict';
const { scrapeGistFeed } = require('./scrapers/gistHunter');
const Database = require('better-sqlite3');
const { upsertManyFromScraper } = require('./db/queries');
const path = require('path');

async function testGist() {
  console.log('🌪️ [cloud_sweep] TRIGGERING INSTANT GIST VACUUM...');
  const dbPath = path.join(__dirname, 'data', 'spam_numbers.db');
  const db = new Database(dbPath);

  const records = await scrapeGistFeed();
  
  if (records.length > 0) {
    console.log(`\n✅ SUCCESS: Captured ${records.length} new candidates from the Gist Cloud!`);
    const { newCount } = upsertManyFromScraper(db, records);
    console.log(`   Added ${newCount} brand new entries to your local database.`);
  } else {
    console.log('\n⚠ No fresh Gist drops found in this specific minute. Gist-Hunter is active and polling.');
  }
}

testGist();
