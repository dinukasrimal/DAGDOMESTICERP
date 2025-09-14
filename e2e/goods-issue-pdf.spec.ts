import { test, expect } from '@playwright/test';

// IMPORTANT: Run the app locally first: npm run dev (http://localhost:8080)
// Then run: npx playwright test e2e/goods-issue-pdf.spec.ts

test.describe('Goods Issue PDF requirement persists after refresh', () => {
  test('create -> export -> refresh -> export keeps category requirement', async ({ page }) => {
    // Patch jsPDF in page to capture text content written to the PDF
    await page.addInitScript(() => {
      (window as any).__pdfTexts = [] as any[];
      (window as any).__pdfSaveCalled = false;
      const normalize = (s: string) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
      const patch = () => {
        const w: any = window as any;
        try {
          const jsPDF = w.jspdf?.jsPDF;
          if (!jsPDF || jsPDF.prototype.__patched) return;
          const origText = jsPDF.prototype.text;
          const origSave = jsPDF.prototype.save;
          jsPDF.prototype.text = function(...args: any[]) {
            try { w.__pdfTexts.push(args[0]); } catch {}
            return origText.apply(this, args as any);
          };
          jsPDF.prototype.save = function(...args: any[]) {
            w.__pdfSaveCalled = true;
            return origSave.apply(this, args as any);
          };
          jsPDF.prototype.__patched = true;
        } catch {}
      };
      const id = setInterval(patch, 50);
      (window as any).__stopPatch = () => clearInterval(id);
    });

    // Go to app
    await page.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });

    // Navigate to Goods Issue (adjust selectors if your nav differs)
    // Try sidebar or header link text
    const goodsIssueLink = page.getByRole('link', { name: /goods issue/i }).first();
    if (await goodsIssueLink.isVisible().catch(() => false)) {
      await goodsIssueLink.click();
    } else {
      // Fallback: use a navigation button
      await page.getByText(/goods issue/i).first().click();
    }

    // Open create dialog
    await page.getByRole('button', { name: /issue goods/i }).click();

    // Select PO 2074 (adjust selector to your dropdown/search)
    // Try to find a PO select and pick by text containing 2074
    // If your UI has a dropdown labelled "Purchase Order"
    const poSelectTrigger = page.locator('button:has-text("Purchase Order")').first().or(page.getByRole('button', { name: /purchase order/i }).first());
    if (await poStart(poSelectTrigger)) {
      await page.getByRole('option', { name: /2074/i }).first().click({ force: true });
    } else {
      // Fallback: type 2074 into a PO input
      const poInput = page.getByRole('combobox').first().or(page.getByRole('textbox').first());
      await poInput.fill('2074');
      await page.getByText(/2074/).first().click();
    }

    // Wait for BOM requirements to load and show category row (Elastic & Trims)
    const catRow = page.getByText(/elastic.*trims/i);
    await expect(catRow).toBeVisible({ timeout: 10000 });

    // Read requirement number shown next to the category (within the row)
    // This assumes the requirement value is in the same row; adjust as necessary
    const rowText = await catRow.locator('xpath=ancestor::tr').textContent();
    expect(rowText).toBeTruthy();

    // At least confirm requirement value looks non-zero in UI
    const requirementFromUI = extractFirstNumber(rowText || '');
    expect(requirementFromUI).toBeGreaterThan(0);

    // Create the issue (this persists CATEGORY_TOTALS in notes)
    await page.getByRole('button', { name: /create goods issue/i }).click();

    // Wait for toast or list update
    await expect(page.getByText(/goods issue .* created/i)).toBeVisible({ timeout: 10000 });

    // Export PDF from the new issue row
    await page.getByRole('button', { name: /export pdf/i }).first().click();

    // Grab captured PDF text
    let pdfTexts = await page.evaluate(() => (window as any).__pdfTexts);
    expect(pdfTexts.length).toBeGreaterThan(0);

    // Confirm requirement is reflected (non-zero) before refresh
    const beforeReq = findRequirementFromPdfTexts(pdfTexts);
    expect(beforeReq).toBeGreaterThan(0);

    // Refresh page
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Export PDF again (from first row)
    await page.getByRole('button', { name: /export pdf/i }).first().click();
    pdfTexts = await page.evaluate(() => (window as any).__pdfTexts);
    const afterReq = findRequirementFromPdfTexts(pdfTexts);

    // Requirement must remain > 0 after refresh
    expect(afterReq).toBeGreaterThan(0);
  });
});

function extractFirstNumber(text: string): number {
  const m = text.match(/([0-9]+(?:\.[0-9]+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

function findRequirementFromPdfTexts(arr: any[]): number {
  const lines = (arr || []).map(String);
  // Look for the totals line written in pdfUtils: `Totals — Requirement: X  |  Issued So Far: Y  |  Balance: Z`
  const line = lines.find(l => /requirement\s*:\s*[0-9]/i.test(l));
  if (!line) return 0;
  const m = line.match(/requirement\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
  return m ? parseFloat(m[1]) : 0;
}

async function poStart(trigger: import('@playwright/test').Locator) {
  try {
    if (await trigger.isVisible()) {
      await trigger.click();
      return true;
    }
  } catch {}
  return false;
}

