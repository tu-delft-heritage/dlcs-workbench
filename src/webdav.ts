import { XMLParser } from "fast-xml-parser";
import { createClient } from "webdav";
import { parseArgs } from "util";
import { v4 } from "uuid";

const { values, positionals } = parseArgs({
  args: Bun.argv,
  options: {
    filter: {
      type: "string",
    },
    ingest: {
      type: "boolean",
    },
    space: {
      type: "string",
    },
    number: {
      type: "string",
    },
  },
  strict: true,
  allowPositionals: true,
});

const path = positionals[2];

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
    for (const item of initialListing) {
      if (item.type === "directory") {
        const recursiveListing = await fullListing(item.filename);
        arr.push(recursiveListing);
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

if (values.filter) {
  const filter = mimeTypes[values.filter] || values.filter;
  resp = resp.filter((i) => i.mime === filter);
  if (!resp.length) {
    throw new Error("Filter returned zero items");
  }
}

let ingestCollection = undefined;

if (values.ingest && values.space) {
  const firstNumber = values.number ? +values.number : 0;
  ingestCollection = {
    "@type": "Collection",
    member: resp.map((item, index) => ({
      id: v4(),
      space: values.space,
      origin: "sftp://sftp.tudelft.nl".concat(item.filename),
      // string1: determineString(metadata.string1, item.path),
      // string2: determineString(metadata.string2, item.path),
      // string3: determineString(metadata.string3, item.path),
      number1: firstNumber + index,
    })),
  };
}

// Todo: create batches

const filename = path
  .toLowerCase()
  .split("/")
  .slice(-1)[0]
  .replaceAll(" ", "-");

if (ingestCollection) {
  await Bun.write(
    `output/${filename}-ingest.json`,
    JSON.stringify(ingestCollection, null, 4)
  );
  console.log(`Written output/${filename}-ingest.json`);
} else {
  await Bun.write(`output/${filename}.json`, JSON.stringify(resp, null, 4));
  console.log(`Written output/${filename}.json`);
}
