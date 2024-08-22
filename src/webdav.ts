import { XMLParser } from "fast-xml-parser";
import { createClient } from "webdav";
import { parseArgs } from "util";
import { writeFile } from "./utils"
import { v4 } from "uuid";
import type { components } from "./types/dlcs";

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
const path = positionals[2].replace(/\/$/, "");

if (!path) {
  throw new Error("Please submit a path");
}

export let listSurfDriveFolder = async () => {
  // Listing files in cloud folder using webdav protocol
  const parser = new XMLParser();
  const url =
    "https://surfdrive.surf.nl/files/remote.php/dav/public-files/TVGDtHcBuhkXg5l";
  const response = await fetch(url, {
    method: "PROPFIND",
    headers: new Headers({
      ["Content-Type"]: "application/xml; charset=UTF-8",
      Depth: "2",
    }),
  }).then((response) => response.text());
  const json = parser.parse(response);
  // Creating a readable json of the response
  const fileArray = json["d:multistatus"]["d:response"]
    .filter((item) => !item["d:href"].match(/\/$/))
    .map((item, index) => ({
      path: "https://surfdrive.surf.nl" + item["d:href"],
      filename: item["d:href"].match(/[^/]*$/)[0],
      folder: item["d:href"].match(/TVGDtHcBuhkXg5l\/(.*)\//)
        ? item["d:href"].match(/TVGDtHcBuhkXg5l\/(.*)\//)[1]
        : "",
      id: item["d:propstat"]["d:prop"]["d:getetag"].replace(/\"/g, ""),
      type: item["d:propstat"]["d:prop"]["d:getcontenttype"],
      modified: item["d:propstat"]["d:prop"]["d:getlastmodified"],
      index,
    }));
  return fileArray;
};

// const sdClient = createClient(
//   "https://surfdrive.surf.nl/files/remote.php/dav/public-files/TVGDtHcBuhkXg5l"
// );

if (!Bun.env.WEBDAV_USER || !Bun.env.WEBDAV_USER) {
  throw new Error("Please set environment variables")
}

const client = createClient("https://webdata.tudelft.nl", {
  username: Bun.env.WEBDAV_USER,
  password: Bun.env.WEBDAV_PASS,
});

// PROPFIND not allowed on TU Delft server and "unlimited" depth not allowed on public SURFdrive folder
// Alternative depths cannot be (easily) customized with webdav library
// Using recursive function to list subdirectories

const fullListing = async (path: string) => {
  const arr = new Array();
  console.log("Listing: " + path);
  const initialListing = await client.getDirectoryContents(path);
  if (Array.isArray(initialListing)) {
    arr.push(...initialListing);
    if (values.recursive) {
      for (const item of initialListing) {
        if (item.type === "directory") {
          const recursiveListing = await fullListing(item.filename);
          arr.push(recursiveListing);
        }
      }
    }
  }
  return arr.flat().sort((a, b) => a.filename.localeCompare(b.filename));
};

let resp = await fullListing(path);

const mimeTypes = {
  tif: "image/tiff",
  jpg: "image/jpeg",
  mp4: "video/mp4",
};

// Only include files
if (!values.raw && !values["include-directories"]) {
  resp = resp.filter(i => i.type === "file")
}

// Only include certain files based on filter
if (values.filter) {
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
    const matches = pattern ? item.filename.match(pattern) : undefined
    if (!matches) {
      console.log(`No regex matches for: ${item.filename}`)
    }
    return ({
      id: v4(),
      space: values.space ? +values.space : 16,
      origin: "sftp://sftp.tudelft.nl".concat(item.filename),
      string1: matches?.groups?.string1 || values.string1 || "",
      string2: matches?.groups?.string2 || values.string2 || "",
      string3: matches?.groups?.string3 || values.string3 || "",
      number1: firstNumber + index,
    })
  })
}

// Create batches
const chunkSize = 1000

const createChunks = (arr: any[]) => {
  let chunks = new Array();
  for (let i = 0; i < arr.length; i += chunkSize) {
    const chunk = arr.slice(i, i + chunkSize);
    chunks.push(chunk);
  }
  return chunks;
}

const makeIngestCollection = (members: HydraCollectionMembers) => {
  return {
    "@context": "http://www.w3.org/ns/hydra/context.jsonld",
    "@type": "Collection",
    member: members
  }
}

const outputFolder = "_data"

const filename = values.output || path
  .toLowerCase()
  .split("/")
  .slice(-1)[0]
  .replaceAll(" ", "-");

if (values.batches) {
  if (ingestImages) {
    const chunks = createChunks(ingestImages)
    for (const [index, chunk] of chunks.entries()) {
      const ingestCollection = makeIngestCollection(chunk)
      const batch = index.toString().padStart(2, '0')
      writeFile(ingestCollection, `${filename}-ingest-batch-${batch}`)
    }
  } else {
    // Write raw webdav output in batches
    const chunks = createChunks(resp)
    for (const [index, chunk] of chunks.entries()) {
      const batch = index.toString().padStart(2, '0')
      writeFile(chunk, `${filename}-webdav-batch-${batch}`)
    }
  }
} else if (ingestImages) {
  const ingestCollection = makeIngestCollection(ingestImages)
  writeFile(ingestCollection, `${filename}-ingest`)
} else {
  // Write raw webdav output
  writeFile(resp, `${filename}-webdav`)
}
