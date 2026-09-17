"use client";

import { useId } from "react";
import { NodeViewContent, NodeViewWrapper, useEditorState, type NodeViewProps } from "@tiptap/react";
import { CheckboxControl } from "@canopy/ui";
import styles from "./BlogEditor.module.css";

export function BlogTaskItemView({ editor, node, updateAttributes }: NodeViewProps) {
  const labelId = useId();
  const editable = useEditorState({ editor, selector: ({ editor }) => editor.isEditable });

  return (
    <NodeViewWrapper className={styles.taskItemRow}>
      <span contentEditable={false} className={styles.taskCheckbox}>
        <CheckboxControl
          className="size-4"
          aria-label="Mark item complete"
          aria-describedby={labelId}
          checked={node.attrs.checked === true}
          disabled={!editable}
          onCheckedChange={(checked) => {
            if (editor.isEditable) updateAttributes({ checked: checked === true });
          }}
        />
      </span>
      <NodeViewContent id={labelId} className={styles.taskItemContent} />
    </NodeViewWrapper>
  );
}
