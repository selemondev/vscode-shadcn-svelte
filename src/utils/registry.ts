import { ofetch } from "ofetch";
import { to } from "./index";
import { detectPackageManager } from "./vscode";
import { getSvelteVersion } from "./getSvelteVersion";

type OgComponent = {
  type: "components:ui";
  name: string;
  files: string[];
  dependencies?: string[];
  registryDependencies?: string[];
};

export type Component = {
  label: string;
  detail?: string;
};

export type Components = Component[];

export const getRegistry = async (): Promise<Components | null> => {
  const svelteVersion = await getSvelteVersion();
  const reqUrl = svelteVersion >= 5 ? "https://next.shadcn-svelte.com/registry/index.json" : "https://shadcn-svelte.com/registry/index.json";
  const [res, err] = await to(ofetch(reqUrl));

  if (err || !res) {
    return null;
  }

  const [data] = await to(res);

  if (!data) {
    return null;
  }

  const components: Components = (data as OgComponent[]).map((c) => {
    const component: Component = {
      label: c.name,
      detail: `dependencies: ${c.dependencies && c.dependencies.length > 0 ? c.dependencies.join(" ") : "no dependency"}`,
    };

    return component;
  });

  return components;
};

export const getInstallCmd = async (components: string[]) => {
  const packageManager = await detectPackageManager();
  const componentStr = components.join(" ");
  const svelteVersion = await getSvelteVersion();

  if (packageManager === "bun") {
    return svelteVersion >= 5 ? `bunx shadcn-svelte@next add ${componentStr}` : `bunx shadcn-svelte add ${componentStr}`;
  }

  if (packageManager === "pnpm") {
    return svelteVersion >= 5 ? `pnpm dlx shadcn-svelte@next add ${componentStr}` : `pnpm dlx shadcn-svelte@latest add ${componentStr}`;
  }

  return svelteVersion >= 5 ? `npx shadcn-svelte@next add ${componentStr}` : `npx shadcn-svelte@latest add ${componentStr}`;
};

export const getInitCmd = async () => {
  const packageManager = await detectPackageManager();
  const svelteVersion = await getSvelteVersion();

  if (packageManager === "bun") {
    return svelteVersion >= 5 ? 'bunx shadcn-svelte@next init' : "bunx shadcn-svelte init";
  }

  if (packageManager === "pnpm") {
    return svelteVersion >= 5 ? 'pnpm dlx shadcn-svelte@next init' : "pnpm dlx shadcn-svelte@latest init";
  }

  return svelteVersion >= 5 ? 'npx shadcn-svelte@next init' : "npx shadcn-svelte@latest init";
};

export const getComponentDocLink = async (component: string) => {
  const svelteVersion = await getSvelteVersion();
  const shadCnDocUrl = svelteVersion >= 5 ? "https://next.shadcn-svelte.com/docs" : "https://shadcn-svelte.com/docs";
  return `${shadCnDocUrl}/components/${component}`;
};
