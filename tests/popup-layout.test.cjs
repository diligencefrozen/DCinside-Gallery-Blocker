const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

test('popup keeps only main content scrollable and the donation footer visible at 400 by 600', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 600 } });
    const html = fs.readFileSync(path.join(__dirname, '../src/ui/popup/popup.html'), 'utf8')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    const popupJs = fs.readFileSync(path.join(__dirname, '../src/ui/popup/popup.js'), 'utf8');
    assert.match(popupJs, /popupMainEl\.offsetWidth - popupMainEl\.clientWidth/);
    assert.match(popupJs, /--popup-scrollbar-width/);
    await page.setContent(html);
    await page.evaluate(() => {
      const main = document.querySelector('.popup-main');
      const scrollbarWidth = Math.max(0, main.offsetWidth - main.clientWidth);
      document.documentElement.style.setProperty('--popup-scrollbar-width', `${scrollbarWidth}px`);
      document.querySelector('#updateNotice').hidden = false;
      document.querySelector('#updateNoticeLink').hidden = false;
    });
    const layout = await page.evaluate(() => {
      const main = document.querySelector('.popup-main');
      const footer = document.querySelector('.popup-footer');
      const donation = document.querySelector('.donation-card');
      const topCard = document.querySelector('.block-summary-card');
      const modeSelect = document.querySelector('#userBlockTriggerMode');
      const selectedText = modeSelect.selectedOptions[0].textContent;
      const releaseLink = document.querySelector('#updateNoticeLink');
      const selectStyle = getComputedStyle(modeSelect);
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      context.font = `${selectStyle.fontWeight} ${selectStyle.fontSize} ${selectStyle.fontFamily}`;
      const requiredSelectWidth = Math.ceil(context.measureText(selectedText).width) + 54;
      return {
        bodyWidth: document.body.getBoundingClientRect().width,
        bodyHeight: document.body.getBoundingClientRect().height,
        mainOverflow: getComputedStyle(main).overflowY,
        mainScrollable: main.scrollHeight > main.clientHeight,
        footerTop: footer.getBoundingClientRect().top,
        footerBottom: footer.getBoundingClientRect().bottom,
        donationInsideMain: main.contains(donation),
        footerPosition: getComputedStyle(footer).position,
        footerBackground: getComputedStyle(footer).backgroundColor,
        footerBorderTop: getComputedStyle(footer).borderTopWidth,
        bodyBackground: getComputedStyle(document.body).backgroundColor,
        documentOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        selectValue: modeSelect.value,
        selectText: selectedText,
        selectWidth: modeSelect.getBoundingClientRect().width,
        requiredSelectWidth,
        selectInsideContainer: modeSelect.getBoundingClientRect().right <= modeSelect.parentElement.getBoundingClientRect().right,
        topCardLeft: topCard.getBoundingClientRect().left,
        topCardRight: topCard.getBoundingClientRect().right,
        donationLeft: donation.getBoundingClientRect().left,
        donationRight: donation.getBoundingClientRect().right,
        donationBackground: getComputedStyle(donation).backgroundImage,
        topCardBackground: getComputedStyle(topCard).backgroundImage,
        donationBorderColor: getComputedStyle(donation).borderColor,
        topCardBorderColor: getComputedStyle(topCard).borderColor,
        donationBorderRadius: getComputedStyle(donation).borderRadius,
        releaseCursor: getComputedStyle(releaseLink).cursor,
        releaseDisplay: getComputedStyle(releaseLink).display,
        releaseWidth: releaseLink.getBoundingClientRect().width,
        releaseContainerWidth: releaseLink.parentElement.getBoundingClientRect().width
      };
    });
    assert.equal(layout.bodyWidth, 400);
    assert.ok(layout.bodyHeight <= 600);
    assert.equal(layout.mainOverflow, 'auto');
    assert.equal(layout.mainScrollable, true);
    assert.equal(layout.donationInsideMain, false);
    assert.equal(layout.footerPosition, 'static');
    assert.notEqual(layout.footerBackground, layout.bodyBackground);
    assert.equal(layout.footerBorderTop, '1px');
    assert.ok(layout.footerTop >= 0 && layout.footerBottom <= 600);
    assert.equal(layout.documentOverflowX, 0);
    assert.equal(layout.selectValue, 'instant');
    assert.equal(layout.selectText, '우클릭 즉시 차단/해제');
    assert.equal(layout.selectInsideContainer, true);
    assert.ok(layout.selectWidth >= layout.requiredSelectWidth, `${layout.selectWidth}px select is too narrow for ${layout.selectText}`);
    assert.ok(Math.abs(layout.topCardLeft - layout.donationLeft) <= 1);
    assert.ok(Math.abs(layout.topCardRight - layout.donationRight) <= 1);
    assert.match(layout.donationBackground, /linear-gradient/);
    assert.match(layout.donationBackground, /rgba\(15, 23, 42, 0\.98\)/);
    assert.notEqual(layout.donationBackground, layout.topCardBackground);
    assert.notEqual(layout.donationBorderColor, layout.topCardBorderColor);
    assert.equal(layout.donationBorderRadius, '14px');
    assert.equal(layout.releaseCursor, 'pointer');
    assert.equal(layout.releaseDisplay, 'flex');
    assert.ok(layout.releaseWidth >= layout.releaseContainerWidth - 1);
    await page.locator('#updateNoticeLink').hover();
    const hoverBackground = await page.locator('#updateNoticeLink').evaluate((link) => getComputedStyle(link).backgroundColor);
    assert.notEqual(hoverBackground, 'rgba(0, 0, 0, 0)');
    await page.locator('.block-summary-details > summary').focus();
    await page.keyboard.press('Tab');
    const focusState = await page.locator('#updateNoticeLink').evaluate((link) => ({
      focused: document.activeElement === link,
      outline: getComputedStyle(link).outlineStyle
    }));
    assert.equal(focusState.focused, true);
    assert.equal(focusState.outline, 'solid');
    await page.locator('.donation-button').hover();
    const donationHover = await page.locator('.donation-button').evaluate((button) => getComputedStyle(button).backgroundColor);
    assert.notEqual(donationHover, 'rgba(0, 0, 0, 0)');
    await page.locator('#openOptions').focus();
    await page.keyboard.press('Tab');
    const donationFocus = await page.locator('.donation-button').evaluate((button) => ({
      focused: document.activeElement === button,
      outline: getComputedStyle(button).outlineStyle
    }));
    assert.equal(donationFocus.focused, true);
    assert.equal(donationFocus.outline, 'solid');
  } finally {
    await browser.close();
  }
});

for (const scenario of [
  {
    name: 'opens the exact trusted GitHub release URL',
    candidate: 'https://github.com/diligencefrozen/DCinside-Gallery-Blocker/releases/tag/7.3.41.2026',
    expected: 'https://github.com/diligencefrozen/DCinside-Gallery-Blocker/releases/tag/7.3.41.2026'
  },
  {
    name: 'falls back to the repository releases page when the URL is missing',
    candidate: '',
    expected: 'https://github.com/diligencefrozen/DCinside-Gallery-Blocker/releases'
  },
  {
    name: 'rejects a release URL outside the trusted repository',
    candidate: 'https://example.com/malicious-release',
    expected: 'https://github.com/diligencefrozen/DCinside-Gallery-Blocker/releases'
  }
]) {
  test(`popup release link ${scenario.name}`, async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 400, height: 600 } });
      await page.setContent('<a id="release" hidden>Release</a>');
      await page.evaluate(() => {
        window.__openedTabs = [];
        window.chrome = { tabs: { create: (details) => window.__openedTabs.push(details) } };
      });
      await page.addScriptTag({ path: path.join(__dirname, '../src/ui/popup/release-link.js') });
      await page.evaluate(({ candidate }) => {
        window.DCBPopupReleaseLink.configure(document.querySelector('#release'), candidate);
      }, scenario);
      await page.locator('#release').click();
      const result = await page.evaluate(() => ({
        openedTabs: window.__openedTabs,
        hidden: document.querySelector('#release').hidden,
        cursor: getComputedStyle(document.querySelector('#release')).cursor
      }));
      assert.equal(result.hidden, false);
      assert.deepEqual(result.openedTabs, [{ url: scenario.expected }]);
    } finally {
      await browser.close();
    }
  });
}
