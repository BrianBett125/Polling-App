"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

type Props = {
  label?: string;
  className?: string;
};

export function ConfirmDeleteButton({ label = "Delete", className }: Props) {
  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const ok = window.confirm("Are you sure you want to delete this poll? This action cannot be undone.");
    if (ok) {
      // Submit the closest parent form
      (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
    }
  };

  return (
    <Button variant="destructive" className={className} type="button" onClick={onClick}>
      {label}
    </Button>
  );
}