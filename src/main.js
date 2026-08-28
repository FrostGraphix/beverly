import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { initLocale } from "@beverly/tokens";
import { installGlobalErrorHandlers, recordClientError } from "./services/error-logger.mjs";
import "./styles/reference.css";

installGlobalErrorHandlers();
initLocale();

const app = createApp(App);
app.config.errorHandler = (error, _instance, info) => {
  recordClientError("vue-error", error, { info: String(info || "") });
};
app.use(createPinia()).mount("#app");
