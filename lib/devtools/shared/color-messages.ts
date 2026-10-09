// English source text for shared color parsing; published copies are stored per tool.
export const COLOR_MESSAGES = {
  "color.commaChannels": "Use three comma-separated channels and optional alpha, or spaces with / alpha.",
  "color.spaceChannels": "Use three space-separated channels and optional / alpha.",
  "color.consistentChannels": "Comma-separated RGB channels must all use numbers or all use percentages.",
  "color.hslSuffix": "HSL saturation and lightness need a % suffix.",
  "color.finiteHue": "Hue must be a finite number.",
  "color.hexFormat": "HEX color must use #RGB, #RGBA, #RRGGBB, or #RRGGBBAA.",
  "color.finiteChannel":
    "{channel, select, alpha {Alpha} rgbPercentage {RGB percentage} rgbChannel {RGB channel} hue {Hue} hslPercentage {HSL percentage} saturation {Saturation} lightness {Lightness} other {Color channel}} must be a finite number.",
  "color.channelRange":
    "{channel, select, alpha {Alpha} rgbPercentage {RGB percentage} rgbChannel {RGB channel} hue {Hue} hslPercentage {HSL percentage} saturation {Saturation} lightness {Lightness} other {Color channel}} must be {min}–{max}.",
  "color.syntax": "Enter HEX, rgb(), hsl(), or a CSS color name.",
  "color.standaloneRecovery": "Use a standalone color; variables and relative colors need stylesheet context.",
};
