import { App, TFile, TFolder, normalizePath } from 'obsidian';

export interface NativeBookmarkItem {
    type: string;
    path?: string;
    title?: string;
    items?: NativeBookmarkItem[];
    query?: string;
    url?: string;
    subpath?: string;
    ctime?: number;
}

interface NativeBookmarksInstance {
    items?: NativeBookmarkItem[];
    getBookmarks?: () => NativeBookmarkItem[];
    addItem?: (item: NativeBookmarkItem, parentGroup?: NativeBookmarkItem) => void;
    onItemsChanged?: (save?: boolean) => void;
    requestSave?: () => void;
    saveData?: () => void;
}

interface NativeBookmarksEntry {
    enabled?: boolean;
    instance?: NativeBookmarksInstance;
}

interface AppWithBookmarksInternal {
    internalPlugins?: {
        plugins?: {
            bookmarks?: NativeBookmarksEntry;
        };
    };
}

export function getNativeBookmarksInstance(app: App): NativeBookmarksInstance | null {
    const entry = (app as AppWithBookmarksInternal).internalPlugins?.plugins?.bookmarks;
    if (!entry?.enabled || !entry.instance) return null;
    return entry.instance;
}

export function getNativeBookmarkItems(app: App): NativeBookmarkItem[] {
    const instance = getNativeBookmarksInstance(app);
    if (!instance) return [];
    try {
        // instance.items is the canonical hierarchical tree used by the native Bookmarks UI.
        // getBookmarks() may return a flattened traversal on some Obsidian versions, which
        // would make grouped entries appear both at root and inside their groups.
        const items = instance.items ?? instance.getBookmarks?.() ?? [];
        return Array.isArray(items) ? items : [];
    } catch (error) {
        console.error('GridExplorer: failed to read native bookmarks', error);
        return [];
    }
}

function persistNativeBookmarks(instance: NativeBookmarksInstance): void {
    if (typeof instance.onItemsChanged === 'function') {
        instance.onItemsChanged(true);
    } else if (typeof instance.requestSave === 'function') {
        instance.requestSave();
    } else if (typeof instance.saveData === 'function') {
        instance.saveData();
    }
}

export function isFileInNativeBookmarks(app: App, filePath: string): boolean {
    const walk = (items: NativeBookmarkItem[]): boolean => items.some(item => {
        if (item?.type === 'file' && item.path === filePath) return true;
        return item?.type === 'group' && Array.isArray(item.items) ? walk(item.items) : false;
    });
    return walk(getNativeBookmarkItems(app));
}

/**
 * Add a file bookmark at the native Bookmarks root level.
 *
 * Obsidian does not expose Bookmarks mutation through the public API. This is
 * deliberately guarded around the core plugin's current addItem/items and
 * onItemsChanged/requestSave internals so a future API change fails softly.
 */
export function addFileToNativeBookmarks(app: App, file: TFile): boolean {
    const instance = getNativeBookmarksInstance(app);
    if (!instance) return false;

    try {
        if (isFileInNativeBookmarks(app, file.path)) return false;

        const item: NativeBookmarkItem = {
            type: 'file',
            path: file.path,
            ctime: Date.now(),
        };

        const rootItems = instance.items;
        if (typeof instance.addItem === 'function') {
            instance.addItem(item);
        } else if (Array.isArray(rootItems)) {
            rootItems.push(item);
        } else {
            return false;
        }

        persistNativeBookmarks(instance);
        return true;
    } catch (error) {
        console.error(`GridExplorer: failed to add native bookmark for ${file.path}`, error);
        return false;
    }
}

export function findRootFolderShortcut(app: App, folderPath: string): TFile | null {
    const normalizedTarget = normalizePath(folderPath);
    const root = app.vault.getRoot();
    for (const child of root.children) {
        if (!(child instanceof TFile) || child.extension !== 'md') continue;
        const frontmatter = app.metadataCache.getFileCache(child)?.frontmatter;
        if (frontmatter?.type !== 'folder' || typeof frontmatter.redirect !== 'string') continue;
        if (normalizePath(frontmatter.redirect) === normalizedTarget) return child;
    }
    return null;
}

export function findBookmarkedFolderShortcut(app: App, folderPath: string): TFile | null {
    const normalizedTarget = normalizePath(folderPath);
    let result: TFile | null = null;

    const walk = (items: NativeBookmarkItem[]) => {
        for (const item of items) {
            if (result) return;
            if (item?.type === 'file' && item.path) {
                const file = app.vault.getAbstractFileByPath(item.path);
                if (!(file instanceof TFile) || file.extension !== 'md') continue;
                const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
                if (frontmatter?.type === 'folder' && typeof frontmatter.redirect === 'string' &&
                    normalizePath(frontmatter.redirect) === normalizedTarget) {
                    result = file;
                    return;
                }
            } else if (item?.type === 'group' && Array.isArray(item.items)) {
                walk(item.items);
            }
        }
    };

    walk(getNativeBookmarkItems(app));
    return result;
}

export function resolveBookmarkedFile(app: App, item: NativeBookmarkItem): TFile | null {
    if (item.type !== 'file' || !item.path) return null;
    const file = app.vault.getAbstractFileByPath(item.path);
    return file instanceof TFile ? file : null;
}

export function resolveBookmarkedFolder(app: App, item: NativeBookmarkItem): TFolder | null {
    if (item.type !== 'folder' || !item.path) return null;
    const folder = app.vault.getAbstractFileByPath(item.path);
    return folder instanceof TFolder ? folder : null;
}
