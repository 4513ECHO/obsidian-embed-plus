import { Plugin } from "obsidian";
import { createElement } from "./bluesky.ts";
import { extensions } from "./extension.ts";

export default class extends Plugin {
  override onload() {
    console.log("loading Embed Plus");
    this.registerMarkdownPostProcessor(async (element, _context) => {
      const embeds = element.querySelectorAll<HTMLElement>("img[src^='https://bsky.app/profile/']");
      await Promise.allSettled(
        embeds.values().map((embed) => createElement(embed.getAttribute("src")!, embed)),
      );
    });
    this.registerEditorExtension(extensions);
  }
}
