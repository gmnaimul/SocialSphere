import { toast } from "sonner";

const baseOptions = {
  position: "bottom-right" as const,
};

const getErrorMessage = (error: unknown) => {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "Something went wrong.");
  }
  return "Something went wrong.";
};

export const appToast = {
  settingsSaved: () =>
    toast.success("Settings saved ✓", {
      ...baseOptions,
      duration: 2000,
      className: "toast-success",
    }),
  postShared: () =>
    toast("Post shared!", {
      ...baseOptions,
      duration: 3000,
      className: "toast-info",
    }),
  friendRequestSent: () =>
    toast("Friend request sent!", {
      ...baseOptions,
      duration: 3000,
      className: "toast-info",
    }),
  friendRequestAccepted: () =>
    toast("Friend request accepted!", {
      ...baseOptions,
      duration: 3000,
      className: "toast-success",
    }),
  error: (error: unknown) =>
    toast.error(getErrorMessage(error), {
      ...baseOptions,
      duration: Infinity,
      closeButton: true,
      className: "toast-error",
    }),
};
