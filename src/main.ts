import { Plugin } from "obsidian";
import { type Range, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { BlueskyWidget, createElement } from "./bluesky.ts";

export default class extends Plugin {
  override onload() {
    console.log("loading Embed Plus");
    this.registerMarkdownPostProcessor(async (element, _context) => {
      const embeds = element.findAll("img[src^='https://bsky.app/profile/']");
      for (const embed of embeds) {
        embed.replaceWith(await createElement(embed.getAttr("src")!, element));
      }
    });
    this.registerEditorExtension([viewPlugin, decorationField]);
  }
}

const stateEffect = StateEffect.define<{ decorations: DecorationSet }>({});
const decorationField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(stateEffect)) {
        return effect.value.decorations;
      }
    }
    return value;
  },
  provide(field) {
    return EditorView.decorations.from(field);
  },
});

type MaybePromise<T> = T | Promise<T>;

function buildDecorations(view: EditorView): MaybePromise<Range<Decoration>>[] {
  const urls: { from: number; to: number; url: string }[] = [];

  const cursor = syntaxTree(view.state).cursor();
  do {
    if (cursor.name !== "formatting_formatting-image_image_image-marker") {
      continue;
    }
    const { from } = cursor;
    cursor.nextSibling(); // Move to "formatting_formatting-image_image_image-alt-text_link"
    if (view.state.sliceDoc(cursor.from, cursor.to) !== "[]") {
      do {
        cursor.nextSibling();
      } while (cursor.type.name !== "formatting_formatting-image_image_image-alt-text_link");
    }
    cursor.nextSibling(); // Move to "formatting_formatting-link-string_string_url"
    cursor.nextSibling(); // Move to "string_url"
    const url = view.state.sliceDoc(cursor.from, cursor.to);
    if (!url.startsWith("https://bsky.app/profile/")) {
      continue;
    }
    cursor.nextSibling(); // Move to "formatting_formatting-link-string_string_url"
    urls.push({ from, to: cursor.to, url });
  } while (cursor.next());

  const widgets: MaybePromise<Range<Decoration>>[] = [];
  for (const { to, url } of urls) {
    widgets.push(
      BlueskyWidget.create(url).then((widget) =>
        Decoration.widget({
          widget,
          side: 1,
          block: true,
        }).range(to),
      ),
    );
  }

  return widgets;
}

const viewPlugin = ViewPlugin.define(() => ({
  update(update) {
    if (!update.docChanged && !update.viewportChanged) {
      return;
    }
    // TODO: use "async sometimes" pattern
    for (const deco of buildDecorations(update.view)) {
      if (deco instanceof Promise) {
        void deco.then((decoration) =>
          update.view.dispatch({
            effects: stateEffect.of({
              decorations: Decoration.set([decoration]),
            }),
          }),
        );
      } else {
        update.view.dispatch({
          effects: stateEffect.of({
            decorations: Decoration.set([deco]),
          }),
        });
      }
    }
  },
}));
