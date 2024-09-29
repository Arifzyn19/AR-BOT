import fs from "fs";
import path from "path";
import { register } from "ts-node";
import { fileURLToPath } from "url";

register();

const plugins: Record<string, any> = {};

const loadPlugins = (dir: string) => {
  try {
    const files = fs.readdirSync(dir);

    files.forEach((file) => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        loadPlugins(filePath);
      } else {
        const ext = path.extname(file);
        if (ext === ".ts" || ext === ".js") {
          const plugin = require(filePath);
          const pluginName = path.basename(file, ext);
          plugins[pluginName] = plugin.default || plugin;
          console.log(`Loaded plugin: ${pluginName}`);
        }
      }
    });

    console.log("All plugins loaded:", plugins);
  } catch (err) {
    console.error("Error loading plugins:", err);
  }
};

const pluginsFolder = path.join(__dirname, "../plugins");

export { loadPlugins, pluginsFolder, plugins };
