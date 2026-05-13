// ==UserScript==
// @name         Nexus Better Mods List
// @namespace    http://tampermonkey.net/
// @version      2025-07-30
// @description  Nya
// @author       A-Lisa
// @match        https://www.nexusmods.com/games/*/mods*
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
        get isTracked() {
            return this.viewerTracked === true;
        }
    }
    class ModTileBase {
        element;
        constructor(element) {
            this.element = element;
        }
        static fromElement(element) {
            const e2eid = element.attr("data-e2eid");
            switch (e2eid) {
                case "mod-tile":
                    return new ModTileStandard(element);
                case "mod-tile-compact":
                    return new ModTileCompact(element);
                case "mod-tile-list":
                    return new ModTileList(element);
                default:
                    console.error(`Can't create ModTile from an unknown type: ${e2eid}`);
            }
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
        async replaceOriginalCheckmarkDiv() {
            this.originalCheckmarkDiv.remove();
            this.addCheckmarkDiv();
        }
        get checkmarkDivExists() {
            const checkmarkDiv = $(".checkmark-div", this.element);
            if (checkmarkDiv.length > 1) {
                console.error(`${this} has multiple checkmark divs`);
                return true;
            }
            return checkmarkDiv.length === 1;
        }
    }
    class ModTileStandard extends ModTileBase {
        get thumbnail() {
            return this.element.children().eq(0);
        }
        get originalCheckmarkDiv() {
            return this.thumbnail.children().eq(1);
        }
        async addCheckmarkDiv() {
            const checkmarkDiv = $(`
                <div class="checkmark-div absolute top-2.5 left-2.5 z-10 rounded bg-neutral-50 px-1.5 py-1 shadow-md">
                    <span>
                        <p class="typography-title-sm flex items-center gap-x-1 leading-4 text-neutral-inverted" data-e2eid="mod-tile-downloaded">
                            <svg viewBox="0 0 24 24" style="width: 1rem; height: 1rem;" role="presentation" class="shrink-0">
                                <path d="M21,5L9,17L3.5,11.5L4.91,10.09L9,14.17L19.59,3.59L21,5M3,21V19H21V21H3Z" style="fill: currentcolor;"></path>
                            </svg>
                        </p>
                    </span>
                </div>
            `);
            this.thumbnail.append(checkmarkDiv);
        }
        async addCheckmarkInfo(text) {
            $(`
                <span>
                    <p class="typography-title-sm flex items-center gap-x-1 leading-4 text-neutral-inverted" data-e2eid="mod-tile-downloaded">
                        <svg viewBox="0 0 24 24" style="width: 1rem; height: 1rem;" role="presentation" class="shrink-0">
                            <path d="M21,5L9,17L3.5,11.5L4.91,10.09L9,14.17L19.59,3.59L21,5M3,21V19H21V21H3Z" style="fill: currentcolor;"></path>
                        </svg>
                    </p>
                </span>
            `);
        }
    }
    class ModTileCompact extends ModTileBase {
        get thumbnail() {
            return $(this.element.children()[0]);
        }
        async addCheckmarkDiv() {
            const checkmarkDiv = $(`
                <div class="absolute left-1.5 z-10 rounded-md bg-neutral-50 px-1.5 py-1 shadow-md top-1.5">
                    <span>
                        <p class="typography-body-sm flex items-center gap-x-1 leading-4 hidden text-neutral-inverted @min-[12rem]/mod-tile:flex">
                            <svg viewBox="0 0 24 24" style="width: 1rem; height: 1rem;" role="presentation" class="shrink-0">
                                <path d="M21,5L9,17L3.5,11.5L4.91,10.09L9,14.17L19.59,3.59L21,5M3,21V19H21V21H3Z" style="fill: currentcolor;"></path>
                            </svg>
                        </p>
                    </span>
                </div>
            `);
            this.thumbnail.append(checkmarkDiv);
        }
    }
    class ModTileList extends ModTileBase {
        get thumbnail() {
            return $($(this.element.children()[0]).children()[0]);
        }
        async addCheckmarkDiv() {
            const checkmarkDiv = $(`
                <div class="absolute left-1.5 z-10 rounded-md bg-neutral-50 px-1.5 py-1 shadow-md top-1.5">
                    <span>
                        <p class="typography-title-sm flex items-center gap-x-1 leading-4 text-neutral-inverted" data-e2eid="mod-tile-downloaded">
                            <svg viewBox="0 0 24 24" style="width: 1rem; height: 1rem;" role="presentation" class="shrink-0">
                                <path d="M21,5L9,17L3.5,11.5L4.91,10.09L9,14.17L19.59,3.59L21,5M3,21V19H21V21H3Z" style="fill: currentcolor;"></path>
                            </svg>
                        </p>
                    </span>
                </div>
            `);
            $(this.thumbnail.children()[0]).append(checkmarkDiv);
        }
    }
    class ModGrid {
        element;
        constructor() {
            this.element = $(".mods-grid, .mods-grid-compact, .mods-grid-list");
        }
        get modTiles() {
            const modsElements = $("[data-e2eid='mod-tile'], [data-e2eid='mod-tile-compact'], [data-e2eid='mod-tile-list']", this.element);
            return modsElements
                .map((index, element) => ModTileBase.fromElement($(element)))
                .get();
        }
    }
    // map of mod id to ModData
    const modsData = new Map();
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
    }
    async function modifyModTile(modTile) {
        if (modTile.data.isDownloaded && $(".checkmark-downloaded", modTile.element).length === 0) {
            const localeDate = new Intl.DateTimeFormat().format(modTile.data.viewerDownloaded);
            const dateSpan = $(`<span class="text-neutral-inverted checkmark-downloaded">${localeDate}</span>`);
            $("p", modTile.downloadedMark).append(dateSpan);
        }
        if (modTile.data.isTracked && $(".checkmark-tracked", modTile.element).length === 0) {
            const trackedTextSpan = $(`<span class="text-neutral-inverted checkmark-tracked">Tracked</span>`);
            if (!modTile.hasCheckmark) {
                await modTile.addCheckmarkDiv();
                $("p", modTile.downloadedMark).append(trackedTextSpan);
            }
            else {
                const trackedOuterSpan = modTile.downloadedMark.clone();
                trackedOuterSpan.append(trackedTextSpan);
                modTile.downloadedMark.after(trackedOuterSpan);
            }
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
    async function createModsGridChangedEvent() {
        const targetNode = $(".mods-grid, .mods-grid-compact, .mods-grid-list")[0];
        const config = { attibutes: true, childList: true, subtree: true };
        const observer = new MutationObserver(() => {
            const e = $.Event("modsGridChanged");
            $(document).trigger(e, [observer]);
        });
        observer.observe(targetNode, config);
    }
    async function beforeLoad() {
        patchFetch();
        createModsGridChangedEvent();
        responseProcessors.push(processApiRouterResponse);
        $(document).on("modsGridChanged", modifyModsGrid);
    }
    beforeLoad();
})();
