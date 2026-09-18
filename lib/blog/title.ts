export const BLOG_TITLE_WORD_LIMIT = 20;

export function blogTitleWordCount(title: string): number {
  return title.match(/\S+/gu)?.length ?? 0;
}
