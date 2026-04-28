import { object } from "@optique/core/constructs";
import { option } from "@optique/core/primitives";
import { run } from "@optique/run";
import $ from "dax";

const parser = object({
  reload: option("--reload"),
});
const config = run(parser, { help: "option" });

$.setPrintCommand(true);

const isRunning = await $`obsidian eval code=true`.stderr("null").timeout(1000).noThrow().text();
if (isRunning !== "=> true") {
  console.log("Obsidian is not running");
  process.exit(1);
}

const vault = await $`obsidian vault info=path`.stderr("null").text();
const configDir = await $`obsidian eval code=app.vault.configDir`
  .stderr("null")
  .text()
  .then((text) => text.replace(/^=>\s*/, ""));
const pluginDir = $.path(vault).join(configDir, "plugins", "embed-plus");
await $`cp dist/* ${pluginDir}`;

if (config.reload) {
  await $`obsidian plugin:reload id=embed-plus`.stderr("null");
}
