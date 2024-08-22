import { writeFile, makeHydraCollection, closeProcess, makeChunks } from "./utils";
import { encode } from "base-64";
import type { paths } from "./types/dlcs";
import { parseArgs } from "util";
import settings from "../settings.json"

// Listen for CTRL+C
// https://bun.sh/guides/process/ctrl-c
closeProcess()

// Types
type Space = paths["/customers/{customerId}/spaces"]["get"]["responses"][200]["content"]["application/json"]

// Check for environment variables
if (!Bun.env.DLCS_API_KEY) {
  throw new Error("Please set environment variables")
}

const apiBaseUrl = `https://api.dlc.services/customers/${settings["dlcs-customer-id"]}/`;

// Parse input
const { values, positionals } = parseArgs({
  args: Bun.argv,
  options: {
    "list-spaces": {
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
    }
  },
  strict: true,
  allowPositionals: true,
});

// Loading input files (can be multiple)
const inputArray = await Promise.all(positionals.slice(2).map(path => Bun.file(path).json().then(data => ({ path, data }))))

// Checking flags
const flagArray = [values.ingest, values.patch, values.delete, values["list-spaces"], values["list-images"]].filter(flag => flag)
const inputRequired = values.ingest || values.patch || values.delete

if (flagArray.length > 1) {
  throw new Error("Too many flags provided; please select a single operation.")
} else if (!flagArray.length) {
  throw new Error("No input")
}

if (inputRequired && inputArray.length) {
  for (const [index, collection] of inputArray.entries()) {
    const members = collection.data.member
    const path = collection.path
    if (!members || !members.length) {
      inputArray.slice(index, 1)
      throw new Error(`File ${path} does not contain any members.`)
    }
  }
} else if (!inputRequired && inputArray.length) {
  throw new Error("No operation flag provided")
} else if (inputRequired && !inputArray.length) {
  throw new Error("Please provide input collection(s)")
}

// Function to parse string1, string2 and string3 values from input
const parseQuery = () => {
  const arr = new Array()
  for (let n = 1; n <= 3; n++) {
    const prop = "string" + n
    if (values[prop]) {
      arr.push([prop, values[prop]])
    }
  }
  return arr
}

// Generic API call
const apiCall = (path: string, method: string = "GET", body: any | undefined = undefined) => {
  return fetch(apiBaseUrl + path, {
    method,
    headers: new Headers({
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${encode(Bun.env.DLCS_API_KEY)}`,
    }),
    body: JSON.stringify(body),
  }).then((resp) => {
    if (!resp.ok) {
      return resp.text().then(text => { throw new Error(text) })
    }
    return resp.json();
  });
}

// List spaces
if (values["list-spaces"]) {
  const resp = await apiCall("spaces")
  const longestString = Math.max(...resp.member.map(space => space.name.length))
  const header = `| Number | ${"Name".padEnd(longestString, " ")} | Approximate count |`
  const table = resp.member.map(space => `| ${space.id.toString().padStart(6, " ")} | ${space.name.padEnd(longestString, " ")} | ${space.approximateNumberOfImages.toString().padStart(17, " ")} |`).join("\n")
  console.log(`${resp.totalItems} spaces found\n\n${header}\n${table}`)
}

// List images within space
if (values["list-images"]) {
  const space = values["list-images"]
  const query = parseQuery().length ? "&" + parseQuery().map(i => `${i[0]}=${i[1]}`).join("&") : ""
  const firstPage = await apiCall(`spaces/${space}/images?page=1${query}`)
  const totalItems = firstPage.totalItems
  let members = [firstPage.member];

  if (firstPage.view && values["full"]) {
    console.log("Multiple pages found...")
    const numberOfPages = firstPage.view.totalPages
    for (let page = 2; page <= numberOfPages; page++) {
      const resp = await apiCall(`spaces/${space}/images?page=${page + query}`)
      members.push(resp.member);
      console.log(`Listing page ${page}...`)
    }
  } else if (firstPage.view) {
    console.log(`${totalItems} images found. Use --full flag to list all images.`)
  } else {
    console.log(`${totalItems} images found.`)
  }

  if (members.flat().length) {
    const filename = `dlcs-space-${space}${query ? query.replaceAll(/[&=]/g, "-") : ""}`
    const collection = makeHydraCollection(members.flat())
    writeFile(collection, filename)
  }

}

// Ingest collection

const ingestCollection = async (body) => {
  const method = "POST"
  const path = "queue"
  const resp = await apiCall(path, method, body)
  const batch = resp["@id"].match(/batches\/(\w*)/)[1];
  console.log(`https://portal.dlc.services/batches/${batch}`)
}

if (values.ingest) {
  for (const collection of inputArray) {
    const body = collection.data
    const count = collection.data.member.length
    const filePath = collection.path
    const batchSize = settings["batch-size"]
    if (count > batchSize) {
      if (!values.batches) {
        throw new Error(`${filePath} has more members than allowed`)
      }
      const chunks = makeChunks(body.member)
      console.log(`${count} images from ${filePath} are added to the queue in ${chunks.length} batches...`)
      for (const chunk of chunks) {
        const chunkBody = makeHydraCollection(chunk)
        await ingestCollection(chunkBody)
      }
    } else {
      console.log(`${count} images from ${filePath} are added to the queue...`)
      await ingestCollection(body)
    }
  }
}

// Patch images
if (values.patch) {
  const method = "PATCH"
  for (const collection of inputArray) {
    const members = collection.data.member
    const filePath = collection.path
    for (const member of members) {
      // Empty strings will be patched; undefined properties will not be patched
      const { string1, string2, string3, number1, number2, number3 } = member
      const body = { string1, string2, string3, number1, number2, number3 }
      const id = member.id
      const space = member.space
      const path = `spaces/${space}/images/${id}`
      await apiCall(path, method, body)
      console.log(`Patched image: ${id}`)
    }
    console.log(`Patched ${members.length} images from ${filePath}`)
  }
}

// Delete images
if (values.delete) {
  const method = "DELETE"
  for (const collection of inputArray) {
    const members = collection.data.member
    const filePath = collection.path
    for (const member of members) {
      const id = member.id
      const space = member.space
      const path = `spaces/${space}/images/${id}`
      await apiCall(path, method)
      console.log(`Deleted image: ${id}`)
    }
    console.log(`Deleted ${members.length} images from ${filePath}`)
  }
}