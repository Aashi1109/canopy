export interface Dimensions {
  width: number;
  height: number;
}

export interface Rectangle extends Dimensions {
  x: number;
  y: number;
}

export type FitMode = "contain" | "cover" | "stretch";
export type QuarterTurn = 0 | 90 | 180 | 270;
export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export function calculateResizeDimensions(
  source: Dimensions,
  options: {
    width?: number;
    height?: number;
    percentage?: number;
    lockAspectRatio: boolean;
    noUpscale: boolean;
  },
): Dimensions {
  assertDimensions(source);
  const { width, height, percentage, lockAspectRatio, noUpscale } = options;

  if (percentage !== undefined) {
    assertPositive(percentage, "Percentage");
    const scale = noUpscale ? Math.min(percentage / 100, 1) : percentage / 100;
    return scaledDimensions(source, scale, scale);
  }

  if (!lockAspectRatio) {
    const target = {
      width: width ?? source.width,
      height: height ?? source.height,
    };
    assertDimensions(target);
    return {
      width: roundDimension(noUpscale ? Math.min(target.width, source.width) : target.width),
      height: roundDimension(noUpscale ? Math.min(target.height, source.height) : target.height),
    };
  }

  if (width === undefined && height === undefined) return { ...source };
  if (width !== undefined) assertPositive(width, "Width");
  if (height !== undefined) assertPositive(height, "Height");

  const widthScale = width === undefined ? Number.POSITIVE_INFINITY : width / source.width;
  const heightScale = height === undefined ? Number.POSITIVE_INFINITY : height / source.height;
  let scale = Math.min(widthScale, heightScale);
  if (noUpscale) scale = Math.min(scale, 1);
  return scaledDimensions(source, scale, scale);
}

export function fitRect(
  source: Dimensions,
  target: Dimensions,
  mode: FitMode,
): Rectangle & { scaleX: number; scaleY: number } {
  assertDimensions(source);
  assertDimensions(target);

  if (mode === "stretch") {
    return {
      x: 0,
      y: 0,
      width: target.width,
      height: target.height,
      scaleX: target.width / source.width,
      scaleY: target.height / source.height,
    };
  }
  if (mode !== "contain" && mode !== "cover") {
    throw new RangeError(`Unknown fit mode: ${mode}`);
  }

  const scale =
    mode === "contain"
      ? Math.min(target.width / source.width, target.height / source.height)
      : Math.max(target.width / source.width, target.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  return {
    x: (target.width - width) / 2,
    y: (target.height - height) / 2,
    width,
    height,
    scaleX: scale,
    scaleY: scale,
  };
}

export function normalizeCropRect(crop: Rectangle, bounds: Dimensions): Rectangle {
  assertDimensions(bounds);
  assertDimensions(crop);
  const x = clamp(crop.x, 0, bounds.width);
  const y = clamp(crop.y, 0, bounds.height);
  return {
    x,
    y,
    width: Math.min(crop.width, bounds.width - x),
    height: Math.min(crop.height, bounds.height - y),
  };
}

export function rotatedDimensions(width: number, height: number, degrees: QuarterTurn): Dimensions {
  assertDimensions({ width, height });
  const normalized = ((degrees % 360) + 360) % 360;
  if (![0, 90, 180, 270].includes(normalized)) {
    throw new RangeError("Rotation must be 0, 90, 180, or 270 degrees.");
  }
  return normalized === 90 || normalized === 270 ? { width: height, height: width } : { width, height };
}

export function getExifOrientationTransform(
  orientation: number,
  width: number,
  height: number,
): { matrix: [number, number, number, number, number, number] } & Dimensions {
  assertDimensions({ width, height });
  const transforms: Record<ExifOrientation, [number, number, number, number, number, number]> = {
    1: [1, 0, 0, 1, 0, 0],
    2: [-1, 0, 0, 1, width, 0],
    3: [-1, 0, 0, -1, width, height],
    4: [1, 0, 0, -1, 0, height],
    5: [0, 1, 1, 0, 0, 0],
    6: [0, 1, -1, 0, height, 0],
    7: [0, -1, -1, 0, height, width],
    8: [0, -1, 1, 0, 0, width],
  };
  const safeOrientation = isExifOrientation(orientation) ? orientation : 1;
  const swapsDimensions = safeOrientation >= 5;
  return {
    matrix: transforms[safeOrientation],
    width: swapsDimensions ? height : width,
    height: swapsDimensions ? width : height,
  };
}

export function readExifOrientation(bytes: Uint8Array): ExifOrientation {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;

  for (let offset = 2; offset + 4 <= bytes.length;) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const length = readUint16(bytes, offset + 2, false);
    if (length < 2 || offset + 2 + length > bytes.length) break;

    if (marker === 0xe1 && length >= 10 && ascii(bytes, offset + 4, 6) === "Exif\0\0") {
      return readTiffOrientation(bytes, offset + 10, offset + 2 + length);
    }
    offset += 2 + length;
  }
  return 1;
}

function readTiffOrientation(bytes: Uint8Array, tiffStart: number, segmentEnd: number): ExifOrientation {
  if (tiffStart + 8 > segmentEnd) return 1;
  const byteOrder = ascii(bytes, tiffStart, 2);
  if (byteOrder !== "II" && byteOrder !== "MM") return 1;
  const littleEndian = byteOrder === "II";
  if (readUint16(bytes, tiffStart + 2, littleEndian) !== 42) return 1;

  const ifdOffset = readUint32(bytes, tiffStart + 4, littleEndian);
  const ifdStart = tiffStart + ifdOffset;
  if (ifdStart + 2 > segmentEnd) return 1;
  const entryCount = readUint16(bytes, ifdStart, littleEndian);

  for (let index = 0; index < entryCount; index += 1) {
    const entry = ifdStart + 2 + index * 12;
    if (entry + 12 > segmentEnd) return 1;
    if (
      readUint16(bytes, entry, littleEndian) === 0x0112 &&
      readUint16(bytes, entry + 2, littleEndian) === 3 &&
      readUint32(bytes, entry + 4, littleEndian) === 1
    ) {
      const orientation = readUint16(bytes, entry + 8, littleEndian);
      return isExifOrientation(orientation) ? orientation : 1;
    }
  }
  return 1;
}

function isExifOrientation(value: number): value is ExifOrientation {
  return Number.isInteger(value) && value >= 1 && value <= 8;
}

function readUint16(bytes: Uint8Array, offset: number, littleEndian: boolean) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, littleEndian);
}

function readUint32(bytes: Uint8Array, offset: number, littleEndian: boolean) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, littleEndian);
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  let value = "";
  for (let index = offset; index < offset + length && index < bytes.length; index += 1) {
    value += String.fromCharCode(bytes[index]);
  }
  return value;
}

function assertDimensions(dimensions: Dimensions | Rectangle) {
  assertPositive(dimensions.width, "Width");
  assertPositive(dimensions.height, "Height");
}

function assertPositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must have positive dimensions.`);
  }
}

function scaledDimensions(source: Dimensions, scaleX: number, scaleY: number) {
  return {
    width: roundDimension(source.width * scaleX),
    height: roundDimension(source.height * scaleY),
  };
}

function roundDimension(value: number) {
  return Math.max(1, Math.round(value));
}

function clamp(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) throw new RangeError("Coordinates must be finite.");
  return Math.min(Math.max(value, minimum), maximum);
}
