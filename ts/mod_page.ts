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

    async function getGameId(): Promise<string> {
        return $("quick-search").attr("game-id");
    }

    enum Tabs {
        DESCRIPTION = "DESCRIPTION",
        FILES = "FILES",
        IMAGES = "IMAGES",
        VIDEOS = "VIDEOS",
        ARTICLES = "ARTICLES",
        DOCUMENTATION = "DOCUMENTATION",
        POSTS = "POSTS",
        BUGS = "BUGS",
        ACTIONS = "ACTIONS",
        STATS = "STATS"
    }

    async function getSelectedTab(): Promise<Tabs> {
        return Tabs[$(".modtabs li").has("a.selected").attr("id").split("-").at(-1).toUpperCase()];
    }

    async function getRequirementsTable(): Promise<JQuery<HTMLElement>> {
        // looking for text seems error-prone
        return $("h3:contains('Nexus requirements') + table");
    }

    async function getRequirementsTableHead(): Promise<JQuery<HTMLElement>> {
        return $("thead", await getRequirementsTable());
    }

    async function getRequirementsTableBody(): Promise<JQuery<HTMLElement>> {
        return $("tbody", await getRequirementsTable());
    }

    async function getRequirementsTableRows(): Promise<JQuery<HTMLElement>> {
        return $("tr", await getRequirementsTableBody());
    }

    async function getRequiringTable(): Promise<JQuery<HTMLElement>> {
        return $("h3:contains('Mods requiring this file') + table");
    }

    async function getRequiringTableHead(): Promise<JQuery<HTMLElement>> {
        return $("thead", await getRequiringTable());
    }

    async function getRequiringTableBody(): Promise<JQuery<HTMLElement>> {
        return $("tbody", await getRequiringTable());
    }

    async function getRequiringTableRows(): Promise<JQuery<HTMLElement>> {
        return $("tr", await getRequiringTableBody());
    }

    class RequiringMod {
        rowElement: JQuery<HTMLElement>
        href: string
        id: number

        constructor(requiringRow: JQuery<HTMLElement>) {
            this.rowElement = requiringRow;
            this.href = $("a", this.rowElement).attr("href");
            this.id = parseInt(this.href.split("/").at(-1));
        }
    }

    async function getRequiringMods(): Promise<RequiringMod[]> {
        const requiringRows = await getRequiringTableRows();
        const requiringMods = requiringRows.map(function () { return new RequiringMod($(this)); }).get();
        return requiringMods;
    }

    async function getTranslationsLinks(): Promise<string[]> {
        return $(".table-translation-name > a").map(function () { return $(this).attr("href"); }).get();
    }

    async function hideTranslations(requiringMods: RequiringMod[]): Promise<void> {
        const translationsLinks = await getTranslationsLinks();
        let hiddenCount = 0;
        for (const mod of requiringMods) {
            if (translationsLinks.includes(mod.href)) {
                mod.rowElement.attr("hidden", "");
                hiddenCount++;
            }
        };
        console.log(`Finished removing translations, removed ${hiddenCount} translations`);
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

    async function getModsStats(): Promise<Map<number, ModStats>> {
        const gameId = await getGameId();
        // this csv gets fetched earlier anyway so using it should have no additional cost
        const statsText = await (await fetch(`https://staticstats.nexusmods.com/live_download_counts/mods/${gameId}.csv`)).text();
        const stats = new Map();
        statsText.split("\n").forEach((modStatsLine) => {
            // each line in csv is id,uniqueDLs,totalDLs,totalViews
            const modStatsArray = modStatsLine.split(",");
            const modStats = new ModStats(parseInt(modStatsArray[0]), parseInt(modStatsArray[2]), parseInt(modStatsArray[1]), parseInt(modStatsArray[3]));
            stats[modStats.id] = modStats;
        });
        return stats;
    }

    async function modifyRequiringModsRows(requiringMods: RequiringMod[]) {
        const stats = await getModsStats();
        const $uniqueDLsDataTemplate = $("<td class='table-require-uniqueDLs'></td>");
        const $totalDLsDataTemplate = $("<td class='table-require-uniqueDLs'></td>");
        const $totalViewsDataTemplate = $("<td class='table-require-uniqueDLs'></td>");

        for (const mod of requiringMods) {
            let stat = stats[mod.id];
            if (stat === undefined) {
                console.log(`Stats for the mod with id=${mod.id} aren't in the csv file, substituting with 0`);
                stat = new ModStats(mod.id, 0, 0, 0);
            }
            const $uniqueDLsData = $uniqueDLsDataTemplate.clone().text(stat.uniqueDLs);
            const $totalDLsData = $totalDLsDataTemplate.clone().text(stat.totalDLs);
            const $totalViewsData = $totalViewsDataTemplate.clone().text(stat.totalViews);
            mod.rowElement.append($uniqueDLsData, $totalDLsData, $totalViewsData);
        };
    }

    async function modifyRequiringTableHead(): Promise<void> {
        const $tableHead = await getRequiringTableHead();
        // tr gets replaced with its clone to remove all events from the tablesorter
        const $tableHeadRow = $("tr", $tableHead);
        $tableHeadRow.replaceWith($tableHeadRow.clone());

        const $uniqueDLsHead = $("<th class='table-require-uniqueDLs header' style='width: 12.5%'><span class='table-header'>Unique DLs</span></th>");
        const $totalDLsHead = $("<th class='table-require-totalDLs header' style='width: 12.5%'><span class='table-header'>Total DLs</span></th>");
        const $totalViewsHead = $("<th class='table-require-totalViews header' style='width: 12.5%'><span class='table-header'>Total Views</span></th>");

        $("tr", $tableHead).append($uniqueDLsHead, $totalDLsHead, $totalViewsHead);
    }

    async function modifyRequiringTableRows(): Promise<void> {
        const requiringMods = await getRequiringMods();
        hideTranslations(requiringMods);
        await modifyRequiringModsRows(requiringMods);
    }

    async function modifyRequiringTable(): Promise<void> {
        let $table = await getRequiringTable();
        // table gets replaced with its clone to remove all events from the tablesorter
        const $newTable = $table.clone();
        $table.replaceWith($newTable);
        $table = $newTable;
        await modifyRequiringTableHead();
        await modifyRequiringTableRows();
        // @ts-ignore
        $table.tablesorter({ sortList: [[2, 1]] });
    }

    var requirementsNotes = {};
    async function populateRequirementsNotes(): Promise<void> {
        const requirements = await getRequirementsTableRows();
        requirements.each(function () {
            const href = $("a", this).attr("href");
            const note = $(".table-require-notes", this).text();
            requirementsNotes[href] = note;
        });
    }

    async function modifyPopupRequirementsList(): Promise<void> {
        $(".popup-mod-requirements li").each(function () {
            const href = $("a", this).attr("href");
            const note = requirementsNotes[href] || "";
            const span = $("span", this);
            span.text(`${span.text()} [Notes: ${note}]`);
        });
    }

    var lastTab: Tabs;
    async function patchKillLoader(): Promise<void> {
        // killLoader function is used when some content has loaded, it could be a tab or a popup or some other shit fuck if i know
        /* global killLoader:writable */ // to make the linter shut up about not knowing killLoader and overriding a native variable
        // @ts-ignore
        const originalKillLoader = killLoader;
        // @ts-ignore
        killLoader = () => {
            originalKillLoader();
            getSelectedTab().then((tab) => {
                if (tab !== lastTab) {
                    const e = new $.Event("tabLoaded");
                    console.debug(`Changed tab to ${tab}`);
                    $(document).trigger(e, [ tab ]);
                }
                else {
                    const e = new $.Event("contentLoaded");
                    console.debug(`Fired contentLoaded`);
                    $(document).trigger(e);
                }
                lastTab = tab;
            });
        };
    }

    async function main(): Promise<void> {
        lastTab = await getSelectedTab();
        patchKillLoader();

        $(document).on("tabLoaded", async (_, tab) => {
            if (tab === Tabs.DESCRIPTION) {
                modifyRequiringTable();
                populateRequirementsNotes();
            }
        });

        $(document).on("contentLoaded", async () => {
            $(".popup-mod-requirements").css({ "max-width": "75%" });
            modifyPopupRequirementsList();
        });

        $("#slowDownloadButton").trigger("click");

        const e = new $.Event("tabLoaded");
        $(document).trigger(e, [ lastTab ]);
    }

    // jQuery 2.2.0 used by nexus can't use async in $()
    $(() => main().then());
})();