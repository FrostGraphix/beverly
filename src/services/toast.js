const listeners = new Map();

let _id = 0;

export const toastBus = {
  $on(event, handler) {
    const handlers = listeners.get(event) || new Set();
    handlers.add(handler);
    listeners.set(event, handlers);
  },
  $off(event, handler) {
    const handlers = listeners.get(event);
    if (!handlers) return;
    handlers.delete(handler);
    if (!handlers.size) listeners.delete(event);
  },
  $emit(event, payload) {
    const handlers = listeners.get(event);
    if (!handlers) return;
    for (const handler of handlers) handler(payload);
  }
};

export function toast(message, type = "success", duration = 4000) {
  toastBus.$emit("toast:add", { id: ++_id, message, type, duration });
}

export function toastSuccess(message) { toast(message, "success", 4000); }
export function toastError(message)   { toast(message, "error",   5000); }
export function toastInfo(message)    { toast(message, "info",    3500); }
export function toastWarn(message)    { toast(message, "warning", 4500); }
