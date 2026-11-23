"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

type InstallChoice = {
  outcome: "accepted" | "dismissed";
  platform: string;
};

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
}

type InstallPlatform = "ios" | "android" | "desktop";

function getInstallInstructions(platform: InstallPlatform) {
  if (platform === "ios") {
    return "On iPhone or iPad, open this page in Safari, tap Share, then choose Add to Home Screen.";
  }
  if (platform === "android") {
    return "Open your browser menu and choose Install app or Add to Home screen.";
  }
  return "Use your browser's Install app option in the address bar or menu. On a phone, open this page in Safari or Chrome.";
}

export default function InstallAppButton() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [platform, setPlatform] = useState<InstallPlatform>("desktop");

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(isStandalone);

    const userAgent = navigator.userAgent;
    if (/iphone|ipad|ipod/i.test(userAgent)) setPlatform("ios");
    else if (/android/i.test(userAgent)) setPlatform("android");

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setShowInstructions(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  if (installed) return null;

  const handleInstall = async () => {
    if (!installPrompt) {
      setShowInstructions((visible) => !visible);
      return;
    }

    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
    } catch {
      setShowInstructions(true);
    } finally {
      setInstallPrompt(null);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        size="lg"
        variant="outline"
        aria-expanded={showInstructions}
        onClick={handleInstall}
      >
        <Download className="size-4" aria-hidden="true" />
        Install app
      </Button>
      {showInstructions && (
        <p role="status" className="max-w-sm text-left text-sm leading-relaxed text-muted-foreground">
          {getInstallInstructions(platform)}
        </p>
      )}
    </div>
  );
}
