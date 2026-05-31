import { EmbedSource } from "../embed_source.ts";

const urlPattern = new URLPattern({
  pathname: "/watch/:id",
  baseURL: "https://www.nicovideo.jp",
});

export default class Niconico extends EmbedSource {
  #src: string;
  constructor(url: string) {
    super(url);
    const matched = urlPattern.exec(url)!;
    this.#src = `https://embed.nicovideo.jp/watch/${matched.pathname.groups.id}`;
  }

  static override get meta() {
    return {
      name: "Niconico",
      logo: "https://www.nicovideo.jp/favicon.ico",
      origin: "https://www.nicovideo.jp",
    };
  }

  render(): HTMLElement {
    const iframe = createEl("iframe", {
      cls: ["external-embed", "node-insert-event", "aspect-video"],
      attr: {
        src: this.#src,
        loading: "lazy",
        allow: "fullscreen; autoplay",
      },
    });
    iframe.addEventListener("load", () => this.loaded());
    return iframe;
  }
}
