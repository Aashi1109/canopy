"use client";

import { Button } from "@smarttools/ui";
import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

export function SubmitButton({ formAction, ...props }: ComponentProps<typeof Button>) {
  const { pending, action } = useFormStatus();
  return (
    <Button
      {...props}
      disabled={props.disabled || pending}
      formAction={formAction}
      loading={pending && (!formAction || action === formAction)}
      type="submit"
    />
  );
}
