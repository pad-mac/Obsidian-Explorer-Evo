import { Notice, SuggestModal, TFile, normalizePath } from 'obsidian';
import GridExplorerPlugin from '../main';

export class FileMoveModal extends SuggestModal<string> {
    private readonly allPaths: string[];

    constructor(
        private readonly plugin: GridExplorerPlugin,
        private readonly files: TFile[],
    ) {
        super(plugin.app);
        this.allPaths = this.app.vault.getAllFolders().map(folder => folder.path).sort((a, b) => a.localeCompare(b));
        this.setPlaceholder('Move file to…');
        this.inputEl.focus();
    }

    getSuggestions(query: string): string[] {
        const lower = query.toLowerCase();
        const filtered = this.allPaths.filter(path => path.toLowerCase().includes(lower));
        if ('/'.includes(lower) && !filtered.includes('/')) filtered.unshift('/');
        return filtered;
    }

    renderSuggestion(value: string, el: HTMLElement): void {
        el.setText(value);
    }

    onChooseSuggestion(value: string): void {
        void this.moveFiles(value);
    }

    private async moveFiles(value: string): Promise<void> {
        const dest = value === '/' ? '' : value.replace(/\/$/, '');
        for (const file of this.files) {
            const newPath = normalizePath(dest ? `${dest}/${file.name}` : file.name);
            if (newPath === file.path) continue;
            if (this.app.vault.getAbstractFileByPath(newPath)) {
                new Notice(`Already exists: ${newPath}`);
                continue;
            }
            try {
                await this.app.fileManager.renameFile(file, newPath);
            } catch (error) {
                new Notice(`Failed to move file: ${file.name}`);
                console.error('GridExplorer: failed to move file', error);
            }
        }
    }
}

export function showFileMoveModal(plugin: GridExplorerPlugin, files: TFile[]): void {
    if (files.length === 0) return;
    new FileMoveModal(plugin, files).open();
}
