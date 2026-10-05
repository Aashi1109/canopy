/** English bootstrap copy for shared execution helpers; each tool stores its own editable messages. */
export const INPUT_EXECUTION_MESSAGES = {
  "sharedInput.required": "This input is required.",
  "sharedInput.recovery": "Enter a value and try again.",
} as const;

export const ENCODING_EXECUTION_MESSAGES = {
  "sharedEncoding.base64": "Base64 input is invalid.",
  "sharedEncoding.utf8": "Base64 does not contain valid UTF-8 text.",
} as const;

export const CRYPTO_EXECUTION_MESSAGES = {
  "sharedCrypto.unavailable": "Secure browser cryptography is unavailable.",
  "sharedCrypto.range": "Random range is too large.",
  "sharedCrypto.alphabet": "Choose at least one character group.",
} as const;

export const URL_EXECUTION_MESSAGES = {
  "sharedUrl.domainRequired": "Domain is required.",
  "sharedUrl.domain": "Enter a valid domain name.",
  "sharedUrl.absolute": "Enter an absolute http or https URL.",
} as const;

export const DATE_EXECUTION_MESSAGES = {
  "sharedDate.invalid":
    "{endpoint, select, start {Start date} end {End date} other {Date}} is not a valid date or timestamp.",
  "sharedDate.required": "{endpoint, select, start {Start date} end {End date} other {Date}} is required.",
} as const;

export const JWT_EXECUTION_MESSAGES = {
  "sharedJwt.parts": "JWT must contain three dot-separated parts.",
  "sharedJwt.payload": "JWT header or payload is not valid Base64URL JSON.",
} as const;

export const CODE_EXECUTION_MESSAGES = {
  "sharedCode.string": "Source contains an unfinished string.",
  "sharedCode.comment": "Source contains an unfinished comment.",
  "sharedCode.unterminated": "Source contains an unfinished string, regex, or comment.",
  "sharedCode.syntax": "Source contains invalid JavaScript syntax.",
  "sharedCode.close": "Close the open string or block comment and try again.",
  "sharedCode.correct": "Correct the JavaScript syntax and try again.",
} as const;

export const CURL_EXECUTION_MESSAGES = {
  "sharedCurl.quote": "cURL command contains an unfinished quote or escape.",
  "sharedCurl.start": "Command must start with curl.",
  "sharedCurl.header": "Every cURL header needs a name and value.",
  "sharedCurl.absolute": "cURL command needs an absolute http or https URL.",
  "sharedCurl.protocol": "cURL URL must use http or https.",
} as const;

export const DIFF_EXECUTION_MESSAGES = {
  "sharedDiff.tooLarge": "This comparison is too large to align safely. Compare smaller sections.",
  "sharedDiff.recovery": "Split the inputs into smaller sections and compare them one at a time.",
} as const;

export const JSON_EXECUTION_MESSAGES = {
  "jsonExecution.repairMode": "Choose a valid JSON repair mode.",
  "jsonExecution.invalid": "Input is not valid JSON. Check commas, quotes, and brackets.",
  "jsonExecution.required":
    "{input, select, left {JSON A} right {JSON B} data {JSON data} schema {JSON schema} other {JSON input}} is required.",
  "jsonExecution.invalidInput":
    "{input, select, left {JSON A} right {JSON B} data {JSON data} schema {JSON schema} other {JSON input}} is not valid JSON.",
  "jsonExecution.inputSyntax":
    "{input, select, left {JSON A} right {JSON B} data {JSON data} schema {JSON schema} other {JSON input}} is invalid near line {line, number}, column {column, number}.",
  "jsonExecution.inputTooLarge":
    "{input, select, left {JSON A} right {JSON B} data {JSON data} schema {JSON schema} other {JSON input}} must be {limit, number} characters or fewer.",
  "jsonExecution.empty": "Paste JSON or open a .json file to get started.",
  "jsonExecution.tooLarge": "JSON must be {limit, number} characters or fewer.",
  "jsonExecution.syntax": "JSON is invalid near line {line, number}, column {column, number}.",
  "jsonExecution.encoding": "The file is not valid UTF-8 near line {line, number}, column {column, number}.",
  "jsonExecution.recovery": "Check the reported line for a missing comma, quote, or bracket.",
  "jsonExecution.processing": "Processing JSON",
  "jsonExecution.status": "Status",
  "jsonExecution.valid": "Valid JSON",
  "jsonExecution.rootType": "Root type",
  "jsonExecution.rootValue":
    "{type, select, array {Array} boolean {Boolean} null {Null} number {Number} object {Object} string {String} other {Unknown}}",
  "jsonExecution.input": "Input",
  "jsonExecution.output": "Output",
  "jsonExecution.bytes": "{count, number} bytes",
  "jsonExecution.completeFile": "Complete generated file",
  "jsonExecution.download": "Download",
} as const;

export const JSON_TO_CSV_EXECUTION_MESSAGES = {
  "jsonCsv.empty": "Paste JSON to convert it to CSV.",
  "jsonCsv.tooLarge": "JSON must be {limit, number} characters or fewer.",
  "jsonCsv.delimiter": "Choose a valid CSV delimiter.",
  "jsonCsv.invalid": "JSON is not valid.",
  "jsonCsv.repair": "JSON could not be repaired safely.",
  "jsonCsv.shape": "Use a JSON object or an array of JSON objects.",
} as const;
