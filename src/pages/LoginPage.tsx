import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { HomeFooter } from "../components/HomeFooter";
import { VITE_FRONTEND_URL } from "../config/env";
import { cn } from "@/lib/utils";

/**
 * Khớp Master-Mouse `login_page.dart` + `login_section.dart` + `login_cta.dart`:
 * padding 8, gap 10, vùng accent bo 10px, slide từ phải 1s (easeInOutQuart),
 * card 280×200 secondary, Welcome + nút shimmer 5s, "No Account? Create One".
 */
export function LoginPage() {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setErr(null);
    setBusy(true);
    try {
      const { authUrl } = await invoke<{ authUrl: string; state: string }>(
        "oauth_start",
      );
      await openUrl(authUrl);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function signUp() {
    await openUrl(
      `${VITE_FRONTEND_URL.replace(/\/$/, "")}/get-started?from=app`,
    );
  }

  const noop = () => {};

  return (
    <div className="box-border flex h-full min-h-0 flex-col gap-[10px] bg-ab-bg p-2 font-sans">
      <section
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] bg-ab-accent"
        aria-label="Sign in"
      >
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col items-center justify-center",
            "animate-ab-login-slide",
            "motion-reduce:animate-none motion-reduce:translate-x-0 motion-reduce:opacity-100",
          )}
        >
          <div
            className={cn(
              "flex h-[200px] w-[280px] flex-col items-center justify-center rounded-[15px] bg-ab-bg",
              "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
            )}
          >
            <p className="text-xs font-bold text-white">Welcome!</p>
            <div className="mt-[15px] flex w-full flex-col items-center">
              <div className="relative h-[30px] w-[220px] overflow-hidden rounded-[10px] bg-ab-primary">
                <span
                  className="pointer-events-none absolute inset-0 block overflow-hidden rounded-[10px]"
                  aria-hidden
                >
                  <span
                    className={cn(
                      "absolute inset-y-0 left-0 w-[55%] bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-90",
                      "animate-ab-login-shimmer",
                      "motion-reduce:hidden",
                    )}
                  />
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void signIn()}
                  className={cn(
                    "relative z-[1] flex h-full w-full items-center justify-center rounded-[10px] border-none",
                    "bg-transparent font-sans text-xs font-bold text-black",
                    "hover:enabled:brightness-105 disabled:cursor-not-allowed disabled:opacity-55",
                  )}
                >
                  {busy ? "Opening browser…" : "Log in with browser"}
                </button>
              </div>

              {err ? (
                <p className="mt-2 max-w-[220px] text-center text-[11px] text-ab-error">
                  {err}
                </p>
              ) : null}

              <div className="mt-4 flex flex-row items-center justify-center gap-0 text-xs font-semibold">
                <span className="text-white">No Account? </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void signUp()}
                  className="border-none bg-transparent p-0 font-semibold text-ab-primary hover:underline disabled:opacity-55"
                >
                  Create One
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <HomeFooter
        userFirstName={undefined}
        onRefresh={noop}
        onGetMore={noop}
        onMyAccount={noop}
        onTutorials={noop}
        onLogout={noop}
      />
    </div>
  );
}
