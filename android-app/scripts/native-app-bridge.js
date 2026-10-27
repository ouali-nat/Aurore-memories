import { App } from "@capacitor/app";
import { LiveUpdate } from "@capawesome/capacitor-live-update";

// Expose the native modules to the existing, non-module page scripts.
// live-update-client.js confirms the active bundle after the page DOM is ready.
window.auroreNativeApp = App;
window.auroreLiveUpdate = LiveUpdate;
