import { Plugin } from "obsidian";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, ViewPlugin } from "@codemirror/view";
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

const fulfilledEffect = StateEffect.define<{ url: string; widget: WidgetType }>();
const rejectedEffect = StateEffect.define<{ url: string; error: Error }>();

const decorationField = StateField.define<{
  pos: Map<string, number>;
  widgets: Map<string, WidgetType>;
  pending: Map<string, Promise<WidgetType>>;
}>({
  create() {
    return { pos: new Map(), widgets: new Map(), pending: new Map() };
  },
  update(oldValue, transaction) {
    const value = {
      pos: new Map(oldValue.pos),
      widgets: new Map(oldValue.widgets),
      pending: new Map(oldValue.pending),
    };
    for (const effect of transaction.effects) {
      if (effect.is(fulfilledEffect)) {
        value.widgets.set(effect.value.url, effect.value.widget);
        value.pending.delete(effect.value.url);
      } else if (effect.is(rejectedEffect)) {
        value.widgets.set(effect.value.url, new ErrorWidget(effect.value.error));
        value.pending.delete(effect.value.url);
      }
    }
    value.pos.clear();
    for (const { pos, url } of gatherUrlPos(transaction.state)) {
      value.pos.set(url, pos);
      if (value.widgets.has(url) || value.pending.has(url)) {
        continue;
      }
      const widget = BlueskyWidget.create(url);
      if (widget instanceof Promise) {
        value.pending.set(url, widget);
      } else {
        value.widgets.set(url, widget);
      }
    }
    return value;
  },
  compare(a, b) {
    return (
      compareIter(a.pos.keys(), b.pos.keys()) &&
      compareIter(a.widgets.keys(), b.widgets.keys()) &&
      compareIter(a.pending.keys(), b.pending.keys())
    );
  },
  provide(field) {
    return EditorView.decorations.from(field, (value) => {
      const decorations = value.pos
        .entries()
        .map(([url, pos]) =>
          Decoration.widget({
            widget: value.widgets.get(url) ?? new LoadingWidget(),
            side: 1,
            block: true,
          }).range(pos),
        )
        .toArray();
      return Decoration.set(decorations);
    });
  },
});

function compareIter<T>(a: IteratorObject<T>, b: IteratorObject<T>): boolean {
  const aSet = new Set(a);
  const bSet = new Set(b);
  return aSet.size === bSet.size && aSet.isSubsetOf(bSet) && bSet.isSubsetOf(aSet);
}

class LoadingWidget extends WidgetType {
  toDOM(view: EditorView): HTMLElement {
    const container = view.dom.createDiv({ cls: "loading-embed" });
    container.createDiv({ text: "Loading..." });
    return container;
  }

  eq(_other: LoadingWidget) {
    return true;
  }

  get estimatedHeight(): number {
    return 150;
  }
}
class ErrorWidget extends WidgetType {
  #error: Error;
  constructor(error: Error) {
    super();
    this.#error = error;
  }

  toDOM(view: EditorView): HTMLElement {
    const container = view.dom.createDiv({ cls: "error-embed" });
    container.createDiv({ text: this.#error.toString() });
    return container;
  }

  eq(other: ErrorWidget) {
    return this.#error.name === other.#error.name && this.#error.message === other.#error.message;
  }

  get estimatedHeight(): number {
    return 150;
  }
}

function gatherUrlPos(state: EditorState): { pos: number; url: string }[] {
  const result: { pos: number; url: string }[] = [];

  const cursor = syntaxTree(state).cursor();
  do {
    if (cursor.name !== "formatting_formatting-image_image_image-marker") {
      continue;
    }
    cursor.nextSibling(); // Move to "formatting_formatting-image_image_image-alt-text_link"
    if (state.sliceDoc(cursor.from, cursor.to) !== "[]") {
      do {
        cursor.nextSibling();
      } while (cursor.type.name !== "formatting_formatting-image_image_image-alt-text_link");
    }
    cursor.nextSibling(); // Move to "formatting_formatting-link-string_string_url"
    cursor.nextSibling(); // Move to "string_url"
    const url = state.sliceDoc(cursor.from, cursor.to);
    if (!url.startsWith("https://bsky.app/profile/")) {
      continue;
    }
    cursor.nextSibling(); // Move to "formatting_formatting-link-string_string_url"
    result.push({ pos: cursor.to, url });
  } while (cursor.next());

  return result;
}

const viewPlugin = ViewPlugin.define(() => ({
  update(update) {
    const { pending } = update.state.field(decorationField);
    for (const [url, widget] of pending) {
      widget
        .then((widget) =>
          update.view.dispatch({
            effects: [fulfilledEffect.of({ url, widget })],
          }),
        )
        .catch((error) =>
          update.view.dispatch({
            effects: [rejectedEffect.of({ url, error })],
          }),
        )
        .finally(() => update.view.requestMeasure());
    }
  },
}));
