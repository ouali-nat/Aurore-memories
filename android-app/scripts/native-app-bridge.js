import { App } from "@capacitor/app";

// Expose the native deep-link event to the existing, non-module auth.js.
window.auroreNativeApp = App;
