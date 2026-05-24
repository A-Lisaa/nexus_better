# nexus_better

Makes Nexus Mods a tiny bit better by adding new features or modifying existing ones.

Current modifications:

- Mod Page (mod_page.ts)
  - Removes mods that are already in "Translations" table from "Mods using this mod" table
  - Adds stats (unique downloads, total download, total views) to each mod in "Mods using this mod" table
  - Adds notes from the requirements table on the description page to "additional files required" popup when downloading a file (**Limitation: must have visited the description page after last load/reload of the mod page**)
  - Allows skipping the "Additional files required" popup if the download button is clicked while holding Ctrl
  - Removes the timer before file gets downloaded (*Works unreliably*)
  - Automatically clicks the "Slow download" button
- Mods List (mods_list.ts) **DEPRECATED FOR NOW**
  - Adds the date when a mod was last downloaded to each mod's tile
