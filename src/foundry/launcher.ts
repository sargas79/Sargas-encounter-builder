/**
 * GM-only launcher: a button in the Actors sidebar directory header plus a scene-control tool.
 * Both are only rendered for GMs; the application itself re-checks `game.user.isGM`.
 */
import { MODULE_ID } from "../constants.js";
import { t } from "./i18n.js";

let registered = false;

export function registerLauncher(): void {
  if (registered) return;
  registered = true;

  Hooks.on("renderActorDirectory", (_app: unknown, html: HTMLElement | { 0?: HTMLElement }) => {
    if (!game.user.isGM) return;
    const root: HTMLElement | undefined =
      html instanceof HTMLElement ? html : (html as { 0?: HTMLElement })[0];
    if (!root) return;
    const header = root.querySelector<HTMLElement>(".directory-header .header-actions, .header-actions");
    if (!header || header.querySelector(`.${MODULE_ID}-launch`)) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `${MODULE_ID}-launch`;
    button.innerHTML = `<i class="fa-solid fa-dragon"></i> ${t("app.title")}`;
    button.addEventListener("click", () => void openEncounterBuilder());
    header.appendChild(button);
  });
}

export async function openEncounterBuilder(): Promise<void> {
  if (!game.user.isGM) {
    ui.notifications.warn(t("errors.gmOnly"));
    return;
  }
  const { EncounterBuilderApp } = await import("../apps/encounter-builder-app.js");
  await EncounterBuilderApp.open();
}
