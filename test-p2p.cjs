const { chromium } = require('playwright');

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  
  // Tab 1: Host
  console.log('Creating Host...');
  const hostContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  
  hostPage.on('console', msg => {
    if (msg.text().includes('[P2P]') || msg.text().includes('Trystero')) {
      console.log(`[HOST] ${msg.text()}`);
    }
  });

  await hostPage.goto('http://localhost:5173');
  await hostPage.waitForSelector('input[placeholder="Enter your name"]', { timeout: 10000 });
  await hostPage.fill('input[placeholder="Enter your name"]', 'HostTest');
  
  const roomInput = await hostPage.$('input[placeholder="Create a new room ID"]');
  if (!roomInput) {
     console.log('Could not find room input!');
     process.exit(1);
  }
  const roomId = await roomInput.inputValue();
  console.log(`[HOST] Room ID generated: ${roomId}`);
  
  await hostPage.click('button:has-text("Create Room")');
  console.log('[HOST] Clicked Create Room');
  
  // Wait a moment for host to init
  await new Promise(r => setTimeout(r, 2000));
  
  // Tab 2: Joiner
  console.log('Creating Joiner...');
  const joinerContext = await browser.newContext();
  const joinerPage = await joinerContext.newPage();
  
  joinerPage.on('console', msg => {
    if (msg.text().includes('[P2P]') || msg.text().includes('Trystero')) {
      console.log(`[JOINER] ${msg.text()}`);
    }
  });

  await joinerPage.goto(`http://localhost:5173/#${roomId}`);
  await joinerPage.waitForSelector('input[placeholder="Enter your name"]', { timeout: 10000 });
  await joinerPage.fill('input[placeholder="Enter your name"]', 'JoinerTest');
  
  await joinerPage.click('button:has-text("Join Room")');
  console.log('[JOINER] Clicked Join Room');
  
  // Wait up to 10 seconds for connections to establish
  console.log('Waiting 10 seconds for connections...');
  await new Promise(r => setTimeout(r, 10000));
  
  await browser.close();
  console.log('Done.');
})();
