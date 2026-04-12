import { defineConfig, type UserConfig, type Plugin } from "vite-plus";
import { join } from "node:path";

const obsidianmdRules = {
  "obsidianmd/commands/no-command-in-command-id": "error",
  "obsidianmd/commands/no-command-in-command-name": "error",
  "obsidianmd/commands/no-default-hotkeys": "error",
  "obsidianmd/commands/no-plugin-id-in-command-id": "error",
  "obsidianmd/commands/no-plugin-name-in-command-name": "error",
  "obsidianmd/settings-tab/no-manual-html-headings": "error",
  "obsidianmd/settings-tab/no-problematic-settings-headings": "error",
  "obsidianmd/vault/iterate": "error",
  "obsidianmd/detach-leaves": "error",
  "obsidianmd/hardcoded-config-path": "error",
  "obsidianmd/no-forbidden-elements": "error",
  // "obsidianmd/no-plugin-as-component": "error",
  "obsidianmd/no-sample-code": "error",
  "obsidianmd/no-tfile-tfolder-cast": "error",
  // "obsidianmd/no-view-references-in-plugin": "error",
  "obsidianmd/no-static-styles-assignment": "error",
  "obsidianmd/object-assign": "error",
  "obsidianmd/platform": "error",
  // "obsidianmd/prefer-file-manager-trash-file": "warn",
  "obsidianmd/prefer-abstract-input-suggest": "error",
  "obsidianmd/regex-lookbehind": "error",
  "obsidianmd/sample-names": "error",
  "obsidianmd/validate-manifest": "error",
  "obsidianmd/validate-license": ["error"],
  "obsidianmd/ui/sentence-case": ["error", { enforceCamelCaseLower: true }],
} satisfies NonNullable<UserConfig["lint"]>["rules"];

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
      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: mode === "prod" ? JSON.stringify(manifest) : JSON.stringify(manifest, null, 2),
      });
    },
  };
}

// XXX: Access mode from config
// See https://github.com/voidzero-dev/vite-plus/issues/930
function modeWorkaround(): Plugin {
  return {
    name: "mode-workaround",
    config(_config, { mode }) {
      return {
        build: {
          sourcemap: mode === "prod" ? false : "inline",
          minify: mode === "prod",
        },
      };
    },
  };
}

export default defineConfig({
  plugins: [copyManifest(), modeWorkaround()],
  staged: {
    "*": "vp check --fix",
  },
  fmt: {},
  lint: {
    options: { typeAware: true, typeCheck: true },
    jsPlugins: ["eslint-plugin-obsidianmd"],
    rules: { ...obsidianmdRules },
  },
  build: {
    target: "es2025",
    lib: {
      entry: "src/main.ts",
      formats: ["cjs"],
    },
    rolldownOptions: {
      external: ["obsidian", /^@codemirror/],
      output: {
        entryFileNames: "main.js",
      },
    },
  },
});
