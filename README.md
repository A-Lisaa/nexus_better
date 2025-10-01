# nexus_better

Makes Nexus Mods a tiny bit better by adding new features or modifying existing ones.

Current modifications:

- Mod Page (mod_page.ts)
  - Adds stats (unique downloads, total download, total views) to each mod in the table of mods requiring this file on the description page
  - Adds notes from the requirements table on the description page to "additional files required" popup when downloading a file (**Limitation: must have visited the description page after last load/reload of the mod page**)
  - Allows skipping the "additional files required" popup if the download button is clicked while holding Ctrl
  - Removes the timer before file gets downloaded
  - Automatically clicks the "slow download" button
- Mods List (mods_list.ts)
  - Adds the date when a mod was downloaded to each mod's tile
