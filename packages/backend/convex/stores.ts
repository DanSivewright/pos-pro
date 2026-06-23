import { query } from "./_generated/server";
import { getPermittedStores } from "./lib/authz";

export const listPermitted = query({
  args: {},
  handler: async (ctx) => {
    const stores = await getPermittedStores(ctx);
    return stores.map((store) => ({
      id: store._id,
      name: store.name,
      salesTarget: store.salesTarget ?? null,
    }));
  },
});
