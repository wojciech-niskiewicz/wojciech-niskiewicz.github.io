// render-badges.mjs
// Turns badges.json into a ready-to-embed HTML snippet (badges-section.html).
// Include it in your portfolio with:
//   <div id="badges"></div>
//   <script>
//     fetch('badges-section.html').then(r => r.text()).then(html => {
//       document.getElementById('badges').innerHTML = html;
//     });
//   </script>
// or, if your site build supports it, just inline the file at build time.

import { readFile, writeFile } from "node:fs/promises";

const data = JSON.parse(await readFile(new URL("../badges.json", import.meta.url)));

const platformLabels = {
  credly: "Credly",
  tryhackme: "TryHackMe",
  microsoftLearn: "Microsoft Learn",
  googleSkills: "Google Skills Boost",
};

function renderBadge(b) {
  const img = b.image
    ? `<img src="${b.image}" alt="${escapeHtml(b.name)}" loading="lazy" style="width:72px;height:72px;object-fit:contain;">`
    : "";
  const inner = `${img}<span>${escapeHtml(b.name)}</span>`;
  return `<li class="badge-item">${b.url ? `<a href="${b.url}" target="_blank" rel="noopener">${inner}</a>` : inner}</li>`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

let html = `<section class="badges-section">\n  <p class="badges-updated">Last updated ${new Date(data.updatedAt).toLocaleDateString()}</p>\n`;

for (const [key, badges] of Object.entries(data.sources)) {
  if (!badges.length) continue;
  html += `  <h3>${platformLabels[key] || key}</h3>\n  <ul class="badge-grid">\n`;
  html += badges.map(renderBadge).join("\n") + "\n";
  html += `  </ul>\n`;
}

html += `</section>\n`;

await writeFile(new URL("../badges-section.html", import.meta.url), html);
console.log("Wrote badges-section.html");
