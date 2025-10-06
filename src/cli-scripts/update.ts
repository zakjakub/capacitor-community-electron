import { existsSync, readFileSync, writeFileSync } from 'fs';
import { copySync } from 'fs-extra';
import { isAbsolute, join, relative, resolve } from 'path';

import type { Plugin, TaskInfoProvider } from './common';
import { getPlugins, readJSON, resolveElectronPlugin, runExec } from './common';

export async function doUpdate(taskInfoMessageProvider: TaskInfoProvider): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const usersProjectDir = process.env.CAPACITOR_ROOT_DIR!;

  const userProjectPackageJsonPath = join(usersProjectDir, 'package.json');

  const webAppPackageJson = await readJSON(userProjectPackageJsonPath);
  const dependencies = webAppPackageJson.dependencies ? webAppPackageJson.dependencies : {};
  const devDependencies = webAppPackageJson.devDependencies ? webAppPackageJson.devDependencies : {};
  const deps = {
    ...dependencies,
    ...devDependencies,
  };

  taskInfoMessageProvider('searching for plugins');

  //console.log(`\n\n${userProjectPackageJsonPath}\n\n`);

  // get all cap plugins installed
  const plugins = await getPlugins(userProjectPackageJsonPath);
  //console.log('\n\n');
  //console.log(plugins);
  //console.log('\n');

  // Get only the ones with electron "native" plugins
  const pluginMap: {
    name: string;
    path: string | null;
    installStr: string;
    id: string;
  }[] = plugins
    .filter((plugin: Plugin | null): plugin is Plugin => plugin !== null)
    .map((plugin: Plugin) => {
      const installStr: string = (() => {
        // ... (existing installStr logic remains the same) ...
        if (deps[plugin?.id]) {
          if (deps[plugin.id].startsWith('file:')) {
            const pkgPath = deps[plugin?.id].replace(/^file:/, '');
            const pkgAbsPath = isAbsolute(pkgPath) ? pkgPath : resolve(usersProjectDir, pkgPath);
            return relative(join(usersProjectDir, 'electron'), pkgAbsPath);
          } else if (deps[plugin.id].match(/^(https?|git):/)) {
            return deps[plugin.id];
          }
        }
        return `${plugin?.id}@${plugin?.version}`;
      })();

      // --- NEW LOGIC STARTS HERE ---
      let resolvedPath = resolveElectronPlugin(plugin);
      if (resolvedPath) {
        try {
          // Assumes plugin.path from getPlugins is the root directory of the plugin package
          const packageJsonPath = join(plugin.rootPath, 'package.json');
          if (existsSync(packageJsonPath)) {
            const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

            // Define the path to the CommonJS version of the plugin
            const cjsEntryPoint = join(plugin.rootPath, 'electron', 'dist', 'plugin.cjs.js');

            // If "type" is "module" and a .cjs.js file exists, use it instead.

            console.log(
              `\nINFO: Plugin: ${plugin.name}; Plugin type: ${pkg.type}; Plugin CJS entrypoint: ${cjsEntryPoint}`
            );

            if (pkg.type === 'module' && existsSync(cjsEntryPoint)) {
              console.log(`INFO: Plugin ${plugin.name} is an ES Module, using CJS entry point.`);
              resolvedPath = cjsEntryPoint;
            } else {
              console.log(`\nINFO: Plugin ${plugin.name} is NOT an ES Module, NOT using CJS entry point.`);
            }
          }
        } catch (err) {
          console.error(`WARN: Could not parse package.json for ${plugin.name}:`, err);
        }
      }
      // --- NEW LOGIC ENDS HERE ---

      const path = resolvedPath;
      const name = plugin?.name;
      const id = plugin?.id;
      return { name, path, installStr, id };
    })
    .filter((plugin) => plugin.path !== null);

  let npmIStr = '';

  //console.log('\n');
  //console.log(pluginMap);
  //console.log('\n');

  taskInfoMessageProvider('generating electron-plugins.ts');

  const capacitorElectronRuntimeFilePath = join(usersProjectDir, 'electron', 'src', 'rt');

  let outStr = `/* eslint-disable @typescript-eslint/no-var-requires */\n`;
  outStr += 'export const Plugins = {\n';
  for (const electronPlugin of pluginMap) {
    npmIStr += ` ${electronPlugin.installStr}`;
    const relativePluginPath = relative(capacitorElectronRuntimeFilePath, electronPlugin.path!);
    outStr += `  '${electronPlugin.name}': () => import('${relativePluginPath.replace(/\\/g, '/')}'),\n`;
  }
  outStr += '};\n';

  writeFileSync(join(capacitorElectronRuntimeFilePath, 'electron-plugins.ts'), outStr, { encoding: 'utf-8' });

  let usersProjectCapConfigFile: string | undefined = undefined;
  let configFileName: string | undefined = undefined;
  const configFileOptions = {
    ts: join(usersProjectDir, 'capacitor.config.ts'),
    js: join(usersProjectDir, 'capacitor.config.js'),
    json: join(usersProjectDir, 'capacitor.config.json'),
  };
  if (existsSync(configFileOptions.ts)) {
    usersProjectCapConfigFile = configFileOptions.ts;
    configFileName = 'capacitor.config.ts';
  } else if (existsSync(configFileOptions.js)) {
    usersProjectCapConfigFile = configFileOptions.js;
    configFileName = 'capacitor.config.js';
  } else {
    usersProjectCapConfigFile = configFileOptions.json;
    configFileName = 'capacitor.config.json';
  }
  copySync(usersProjectCapConfigFile, join(usersProjectDir, 'electron', configFileName), { overwrite: true });

  if (npmIStr.length > 0) {
    taskInfoMessageProvider('installing electron plugin files');
    console.log(`\n\nWill install:${npmIStr}\n\n`);
    await runExec(`cd ${join(usersProjectDir, 'electron')} && npm i${npmIStr}`);
  }
}
