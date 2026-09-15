/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createDatabase } from "@smarttools/database/runtime";
import * as schema from "./schema";

export const db = createDatabase(schema);
