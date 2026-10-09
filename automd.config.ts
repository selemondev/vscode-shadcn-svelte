import { readFileSync } from "node:fs";
import { defineGenerator, type Config } from "automd";

const pkg = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8"));

const badge = (alt: string, img: string, to: string) => `[![${alt}](${img})](${to})`;

const vscodeBadges = defineGenerator({
  name: "vscode-badges",
  generate({ args }) {
    const publisher: string = args.publisher || pkg.publisher;
    const name: string = args.name || pkg.name;
    const github: string = args.github || new URL(pkg.repository.url).pathname.slice(1).replace(/\.git$/, "");
    const branch: string = args.branch || "master";
    const workflow: string = args.workflow || "ci.yml";
    const id = `${publisher}.${name}`;
    const marketplace = `https://marketplace.visualstudio.com/items?itemName=${id}`;
    const openVsx = `https://open-vsx.org/extension/${publisher}/${name}`;

    return {
      contents: [
        badge("CI", `https://github.com/${github}/actions/workflows/${workflow}/badge.svg?branch=${branch}`, `https://github.com/${github}/actions/workflows/${workflow}`),
        badge("VS Marketplace version", `https://vsmarketplacebadges.dev/version-short/${id}.svg`, marketplace),
        badge("VS Code installs", `https://vsmarketplacebadges.dev/installs-short/${id}.svg?label=VS%20Code%20installs`, marketplace),
        badge("VS Code downloads", `https://vsmarketplacebadges.dev/downloads-short/${id}.svg?label=VS%20Code%20downloads`, marketplace),
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
