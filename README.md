# Portfolio Badge Agent

Automatically pulls your badges/certificates from Credly, TryHackMe, Microsoft
Learn, and Google Skills Boost, and regenerates a `badges-section.html` block
you can embed in your portfolio site. Runs weekly via GitHub Actions.

## Setup

1. Push this folder into your portfolio's GitHub repo (root level is fine).
2. Edit `profiles.json` if any of your public profile URLs change.
3. Make sure your Credly profile is set to **public**: Credly → Settings →
   Privacy → "Allow my profile to be publicly visible."
4. Enable GitHub Actions on the repo (Settings → Actions → allow workflows to
   run and to have write permission — needed so the workflow can commit).
5. That's it — it runs automatically every Monday, or trigger it manually
   any time from the **Actions** tab → "Update portfolio badges" → "Run
   workflow."

## Using the output in your site

`badges-section.html` gets overwritten on every run. Two ways to use it:

- **Simplest**: fetch it client-side and inject it —
  ```html
  <div id="badges"></div>
  <script>
    fetch('badges-section.html').then(r => r.text()).then(html => {
      document.getElementById('badges').innerHTML = html;
    });
  </script>
  ```
- **Cleaner**: if your site has a build step, include the file directly at
  build time instead of fetching client-side.

## Running it locally (to test before relying on the schedule)

```bash
npm install
npx playwright install chromium
npm run update
```

This writes `badges.json` (raw data) and `badges-section.html` (rendered
HTML). Open `badges-section.html` in a browser to sanity-check it.

## Important: this WILL need occasional maintenance

Credly, TryHackMe, and Microsoft Learn don't offer a public API for this, so
the scraper reads their rendered pages directly. That's inherently fragile —
if one of these sites redesigns its badge page, that platform's scraper will
start returning 0 badges (it won't crash the others; each is isolated).

If that happens:
1. Open the profile URL in a normal browser.
2. Right-click a badge → **Inspect**.
3. Find the CSS class/attribute wrapping each badge and update the matching
   selector in `scripts/scrape-badges.mjs` (each platform's scraper is a
   separate, commented function).

Google Skills Boost is the most stable of the four since its profile page is
plain server-rendered HTML (no JavaScript needed to read it).
