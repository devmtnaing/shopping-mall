// Commands the UI can send to the game. main.ts installs the real implementations once the world
// is loaded; until then they're no-ops. This keeps UI components free of three.js imports.

export type Commands = {
  /** Walk (or teleport, if far) to a shop slot's door. */
  travelToSlot: (slotId: string) => void;
};

export const commands: Commands = {
  travelToSlot: () => {},
};

export function installCommands(impl: Partial<Commands>) {
  Object.assign(commands, impl);
}
