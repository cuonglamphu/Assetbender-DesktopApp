/** Custom events so the footer About dialog can trigger the same check as {@link AppUpdateDialog}. */

export const UPDATE_CHECK_REQUEST = "assetbender:check-for-update";

export const UPDATE_CHECK_DONE = "assetbender:update-check-done";

export type UpdateCheckDoneDetail = {
  result: "none" | "update";
};

export function requestUpdateCheck(): void {
  window.dispatchEvent(new CustomEvent(UPDATE_CHECK_REQUEST));
}
