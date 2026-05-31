import { syntaxTree } from "@codemirror/language";
import { EditorState, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { constructWidget } from "./effect.ts";
import { lookup } from "./embed_source.ts";
import { EmbedWidget } from "./widget.ts";

type WidgetRegistry = { pos: Map<string, number>; widgets: Map<string, EmbedWidget> };

function toDecorations(registry: WidgetRegistry): DecorationSet {
  const decorations = registry.pos
    .entries()
    .map(([url, pos]) =>
      Decoration.widget({
        widget: registry.widgets.get(url)!,
        side: 1,
        block: true,
      }).range(pos),
    )
    .toArray();
  return Decoration.set(decorations);
}

function compareIter<T>(a: IteratorObject<T>, b: IteratorObject<T>): boolean {
  const aSet = new Set(a);
  const bSet = new Set(b);
  return aSet.size === bSet.size && aSet.isSubsetOf(bSet) && bSet.isSubsetOf(aSet);
}

function compare(a: WidgetRegistry, b: WidgetRegistry): boolean {
  return (
    compareIter(a.pos.keys(), b.pos.keys()) &&
    compareIter(a.widgets.keys(), b.widgets.keys()) &&
    a.widgets.entries().every(([url, widget]) => b.widgets.get(url)?.eq(widget))
  );
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
    if (!url.startsWith("https://")) {
      continue;
    }
    cursor.nextSibling(); // Move to "formatting_formatting-link-string_string_url"
    result.push({ pos: cursor.to, url });
  } while (cursor.next());

  return result;
}

const widgetField = StateField.define<WidgetRegistry>({
  create() {
    return { pos: new Map(), widgets: new Map() };
  },
  update(oldValue, transaction) {
    const value = {
      pos: new Map(oldValue.pos),
      widgets: new Map(oldValue.widgets),
    };
    for (const [url, widget] of constructWidget(transaction.effects, EmbedWidget)) {
      value.widgets.set(url, widget);
    }
    value.pos.clear();
    for (const { pos, url } of gatherUrlPos(transaction.state)) {
      if (!lookup(url)) {
        continue;
      }
      value.pos.set(url, pos);
      if (!value.widgets.has(url)) {
        const widget = new EmbedWidget({ state: "resolving", url });
        value.widgets.set(url, widget);
      }
    }
    return value;
  },
  compare(a, b) {
    return compare(a, b);
  },
  provide(field) {
    return EditorView.decorations.from(field, (value) => toDecorations(value));
  },
});

export const extensions = [widgetField];
