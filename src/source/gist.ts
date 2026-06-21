import { requestUrl } from "obsidian";
import { EmbedSource } from "../embed_source.ts";

const EMBED_URL = "https://gist.github.com";
const urlPattern = new URLPattern({
  pathname: "/:username?/:gistId",
  baseURL: EMBED_URL,
});

export default class Gist extends EmbedSource {
  static #heightCache: Map<number, number> = new Map();
  static id = 0;
  #id = Gist.id++;
  #srcdoc?: string;
  constructor(url: string) {
    super(url);
  }

  static override get meta() {
    return {
      name: "GitHub Gist",
      logo: "https://github.githubassets.com/favicons/favicon.svg",
      origin: "https://gist.github.com",
    };
  }

  render(): HTMLElement {
    const iframe = createEl("iframe", {
      cls: ["external-embed", "node-insert-event"],
      attr: {
        srcdoc: this.#srcdoc ?? "",
        loading: "lazy",
        sandbox: "allow-scripts allow-top-navigation-by-user-activation",
      },
    });
    if (this.height) {
      iframe.style.height = `${this.height}px`;
    }
    return iframe;
  }

  override resolveSrc(): void | Promise<void> {
    if (this.#srcdoc) {
      return;
    }
    const matched = urlPattern.exec(this.url)!;
    const apiUrl =
      `${EMBED_URL}/${matched.pathname.groups.gistId}.json?` +
      new URLSearchParams({
        file: matched.hash.input,
      }).toString();
    return requestUrl(apiUrl).json.then(async (result) => {
      const stylesheet = await requestUrl(result.stylesheet).text;
      const styleDecl = getComputedStyle(document.body);
      const interfaceFont = styleDecl.getPropertyValue("--font-interface");
      const monospaceFont = styleDecl.getPropertyValue("--font-monospace");
      this.#srcdoc = `
      <html>
        <head>
          <base target="_parent" />
          <style>
            html, body { margin: 0; padding: 0; height: 100%; }
            body .gist .gist-meta { font-family: ${interfaceFont}; }
            body .gist .highlight { font-family: ${monospaceFont}; }
          </style>
          <style>${stylesheet}</style>
          <script>
            window.addEventListener("load", () => {
              top.postMessage({ id: ${this.#id}, height: document.body.scrollHeight }, "app://obsidian.md");
            });
          </script>
        </head>
        <body>${result.div}</body>
      </html>
      `;
    });
  }

  override get height(): number | undefined {
    return Gist.#heightCache.get(this.#id);
  }

  override onMessage(event: MessageEvent<{ id: number; height: number }>): boolean {
    if (event.origin !== "null") {
      return false;
    }
    const { id, height } = event.data;
    if (id !== this.#id || height <= 0) {
      return false;
    }
    Gist.#heightCache.set(this.#id, height);
    this.loaded();
    return true;
  }
}
