-- Update the shipped catalog description; preserve administrator-written copy.
UPDATE managed_tools
SET description = 'Preview a website’s social sharing cards and inspect its Open Graph metadata.',
    updated_at = now()
WHERE tool_id = 'devtools.open-graph-preview'
  AND description = 'Generate Open Graph tags and a sandboxable preview card.';
