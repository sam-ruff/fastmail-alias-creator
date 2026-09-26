import { useCallback, useEffect, useRef, useState } from "preact/hooks";

export interface Toast {
  message: string;
  tone: "info" | "error";
}

export function useToast(durationMs = 2500) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const show = useCallback(
    (message: string, tone: Toast["tone"] = "info") => {
      clearTimeout(timer.current);
      setToast({ message, tone });
      timer.current = setTimeout(
        () => setToast(null),
        tone === "error" ? durationMs * 2 : durationMs,
      );
    },
    [durationMs],
  );

  return { toast, show };
}
