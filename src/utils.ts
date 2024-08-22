import settings from "../settings.json"

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