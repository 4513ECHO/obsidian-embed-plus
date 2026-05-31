import { Plugin } from "obsidian";
import { register, handleMessage } from "./embed_source.ts";
import { extensions } from "./extension.ts";
import { createElement } from "./widget.ts";
import "./styles.css";

export default class extends Plugin {
  override onload() {
    register(Object.values(import.meta.glob("./source/*.ts", { eager: true, import: "default" })));

    this.registerMarkdownPostProcessor(async (element, _context) => {
      const embeds = element.querySelectorAll<HTMLElement>("img[src^='https://']");
      for (const embed of embeds) {
        createElement(embed.getAttribute("src")!, embed);
      }
    });

    this.registerEditorExtension(extensions);

    this.registerDomEvent(window, "message", (event) => handleMessage(event));
  }
}
