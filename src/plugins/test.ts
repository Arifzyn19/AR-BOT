import { Command } from "../types/Command";

const handler: Command = {
  cmd: ["example"],
  code: async ({ conn, from, m }) => {
    await conn.sendMessage(
      from,
      {
        text: "Ini adalah contoh",
      },
      {
        quoted: m,
      },
    );
  },
};

export default handler;
