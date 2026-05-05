import { vi } from "vitest";

export class Position {
  constructor(
    public readonly line: number,
    public readonly character: number,
  ) {}
}

export class Range {
  constructor(
    public readonly start: Position,
    public readonly end: Position,
  ) {}
}

export class SnippetString {
  constructor(public readonly value: string) {}

  toString() {
    return this.value;
  }
}

export class MarkdownString {
  constructor(public readonly value: string) {}

  toString() {
    return this.value;
  }
}

export const CompletionItemKind = {
  Snippet: 15,
} as const;

export class CompletionItem {
  insertText?: SnippetString;
  detail?: string;
  documentation?: MarkdownString;
  sortText?: string;
  filterText?: string;
  preselect?: boolean;
  keepWhitespace?: boolean;

  constructor(
    public label: string | { label: string; description?: string },
    public readonly kind: number,
  ) {}
}

export class Uri {
  public readonly scheme: string;
  public readonly path: string;

  constructor(public readonly fsPath: string) {
    this.scheme = "file";
    this.path = fsPath;
  }

  static file(fsPath: string) {
    return new Uri(fsPath);
  }

  static joinPath(base: Uri, ...paths: string[]) {
    return new Uri([base.fsPath, ...paths].join("/").replace(/\/+/g, "/"));
  }

  toString() {
    return this.fsPath;
  }
}

export class FileSystemError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
  }

  static FileNotFound(message = "File not found") {
    return new FileSystemError(message, "FileNotFound");
  }
}

export const workspace = {
  workspaceFolders: undefined as Array<{ name: string; uri: Uri }> | undefined,
  getConfiguration: vi.fn(() => ({
    get: vi.fn(),
  })),
  getWorkspaceFolder: vi.fn(),
  fs: {
    readFile: vi.fn(),
    stat: vi.fn(),
  },
};

export const window = {
  activeTerminal: undefined as { show: () => void; sendText: (text: string) => void } | undefined,
  createTerminal: vi.fn(() => ({
    show: vi.fn(),
    sendText: vi.fn(),
  })),
  showWarningMessage: vi.fn(),
  showQuickPick: vi.fn(),
};
