import { readFileSync } from "node:fs";
import { defineGenerator, type Config } from "automd";

const pkg = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8"));

const badge = (alt: string, img: string, to: string) => `[![${alt}](${img})](${to})`;

const staticBadge = (label: string, value: string) =>
  `https://img.shields.io/badge/${encodeURIComponent(label)}-${encodeURIComponent(value)}-4b0`;

const compact = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(2)}K` : `${n}`;

const marketplaceStats = async (id: string): Promise<Record<string, number>> => {
  const res = await fetch("https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json;api-version=7.2-preview.1" },
    body: JSON.stringify({ filters: [{ criteria: [{ filterType: 7, value: id }] }], flags: 256 }),
  });
  if (!res.ok) {
    throw new Error(`Marketplace query for ${id} failed with ${res.status}`);
  }
  const ext = (await res.json()).results?.[0]?.extensions?.[0];
  if (!ext) {
    throw new Error(`${id} not found on the Marketplace`);
  }
  return Object.fromEntries(ext.statistics.map((s: { statisticName: string; value: number }) => [s.statisticName, s.value]));
};

const vscodeBadges = defineGenerator({
  name: "vscode-badges",
  async generate({ args }) {
    const publisher: string = args.publisher || pkg.publisher;
    const name: string = args.name || pkg.name;
    const github: string = args.github || new URL(pkg.repository.url).pathname.slice(1).replace(/\.git$/, "");
    const branch: string = args.branch || "master";
    const workflow: string = args.workflow || "ci.yml";
    const id = `${publisher}.${name}`;
    const marketplace = `https://marketplace.visualstudio.com/items?itemName=${id}`;
    const openVsx = `https://open-vsx.org/extension/${publisher}/${name}`;
    const stats = await marketplaceStats(id);
    const installs = stats.install ?? 0;
    const downloads = installs + (stats.downloadCount ?? 0);

    return {
      contents: [
        badge("CI", `https://github.com/${github}/actions/workflows/${workflow}/badge.svg?branch=${branch}`, `https://github.com/${github}/actions/workflows/${workflow}`),
        badge("VS Marketplace version", `https://vsmarketplacebadges.dev/version-short/${id}.svg`, marketplace),
        badge("VS Code installs", staticBadge("VS Code installs", compact(installs)), marketplace),
        badge("VS Code downloads", staticBadge("VS Code downloads", compact(downloads)), marketplace),
        badge("VS Code rating", `https://vsmarketplacebadges.dev/rating-short/${id}.svg?label=VS%20Code%20rating`, `${marketplace}&ssr=false#review-details`),
        badge("Open VSX version", `https://img.shields.io/open-vsx/v/${publisher}/${name}`, openVsx),
        badge("Open VSX downloads", `https://img.shields.io/open-vsx/dt/${publisher}/${name}?label=Open%20VSX%20downloads`, openVsx),
        badge("License", `https://img.shields.io/github/license/${github}`, `https://github.com/${github}/blob/${branch}/LICENSE`),
      ].join("\n"),
    };
  },
});

export default {
  generators: {
    "vscode-badges": vscodeBadges,
  },
} satisfies Config;
