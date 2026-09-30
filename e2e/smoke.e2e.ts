import { expect, test, type Page } from "@playwright/test";

const code = (page: Page) => page.locator("[class*=chars]").textContent().then((t) => t!);
const phase = (page: Page) => page.locator("[data-phase]").getAttribute("data-phase");
const results = (page: Page) => page.locator("[class*=results] dl");

/** Types like a user: one Enter per line, never indents or blank lines. Wrong key at the given positions. */
async function typeCode(page: Page, text: string, wrongAt = new Set<number>()) {
  for (let i = 0; i < text.length; i++) {
    if (wrongAt.has(i)) await page.keyboard.type(text[i] === "x" ? "y" : "x");
    else if (text[i] === "\n") await page.keyboard.press("Enter");
    else await page.keyboard.type(text[i]);
    if (text[i] === "\n") while (text[i + 1] === " " || text[i + 1] === "\n") i++;
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector("[class*=chars]");
});

test("a full run never re-renders or reflows the code block", async ({ page }) => {
  await page.evaluate(() => {
    const w = window as unknown as { nodes: number; shift: number };
    w.nodes = 0;
    w.shift = 0;
    new MutationObserver((l) => (w.nodes += l.filter((r) => r.type === "childList").length)).observe(
      document.querySelector("[class*=view]")!,
      { subtree: true, childList: true },
    );
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (w.shift += (e as unknown as { value: number }).value))).observe({
      type: "layout-shift",
    });
  });
  const box = await page.locator("[class*=view]").boundingBox();
  await typeCode(page, await code(page));
  expect(await phase(page)).toBe("done");
  await expect(results(page)).toContainText("accuracy100%");
  expect(await page.evaluate(() => (window as unknown as { nodes: number }).nodes)).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { shift: number }).shift)).toBeLessThan(0.001);
  expect(await page.locator("[class*=view]").boundingBox()).toEqual(box);
});

test("keys: Tab restarts, Enter and Esc go next", async ({ page }) => {
  const first = await code(page);
  const wrong = [...first].findIndex((c, i) => i > 3 && /\w/.test(c));
  await typeCode(page, first, new Set([wrong]));
  await expect(results(page)).not.toContainText("accuracy100%");

  await page.keyboard.press("Tab");
  expect(await code(page)).toBe(first);
  expect(await phase(page)).toBe("idle");

  await typeCode(page, first);
  await page.keyboard.press("Enter");
  expect(await code(page)).not.toBe(first);
  await expect(page.locator("[class*=chars] [class*=correct]")).toHaveCount(0);

  const second = await code(page);
  await page.keyboard.press("Escape");
  expect(await code(page)).not.toBe(second);
});

test("Enter resyncs: mid-line skips to the next line, other keys wait at a newline", async ({ page }) => {
  const text = await code(page);
  const firstLine = text.split("\n")[0];
  await page.keyboard.type(text[0]);
  await page.keyboard.press("Enter");
  await expect(page.locator("[class*=chars] [class*=wrong]")).toHaveCount(firstLine.length);

  await page.keyboard.press("Tab");
  await typeCode(page, firstLine);
  await page.keyboard.type("xyz");
  await expect(page.locator("[class*=chars] [class*=wrong]")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page.locator("[class*=chars] [class*=wrong]")).toHaveCount(0);
  await typeCode(page, text.slice(firstLine.length + 1).trimStart());
  expect(await phase(page)).toBe("done");
});

test("tabs narrow the pool, keep focus and persist", async ({ page }) => {
  await page.getByRole("button", { name: "routes" }).click();
  expect((await code(page)).startsWith("@")).toBe(true);
  await page.keyboard.type("@");
  expect(await phase(page)).toBe("typing");

  await page.reload();
  await expect(page.getByRole("button", { name: "routes" })).toHaveAttribute("aria-pressed", "true");
});

test("phone width: no horizontal scroll, tap to type", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.locator("[class*=view]").click();
  await typeCode(page, await code(page));
  expect(await phase(page)).toBe("done");
});
