import { syntaxTree } from "@codemirror/language";
import { EditorState, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet, ViewPlugin } from "@codemirror/view";
import type { TreeCursor } from "@lezer/common";
import { constructWidget } from "./effect.ts";
import { lookup } from "./embed_source.ts";
import { EmbedWidget } from "./widget.ts";

type Pos = [from: number, to: number];
declare const tag: unique symbol;
/** `EncodedPos` is an unsigned 32-bit integer which represents `Pos` as follows:
 * ```ts
 * 0xffffffff
 * //^^^^^    <- "from" (20 bits)
 * //     ^^^ <- "length", which is "to - from" (12 bits)
 * ```
 */
type EncodedPos = number & { readonly [tag]: "EncodedPos" };
type WidgetRegistry = { pos: Map<EncodedPos, string>; widgets: Map<string, EmbedWidget> };

function encodePos(pos: Pos): EncodedPos {
  return (((pos[0] << 12) | (pos[1] - pos[0])) >>> 0) as EncodedPos;
}
function decodePos(encoded: EncodedPos): Pos {
  return [encoded >>> 12, (encoded >>> 12) + (encoded & 0xfff)];
}

function toDecorations(registry: WidgetRegistry): DecorationSet {
  const decorations = registry.pos
    .entries()
    .map(([encoded, url]) =>
      Decoration.widget({
        widget: registry.widgets.get(url)!,
        side: 1,
        block: true,
      }).range(decodePos(encoded)[1]),
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

function* gatherUrlPos(state: EditorState): Generator<[Pos, string]> {
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
    yield [[from, cursor.to], url];
  }
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
    for (const [pos, url] of gatherUrlPos(transaction.state)) {
      if (!lookup(url)) {
        continue;
      }
      value.pos.set(encodePos(pos), url);
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
        `.cm-editor .cm-image-reveal-tooltip:has(img[src="${url}"])`,
      );
      if (tooltip) {
        tooltip.dataset.embedPlusOverriden = "true";
      }
    }
  },
}));

export const extensions = [widgetField, overrideTooltip];
