import { requestUrl } from "obsidian";
import { EmbedSource } from "./embed_source.ts";

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

export class Bluesky extends EmbedSource {
  static #heightCache: Map<string, number> = new Map();
  static id = 0;
  #url: string;
  #id = (Bluesky.id++).toString();
  constructor(url: string) {
    super();
    this.#url = url;
  }

  static override get meta() {
    return {
      name: "Bluesky",
      logo: "https://bsky.app/favicon.ico",
      origin: "https://bsky.app",
    };
  }

  render(src: string): HTMLElement {
    const searchParams = new URLSearchParams({
      id: this.#id,
      colorMode: document.body.classList.contains("theme-dark") ? "dark" : "light",
    });
    const iframe = createEl("iframe", {
      cls: ["external-embed", "node-insert-event"],
      attr: {
        src: src + "?" + searchParams.toString(),
        loading: "lazy",
        "data-bluesky-id": this.#id,
      },
    });
    if (this.height) {
      iframe.style.height = `${this.height}px`;
    }
    return iframe;
  }

  override resolveSrc(): string | Promise<string> {
    return resolveEmbedSrc(this.#url);
  }

  override get height(): number | undefined {
    return Bluesky.#heightCache.get(this.#url);
  }

  override onMessage(event: MessageEvent<{ id: string; height: number }>): boolean {
    if (event.origin !== EMBED_URL) {
      return false;
    }
    const { id, height } = event.data;
    if (id !== this.#id) {
      return false;
    }
    Bluesky.#heightCache.set(this.#url, height);
    return true;
  }
}
