import readline from "node:readline";

const CLEAR_SCREEN = "\x1b[2J";
const CLEAR_LINE = "\x1b[2K";
const CURSOR_HOME = "\x1b[H";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const ENTER_ALT_SCREEN = "\x1b[?1049h";
const EXIT_ALT_SCREEN = "\x1b[?1049l";
const ENABLE_MOUSE = "\x1b[?1000h\x1b[?1006h";
const DISABLE_MOUSE = "\x1b[?1000l\x1b[?1006l";
const RESET = "\x1b[0m";
const INVERSE = "\x1b[7m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const WHEEL_SCROLL_LINES = 3;

export interface RuntimeLogEntry {
  serviceName: string;
  stream: "stdout" | "stderr";
  chunk: string;
  timestamp: Date;
}

export type RuntimeLogSink = (entry: RuntimeLogEntry) => void;

interface ServiceLog {
  lines: string[];
  partial: string;
}

export class DevTui {
  readonly logSink: RuntimeLogSink = (entry) => this.addLog(entry);

  private readonly services: string[];
  private readonly logs = new Map<string, ServiceLog>();
  private readonly logScrollOffsets = new Map<string, number>();
  private selectedIndex = 0;
  private isStarted = false;
  private isSelectionMode = false;
  private previousRawMode = false;
  private readonly maxLines = 2000;

  constructor(services: string[]) {
    this.services = [...new Set(services)];

    for (const service of this.services) {
      this.logs.set(service, { lines: [], partial: "" });
      this.logScrollOffsets.set(service, 0);
    }
  }

  start() {
    if (this.isStarted || !process.stdout.isTTY || !process.stdin.isTTY) {
      this.isStarted = process.stdout.isTTY && process.stdin.isTTY;
      return;
    }

    this.isStarted = true;
    this.previousRawMode = process.stdin.isRaw;

    process.stdout.write(`${ENTER_ALT_SCREEN}${HIDE_CURSOR}${ENABLE_MOUSE}`);
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", this.handleInput);
    process.stdin.on("keypress", this.handleKeypress);
    process.stdout.on("resize", this.render);
    this.render();
  }

  stop() {
    if (!this.isStarted) return;

    process.stdin.off("data", this.handleInput);
    process.stdin.off("keypress", this.handleKeypress);
    process.stdout.off("resize", this.render);
    this.isSelectionMode = false;
    process.stdin.setRawMode(this.previousRawMode);
    process.stdout.write(`${DISABLE_MOUSE}${SHOW_CURSOR}${EXIT_ALT_SCREEN}${RESET}`);
    this.isStarted = false;
  }

  private handleKeypress = (_input: string, key: readline.Key) => {
    if (key.ctrl && key.name === "c") {
      process.kill(process.pid, "SIGINT");
      return;
    }

    if (this.isSelectionMode) {
      if (key.name === "escape" || key.name === "c") {
        this.exitSelectionMode();
      }
      return;
    }

    if (key.name === "c") {
      this.enterSelectionMode();
      return;
    }

    if (key.name === "up" || key.name === "k") {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.render();
      return;
    }

    if (key.name === "down" || key.name === "j") {
      this.selectedIndex = Math.min(this.services.length - 1, this.selectedIndex + 1);
      this.render();
      return;
    }

    if (key.name === "pageup" || key.name === "u") {
      this.scrollSelectedLog(this.getBodyHeight());
      return;
    }

    if (key.name === "pagedown" || key.name === "d") {
      this.scrollSelectedLog(-this.getBodyHeight());
      return;
    }

    if (key.name === "home" || key.name === "g") {
      this.scrollSelectedLog(Number.POSITIVE_INFINITY);
      return;
    }

    if (key.name === "end" || (key.shift && key.name === "g")) {
      this.logScrollOffsets.set(this.getSelectedService(), 0);
      this.render();
      return;
    }

    if (key.name === "q") {
      process.kill(process.pid, "SIGTERM");
    }
  };

  private handleInput = (chunk: Buffer | string) => {
    if (this.isSelectionMode) return;

    const input = chunk.toString();
    for (const event of parseMouseEvents(input)) {
      if (event.type === "wheel-up") {
        this.scrollSelectedLog(WHEEL_SCROLL_LINES);
        continue;
      }

      if (event.type === "wheel-down") {
        this.scrollSelectedLog(-WHEEL_SCROLL_LINES);
        continue;
      }

      if (event.type === "press") {
        this.selectServiceAt(event.x, event.y);
      }
    }
  };

  private addLog(entry: RuntimeLogEntry) {
    if (entry.serviceName === "system") return;

    const serviceName = entry.serviceName;
    if (!this.logs.has(serviceName)) {
      this.services.push(serviceName);
      this.logs.set(serviceName, { lines: [], partial: "" });
      this.logScrollOffsets.set(serviceName, 0);
      this.selectedIndex = this.services.length - 1;
    }

    const log = this.logs.get(serviceName) ?? { lines: [], partial: "" };
    const pieces = `${log.partial}${sanitizeLogChunk(entry.chunk)}`.split("\n");
    log.partial = pieces.pop() ?? "";

    for (const piece of pieces) {
      log.lines.push(
        `${timestamp(entry.timestamp)} ${entry.stream === "stderr" ? "[err] " : ""}${piece}`,
      );
    }

    if (log.lines.length > this.maxLines) {
      log.lines.splice(0, log.lines.length - this.maxLines);
    }

    this.logs.set(serviceName, log);
    this.clampLogScrollOffset(serviceName);
    this.render();
  }

  private render = (force = false) => {
    if (!this.isStarted || !process.stdout.isTTY || (this.isSelectionMode && !force)) return;

    const width = process.stdout.columns ?? 80;
    const navWidth = getNavWidth(width);
    const logWidth = Math.max(10, width - navWidth - 1);
    const bodyHeight = this.getBodyHeight();

    const selectedService = this.getSelectedService();
    const log = this.logs.get(selectedService) ?? { lines: [], partial: "" };
    const visibleLines = [...log.lines, log.partial].filter(Boolean);
    const wrappedLogLines = visibleLines.flatMap((line) => wrapLine(line, logWidth));
    const logScrollOffset = this.clampLogScrollOffset(selectedService, wrappedLogLines.length);
    const logEnd = Math.max(bodyHeight, wrappedLogLines.length - logScrollOffset);
    const logStart = Math.max(0, logEnd - bodyHeight);
    const logLines = wrappedLogLines.slice(logStart, logEnd);

    const rows: string[] = [];
    rows.push(`${CYAN}SAWS dev${RESET}${DIM}  ${this.getHelpText()}${RESET}`.padEnd(width));
    rows.push(
      `${"Services".padEnd(navWidth)} ${logHeading(selectedService, logScrollOffset).padEnd(logWidth)}`,
    );

    for (let index = 0; index < bodyHeight; index += 1) {
      const service = this.services[index] ?? "";
      const isSelected = index === this.selectedIndex;
      const serviceLabel = service === "" ? "" : ` ${service}`;
      const nav = truncate(serviceLabel, navWidth).padEnd(navWidth);
      const logLine = truncate(logLines[index] ?? "", logWidth).padEnd(logWidth);
      rows.push(`${isSelected ? `${INVERSE}${nav}${RESET}` : nav} ${logLine}`);
    }

    process.stdout.write(renderRows(rows, width, process.stdout.rows ?? 24));
  };

  private enterSelectionMode() {
    this.isSelectionMode = true;
    process.stdout.write(`${DISABLE_MOUSE}${SHOW_CURSOR}`);
    this.render(true);
  }

  private exitSelectionMode() {
    this.isSelectionMode = false;
    process.stdout.write(`${HIDE_CURSOR}${ENABLE_MOUSE}`);
    this.render(true);
  }

  private getHelpText() {
    if (this.isSelectionMode) return "select/copy text with terminal, esc resume";
    return "up/down select, pgup/pgdn scroll, c copy/select, q quit";
  }

  private getSelectedService() {
    return this.services[this.selectedIndex] ?? "";
  }

  private getBodyHeight() {
    return Math.max(1, (process.stdout.rows ?? 24) - 3);
  }

  private scrollSelectedLog(delta: number) {
    const selectedService = this.getSelectedService();
    const current = this.logScrollOffsets.get(selectedService) ?? 0;
    this.logScrollOffsets.set(selectedService, current + delta);
    this.render();
  }

  private selectServiceAt(x: number, y: number) {
    const navWidth = getNavWidth(process.stdout.columns ?? 80);
    if (x > navWidth || y < 3) return;

    const serviceIndex = y - 3;
    if (serviceIndex < 0 || serviceIndex >= this.services.length) return;

    this.selectedIndex = serviceIndex;
    this.render();
  }

  private clampLogScrollOffset(serviceName: string, wrappedLineCount?: number) {
    const width = process.stdout.columns ?? 80;
    const navWidth = getNavWidth(width);
    const logWidth = Math.max(10, width - navWidth - 1);
    const log = this.logs.get(serviceName) ?? { lines: [], partial: "" };
    const lineCount =
      wrappedLineCount ??
      [...log.lines, log.partial].filter(Boolean).flatMap((line) => wrapLine(line, logWidth))
        .length;
    const maxOffset = Math.max(0, lineCount - this.getBodyHeight());
    const nextOffset = Math.min(
      maxOffset,
      Math.max(0, this.logScrollOffsets.get(serviceName) ?? 0),
    );
    this.logScrollOffsets.set(serviceName, nextOffset);
    return nextOffset;
  }
}

function logHeading(serviceName: string, scrollOffset: number) {
  if (scrollOffset === 0) return `Logs: ${serviceName}`;
  return `Logs: ${serviceName} (${scrollOffset} lines from bottom)`;
}

function renderRows(rows: string[], width: number, height: number) {
  const output: string[] = [CURSOR_HOME, CLEAR_SCREEN];

  for (let index = 0; index < height; index += 1) {
    output.push(cursorPosition(index + 1, 1));
    output.push(CLEAR_LINE);
    output.push(truncate(rows[index] ?? "", width).padEnd(width));
  }

  return output.join("");
}

function cursorPosition(row: number, column: number) {
  return `\x1b[${row};${column}H`;
}

function getNavWidth(terminalWidth: number) {
  return Math.min(30, Math.max(18, Math.floor(terminalWidth * 0.28)));
}

type MouseEvent =
  | { type: "wheel-up"; x: number; y: number }
  | { type: "wheel-down"; x: number; y: number }
  | { type: "press"; x: number; y: number };

function parseMouseEvents(input: string): MouseEvent[] {
  const events: MouseEvent[] = [];

  for (let index = 0; index < input.length; index += 1) {
    if (input.charCodeAt(index) !== 27 || input[index + 1] !== "[" || input[index + 2] !== "<") {
      continue;
    }

    const codeResult = readUnsignedNumber(input, index + 3);
    if (codeResult == null || input[codeResult.nextIndex] !== ";") continue;

    const xResult = readUnsignedNumber(input, codeResult.nextIndex + 1);
    if (xResult == null || input[xResult.nextIndex] !== ";") continue;

    const yResult = readUnsignedNumber(input, xResult.nextIndex + 1);
    if (yResult == null) continue;

    const action = input[yResult.nextIndex];
    index = yResult.nextIndex;

    if (action !== "M") continue;

    if (codeResult.value >= 64 && codeResult.value <= 95) {
      const wheelDirection = codeResult.value & 3;
      if (wheelDirection === 0) {
        events.push({ type: "wheel-up", x: xResult.value, y: yResult.value });
      } else if (wheelDirection === 1) {
        events.push({ type: "wheel-down", x: xResult.value, y: yResult.value });
      }
      continue;
    }

    if ((codeResult.value & 3) === 0) {
      events.push({ type: "press", x: xResult.value, y: yResult.value });
    }
  }

  return events;
}

function readUnsignedNumber(value: string, startIndex: number) {
  let index = startIndex;
  while (index < value.length && value[index] >= "0" && value[index] <= "9") {
    index += 1;
  }

  if (index === startIndex) return null;
  return {
    value: Number(value.slice(startIndex, index)),
    nextIndex: index,
  };
}

function timestamp(date: Date) {
  return date.toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function wrapLine(line: string, width: number) {
  const chunks: string[] = [];
  let remaining = line;

  while (visibleLength(remaining) > width) {
    chunks.push(remaining.slice(0, width));
    remaining = remaining.slice(width);
  }

  chunks.push(remaining);
  return chunks;
}

function truncate(value: string, width: number) {
  if (visibleLength(value) <= width) return value;
  if (width <= 3) return value.slice(0, width);
  return `${value.slice(0, width - 3)}...`;
}

function visibleLength(value: string) {
  return stripAnsiColor(value).length;
}

function sanitizeLogChunk(value: string) {
  return stripAnsiControlSequences(value.replaceAll("\r\n", "\n").replaceAll("\r", "\n"));
}

function stripAnsiControlSequences(value: string) {
  let stripped = "";

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 27) {
      index = skipEscapeSequence(value, index);
      continue;
    }

    if ((code >= 0 && code < 9) || (code > 13 && code < 32) || code === 127) {
      continue;
    }

    stripped += value[index];
  }

  return stripped;
}

function skipEscapeSequence(value: string, startIndex: number) {
  const next = value[startIndex + 1];
  if (next === "[") {
    let index = startIndex + 2;
    while (index < value.length) {
      const code = value.charCodeAt(index);
      if (code >= 64 && code <= 126) return index;
      index += 1;
    }
    return value.length - 1;
  }

  if (next === "]") {
    let index = startIndex + 2;
    while (index < value.length) {
      if (value.charCodeAt(index) === 7) return index;
      if (value.charCodeAt(index) === 27 && value[index + 1] === "\\") return index + 1;
      index += 1;
    }
    return value.length - 1;
  }

  return Math.min(startIndex + 1, value.length - 1);
}

function stripAnsiColor(value: string) {
  let stripped = "";
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) !== 27) {
      stripped += value[index];
      continue;
    }

    if (value[index + 1] !== "[") {
      continue;
    }

    index += 2;
    while (index < value.length && /[0-9;]/.test(value[index] ?? "")) {
      index += 1;
    }
  }

  return stripped;
}
