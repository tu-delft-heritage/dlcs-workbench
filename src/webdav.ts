import { createClient } from "webdav";
import { parseArgs } from "util";
import { writeFile, makeHydraCollection, closeProcess, makeChunks, webDavListing } from "./shared"
import { v4 } from "uuid";
import settings from "../settings.json"

import type { components } from "./types/dlcs";

closeProcess()

// Check for environment variables
if (!Bun.env.WEBDAV_USER || !Bun.env.WEBDAV_PASS) {
  throw new Error("Please set environment variables")
}

type HydraCollection = components["schemas"]["ImageHydraCollection"]
type HydraCollectionMembers = components["schemas"]["Image"][]

// Parse input
const { values, positionals } = parseArgs({
  args: Bun.argv,
  options: {
    "include-directories": {
      type: "boolean",
    },
    filter: {
      type: "string",
    },
    recursive: {
      type: "boolean",
    },
    // depth: {
    //   type: "boolean",
    // },
    raw: {
      type: "boolean",
    },
    space: {
      type: "string",
    },
    regex: {
      type: "string",
    },
    string1: {
      type: "string",
    },
    string2: {
      type: "string",
    },
    string3: {
      type: "string",
    },
    number1: {
      type: "string",
    },
    output: {
      type: "string",
    },
    batches: {
      type: "boolean",
    },
  },
  strict: true,
  allowPositionals: true,
});

// Remove trailing slash from path if present
const path = positionals.length > 2 ? positionals[2].replace(/\/$/, "") : undefined

if (!path) {
  throw new Error("Please submit a path");
}

const client = createClient("https://webdata.tudelft.nl", {
  username: Bun.env.WEBDAV_USER,
  password: Bun.env.WEBDAV_PASS,
});

const recursive = values.recursive ? true : false

let resp = await webDavListing(client, path, recursive);

// Only include files
if (!values.raw && !values["include-directories"]) {
  resp = resp.filter(i => i.type === "file")
}

// Only include certain files based on filter
if (values.filter) {
  const mimeTypes = settings.mimeTypes
  const filter = mimeTypes[values.filter] || values.filter;
  resp = resp.filter((i) => i.mime === filter);
}

if (!resp.length) {
  throw new Error("Collection contains zero items");
}

let ingestImages: undefined | HydraCollectionMembers = undefined;

let pattern = values.regex ? new RegExp(values.regex) : undefined

if (!values.raw) {
  const firstNumber = values.number1 ? +values.number1 : 0;
  ingestImages = resp.map((item, index) => {
    // Maybe use https://github.com/phenax/typed-regex
    let matches: undefined | any = undefined
    if (pattern) {
      matches = item.filename.match(pattern)
      if (!matches) {
        console.log(`No regex matches for: ${item.filename}`)
      }
    }
    return ({
      id: v4(),
      space: values.space ? +values.space : settings.dlcs["default-space"],
      origin: "sftp://sftp.tudelft.nl".concat(item.filename),
      string1: matches?.groups?.string1 || values.string1 || "",
      string2: matches?.groups?.string2 || values.string2 || "",
      string3: matches?.groups?.string3 || values.string3 || "",
      number1: firstNumber + index,
    })
  })
}

const filename = values.output || path
  .toLowerCase()
  .split("/")
  .slice(-1)[0]
  .replaceAll(" ", "-");

if (values.batches) {
  if (ingestImages) {
    const chunks = makeChunks(ingestImages)
    for (const [index, chunk] of chunks.entries()) {
      const ingestCollection = makeHydraCollection(chunk)
      const batch = index.toString().padStart(2, '0')
      writeFile(ingestCollection, `${filename}-ingest-batch-${batch}`)
    }
  } else {
    // Write raw webdav output in batches
    const chunks = makeChunks(resp)
    for (const [index, chunk] of chunks.entries()) {
      const batch = index.toString().padStart(2, '0')
      writeFile(chunk, `${filename}-webdav-batch-${batch}`)
    }
  }
} else if (ingestImages) {
  const ingestCollection = makeHydraCollection(ingestImages)
  writeFile(ingestCollection, `${filename}-ingest`)
} else {
  // Write raw webdav output
  writeFile(resp, `${filename}-webdav`)
}
