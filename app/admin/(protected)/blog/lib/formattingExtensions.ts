import { Extension, Mark, Node, mergeAttributes } from "@tiptap/core";

const marks = ([['highlight', 'mark'], ['superscript', 'sup'], ['subscript', 'sub']] as const).map(([name, tag]) => Mark.create({
  name,
  excludes: name === 'superscript' ? 'subscript' : name === 'subscript' ? 'superscript' : 'highlight',
  addAttributes: () => name === 'highlight' ? { color: {
    default: null,
    parseHTML: element => {
      const color = element.getAttribute('data-color') ?? element.style.backgroundColor;
      if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
      const rgb = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(color);
      return rgb && rgb.slice(1).every(value => Number(value) <= 255)
        ? `#${rgb.slice(1).map(value => Number(value).toString(16).padStart(2, '0')).join('')}` : null;
    },
    renderHTML: attributes => typeof attributes.color === 'string' && /^#[0-9a-f]{6}$/i.test(attributes.color)
      ? { 'data-color': attributes.color.toLowerCase(), style: `background-color: ${attributes.color.toLowerCase()}` } : {},
  } } : {},
  parseHTML: () => [{ tag }],
  renderHTML: ({ HTMLAttributes }) => [tag, HTMLAttributes, 0],
}));

const alignment = Extension.create({
  name: 'blogAlignment',
  addGlobalAttributes() {
    return [{ types: ['paragraph', 'heading'], attributes: { textAlign: {
      default: null,
      parseHTML: element => ['left', 'center', 'right', 'justify'].includes(element.style.textAlign) ? element.style.textAlign : null,
      renderHTML: attributes => attributes.textAlign ? { style: `text-align: ${attributes.textAlign}` } : {},
    } } }];
  },
});

const taskList = Node.create({
  name: 'taskList', group: 'block list', content: 'taskItem+',
  parseHTML: () => [{ tag: 'ul[data-type="taskList"]' }],
  renderHTML: ({ HTMLAttributes }) => ['ul', mergeAttributes(HTMLAttributes, { 'data-type': 'taskList' }), 0],
});
const taskItem = Node.create({
  name: 'taskItem', content: 'paragraph block*', defining: true,
  addAttributes: () => ({ checked: { default: false, parseHTML: element => element.getAttribute('data-checked') === 'true' } }),
  parseHTML: () => [{ tag: 'li[data-type="taskItem"]' }],
  renderHTML: ({ node, HTMLAttributes }) => ['li', mergeAttributes(HTMLAttributes, { 'data-type': 'taskItem', 'data-checked': node.attrs.checked }), ['input', { type: 'checkbox', checked: node.attrs.checked ? '' : undefined }], ['div', {}, 0]],
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('li');
      dom.dataset.type = 'taskItem';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox'; checkbox.checked = node.attrs.checked; checkbox.setAttribute('aria-label', 'Mark item complete');
      checkbox.contentEditable = 'false';
      checkbox.addEventListener('change', () => {
        const pos = getPos();
        if (!editor.isEditable || typeof pos !== 'number') { checkbox.checked = node.attrs.checked; return; }
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...editor.state.doc.nodeAt(pos)?.attrs, checked: checkbox.checked }));
      });
      const contentDOM = document.createElement('div'); dom.append(checkbox, contentDOM);
      return { dom, contentDOM, update(updated) { if (updated.type.name !== 'taskItem') return false; node = updated; checkbox.checked = node.attrs.checked; return true; } };
    };
  },
  addKeyboardShortcuts() {
    return { Enter: () => this.editor.commands.splitListItem('taskItem'), Tab: () => this.editor.commands.sinkListItem('taskItem'), 'Shift-Tab': () => this.editor.commands.liftListItem('taskItem') };
  },
});

export const blogFormattingExtensions = [...marks, alignment, taskList, taskItem];
