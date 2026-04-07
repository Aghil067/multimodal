const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    page.on('request', request => {
        if (request.url().includes('congestionMap')) {
            console.log('Congestion URL:', request.url());
            console.log('Congestion Method:', request.method());
            console.log('Congestion Headers:', request.headers());
            console.log('Congestion POST Data:', request.postData());
        }
    });
    
    await page.goto('https://travelmidwest.com/');
    await page.waitForTimeout(5000); // map loads
    await browser.close();
})();
