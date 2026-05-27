import type { Email, EmailId, Thread } from "@mail-client-demo/model";
import type { InboxBridge } from "../../preload/index.ts";

declare global {
  interface Window {
    inbox: InboxBridge;
  }
}

const list = document.getElementById("email-list") as HTMLUListElement;
const search = document.getElementById("search") as HTMLInputElement;
const statusText = document.getElementById("status-text") as HTMLSpanElement;
const stats = document.getElementById("stats") as HTMLDivElement;
const actionBar = document.getElementById("action-bar") as HTMLDivElement;
const selectionCount = document.getElementById("selection-count") as HTMLSpanElement;
const archiveBtn = document.getElementById("archive-btn") as HTMLButtonElement;
const clearSelectionBtn = document.getElementById("clear-selection-btn") as HTMLButtonElement;
const selectVisibleBtn = document.getElementById("select-visible-btn") as HTMLButtonElement;
const navButtons = document.querySelectorAll<HTMLButtonElement>("#sidebar nav button");
const mainEl = document.getElementById("main") as HTMLElement;
const progressBar = document.getElementById("progress-bar") as HTMLDivElement;

type View = "inbox" | "threads";
let currentView: View = "inbox";
let lastVisibleIds: EmailId[] = [];
const selected = new Set<EmailId>();

let activeRequests = 0;
function beginLoading(): void {
  activeRequests++;
  if (activeRequests === 1) {
    mainEl.classList.add("loading");
    progressBar.hidden = false;
  }
}
function endLoading(): void {
  activeRequests = Math.max(0, activeRequests - 1);
  if (activeRequests === 0) {
    mainEl.classList.remove("loading");
    progressBar.hidden = true;
  }
}
async function withLoading<T>(label: string, fn: () => Promise<T>): Promise<T> {
  beginLoading();
  statusText.textContent = label;
  try {
    return await fn();
  } finally {
    endLoading();
  }
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderEmails(emails: Email[]): void {
  lastVisibleIds = emails.map((e) => e.id);
  list.innerHTML = emails
    .map(
      (e) => `
      <li class="${e.read ? "read" : "unread"} ${selected.has(e.id) ? "selected" : ""}" data-id="${e.id}">
        <input type="checkbox" ${selected.has(e.id) ? "checked" : ""} data-id="${e.id}" />
        <div class="meta">
          <div class="row">
            <div class="from">${escapeHtml(e.from.name)}</div>
            <time>${fmtTime(e.receivedAt)}</time>
          </div>
          <div class="subject">${escapeHtml(e.subject)}</div>
          <div class="snippet">${escapeHtml(e.snippet)}</div>
        </div>
      </li>`,
    )
    .join("");
}

function renderThreads(threads: Thread[]): void {
  lastVisibleIds = [];
  list.innerHTML = threads
    .map(
      (t) => `
      <li class="${t.unreadCount > 0 ? "unread" : "read"} thread">
        <div class="meta">
          <div class="row">
            <div class="from">${escapeHtml(t.participants.map((p) => p.name).join(", "))}</div>
            <time>${fmtTime(t.lastReceivedAt)}</time>
          </div>
          <div class="subject">${escapeHtml(t.subject)} <span class="count">${t.emails.length}</span></div>
          <div class="snippet">${t.unreadCount} unread</div>
        </div>
      </li>`,
    )
    .join("");
}

function updateActionBar(): void {
  const n = selected.size;
  selectionCount.textContent = `${n} selected`;
  actionBar.hidden = n === 0;
  archiveBtn.disabled = n === 0;
}

async function refreshStats(): Promise<void> {
  const s = await window.inbox.stats();
  const pendingLabel = s.pendingOps > 0 ? ` · ${s.pendingOps} pending ops` : "";
  stats.textContent = `${s.visible.toLocaleString()} visible / ${s.total.toLocaleString()} total${pendingLabel}`;
}

async function refresh(): Promise<void> {
  if (currentView === "threads") {
    const { result, durationMs, syncMs } = await withLoading("loading threads…", () =>
      window.inbox.threads(),
    );
    renderThreads(result);
    statusText.textContent = `${result.length} threads · buildThreads ${durationMs.toFixed(0)} ms · sync ${syncMs.toFixed(0)} ms`;
  } else {
    const q = search.value.trim();
    const label = q ? `searching "${q}"…` : "loading inbox…";
    const { result, durationMs, syncMs } = await withLoading(label, () =>
      q ? window.inbox.search(q) : window.inbox.list(),
    );
    renderEmails(result);
    const opLabel = q ? `search "${q}"` : "list";
    statusText.textContent = `${result.length} emails · ${opLabel} ${durationMs.toFixed(0)} ms · sync ${syncMs.toFixed(0)} ms`;
  }
  updateActionBar();
  refreshStats();
}

list.addEventListener("click", (evt) => {
  const target = evt.target as HTMLElement;
  if (target.tagName !== "INPUT") return;
  const id = target.getAttribute("data-id");
  if (!id) return;
  const li = target.closest("li");
  if ((target as HTMLInputElement).checked) {
    selected.add(id);
    li?.classList.add("selected");
  } else {
    selected.delete(id);
    li?.classList.remove("selected");
  }
  updateActionBar();
});

selectVisibleBtn.addEventListener("click", () => {
  for (const id of lastVisibleIds) selected.add(id);
  for (const cb of list.querySelectorAll<HTMLInputElement>("input[type=checkbox]")) {
    cb.checked = true;
  }
  for (const li of list.querySelectorAll<HTMLLIElement>("li")) {
    li.classList.add("selected");
  }
  updateActionBar();
});

clearSelectionBtn.addEventListener("click", () => {
  selected.clear();
  for (const cb of list.querySelectorAll<HTMLInputElement>("input[type=checkbox]")) {
    cb.checked = false;
  }
  for (const li of list.querySelectorAll<HTMLLIElement>("li")) {
    li.classList.remove("selected");
  }
  updateActionBar();
});

archiveBtn.addEventListener("click", async () => {
  if (selected.size === 0) return;
  const ids = [...selected];
  const { result, durationMs, syncMs } = await withLoading(`archiving ${ids.length}…`, () =>
    window.inbox.archive(ids),
  );
  selected.clear();
  await refresh();
  statusText.textContent = `archived ${result} · dispatch ${durationMs.toFixed(0)} ms (sync ${syncMs.toFixed(0)} ms)`;
});

search.addEventListener("input", () => {
  if (currentView !== "inbox") return;
  refresh();
});

for (const btn of navButtons) {
  btn.addEventListener("click", () => {
    for (const b of navButtons) b.classList.remove("active");
    btn.classList.add("active");
    currentView = btn.dataset.view as View;
    search.disabled = currentView !== "inbox";
    selectVisibleBtn.disabled = currentView !== "inbox";
    refresh();
  });
}

refresh();
