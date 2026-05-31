import { EditorView, WidgetType } from "@codemirror/view";
import { setIcon } from "obsidian";
import { type WidgetInit, resolved, failed } from "./effect.ts";
import { type EmbedSource, lookup } from "./embed_source.ts";

function Loading(parent: HTMLElement, height?: number): HTMLElement {
  const loadingEl = parent.createDiv({ cls: "loading-embed" });
  if (height) {
    loadingEl.style.height = `${height}px`;
  }
  setIcon(loadingEl.createDiv({ cls: "icon-wrapper" }), "loader-circle");
  loadingEl.createEl("p", { text: "Loading..." });
  return loadingEl;
}

function ErrorMessage(parent: HTMLElement, error: Error): HTMLElement {
  const errorEl = parent.createDiv({ cls: "error-embed" });
  setIcon(errorEl.createDiv({ cls: "icon-wrapper" }), "circle-x");
  errorEl.createEl("p", { text: error.toString() });
  return errorEl;
}

function Container(url: string, state: WidgetInit["state"]): HTMLElement {
  return createDiv({
    cls: "embed-plus-container",
    attr: { "data-url": url, "data-state": state },
  });
}

export class EmbedWidget extends WidgetType {
  #url: string;
  #state: WidgetInit["state"];
  #error?: Error;
  #embedSource: EmbedSource;
  constructor(init: WidgetInit) {
    super();
    this.#url = init.url;
    this.#state = init.state;
    if (init.state === "failed") {
      this.#error = init.error;
    }
    const embedSourceClass = lookup(init.url);
    if (embedSourceClass) {
      this.#embedSource = embedSourceClass;
    } else {
      throw new Error(`Invalid embed source for url: ${init.url}`);
    }
  }

  toDOM(view: EditorView): HTMLElement {
    const container = Container(this.#url, this.#state);
    switch (this.#state) {
      case "resolving": {
        Loading(container, this.#embedSource.height);
        const needResolve = this.#embedSource.resolveSrc();
        if (needResolve instanceof Promise) {
          needResolve
            .then(() => resolved(view, this.#url))
            .catch((error) => {
              if (error instanceof Error) {
                failed(view, this.#url, error);
              }
              throw error;
            });
        } else {
          this.#state = "resolved";
          container.setAttribute("data-state", "resolved");
          container.appendChild(this.#embedSource.render());
        }
        break;
      }
      case "resolved":
        Loading(container, this.#embedSource.height);
        container.appendChild(this.#embedSource.render());
        break;
      case "loaded":
        container.appendChild(this.#embedSource.render());
        break;
      case "failed":
        ErrorMessage(container, this.#error!);
        break;
    }
    return container;
  }

  override eq(other: this): boolean {
    return this.#url === other.#url && this.#state === other.#state;
  }

  override get estimatedHeight(): number {
    return this.#embedSource.height ?? 150;
  }

  override updateDOM(dom: HTMLElement): boolean {
    const prevUrl = dom.getAttribute("data-url");
    if (!prevUrl || this.#url !== prevUrl) {
      return false;
    }
    dom.setAttribute("data-state", this.#state);
    switch (this.#state) {
      case "resolving":
        return false;
      case "resolved":
        dom.appendChild(this.#embedSource.render());
        return true;
      case "loaded": {
        const iframe = dom.querySelector("iframe");
        if (iframe) {
          iframe.style.height = `${this.#embedSource.height}px`;
        }
        dom.querySelector(".loading-embed")?.remove();
        return true;
      }
      case "failed":
        dom.querySelector(".loading-embed")?.remove();
        ErrorMessage(dom, this.#error!);
        return true;
    }
  }
}

export function createElement(url: string, dom: HTMLElement): void {
  const embedSource = lookup(url);
  if (!embedSource) {
    return;
  }
  const container = Container(url, "resolving");
  const loading = Loading(container, embedSource.height);
  container.addEventListener("embed-plus:loaded", () => {
    container.setAttribute("data-state", "loaded");
    const iframe = container.querySelector("iframe");
    if (iframe) {
      iframe.style.height = `${embedSource.height}px`;
    }
    loading.remove();
  });
  const needResolve = embedSource.resolveSrc();
  if (needResolve instanceof Promise) {
    needResolve
      .then(() => {
        container.setAttribute("data-state", "resolved");
        container.appendChild(embedSource.render());
      })
      .catch((error) => {
        container.setAttribute("data-state", "failed");
        ErrorMessage(container, error as Error);
        loading.remove();
      });
  } else {
    container.appendChild(embedSource.render());
  }
  dom.replaceWith(container);
}
