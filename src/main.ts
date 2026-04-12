import { Plugin } from "obsidian";
import { createElement } from "./bluesky.ts";
import { extensions } from "./extension.ts";

export default class extends Plugin {
  override onload() {
    console.log("loading Embed Plus");
    this.registerMarkdownPostProcessor(async (element, _context) => {
      const embeds = element.findAll("img[src^='https://bsky.app/profile/']");
      for (const embed of embeds) {
        embed.replaceWith(await createElement(embed.getAttr("src")!, element));
      }
    });
    this.registerEditorExtension(extensions);
  }
}
