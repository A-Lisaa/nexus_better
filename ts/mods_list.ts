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
            return originalXHRSend.call(this, body);
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

        get isTracked(): boolean {
            return this.viewerTracked === true;
        }
    }

    abstract class ModTileBase {
        element: JQuery

        constructor(element: JQuery) {
            this.element = element;
        }

        static fromElement(element: JQuery): ModTileBase {
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

        get href(): string {
            return $("a", this.element).attr("href");
        }

        get id(): number {
            return parseInt(this.href.split("/").at(-1));
        }

        get data(): ModData {
            return modsData.get(this.id);
        }

        // original elements

        protected abstract get thumbnail(): JQuery;

        protected abstract get originalCheckmarkDiv(): JQuery;

        // new elements

        protected abstract addCheckmarkDiv(): Promise<void>;

        protected async replaceOriginalCheckmarkDiv(): Promise<void> {
            this.originalCheckmarkDiv.remove();
            this.addCheckmarkDiv();
        }

        protected get checkmarkDivExists(): boolean {
            const checkmarkDiv = $(".checkmark-div", this.element);
            if (checkmarkDiv.length > 1) {
                console.error(`${this} has multiple checkmark divs`);
                return true;
            }
            return checkmarkDiv.length === 1;
        }

        abstract addCheckmarkInfo(text: string): Promise<void>;

        // get hasCheckmark(): boolean {
        //     // M21,5L9,17L3.5,11.5L4.91,10.09L9,14.17L19.59,3.59L21,5M3,21V19H21V21H3Z is a checkmark symbol
        //     return $("path[d='M21,5L9,17L3.5,11.5L4.91,10.09L9,14.17L19.59,3.59L21,5M3,21V19H21V21H3Z']", this.element).length !== 0;
        // }

        // get checkmarkDiv(): JQuery {
        //     return $("path[d='M21,5L9,17L3.5,11.5L4.91,10.09L9,14.17L19.59,3.59L21,5M3,21V19H21V21H3Z']", this.element).closest("div");
        // }

        // get downloadedMark(): JQuery {
        //     return $("[data-e2eid='mod-tile-downloaded']", this.element).closest("span");
        // }

        // get updateAvailableMark(): JQuery {
        //     return $("[data-e2eid='mod-tile-update-available']", this.element).parent().closest("span");
        // }
    }

    class ModTileStandard extends ModTileBase {
        get thumbnail(): JQuery {
            return this.element.children().eq(0);
        }

        get originalCheckmarkDiv(): JQuery {
            return this.thumbnail.children().eq(1);
        }

        async addCheckmarkDiv(): Promise<void> {
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

        async addCheckmarkInfo(text: string): Promise<void> {
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
        get thumbnail(): JQuery {
            return $(this.element.children()[0]);
        }

        async addCheckmarkDiv(): Promise<void> {
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
        get thumbnail(): JQuery {
            return $($(this.element.children()[0]).children()[0]);
        }

        async addCheckmarkDiv(): Promise<void> {
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
        element: JQuery

        constructor() {
            this.element = $(".mods-grid, .mods-grid-compact, .mods-grid-list");
        }

        get modTiles(): Array<ModTileBase> {
            const modsElements = $("[data-e2eid='mod-tile'], [data-e2eid='mod-tile-compact'], [data-e2eid='mod-tile-list']", this.element);
            return modsElements
                .map((index, element) => ModTileBase.fromElement($(element)))
                .get();
        }
    }

    // map of mod id to ModData
    const modsData: Map<number, ModData> = new Map();

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
    }

    async function modifyModTile(modTile: ModTileBase) {
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

    async function modifyModsGrid(e: JQuery.Event, observer: MutationObserver): Promise<void> {
        const modGrid = new ModGrid();
        await Promise.all(modGrid.modTiles.map((modTile) => {
            modifyModTile(modTile);
        }));
        // remove records of our modifications so the observer doesn't trigger because of them
        observer.takeRecords();
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

    async function beforeLoad(): Promise<void> {
        patchFetch();
        createModsGridChangedEvent();
        responseProcessors.push(processApiRouterResponse);

        $(document).on("modsGridChanged", modifyModsGrid);
    }

    beforeLoad();
})();