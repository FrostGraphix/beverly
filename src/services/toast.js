import Vue from "vue";

const bus = new Vue();
let _id = 0;

export const toastBus = bus;

export function toast(message, type = "success", duration = 4000) {
  bus.$emit("toast:add", { id: ++_id, message, type, duration });
}

export function toastSuccess(message) { toast(message, "success", 4000); }
export function toastError(message)   { toast(message, "error",   5000); }
export function toastInfo(message)    { toast(message, "info",    3500); }
export function toastWarn(message)    { toast(message, "warning", 4500); }
