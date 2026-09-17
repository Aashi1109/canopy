ALTER TABLE managed_tools
  DROP CONSTRAINT IF EXISTS managed_tools_app_check;

ALTER TABLE managed_tools
  ADD CONSTRAINT managed_tools_app_check
  CHECK (app IN ('paperwork', 'devtools', 'media'));

INSERT INTO managed_tools (
  tool_id,
  app,
  slug,
  name,
  description,
  sort_order,
  enabled,
  archived
)
VALUES
  ('media.image-to-pdf', 'media', 'image-to-pdf', 'Image to PDF', 'Convert JPG, PNG, WebP, or HEIC images into a PDF.', 0, TRUE, FALSE),
  ('media.pdf-to-jpg', 'media', 'pdf-to-jpg', 'PDF to JPG', 'Render PDF pages as downloadable JPG images.', 1, TRUE, FALSE),
  ('media.pdf-to-png', 'media', 'pdf-to-png', 'PDF to PNG', 'Render PDF pages as downloadable PNG images.', 2, TRUE, FALSE),
  ('media.merge-pdf', 'media', 'merge-pdf', 'Merge PDF', 'Combine multiple PDFs in the order you choose.', 3, TRUE, FALSE),
  ('media.split-pdf', 'media', 'split-pdf', 'Split PDF', 'Split a PDF by page, group size, or page range.', 4, TRUE, FALSE),
  ('media.extract-pdf-pages', 'media', 'extract-pdf-pages', 'Extract PDF Pages', 'Create a new PDF from selected pages.', 5, TRUE, FALSE),
  ('media.reorder-pdf-pages', 'media', 'reorder-pdf-pages', 'Reorder PDF Pages', 'Arrange PDF pages into a new order.', 6, TRUE, FALSE),
  ('media.rotate-pdf-pages', 'media', 'rotate-pdf-pages', 'Rotate PDF Pages', 'Rotate all or selected pages in a PDF.', 7, TRUE, FALSE),
  ('media.delete-pdf-pages', 'media', 'delete-pdf-pages', 'Delete PDF Pages', 'Remove selected pages from a PDF.', 8, TRUE, FALSE),
  ('media.crop-pdf', 'media', 'crop-pdf', 'Crop PDF', 'Set a new visible crop area for PDF pages.', 9, TRUE, FALSE),
  ('media.resize-pdf-pages', 'media', 'resize-pdf-pages', 'Resize PDF Pages', 'Resize PDF pages to standard or custom dimensions.', 10, TRUE, FALSE),
  ('media.compress-pdf', 'media', 'compress-pdf', 'Compress PDF', 'Reduce PDF file size locally with document-preserving or strong compression.', 11, TRUE, FALSE),
  ('media.watermark-pdf', 'media', 'watermark-pdf', 'Watermark PDF', 'Add a text or image watermark to PDF pages.', 12, TRUE, FALSE),
  ('media.add-page-numbers', 'media', 'add-page-numbers', 'Add Page Numbers', 'Place configurable page numbers on a PDF.', 13, TRUE, FALSE),
  ('media.jpg-to-png', 'media', 'jpg-to-png', 'JPG to PNG', 'Convert JPG images to PNG.', 14, TRUE, FALSE),
  ('media.png-to-jpg', 'media', 'png-to-jpg', 'PNG to JPG', 'Convert PNG images to JPG.', 15, TRUE, FALSE),
  ('media.jpg-to-webp', 'media', 'jpg-to-webp', 'JPG to WebP', 'Convert JPG images to WebP.', 16, TRUE, FALSE),
  ('media.png-to-webp', 'media', 'png-to-webp', 'PNG to WebP', 'Convert PNG images to WebP.', 17, TRUE, FALSE),
  ('media.webp-to-jpg', 'media', 'webp-to-jpg', 'WebP to JPG', 'Convert WebP images to JPG.', 18, TRUE, FALSE),
  ('media.webp-to-png', 'media', 'webp-to-png', 'WebP to PNG', 'Convert WebP images to PNG.', 19, TRUE, FALSE),
  ('media.heic-to-jpg', 'media', 'heic-to-jpg', 'HEIC to JPG', 'Convert HEIC images to JPG.', 20, TRUE, FALSE),
  ('media.heic-to-png', 'media', 'heic-to-png', 'HEIC to PNG', 'Convert HEIC images to PNG.', 21, TRUE, FALSE),
  ('media.compress-image', 'media', 'compress-image', 'Compress Image', 'Reduce image file size while keeping its format and dimensions.', 22, TRUE, FALSE),
  ('media.resize-image', 'media', 'resize-image', 'Resize Image', 'Resize one or more images by pixels or percentage.', 23, TRUE, FALSE),
  ('media.crop-image', 'media', 'crop-image', 'Crop Image', 'Crop an image freely or to a common aspect ratio.', 24, TRUE, FALSE),
  ('media.rotate-image', 'media', 'rotate-image', 'Rotate Image', 'Rotate images by 90, 180, or 270 degrees.', 25, TRUE, FALSE),
  ('media.flip-image', 'media', 'flip-image', 'Flip Image', 'Flip images horizontally or vertically.', 26, TRUE, FALSE),
  ('media.combine-images', 'media', 'combine-images', 'Combine Images', 'Join images horizontally, vertically, or in a grid.', 27, TRUE, FALSE),
  ('media.remove-image-metadata', 'media', 'remove-image-metadata', 'Remove Image Metadata', 'Strip EXIF, ICC, and comment metadata by re-encoding an image.', 28, TRUE, FALSE),
  ('media.social-media-image-resizer', 'media', 'social-media-image-resizer', 'Social Media Image Resizer', 'Resize images for common social platform dimensions.', 29, TRUE, FALSE)
ON CONFLICT (tool_id) DO NOTHING;
