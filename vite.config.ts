import { join } from "node:path";
import { defineConfig, type Plugin } from "vite-plus";

function copyManifest(): Plugin {
  let root: string;
  let mode: string;
  return {
    name: "create-manifest",
    apply: "build",
    configResolved(config) {
      root = config.root;
      mode = config.mode;
    },
    async renderStart() {
      const manifest = JSON.parse(
        await this.fs.readFile(join(root, "manifest.json"), { encoding: "utf8" }),
      );
      if (mode !== "prod") {
        manifest.version += "+dev";
      }
      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: mode === "prod" ? JSON.stringify(manifest) : JSON.stringify(manifest, null, 2),
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [copyManifest()],
  staged: {
    "*": "vp check --fix",
  },
  fmt: { sortImports: { newlinesBetween: false } },
  lint: {
    options: { typeAware: true, typeCheck: true },
  },
  build: {
    target: "es2025",
    lib: {
      entry: "src/main.ts",
      cssFileName: "styles",
      formats: ["cjs"],
    },
    rolldownOptions: {
      external: ["obsidian", /^@codemirror/],
      output: {
        entryFileNames: "main.js",
      },
    },
    sourcemap: mode === "prod" ? false : "inline",
    minify: mode === "prod",
  },
  run: {
    tasks: {
      check: ["vp check", "eslint src --flag unstable_native_nodejs_ts_config"],
      "bump-version": "node ./tool/bump_version.ts",
      "test-local": {
        command: "node ./tool/test_local.ts",
        input: ["dist/main.js", "dist/manifest.json", "dist/styles.css"],
      },
    },
  },
}));
