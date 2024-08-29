import {
  writeFile,
  makeHydraCollection,
  closeProcess,
  dlcsApiCall,
  listSpace,
  ingestImages,
  patchImages,
  deleteImages,
  getBatchId,
} from "./shared";
import type { paths } from "./types/dlcs";
import { parseArgs } from "util";
import settings from "../settings.json";

closeProcess();

// Types
type Space =
  paths["/customers/{customerId}/spaces"]["get"]["responses"][200]["content"]["application/json"];

// Check for environment variables
if (!Bun.env.DLCS_API_KEY) {
  throw new Error("Please set environment variables");
}

// Parse input
const { values, positionals } = parseArgs({
  args: Bun.argv,
  options: {
    "list-spaces": {
      type: "boolean",
    },
    "list-batches": {
      type: "boolean",
    },
    "list-images": {
      type: "string",
    },
    full: {
      type: "boolean",
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
    ingest: {
      type: "boolean",
    },
    batches: {
      type: "boolean",
    },
    delete: {
      type: "boolean",
    },
    patch: {
      type: "boolean",
    },
  },
  strict: true,
  allowPositionals: true,
});

// Loading input files (can be multiple)
const inputArray = await Promise.all(
  positionals.slice(2).map((file) =>
    Bun.file(settings["data-directory"] + "/" + file)
      .json()
      .then((data) => ({ file, data }))
  )
);

// Checking flags
const flags = [
  values.ingest,
  values.patch,
  values.delete,
  values["list-spaces"],
  values["list-images"],
  values["list-batches"],
].filter((flag) => flag);
const requiredInput =
  values.ingest || values.patch || values.delete || values["list-batches"];

if (flags.length > 1) {
  throw new Error("Too many flags provided; please select a single operation.");
} else if (!flags.length) {
  throw new Error("No input");
}

if (requiredInput && inputArray.length) {
  for (const [index, collection] of inputArray.entries()) {
    const members = collection.data.member;
    const file = collection.file;
    if (!members || !members.length) {
      inputArray.slice(index, 1);
      throw new Error(`${file} does not contain any members.`);
    }
  }
} else if (!requiredInput && inputArray.length) {
  throw new Error("No operation flag provided");
} else if (requiredInput && !inputArray.length) {
  throw new Error("Please provide input collection(s)");
}

// Function to parse string1, string2 and string3 values from input
const parseQuery = () => {
  const arr = new Array();
  for (let n = 1; n <= 3; n++) {
    const prop = "string" + n;
    if (values[prop]) {
      arr.push([prop, values[prop]]);
    }
  }
  return arr;
};

// List spaces
if (values["list-spaces"]) {
  const resp = await dlcsApiCall("spaces");
  const longestString = Math.max(
    ...resp.member.map((space) => space.name.length)
  );
  const header = `| Number | ${"Name".padEnd(longestString, " ")} | Count |`;
  const table = resp.member
    .map(
      (space) =>
        `| ${space.id.toString().padStart(6, " ")} | ${space.name.padEnd(
          longestString,
          " "
        )} | ${space.approximateNumberOfImages.toString().padStart(5, " ")} |`
    )
    .join("\n");
  console.log(`${resp.totalItems} spaces found\n\n${header}\n${table}`);
}

// List batches
if (values["list-batches"]) {
  for (const { data, file } of inputArray) {
    console.log(`Processing ${data.member.length} batches of ${file}...`);
    let batchCount = 0;
    let errorCount = 0;
    for (const member of data.member) {
      const id = getBatchId(member);
      const batch = await dlcsApiCall(`queue/batches/${id}`);
      const errors = batch.errors;
      if (errors > 0) {
        errorCount = errorCount + errors;
        batchCount++;
        console.log(
          `Batch ${id} contains ${errors} ${errors > 1 ? "errors" : "error"}`
        );
        const batchImages = await dlcsApiCall(`queue/batches/${id}/images`);
        const errorImages = batchImages.member
          .filter((image) => image.error)
          .map(
            ({ id, space }) =>
              `https://portal.dlc.services/Images/${space}/${id}`
          );
        if (errorImages.length) {
          console.log(errorImages.join("/n"));
        } else {
          console.log("No images with errors found in batch");
        }
      }
    }
    console.log(
      errorCount
        ? `Check completed: ${batchCount} batches found containing ${errorCount} ${
            errorCount > 1 ? "errors" : "error"
          }`
        : "Check completed, no errors found"
    );
  }
}

// List images within space
if (values["list-images"]) {
  const space = values["list-images"];
  const full = values.full;
  const query = parseQuery().length
    ? "&" +
      parseQuery()
        .map((i) => `${i[0]}=${i[1]}`)
        .join("&")
    : "";
  const resp = await listSpace(space, full, query);
  if (resp.length) {
    const filename = `dlcs-space-${space}${
      query ? query.replaceAll(/[&=]/g, "-") : ""
    }`;
    const collection = makeHydraCollection(resp);
    writeFile(collection, filename);
  }
}

// Ingest images
if (values.ingest) {
  for (const collection of inputArray) {
    const file = collection.file;
    const body = collection.data;
    const count = body.member.length;
    const batches = values.batches;
    const resp = await ingestImages(body, batches);
    await writeFile(makeHydraCollection(resp), `${file.split(".")[0]}-batches`);
    console.log(`Ingested ${count} images from ${file}`);
  }
}

// Patch images
if (values.patch) {
  for (const collection of inputArray) {
    const file = collection.file;
    const body = collection.data;
    const count = body.member.length;
    await patchImages(body);
    console.log(`Patched ${count} images from ${file}`);
  }
}

// Delete images
if (values.delete) {
  for (const collection of inputArray) {
    const file = collection.file;
    const body = collection.data;
    const count = body.member.length;
    await deleteImages(body);
    console.log(`Deleted ${count} images from ${file}`);
  }
}
