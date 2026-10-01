/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  const CONFIG: {
    Actor: { documentClass: any };
    JournalEntry: { documentClass: any };
    RollTable: { documentClass: any };
    Folder: { documentClass: any };
    Combat: { documentClass: any };
    Token: { documentClass: any };
    Dice: { rolls: any[] };
    [key: string]: any;
  };
}
export {};
