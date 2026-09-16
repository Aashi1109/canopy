export interface SandboxedHtmlPreviewProps {
  html: string;
}

export function SandboxedHtmlPreview({ html }: SandboxedHtmlPreviewProps) {
  return <iframe className="min-h-80 w-full flex-1 bg-white" sandbox="" srcDoc={html} title="Generated HTML preview" />;
}
