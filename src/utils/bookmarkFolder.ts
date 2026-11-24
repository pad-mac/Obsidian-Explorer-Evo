import { App, Menu, Notice, TFolder } from 'obsidian';
import { t } from '../translations';
import { createShortcut } from './createItemUtils';
import {
    addFileToNativeBookmarks,
    findBookmarkedFolderShortcut,
    findRootFolderShortcut,
    getNativeBookmarksInstance,
    isFileInNativeBookmarks,
} from './bookmarkUtils';

/**
 * Bookmark a folder the Grid Explorer way: a tiny redirect shortcut note in the vault
 * root, stored in Obsidian's native Bookmarks core plugin, so folder bookmarks behave
 * exactly like file bookmarks in the root bookmark home.
 */
export async function bookmarkFolder(app: App, folderPath: string): Promise<void> {
    if (!getNativeBookmarksInstance(app)) {
        new Notice(t('bookmarks_plugin_disabled'));
        return;
    }

    const folder = app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder) || folder.path === '/') return;

    if (findBookmarkedFolderShortcut(app, folder.path)) {
        new Notice(t('folder_already_bookmarked'));
        return;
    }

    let shortcut = findRootFolderShortcut(app, folder.path);
    if (!shortcut) {
        shortcut = await createShortcut(app, '/', {
            type: 'folder',
            value: folder.path,
            display: folder.name,
        }, false);
    }
    if (!shortcut) return;

    if (addFileToNativeBookmarks(app, shortcut)) {
        new Notice(t('folder_bookmarked'));
    } else if (isFileInNativeBookmarks(app, shortcut.path)) {
        new Notice(t('folder_already_bookmarked'));
    } else {
        console.error(`GridExplorer: failed to bookmark folder shortcut ${shortcut.path}`);
    }
}

/** Adds "Bookmark this folder" to a folder context menu (no-op for the vault root). */
export function addBookmarkFolderMenuItem(menu: Menu, app: App, folderPath: string): void {
    if (!folderPath || folderPath === '/') return;
    menu.addItem((item) => {
        item.setTitle(t('bookmark_this_folder'))
            .setIcon('bookmark-plus')
            .onClick(() => {
                void bookmarkFolder(app, folderPath);
            });
    });
}
