const { fetchWithStealth } = require('./lib/stealth-browser');
const { normalizePhone } = require('./normalizer');

async function test() {
  const { text } = await fetchWithStealth('https://www.bbb.org/scamtracker/lookupscam');
  const phoneRegex = /(\+?\d{1,4}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g;
  const matches = text.match(phoneRegex) || [];
  const distinctNums = [...new Set(matches.map(m => normalizePhone(m)).filter(Boolean))];

  console.log(`Found ${distinctNums.length} unique parsed numbers.`);
  console.log("Samples:", distinctNums.slice(0, 10));

  // Let's also check if 'scam' or 'Scam Tracker' text is visible
  if(text.includes('Scam Tracker')) {
    console.log("Verified 'Scam Tracker' text is on the page.");
  }
}
test();
