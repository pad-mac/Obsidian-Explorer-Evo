# Grid Explorer — Native Navigation Rewrite

This fork changes Grid Explorer from a mini-browser with a private back/forward stack into a normal navigable Obsidian view.

## Core behavior

- `GridView` opts into Obsidian navigation with `navigation = true`.
- Folder/mode/search changes are represented by the leaf's `ViewState` and can become native Back/Forward entries.
- A normal note click opens the note in the same `WorkspaceLeaf`, so native Back returns to the exact Grid Explorer state.
- Opening Grid Explorer from a note directly to a folder/mode is atomic; it does not insert an artificial Grid-root history entry first.
- The old `recentSources` / `futureSources` stacks and custom Alt+Left / Alt+Right interception are removed.
- The custom Grid back/forward header buttons are removed; Obsidian owns navigation UI/hotkeys.

## Embedded note preview

The old "show note inside grid" behavior is intentionally disabled:

- saved settings are forced off during settings load;
- the settings controls/menu entries are removed;
- folder frontmatter cannot re-enable it;
- any lingering internal call to `showNoteInGrid()` opens the note natively in the same leaf instead.

ZIP/media preview behavior was otherwise left alone.

## State compatibility

Grid Explorer 3.5.3 returned a nested `{ type, state }` object from `getState()`. This fork uses the normal flat view-state contract but accepts the old nested shape when restoring saved workspaces.

Backlinks and outgoing-links retain their target note path in state. Search query and search-scope flags are also part of the navigation state.

## Suggested manual smoke test

1. Open Grid Explorer at the vault root.
2. Enter folder A, then subfolder B.
3. Open a Markdown note normally.
4. Use Obsidian Back repeatedly: note -> B -> A -> root.
5. Use Forward repeatedly and verify the same states return.
6. Open Grid Explorer from a normal note via a folder/context command; one Back should return directly to that note (no intermediate root Grid state).
7. Test Backlinks and Outgoing Links from a note, then Back/Forward, and verify the target note name/results survive.
8. Verify Ctrl/Cmd-click and middle-click still open notes in new tabs.
9. Verify Alt+Left / Alt+Right are handled by Obsidian, not Grid Explorer.

## Validation performed here

- `git diff --check`: passed.
- TypeScript whole-source parse/transpile check (`noCheck`, because the container could not finish installing the project's dependencies): passed.
- Structural assertions confirming native history hooks exist and the old private history methods/stacks are gone: passed.

A normal `npm run build` should still be run in a complete local dependency environment before treating the fork as release-ready.

## v4: native bookmarks root home

- Removed the breadcrumb end fade mask.
- Added global `Use bookmarks in root` setting.
- When enabled at `/`, ordinary root files are replaced by the live native Bookmarks tree while root folders remain visible.
- Native bookmark groups render recursively as collapsible sections in native order.
- File bookmarks reuse normal Grid Explorer cards; native folder/search/URL bookmarks render as lightweight action cards.
- Added a distinct pinned Recent files launcher above the bookmark tree.
- Added `Bookmark this folder` to the native pane menu. It creates/reuses a root-level Grid Explorer folder redirect note and bookmarks that note through Obsidian's core Bookmarks plugin.


## v5 bookmark-root refinements

- Fixed native bookmark hierarchy rendering by preferring the core Bookmarks plugin's hierarchical `items` tree over `getBookmarks()`, which may be flattened and caused grouped entries to render twice.
- Added global **Always minimize bookmarks in root** setting, isolated from ordinary folder min-mode behavior.
- Made the Recent files launcher compact and removed its pin glyph.
- Removed redundant bookmark-folder icons; nested group structure + chevrons now carry hierarchy visually.

## v7 – Full view + state/layout fixes
- Added a folder-only **Full view** toggle in the command palette and native pane menu.
- Full view renders Markdown notes read-only in a centered, readable-width stream with file-title separators.
- Performance: first 10 notes render immediately; later batches of 10 are triggered by an IntersectionObserver before the sentinel reaches the viewport, with animation-frame yields between documents.
- Full view is a display state, not part of the native navigation history key.
- Native bookmark-root group collapse state is serialized with GridView state and saved with workspace layout, but likewise does not create navigation history entries.
- Removed the unused flexible native title spacer so the persistent Grid Explorer breadcrumb can consume all remaining header width before falling back to horizontal scrolling.

## v8 – Full-view navigation polish + durable bookmark UI state
- Full view now exits automatically when Grid Explorer navigates to another folder/mode; opening a note still preserves Full view for native Back.
- Added a dedicated Full-view header button immediately after Search while retaining the pane-menu toggle.
- Full view keeps a session-only scroll position per folder and restores enough lazy batches to return near the same place after opening a note and navigating Back.
- `.base` files render as lightweight placeholders in Full view.
- Embedded Bases are suppressed before Markdown rendering for both `![[File.base]]` transclusions and inline fenced `base` blocks.
- Root bookmark-group collapse state is stored directly in plugin data rather than workspace view state.
- Native pane actions are explicitly anchored to the right edge while the breadcrumb uses the remaining width and remains horizontally scrollable when necessary.
