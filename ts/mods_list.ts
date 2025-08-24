// ==UserScript==
// @name         Nexus Better Mods List
// @namespace    http://tampermonkey.net/
// @version      2025-07-30
// @description  Nya
// @author       A-Lisa
// @match        https://www.nexusmods.com/games/*
// @match        https://next.nexusmods.com/profile/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=nexusmods.com
// @grant        none
// @run-at       document-start
// @require      https://code.jquery.com/jquery-2.2.0.min.js
// ==/UserScript==

// we use jquery 2.2.0 to be consistent with the version used on a mod page


(() => {
    "use strict";

    type ResponseProcessor = (resource: string, options: any, response: Response, origin?: "fetch" | "xhr") => void;
    const responseProcessors: Array<ResponseProcessor> = [];

    async function patchFetch(): Promise<void> {
        const originalFetch = window.fetch;
        window.fetch = async function(resource, options = {}) {
            const response = await originalFetch(resource, options);

            const resourceURL = resource instanceof Request ? resource.url : resource instanceof URL ? resource.href : resource;
            const optionsJSON = JSON.parse(JSON.stringify(options));
            if (optionsJSON.body !== undefined) {
                optionsJSON.body = JSON.parse(optionsJSON.body);
            }

            for (const processor of responseProcessors) {
                processor(resourceURL, optionsJSON, response.clone(), "fetch");
            }

            return response;
        }
    }

    async function patchXHRSend(): Promise<void> {
        const originalXHRSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function(body?: Document | XMLHttpRequestBodyInit): void {
            const originalXHRonreadystatechange = this.onreadystatechange;
            this.onreadystatechange = function() {
                if (this.readyState !== XMLHttpRequest.DONE)
                    return;

                for (const processor of responseProcessors) {
                    processor(this.responseURL, {}, this.response, "xhr");
                }

                if (originalXHRonreadystatechange !== null) {
                    originalXHRonreadystatechange.apply(this);
                }
            }
            return originalXHRSend.apply(this, body);
        }
    }

    enum ModTileTypes {
        Standard = "mod-tile" as any,
        Compact = "mod-tile-compact" as any,
        List = "mod-tile-list" as any
    }

    class Mod {
        element: JQuery

        constructor(element: JQuery) {
            this.element = element;
        }

        get type(): ModTileTypes {
            const e2eid = this.element.attr("data-e2eid");
            return ModTileTypes[e2eid];
        }

        get href(): string {
            return $("a", this.element).attr("href");
        }

        get id(): number {
            return parseInt(this.href.split("/").at(-1));
        }

        get downloadedMark(): JQuery {
            return $("[data-e2eid='mod-tile-downloaded']", this.element);
        }

        get isDownloaded(): boolean {
            return this.downloadedMark.length > 0;
        }

        get isUpdated(): boolean {
            return $("[data-e2eid='mod-tile-update-available']", this.element).length > 0;
        }

        async addDownloadDate(date: Date): Promise<void> {
            if (!this.isDownloaded)
                return;

            if ($("span.text-neutral-inverted", this.element).length === 0) {
                const localeDate = new Intl.DateTimeFormat().format(date);
                const dateSpan = $(`<span class="text-neutral-inverted">${localeDate}</span>`);
                this.downloadedMark.append(dateSpan);
            }
        }
    }

    class ModGrid {
        element: JQuery

        constructor() {
            this.element = $(".mods-grid, .mods-grid-compact, .mods-grid-list");
        }

        get type(): ModTileTypes {
            if (this.element.hasClass("mods-grid")) {
                return ModTileTypes.Standard;
            }
            else if (this.element.hasClass("mods-grid-compact")) {
                return ModTileTypes.Compact;
            }
            else if (this.element.hasClass("mods-grid-list")) {
                return ModTileTypes.List;
            }
        }

        get mods(): Array<Mod> {
            const modsElements = $(`[data-e2eid='${this.type}']`, this.element);
            return modsElements
                .map((index, element) => new Mod($(element)))
                .get();
        }
    }

    const modsData: Map<string, object> = new Map();

    async function createModsGridChangedEvent(): Promise<void> {
        const targetNode = $(".mods-grid, .mods-grid-compact, .mods-grid-list")[0];
        const config = { attibutes: true, childList: true, subtree: true };
        const observer = new MutationObserver(() => {
            const e = $.Event("modsGridChanged");
            $(document).trigger(e, [ observer ]);
        });
        observer.observe(targetNode, config);
    }

    async function processApiRouterResponse(request: string, options: any, response: Response): Promise<void> {
        if (request !== "https://api-router.nexusmods.com/graphql")
            return;

        if (["UserMods", "ModsListing"].includes(options.body.operationName)) {
            const json = await response.json();
            const data = json.data;
            const modsList = data.mods.nodes;
            for (const mod of modsList) {
                modsData[mod.modId] = mod;
            }
        }

        createModsGridChangedEvent();
    }

    async function modifyModsGrid(e: JQuery.Event, observer: MutationObserver): Promise<void> {
        const modGrid = new ModGrid();
        await Promise.all(modGrid.mods.map((mod) => {
            const dateDownloaded = new Date(modsData[mod.id].viewerDownloaded);
            mod.addDownloadDate(dateDownloaded);
        }));
        // remove records of our modifications so the observer doesn't trigger because of them
        observer.takeRecords();
    }

    async function beforeLoad(): Promise<void> {
        patchFetch();
        responseProcessors.push(processApiRouterResponse);

        $(document).on("modsGridChanged", modifyModsGrid);
    }

    beforeLoad();
})();