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
  readonly url: string;
  static get meta(): EmbedSourceMeta {
    throw new Error("Not implemented");
  }
  constructor(url: string) {
    this.url = url;
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
  loaded(): void {
    EmbedSourceRegistry.dispatchLoaded(this.url);
  }
}

export class EmbedSourceRegistry {
  static #sources: Set<EmbedSourceStatic> = new Set();
  static #instances: Map<string, EmbedSource> = new Map();
  static #eventTarget = new EventTarget();
  static {
    this.#eventTarget.addEventListener("loaded", (event) => {
      if (!isLoadedEvent(event)) {
        return;
      }
      const { url } = event.detail;
      for (const view of retriveViews(url)) {
        loaded(view, url);
      }
      for (const dom of retriveReadingViewDoms(url)) {
        dom.dispatchEvent(new Event("embed-plus:loaded"));
      }
    });
  }

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
        // TODO: proper src check
        const instance = new source(url);
        this.#instances.set(url, instance);
        return instance;
      }
    }
    return null;
  }

  static handleMessage(event: MessageEvent): void {
    for (const instance of this.#instances.values()) {
      if (instance.onMessage(event)) {
        break;
      }
    }
  }

  static dispatchLoaded(url: string): void {
    this.#eventTarget.dispatchEvent(new CustomEvent("loaded", { detail: { url } }));
  }
}

function isLoadedEvent(event: Event): event is CustomEvent<{ url: string }> {
  return event instanceof CustomEvent && typeof event.detail.url === "string";
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

function retriveReadingViewDoms(url: string): HTMLElement[] {
  return document
    .querySelectorAll<HTMLElement>(
      `.markdown-reading-view .embed-plus-container[data-url="${url}"]`,
    )
    .values()
    .toArray();
}
