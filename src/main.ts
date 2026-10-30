import "./style.css";
import { henry } from "./content/henry";
import { App } from "./ui/app";

const app = new App(henry, document.getElementById("app")!);

// Add ?debug to the URL to inspect the running game from the browser console.
if (new URLSearchParams(location.search).has("debug")) {
  (window as unknown as { app: App }).app = app;
}
