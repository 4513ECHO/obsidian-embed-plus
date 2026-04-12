import { EditorState, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  ViewPlugin,
  type DecorationSet,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { BlueskyWidget } from "./bluesky.ts";

const fulfilledEffect = StateEffect.define<{ url: string; widget: WidgetType }>();
const rejectedEffect = StateEffect.define<{ url: string; error: Error }>();

class WidgetRegistry {
  #pos: Map<string, number> = new Map();
  #widgets: Map<string, WidgetType> = new Map();
  #pending: Map<string, Promise<WidgetType>> = new Map();

  static compare(a: WidgetRegistry, b: WidgetRegistry): boolean {
    return (
      compareIter(a.#pos.keys(), b.#pos.keys()) &&
      compareIter(a.#widgets.keys(), b.#widgets.keys()) &&
      compareIter(a.#pending.keys(), b.#pending.keys())
    );
  }

  cloned(): WidgetRegistry {
    const cloned = new WidgetRegistry();
    cloned.#pos = new Map(this.#pos);
    cloned.#widgets = new Map(this.#widgets);
    cloned.#pending = new Map(this.#pending);
    return cloned;
  }

  gather(state: EditorState): void {
    this.#pos.clear();
    for (const { pos, url } of gatherUrlPos(state)) {
      this.#pos.set(url, pos);
      if (this.#widgets.has(url) || this.#pending.has(url)) {
        continue;
      }
      const widget = BlueskyWidget.create(url);
      if (widget instanceof Promise) {
        this.#pending.set(url, widget);
      } else {
        this.#widgets.set(url, widget);
      }
    }
  }

  handleEffect(effects: readonly StateEffect<unknown>[]): void {
    for (const effect of effects) {
      if (effect.is(fulfilledEffect)) {
        this.#widgets.set(effect.value.url, effect.value.widget);
        this.#pending.delete(effect.value.url);
      } else if (effect.is(rejectedEffect)) {
        this.#widgets.set(effect.value.url, new ErrorWidget(effect.value.error));
        this.#pending.delete(effect.value.url);
      }
    }
  }

  toDecorations(): DecorationSet {
    const decorations = this.#pos
      .entries()
      .map(([url, pos]) =>
        Decoration.widget({
          widget: this.#widgets.get(url) ?? new LoadingWidget(),
          side: 1,
          block: true,
        }).range(pos),
      )
      .toArray();
    return Decoration.set(decorations);
  }

  startResolve(view: EditorView): void {
    for (const [url, widget] of this.#pending) {
      widget
        .then((widget) =>
          view.dispatch({
            effects: [fulfilledEffect.of({ url, widget })],
          }),
        )
        .catch((error) =>
          view.dispatch({
            effects: [rejectedEffect.of({ url, error })],
          }),
        )
        .finally(() => view.requestMeasure());
    }
  }
}

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

const widgetField = StateField.define<WidgetRegistry>({
  create() {
    return new WidgetRegistry();
  },
  update(oldValue, transaction) {
    const value = oldValue.cloned();
    value.handleEffect(transaction.effects);
    value.gather(transaction.state);
    return value;
  },
  compare(a, b) {
    return WidgetRegistry.compare(a, b);
  },
  provide(field) {
    return EditorView.decorations.from(field, (value) => value.toDecorations());
  },
});

const viewPlugin = ViewPlugin.define(() => ({
  update(update) {
    update.state.field(widgetField).startResolve(update.view);
  },
}));

export const extensions = [widgetField, viewPlugin];
