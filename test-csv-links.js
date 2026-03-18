'use strict';
const { fetchWithStealth } = require('./scripts/lib/stealth-browser');

async function testLinks() {
  const url = 'https://www.ftc.gov/policy-notices/open-government/data-sets/do-not-call-data';
  try {
    const { $ } = await fetchWithStealth(url);
    const links = [];
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      if (href && href.includes('DNC_Complaint_Numbers') && href.endsWith('.csv')) {
        let fullUrl = href;
        if (!fullUrl.startsWith('http')) {
             fullUrl = 'https://www.ftc.gov' + (fullUrl.startsWith('/') ? '' : '/') + fullUrl;
        }
        links.push(fullUrl);
      }
    });
    console.log(links);
  } catch (err) {
    console.error(err);
  }
  process.exit();
}

testLinks();
