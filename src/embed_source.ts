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
  abstract render(): HTMLElement;
  resolveSrc(): void | Promise<void> {}
  get height(): number | undefined {
    return undefined;
  }
  onMessage(event: MessageEvent): boolean {
    void event;
    return false;
  }
  loaded(): void {
    eventTarget.dispatchEvent(new CustomEvent("loaded", { detail: { url: this.url } }));
  }
}

const sources: Set<EmbedSourceStatic> = new Set();
const instances: Map<string, EmbedSource> = new Map();
const eventTarget = new EventTarget();
eventTarget.addEventListener("loaded", (event) => {
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

export function register(newSources: readonly EmbedSourceStatic[]): void {
  for (const source of newSources) {
    sources.add(source);
  }
}

export function lookup(url: string): EmbedSource | null {
  const instance = instances.get(url);
  if (instance) {
    return instance;
  }
  const origin = new URL(url).origin;
  for (const source of sources) {
    if (source.meta.origin === origin) {
      // TODO: proper src check
      const instance = new source(url);
      instances.set(url, instance);
      return instance;
    }
  }
  return null;
}

export function handleMessage(event: MessageEvent): void {
  for (const instance of instances.values()) {
    if (instance.onMessage(event)) {
      break;
    }
  }
}

const isDetail = (detail: unknown): detail is { url: string } =>
  typeof detail === "object" &&
  detail !== null &&
  "url" in detail &&
  typeof detail.url === "string";
function isLoadedEvent(event: Event): event is CustomEvent<{ url: string }> {
  return event instanceof CustomEvent && isDetail(event.detail);
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
