'use strict';

const truecallerjs = require('truecallerjs');

/**
 * Perform a live check against Truecaller's massive global directory.
 * Requires a TRUECALLER_INSTALLATION_ID in .env.
 * Kept "silent" per requirements. If it detects spam, returns formatted info.
 */
async function checkTruecallerHiddenApi(phone) {
  const installationId = process.env.TRUECALLER_INSTALLATION_ID;
  if (!installationId) return null; // Silently abort if not configured
  
  try {
    // Attempt search using unofficial API wrapper
    const searchResult = await truecallerjs.search(phone, "", installationId);
    if (!searchResult || !searchResult.json) return null;
    
    // Parse response
    const data = JSON.parse(searchResult.json());
    if (data && data.data && data.data.length > 0) {
      const match = data.data[0];
      
      // Look for spam flags in Truecaller's response
      const isSpam = match.spamInfo || (match.badges && match.badges.includes('spam'));
      
      if (isSpam) {
        const score = match.spamInfo ? match.spamInfo.spamScore : 'N/A';
        const type = match.tags && match.tags.length > 0 ? match.tags[0] : 'unknown';
        const reports = match.spamInfo ? match.spamInfo.numSpamCalls : 'N/A';
        const name = match.name || 'Unknown Caller';
        return [
          `📵 ${phone} — SPAM (via Global Directory Fallback)`,
          `  Name: ${name} | Score: ${score} | Type: ${type} | Reports: ${reports}`,
          `  Note: Found in live external directory. Not yet in local database.`,
        ].join('\n');
      }
    }
    return null;
  } catch (error) {
    // Fail silently per user instructions
    return null;
  }
}

module.exports = { checkTruecallerHiddenApi };
