import { InputRule } from "@tiptap/core";
import { BlockMath, InlineMath } from "@tiptap/extension-mathematics";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { matchBlogInlineMath } from "../../../../../lib/blog/math.ts";
import { BlogMathView } from "../components/BlogMathView";

export const BlogInlineMath = InlineMath.extend({
  addNodeView() {
    return ReactNodeViewRenderer(BlogMathView);
  },
  addInputRules() {
    return [
      new InputRule({
        find: /(?<![\\$])\$([^$\n]+)\$$/,
        handler: ({ state, range, match }) => {
          const formula = matchBlogInlineMath(match[0]);
          if (!formula) return null;
          state.tr.replaceWith(range.from, range.to, this.type.create({ latex: formula.latex }));
        },
      }),
    ];
  },
});

export const BlogBlockMath = BlockMath.extend({
  addNodeView() {
    return ReactNodeViewRenderer(BlogMathView);
  },
  addInputRules() {
    return [
      new InputRule({
        find: /^\$\$([^$]+)\$\$$/,
        handler: ({ state, range, match }) => {
          const from = state.doc.resolve(range.from);
          if (!match[1].trim() || !from.node(-1).canReplaceWith(from.index(-1), from.indexAfter(-1), this.type))
            return null;
          state.tr.replaceWith(from.before(), from.after(), this.type.create({ latex: match[1].trim() }));
        },
      }),
    ];
  },
});
