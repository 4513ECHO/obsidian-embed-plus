import { EditorView } from "@codemirror/view";
import { loaded } from "./effect.ts";

export interface EmbedSourceMeta {
  name: string;
  logo: string;
  origin: string;
}

export interface EmbedSourceStatic {
  new (url: string): EmbedSource;
  meta: EmbedSourceMeta;
}

export abstract class EmbedSource {
  static get meta(): EmbedSourceMeta {
    throw new Error("Not implemented");
  }
  abstract render(src: string): HTMLElement;
  abstract resolveSrc(): string | Promise<string>;
  get height(): number | undefined {
    return undefined;
  }
  onMessage(event: MessageEvent): boolean {
    void event;
    return false;
  }
}

export class EmbedSourceRegistry {
  static #sources: Set<EmbedSourceStatic> = new Set();
  static #instances: Map<string, EmbedSource> = new Map();

  static register(sources: readonly EmbedSourceStatic[]): void {
    for (const source of sources) {
      this.#sources.add(source);
    }
  }

  static lookup(url: string): EmbedSource | null {
    const instance = this.#instances.get(url);
    if (instance) {
      return instance;
    }
    const origin = new URL(url).origin;
    for (const source of this.#sources) {
      if (source.meta.origin === origin) {
        const instance = new source(url);
        this.#instances.set(url, instance);
        return instance;
      }
    }
    return null;
  }

  static handleMessage(event: MessageEvent): void {
    for (const [url, instance] of this.#instances) {
      if (instance.onMessage(event)) {
        for (const view of retriveViews(url)) {
          loaded(view, url);
        }
        break;
      }
    }
  }
}

function retriveViews(url: string): EditorView[] {
  const views: EditorView[] = [];
  for (const viewDom of document.querySelectorAll<HTMLElement>(
    `.cm-editor:has(.embed-plus-container[data-url="${url}"])`,
  )) {
    const view = EditorView.findFromDOM(viewDom);
    if (view) {
      views.push(view);
    }
  }
  return views;
}
