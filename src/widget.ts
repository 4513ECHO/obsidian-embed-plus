import { EditorView, WidgetType } from "@codemirror/view";
import { setIcon } from "obsidian";
import { type WidgetInit, resolved, failed } from "./effect.ts";
import { type EmbedSource, EmbedSourceRegistry } from "./embed_source.ts";

function Loading(height?: number): HTMLElement {
  const loadingEl = createDiv({ cls: "loading-embed" });
  if (height) {
    loadingEl.style.height = `${height}px`;
  }
  setIcon(loadingEl.createDiv({ cls: "icon-wrapper" }), "loader-circle");
  loadingEl.createEl("p", { text: "Loading..." });
  return loadingEl;
}

function ErrorMessage(error: Error): HTMLElement {
  const errorEl = createDiv({ cls: "error-embed" });
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
    switch (init.state) {
      case "failed":
        this.#error = init.error;
        break;
    }
    const embedSourceClass = EmbedSourceRegistry.lookup(init.url);
    if (embedSourceClass) {
      this.#embedSource = embedSourceClass;
    } else {
      throw new Error(`Invalid embed source for url: ${init.url}`);
    }
  }

  toDOM(view: EditorView): HTMLElement {
    const container = Container(this.#url, this.#state);
    switch (this.#state) {
      case "resolving":
        container.appendChild(Loading(this.#embedSource.height));
        const needResolve = this.#embedSource.resolveSrc();
        if (needResolve instanceof Promise) {
          needResolve
            .then(() => resolved(view, this.#url))
            .catch((error) => failed(view, this.#url, error));
        } else {
          this.#state = "resolved";
          container.setAttribute("data-state", "resolved");
          container.appendChild(this.#embedSource.render());
        }
        break;
      case "resolved":
        container.appendChild(Loading(this.#embedSource.height));
        container.appendChild(this.#embedSource.render());
        break;
      case "loaded":
        container.appendChild(this.#embedSource.render());
        break;
      case "failed":
        container.appendChild(ErrorMessage(this.#error!));
        break;
    }
    return container;
  }

  eq(other: this): boolean {
    return this.#url === other.#url && this.#state === other.#state;
  }

  get estimatedHeight(): number {
    return this.#embedSource.height ?? 150;
  }

  updateDOM(dom: HTMLElement): boolean {
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
      case "loaded":
        const iframe = dom.querySelector("iframe");
        if (iframe) {
          iframe.style.height = `${this.#embedSource.height}px`;
        }
        dom.querySelector(".loading-embed")?.remove();
        return true;
      case "failed":
        dom.querySelector(".loading-embed")?.remove();
        dom.appendChild(ErrorMessage(this.#error!));
        return true;
    }
  }
}

export function createElement(url: string, dom: HTMLElement): void {
  const embedSource = EmbedSourceRegistry.lookup(url);
  if (!embedSource) {
    return;
  }
  const container = Container(url, "resolving");
  const loading = Loading(embedSource.height);
  container.appendChild(loading);
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
        container.appendChild(ErrorMessage(error as Error));
        loading.remove();
      });
  } else {
    container.appendChild(embedSource.render());
  }
  dom.replaceWith(container);
}
