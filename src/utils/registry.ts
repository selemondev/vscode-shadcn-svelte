import { ofetch } from "ofetch";
import { to } from "./index";
import { detectPackageManager } from "./vscode";

type OgComponent = {
  type: "components:ui"
  name: string
  files: string[]
  dependencies?: string[]
  registryDependencies?: string[]
};

type Component = {
  label: string
  detail?: string
};

export const shadCnDocUrl = "https://shadcn-svelte.com/docs";

export type Components = Component[];

export const getRegistry = async (): Promise<Components | null> => {
  const reqUrl = "https://shadcn-svelte.com/registry/index.json";
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

export const getInstallCmd = async (components: string[], cwd: string) => {
  const packageManager = await detectPackageManager();
  const componentStr = components.join(" ");

  if (packageManager === "bun") {
    return `bunx shadcn-svelte add ${componentStr} -c ${cwd}`;
  }

  if (packageManager === "pnpm") {
    return `pnpm dlx shadcn-svelte@latest add ${componentStr} -c ${cwd}`;
  }

  return `npx shadcn-svelte@latest add ${componentStr} -c ${cwd}`;
};

export const getInitCmd = async (cwd: string) => {
  const packageManager = await detectPackageManager();

  if (packageManager === "bun") {
    return `bunx shadcn-svelte init -c ${cwd}`;
  }

  if (packageManager === "pnpm") {
    return `pnpm dlx shadcn-svelte@latest init -c ${cwd}`;
  }

  return `npx shadcn-svelte@latest init -c ${cwd}`;
};

export const getComponentDocLink = (component: string) => {
  return `${shadCnDocUrl}/components/${component}`;
};
