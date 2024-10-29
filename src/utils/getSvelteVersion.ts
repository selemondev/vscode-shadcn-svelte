import { getProjectDependencies } from "./getProjectDeps";

export const getSvelteVersion = async (): Promise<number> => {
    const dependencies = await getProjectDependencies();
    const svelteDep = dependencies.find((dep) => dep.name === 'svelte');
    return svelteDep!.version;
};
