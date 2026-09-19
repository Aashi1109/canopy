"use client";

import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { Heading2, Heading3, Heading4, Heading5, Heading6, Pilcrow } from "lucide-react";
import { Button, Popover } from "@/components/ui/index.tsx";

export function BlogHeadingMenuItems({ editor }: { editor: Editor | null }) {
  const level = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current?.isActive("heading")
        ? Number(current.getAttributes("heading").level)
        : current?.isActive("paragraph")
          ? 0
          : null,
  });
  return (
    <div className="flex flex-col gap-1">
      {(
        [
          [0, Pilcrow],
          [2, Heading2],
          [3, Heading3],
          [4, Heading4],
          [5, Heading5],
          [6, Heading6],
        ] as const
      ).map(([heading, Icon]) => (
        <Popover.Close key={heading} asChild>
          <Button
            size="xs"
            variant="ghost"
            aria-pressed={level === heading}
            className={`justify-start text-sm font-normal max-md:min-h-11 [@media(pointer:coarse)]:min-h-11 ${level === heading ? "bg-accent text-accent-foreground" : ""}`}
            onClick={() => {
              if (heading === 0) editor?.chain().focus().setParagraph().run();
              else editor?.chain().focus().setHeading({ level: heading }).run();
            }}
          >
            <Icon aria-hidden="true" />
            {heading === 0 ? "Paragraph" : `Heading ${heading}`}
          </Button>
        </Popover.Close>
      ))}
    </div>
  );
}
