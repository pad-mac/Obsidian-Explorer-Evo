import { Menu, MenuItem, setIcon } from 'obsidian';
import type { GridView } from './GridView';
import { EXPLORER_VIEW_TYPE } from './ExplorerView';
import { showFolderSelectionModal } from './modal/folderSelectionModal';
import { showSearchModal } from './modal/searchModal';
import { ShortcutSelectionModal } from './modal/shortcutSelectionModal';
import { createNewNote, createNewFolder, createNewCanvas, createNewBase, createNewKanban, createNewGantt, isCommunityPluginEnabled, createShortcut as createShortcutUtil } from './utils/createItemUtils';
import { t } from './translations';

interface MenuItemWithSubmenu extends MenuItem {
    setSubmenu(): Menu;
}

function isMenuItemWithSubmenu(item: MenuItem): item is MenuItemWithSubmenu {
    return 'setSubmenu' in item && typeof (item as Record<string, unknown>).setSubmenu === 'function';
}

interface AppWithSettings {
    setting?: {
        open: () => void;
        openTabById: (id: string) => void;
    };
}

export function renderHeaderButton(gridView: GridView) {

    // Mount Grid Explorer actions into Obsidian's native view header.
    const nativeHeader = gridView.containerEl.querySelector(':scope > .view-header') as HTMLElement | null;
    if (!nativeHeader) return;

    nativeHeader.querySelector('.ge-header-buttons')?.remove();

    const headerButtonsDiv = document.createElement('div');
    headerButtonsDiv.addClass('ge-header-buttons', 'ge-native-header-buttons');

    const nativeNavButtons = nativeHeader.querySelector('.view-header-nav-buttons');
    const nativeTitleContainer = nativeHeader.querySelector('.view-header-title-container');
    nativeHeader.querySelector('.ge-native-breadcrumb-host')?.remove();

    if (nativeNavButtons) {
        nativeNavButtons.insertAdjacentElement('afterend', headerButtonsDiv);
    } else if (nativeTitleContainer) {
        nativeHeader.insertBefore(headerButtonsDiv, nativeTitleContainer);
    } else {
        nativeHeader.prepend(headerButtonsDiv);
    }

    // Keep the folder/mode hierarchy directly after the left-side controls,
    // outside Obsidian's centered title slot so it remains left-aligned and persistent.
    const breadcrumbHost = document.createElement('div');
    breadcrumbHost.addClass('ge-native-breadcrumb-host');
    headerButtonsDiv.insertAdjacentElement('afterend', breadcrumbHost);

    // 為頂部按鈕區域添加點擊事件，點擊後網格容器捲動到最頂部
    headerButtonsDiv.addEventListener('click', (event: MouseEvent) => {
        // 只有當點擊的是頂部按鈕區域本身（而不是其中的按鈕）時才觸發捲動
        if (event.target === headerButtonsDiv) {
            event.preventDefault();
            // 取得網格容器
            const gridContainer = gridView.containerEl.querySelector('.ge-grid-container');
            if (gridContainer) {
                gridContainer.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            }
        }
    });

    // 添加新增筆記按鈕
    const newNoteButton = headerButtonsDiv.createEl('button', { attr: { 'aria-label': t('new_note') } });
    setIcon(newNoteButton, 'square-pen');
    newNoteButton.addEventListener('click', (event) => {
        event.preventDefault();
        const menu = new Menu();
        // 新增筆記
        menu.addItem((item) => {
            item
                .setTitle(t('new_note'))
                .setIcon('square-pen')
                .onClick(async () => {
                    await createNewNote(gridView.app, gridView.sourcePath, gridView.plugin.settings.newItemNamePattern);
                });
        });
        // 新增資料夾
        menu.addItem((item) => {
            item.setTitle(t('new_folder'))
                .setIcon('folder')
                .onClick(async () => {
                    await createNewFolder(gridView.app, gridView.sourcePath, () => {
                        window.requestAnimationFrame(() => {
                            void gridView.render();
                        });
                    });
                });
        });
        // 新增畫布
        menu.addItem((item) => {
            item.setTitle(t('new_canvas'))
                .setIcon('layout-dashboard')
                .onClick(async () => {
                    await createNewCanvas(gridView.app, gridView.sourcePath, gridView.plugin.settings.newItemNamePattern);
                });
        });
        // 新增 base
        menu.addItem((item) => {
            item.setTitle(t('new_base'))
                .setIcon('table-2')
                .onClick(async () => {
                    await createNewBase(gridView.app, gridView.sourcePath, gridView.plugin.settings.newItemNamePattern);
                });
        });
        // New Kanban board, only when the Kanban community plugin is enabled.
        if (isCommunityPluginEnabled(gridView.app, ['obsidian-kanban', 'obsidian-kanban-am'], ['Kanban', 'Kanban AM'])) {
            menu.addItem((item) => {
                item.setTitle(t('new_kanban'))
                    .setIcon('columns-3')
                    .onClick(async () => {
                        await createNewKanban(gridView.app, gridView.sourcePath, gridView.plugin.settings.newItemNamePattern);
                    });
            });
        }
        // New Smart Gantt timeline, only when Smart Gantt is enabled.
        if (isCommunityPluginEnabled(gridView.app, ['smart-gantt'], ['Smart Gantt'])) {
            menu.addItem((item) => {
                item.setTitle(t('new_gantt'))
                    .setIcon('smart-gantt')
                    .onClick(async () => {
                        await createNewGantt(gridView.app, gridView.sourcePath, gridView.plugin.settings.newItemNamePattern);
                    });
            });
        }
        // 新增捷徑
        menu.addItem((item) => {
            item.setTitle(t('new_shortcut'))
                .setIcon('shuffle')
                .onClick(async () => {
                    const modal = new ShortcutSelectionModal(gridView.app, gridView.plugin, (option) => {
                        void (async () => {
                            await createShortcutUtil(gridView.app, gridView.sourcePath, option);
                        })();
                    });
                    modal.open();
                });
        });
        menu.showAtMouseEvent(event);
    });

    // 添加重新選擇資料夾按鈕
    const reselectButton = headerButtonsDiv.createEl('button', { attr: { 'aria-label': t('reselect') } });
    reselectButton.addEventListener('click', () => {
        showFolderSelectionModal(gridView.app, gridView.plugin, gridView, reselectButton);
    });
    setIcon(reselectButton, "grid");

    // 添加重新整理按鈕
    const refreshButton = headerButtonsDiv.createEl('button', { attr: { 'aria-label': t('refresh') } });
    refreshButton.addEventListener('click', () => {
        if (gridView.sortType === 'random') {
            gridView.clearSelection();
        }
        void gridView.render();
    });
    setIcon(refreshButton, 'refresh-ccw');

    // 添加搜尋按鈕
    const searchButtonContainer = headerButtonsDiv.createDiv('ge-search-button-container');
    const searchButton = searchButtonContainer.createEl('button', {
        cls: 'search-button',
        attr: { 'aria-label': t('search') }
    });
    setIcon(searchButton, 'search');
    searchButton.addEventListener('click', () => {
        showSearchModal(gridView.app, gridView, gridView.searchQuery, searchButton);
    });

    // Full view is a first-class convenience action in folder views. Keep the duplicate
    // pane-menu item as requested, but put the fast toggle directly after Search.
    if (gridView.canUseFullView()) {
        const fullViewButton = headerButtonsDiv.createEl('button', {
            cls: 'ge-full-view-button',
            attr: { 'aria-label': t('full_view') }
        });
        setIcon(fullViewButton, 'book-open');
        fullViewButton.toggleClass('is-active', gridView.fullView);
        fullViewButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            void gridView.toggleFullView();
        });
    }

}

/** Add Grid Explorer-specific actions to Obsidian's native pane menu. */
export function populateGridViewPaneMenu(menu: Menu, gridView: GridView) {
    menu.addItem((item) => {
        item
            .setTitle(t('open_new_grid_view'))
            .setIcon('grid');
        
        const submenu = isMenuItemWithSubmenu(item) ? item.setSubmenu() : null;
        const createViewInLeaf = async (location: 'tab' | 'left' | 'right') => {
            const { workspace } = gridView.app;
            let leaf = null;
            if (location === 'left') {
                leaf = workspace.getLeftLeaf(false);
            } else if (location === 'right') {
                leaf = workspace.getRightLeaf(false);
            } else {
                leaf = workspace.getLeaf('tab');
            }
            if (!leaf) {
                leaf = workspace.getLeaf('tab');
            }
            await leaf.setViewState({
                type: 'grid-view',
                active: true,
                state: { sourceMode: 'folder', sourcePath: '/' },
            });
            void workspace.revealLeaf(leaf);
        };

        const targetMenu = submenu || menu;

        targetMenu.addItem((subItem) => {
            subItem
                .setTitle(t('open_in_new_tab'))
                .setIcon('file-plus')
                .onClick(() => {
                    void createViewInLeaf('tab');
                });
        });
        targetMenu.addItem((subItem) => {
            subItem
                .setTitle(t('open_in_left_sidebar'))
                .setIcon('sidebar-left')
                .onClick(() => {
                    void createViewInLeaf('left');
                });
        });
        targetMenu.addItem((subItem) => {
            subItem
                .setTitle(t('open_in_right_sidebar'))
                .setIcon('sidebar-right')
                .onClick(() => {
                    void createViewInLeaf('right');
                });
        });
    });
    menu.addSeparator();

    // 直向卡片切換
    menu.addItem((item) => {
        item.setTitle(t('vertical_card'))
            .setIcon('layout')
            .setChecked(gridView.baseCardLayout === 'vertical')
            .onClick(() => {
                gridView.baseCardLayout = gridView.baseCardLayout === 'vertical' ? 'horizontal' : 'vertical';
                gridView.cardLayout = gridView.baseCardLayout;
                gridView.app.workspace.requestSaveLayout();
                void gridView.render();
            });
    });
    // 最小化模式選項
    menu.addItem((item) => {
        item
            .setTitle(t('min_mode'))
            .setIcon('minimize-2')
            .setChecked(gridView.minMode)
            .onClick(() => {
                gridView.baseMinMode = !gridView.minMode;
                gridView.minMode = gridView.baseMinMode;
                gridView.app.workspace.requestSaveLayout();
                void gridView.render();
            });
    });
    // 顯示日期分隔器
    if (gridView.plugin.settings.dateDividerMode !== 'none') {
        menu.addItem((item) => {
            item
                .setTitle(t('show_date_dividers'))
                .setIcon('calendar')
                .setChecked(gridView.showDateDividers)
                .onClick(() => {
                    gridView.baseShowDateDividers = !gridView.showDateDividers;
                    gridView.showDateDividers = gridView.baseShowDateDividers;
                    gridView.app.workspace.requestSaveLayout();
                    void gridView.render();
                });
        });
    }
    // 顯示筆記標籤
    menu.addItem((item) => {
        item
            .setTitle(t('show_note_tags'))
            .setIcon('tag')
            .setChecked(gridView.showNoteTags)
            .onClick(() => {
                gridView.showNoteTags = !gridView.showNoteTags;
                gridView.app.workspace.requestSaveLayout();
                void gridView.render();
            });
    });
    // 顯示忽略的資料夾及檔案選項
    menu.addItem((item) => {
        item
            .setTitle(t('show_ignored_items'))
            .setIcon('folder-open-dot')
            .setChecked(gridView.showIgnoredItems)
            .onClick(() => {
                gridView.showIgnoredItems = !gridView.showIgnoredItems;
                gridView.app.workspace.requestSaveLayout();
                void gridView.render();
            });
    });

    menu.addSeparator();

    // 開啟瀏覽器
    menu.addItem((item) => {
        item
            .setTitle(t('open_explorer'))
            .setIcon('folder-tree')
            .onClick(() => {
                const existingLeaves = gridView.app.workspace.getLeavesOfType(EXPLORER_VIEW_TYPE);
                if (existingLeaves.length > 0) {
                    void gridView.app.workspace.revealLeaf(existingLeaves[0]);
                    return;
                }
                let leaf = gridView.app.workspace.getLeftLeaf(false);
                if (!leaf) leaf = gridView.app.workspace.getLeftLeaf(true);
                if (!leaf) leaf = gridView.app.workspace.getLeaf('tab');
                void leaf.setViewState({ type: EXPLORER_VIEW_TYPE, active: true });
                void gridView.app.workspace.revealLeaf(leaf);
            });
    });

    // 顯示設定選項
    menu.addItem((item) => {
        item
            .setTitle(t('open_settings'))
            .setIcon('settings')
            .onClick(() => {
                // 打開插件設定頁面
                const setting = (gridView.app as AppWithSettings).setting;
                setting?.open();
                setting?.openTabById(gridView.plugin.manifest.id);
            });
    });

}
