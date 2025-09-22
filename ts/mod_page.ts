// ==UserScript==
// @name         Nexus Better Requiring List
// @namespace    http://tampermonkey.net/
// @version      2025-07-07
// @description  Nya
// @author       A-Lisa
// @match        https://www.nexusmods.com/*/mods/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=nexusmods.com
// @grant        none
// ==/UserScript==

(() => {
    "use strict";

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
    var gameId: number;
    var requirementsTable: ModsTable;
    var requiringTable: ModsTable;
    var translationsTable: ModsTable;
    // map of mod's id to it's stats
    const modsStats: Map<number, ModStats> = new Map();
    // map of mod's href to it's note in the requirements table
    const requirementsNotes: Map<string, string> = new Map();

    function selectedTab(): Tabs {
        return Tabs[$(".modtabs .selected .tab-label").text()];
    }

    async function setModsTables() {
        // looking for text seems error-prone
        requirementsTable = new ModsTable($("h3:contains('Nexus requirements') + table"));
        requiringTable = new ModsTable($("h3:contains('Mods requiring this file') + table"));
        translationsTable = new ModsTable($("h3:contains('Translations available on the Nexus') + table"));
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

    async function processDownloadCountResponse(response: Response): Promise<void> {
        const statsText = await response.text();
        // Papa exists on nexus
        // @ts-ignore
        await Papa.parse(statsText).data.forEach((modStatsArray: Array<string>) => {
            // each line in csv is id,totalDLs,uniqueDLs,totalViews
            const modStats = new ModStats(parseInt(modStatsArray[0]), parseInt(modStatsArray[2]), parseInt(modStatsArray[1]), parseInt(modStatsArray[3]));
            modsStats.set(modStats.id, modStats);
        });
    }

    async function modifyRequiringTableHeaders(): Promise<void> {
        const uniqueDLsHeader = $("<th class='table-require-uniqueDLs header' style='width: 12.5%'><span class='table-header'>Unique DLs</span></th>");
        const totalDLsHeader = $("<th class='table-require-totalDLs header' style='width: 12.5%'><span class='table-header'>Total DLs</span></th>");
        const totalViewsHeader = $("<th class='table-require-totalViews header' style='width: 12.5%'><span class='table-header'>Total Views</span></th>");

        requiringTable.headers.append(uniqueDLsHeader, totalDLsHeader, totalViewsHeader);
    }

    async function modifyRequiringTableRows() {
        const translationsTableModsLinks = translationsTable.mods.map((mod) => mod.href);
        const uniqueDLsDataTemplate = $("<td class='table-require-uniqueDLs'></td>");
        const totalDLsDataTemplate = $("<td class='table-require-uniqueDLs'></td>");
        const totalViewsDataTemplate = $("<td class='table-require-uniqueDLs'></td>");

        const requiringTableMods = requiringTable.mods;
        let hiddenCount = 0;
        let showedStatsCount = 0;
        for (const mod of requiringTableMods) {
            if (translationsTableModsLinks.includes(mod.href)) {
                mod.hide();
                hiddenCount++;
            }
            else {
                // if stats aren't in the csv file (if it hasn't been updated yet for example), substitute them with 0
                const stats = modsStats.get(mod.id) || new ModStats(mod.id, 0, 0, 0);

                const uniqueDLsData = uniqueDLsDataTemplate.clone().text(stats.uniqueDLs);
                const totalDLsData = totalDLsDataTemplate.clone().text(stats.totalDLs);
                const totalViewsData = totalViewsDataTemplate.clone().text(stats.totalViews);

                mod.element.append(uniqueDLsData, totalDLsData, totalViewsData);
                showedStatsCount++;
            }
        };
        if (requiringTableMods.length !== hiddenCount + showedStatsCount) {
            console.warn(`Counts mismatch; Total requiring mods: ${requiringTableMods.length}; Hidden mods: ${hiddenCount}; Showed stats for mods: ${showedStatsCount}`);
        }
    }

    async function modifyRequiringTable(): Promise<void> {
        // call resetHandlers earlier so that it doesn't interrupt modifications
        await requiringTable.removeHandlers();
        await Promise.all([
            modifyRequiringTableHeaders(),
            modifyRequiringTableRows()
        ]);
        // tablesorter exists in the nexus's jQuery
        // @ts-ignore
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

    async function afterLoad(): Promise<void> {
        gameId = parseInt($("quick-search").attr("game-id"));

        const widgetActionMap: Map<string, () => void> = new Map([
            ["ModDescriptionTab", async () => {
                await Promise.all([
                    setModsTables(),
                    fetch(`https://staticstats.nexusmods.com/live_download_counts/mods/${gameId}.csv`).then(processDownloadCountResponse)
                ]);
                modifyRequiringTable();
                populateRequirementsNotes();
            }],
            ["ModFilesTab", async () => {
                modifyDownloadButtons();
            }],
            ["ModRequirementsPopUp", async () => {
                modifyPopupRequirementsList();
            }]
        ]);

        $(document).on("ajaxComplete", (e, xhr: JQuery.jqXHR, settings: JQuery.PlainObject) => {
            const url: string = settings.url;
            const widget = url.substring(url.lastIndexOf("/") + 1, url.indexOf("?"));
            const action = widgetActionMap.get(widget);
            if (action !== undefined) {
                action();
            }
        });

        // call the action for selected tab if it exists
        const action = widgetActionMap.get(`Mod${Tabs[selectedTab()]}Tab`);
        if (action !== undefined) {
            action();
        }

        // trigger the slow download button on the download file page
        const fileDownloadRoot = $("mod-file-download")[0].shadowRoot;
        const slowDownloadButton = $("button:contains('Slow download')", fileDownloadRoot);
        slowDownloadButton.trigger("click");
    }

    // jQuery 2.2.0 used by nexus can't use async in $()
    $(() => afterLoad());
})();