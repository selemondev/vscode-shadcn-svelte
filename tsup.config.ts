import { defineConfig } from "tsup";

export default defineConfig({
    entry: ['./src/extension.ts'],
    outDir: "dist",
    dts: false,
    splitting: false,
    clean: true,
    platform: 'node',
    sourcemap: false,
    external: ['vscode'],
    noExternal: ['ofetch'],
})