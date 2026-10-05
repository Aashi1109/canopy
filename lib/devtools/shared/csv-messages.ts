/** Seedable execution copy shared by the delimited-data tools. */
export const CSV_EXECUTION_MESSAGES = {
  "csv.processing": "Processing delimited data",
  "csv.rows": "Rows",
  "csv.columns": "Columns",
  "csv.download": "Download",
  "csv.completeFile": "Complete generated file",
  "csv.errors.inputRequired": "Delimited input is required.",
  "csv.errors.invalidDelimiter": "Choose a valid delimiter.",
  "csv.errors.emptyTable": "Delimited input has no rows.",
  "csv.errors.inconsistentWidth": "Every row must have the same number of fields.",
  "csv.errors.unexpectedCharacter": "Unexpected character {character} after a closing quote.",
  "csv.errors.unexpectedQuote": "A quoted field must start after a delimiter.",
  "csv.errors.unclosedQuote": "A quoted CSV field is not closed.",
  "csv.errors.streamEncoding": "Invalid UTF-8 at row {row}, column {column}.",
  "csv.errors.streamUnexpectedCharacter":
    "Unexpected character {character} after a closing quote at row {row}, column {column}.",
  "csv.errors.streamUnexpectedQuote":
    "Unexpected quote at row {row}, column {column}. Quotes must start at the beginning of a field.",
  "csv.errors.streamUnclosedQuote": "Unclosed quoted field at row {row}, column {column}.",
  "csv.errors.streamFieldTooLarge":
    "Field at row {row}, column {column} exceeds the {limit, number} byte safety limit.",
  "csv.errors.streamRowTooLarge": "Row {row} exceeds the {limit, number} byte safety limit.",
  "csv.errors.streamWidth":
    "Row {row} has {actual, plural, one {# column} other {# columns}}; expected {expected, plural, one {# column} other {# columns}}.",
  "csv.recovery.inputRequired": "Enter a value and try again.",
  "csv.recovery.delimiter": "Choose comma, semicolon, tab, or pipe.",
  "csv.recovery.structure": "Check the delimiter, quotes, and field counts, then try again.",
} as const;
