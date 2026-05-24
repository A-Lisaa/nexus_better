// ==UserScript==
// @name         Nexus Better Mod Page
// @namespace    http://tampermonkey.net/
// @version      2026-05-24
// @description  Nya
// @author       A-Lisa
// @match        https://www.nexusmods.com/*/mods/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=nexusmods.com
// @grant        none
// @run-at       document-start
// ==/UserScript==
//#endregion
(() => {
    "use strict";
    class Utils {
        /**
         * Capitalizes str
         */
        static capitalize(str) {
            const firstLetter = str.at(0);
            if (firstLetter === undefined)
                return "";
            return firstLetter.toUpperCase() + str.substring(1);
        }
        static setupObserver(targetNode, changedEventName) {
            const config = { attributes: true, childList: true, subtree: true };
            const observer = new MutationObserver(() => {
                const e = $.Event(changedEventName);
                $(document).trigger(e, [observer]);
            });
            observer.observe(targetNode, config);
        }
    }
    class FetchArgs {
        resource;
        options;
        constructor(resource, options) {
            this.resource = resource;
            this.options = options;
        }
        get resourceURL() {
            if (this.resource instanceof Request)
                return this.resource.url;
            if (this.resource instanceof URL)
                return this.resource.href;
            return this.resource;
        }
        get optionsJSON() {
            const optionsJSON = JSON.parse(JSON.stringify(this.options));
            if (optionsJSON.body !== undefined)
                optionsJSON.body = JSON.parse(optionsJSON.body);
            return optionsJSON;
        }
    }
    class FetchArgsAndResponse extends FetchArgs {
        response;
        // ALWAYS await this method to ensure it finishes before response returns to original caller
        async modifyResponseText(modifier) {
            // await to be sure that modifier finishes before response returns to original caller
            const modifiedText = await modifier(await this.response.text());
            const modifiedResponse = new Response(modifiedText, {
                status: this.response.status,
                statusText: this.response.statusText,
                headers: this.response.headers
            });
            this.response = modifiedResponse;
        }
        constructor(resource, options, response) {
            super(resource, options);
            this.response = response;
        }
    }
    class FetchInterceptor {
        static fetchPatchedBefore = false;
        static actionsBeforeSend = [];
        static actionsAfterSend = [];
        static async patchFetch() {
            if (this.fetchPatchedBefore) {
                console.warn("FetchInterceptor.patchFetch has already patched fetch, aborting.");
                return;
            }
            // can't make window.fetch an attribute of FetchInterceptor cause it throws
            // "'fetch' called on an object that does not implement interface Window."
            const originalFetch = window.fetch;
            window.fetch = async function (resource, options) {
                const fetchArgs = new FetchArgs(resource, options);
                for (const action of FetchInterceptor.actionsBeforeSend) {
                    // await to be sure that action finishes before response returns to original caller
                    await action(fetchArgs);
                }
                const response = await originalFetch(fetchArgs.resource, fetchArgs.options);
                const fetchArgsAndResponse = new FetchArgsAndResponse(fetchArgs.resource, fetchArgs.options, response);
                for (const action of FetchInterceptor.actionsAfterSend) {
                    // await to be sure that action finishes before response returns to original caller
                    await action(fetchArgsAndResponse);
                }
                return fetchArgsAndResponse.response;
            };
            this.fetchPatchedBefore = true;
        }
        static async addActionBeforeSend(action) {
            this.actionsBeforeSend.push(action);
        }
        static async addActionAfterSend(action) {
            this.actionsAfterSend.push(action);
        }
    }
    class AjaxCompleteActions {
        static ajaxCompleteHandlerAddedEarlier = false;
        static actions = [];
        static async addAjaxCompleteHandler() {
            if (this.ajaxCompleteHandlerAddedEarlier) {
                console.warn("ajaxComplete handler has been added already, aborting");
                return;
            }
            $(document).on("ajaxComplete", (e, xhr, settings) => {
                for (const action of this.actions) {
                    action(e, xhr, settings);
                }
            });
            this.ajaxCompleteHandlerAddedEarlier = true;
        }
        static async addAction(action) {
            this.actions.push(action);
        }
        static async addRegexAction(regex, action) {
            const func = async (e, xhr, settings) => {
                const url = settings.url;
                if (regex.test(url)) {
                    console.log(`Calling action for ${regex} on ${url}`);
                    action();
                }
            };
            this.addAction(func);
        }
    }
    let Tabs;
    (function (Tabs) {
        Tabs[Tabs["Description"] = 0] = "Description";
        Tabs[Tabs["Files"] = 1] = "Files";
        Tabs[Tabs["Images"] = 2] = "Images";
        Tabs[Tabs["Videos"] = 3] = "Videos";
        Tabs[Tabs["Article"] = 4] = "Article";
        Tabs[Tabs["Documentation"] = 5] = "Documentation";
        Tabs[Tabs["Posts"] = 6] = "Posts";
        Tabs[Tabs["Forum"] = 7] = "Forum";
        Tabs[Tabs["Bug"] = 8] = "Bug";
        Tabs[Tabs["Actions"] = 9] = "Actions";
        Tabs[Tabs["Stats"] = 10] = "Stats";
    })(Tabs || (Tabs = {}));
    class ModStats {
        id;
        uniqueDLs;
        totalDLs;
        totalViews;
        constructor(id, uniqueDLs, totalDLs, totalViews) {
            this.id = id;
            this.uniqueDLs = uniqueDLs;
            this.totalDLs = totalDLs;
            this.totalViews = totalViews;
        }
    }
    class ModRow {
        element;
        constructor(element) {
            this.element = element;
        }
        get href() {
            const href = $("a", this.element).attr("href");
            if (href === undefined) {
                console.error(`ModRow.href === undefined where ModRow.element === ${this.element}, something went wrong, returning empty string`);
                return "";
            }
            return href;
        }
        get id() {
            const id = this.href.split("/").at(-1);
            if (id === undefined) {
                console.error(`ModRow.id === undefined where ModRow.element === ${this.element}, something went wrong, returning -1`);
                return -1;
            }
            return parseInt(id);
        }
        get stats() {
            const stats = modsStats.get(this.id) || new ModStats(this.id, 0, 0, 0);
            return stats;
        }
        async hide() {
            this.element.attr("hidden", "");
        }
        async remove() {
            this.element.remove();
        }
    }
    class ModsTable {
        element;
        constructor(element) {
            this.element = element;
        }
        get head() {
            return $("thead", this.element);
        }
        get headers() {
            return $("tr", this.head);
        }
        get body() {
            return $("tbody", this.element);
        }
        get rows() {
            return $("tr", this.body);
        }
        get mods() {
            return this.rows.map(function () {
                // local this - each row
                return new ModRow($(this));
            }).get();
        }
        async removeHandlers() {
            const newElement = this.element.clone();
            this.element.replaceWith(newElement);
            this.element = newElement;
        }
    }
    // practically consts
    // use ONLY after load
    var requirementsTable;
    var translationsTable;
    var gameId;
    // map of mod's id to it's stats
    const modsStats = new Map();
    // map of mod's href to it's note in the requirements table
    const requirementsNotes = new Map();
    function getSelectedTab() {
        const url = new URL(window.location.href);
        const params = url.searchParams;
        // if there's no tab parameter, the tab is description
        const tab = params.get("tab") ?? "description";
        return Tabs[Utils.capitalize(tab)];
    }
    function isFileDownloadPage() {
        // file download page href is like this: https://www.nexusmods.com/skyrimspecialedition/mods/156952?tab=files&file_id=669963,
        // so if file_id exists it should be a file download page
        return new URL(window.location.href).searchParams.has("file_id");
    }
    /**
     * Converts GlobalModStats object into a Map
     */
    async function populateModsStats() {
        for (const modId in GlobalModStats[gameId]) {
            const modStats = GlobalModStats[gameId][modId];
            modsStats.set(parseInt(modId), new ModStats(parseInt(modId), modStats.unique, modStats.total, modStats.views));
        }
    }
    // call if tab is description
    async function populateRequirementsNotes() {
        const requirements = requirementsTable.rows;
        requirements.each(function () {
            const href = $("a", this).attr("href");
            if (href === undefined) {
                console.error(`Mod ${this} from requirements table has href === undefined, the fuck?`);
                return;
            }
            const note = $(".table-require-notes", this).text();
            requirementsNotes.set(href, note);
        });
    }
    async function modifyRequiringTableHeaders(requiringTable) {
        const uniqueDLsHeader = $("<th class='table-require-uniqueDLs header'><span class='table-header'>Unique DLs</span></th>");
        const totalDLsHeader = $("<th class='table-require-totalDLs header'><span class='table-header'>Total DLs</span></th>");
        const totalViewsHeader = $("<th class='table-require-totalViews header'><span class='table-header'>Total Views</span></th>");
        requiringTable.headers.append(uniqueDLsHeader, totalDLsHeader, totalViewsHeader);
    }
    async function modifyRequiringTableMod(mod, translationsTableModsLinks) {
        if (translationsTableModsLinks.includes(mod.href)) {
            mod.hide();
            // don't return here because adding data to hidden mods resolves some issues when the table would become empty after hiding
        }
        // limit the max-width of the notes cell so that it doesn't overflow in width when the note is very long, 350px seems to work fine
        const notesData = $(mod.element.children()[1]);
        notesData.css("max-width", "350px");
        // if stats aren't in the csv file (if it hasn't been updated yet for example), substitute them with 0
        const stats = modsStats.get(mod.id) || new ModStats(mod.id, 0, 0, 0);
        const uniqueDLsData = `<td class='table-require-uniqueDLs'>${stats.uniqueDLs}</td>`;
        const totalDLsData = `<td class='table-require-totalDLs'>${stats.totalDLs}</td>`;
        const totalViewsData = `<td class='table-require-totalViews'>${stats.totalViews}</td>`;
        mod.element.append(uniqueDLsData, totalDLsData, totalViewsData);
    }
    async function modifyRequiringTableRows(requiringTable) {
        const translationsTableModsLinks = translationsTable.mods.map((mod) => mod.href);
        const promises = [];
        const requiringTableMods = requiringTable.mods;
        for (const mod of requiringTableMods) {
            promises.push(modifyRequiringTableMod(mod, translationsTableModsLinks));
        }
        await Promise.all(promises);
    }
    async function modifyRequiringTable(requiringTable) {
        // remove handlers earlier so that it doesn't interrupt modifications
        await requiringTable.removeHandlers();
        await Promise.all([
            modifyRequiringTableHeaders(requiringTable),
            modifyRequiringTableRows(requiringTable)
        ]);
        requiringTable.element.tablesorter({ sortList: [[2, 1]] });
    }
    //#region Files tab
    async function modifyDownloadButtons() {
        const downloadModal = $("download-modal");
        if (downloadModal.length === 0) {
            // old style
            const downloadButtons = $(".accordion-downloads a");
            downloadButtons.on("click", async (e) => {
                if (e.ctrlKey) {
                    open(e.target.href, "_self");
                }
            });
        }
        else {
            // new style
            downloadModal.each(function () {
                const thisDownloadModal = $(this);
                const downloadLinks = thisDownloadModal.attr("download-links");
                if (downloadLinks === undefined) {
                    console.error("download-modal has no download-links attr, the fuck?");
                    return;
                }
                const downloadLinksJson = JSON.parse(downloadLinks);
                const waitForDownloadButtons = setInterval(() => {
                    const shadowRoot = thisDownloadModal[0].shadowRoot;
                    if (shadowRoot === null)
                        return;
                    const downloadButtons = $("button", shadowRoot);
                    if (downloadButtons.length === 0)
                        return;
                    $(downloadButtons[0]).on("click", async (e) => {
                        if (e.ctrlKey) {
                            open(downloadLinksJson.vortexDownloadUrl, "_self");
                        }
                    });
                    $(downloadButtons[1]).on("click", async (e) => {
                        if (e.ctrlKey) {
                            open(downloadLinksJson.downloadUrl, "_self");
                        }
                    });
                    clearInterval(waitForDownloadButtons);
                }, 10);
            });
        }
    }
    async function modifyPopupRequirementsList() {
        // make the popup wider to fit longer mod names and notes
        $(".popup-mod-requirements").css({ "max-width": "75%" });
        // add the note from requirementsNotes to each mod's link
        $(".popup-mod-requirements li").each(function () {
            // local this - each mod's li
            const href = $("a", this).attr("href");
            if (href === undefined) {
                console.error(`Mod ${this} from requirements popup has href === undefined, the fuck?`);
                return;
            }
            const note = requirementsNotes.get(href) || "";
            const span = $("span", this);
            span.text(`${span.text()} [Notes: ${note}]`);
        });
    }
    /**
     * By modifying mod-file-download's attributes before it's contents exist (they load a bit later),
     * we can set values of mod-file-download's attributes to whatever we want to be used.
     * IMPORTANT: works unreliably because sometimes modifications are made too late.
     */
    async function modifyModFileDownloadAttributes() {
        // timeout-seconds determines how long you have to wait before download starts,
        // setting it to 0 eliminates waiting.
        $("mod-file-download").attr("timeout-seconds", 0);
        // maybe makes files downloadable w\o an account.
        $("mod-file-download").attr("user-is-logged-in", "true");
    }
    async function fileDownloadPageAction() {
        // trigger the slow download button on the download file page
        const waitForModFileDownloadShadowRoot = setInterval(() => {
            const modFileDownloadShadowRoot = $("mod-file-download")[0].shadowRoot;
            if (modFileDownloadShadowRoot === null)
                return;
            const slowDownloadButton = $("button:contains('Slow download')", modFileDownloadShadowRoot);
            if (slowDownloadButton.length !== 0) {
                slowDownloadButton.trigger("click");
                clearInterval(waitForModFileDownloadShadowRoot);
            }
        }, 10);
    }
    //#endregion Files tab
    //#region File Contents
    async function modifyFileContentsFileDirExpand(fileDirExpand, fileDir) {
        const childrenFileDirExpands = $("> .dir-expand", fileDir);
        const childrenFileDirs = $("> .file-dir", fileDir);
        const childrenFiles = $("> .file", fileDir).not(".dir-expand");
        fileDirExpand.text(`${fileDirExpand.text()} (${childrenFileDirs.length} folder(s), ${childrenFiles.length} file(s))`);
        for (let i = 0; i < childrenFileDirExpands.length; i++) {
            const childFileDirExpand = $(childrenFileDirExpands[i]);
            const childFileDir = $(childrenFileDirs[i]);
            modifyFileContentsFileDirExpand(childFileDirExpand, childFileDir);
        }
    }
    async function modifyFileContentsFileList() {
        const fileList = $(".file-list");
        const fileDirExpands = $("> .dir-expand", fileList);
        const fileDirs = $("> .file-dir", fileList);
        for (let i = 0; i < fileDirExpands.length; i++) {
            const fileDirExpand = $(fileDirExpands[i]);
            const fileDir = $(fileDirs[i]);
            modifyFileContentsFileDirExpand(fileDirExpand, fileDir);
        }
    }
    //#endregion
    async function handleRequiredByResponse(fetchArgsAndResponse) {
        // url to get required-by-table is like this https://www.nexusmods.com/api/games/1303/mods/1538/required-by?show_adult_content=1
        if (fetchArgsAndResponse.resourceURL.indexOf("required-by") === -1)
            return;
        await fetchArgsAndResponse.modifyResponseText(async (responseText) => {
            // wrap into div to get just one element instead of seven separate
            const responseElement = $(`<div>${responseText}</div>`);
            const requiringTable = new ModsTable($(".required-by-table", responseElement));
            await modifyRequiringTable(requiringTable);
            return responseElement.html();
        });
    }
    async function addFetchActions() {
        FetchInterceptor.addActionAfterSend(handleRequiredByResponse);
    }
    const AjaxCompleteRegexActions = new Map([
        [new RegExp(String.raw `https://file-metadata\.nexusmods\.com/file/nexus-files-s3-meta/\d+/\d+/.+`), async () => {
                modifyFileContentsFileList();
            }],
    ]);
    const AjaxCompleteTabActions = new Map([
        [Tabs.Description, async () => {
                requirementsTable = new ModsTable($("h3:contains('Nexus requirements') + table"));
                translationsTable = new ModsTable($(".translation-table"));
                getModStats(gameId, populateModsStats);
                populateRequirementsNotes();
            }],
        [Tabs.Files, async () => {
                if (isFileDownloadPage()) {
                    fileDownloadPageAction();
                    return;
                }
                modifyDownloadButtons();
            }],
    ]);
    const AjaxCompleteWidgetActions = new Map([
        ["ModRequirementsPopUp", async () => {
                modifyPopupRequirementsList();
            }],
    ]);
    async function addAjaxCompleteActions() {
        for (const [regex, action] of AjaxCompleteRegexActions.entries()) {
            AjaxCompleteActions.addRegexAction(regex, action);
        }
        for (const [tab, action] of AjaxCompleteTabActions.entries()) {
            const widgetRegex = new RegExp(String.raw `/Core/Libs/Common/Widgets/Mod${Tabs[tab]}Tab\?id=\d+&game_id=\d+`);
            AjaxCompleteActions.addRegexAction(widgetRegex, action);
        }
        for (const [widget, action] of AjaxCompleteWidgetActions.entries()) {
            const widgetRegex = new RegExp(String.raw `/Core/Libs/Common/Widgets/${widget}\?id=\d+&game_id=\d+`);
            AjaxCompleteActions.addRegexAction(widgetRegex, action);
        }
    }
    /**
     * called at the earliest possible point in script's runtime
     */
    async function onStart() {
        // called at earliest possible point
        FetchInterceptor.patchFetch();
        addFetchActions();
        if (isFileDownloadPage()) {
            const waitForModFileDownload = setInterval(() => {
                const modFileDownloadExists = document.getElementsByTagName("mod-file-download").length !== 0;
                if (modFileDownloadExists) {
                    modifyModFileDownloadAttributes();
                    clearInterval(waitForModFileDownload);
                }
            }, 10);
        }
    }
    async function afterLoad() {
        gameId = current_game_id;
        // called after load because requires JQuery
        AjaxCompleteActions.addAjaxCompleteHandler();
        addAjaxCompleteActions();
        // call the action for selected tab on load if the action exists
        const selectedTab = getSelectedTab();
        const tabAction = AjaxCompleteTabActions.get(selectedTab);
        if (tabAction !== undefined) {
            tabAction();
        }
        populateModsStats();
    }
    onStart();
    // jQuery 2.2.0 used by nexus can't use async in $()
    // $(() => afterLoad());
    if (document.readyState === "complete")
        afterLoad();
    else
        document.addEventListener("DOMContentLoaded", afterLoad);
})();
