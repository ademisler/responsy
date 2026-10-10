const body = document.body;
const drawer = document.getElementById("drawer");
const togglePanelButton = document.getElementById("toggle-panel");
const collapsePanelButton = document.getElementById("collapse-panel");
const urlForm = document.getElementById("url-form");
const urlInput = document.getElementById("url-input");
const addressField = document.querySelector(".address-field input");
const viewButtons = Array.from(document.querySelectorAll(".view-switcher button"));
const navButtons = Array.from(document.querySelectorAll("[data-nav]"));
const captureButtons = Array.from(document.querySelectorAll("[data-shot]"));
const statusText = document.getElementById("status-text");
const windowActionButtons = Array.from(document.querySelectorAll("[data-window-action]"));

let currentState = {
  activeView: "mobile",
  panelOpen: false,
  loading: false,
  loadingTarget: "",
  url: "",
  title: "Responsy",
  canGoBack: false,
  canGoForward: false
};
let noticeText = "";
let noticeTimer = null;
let handleGesture = null;

function setPanelOpen(panelOpen) {
  body.classList.toggle("open", panelOpen);
  body.classList.toggle("collapsed", !panelOpen);
  drawer?.setAttribute("aria-hidden", String(!panelOpen));
}

function setInputInvalid(isInvalid) {
  addressField.classList.toggle("invalid", isInvalid);
}

function setNotice(message) {
  noticeText = message || "";
  if (noticeTimer) {
    window.clearTimeout(noticeTimer);
    noticeTimer = null;
  }

  if (noticeText) {
    noticeTimer = window.setTimeout(() => {
      noticeText = "";
      syncStatusText();
    }, 3200);
  }

  syncStatusText();
}

function getDefaultStatusText() {
  if (currentState.loading) {
    const target = currentState.loadingTarget || currentState.url || currentState.title;
    return target ? `Loading ${target}` : "Loading preview";
  }

  if (currentState.url) {
    return currentState.title || currentState.url;
  }

  return "Open the slim tab on the right.";
}

function syncStatusText() {
  statusText.textContent = noticeText || getDefaultStatusText();
}

function updateViewButtons(activeView) {
  viewButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === activeView);
  });
}

function updateNavButtons(state) {
  navButtons.forEach((button) => {
    if (button.dataset.nav === "back") {
      button.disabled = !state.canGoBack;
      return;
    }

    if (button.dataset.nav === "forward") {
      button.disabled = !state.canGoForward;
    }
  });
}

function renderState(nextState) {
  currentState = { ...currentState, ...nextState };
  setPanelOpen(Boolean(currentState.panelOpen));
  updateViewButtons(currentState.activeView || "mobile");
  updateNavButtons(currentState);

  if (currentState.url && document.activeElement !== urlInput) {
    urlInput.value = currentState.url;
  }

  syncStatusText();

  if (nextState.focusAddress) {
    requestAnimationFrame(() => {
      urlInput.focus();
      urlInput.select();
    });
  }
}

async function refreshState() {
  if (!window.responsy?.getState) {
    return;
  }

  const state = await window.responsy.getState();
  if (state) {
    renderState(state);
  }
}

async function finishHandleGesture(event, cancelled = false) {
  if (!handleGesture || event.pointerId !== handleGesture.pointerId) {
    return;
  }

  const gesture = handleGesture;
  handleGesture = null;

  if (togglePanelButton?.hasPointerCapture(gesture.pointerId)) {
    togglePanelButton.releasePointerCapture(gesture.pointerId);
  }

  togglePanelButton?.classList.remove("dragging");

  if (gesture.dragging || cancelled) {
    await window.responsy?.dragWindow?.({ phase: "end" });
    return;
  }

  await window.responsy?.togglePanel?.();
}

togglePanelButton?.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  handleGesture = {
    pointerId: event.pointerId,
    startScreenX: event.screenX,
    startScreenY: event.screenY,
    dragging: false
  };
  togglePanelButton.setPointerCapture(event.pointerId);
});

togglePanelButton?.addEventListener("pointermove", (event) => {
  if (!handleGesture || event.pointerId !== handleGesture.pointerId) {
    return;
  }

  const delta = Math.hypot(event.screenX - handleGesture.startScreenX, event.screenY - handleGesture.startScreenY);
  if (!handleGesture.dragging && delta > 6) {
    handleGesture.dragging = true;
    togglePanelButton.classList.add("dragging");
    void window.responsy?.dragWindow?.({
      phase: "start",
      screenX: handleGesture.startScreenX,
      screenY: handleGesture.startScreenY
    });
  }

  if (handleGesture.dragging) {
    void window.responsy?.dragWindow?.({
      phase: "move",
      screenX: event.screenX,
      screenY: event.screenY
    });
  }
});

togglePanelButton?.addEventListener("pointerup", (event) => {
  void finishHandleGesture(event);
});

togglePanelButton?.addEventListener("pointercancel", (event) => {
  void finishHandleGesture(event, true);
});

collapsePanelButton?.addEventListener("click", async () => {
  await window.responsy?.setPanelOpen?.(false);
});

urlForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const result = await window.responsy?.loadUrl?.(urlInput.value);
  setInputInvalid(!result?.ok);

  if (result?.ok) {
    renderState({ url: result.url || urlInput.value, loading: true });
  }
});

viewButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const view = button.dataset.view;
    const result = await window.responsy?.resizeWindow?.(view);
    if (result?.ok) {
      renderState({ activeView: result.view || view });
    }
  });
});

navButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const action = button.dataset.nav;
    await window.responsy?.navigate?.(action);
  });
});

captureButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const mode = button.dataset.shot;
    if (!mode) {
      return;
    }

    button.disabled = true;
    try {
      await window.responsy?.captureScreenshot?.(mode);
    } finally {
      button.disabled = false;
    }
  });
});

windowActionButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    await window.responsy?.windowAction?.(button.dataset.windowAction);
  });
});

window.addEventListener("keydown", async (event) => {
  const isMeta = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();

  if (isMeta && key === "l") {
    event.preventDefault();
    await window.responsy?.setPanelOpen?.(true);
    return;
  }

  if (key === "escape" && currentState.panelOpen) {
    event.preventDefault();
    await window.responsy?.setPanelOpen?.(false);
  }
});

window.responsy?.onStateChange?.((state) => {
  renderState(state);
});

window.responsy?.onNotice?.((payload) => {
  if (payload?.message) {
    setNotice(payload.message);
  }
});

void refreshState();
