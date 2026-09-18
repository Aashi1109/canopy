/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDatabase } from "./runtime.ts";
import * as schema from "./paperworkSchema.ts";

export const db = createDatabase(schema);
