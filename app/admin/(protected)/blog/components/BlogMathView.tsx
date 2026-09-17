"use client";

import { useId, useState } from "react";
import { NodeViewWrapper, useEditorState, type NodeViewProps } from "@tiptap/react";
import { Button, Label, Popover, Textarea } from "@canopy/ui";
import { MAX_BLOG_MATH_LENGTH, renderBlogMath } from "@/lib/blog/math";

export function BlogMathView({ editor, node, updateAttributes }: NodeViewProps) {
  const id = useId();
  const editable = useEditorState({ editor, selector: ({ editor }) => editor.isEditable });
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState(String(node.attrs.latex ?? ""));
  const block = node.type.name === "blockMath";
  const rendered = renderBlogMath(String(node.attrs.latex ?? ""), block);
  const preview = renderBlogMath(source, block);

  return (
    <NodeViewWrapper
      as={block ? "div" : "span"}
      className={block ? "my-3 max-w-full overflow-x-auto" : "inline"}
      contentEditable={false}
    >
      <Popover.Root
        open={open}
        onOpenChange={(value) => {
          setSource(String(node.attrs.latex ?? ""));
          setOpen(value);
        }}
      >
        <Popover.Trigger asChild>
          <Button
            type="button"
            variant="ghost"
            disabled={!editable}
            aria-label="Edit math formula"
            className={`h-auto max-w-full whitespace-normal px-1 py-0 text-inherit ${block ? "w-full" : "inline-flex"}`}
          >
            <span
              className={rendered.error ? "whitespace-pre-wrap font-mono text-sm text-destructive" : ""}
              dangerouslySetInnerHTML={{ __html: rendered.html }}
            />
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={8}
            className="z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover p-3 text-popover-foreground shadow-md"
          >
            <Label htmlFor={id}>LaTeX formula</Label>
            <Textarea
              id={id}
              value={source}
              maxLength={MAX_BLOG_MATH_LENGTH}
              className="mt-2 font-mono text-sm"
              rows={4}
              onChange={(event) => setSource(event.target.value)}
            />
            {preview.error && (
              <p role="status" className="mt-2 text-sm text-destructive">
                Unable to render this formula. Correct the LaTeX source and apply again.
              </p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!source.trim() || !editable}
                onClick={() => {
                  if (editor.isEditable) updateAttributes({ latex: source });
                  setOpen(false);
                }}
              >
                Apply
              </Button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </NodeViewWrapper>
  );
}
