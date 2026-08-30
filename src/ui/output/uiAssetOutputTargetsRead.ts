import type { AssetListItem } from "../../api-client/assetListItemSchema.js"
import type { OutputDefinition } from "../../output/outputDefinitionSchema.js"

/** Lists the output target definitions of one asset, keeping their stored order. */
export const uiAssetOutputTargetsRead = (asset: Pick<AssetListItem, "outputHistory">): OutputDefinition[] =>
  (asset.outputHistory ?? []).map((entry) => entry.definition)
