import { Boom } from "@hapi/boom";
import { exec } from "child_process";
import chalk from "chalk";
import * as readline from "readline";
import baileys from "@whiskeysockets/baileys";
import { parsePhoneNumber } from "libphonenumber-js";

export const startConnectionHandler = async (client: any, store: any) => {
  if (!client.authState.creds.registered) {
    let phoneNumber: string;

    if (!!process.env.PAIRING_NUMBER) {
      phoneNumber = process.env.PAIRING_NUMBER.replace(/[^0-9]/g, "");

      if (!validatePhoneNumber(phoneNumber)) {
        console.log(
          chalk.bgBlack(
            chalk.redBright(
              "Start with your country's WhatsApp code, Example : 62xxx",
            ),
          ),
        );
        process.exit(0);
      }
    } else {
      const question = (query: string) =>
        new Promise<string>((resolve) => {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          rl.question(query, (answer) => {
            rl.close();
            resolve(answer);
          });
        });

      phoneNumber = await question(
        chalk.bgBlack(chalk.greenBright("Please type your WhatsApp number: ")),
      );
      phoneNumber = phoneNumber.replace(/[^0-9]/g, "");

      if (!validatePhoneNumber(phoneNumber)) {
        console.log(
          chalk.bgBlack(
            chalk.redBright("Invalid number. Example: Start with 62xxx"),
          ),
        );
        phoneNumber = await question(
          chalk.bgBlack(
            chalk.greenBright("Please type your WhatsApp number: "),
          ),
        );
        phoneNumber = phoneNumber.replace(/[^0-9]/g, "");
      }
    }

    setTimeout(async () => {
      let code = await client.requestPairingCode(phoneNumber);
      code = code?.match(/.{1,4}/g)?.join("-") || code;
      console.log(
        chalk.black(chalk.bgGreen("Your Pairing Code: ")),
        chalk.black(chalk.white(code)),
      );
    }, 3000);
  }

  client.ev.on(
    "connection.update",
    async (update: {
      lastDisconnect: any;
      connection: string;
      qr?: string;
    }) => {
      const { connection, lastDisconnect, qr } = update;

      if (connection) client.logger.info(`Connection Status: ${connection}`);
      if (qr) {
        console.log(chalk.green(`Scan QR Code: ${qr}`));
      }

      if (connection === "close") {
        const reason = new Boom(lastDisconnect?.error)?.output.statusCode;

        switch (reason) {
          case 401: // Logged out
            console.log("Perangkat Keluar, Silakan Pindai Lagi");
            await handleLogout(client);
            break;
          default:
            console.log(reason);
            await restartConnection();
            break;
        }
      }

      if (connection === "open") {
        client.logger.info("Connecting Success...");
      }
    },
  );
};

const handleLogout = async (client: any) => {
  console.error("Logged out");
  await client.logout();
};

const restartConnection = async () => {
  console.error("Reconnecting...");
  exec("npm start");
};

const validatePhoneNumber = (phoneNumber: string) => {
  try {
    const phone = parsePhoneNumber(phoneNumber);
    return phone.isValid();
  } catch (error) {
    return false;
  }
};
