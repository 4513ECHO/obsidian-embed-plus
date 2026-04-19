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

async function resolveEmbedSrc(url: string): Promise<string> {
  const matched = urlPattern.exec(url);
  if (!matched) {
    throw new Error("Invalid Bluesky URL");
  }
  const { handle, post } = matched.pathname.groups;
  if (!handle || !post) {
    throw new Error("Invalid Bluesky URL");
  }
  if (handle.startsWith("did:")) {
    return handle;
  }
  const did = await resolveHandle(handle);
  return `${EMBED_URL}/embed/${did}/app.bsky.feed.post/${post}`;
}

// TODO: use "loading" state
export async function createElement(url: string, dom: HTMLElement): Promise<void> {
  const view = { dom } as EditorView;
  try {
    const src = await resolveEmbedSrc(url);
    const widget = new BlueskyWidget({ state: "loaded", url, src });
    dom.replaceWith(widget.toDOM(view));
  } catch (error) {
    const widget = new BlueskyWidget({ state: "error", url, error: error as Error });
    dom.replaceWith(widget.toDOM(view));
  }
}

type WidgetInit =
  | { state: "loading"; url: string }
  | { state: "loaded"; url: string; src: string }
  | { state: "error"; url: string; error: Error };

export class BlueskyWidget extends WidgetType {
  static #heightCache: Map<string, number> = new Map();
  #url: string;
  #state: "loading" | "error" | "loaded";
  #error?: Error;
  #src?: string;

  static {
    window.addEventListener("message", (event) => {
      if (event.origin !== EMBED_URL) {
        return;
      }
      const { id, height } = event.data;
      const containers = document.querySelectorAll(
        `.embed-plus-container:has([data-bluesky-id="${id}"])`,
      );
      for (const container of containers) {
        const url = container.getAttribute("data-url")!;
        this.#heightCache.set(url, height);
        container.querySelector("iframe")?.setAttribute("style", `height: ${height}px`);
        container.querySelector(".loading-embed")?.remove();
      }
    });
  }

  constructor(init: WidgetInit) {
    super();
    this.#url = init.url;
    this.#state = init.state;
    switch (init.state) {
      case "loading":
        break;
      case "error":
        this.#error = init.error;
        break;
      case "loaded":
        this.#src = init.src;
        break;
      default:
        throw new Error(`Invalid widget init: ${(init as { type: "invalid" }).type}`);
    }
  }

  toDOM(view: EditorView): HTMLElement {
    const container = view.dom.createDiv({
      cls: "embed-plus-container",
      attr: { "data-url": this.#url, "data-state": this.#state },
    });
    switch (this.#state) {
      case "loading":
        this.#renderLoading(container);
        break;
      case "error":
        this.#renderError(container);
        break;
      case "loaded":
        this.#renderLoading(container);
        this.#renderLoaded(container);
        break;
    }
    return container;
  }

  eq(other: BlueskyWidget) {
    return this.#url === other.#url && this.#state === other.#state;
  }

  get estimatedHeight(): number {
    return BlueskyWidget.#heightCache.get(this.#url) ?? -1;
  }

  updateDOM(dom: HTMLElement): boolean {
    const targetUrl = dom.getAttribute("data-url");
    if (!targetUrl || this.#url !== targetUrl) {
      return true;
    }
    switch (this.#state) {
      case "loading":
        return true;
      case "error": {
        this.#renderError(dom);
        return false;
      }
      case "loaded": {
        this.#renderLoading(dom);
        this.#renderLoaded(dom);
        return false;
      }
    }
  }

  #renderLoading(dom: HTMLElement): void {
    const loading = dom.createDiv({ cls: ["loading-embed"] });
    const height = BlueskyWidget.#heightCache.get(this.#url);
    if (height) {
      loading.setAttribute("style", `height: ${height} px`);
    }
    loading.createDiv({ text: "Loading..." });
  }

  #renderError(dom: HTMLElement): void {
    if (!this.#error) {
      return;
    }
    const error = dom.createDiv({ cls: "error-embed" });
    error.createDiv({ text: this.#error.toString() });
  }

  #renderLoaded(dom: HTMLElement): void {
    if (!this.#src) {
      return;
    }
    const id = Date.now().toString();
    const searchParams = new URLSearchParams({
      id,
      colorMode: document.body.classList.contains("theme-dark") ? "dark" : "light",
    });
    const iframe = dom.createEl("iframe", {
      cls: ["external-embed", "node-insert-event"],
      attr: {
        src: this.#src + "?" + searchParams.toString(),
        loading: "lazy",
        "data-bluesky-id": id,
      },
    });
    const height = BlueskyWidget.#heightCache.get(this.#url);
    if (height) {
      iframe.setAttribute("style", `height: ${height} px`);
    }
  }

  async resolveEmbedSrc(): Promise<string> {
    return await resolveEmbedSrc(this.#url);
  }
}
