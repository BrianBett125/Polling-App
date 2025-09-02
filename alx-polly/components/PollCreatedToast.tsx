"use client";

import * as Toast from "@radix-ui/react-toast";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function PollCreatedToast() {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Show toast when redirected with ?created=1, then clean the URL
    if (searchParams.get("created") === "1") {
      setOpen(true);
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("created");
        window.history.replaceState({}, "", url.toString());
      } catch {
        // no-op if URL API not available
      }
    }
  }, [searchParams]);

  return (
    <Toast.Provider swipeDirection="right">
      <Toast.Root
        open={open}
        onOpenChange={setOpen}
        className="bg-green-600 text-white rounded-md px-4 py-3 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
      >
        <Toast.Title className="font-semibold">Poll created</Toast.Title>
        <Toast.Description className="text-sm/6 opacity-90">
          Your poll is ready to share and collect votes.
        </Toast.Description>
      </Toast.Root>
      <Toast.Viewport className="fixed bottom-4 right-4 z-50 outline-none" />
    </Toast.Provider>
  );
}