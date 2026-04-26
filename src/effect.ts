import { StateEffect } from "@codemirror/state";
import type { EditorView, WidgetType } from "@codemirror/view";

export type WidgetInit =
  | { state: "resolving"; url: string }
  | { state: "resolved"; url: string; src: string }
  | { state: "loaded"; url: string }
  | { state: "failed"; url: string; error: Error };

const resolvedEffect = StateEffect.define<{ url: string; src: string }>();
const failedEffect = StateEffect.define<{ url: string; error: Error }>();
const loadedEffect = StateEffect.define<{ url: string }>();

export function resolved(view: EditorView, url: string, src: string): void {
  view.dispatch({ effects: resolvedEffect.of({ url, src }) });
}

export function failed(view: EditorView, url: string, error: Error): void {
  view.dispatch({ effects: failedEffect.of({ url, error }) });
}

export function loaded(view: EditorView, url: string): void {
  view.dispatch({ effects: loadedEffect.of({ url }) });
}

export function* constructWidget<T extends WidgetType>(
  effects: readonly StateEffect<unknown>[],
  widget: new (init: WidgetInit) => T,
): Generator<[string, T]> {
  for (const effect of effects) {
    if (effect.is(resolvedEffect)) {
      yield [
        effect.value.url,
        new widget({ state: "resolved", url: effect.value.url, src: effect.value.src }),
      ];
    } else if (effect.is(failedEffect)) {
      yield [
        effect.value.url,
        new widget({ state: "failed", url: effect.value.url, error: effect.value.error }),
      ];
    } else if (effect.is(loadedEffect)) {
      yield [effect.value.url, new widget({ state: "loaded", url: effect.value.url })];
    }
  }
}
