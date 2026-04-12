import { EditorView, WidgetType } from "@codemirror/view";
import { requestUrl } from "obsidian";

const EMBED_URL = "https://embed.bsky.app";

const urlPattern = new URLPattern({
  pathname: "/profile/:handle/post/:post",
  baseURL: "https://bsky.app",
});

const didCache = new Map<string, string>();
async function resolveHandle(handle: string): Promise<string> {
  if (didCache.has(handle)) {
    return didCache.get(handle)!;
  }
  const url = new URL("/xrpc/com.atproto.identity.resolveHandle", "https://api.bsky.app");
  url.searchParams.set("handle", handle);
  const payload: unknown = await requestUrl({ url: url.toString(), throw: false }).json;
  if (
    typeof payload === "object" &&
    payload &&
    "did" in payload &&
    typeof payload.did === "string"
  ) {
    didCache.set(handle, payload.did);
    return payload.did;
  }
  // TODO: handle 400
  throw new Error(`Failed to resolve bluesky handle: ${handle}`);
}

async function resolveSrc(url: string): Promise<string> {
  const matched = urlPattern.exec(url);
  if (!matched) {
    throw new Error("Invalid Bluesky URL");
  }
  const { handle, post } = matched.pathname.groups;
  if (!handle || !post) {
    throw new Error("Invalid Bluesky URL");
  }
  const did = await resolveHandle(handle);
  return `${EMBED_URL}/embed/${did}/app.bsky.feed.post/${post}`;
}

function createWidget(src: string, dom: HTMLElement): HTMLElement {
  const id = Date.now().toString();
  const searchParams = new URLSearchParams({
    id,
    colorMode: document.body.classList.contains("theme-dark") ? "dark" : "light",
  });
  const iframe = dom.createEl("iframe", {
    cls: "external-embed",
    attr: {
      src: src + "?" + searchParams.toString(),
      "data-bluesky-id": id,
    },
  });
  iframe.setAttribute("style", `height: ${BlueskyWidget.getHeight(src)}px;`);
  return iframe;
}

export async function createElement(url: string, dom: HTMLElement): Promise<HTMLElement> {
  const src = await resolveSrc(url);
  return createWidget(src, dom);
}

export class BlueskyWidget extends WidgetType {
  static #widgetCache = new Map<string, BlueskyWidget>();
  static #heightCache = new Map<string, number>();
  static #id = 0;
  #src: string;

  static {
    addEventListener("message", (event) => {
      if (event.origin !== EMBED_URL) {
        return;
      }
      const { id, height } = event.data;
      if (!id || !height) {
        return;
      }
      const embed = document.querySelector(`[data-bluesky-id="${id}"]`);
      if (embed) {
        this.setHeight(id, height);
        embed.setAttribute("style", `height: ${height}px;`);
      }
    });
  }

  static async create(url: string): Promise<BlueskyWidget> {
    const cacheHit = this.#widgetCache.get(url);
    if (cacheHit) {
      return cacheHit;
    }
    const src = await resolveSrc(url);
    const widget = new this(src);
    this.#widgetCache.set(url, widget);
    return widget;
  }

  static setHeight(id: string, height: number): void {
    this.#heightCache.set(id, height);
  }

  static getHeight(id: string): number {
    // TODO: Cache height received from iframe and return it
    return this.#heightCache.get(id) ?? 350;
  }

  static prepareId(): number {
    this.#id++;
    return this.#id;
  }

  constructor(src: string) {
    super();
    this.#src = src;
  }

  toDOM(view: EditorView): HTMLElement {
    return createWidget(this.#src, view.dom);
  }

  eq(other: BlueskyWidget) {
    return this.#src === other.#src;
  }
}
