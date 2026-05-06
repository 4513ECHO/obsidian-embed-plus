import { object } from "@optique/core/constructs";
import { optional } from "@optique/core/modifiers";
import { argument, option } from "@optique/core/primitives";
import { choice, string } from "@optique/core/valueparser";
import { run } from "@optique/run";
import $ from "dax";
import semver from "semver";
import manifest from "../manifest.json" with { type: "json" };

const parser = object({
  release: argument(choice(semver.RELEASE_TYPES)),
  preId: optional(option("--preid", string())),
  dryRun: option("--dry-run"),
});
const config = run(parser, { help: "option" });

$.setPrintCommand(true);

const incremented = new semver.SemVer(manifest.version).inc(config.release, config.preId).version;

const patch = `
diff --git a/manifest.json b/manifest.json
--- a/manifest.json
+++ b/manifest.json
@@ -1 +1 @@
-  "version": "${manifest.version}",
+  "version": "${incremented}",
`;

if (config.dryRun) {
  console.log(patch);
  process.exit(0);
}

if ((await $`git diff --cached --exit-code --quiet`.code()) !== 0) {
  console.error("Error: Staged changes exist");
  process.exit(1);
}
await $`git apply --cached --unidiff-zero`.stdinText(patch);
await $`git apply --unidiff-zero`.stdinText(patch);
const message = `chore: Bump version to ${incremented}`;
await $`git commit --gpg-sign --message ${message}`;
await $`git tag --annotate ${incremented} --message ${incremented}`;
