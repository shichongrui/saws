const ui = {
  notice: document.querySelector("#notice"),
  passwordForm: document.querySelector("#password-form"),
  password: document.querySelector("#password"),
  agents: document.querySelector("#agents"),
  requirement: document.querySelector("#requirement"),
  codexStatus: document.querySelector("#codex-status"),
  claudeStatus: document.querySelector("#claude-status"),
  codexConnect: document.querySelector("#codex-connect"),
  claudeConnect: document.querySelector("#claude-connect"),
  codexDevice: document.querySelector("#codex-device"),
  codexUrl: document.querySelector("#codex-url"),
  codexCode: document.querySelector("#codex-code"),
  terminalWrap: document.querySelector("#terminal-wrap"),
  terminalClose: document.querySelector("#terminal-close"),
};

let csrf;
let codexPoll;
let terminalSocket;
let agentStatus = { codex: false, claude: false };

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.method && options.method !== "GET" ? { "x-csrf-token": csrf } : undefined),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function showNotice(message, error = false) {
  ui.notice.hidden = !message;
  ui.notice.textContent = message || "";
  ui.notice.classList.toggle("error", error);
}

function setAgentStatus(element, button, agent, connected, selectedAgent) {
  const selected = selectedAgent === agent;
  element.textContent = selected
    ? connected
      ? "Selected"
      : "Selected · disconnected"
    : connected
      ? "Connected"
      : "Not connected";
  element.classList.toggle("ok", connected);
  button.textContent = connected
    ? `Use ${agent === "codex" ? "Codex" : "Claude Code"}`
    : `Connect ${agent === "codex" ? "Codex" : "Claude Code"}`;
}

async function refresh() {
  const status = await request("/__saws/status");
  if (!status.session) {
    ui.passwordForm.hidden = false;
    ui.agents.hidden = true;
    return;
  }
  ui.passwordForm.hidden = true;
  ui.agents.hidden = false;
  agentStatus = { codex: status.codex, claude: status.claude };
  setAgentStatus(ui.codexStatus, ui.codexConnect, "codex", status.codex, status.selectedAgent);
  setAgentStatus(ui.claudeStatus, ui.claudeConnect, "claude", status.claude, status.selectedAgent);
  const requirementText = `Access requires ${status.requirement === "any" ? "Codex or Claude Code" : status.requirement === "all" ? "both Codex and Claude Code" : status.requirement}.`;
  const selectionText =
    status.selectedAgent == null && (status.codex || status.claude)
      ? " Choose which connected agent OpenDesign should use."
      : "";
  ui.requirement.textContent = `${requirementText}${selectionText}`;
  if (status.satisfied) location.replace("/");
}

async function selectAgent(agent) {
  await request("/__saws/agent", {
    method: "POST",
    body: JSON.stringify({ agent }),
  });
  showNotice(`${agent === "codex" ? "Codex" : "Claude Code"} selected.`);
  await refresh();
}

ui.passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showNotice("");
  try {
    await request("/__saws/session", {
      method: "POST",
      body: JSON.stringify({ password: ui.password.value }),
    });
    ui.password.value = "";
    await refresh();
  } catch (error) {
    showNotice(error.message, true);
  }
});

ui.codexConnect.addEventListener("click", async () => {
  ui.codexConnect.disabled = true;
  if (agentStatus.codex) {
    try {
      await selectAgent("codex");
    } catch (error) {
      showNotice(error.message, true);
      ui.codexConnect.disabled = false;
    }
    return;
  }
  showNotice("Starting Codex device login…");
  try {
    await request("/__saws/login/codex", { method: "POST", body: "{}" });
    clearInterval(codexPoll);
    codexPoll = setInterval(pollCodex, 1500);
    await pollCodex();
  } catch (error) {
    showNotice(error.message, true);
    ui.codexConnect.disabled = false;
  }
});

async function pollCodex() {
  try {
    const login = await request("/__saws/login/codex");
    if (login.verificationUrl) {
      ui.codexDevice.hidden = false;
      ui.codexUrl.href = login.verificationUrl;
      ui.codexCode.textContent = login.userCode;
      showNotice("Waiting for Codex authorization in your browser.");
    }
    if (login.state === "complete") {
      clearInterval(codexPoll);
      ui.codexConnect.disabled = false;
      showNotice("Codex connected.");
      await refresh();
    } else if (login.state === "error") {
      clearInterval(codexPoll);
      ui.codexConnect.disabled = false;
      showNotice(login.error || "Codex login failed.", true);
    }
  } catch (error) {
    clearInterval(codexPoll);
    ui.codexConnect.disabled = false;
    showNotice(error.message, true);
  }
}

ui.claudeConnect.addEventListener("click", async () => {
  ui.claudeConnect.disabled = true;
  if (agentStatus.claude) {
    try {
      await selectAgent("claude");
    } catch (error) {
      showNotice(error.message, true);
      ui.claudeConnect.disabled = false;
    }
    return;
  }
  showNotice("");
  try {
    const login = await request("/__saws/login/claude", { method: "POST", body: "{}" });
    openTerminal(login.id);
  } catch (error) {
    ui.claudeConnect.disabled = false;
    showNotice(error.message, true);
  }
});

function openTerminal(id) {
  ui.terminalWrap.hidden = false;
  const terminal = new Terminal({
    cursorBlink: true,
    convertEol: true,
    theme: { background: "#000000" },
  });
  const fit = new FitAddon.FitAddon();
  terminal.loadAddon(fit);
  terminal.open(document.querySelector("#terminal"));
  fit.fit();
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  terminalSocket = new WebSocket(
    `${protocol}//${location.host}/__saws/terminal?id=${encodeURIComponent(id)}`,
  );
  terminal.onData(
    (data) =>
      terminalSocket?.readyState === WebSocket.OPEN &&
      terminalSocket.send(JSON.stringify({ type: "input", data })),
  );
  terminal.onResize(
    ({ cols, rows }) =>
      terminalSocket?.readyState === WebSocket.OPEN &&
      terminalSocket.send(JSON.stringify({ type: "resize", cols, rows })),
  );
  terminalSocket.addEventListener("open", () =>
    terminalSocket.send(
      JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }),
    ),
  );
  terminalSocket.addEventListener("message", async (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "data") terminal.write(message.data);
    if (message.type === "exit") {
      terminal.write(`\r\n[authentication process exited]\r\n`);
      ui.claudeConnect.disabled = false;
      if (message.error) {
        showNotice(message.error, true);
        return;
      }
      await refresh();
    }
  });
  terminalSocket.addEventListener("close", () => {
    ui.claudeConnect.disabled = false;
  });
  window.addEventListener("resize", () => fit.fit(), { passive: true });
}

ui.terminalClose.addEventListener("click", () => {
  terminalSocket?.send(JSON.stringify({ type: "cancel" }));
  terminalSocket?.close();
  ui.terminalWrap.hidden = true;
  ui.claudeConnect.disabled = false;
});

(async () => {
  try {
    csrf = (await request("/__saws/csrf")).token;
    await refresh();
  } catch (error) {
    showNotice(error.message, true);
  }
})();
