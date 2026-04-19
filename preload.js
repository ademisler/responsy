const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("responsy", {
  getState() {
    return ipcRenderer.invoke("responsy:get-state");
  },
  loadUrl(input) {
    return ipcRenderer.invoke("responsy:load-url", input);
  },
  resizeWindow(view) {
    return ipcRenderer.invoke("responsy:resize-window", view);
  },
  setPanelOpen(open) {
    return ipcRenderer.invoke("responsy:set-panel-open", open);
  },
  togglePanel() {
    return ipcRenderer.invoke("responsy:toggle-panel");
  },
  navigate(action) {
    return ipcRenderer.invoke("responsy:navigate", action);
  },
  windowAction(action) {
    return ipcRenderer.invoke("responsy:window-action", action);
  },
  dragWindow(payload) {
    return ipcRenderer.invoke("responsy:drag-window", payload);
  },
  captureScreenshot(mode) {
    return ipcRenderer.invoke("responsy:capture-screenshot", mode);
  },
  onStateChange(callback) {
    const listener = (_event, state) => {
      callback(state);
    };

    ipcRenderer.on("responsy:state", listener);
    return () => {
      ipcRenderer.removeListener("responsy:state", listener);
    };
  },
  onNotice(callback) {
    const listener = (_event, payload) => {
      callback(payload);
    };

    ipcRenderer.on("responsy:notice", listener);
    return () => {
      ipcRenderer.removeListener("responsy:notice", listener);
    };
  }
});
