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
    const responseProcessors = [];
    async function patchFetch() {
        const originalFetch = window.fetch;
        window.fetch = async function (resource, options = {}) {
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
        };
    }
    async function patchXHRSend() {
        const originalXHRSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function (body) {
            const originalXHRonreadystatechange = this.onreadystatechange;
            this.onreadystatechange = function () {
                if (this.readyState !== XMLHttpRequest.DONE)
                    return;
                for (const processor of responseProcessors) {
                    processor(this.responseURL, {}, this.response, "xhr");
                }
                if (originalXHRonreadystatechange !== null) {
                    originalXHRonreadystatechange.apply(this);
                }
            };
            return originalXHRSend.apply(this, body);
        };
    }
    let ModTileTypes;
    (function (ModTileTypes) {
        ModTileTypes[ModTileTypes["Standard"] = "mod-tile"] = "Standard";
        ModTileTypes[ModTileTypes["Compact"] = "mod-tile-compact"] = "Compact";
        ModTileTypes[ModTileTypes["List"] = "mod-tile-list"] = "List";
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
    async function createModsGridChangedEvent() {
        const targetNode = $(".mods-grid, .mods-grid-compact, .mods-grid-list")[0];
        const config = { attibutes: true, childList: true, subtree: true };
        const observer = new MutationObserver(() => {
            const e = $.Event("modsGridChanged");
            $(document).trigger(e, [observer]);
        });
        observer.observe(targetNode, config);
    }
    async function processApiRouterResponse(request, options, response) {
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
    async function modifyModsGrid(e, observer) {
        const modGrid = new ModGrid();
        await Promise.all(modGrid.mods.map((mod) => {
            const dateDownloaded = new Date(modsData[mod.id].viewerDownloaded);
            mod.addDownloadDate(dateDownloaded);
        }));
        // remove records of our modifications so the observer doesn't trigger because of them
        observer.takeRecords();
    }
    async function beforeLoad() {
        patchFetch();
        responseProcessors.push(processApiRouterResponse);
        $(document).on("modsGridChanged", modifyModsGrid);
    }
    beforeLoad();
})();
