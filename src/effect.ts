import { StateEffect } from "@codemirror/state";
import type { EditorView, WidgetType } from "@codemirror/view";

export type WidgetInit =
  | { state: "loading"; url: string }
  | { state: "loaded"; url: string; src: string }
  | { state: "error"; url: string; error: Error };

const fulfilledEffect = StateEffect.define<{ url: string; src: string }>();
const rejectedEffect = StateEffect.define<{ url: string; error: Error }>();

export function fullfill(view: EditorView, url: string, src: string): void {
  view.dispatch({ effects: fulfilledEffect.of({ url, src }) });
}

export function reject(view: EditorView, url: string, error: Error): void {
  view.dispatch({ effects: rejectedEffect.of({ url, error }) });
}

export function* constructWidget<T extends WidgetType>(
  effects: readonly StateEffect<unknown>[],
  widget: new (init: WidgetInit) => T,
): Generator<[string, T]> {
  for (const effect of effects) {
    if (effect.is(fulfilledEffect)) {
      yield [
        effect.value.url,
        new widget({ state: "loaded", url: effect.value.url, src: effect.value.src }),
      ];
    } else if (effect.is(rejectedEffect)) {
      yield [
        effect.value.url,
        new widget({ state: "error", url: effect.value.url, error: effect.value.error }),
      ];
    }
  }
}
