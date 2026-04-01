import { ofetch } from "ofetch";
import { to } from "./index";
import { detectPackageManager } from "./vscode";

type OgComponent = {
  type: "registry:ui";
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

const COMPONENT_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_REGISTRY_COMPONENTS = 500;

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

  const seen = new Set<string>();
  const components: Components = [];

  for (const component of data as OgComponent[]) {
    if (component.type !== "registry:ui") {
      continue;
    }

    if (!COMPONENT_NAME_RE.test(component.name) || seen.has(component.name)) {
      continue;
    }

    seen.add(component.name);
    components.push({
      label: component.name,
      detail: `dependencies: ${component.registryDependencies && component.registryDependencies.length > 0 ? component.registryDependencies.join(", ") : "no dependency"}`,
    });

    if (components.length >= MAX_REGISTRY_COMPONENTS) {
      break;
    }
  }

  return components;
};

export const getInstallCmd = async (components: string[], cwd: string) => {
  const packageManager = await detectPackageManager();
  const componentStr = components.join(" ");

  if (packageManager === "bun") {
    return `bunx shadcn-svelte@latest add ${componentStr} -c ${cwd}`;
  }

  if (packageManager === "pnpm") {
    return `pnpm dlx shadcn-svelte@latest add ${componentStr} -c ${cwd}`;
  }

  return `npx shadcn-svelte@latest add ${componentStr} -c ${cwd}`;
};

export const getInitCmd = async (cwd: string) => {
  const packageManager = await detectPackageManager();

  if (packageManager === "bun") {
    return `bunx shadcn-svelte@latest init -c ${cwd}`;
  }

  if (packageManager === "pnpm") {
    return `pnpm dlx shadcn-svelte@latest init -c ${cwd}`;
  }

  return `npx shadcn-svelte@latest init -c ${cwd}`;
};

export const getComponentDocLink = async (component: string) => {
  const shadCnDocUrl = "https://shadcn-svelte.com/docs";
  return `${shadCnDocUrl}/components/${component}`;
};
