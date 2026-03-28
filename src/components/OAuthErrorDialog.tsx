import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type OauthErrorPayload = {
  message: string;
  kind: string;
};

function titleForKind(kind: string): string {
  switch (kind) {
    case "device_limit":
      return "Device limit reached";
    case "expired":
      return "Sign-in expired";
    case "state_mismatch":
      return "Sign-in session expired";
    case "invalid_link":
      return "Invalid or incomplete link";
    case "invalid_response":
      return "Could not complete sign-in";
    default:
      return "Sign-in failed";
  }
}

export function OAuthErrorDialog({
  payload,
  onDismiss,
}: {
  payload: OauthErrorPayload;
  onDismiss: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent className="max-w-[400px] gap-4 p-6 sm:max-w-[400px]">
        <DialogHeader className="gap-2 space-y-0 text-left">
          <DialogTitle className="font-montserrat text-lg font-bold leading-snug text-white">
            {titleForKind(payload.kind)}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-ab-tertiary">
            {payload.message}
          </DialogDescription>
        </DialogHeader>
        <button
          type="button"
          onClick={onDismiss}
          className="w-full rounded-[15px] border-none bg-ab-primary py-2.5 font-sans text-[11px] font-bold text-black hover:brightness-105"
        >
          OK
        </button>
      </DialogContent>
    </Dialog>
  );
}
