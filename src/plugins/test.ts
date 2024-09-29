import { Command } from "../types/Command";
import util from "util";

const handler: Command = {
  cmd: ["test"],
  code: async ({ conn, from, m }) => {
    await conn.sendMessage(
      from,
      {
        text: util.format(m),
      },
      {
        quoted: m,
      },
    );
  },
};

export default handler;
