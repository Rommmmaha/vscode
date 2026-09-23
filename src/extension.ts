import * as vscode from "vscode";
import * as path from "path";
import * as os from "os";
import * as fs from "fs/promises";
interface TreeNode {
  name: string;
  fullPath: string;
  isDirectory: boolean;
  isLeaf: boolean;
  children: Map<string, TreeNode>;
}
function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = { name: "", fullPath: "", isDirectory: true, isLeaf: false, children: new Map() };
  for (const raw of paths) {
    const resolved = resolveHome(raw);
    const isAbs = path.isAbsolute(resolved);
    const rootPrefix = isAbs ? path.parse(resolved).root : "";
    const parts = resolved.split(path.sep).filter(Boolean);
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          fullPath: rootPrefix + parts.slice(0, i + 1).join(path.sep),
          isDirectory: !isLast,
          isLeaf: isLast,
          children: new Map()
        });
      }
      const node = current.children.get(part)!;
      if (!isLast) {
        node.isDirectory = true;
        node.isLeaf = false;
      }
      current = node;
    }
  }
  return root;
}
function isWildcardPath(raw: string): boolean {
  const noTrail = raw.trim().replace(/[/\\]+$/, "");
  return noTrail.endsWith("/*") || noTrail.endsWith("\\*") || noTrail === "*";
}
function stripWildcard(raw: string): string {
  const noTrail = raw.trim().replace(/[/\\]+$/, "");
  if (noTrail.endsWith("/*") || noTrail.endsWith("\\*")) {
    const base = noTrail.slice(0, -2);
    return base === "" ? path.sep : base;
  }
  if (noTrail === "*") {
    return path.sep;
  }
  return noTrail;
}
async function expandWildcardPaths(paths: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const raw of paths) {
    if (!isWildcardPath(raw)) {
      out.push(raw);
      continue;
    }
    const baseResolved = resolveHome(stripWildcard(raw));
    const base = baseResolved === "" ? path.sep : baseResolved;
    try {
      const entries = await fs.readdir(base, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          out.push(path.join(base, entry.name));
        }
      }
    } catch {
      // Missing or unreadable base dir: skip silently.
    }
  }
  return out;
}
function resolveHome(p: string): string {
  if (p.startsWith("~") || (p.startsWith("$HOME") && os.platform() !== "win32")) {
    return path.join(os.homedir(), p.slice(p[0] === "~" ? 1 : 5));
  }
  return p;
}
class BookmarkItem extends vscode.TreeItem {
  constructor(public readonly node: TreeNode) {
    super(node.name || node.fullPath, node.isDirectory ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
    if (!node.isDirectory) {
      this.command = {
        command: "r-qol.openWorkspace",
        title: "Open",
        arguments: [this]
      };
      this.description = node.fullPath;
      this.tooltip = node.fullPath;
      this.iconPath = vscode.ThemeIcon.File;
    } else {
      this.iconPath = new vscode.ThemeIcon("folder");
    }
  }
}
class BookmarkProvider implements vscode.TreeDataProvider<BookmarkItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<BookmarkItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private tree: TreeNode = buildTree([]);
  refresh() {
    const config = vscode.workspace.getConfiguration("r-qol");
    const paths: string[] = config.get<string[]>("bookmarks", []);
    return expandWildcardPaths(paths).then((expanded) => {
      this.tree = buildTree(expanded);
      this._onDidChangeTreeData.fire(undefined);
    });
  }
  getTreeItem(element: BookmarkItem): vscode.TreeItem {
    return element;
  }
  getChildren(element?: BookmarkItem): BookmarkItem[] {
    const node = element ? element.node : this.tree;
    return Array.from(node.children.values())
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map((n) => new BookmarkItem(n));
  }
}
export function activate(context: vscode.ExtensionContext) {
  const provider = new BookmarkProvider();
  context.subscriptions.push(vscode.window.registerTreeDataProvider("r-qolBookmarks", provider));
  void provider.refresh();
  function currentFolder(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    return folders?.[0]?.uri.fsPath;
  }
  async function updateBookmarks(mutator: (paths: string[]) => string[]) {
    const config = vscode.workspace.getConfiguration("r-qol");
    const paths: string[] = config.get<string[]>("bookmarks", []);
    await config.update("bookmarks", mutator(paths), vscode.ConfigurationTarget.Global);
  }
  context.subscriptions.push(
    vscode.commands.registerCommand("r-qol.refresh", () => void provider.refresh()),
    vscode.commands.registerCommand("r-qol.openWorkspace", async (item: BookmarkItem) => {
      const uri = vscode.Uri.file(item.node.fullPath);
      await vscode.commands.executeCommand("vscode.openFolder", uri);
    }),
    vscode.commands.registerCommand("r-qol.addBookmark", async () => {
      const folder = currentFolder();
      if (!folder) return vscode.window.showWarningMessage("No workspace open");
      await updateBookmarks((paths) => (paths.includes(folder) ? paths : [...paths, folder]));
      vscode.window.showInformationMessage(`Bookmarked: ${folder}`);
    }),
    vscode.commands.registerCommand("r-qol.removeBookmark", async () => {
      const folder = currentFolder();
      if (!folder) return vscode.window.showWarningMessage("No workspace open");
      await updateBookmarks((paths) => paths.filter((p) => p !== folder));
      vscode.window.showInformationMessage(`Removed: ${folder}`);
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("r-qol.bookmarks")) {
        void provider.refresh();
      }
    })
  );
}
