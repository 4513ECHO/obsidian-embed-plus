import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { constructWidget } from "./effect.ts";
import { BlueskyWidget } from "./bluesky.ts";

class WidgetRegistry {
  #pos: Map<string, number> = new Map();
  // TODO: Use polymorphism type definition
  #widgets: Map<string, BlueskyWidget> = new Map();

  static compare(a: WidgetRegistry, b: WidgetRegistry): boolean {
    return (
      compareIter(a.#pos.keys(), b.#pos.keys()) &&
      compareIter(a.#widgets.keys(), b.#widgets.keys()) &&
      a.#widgets.entries().every(([url, widget]) => {
        const other = b.#widgets.get(url);
        return other && widget.eq(other);
      })
    );
  }

  cloned(): WidgetRegistry {
    const cloned = new WidgetRegistry();
    cloned.#pos = new Map(this.#pos);
    cloned.#widgets = new Map(this.#widgets);
    return cloned;
  }

  gather(state: EditorState): void {
    this.#pos.clear();
    for (const { pos, url } of gatherUrlPos(state)) {
      this.#pos.set(url, pos);
      if (this.#widgets.has(url)) {
        continue;
      }
      const widget = new BlueskyWidget({ state: "resolving", url });
      this.#widgets.set(url, widget);
    }
  }

  handleEffect(effects: readonly StateEffect<unknown>[]): void {
    for (const [url, widget] of constructWidget(effects, BlueskyWidget)) {
      this.#widgets.set(url, widget);
    }
  }

  toDecorations(): DecorationSet {
    const decorations = this.#pos
      .entries()
      .map(([url, pos]) =>
        Decoration.widget({
          widget: this.#widgets.get(url)!,
          side: 1,
          block: true,
        }).range(pos),
      )
      .toArray();
    return Decoration.set(decorations);
  }
}

function compareIter<T>(a: IteratorObject<T>, b: IteratorObject<T>): boolean {
  const aSet = new Set(a);
  const bSet = new Set(b);
  return aSet.size === bSet.size && aSet.isSubsetOf(bSet) && bSet.isSubsetOf(aSet);
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

export const extensions = [widgetField];
