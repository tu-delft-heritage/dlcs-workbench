export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJson(url: string) {
  return fetch(url).then((response) => response.json());
}
