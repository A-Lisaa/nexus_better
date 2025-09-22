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
    class ModData {
        // should really be an object with all of the original data fields but i'm too fucking lazy
        rawData;
        constructor(rawData) {
            this.rawData = rawData;
        }
        get adultContent() {
            return this.rawData.adultContent;
        }
        get createdAt() {
            return new Date(this.rawData.createdAt);
        }
        get downloads() {
            return this.rawData.downloads;
        }
        get endorsements() {
            return this.rawData.endorsements;
        }
        get fileSize() {
            return this.rawData.fileSize;
        }
        get game() {
            return this.rawData.game;
        }
        get modCategory() {
            return this.rawData.modCategory;
        }
        get modId() {
            return this.rawData.modId;
        }
        get name() {
            return this.rawData.name;
        }
        get status() {
            return this.rawData.status;
        }
        get summary() {
            return this.rawData.summary;
        }
        get thumbnailUrl() {
            return this.rawData.thumbnailUrl;
        }
        get thumbnailBlurredUrl() {
            return this.rawData.thumbnailBlurredUrl;
        }
        get uid() {
            return this.rawData.uid;
        }
        get updatedAt() {
            return new Date(this.rawData.updatedAt);
        }
        get uploader() {
            return this.rawData.uploader;
        }
        /**
         * null if hasn't been downloaded
         */
        get viewerDownloaded() {
            const viewerDownloaded = this.rawData.viewerDownloaded;
            if (viewerDownloaded === null)
                return null;
            return new Date(this.rawData.viewerDownloaded);
        }
        /**
         * null if HAS NEVER BEEN endorsed, false if WAS endorsed, true if IS endorsed
         */
        get viewerEndorsed() {
            return this.rawData.viewerEndorsed;
        }
        get viewerTracked() {
            return this.rawData.viewerTracked;
        }
        /**
         * null if hasn't been downloaded (check if viewerDownloaded is null)
         */
        get viewerUpdateAvailable() {
            return this.rawData.viewerUpdateAvailable;
        }
        get viewerIsBlocked() {
            return this.rawData.viewerIsBlocked;
        }
        get isDownloaded() {
            return this.viewerDownloaded !== null;
        }
        get isUpdated() {
            return this.viewerUpdateAvailable === true;
        }
    }
    let ModTileTypes;
    (function (ModTileTypes) {
        ModTileTypes[ModTileTypes["Standard"] = "mod-tile"] = "Standard";
        ModTileTypes[ModTileTypes["Compact"] = "mod-tile-compact"] = "Compact";
        ModTileTypes[ModTileTypes["List"] = "mod-tile-list"] = "List";
    })(ModTileTypes || (ModTileTypes = {}));
    class ModTile {
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
        get data() {
            return modsData.get(this.id);
        }
        get downloadedMark() {
            return $("[data-e2eid='mod-tile-downloaded']", this.element);
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
        get modTiles() {
            const modsElements = $(`[data-e2eid='${this.type}']`, this.element);
            return modsElements
                .map((index, element) => new ModTile($(element)))
                .get();
        }
    }
    // map of mod id to ModData
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
        if (options.body.operationName === "UserMods" || options.body.operationName === "ModsListing") {
            const json = await response.json();
            const data = json.data;
            const modsList = data.mods.nodes;
            for (const modObject of modsList) {
                const modData = new ModData(modObject);
                modsData.set(modData.modId, modData);
            }
        }
        createModsGridChangedEvent();
    }
    async function modifyModTile(modTile) {
        if (modTile.data.isDownloaded) {
            // date span has already been added to the checkmark element
            if ($("span.text-neutral-inverted", modTile.downloadedMark).length !== 0)
                return;
            const localeDate = new Intl.DateTimeFormat().format(modTile.data.viewerDownloaded);
            const dateSpan = $(`<span class="text-neutral-inverted">${localeDate}</span>`);
            modTile.downloadedMark.append(dateSpan);
        }
    }
    async function modifyModsGrid(e, observer) {
        const modGrid = new ModGrid();
        await Promise.all(modGrid.modTiles.map((modTile) => {
            modifyModTile(modTile);
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
