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
// @run-at document-start
// @require https://code.jquery.com/jquery-2.2.0.min.js
// ==/UserScript==

// we use jquery 2.2.0 to be consistent with the version used on a mod page

(() => {
    "use strict";

    /**
     * A Map that associates keys with arrays of values.
     * Provides a convenient method to add elements to the array associated with a key.
     * @template TKey The type of keys in the map.
     * @template TArrayElement The type of elements in the arrays.
     */
    class ArrayValueMap<TKey, TArrayElement> extends Map<TKey, Array<TArrayElement>> {
        /**
         * Adds one or more elements to the array associated with the specified key.
         * If the key does not exist, a new array is created with the provided elements.
         * If the key exists, the elements are appended to the existing array.
         * @param key The key to which the elements should be added.
         * @param elements The elements to add to the array.
         */
        add(key: TKey, ...elements: Array<TArrayElement>): void {
            const array = this.get(key);
            if (array === undefined) {
                this.set(key, elements);
            }
            else {
                array.push(...elements);
            }
        }
    }

    const responseProcessors: ArrayValueMap<string, (response: Response, options: any) => void> = new ArrayValueMap();

    async function patchFetch(): Promise<void> {
        const originalFetch = window.fetch;
        window.fetch = async (resource, options) => {
            console.debug("Called fetch with:\nresource =\n", resource, "\noptions =\n", options);

            const response = await originalFetch(resource, options);

            const resourceURL = resource instanceof Request ? resource.url : resource instanceof URL ? resource.href : resource;
            const optionsJSON = JSON.parse(JSON.stringify(options))
            optionsJSON.body = JSON.parse(optionsJSON.body);
            const processors = responseProcessors.get(resourceURL);
            if (processors !== undefined) {
                for (const processor of processors) {
                    processor(response.clone(), optionsJSON);
                }
            }

            return response;
        }
    }

    enum ModTileTypes {
        Standard = "mod-tile",
        Compact = "mod-tile-compact",
        List = "mod-tile-list"
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

    async function processApiRouterResponse(response: Response, options: any): Promise<void> {
        if (["UserMods", "ModsListing"].includes(options.body.operationName)) {
            const json = await response.json();
            const data = json.data;
            const modsList = data.mods.nodes;
            for (const mod of modsList) {
                modsData[mod.modId] = mod;
            }
        }
    }

    async function createModsGridChangedEvent(): Promise<void> {
        const targetNode = $(".mods-grid, .mods-grid-compact, .mods-grid-list")[0];
        const config = { attibutes: true, childList: true, subtree: true };
        const observer = new MutationObserver(() => {
            const e = $.Event("modsGridChanged");
            $(document).trigger(e, [ observer ]);
        });
        observer.observe(targetNode, config);
    }

    async function modifyModsGrid(e: JQuery.Event, observer: MutationObserver): Promise<void> {
        // await modifyMods();
        const modGrid = new ModGrid();
        await Promise.all(modGrid.mods.map((mod) => {
            const dateDownloaded = new Date(modsData[mod.id].viewerDownloaded);
            mod.addDownloadDate(dateDownloaded);
        }));
        // remove records of our modifications so the observer doesn't trigger because of them
        observer.takeRecords();
    }

    async function main(): Promise<void> {
        patchFetch();
        responseProcessors.add("https://api-router.nexusmods.com/graphql", processApiRouterResponse);
        responseProcessors.add("https://api-router.nexusmods.com/graphql", createModsGridChangedEvent);

        // createBodyChangedEvent();
        // $(document).on("bodyChanged", createModsGridChangedEvent);
        $(document).on("modsGridChanged", modifyModsGrid);
    }

    main();
})();