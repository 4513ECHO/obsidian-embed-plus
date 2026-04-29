import { EditorView, WidgetType } from "@codemirror/view";
import { requestUrl, setIcon } from "obsidian";
import { resolved, failed, loaded, type WidgetInit } from "./effect.ts";

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

function unreachable(value: never): never {
  throw new Error("Unexpected value: " + value);
}

// TODO: use "loading" state
export async function createElement(url: string, dom: HTMLElement): Promise<void> {
  const view = { dom } as EditorView;
  try {
    const src = await resolveEmbedSrc(url);
    const widget = new BlueskyWidget({ state: "resolved", url, src });
    dom.replaceWith(widget.toDOM(view));
  } catch (error) {
    const widget = new BlueskyWidget({ state: "failed", url, error: error as Error });
    dom.replaceWith(widget.toDOM(view));
  }
}

export class BlueskyWidget extends WidgetType {
  static #heightCache: Map<string, number> = new Map();
  static #loadedDispatchers: Map<string, () => void> = new Map();
  #url: string;
  #state: WidgetInit["state"];
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
        this.#loadedDispatchers.get(url)?.();
      }
    });
  }

  constructor(init: WidgetInit) {
    super();
    this.#url = init.url;
    this.#state = init.state;
    switch (init.state) {
      case "resolving":
      case "loaded":
        break;
      case "failed":
        this.#error = init.error;
        break;
      case "resolved":
        this.#src = init.src;
        break;
      default:
        unreachable(init);
    }
  }

  toDOM(view: EditorView): HTMLElement {
    const container = view.dom.createDiv({
      cls: "embed-plus-container",
      attr: { "data-url": this.#url, "data-state": this.#state },
    });
    switch (this.#state) {
      case "resolving":
        this.#renderLoading(container);
        resolveEmbedSrc(this.#url)
          .then((src) => resolved(view, this.#url, src))
          .catch((error) => failed(view, this.#url, error));
        break;
      case "resolved":
        this.#renderLoading(container);
        this.#renderIframe(container, view);
        break;
      case "loaded":
        this.#renderIframe(container, view);
        break;
      case "failed":
        this.#renderError(container);
        break;
      default:
        unreachable(this.#state);
    }
    return container;
  }

  eq(other: BlueskyWidget) {
    return this.#url === other.#url && this.#state === other.#state;
  }

  get estimatedHeight(): number {
    return BlueskyWidget.#heightCache.get(this.#url) ?? 150;
  }

  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const prevUrl = dom.getAttribute("data-url");
    if (!prevUrl || this.#url !== prevUrl) {
      return false;
    }
    dom.setAttribute("data-state", this.#state);
    switch (this.#state) {
      case "resolving":
        return false;
      case "resolved":
        this.#renderIframe(dom, view);
        return true;
      case "loaded":
        const iframe = dom.querySelector("iframe");
        if (iframe) {
          iframe.style.height = `${BlueskyWidget.#heightCache.get(this.#url)}px`;
        }
        dom.querySelector(".loading-embed")?.remove();
        return true;
      case "failed":
        dom.querySelector(".loading-embed")?.remove();
        this.#renderError(dom);
        return true;
      default:
        unreachable(this.#state);
    }
  }

  #renderLoading(dom: HTMLElement): void {
    const loading = dom.createDiv({ cls: ["loading-embed"] });
    const height = BlueskyWidget.#heightCache.get(this.#url);
    if (height) {
      loading.style.height = `${height}px`;
    }
    setIcon(loading.createDiv({ cls: "icon-wrapper" }), "loader-circle");
    loading.createEl("p", { text: "Loading..." });
  }

  #renderError(dom: HTMLElement): void {
    if (!this.#error) {
      return;
    }
    const error = dom.createDiv({ cls: "error-embed" });
    setIcon(error.createDiv({ cls: "icon-wrapper" }), "circle-x");
    error.createEl("p", { text: this.#error.toString() });
  }

  #renderIframe(dom: HTMLElement, view: EditorView): void {
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
      iframe.style.height = `${height}px`;
    } else {
      BlueskyWidget.#loadedDispatchers.set(this.#url, () => loaded(view, this.#url));
    }
  }
}
