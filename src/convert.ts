import converter from "json-2-csv";
import { makeHydraCollection } from "./shared"
import { parseArgs } from "util";
import settings from "../settings.json"

// Parse input
const { values, positionals } = parseArgs({
    args: Bun.argv,
    strict: true,
    allowPositionals: true,
});

const filename = positionals[2] ? positionals[2] : undefined

if (!filename) {
    throw new Error("No input");
}

const extension = filename.split(".").slice(-1)[0]

if (extension === "json") {
    const input = await Bun.file(`_data/${filename}`).json()

    const portalJson = input.member.map((image, index) => ({
        Type: "Image",
        Line: index.toString(),
        Space: image.space,
        ID: image.id,
        Origin: image.origin,
        Reference1: image.string1,
        Reference2: image.string2,
        Reference3: image.string3,
        Tags: "",
        Roles: "",
        MaxUnauthorised: "-1",
        NumberReference1: image.number1,
        NumberReference2: image.number2,
        NumberReference3: image.number3
    }))

    const portalCsv = converter.json2csv(portalJson, { emptyFieldValue: "" })

    const outputFileName = filename.split(".")[0] + "-converted"

    await Bun.write(
        `${settings["data-directory"]}/${outputFileName}.csv`,
        portalCsv
    )

    console.log(`Written ${settings["data-directory"]}/${outputFileName}.csv`)

} else if (extension === "csv") {
    const input = await Bun.file(`_data/${filename}`).text()

    const portalJson: any[] = converter.csv2json(input)

    const members = portalJson.map(image => ({
        id: image.ID,
        space: image.Space,
        origin: image.Origin,
        string1: image.Reference1,
        string2: image.Reference2,
        string3: image.Reference3,
        number1: image.NumberReference1,
        number2: image.NumberReference2,
        number3: image.NumberReference3
    }))

    const collection = makeHydraCollection(members)

    const outputFileName = filename.split(".")[0] + "-converted"

    await Bun.write(
        `${settings["data-directory"]}/${outputFileName}.json`,
        JSON.stringify(collection, null, 4)
    )

    console.log(`Written ${settings["data-directory"]}/${outputFileName}.json`)
}

