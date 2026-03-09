const fetch = require('node-fetch');
require('dotenv').config();

async function run() {
    const url = 'https://api.brightdata.com/request';
    const imgUrl = 'https://thesolist.com/cdn/shop/files/cartier-pasha-stainless-steel-automatic-mens-watch-293699_800x.jpg';

    // BrightData SERP API Google Lens URL format
    // URL from docs: https://lens.google.com/uploadbyurl?url=IMAGE_URL
    const targetUrl = 'https://lens.google.com/uploadbyurl?url=' + encodeURIComponent(imgUrl);

    const payload = {
        zone: process.env.SERP_API_ZONE,
        url: targetUrl,
        format: 'json',
        method: 'GET'
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + process.env.BRIGHT_DATA_SERP_API_KEY
        },
        body: JSON.stringify(payload)
    });

    console.log(res.status);
    const data = await res.json();
    console.log(JSON.stringify(data).substring(0, 1500));
}

run().catch(console.error);
