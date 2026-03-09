const fetch = require('node-fetch');
require('dotenv').config();

async function run() {
    const url = 'https://api.brightdata.com/request';
    const imgUrl = 'https://thesolist.com/cdn/shop/files/cartier-pasha-stainless-steel-automatic-mens-watch-293699_800x.jpg';

    const targetUrl = 'https://lens.google.com/uploadbyurl?url=' + encodeURIComponent(imgUrl);

    const payload = {
        zone: process.env.WEB_UNLOCKER_ZONE,
        url: targetUrl,
        format: 'json',
        method: 'GET'
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + process.env.BRIGHT_DATA_UNLOCKER_API_KEY
        },
        body: JSON.stringify(payload)
    });

    console.log(res.status);
    const data = await res.json();
    const html = data.body || data.html || '';
    console.log('HTML Length:', html.length);
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    // In Google Lens, visual matches are usually in certain tags.
    // We can just dump all hrefs to see if it worked.
    const links = [];
    $('a[href^="http"]').each((i, el) => links.push($(el).attr('href')));
    console.log(links.slice(0, 15));
}

run().catch(console.error);
