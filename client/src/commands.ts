// Commands the UI can send to the game. main.ts installs the real implementations once the world
// is loaded; until then they're no-ops. This keeps UI components free of three.js imports.

export type Commands = {
  /** Go to a shop's door (walk if near, fade-teleport if far) and open its panel on arrival. */
  travelToShop: (shopId: string) => void;
};

export const commands: Commands = {
  travelToShop: () => {},
};

export function installCommands(impl: Partial<Commands>) {
  Object.assign(commands, impl);
}
