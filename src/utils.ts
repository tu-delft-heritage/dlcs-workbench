import settings from "../settings.json"
import type { components } from "./types/dlcs";

type HydraCollectionMembers = components["schemas"]["Image"][]

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJson(url: string) {
  return fetch(url).then((response) => response.json());
}

export async function writeFile(data: any, filename: string) {
  await Bun.write(
    `${settings["output-directory"]}/${filename}.json`,
    JSON.stringify(data, null, 4)
  )
  console.log(`Written ${settings["output-directory"]}/${filename}.json`)
}

export function makeHydraCollection(members: HydraCollectionMembers) {
  return {
    "@context": "http://www.w3.org/ns/hydra/context.jsonld",
    "@type": "Collection",
    totalItems: members.length,
    member: members
  }
}

export function makeChunks(arr: any[]) {
  const chunkSize = settings["batch-size"]
  let chunks = new Array();
  for (let i = 0; i < arr.length; i += chunkSize) {
    const chunk = arr.slice(i, i + chunkSize);
    chunks.push(chunk);
  }
  return chunks;
}

export function closeProcess() {
  process.on("SIGINT", () => {
    console.log("Ctrl-C was pressed");
    process.exit();
  })
}