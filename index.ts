import { fetchJson } from "./src/utils";
import { encode } from "base-64";
import type { paths } from "./src/types/dlcs";

const apiBaseUrl = `https://api.dlc.services/customers/${Bun.env.DLCS_CUSTOMER_ID}/`;

function apiCall(options) {
  return fetch(options.url, {
    method: options.method,
    headers: new Headers({
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${encode(Bun.env.DLCS_API_KEY)}`,
    }),
    body: JSON.stringify(options.body),
  }).then((response) => {
    if (!response.ok) throw new Error(response.status);
    return response.json();
  });
}

const resp = (await apiCall({
  url: apiBaseUrl + "spaces",
})) as paths["/customers/{customerId}/spaces"]["get"]["responses"][200]["content"]["application/json"];

if (resp.member) {
  console.log(resp.member[0].created);
}

// console.log(resp);
