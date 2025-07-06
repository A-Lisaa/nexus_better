// ==UserScript==
// @name         Nexus Better Requiring List
// @namespace    http://tampermonkey.net/
// @version      2025-07-06
// @description  Nya
// @author       A-Lisa
// @match        *://www.nexusmods.com/*/mods/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=nexusmods.com
// @grant        none
// ==/UserScript==

/* global $ */

(() => {
    "use strict";

    async function getGameId() {
        return $("quick-search").attr("game-id");
    }

    async function getSelectedTabId() {
        return $(".modtabs li").has("a.selected").attr("id");
    }

    async function getRequiringTable() {
        return $("h3:contains('Mods requiring this file') + table");
    }

    async function getRequiringTableHead() {
        return $("thead", await getRequiringTable());
    }

    async function getRequiringTableBody() {
        return $("tbody", await getRequiringTable());
    }

    async function getRequiringTableRows() {
        return $("tr", await getRequiringTableBody());
    }

    class RequiringMod {
        constructor($requiringRow) {
            this.$row = $requiringRow;
            this.href = $("a", this.$row).attr("href");
            this.id = parseInt(this.href.split("/").at(-1));
        }
    }

    async function getRequiringMods() {
        const $requiringRows = await getRequiringTableRows();
        const requiringMods = $requiringRows.map(function () { return new RequiringMod($(this)); }).get();
        return requiringMods;
    }

    async function getTranslationsLinks() {
        return $(".table-translation-name > a").map(function () { return $(this).attr("href"); }).get();
    }

    async function hideTranslations(requiringMods) {
        const translationsLinks = await getTranslationsLinks();
        let hiddenCount = 0;
        for (const mod of requiringMods) {
            if (translationsLinks.includes(mod.href)) {
                mod.$row.attr("hidden", "");
                hiddenCount++;
            }
        };
        console.log(`Finished removing translations, removed ${hiddenCount} translations`);
    }

    class ModStats {
        constructor(id, uniqueDLs, totalDLs, totalViews) {
            this.id = id;
            this.uniqueDLs = uniqueDLs;
            this.totalDLs = totalDLs;
            this.totalViews = totalViews;
        }
    }

    async function getModsStats() {
        const gameId = await getGameId();
        // this csv gets fetched earlier anyway so using it should have no additional cost
        const statsText = await (await fetch(`https://staticstats.nexusmods.com/live_download_counts/mods/${gameId}.csv`)).text();
        const stats = {};
        statsText.split("\n").forEach((modStatsLine) => {
            // each line in csv is id,uniqueDLs,totalDLs,totalViews
            const modStatsArray = modStatsLine.split(",");
            const modStats = new ModStats(parseInt(modStatsArray[0]), parseInt(modStatsArray[2]), parseInt(modStatsArray[1]), parseInt(modStatsArray[3]));
            stats[modStats.id] = modStats;
        });
        return stats;
    }

    async function modifyRequiringModsRows(requiringMods) {
        const stats = await getModsStats();
        const $uniqueDLsDataTemplate = $("<td class='table-require-uniqueDLs'></td>");
        const $totalDLsDataTemplate = $("<td class='table-require-uniqueDLs'></td>");
        const $totalViewsDataTemplate = $("<td class='table-require-uniqueDLs'></td>");

        for (const mod of requiringMods) {
            const stat = stats[mod.id];
            const $uniqueDLsData = $uniqueDLsDataTemplate.clone().text(stat.uniqueDLs);
            const $totalDLsData = $totalDLsDataTemplate.clone().text(stat.totalDLs);
            const $totalViewsData = $totalViewsDataTemplate.clone().text(stat.totalViews);
            mod.$row.append($uniqueDLsData, $totalDLsData, $totalViewsData);
        };
    }

    async function modifyRequiringTableHead() {
        const $tableHead = await getRequiringTableHead();
        // tr gets replaced with its clone to remove all events from the tablesorter
        const $tableHeadRow = $("tr", $tableHead);
        $tableHeadRow.replaceWith($tableHeadRow.clone());

        const $uniqueDLsHead = $("<th class='table-require-uniqueDLs header' style='width: 12.5%'><span class='table-header'>Unique DLs</span></th>");
        const $totalDLsHead = $("<th class='table-require-totalDLs header' style='width: 12.5%'><span class='table-header'>Total DLs</span></th>");
        const $totalViewsHead = $("<th class='table-require-totalViews header' style='width: 12.5%'><span class='table-header'>Total Views</span></th>");

        $("tr", $tableHead).append($uniqueDLsHead, $totalDLsHead, $totalViewsHead);
    }

    async function modifyRequiringTableRows() {
        const requiringMods = await getRequiringMods();
        hideTranslations(requiringMods);
        await modifyRequiringModsRows(requiringMods);
    }

    async function modifyRequiringTable() {
        let $table = await getRequiringTable();
        // table gets replaced with its clone to remove all events from the tablesorter
        const $newTable = $table.clone();
        $table.replaceWith($newTable);
        $table = $newTable;
        await modifyRequiringTableHead();
        await modifyRequiringTableRows();
        $table.tablesorter({ sortList: [[2, 1]] });
    }

    async function main() {
        // killLoader function is used when the tab content has loaded so using it as a trigger for modifying the table should be fine
        /* global killLoader:writable */ // to make the linter shut up about not knowing killLoader and overriding a native variable
        const originalKillLoader = killLoader;
        killLoader = () => {
            originalKillLoader();
            $(document).trigger("killLoaderUsed");
        };

        // tab on initial page load is description
        if ((await getSelectedTabId()) === "mod-page-tab-description") {
            modifyRequiringTable();
        }

        $(document).on("killLoaderUsed", async () => {
            if ((await getSelectedTabId()) === "mod-page-tab-description") {
                modifyRequiringTable();
            }
        });
    }

    // jQuery 2.2.0 used by nexus can't use async in $()
    $(() => main().then());
})();
