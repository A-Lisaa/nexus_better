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

    type ModDataGame = { domainName: string, id: number, name: string };
    type ModDataModCategory = { categoryId: number, name: string };
    type ModDataUploader = { avatar: string, memberId: number, name: string };
    class ModData {
        // should really be an object with all of the original data fields but i'm too fucking lazy
        rawData: any

        constructor(rawData: any) {
            this.rawData = rawData;
        }

        get adultContent(): boolean {
            return this.rawData.adultContent;
        }

        get createdAt(): Date {
            return new Date(this.rawData.createdAt);
        }

        get downloads(): number {
            return this.rawData.downloads;
        }

        get endorsements(): number {
            return this.rawData.endorsements;
        }

        get fileSize(): number {
            return this.rawData.fileSize;
        }

        get game(): ModDataGame {
            return this.rawData.game;
        }

        get modCategory(): ModDataModCategory {
            return this.rawData.modCategory;
        }

        get modId(): number {
            return this.rawData.modId;
        }

        get name(): string {
            return this.rawData.name;
        }

        get status(): string {
            return this.rawData.status;
        }

        get summary(): string {
            return this.rawData.summary;
        }

        get thumbnailUrl(): string {
            return this.rawData.thumbnailUrl;
        }

        get thumbnailBlurredUrl(): string {
            return this.rawData.thumbnailBlurredUrl;
        }

        get uid(): string {
            return this.rawData.uid;
        }

        get updatedAt(): Date {
            return new Date(this.rawData.updatedAt);
        }

        get uploader(): ModDataUploader {
            return this.rawData.uploader;
        }

        /**
         * null if hasn't been downloaded
         */
        get viewerDownloaded(): Date | null {
            const viewerDownloaded = this.rawData.viewerDownloaded;
            if (viewerDownloaded === null)
                return null;
            return new Date(this.rawData.viewerDownloaded);
        }

        /**
         * null if HAS NEVER BEEN endorsed, false if WAS endorsed, true if IS endorsed
         */
        get viewerEndorsed(): boolean | null {
            return this.rawData.viewerEndorsed;
        }

        get viewerTracked(): boolean {
            return this.rawData.viewerTracked;
        }

        /**
         * null if hasn't been downloaded (check if viewerDownloaded is null)
         */
        get viewerUpdateAvailable(): boolean | null {
            return this.rawData.viewerUpdateAvailable;
        }

        get viewerIsBlocked(): boolean {
            return this.rawData.viewerIsBlocked;
        }

        get isDownloaded(): boolean {
            return this.viewerDownloaded !== null;
        }

        get isUpdated(): boolean {
            return this.viewerUpdateAvailable === true;
        }
    }

    enum ModTileTypes {
        Standard = "mod-tile" as any,
        Compact = "mod-tile-compact" as any,
        List = "mod-tile-list" as any
    }

    class ModTile {
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

        get data(): ModData {
            return modsData.get(this.id);
        }

        get downloadedMark(): JQuery {
            return $("[data-e2eid='mod-tile-downloaded']", this.element);
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

        get modTiles(): Array<ModTile> {
            const modsElements = $(`[data-e2eid='${this.type}']`, this.element);
            return modsElements
                .map((index, element) => new ModTile($(element)))
                .get();
        }
    }

    // map of mod id to ModData
    const modsData: Map<number, ModData> = new Map();

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

    async function modifyModTile(modTile: ModTile) {
        if (modTile.data.isDownloaded) {
            // date span has already been added to the checkmark element
            if ($("span.text-neutral-inverted", modTile.downloadedMark).length !== 0)
                return;

            const localeDate = new Intl.DateTimeFormat().format(modTile.data.viewerDownloaded);
            const dateSpan = $(`<span class="text-neutral-inverted">${localeDate}</span>`);
            modTile.downloadedMark.append(dateSpan);
        }
    }

    async function modifyModsGrid(e: JQuery.Event, observer: MutationObserver): Promise<void> {
        const modGrid = new ModGrid();
        await Promise.all(modGrid.modTiles.map((modTile) => {
            modifyModTile(modTile);
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