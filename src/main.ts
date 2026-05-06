import { Plugin } from "obsidian";
import { Bluesky } from "./bluesky.ts";
import { EmbedSourceRegistry } from "./embed_source.ts";
import { extensions } from "./extension.ts";
import { createElement } from "./widget.ts";

export default class extends Plugin {
  override onload() {
    console.log("loading Embed Plus");

    EmbedSourceRegistry.register([Bluesky]);

    this.registerMarkdownPostProcessor(async (element, _context) => {
      const embeds = element.querySelectorAll<HTMLElement>("img[src^='https://bsky.app/profile/']");
      await Promise.allSettled(
        embeds.values().map((embed) => createElement(embed.getAttribute("src")!, embed)),
      );
    });

    this.registerEditorExtension(extensions);

    this.registerDomEvent(window, "message", (event) => {
      EmbedSourceRegistry.handleMessage(event);
    });
  }
}
