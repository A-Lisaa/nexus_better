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
    class ArrayValueMap extends Map {
        /**
         * Adds one or more elements to the array associated with the specified key.
         * If the key does not exist, a new array is created with the provided elements.
         * If the key exists, the elements are appended to the existing array.
         * @param key The key to which the elements should be added.
         * @param elements The elements to add to the array.
         */
        add(key, ...elements) {
            const array = this.get(key);
            if (array === undefined) {
                this.set(key, elements);
            }
            else {
                array.push(...elements);
            }
        }
    }
    const responseProcessors = new ArrayValueMap();
    async function patchFetch() {
        const originalFetch = window.fetch;
        window.fetch = async (resource, options) => {
            console.debug("Called fetch with:\nresource =\n", resource, "\noptions =\n", options);
            const response = await originalFetch(resource, options);
            const resourceURL = resource instanceof Request ? resource.url : resource instanceof URL ? resource.href : resource;
            const optionsJSON = JSON.parse(JSON.stringify(options));
            optionsJSON.body = JSON.parse(optionsJSON.body);
            const processors = responseProcessors.get(resourceURL);
            if (processors !== undefined) {
                for (const processor of processors) {
                    processor(response.clone(), optionsJSON);
                }
            }
            return response;
        };
    }
    let ModTileTypes;
    (function (ModTileTypes) {
        ModTileTypes["Standard"] = "mod-tile";
        ModTileTypes["Compact"] = "mod-tile-compact";
        ModTileTypes["List"] = "mod-tile-list";
    })(ModTileTypes || (ModTileTypes = {}));
    class Mod {
        element;
        constructor(element) {
            this.element = element;
        }
        get type() {
            const e2eid = this.element.attr("data-e2eid");
            return ModTileTypes[e2eid];
        }
        get href() {
            return $("a", this.element).attr("href");
        }
        get id() {
            return parseInt(this.href.split("/").at(-1));
        }
        get downloadedMark() {
            return $("[data-e2eid='mod-tile-downloaded']", this.element);
        }
        get isDownloaded() {
            return this.downloadedMark.length > 0;
        }
        get isUpdated() {
            return $("[data-e2eid='mod-tile-update-available']", this.element).length > 0;
        }
        async addDownloadDate(date) {
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
        element;
        constructor() {
            this.element = $(".mods-grid, .mods-grid-compact, .mods-grid-list");
        }
        get type() {
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
        get mods() {
            const modsElements = $(`[data-e2eid='${this.type}']`, this.element);
            return modsElements
                .map((index, element) => new Mod($(element)))
                .get();
        }
    }
    const modsData = new Map();
    async function processApiRouterResponse(response, options) {
        if (["UserMods", "ModsListing"].includes(options.body.operationName)) {
            const json = await response.json();
            const data = json.data;
            const modsList = data.mods.nodes;
            for (const mod of modsList) {
                modsData[mod.modId] = mod;
            }
        }
    }
    async function createModsGridChangedEvent() {
        const targetNode = $(".mods-grid, .mods-grid-compact, .mods-grid-list")[0];
        const config = { attibutes: true, childList: true, subtree: true };
        const observer = new MutationObserver(() => {
            const e = $.Event("modsGridChanged");
            $(document).trigger(e, [observer]);
        });
        observer.observe(targetNode, config);
    }
    async function modifyModsGrid(e, observer) {
        // await modifyMods();
        const modGrid = new ModGrid();
        await Promise.all(modGrid.mods.map((mod) => {
            const dateDownloaded = new Date(modsData[mod.id].viewerDownloaded);
            mod.addDownloadDate(dateDownloaded);
        }));
        // remove records of our modifications so the observer doesn't trigger because of them
        observer.takeRecords();
    }
    async function main() {
        patchFetch();
        responseProcessors.add("https://api-router.nexusmods.com/graphql", processApiRouterResponse);
        responseProcessors.add("https://api-router.nexusmods.com/graphql", createModsGridChangedEvent);
        // createBodyChangedEvent();
        // $(document).on("bodyChanged", createModsGridChangedEvent);
        $(document).on("modsGridChanged", modifyModsGrid);
    }
    main();
})();
