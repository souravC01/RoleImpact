const { chromium } = require('C:/Users/soura/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('path');

async function main() {
  const workspace = 'C:/Users/soura/.codex/.chatgpt-projects/g-p-6a7be822d72c81919ff60a55d05d082e';
  const source = `file:///${workspace}/deliverables/roleimpact-wireframes.fragment.html`;
  const output = path.join(workspace, 'qa/roleimpact_wireframes/screens');
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  });
  for (const screen of ['dashboard', 'explorer', 'entity', 'simulation', 'results', 'history']) {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 });
    await desktop.goto(`${source}#${screen}`, { waitUntil: 'load' });
    await desktop.screenshot({ path: path.join(output, `${screen}.png`) });
    await desktop.close();
  }

  const tablet = await browser.newPage({ viewport: { width: 736, height: 1100 }, deviceScaleFactor: 1 });
  await tablet.goto(`${source}#dashboard`, { waitUntil: 'load' });
  await tablet.screenshot({ path: path.join(output, 'dashboard-736.png') });
  await tablet.close();

  const mobile = await browser.newPage({ viewport: { width: 360, height: 1600 }, deviceScaleFactor: 1 });
  await mobile.goto(`${source}#results`, { waitUntil: 'load' });
  await mobile.screenshot({ path: path.join(output, 'results-360.png') });
  const metrics = await mobile.evaluate(() => ({
    innerWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    rootWidth: document.getElementById('roleimpact-wireframes-v1').getBoundingClientRect().width,
  }));
  process.stdout.write(JSON.stringify(metrics));
  await mobile.close();
  await browser.close();
}

main().catch((error) => {
  process.stderr.write(String(error.stack || error));
  process.exit(1);
});
