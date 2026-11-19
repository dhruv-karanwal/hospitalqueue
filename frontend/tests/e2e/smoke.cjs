// Playwright smoke test of the main flow. Run via `make e2e` (starts both servers).
// Uses the system-installed `playwright` package; no extra npm dependency.
const { chromium } = require('playwright');

const BASE = process.env.MQ_URL || 'http://127.0.0.1:5173/#/';
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`); };

async function unlabeled(page) {
  return page.evaluate(() => [...document.querySelectorAll('input, select, textarea, button')]
    .filter((el) => el.type !== 'hidden' && !el.hidden && el.offsetParent !== null)
    .filter((el) => !(el.labels?.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.textContent.trim()))
    .length);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await page.goto(BASE + 'simulator');
    await page.getByText('Backend connected').waitFor({ timeout: 10000 });
    check('backend health shown', true);
    await page.getByLabel('Scenario', { exact: true }).selectOption('opd-morning-rush');
    await page.getByRole('button', { name: 'Load scenario' }).click();
    await page.getByText('OPD morning rush loaded').waitFor();
    check('scenario loads 30 patients', await page.getByText('Patients (30)').isVisible());
    await page.getByLabel('Scheduling policy').selectOption('RR');
    await page.getByRole('button', { name: /^Run Round robin/ }).click();
    await page.getByText('Last run:').waitFor();
    check('simulation runs', (await page.getByText('Last run:').textContent()).includes('30 patients'));
    check('simulator controls are labelled', (await unlabeled(page)) === 0);

    await page.getByRole('button', { name: 'Open timeline' }).click();
    await page.getByText('Ward board').waitFor();
    check('gantt segments drawn', (await page.locator('.seg-block').count()) > 0);
    await page.getByRole('button', { name: 'Reset' }).click();
    await page.getByRole('button', { name: 'Next event' }).click();
    const decided = await page.locator('.decision').first().textContent();
    check('timeline explains decisions', /Round Robin|arrives/.test(decided), decided.slice(0, 60));

    await page.goto(BASE + 'compare');
    await page.getByRole('button', { name: /Compare all policies/ }).click();
    await page.getByText('Side by side').waitFor();
    check('compare shows 7 policies', (await page.locator('tbody tr').count()) === 7);
    check('best values marked', (await page.locator('td.best').count()) > 0);

    await page.goto(BASE + 'trace');
    await page.getByLabel('Event type').selectOption('PREEMPT').catch(() => page.getByLabel('Event type').selectOption('QUANTUM_EXPIRED'));
    check('trace filters', /Showing \d+ of \d+/.test(await page.getByText(/Showing/).textContent()));

    await page.goto(BASE + 'sync');
    await page.getByText(/Race condition: \d/).waitFor();
    await page.getByRole('button', { name: 'Mutex' }).click();
    await page.getByText(/Correct: every token/).waitFor();
    check('race demo off/on lock', true);

    await page.goto(BASE + 'dashboard');
    await page.getByRole('button', { name: 'Start session' }).click();
    await page.locator('.clock-value').waitFor();
    await page.getByRole('button', { name: 'Step 5 min' }).click();
    await page.waitForFunction(() => document.querySelector('.clock-value')?.textContent === '5');
    check('live session steps the clock', true);

    await page.goto(BASE + 'concepts');
    await page.reload();
    await page.getByRole('heading', { name: 'Concepts and viva' }).waitFor();
    await page.keyboard.press('Tab');
    check('skip link is first focus stop', (await page.evaluate(() => document.activeElement?.textContent)) === 'Skip to content');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE + 'compare');
    await page.waitForTimeout(300);
    check('no horizontal page scroll on phone', (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);
    check('no console errors', errors.length === 0, errors.join(' | '));
  } catch (e) {
    check('flow completed', false, e.message.split('\n')[0]);
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
