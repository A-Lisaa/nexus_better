// ==UserScript==
// @name         Nexus Better Mods List
// @namespace    http://tampermonkey.net/
// @version      2025-07-30
// @description  Nya
// @author       A-Lisa
// @match        *://www.nexusmods.com/games/*/mods*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=nexusmods.com
// @grant        none
// @run-at document-start
// @require https://code.jquery.com/jquery-2.2.0.min.js
// ==/UserScript==

// we use jquery 2.2.0 to be consistent with the version used on a mod page

/* global $ */

(() => {
    "use strict";

    let modsDict = {};

    async function createListLoadedEvent() {
        const interval = setInterval(() => {
            const mods = $("[data-e2eid='mod-tile']");
            if (mods.length !== 0) {
                const e = new $.Event("modsListLoaded");
                $(document).trigger(e, [ mods ]);
                clearInterval(interval);
            }
        }, 100)
    }

    async function patchFetch(responseProcessors) {
        const originalFetch = fetch;
        fetch = async (resource, options) => {
            console.debug("Called fetch with:\nresource =", resource, "\noptions =", options);

            const response = await originalFetch(resource, options);

            const processors = responseProcessors[resource];
            if (processors !== undefined) {
                for (const processor of processors) {
                    processor(response.clone());
                }
            }

            return response;
        }
    }

    async function processApiRouterResponse(result) {
        const json = await result.json();
        const data = json.data;
        const modsList = data.mods.nodes;
        for (const mod of modsList) {
            modsDict[mod.modId] = mod;
        }
    }

    async function addModsDownloadDate() {
        // TODO: support for compact and list
        const downloadedMods = $("[data-e2eid='mod-tile-downloaded']");
        downloadedMods.each((index, element) => {
            const a = $(element).parent().parent().prev();
            const modId = a.attr("href").split("/").at("-1");
            const dateDownloaded = new Date(modsDict[modId].viewerDownloaded);
            const localeDate = new Intl.DateTimeFormat().format(dateDownloaded);
            $(element).append(`<span class="text-neutral-inverted">${localeDate}</span>`);
        });
    }

    async function main() {
    }

    createListLoadedEvent();
    patchFetch({
        "https://api-router.nexusmods.com/graphql": [processApiRouterResponse]
    });
    $(document).on("modsListLoaded", addModsDownloadDate);
})();