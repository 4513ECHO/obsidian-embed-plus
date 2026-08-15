import { syntaxTree } from "@codemirror/language";
import { EditorState, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet, ViewPlugin } from "@codemirror/view";
import type { TreeCursor } from "@lezer/common";
import { constructWidget } from "./effect.ts";
import { lookup } from "./embed_source.ts";
import { EmbedWidget } from "./widget.ts";

type Pos = [from: number, to: number];
type WidgetRegistry = { pos: Map<string, Pos>; widgets: Map<string, EmbedWidget> };

function toDecorations(registry: WidgetRegistry): DecorationSet {
  const decorations = registry.pos
    .entries()
    .map(([url, [_from, to]]) =>
      Decoration.widget({
        widget: registry.widgets.get(url)!,
        side: 1,
        block: true,
      }).range(to),
    )
    .toArray();
  return Decoration.set(decorations);
}

function compareIter<T>(a: Iterable<T>, b: Iterable<T>): boolean {
  const aSet = new Set(a);
  const bSet = new Set(b);
  return aSet.size === bSet.size && aSet.isSubsetOf(bSet) && bSet.isSubsetOf(aSet);
}

function compare(a: WidgetRegistry, b: WidgetRegistry): boolean {
  return (
    compareIter(a.pos.keys(), b.pos.keys()) &&
    compareIter(a.widgets.keys(), b.widgets.keys()) &&
    a.pos.entries().every(([url, pos]) => {
      const bPos = b.pos.get(url);
      return bPos && bPos[0] === pos[0] && bPos[1] === pos[1];
    }) &&
    a.widgets.entries().every(([url, widget]) => b.widgets.get(url)?.eq(widget))
  );
}

function advance(cursor: TreeCursor, name: string): boolean {
  return cursor.nextSibling() && cursor.name === name;
}
function skip(cursor: TreeCursor, name: string): boolean {
  if (cursor.name === name) return true;
  while (cursor.nextSibling()) {
    if (cursor.name === name) return true;
  }
  return false;
}

function gatherUrlPos(state: EditorState): Map<string, Pos> {
  const result: Map<string, Pos> = new Map();

  const cursor = syntaxTree(state).cursor();
  cursor.enter(0, 1);
  while (true) {
    if (!skip(cursor, "formatting_formatting-image_image_image-marker")) {
      break;
    }
    const { from } = cursor;
    if (!advance(cursor, "formatting_formatting-image_image_image-alt-text_link")) continue;
    if (!skip(cursor, "formatting_formatting-link-string_string_url")) continue;
    if (!advance(cursor, "string_url")) continue;

    const url = state.sliceDoc(cursor.from, cursor.to);
    if (!url.startsWith("https://")) {
      continue;
    }

    if (!advance(cursor, "formatting_formatting-link-string_string_url")) continue;
    result.set(url, [from, cursor.to]);
  }

  return result;
}

const widgetField = StateField.define<WidgetRegistry>({
  create() {
    return { pos: new Map(), widgets: new Map() };
  },
  update(oldValue, transaction) {
    const value: WidgetRegistry = {
      pos: new Map(oldValue.pos),
      widgets: new Map(oldValue.widgets),
    };
    for (const [url, widget] of constructWidget(transaction.effects, EmbedWidget)) {
      value.widgets.set(url, widget);
    }
    value.pos.clear();
    for (const [url, pos] of gatherUrlPos(transaction.state).entries()) {
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

const overrideTooltip = ViewPlugin.define(() => ({
  update(update) {
    for (const url of update.state.field(widgetField).widgets.keys()) {
      const tooltip = document.querySelector<HTMLDivElement>(
        `.cm-image-reveal-tooltip:has(img[src="${url}"])`,
      );
      if (tooltip) {
        tooltip.dataset.embedPlusOverriden = "true";
      }
    }
  },
}));

export const extensions = [widgetField, overrideTooltip];
