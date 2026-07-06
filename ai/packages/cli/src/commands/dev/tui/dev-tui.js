import readline from "node:readline";
const CLEAR_SCREEN = "\x1b[2J";
const CURSOR_HOME = "\x1b[H";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const ENTER_ALT_SCREEN = "\x1b[?1049h";
const EXIT_ALT_SCREEN = "\x1b[?1049l";
const RESET = "\x1b[0m";
const INVERSE = "\x1b[7m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
export class DevTui {
    logSink = (entry) => this.addLog(entry);
    services;
    logs = new Map();
    selectedIndex = 0;
    isStarted = false;
    previousRawMode = false;
    maxLines = 2000;
    constructor(services) {
        this.services = services.length === 0 ? ["system"] : services;
        for (const service of this.services) {
            this.logs.set(service, { lines: [], partial: "" });
        }
    }
    start() {
        if (this.isStarted || !process.stdout.isTTY || !process.stdin.isTTY) {
            this.isStarted = process.stdout.isTTY && process.stdin.isTTY;
            return;
        }
        this.isStarted = true;
        this.previousRawMode = process.stdin.isRaw;
        process.stdout.write(`${ENTER_ALT_SCREEN}${HIDE_CURSOR}`);
        readline.emitKeypressEvents(process.stdin);
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on("keypress", this.handleKeypress);
        process.stdout.on("resize", this.render);
        this.render();
    }
    stop() {
        if (!this.isStarted)
            return;
        process.stdin.off("keypress", this.handleKeypress);
        process.stdout.off("resize", this.render);
        process.stdin.setRawMode(this.previousRawMode);
        process.stdout.write(`${SHOW_CURSOR}${EXIT_ALT_SCREEN}${RESET}`);
        this.isStarted = false;
    }
    writeSystemLog(message, stream = "stdout") {
        this.addLog({
            serviceName: "system",
            stream,
            chunk: message.endsWith("\n") ? message : `${message}\n`,
            timestamp: new Date(),
        });
    }
    handleKeypress = (_input, key) => {
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
        if (key.ctrl && key.name === "c") {
            process.kill(process.pid, "SIGINT");
            return;
        }
        if (key.name === "q") {
            process.kill(process.pid, "SIGTERM");
        }
    };
    addLog(entry) {
        const serviceName = this.logs.has(entry.serviceName) ? entry.serviceName : "system";
        const log = this.logs.get(serviceName) ?? { lines: [], partial: "" };
        const pieces = `${log.partial}${entry.chunk}`.split(/\r?\n/);
        log.partial = pieces.pop() ?? "";
        for (const piece of pieces) {
            log.lines.push(`${timestamp(entry.timestamp)} ${piece}`);
        }
        if (log.lines.length > this.maxLines) {
            log.lines.splice(0, log.lines.length - this.maxLines);
        }
        this.logs.set(serviceName, log);
        this.render();
    }
    render = () => {
        if (!this.isStarted || !process.stdout.isTTY)
            return;
        const width = process.stdout.columns ?? 80;
        const height = process.stdout.rows ?? 24;
        const navWidth = Math.min(30, Math.max(18, Math.floor(width * 0.28)));
        const logWidth = Math.max(10, width - navWidth - 1);
        const bodyHeight = Math.max(1, height - 3);
        const selectedService = this.services[this.selectedIndex] ?? "system";
        const log = this.logs.get(selectedService) ?? { lines: [], partial: "" };
        const visibleLines = [...log.lines, log.partial].filter(Boolean);
        const logLines = visibleLines
            .flatMap((line) => wrapLine(line, logWidth))
            .slice(-bodyHeight);
        const rows = [];
        rows.push(`${CYAN}SAWS dev${RESET}${DIM}  up/down select, q quit${RESET}`.padEnd(width));
        rows.push(`${"Services".padEnd(navWidth)} ${`Logs: ${selectedService}`.padEnd(logWidth)}`);
        for (let index = 0; index < bodyHeight; index += 1) {
            const service = this.services[index] ?? "";
            const isSelected = index === this.selectedIndex;
            const serviceLabel = service === "" ? "" : ` ${service}`;
            const nav = truncate(serviceLabel, navWidth).padEnd(navWidth);
            const logLine = truncate(logLines[index] ?? "", logWidth).padEnd(logWidth);
            rows.push(`${isSelected ? `${INVERSE}${nav}${RESET}` : nav} ${logLine}`);
        }
        process.stdout.write(`${CURSOR_HOME}${CLEAR_SCREEN}${rows.join("\n")}`);
    };
}
function timestamp(date) {
    return date.toLocaleTimeString(undefined, {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}
function wrapLine(line, width) {
    const chunks = [];
    let remaining = line;
    while (visibleLength(remaining) > width) {
        chunks.push(remaining.slice(0, width));
        remaining = remaining.slice(width);
    }
    chunks.push(remaining);
    return chunks;
}
function truncate(value, width) {
    if (visibleLength(value) <= width)
        return value;
    if (width <= 3)
        return value.slice(0, width);
    return `${value.slice(0, width - 3)}...`;
}
function visibleLength(value) {
    return value.replace(/\x1b\[[0-9;]*m/g, "").length;
}
