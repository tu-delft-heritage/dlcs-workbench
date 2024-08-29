import settings from "../settings.json"
import { encode } from "base-64";
import type { components } from "./types/dlcs";
import type { WebDAVClient } from "webdav";

type HydraCollectionMembers = components["schemas"]["Image"][]

export const sleep = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const fetchJson = async (url: string) => {
  return fetch(url).then((response) => response.json());
}

export const writeFile = async (data: any, filename: string) => {
  await Bun.write(
    `${settings["data-directory"]}/${filename}.json`,
    JSON.stringify(data, null, 4)
  )
  console.log(`Written ${settings["data-directory"]}/${filename}.json`)
}

export const makeHydraCollection = (members: HydraCollectionMembers) => {
  return {
    "@context": "http://www.w3.org/ns/hydra/context.jsonld",
    "@type": "Collection",
    totalItems: members.length,
    member: members
  }
}

export const makeChunks = (arr: any[]) => {
  const chunkSize = settings.dlcs["batch-size"]
  let chunks = new Array();
  for (let i = 0; i < arr.length; i += chunkSize) {
    const chunk = arr.slice(i, i + chunkSize);
    chunks.push(chunk);
  }
  return chunks;
}

// PROPFIND not allowed on TU Delft server and "unlimited" depth not allowed on public SURFdrive folder
// Alternative depths cannot be (easily) customized with webdav library
// Using recursive function to list subdirectories
export const webDavListing = async (client: WebDAVClient, path: string, recursive: boolean = false) => {
  const arr = new Array();
  console.log("Listing: " + path);
  const timeoutHandler = () => { console.error("This takes very long; please check your connection.") }
  const timeoutID = setTimeout(timeoutHandler, 20000)
  const initialListing = await client.getDirectoryContents(path);
  clearTimeout(timeoutID)
  if (Array.isArray(initialListing)) {
    arr.push(...initialListing);
    if (recursive) {
      for (const item of initialListing) {
        if (item.type === "directory") {
          const path = item.filename
          const recursiveListing = await webDavListing(client, path, recursive);
          arr.push(recursiveListing);
        }
      }
    }
  }
  return arr.flat().sort((a, b) => a.filename.localeCompare(b.filename));
};

// DLCS API call
export const dlcsApiCall = (path: string, method: string = "GET", body: any | undefined = undefined) => {
  const apiBaseUrl = `https://api.dlc.services/customers/${settings.dlcs["customer-id"]}/`;
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

// List DLCS space
export const listSpace = async (space: string, full: boolean = false, query: string | undefined = undefined) => {
  const firstPage = await dlcsApiCall(`spaces/${space}/images?page=1${query}`)
  const totalItems = firstPage.totalItems
  let members = [firstPage.member];

  if (firstPage.view && full) {
    console.log("Multiple pages found...")
    const numberOfPages = firstPage.view.totalPages
    for (let page = 2; page <= numberOfPages; page++) {
      const resp = await dlcsApiCall(`spaces/${space}/images?page=${page}${query}`)
      members.push(resp.member);
      console.log(`Listing page ${page}...`)
    }
  } else if (firstPage.view) {
    console.log(`${totalItems} images found. Use --full flag to list all images.`)
  } else {
    console.log(`${totalItems} images found.`)
  }

  return members.flat()
}

// Ingest DLCS collection
const postCollection = async (body: any) => {
  const method = "POST"
  const path = "queue"
  const resp = await dlcsApiCall(path, method, body)
  return resp
}

export const getBatchId = (batchResp) => {
  return batchResp["@id"].match(/batches\/(\w*)/)[1];
}

export const ingestImages = async (body: any, batches: boolean = false) => {
  const batchSize = settings.dlcs["batch-size"]
  const count = body.member.length
  if (count > batchSize) {
    if (!batches) {
      throw new Error(`Collection has more members than allowed`)
    }
    const chunks = makeChunks(body.member)
    console.log(`${count} images are added to the queue in ${chunks.length} batches...`)
    const ingestedBatches = new Array()
    for (const chunk of chunks) {
      const chunkBody = makeHydraCollection(chunk)
      const batch = await postCollection(chunkBody)
      console.log("https://portal.dlc.services/batches/" + getBatchId(batch))
      ingestedBatches.push(batch)
    }
    return ingestedBatches
  } else {
    const batch = await postCollection(body)
    console.log("https://portal.dlc.services/batches/" + getBatchId(batch))
    return [batch]
  }
}

// Patch DLCS images
export const patchImages = async (collection: any) => {
  const method = "PATCH"
  const members = collection.member
  for (const member of members) {
    // Empty strings will be patched; undefined properties will not be patched
    const { string1, string2, string3, number1, number2, number3 } = member
    const body = { string1, string2, string3, number1, number2, number3 }
    const id = member.id
    const space = member.space
    const path = `spaces/${space}/images/${id}`
    await dlcsApiCall(path, method, body)
    console.log(`Patched image: ${id}`)
  }
}

// Delete DLCS images
export const deleteImages = async (collection: any) => {
  const method = "DELETE"
  const members = collection.member
  for (const member of members) {
    const id = member.id
    const space = member.space
    const path = `spaces/${space}/images/${id}`
    await dlcsApiCall(path, method)
    console.log(`Deleted image: ${id}`)
  }
}

// Listen for CTRL+C
// https://bun.sh/guides/process/ctrl-c
export const closeProcess = () => {
  process.on("SIGINT", () => {
    console.log("Ctrl-C was pressed");
    process.exit();
  })
}

