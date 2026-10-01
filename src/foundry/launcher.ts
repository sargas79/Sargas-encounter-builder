/**
 * GM-only launchers: a scene-control tool (v13+ object API) and a button in the Actors sidebar header.
 * Both open the start dialog; the application itself re-checks `game.user.isGM`.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { MODULE_ID } from "../constants.js";
import { t } from "./i18n.js";

let registered = false;

export function registerLauncher(): void {
  if (registered) return;
  registered = true;

  Hooks.on("getSceneControlButtons", (controls: any) => {
    if (!game.user?.isGM || game.system?.id !== "pf2e") return;
    const group = controls?.tokens ?? controls?.notes;
    if (!group) return;
    if (Array.isArray(group.tools)) {
      group.tools.push({
        name: MODULE_ID,
        title: `${MODULE_ID}.app.title`,
        icon: "fa-solid fa-dragon",
        button: true,
        visible: true,
        onChange: () => void openEncounterBuilder(),
      });
    } else if (group.tools && typeof group.tools === "object") {
      group.tools[MODULE_ID] = {
        name: MODULE_ID,
        title: `${MODULE_ID}.app.title`,
        icon: "fa-solid fa-dragon",
        order: Object.keys(group.tools).length,
        button: true,
        visible: true,
        // onChange only: setting onClick as well fires the handler twice on v13+.
        onChange: () => void openEncounterBuilder(),
      };
    }
  });

  Hooks.on("renderActorDirectory", (_app: unknown, html: HTMLElement | { 0?: HTMLElement }) => {
    if (!game.user?.isGM || game.system?.id !== "pf2e") return;
    const root: HTMLElement | undefined =
      html instanceof HTMLElement ? html : (html as { 0?: HTMLElement })[0];
    if (!root) return;
    const header = root.querySelector<HTMLElement>(".directory-header .header-actions, .header-actions");
    if (!header || header.querySelector(`.${MODULE_ID}-launch`)) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `${MODULE_ID}-launch`;
    button.dataset.tooltip = t("app.launchTooltip");
    button.setAttribute("aria-label", t("app.title"));
    button.innerHTML = `<i class="fa-solid fa-dragon"></i> ${t("app.title")}`;
    button.addEventListener("click", () => void openEncounterBuilder());
    header.appendChild(button);
  });
}

export async function openEncounterBuilder({
  withDialog = true,
}: { withDialog?: boolean } = {}): Promise<void> {
  if (!game.user.isGM) {
    ui.notifications.warn(t("errors.gmOnly"));
    return;
  }
  const { EncounterBuilderApp } = await import("../apps/encounter-builder-app.js");
  await EncounterBuilderApp.open({ withDialog });
}
