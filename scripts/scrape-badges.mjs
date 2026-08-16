// scrape-badges.mjs
//
// Visits your public Credly, TryHackMe, Microsoft Learn, and Google Skills
// Boost profiles and pulls out badge/credential data into badges.json.
//
// IMPORTANT: these sites don't offer public APIs for this, so this script
// reads their rendered pages instead. That means it WILL break whenever one
// of these sites changes its page markup. When a platform returns 0 badges
// unexpectedly, open that profile in a real browser, right-click a badge,
// choose "Inspect", and update the matching selector below.
//
// Each platform is wrapped in try/catch so one broken scraper doesn't take
// the others down with it.

import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";

const profiles = JSON.parse(await readFile(new URL("../profiles.json", import.meta.url)));

async function withPage(fn) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
    });
    return await fn(page);
  } finally {
    await browser.close();
  }
}

// ---- Credly -----------------------------------------------------------
// Badge cards on a public Credly profile render (after JS) as elements
// with class "cr-standard-grid-item" wrapping an image + title link.
async function scrapeCredly(url) {
  return withPage(async (page) => {
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForSelector('[data-testid="badge"], .cr-standard-grid-item', { timeout: 15000 }).catch(() => {});

    return page.$$eval(
      '[data-testid="badge"], .cr-standard-grid-item',
      (nodes) =>
        nodes.map((n) => {
          const titleEl = n.querySelector("a, .cr-standard-grid-item-title, img");
          const imgEl = n.querySelector("img");
          const linkEl = n.querySelector("a");
          return {
            name: (titleEl?.getAttribute("alt") || titleEl?.textContent || "").trim(),
            image: imgEl?.src || null,
            url: linkEl?.href || null,
          };
        }).filter((b) => b.name)
    );
  });
}

// ---- TryHackMe ----------------------------------------------------------
// Public profile badges render inside elements carrying a "badge" test id
// or class once the client app hydrates.
async function scrapeTryHackMe(url) {
  return withPage(async (page) => {
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForSelector('[class*="badge" i] img, [data-testid*="badge" i]', { timeout: 15000 }).catch(() => {});

    return page.$$eval('[class*="badge" i] img', (imgs) =>
      imgs
        .map((img) => ({
          name: (img.alt || "").trim(),
          image: img.src || null,
          url: null,
        }))
        .filter((b) => b.name)
    );
  });
}

// ---- Microsoft Learn ------------------------------------------------------
// Achievements page lists trophy/badge cards with a title + image once
// the page's client-side data loads.
async function scrapeMicrosoftLearn(url) {
  return withPage(async (page) => {
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForSelector('[class*="achievement" i], [class*="badge" i]', { timeout: 15000 }).catch(() => {});

    return page.$$eval('[class*="achievement" i], [class*="badge" i]', (nodes) =>
      nodes
        .map((n) => {
          const img = n.querySelector("img");
          const title = n.querySelector("[class*='title' i]") || img;
          return {
            name: (title?.getAttribute?.("alt") || title?.textContent || "").trim(),
            image: img?.src || null,
            url: null,
          };
        })
        .filter((b) => b.name)
    );
  });
}

// ---- Google Skills Boost --------------------------------------------------
// This one is server-rendered, no JS needed, but we reuse the same browser
// context for consistency. Badge cards appear as ".profile-badge" once the
// user has any; the page literally says "hasn't earned any badges yet"
// when empty (handled below).
async function scrapeGoogleSkills(url) {
  return withPage(async (page) => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });

    const empty = await page.locator("text=hasn't earned any badges yet").count();
    if (empty > 0) return [];

    return page.$$eval(".profile-badge, [class*='badge' i]", (nodes) =>
      nodes
        .map((n) => {
          const img = n.querySelector("img");
          const title = n.querySelector("[class*='title' i]") || img;
          return {
            name: (title?.getAttribute?.("alt") || title?.textContent || "").trim(),
            image: img?.src || null,
            url: null,
          };
        })
        .filter((b) => b.name)
    );
  });
}

async function scrapeSafely(label, fn, url) {
  try {
    const badges = await fn(url);
    console.log(`${label}: found ${badges.length} badge(s)`);
    return badges;
  } catch (err) {
    console.error(`${label}: scrape failed — ${err.message}`);
    return [];
  }
}

const result = {
  updatedAt: new Date().toISOString(),
  sources: {
    credly: await scrapeSafely("Credly", scrapeCredly, profiles.credly),
    tryhackme: await scrapeSafely("TryHackMe", scrapeTryHackMe, profiles.tryhackme),
    microsoftLearn: await scrapeSafely("Microsoft Learn", scrapeMicrosoftLearn, profiles.microsoftLearn),
    googleSkills: await scrapeSafely("Google Skills Boost", scrapeGoogleSkills, profiles.googleSkills),
  },
};

await writeFile(new URL("../badges.json", import.meta.url), JSON.stringify(result, null, 2));
console.log("Wrote badges.json");
