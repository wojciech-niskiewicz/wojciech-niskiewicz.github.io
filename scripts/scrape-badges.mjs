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
// Confirmed selector: badge images carry a class starting with
// "EarnedBadgeCardstyles__ImageContainer" (styled-components; the hash
// suffix can change on Credly redeploys, so we match on the stable prefix).
async function scrapeCredly(url) {
  return withPage(async (page) => {
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
    await page
      .waitForSelector('img[class*="EarnedBadgeCardstyles__ImageContainer"]', { timeout: 15000 })
      .catch(() => {});

    return page.$$eval('img[class*="EarnedBadgeCardstyles__ImageContainer"]', (imgs) =>
      imgs
        .map((img) => {
          const link = img.closest("a");
          return {
            name: (img.alt || "").trim(),
            image: img.src || null,
            url: link ? link.href : null,
          };
        })
        .filter((b) => b.name)
    );
  });
}

// ---- TryHackMe ----------------------------------------------------------
// Confirmed selector: badge images carry title="TryHackMe" and their name
// lives in the alt attribute (a short slug like "owasp-10"). The Badges tab
// is a Radix UI tab trigger (role="tab", accessible name "Badges") — a
// loose text match risked clicking the wrong "Badges" text elsewhere on
// the page, so we target the role + name directly instead.
async function scrapeTryHackMe(url) {
  return withPage(async (page) => {
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });

    const badgesTab = page.getByRole("tab", { name: "Badges" });
    await badgesTab.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(2000); // let the tab panel render/animate in

    await page.waitForSelector('img[title="TryHackMe"]', { timeout: 15000 }).catch(() => {});

    return page.$$eval('img[title="TryHackMe"]', (imgs) =>
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
// Confirmed selector: achievement images have alt="" (no usable text), but
// their src is a slug-named SVG like ".../achievements/sc-100-design-....svg"
// — we derive a readable name from that filename instead.
async function scrapeMicrosoftLearn(url) {
  return withPage(async (page) => {
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForSelector('img[src*="/achievements/"]', { timeout: 15000 }).catch(() => {});

    return page.$$eval('img[src*="/achievements/"]', (imgs) =>
      imgs
        .map((img) => {
          const src = img.src || "";
          const file = src.split("/").pop().replace(/\.svg(\?.*)?$/, "");
          const name = file.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          return { name: name.trim(), image: src || null, url: null };
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
