// ==UserScript==
// @name         Nexus Better Requiring List
// @namespace    http://tampermonkey.net/
// @version      2025-10-02
// @description  Nya
// @author       A-Lisa
// @match        https://www.nexusmods.com/*/mods/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=nexusmods.com
// @grant        none
// ==/UserScript==

// current_game_id is a global number representing current game id (duh), for example 1704 for Skyrim SE
declare var current_game_id: number;
// GlobalModStats is a global object where property name is mod id and property value is stats, for example for Skyrim SE
// {1704: {0: {}}}
declare var GlobalModStats: object;

declare function getModStats(gameId: number, completeCallback: () => void): void;

interface JQuery {
    // nexus' tablesorter: https://github.com/christianbach/tablesorter
    tablesorter(settings: object): JQuery;
}

(() => {
    "use strict";

    class Utils {
        // string
        static capitalize(str: string): string {
            return str.at(0).toUpperCase() + str.substring(1);
        }
    }

    enum Tabs {
        Description,
        Files,
        Images,
        Videos,
        Article,
        Documentation,
        Posts,
        Forum,
        Bug,
        Actions,
        Stats
    }

    class ModStats {
        id: number
        uniqueDLs: number
        totalDLs: number
        totalViews: number

        constructor(id: number, uniqueDLs: number, totalDLs: number, totalViews: number) {
            this.id = id;
            this.uniqueDLs = uniqueDLs;
            this.totalDLs = totalDLs;
            this.totalViews = totalViews;
        }
    }

    class ModRow {
        element: JQuery

        constructor(element: JQuery) {
            this.element = element;
        }

        get href(): string {
            return $("a", this.element).attr("href");
        }

        get id(): number {
            return parseInt(this.href.split("/").at(-1));
        }

        get stats(): ModStats {
            const stats = modsStats.get(this.id) || new ModStats(this.id, 0, 0, 0);
            return stats;
        }

        async hide(): Promise<void> {
            this.element.attr("hidden", "");
        }

        async remove(): Promise<void> {
            this.element.remove();
        }
    }

    class ModsTable {
        element: JQuery

        constructor(element: JQuery) {
            this.element = element;
        }

        get head(): JQuery {
            return $("thead", this.element);
        }

        get headers(): JQuery {
            return $("tr", this.head);
        }

        get body(): JQuery {
            return $("tbody", this.element);
        }

        get rows(): JQuery {
            return $("tr", this.body);
        }

        get mods(): Array<ModRow> {
            return this.rows.map(function () {
                // local this - each row
                return new ModRow($(this));
            }).get();
        }

        async removeHandlers(): Promise<void> {
            const newElement = this.element.clone();
            this.element.replaceWith(newElement);
            this.element = newElement;
        }
    }

    // practically consts
    var requirementsTable: ModsTable;
    var requiringTable: ModsTable;
    var translationsTable: ModsTable;
    const gameId: number = current_game_id;
    // map of mod's id to it's stats
    const modsStats: Map<number, ModStats> = new Map();
    // map of mod's href to it's note in the requirements table
    const requirementsNotes: Map<string, string> = new Map();

    function getSelectedTab(): Tabs {
        const url = new URL(window.location.href);
        const params = url.searchParams;
        // if there's no tab parameter, the tab is description
        const tab = params.get("tab") ?? "description";
        return Tabs[Utils.capitalize(tab)];
    }

    function isFileDownloadPage(): boolean {
        // file download page href is like this: https://www.nexusmods.com/skyrimspecialedition/mods/156952?tab=files&file_id=669963,
        // so if file_id exists it should be a file download page
        return new URL(window.location.href).searchParams.has("file_id");
    }

    async function setModsTables(): Promise<void> {
        // looking for text seems error-prone
        requirementsTable = new ModsTable($("h3:contains('Nexus requirements') + table"));
        requiringTable = new ModsTable($("h3:contains('Mods requiring this file') + table"));
        translationsTable = new ModsTable($("h3:contains('Translations available on the Nexus') + table"));
    }

    /**
     * Converts GlobalModStats object into a Map
     */
    async function populateModsStats(): Promise<void> {

        for (const modId in GlobalModStats[gameId]) {
            const modStats = GlobalModStats[gameId][modId];
            modsStats.set(parseInt(modId), new ModStats(modStats.id, modStats.unique, modStats.total, modStats.views));
        }
    }

    // call if tab is description
    async function populateRequirementsNotes(): Promise<void> {
        const requirements = requirementsTable.rows;
        requirements.each(function () {
            const href = $("a", this).attr("href");
            const note = $(".table-require-notes", this).text();
            requirementsNotes.set(href, note);
        });
    }

    // async function processDownloadCountResponse(response: Response): Promise<void> {
    //     const statsText = await response.text();
    //     await Papa.parse(statsText).data.forEach((modStatsArray: Array<string>) => {
    //         // each line in csv is id,totalDLs,uniqueDLs,totalViews
    //         const modStats = new ModStats(parseInt(modStatsArray[0]), parseInt(modStatsArray[2]), parseInt(modStatsArray[1]), parseInt(modStatsArray[3]));
    //         modsStats.set(modStats.id, modStats);
    //     });
    // }

    async function modifyRequiringTableHeaders(): Promise<void> {
        const uniqueDLsHeader = $("<th class='table-require-uniqueDLs header'><span class='table-header'>Unique DLs</span></th>");
        const totalDLsHeader = $("<th class='table-require-totalDLs header'><span class='table-header'>Total DLs</span></th>");
        const totalViewsHeader = $("<th class='table-require-totalViews header'><span class='table-header'>Total Views</span></th>");

        requiringTable.headers.append(uniqueDLsHeader, totalDLsHeader, totalViewsHeader);
    }

    async function modifyRequiringTableMod(mod: ModRow, translationsTableModsLinks: Array<string>): Promise<void> {
        if (translationsTableModsLinks.includes(mod.href)) {
            mod.hide();
            // don't return here because adding data to hidden mods resolves some issues when the table is empty
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

    async function modifyRequiringTableRows(): Promise<void> {
        const translationsTableModsLinks = translationsTable.mods.map((mod) => mod.href);

        const promises = [];
        const requiringTableMods = requiringTable.mods;
        for (const mod of requiringTableMods) {
            promises.push(modifyRequiringTableMod(mod, translationsTableModsLinks));
        }
        await Promise.all(promises);
    }

    async function modifyRequiringTable(): Promise<void> {
        // remove handlers earlier so that it doesn't interrupt modifications
        await requiringTable.removeHandlers();
        await Promise.all([
            modifyRequiringTableHeaders(),
            modifyRequiringTableRows()
        ]);
        requiringTable.element.tablesorter({ sortList: [[2, 1]] });
    }

    async function modifyDownloadButtons(): Promise<void> {
        const downloadButtons = $(".accordion-downloads a");
        downloadButtons.on("click", async (e: JQuery.ClickEvent) => {
            if (e.ctrlKey) {
                open(e.target.href, "_self");
            }
        });
    }

    async function modifyPopupRequirementsList(): Promise<void> {
        // make the popup wider to fit longer mod names and notes
        $(".popup-mod-requirements").css({ "max-width": "75%" });
        // add the note from requirementsNotes to each mod's link
        $(".popup-mod-requirements li").each(function () {
            // local this - each mod's li
            const href = $("a", this).attr("href");
            const note = requirementsNotes.get(href) || "";
            const span = $("span", this);
            span.text(`${span.text()} [Notes: ${note}]`);
        });
    }

    async function patchSetInterval(): Promise<void> {
        // patch setInterval to set timeout of 1 instead of 1000 (as is set in the countdown func), ugly and likely to have unintended consequences,
        // but it just works i.e. makes the countdown on download page instant
        const originalSetInterval = window.setInterval;
        window.setInterval = function (handler: TimerHandler, timeout?: number): number {
            if (timeout === 1000)
                timeout = 1;
            return originalSetInterval(handler, timeout, arguments);
        }
    }

    // TODO: make files downloadable w\o an account

    async function clickSlowDownloadButton(): Promise<void> {
        // trigger the slow download button on the download file page
        const fileDownloadRoot = $("mod-file-download")[0].shadowRoot;
        const slowDownloadButton = $("button:contains('Slow download')", fileDownloadRoot);
        slowDownloadButton.trigger("click");
    }

    async function fileDownloadPageAction(): Promise<void> {
        patchSetInterval();
        clickSlowDownloadButton();
    }

    //#region File Contents

    async function modifyFileContentsFileDirExpand(fileDirExpand: JQuery, fileDir: JQuery): Promise<void> {
        const childrenFileDirExpands = $("> .dir-expand", fileDir);
        const childrenFileDirs = $("> .file-dir", fileDir);
        const childrenFiles = $("> .file", fileDir).not(".dir-expand");

        fileDirExpand.text(`${fileDirExpand.text()} (${childrenFileDirs.length} folder(s), ${childrenFiles.length} file(s))`)

        for (let i = 0; i < childrenFileDirExpands.length; i++) {
            const childFileDirExpand = $(childrenFileDirExpands[i]);
            const childFileDir = $(childrenFileDirs[i]);
            modifyFileContentsFileDirExpand(childFileDirExpand, childFileDir);
        }
    }

    async function modifyFileContentsFileList(): Promise<void> {
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

    const TabActions: Map<Tabs, () => void> = new Map([
        [Tabs.Description, async () => {
            setModsTables();
            getModStats(gameId, populateModsStats);
            populateRequirementsNotes();

            //await fetch(`https://staticstats.nexusmods.com/live_download_counts/mods/${gameId}.csv`).then(processDownloadCountResponse);
            modifyRequiringTable();
        }],
        [Tabs.Files, async () => {
            if (isFileDownloadPage()) {
                fileDownloadPageAction();
                return;
            }

            modifyDownloadButtons();
        }]
    ]);

    class AjaxCompleteActions {
        private static addedAjaxCompleteHandler: boolean = false;
        private static actions: Array<(e: JQuery.Event, xhr: JQuery.jqXHR, settings: JQuery.PlainObject) => void> = [];

        public static async addAction(action: (e: JQuery.Event, xhr: JQuery.jqXHR, settings: JQuery.PlainObject) => void): Promise<void> {
            this.actions.push(action);
        }

        public static async addRegexAction(regex: RegExp, action: () => void): Promise<void> {
            const func = async (e: JQuery.Event, xhr: JQuery.jqXHR, settings: JQuery.PlainObject) => {
                const url = settings.url;
                if (regex.test(url)) {
                    console.log(`Calling action for ${regex} on ${url}`);
                    action();
                }
            };
            this.addAction(func);
        }

        public static async addWidgetAction(widget: string, action: () => void): Promise<void> {
            const widgetRegex = new RegExp(String.raw`/Core/Libs/Common/Widgets/${widget}\?id=\d+&game_id=\d+`);
            this.addRegexAction(widgetRegex, action);
        }

        public static async addAjaxCompleteHandler(): Promise<void> {
            if (this.addedAjaxCompleteHandler) {
                console.warn("ajaxComplete handler has been added already, aborting");
                return;
            }

            $(document).on("ajaxComplete", (e: JQuery.Event, xhr: JQuery.jqXHR, settings: JQuery.PlainObject) => {
                for (const action of this.actions) {
                    action(e, xhr, settings);
                }
            });
        }
    }

    async function addAjaxCompleteActions(): Promise<void> {
        for (const [tab, action] of TabActions.entries()) {
            AjaxCompleteActions.addWidgetAction(`Mod${Tabs[tab]}Tab`, action);
        }

        AjaxCompleteActions.addWidgetAction("ModRequirementsPopUp", async () => {
            modifyPopupRequirementsList();
        });

        // preview file contents
        AjaxCompleteActions.addRegexAction(new RegExp(String.raw`https://file-metadata\.nexusmods\.com/file/nexus-files-s3-meta/\d+/\d+/.+`), async () => {
            modifyFileContentsFileList();
        });
    }

    /**
     * called when the script runs
     */
    async function onStart(): Promise<void> {
        AjaxCompleteActions.addAjaxCompleteHandler();
        addAjaxCompleteActions();
    }

    async function afterLoad(): Promise<void> {
        // call the action for selected tab on load if the action exists
        const selectedTab = getSelectedTab();
        const tabAction = TabActions.get(selectedTab);
        if (tabAction !== undefined) {
            tabAction();
        }

        populateModsStats();
    }

    onStart();
    // jQuery 2.2.0 used by nexus can't use async in $()
    $(() => afterLoad());
})();