import { App, TFile, Notice } from 'obsidian';
import { showNameInputModal } from '../modal/folderRenameModal';
import { t } from '../translations';

interface ShortcutFrontmatter {
    type?: 'mode' | 'folder' | 'file' | 'search' | 'uri';
    redirect?: string;
    searchCurrentLocationOnly?: boolean;
    searchFilesNameOnly?: boolean;
    searchMediaFiles?: boolean;
}

const DEFAULT_NEW_ITEM_NAME_PATTERN = 'YYYY-MM-DD_HH-mm';

interface AppWithCommunityPlugins {
    plugins?: {
        enabledPlugins?: Set<string>;
        plugins?: Record<string, unknown>;
        manifests?: Record<string, { name?: string }>;
    };
}

interface CommunityCommand {
    id?: string;
    name?: string;
}

interface AppWithCommunityRuntime extends AppWithCommunityPlugins {
    commands?: {
        commands?: Record<string, CommunityCommand>;
        executeCommandById?: (id: string) => boolean;
    };
}

export function isCommunityPluginEnabled(app: App, ids: string[], names: string[] = []): boolean {
    const pluginManager = (app as unknown as AppWithCommunityPlugins).plugins;
    if (!pluginManager) return false;

    const normalizedNames = new Set(names.map(name => name.toLowerCase()));
    for (const id of ids) {
        if (pluginManager.enabledPlugins?.has(id) || pluginManager.plugins?.[id]) return true;
    }

    if (normalizedNames.size > 0 && pluginManager.manifests) {
        for (const [id, manifest] of Object.entries(pluginManager.manifests)) {
            if (!(pluginManager.enabledPlugins?.has(id) || pluginManager.plugins?.[id])) continue;
            const name = manifest?.name?.toLowerCase();
            if (name && normalizedNames.has(name)) return true;
        }
    }

    return false;
}

function findEnabledCommunityPluginId(app: App, ids: string[], names: string[] = []): string | null {
    const pluginManager = (app as unknown as AppWithCommunityPlugins).plugins;
    if (!pluginManager) return null;

    for (const id of ids) {
        if (pluginManager.enabledPlugins?.has(id) || pluginManager.plugins?.[id]) return id;
    }

    const normalizedNames = new Set(names.map(name => name.toLowerCase()));
    if (normalizedNames.size > 0 && pluginManager.manifests) {
        for (const [id, manifest] of Object.entries(pluginManager.manifests)) {
            if (!(pluginManager.enabledPlugins?.has(id) || pluginManager.plugins?.[id])) continue;
            const name = manifest?.name?.toLowerCase();
            if (name && normalizedNames.has(name)) return id;
        }
    }

    return null;
}

function getEnabledCommunityPlugin<T>(app: App, ids: string[], names: string[] = []): T | null {
    const pluginId = findEnabledCommunityPluginId(app, ids, names);
    if (!pluginId) return null;
    const pluginManager = (app as unknown as AppWithCommunityPlugins).plugins;
    return (pluginManager?.plugins?.[pluginId] as T | undefined) ?? null;
}

async function waitForCreatedFile(
    app: App,
    beforePaths: Set<string>,
    timeoutMs = 3500,
    predicate: (file: TFile) => boolean = () => true,
): Promise<TFile | null> {
    return await new Promise<TFile | null>((resolve) => {
        let settled = false;
        let timer = 0;
        let ref: ReturnType<App['vault']['on']>;

        const finish = (file: TFile | null) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            app.vault.offref(ref);
            resolve(file);
        };

        ref = app.vault.on('create', (created) => {
            if (created instanceof TFile && !beforePaths.has(created.path) && predicate(created)) finish(created);
        });
        timer = window.setTimeout(() => {
            const created = app.vault.getFiles().find(file => !beforePaths.has(file.path) && predicate(file)) ?? null;
            finish(created);
        }, timeoutMs);
    });
}

function pad2(value: number): string {
    return value.toString().padStart(2, '0');
}

function formatNewItemName(pattern: string | undefined, date = new Date()): string {
    const source = pattern?.trim() || DEFAULT_NEW_ITEM_NAME_PATTERN;
    const replacements: Record<string, string> = {
        YYYY: date.getFullYear().toString(),
        YY: pad2(date.getFullYear() % 100),
        MM: pad2(date.getMonth() + 1),
        DD: pad2(date.getDate()),
        HH: pad2(date.getHours()),
        mm: pad2(date.getMinutes()),
        ss: pad2(date.getSeconds()),
    };

    const formatted = source.replace(/YYYY|YY|MM|DD|HH|mm|ss/g, token => replacements[token]);
    // Keep this a file-name pattern rather than a path pattern. Directory separators
    // would otherwise unexpectedly create nested paths.
    return formatted.replace(/[<>:"/\\|?*]/g, '-').trim() || t('untitled');
}

function getUniqueNewItemPath(app: App, folderPath: string, extension: string, namePattern?: string): string {
    const baseName = formatNewItemName(namePattern);
    let candidateName = `${baseName}.${extension}`;
    let candidatePath = !folderPath || folderPath === '/' ? candidateName : `${folderPath}/${candidateName}`;
    let counter = 1;

    while (app.vault.getAbstractFileByPath(candidatePath)) {
        candidateName = `${baseName} ${counter}.${extension}`;
        candidatePath = !folderPath || folderPath === '/' ? candidateName : `${folderPath}/${candidateName}`;
        counter++;
    }

    return candidatePath;
}

/**
 * 創建新筆記的共用函數
 * @param app Obsidian App 實例
 * @param folderPath 目標資料夾路徑
 */
export async function createNewNote(app: App, folderPath: string, namePattern?: string) {
    const newFilePath = getUniqueNewItemPath(app, folderPath, 'md', namePattern);

    try {
        const newFile = await app.vault.create(newFilePath, '');
        await app.workspace.getLeaf().openFile(newFile);
    } catch (error) {
        console.error('An error occurred while creating a new note:', error);
    }
}

/**
 * 創建新資料夾的共用函數
 * @param app Obsidian App 實例
 * @param folderPath 目標資料夾路徑
 * @param onSuccess 成功後的回調函數
 */
export async function createNewFolder(app: App, folderPath: string, onSuccess?: () => void) {
    // 預設名稱
    const defaultName = `${t('untitled')}`;

    // 先彈出名稱輸入框
    showNameInputModal(app, {
        title: t('new_folder'),
        description: t('enter_new_folder_name'),
        defaultValue: defaultName,
        onSubmit: (inputName: string) => {
            void (async () => {
                let baseName = (inputName && inputName.trim().length > 0) ? inputName.trim() : defaultName;
                let newFolderName = baseName;
                let newFolderPath = !folderPath || folderPath === '/' ? newFolderName : `${folderPath}/${newFolderName}`;

                // 檢查資料夾是否已存在，如果存在則遞增編號
                let counter = 1;
                while (app.vault.getAbstractFileByPath(newFolderPath)) {
                    newFolderName = `${baseName} ${counter}`;
                    newFolderPath = !folderPath || folderPath === '/' ? newFolderName : `${folderPath}/${newFolderName}`;
                    counter++;
                }

                try {
                    // 建立新資料夾
                    await app.vault.createFolder(newFolderPath);
                    // 執行成功回調
                    if (onSuccess) {
                        onSuccess();
                    }
                } catch (error) {
                    console.error('An error occurred while creating a new folder:', error);
                }
            })();
        },
    });
}

/**
 * 創建新畫布的共用函數
 * @param app Obsidian App 實例
 * @param folderPath 目標資料夾路徑
 */
export async function createNewCanvas(app: App, folderPath: string, namePattern?: string) {
    const newFilePath = getUniqueNewItemPath(app, folderPath, 'canvas', namePattern);

    try {
        const newFile = await app.vault.create(newFilePath, '');
        await app.workspace.getLeaf().openFile(newFile);
    } catch (error) {
        console.error('An error occurred while creating a new canvas:', error);
    }
}

/**
 * 創建新 base 檔案的共用函數
 * @param app Obsidian App 實例
 * @param folderPath 目標資料夾路徑
 */
export async function createNewBase(app: App, folderPath: string, namePattern?: string) {
    const newFilePath = getUniqueNewItemPath(app, folderPath, 'base', namePattern);

    try {
        const newFile = await app.vault.create(newFilePath, '');
        await app.workspace.getLeaf().openFile(newFile);
    } catch (error) {
        console.error('An error occurred while creating a new base:', error);
    }
}

/** Create a Kanban board through the installed Kanban plugin itself. */
export async function createNewKanban(app: App, folderPath: string, namePattern?: string) {
    interface KanbanPluginRuntime {
        newKanban?: (folder?: unknown) => Promise<void> | void;
    }

    try {
        const kanban = getEnabledCommunityPlugin<KanbanPluginRuntime>(
            app,
            ['obsidian-kanban', 'obsidian-kanban-am'],
            ['Kanban', 'Kanban AM'],
        );
        const folder = !folderPath || folderPath === '/'
            ? app.vault.getRoot()
            : app.vault.getAbstractFileByPath(folderPath);

        if (kanban?.newKanban && folder) {
            // Let Kanban create + open the board so its own view bookkeeping is correct,
            // then rename the created Markdown file to Grid Explorer's configured pattern.
            const beforePaths = new Set(app.vault.getFiles().map(file => file.path));
            const createdPromise = waitForCreatedFile(
                app,
                beforePaths,
                3500,
                file => file.extension.toLowerCase() === 'md',
            );
            await Promise.resolve(kanban.newKanban(folder));
            const createdFile = await createdPromise;
            if (createdFile) {
                const targetPath = getUniqueNewItemPath(app, folderPath, 'md', namePattern);
                if (createdFile.path !== targetPath) await app.fileManager.renameFile(createdFile, targetPath);
            }
            return;
        }

        // Fallback for compatible Kanban forks that do not expose newKanban().
        const newFilePath = getUniqueNewItemPath(app, folderPath, 'md', namePattern);
        const newFile = await app.vault.create(newFilePath, '---\n\nkanban-plugin: board\n\n---\n\n## To Do\n\n');
        await app.workspace.getLeaf().setViewState({ type: 'kanban', state: { file: newFile.path } });
    } catch (error) {
        new Notice('Failed to create Kanban board.');
        console.error('An error occurred while creating a new Kanban board:', error);
    }
}

/** Create a Smart Gantt timeline through the installed Smart Gantt fork itself. */
export async function createNewGantt(app: App, folderPath: string, namePattern?: string) {
    interface SmartGanttPluginRuntime {
        createTimeline?: () => Promise<void> | void;
        getCurrentMarkdownPath?: () => string;
        settings?: {
            scope?: string;
            folderPath?: string;
            zoom?: string;
            groupBy?: string;
            barColorMode?: string;
            showNames?: boolean;
            showDone?: boolean;
        };
    }

    try {
        const gantt = getEnabledCommunityPlugin<SmartGanttPluginRuntime>(
            app,
            ['smart-gantt'],
            ['Smart Gantt', 'Smart Gantt Custom'],
        );

        if (gantt?.createTimeline) {
            // Our Smart Gantt fork owns the .gantt schema and always opens newly-created
            // timelines correctly. Observe its file creation, then relocate/rename the file.
            const beforePaths = new Set(app.vault.getFiles().map(file => file.path));
            const createdPromise = waitForCreatedFile(
                app,
                beforePaths,
                5000,
                file => file.extension.toLowerCase() === 'gantt',
            );
            await Promise.resolve(gantt.createTimeline());
            const createdFile = await createdPromise;
            if (createdFile) {
                const targetPath = getUniqueNewItemPath(app, folderPath, 'gantt', namePattern);
                if (createdFile.path !== targetPath) await app.fileManager.renameFile(createdFile, targetPath);
                return;
            }
            new Notice('Smart Gantt did not create a timeline file.');
            return;
        }

        // Direct compatibility fallback for the current custom fork schema. The important
        // correction versus v10 is the registered extension: .gantt (not .smartgantt).
        const settings = gantt?.settings ?? {};
        const currentFilePath = gantt?.getCurrentMarkdownPath?.() ?? '';
        const config = {
            version: 1,
            scope: settings.scope ?? 'current',
            folderPath: settings.folderPath ?? '',
            currentFilePath,
            zoom: settings.zoom ?? 'day',
            groupBy: settings.groupBy ?? 'source',
            barColorMode: settings.barColorMode ?? 'status',
            showNames: !!settings.showNames,
            showDone: !!settings.showDone,
            toolbarVisible: true,
            collapsedLanes: [] as string[],
        };
        const newFilePath = getUniqueNewItemPath(app, folderPath, 'gantt', namePattern);
        const newFile = await app.vault.create(newFilePath, `${JSON.stringify(config, null, 2)}\n`);
        await app.workspace.getLeaf('tab').openFile(newFile);
    } catch (error) {
        new Notice('Failed to create Smart Gantt timeline.');
        console.error('An error occurred while creating a new Smart Gantt timeline:', error);
    }
}

/**
 * 創建捷徑檔案的共用函數
 * @param app Obsidian App 實例
 * @param folderPath 目標資料夾路徑
 * @param option 捷徑選項
 */
export async function createShortcut(
    app: App,
    folderPath: string,
    option: { 
        type: 'mode' | 'folder' | 'file' | 'search' | 'uri'; 
        value: string; 
        display: string;
        searchOptions?: {
            searchCurrentLocationOnly: boolean;
            searchFilesNameOnly: boolean;
            searchMediaFiles: boolean;
        };
    },
    showNotice = true
): Promise<TFile | null> {
    try {
        // 生成不重複的檔案名稱
        let counter = 0;
        let shortcutName: string;
        
        // 對於 URI 類型，使用特殊的檔名生成邏輯
        if (option.type === 'uri') {
            shortcutName = generateFilenameFromUri(option.value);
        } else {
            shortcutName = `${option.display}`;
        }

        let newName = `${shortcutName}.md`;
        let newPath = !folderPath || folderPath === '/' ? newName : `${folderPath}/${newName}`;
        while (app.vault.getAbstractFileByPath(newPath)) {
            counter++;
            const baseName = option.type === 'uri' ? generateFilenameFromUri(option.value) : option.display;
            shortcutName = `${baseName} ${counter}`;
            newName = `${shortcutName}.md`;
            newPath = !folderPath || folderPath === '/' ? newName : `${folderPath}/${newName}`;
        }

        // 創建新檔案
        const newFile = await app.vault.create(newPath, '');

        // 使用 processFrontMatter 來更新 frontmatter
        await app.fileManager.processFrontMatter(newFile, (frontmatter: ShortcutFrontmatter) => {
            if (option.type === 'mode') {
                frontmatter.type = 'mode';
                frontmatter.redirect = option.value;
            } else if (option.type === 'folder') {
                frontmatter.type = 'folder';
                frontmatter.redirect = option.value;
            } else if (option.type === 'file') {
                const targetFile = app.vault.getAbstractFileByPath(option.value);
                if (!(targetFile instanceof TFile)) {
                    return;
                }

                const link = app.fileManager.generateMarkdownLink(targetFile, "");
                frontmatter.type = "file";
                frontmatter.redirect = link;
            } else if (option.type === 'search') {
                frontmatter.type = 'search';
                frontmatter.redirect = option.value;
                // 添加搜尋選項到 frontmatter
                if (option.searchOptions) {
                    frontmatter.searchCurrentLocationOnly = option.searchOptions.searchCurrentLocationOnly;
                    frontmatter.searchFilesNameOnly = option.searchOptions.searchFilesNameOnly;
                    frontmatter.searchMediaFiles = option.searchOptions.searchMediaFiles;
                }
            } else if (option.type === 'uri') {
                frontmatter.type = 'uri';
                frontmatter.redirect = option.value;
            }
        });

        if (showNotice) new Notice(`${t('shortcut_created')}: ${shortcutName}`);
        return newFile;

    } catch (error) {
        console.error('Create shortcut error', error);
        new Notice(t('failed_to_create_shortcut'));
        return null;
    }
}

/**
 * 從 URI 生成檔案名稱
 * @param uri URI 字串
 * @returns 檔案名稱
 */
function generateFilenameFromUri(uri: string): string {
    try {
        // 處理 obsidian:// 協議
        if (uri.startsWith('obsidian://')) {
            const match = uri.match(/obsidian:\/\/([^?]+)/);
            let vaultName = '';
            
            // 嘗試提取 vault 參數
            const vaultMatch = uri.match(/[?&]vault=([^&]+)/);
            if (vaultMatch) {
                vaultName = decodeURIComponent(vaultMatch[1]);
                // 清理 vault 名稱，移除不適合檔名的字符
                vaultName = vaultName.replace(/[<>:"/\\|?*]/g, '_');
            }
            
            if (match) {
                const action = match[1];
                const vaultSuffix = vaultName ? ` (${vaultName})` : '';
                
                // 根據不同的 obsidian 動作生成檔名
                switch (action) {
                    case 'open':
                        return `🌐 Obsidian Open${vaultSuffix}`;
                    case 'new':
                        return `🌐 Obsidian New${vaultSuffix}`;
                    case 'search':
                        return `🌐 Obsidian Search${vaultSuffix}`;
                    case 'hook-get-address':
                        return `🌐 Obsidian Hook${vaultSuffix}`;
                    default:
                        return `🌐 Obsidian ${action}${vaultSuffix}`;
                }
            }
            return vaultName ? `🌐 Obsidian Link (${vaultName})` : '🌐 Obsidian Link';
        }
        
        // 處理 file:// 協議
        if (uri.startsWith('file://')) {
            const filename = uri.split('/').pop() || 'Local File';
            return `🌐 ${filename}`;
        }
        
        // 處理 http/https 協議
        if (uri.startsWith('http://') || uri.startsWith('https://')) {
            const url = new URL(uri);
            let domain = url.hostname;
            
            // 移除 www. 前綴
            if (domain.startsWith('www.')) {
                domain = domain.substring(4);
            }
            
            // 如果有路徑，嘗試提取有意義的部分
            if (url.pathname && url.pathname !== '/') {
                const pathParts = url.pathname.split('/').filter(part => part.length > 0);
                if (pathParts.length > 0) {
                    const lastPart = pathParts[pathParts.length - 1];
                    // 如果最後一部分看起來像檔名或有意義的標識符
                    if (lastPart.length < 50 && !lastPart.includes('?')) {
                        return `🌐 ${domain} - ${lastPart}`;
                    }
                }
            }
            
            return `🌐 ${domain}`;
        }
        
        // 其他協議的處理
        const protocolMatch = uri.match(/^([^:]+):/);
        if (protocolMatch) {
            const protocol = protocolMatch[1].toUpperCase();
            return `🌐 ${protocol} Link`;
        }
        
        // 如果不是標準 URI，直接使用前 30 個字符
        const cleanUri = uri.replace(/[<>:"/\\|?*]/g, '_').substring(0, 30);
        return `🌐 ${cleanUri}`;
        
    } catch {
        // 如果解析失敗，使用安全的預設名稱
        const cleanUri = uri.replace(/[<>:"/\\|?*]/g, '_').substring(0, 30);
        return `🌐 ${cleanUri}`;
    }
}
