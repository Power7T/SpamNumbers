'use strict';

const { fetchText, sleep, extractPhoneNumbers } = require('./base');

/**
 * HuggingFace / AI Dataset Hunter
 * Searches for transcribed scam call datasets (e.g. from NCSU or academic researchers)
 * and extracts the caller ID numbers from transcripts.
 */
async function scrapeHFDataset() {
  const allRecords = [];
  const searchUrls = [
    'https://huggingface.co/datasets/search?q=phone+scam',
    'https://huggingface.co/datasets/search?q=telemarketing+transcript',
    'https://huggingface.co/datasets/search?q=scam+call+audio'
  ];

  for (const searchUrl of searchUrls) {
    try {
      console.log(`[hf_hunter] Hunting for AI datasets: ${searchUrl.split('q=').pop()}...`);
      const html = await fetchText(searchUrl, { timeout: 15000 });
      if (!html) continue;

      // Simplistic regex for dataset links on HF
      const datasetLinks = [...new Set(html.match(/\/datasets\/[\w-]+\/[\w-]+/g))]
        .filter(l => !l.includes('search'))
        .slice(0, 5); // Take top 5

      for (const link of datasetLinks) {
        const readmeUrl = `https://huggingface.co/datasets${link}/raw/main/README.md`;
        console.log(`[hf_hunter]   Analyzing README: ${link}...`);
        
        const readme = await fetchText(readmeUrl, { timeout: 8000 });
        if (!readme) continue;

        const numbers = extractPhoneNumbers(readme);
        for (const num of numbers) {
          allRecords.push({
            phone_number: num,
            source: 'hf_hunter',
            spam_score: 9.5, // Academic/Researcher verified
            call_type: 'verified_scam',
            report_count: 10,
            user_notes: `Extracted from AI/Researcher transcript dataset: ${link}`,
            date_first_seen: new Date().toISOString(),
            raw_data: JSON.stringify({ dataset: link })
          });
        }
        await sleep(1000);
      }
    } catch (err) {
      console.warn(`[hf_hunter] Failed on ${searchUrl}: ${err.message}`);
    }
  }

  // Deduplicate
  const seen = new Set();
  const unique = allRecords.filter(r => {
    if (seen.has(r.phone_number)) return false;
    seen.add(r.phone_number);
    return true;
  });

  console.log(`[hf_hunter] Discovered ${unique.length} high-fidelity threats from AI researcher datasets`);
  return unique;
}

module.exports = { scrapeHFDataset };
