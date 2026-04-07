const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    page.on('request', request => {
        if (request.url().includes('incidentMap')) {
            console.log('Incident URL:', request.url());
            console.log('Incident Method:', request.method());
            console.log('Incident Headers:', request.headers());
            console.log('Incident POST Data:', request.postData());
        }
    });
    
    await page.goto('https://travelmidwest.com/');
    await page.waitForTimeout(5000);
    await browser.close();
})();
