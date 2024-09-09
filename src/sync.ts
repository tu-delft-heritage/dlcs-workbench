import { parseArgs } from "util";
import { createClient } from "webdav";
import {
  webDavListing,
  listSpace,
  closeProcess,
  makeHydraCollection,
  deleteImages,
  ingestImages,
  patchImages,
} from "./shared";
import settings from "../settings.json";

closeProcess();

// Parse input
const { values, positionals } = parseArgs({
  args: Bun.argv,
  strict: true,
  allowPositionals: true,
});

// Load config file from _sync folder
const config = positionals[2]
  ? await Bun.file(`_sync/${positionals[2]}`).json()
  : undefined;

if (!config) {
  throw new Error(
    "Please submit the name of a config file in the _sync folder"
  );
}

console.log(`Using config: ${config.name}`);

// Documentation: https://doc.owncloud.com/server/next/developer_manual/webdav_api/public_files.html
const surfDriveBase = settings.surfdrive.webdav;
const shareToken = config.shareToken;
const username = config.username || settings.surfdrive["default-user"];
const password = config.password;
const client = createClient(surfDriveBase + shareToken, {
  username,
  password,
});

const path = "/";
const space = config.space;
const query = `&string1=${config.string1}`;

const folderListingPromise = webDavListing(client, path, true);
const spaceListingPromise = listSpace(space, true, query);
let [folderListing, spaceListing] = await Promise.all([
  folderListingPromise,
  spaceListingPromise,
]);

const mimeTypes = ["image/tiff", "image/jpeg", "image/png"];

// Extract string1, string2, string3 and number1 values
folderListing = folderListing
  .filter((i) => i.type === "file" && mimeTypes.includes(i.mime))
  .map((metadata, index) => {
    const stringValues = metadata.filename
      .split("/")
      .slice(1, -1)
      .map((i) => i.toLowerCase().replaceAll(/['. ]/g, "-"));
    const string1 = config.string1;
    const string2 = stringValues[0] || "";
    const string3 = stringValues[1] || "";
    const number1 = index;
    const id = metadata.etag;
    const origin = surfDriveBase + shareToken + metadata.filename;
    return { id, space, origin, string1, string2, string3, number1 };
  });

const webdavIds = folderListing.map((i) => i.id);
const dlcsIds = spaceListing.map((i) => i.id);

const compareMetadata = (obj1: any, obj2: any) => {
  const string2 = obj1.string2 === obj2.string2;
  const string3 = obj1.string3 === obj2.string3;
  const number1 = obj1.number1 === obj2.number1;
  const origin = obj1.origin === obj2.origin;
  return !string2 || !string3 || !number1 || !origin;
};

const imagesToBeKept = folderListing.filter((image) =>
  dlcsIds.includes(image.id)
);
const imagesToBeDeleted = spaceListing.filter(
  (image) => !webdavIds.includes(image.id)
);
const imagesToBeIngested = folderListing.filter(
  (file) => !dlcsIds.includes(file.id)
);
const imagesToBePatched = imagesToBeKept.filter((file) => {
  const image = spaceListing.filter((image) => image.id === file.id)[0];
  return compareMetadata(image, file);
});

console.log(
  `Found ${folderListing.length} ${
    folderListing.length === 1 ? "file" : "files"
  } in SURFdrive folder and ${spaceListing.length} ${
    spaceListing.length === 1 ? "image" : "images"
  } in DLCS space ${space}.`
);
console.log(
  `${imagesToBeIngested.length} ${
    imagesToBeIngested.length === 1 ? "image is" : "images are"
  } ingested.`
);
console.log(
  `${imagesToBePatched.length} ${
    imagesToBePatched.length === 1 ? "image is" : "images are"
  } patched`
);
console.log(
  `${imagesToBeDeleted.length} ${
    imagesToBeDeleted.length === 1 ? "image is" : "images are"
  } deleted`
);

if (imagesToBeIngested.length) {
  await ingestImages(makeHydraCollection(imagesToBeIngested), true);
}
if (imagesToBePatched.length) {
  await patchImages(makeHydraCollection(imagesToBePatched));
}
if (imagesToBeDeleted.length) {
  await deleteImages(makeHydraCollection(imagesToBeDeleted));
}
