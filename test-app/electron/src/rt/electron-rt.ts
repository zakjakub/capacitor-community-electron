import { randomBytes } from 'crypto';
import { contextBridge, ipcRenderer } from 'electron';
import { EventEmitter } from 'events';

////////////////////////////////////////////////////////
import { Plugins } from './electron-plugins';

const randomId = (length = 5) => randomBytes(length).toString('hex');

const contextApi: {
  [plugin: string]: { [functionName: string]: () => Promise<any> };
} = {};

async function loadPlugins() {
  for (const pluginKey of Object.keys(Plugins)) {
    const plugin = await (Plugins as any)[pluginKey]();
    Object.keys(plugin)
      .filter((className) => className !== 'default')
      .forEach((classKey) => {
        const functionList = Object.getOwnPropertyNames(plugin[classKey].prototype).filter((v) => v !== 'constructor');

        if (!contextApi[classKey]) {
          contextApi[classKey] = {};
        }

        functionList.forEach((functionName) => {
          if (!contextApi[classKey][functionName]) {
            contextApi[classKey][functionName] = (...args) =>
              ipcRenderer.invoke(`${classKey}-${functionName}`, ...args);
          }
        });

        // Events
        if (plugin[classKey].prototype instanceof EventEmitter) {
          const listeners: { [key: string]: { type: string; listener: (...args: any[]) => void } } = {};
          const listenersOfTypeExist = (type: string) =>
            !!Object.values(listeners).find((listenerObj) => listenerObj.type === type);

          Object.assign(contextApi[classKey], {
            addListener(type: string, callback: (...args: any[]) => void) {
              const id = randomId();

              // Deduplicate events
              if (!listenersOfTypeExist(type)) {
                ipcRenderer.send(`event-add-${classKey}`, type);
              }

              const eventHandler = (_: any, ...args: any[]) => callback(...args);

              ipcRenderer.addListener(`event-${classKey}-${type}`, eventHandler);
              listeners[id] = { type, listener: eventHandler };

              return {
                remove: () => {
                  if (!listeners[id]) {
                    throw new Error('Invalid id');
                  }

                  const { type, listener } = listeners[id];

                  ipcRenderer.removeListener(`event-${classKey}-${type}`, listener);

                  delete listeners[id];

                  if (!listenersOfTypeExist(type)) {
                    ipcRenderer.send(`event-remove-${classKey}-${type}`);
                  }
                },
              };
            },
            removeListener(id: string) {
              if (!listeners[id]) {
                throw new Error('Invalid id');
              }

              const { type, listener } = listeners[id];

              ipcRenderer.removeListener(`event-${classKey}-${type}`, listener);

              delete listeners[id];

              if (!listenersOfTypeExist(type)) {
                ipcRenderer.send(`event-remove-${classKey}-${type}`);
              }
            },
            removeAllListeners(type: string) {
              Object.entries(listeners).forEach(([id, listenerObj]) => {
                if (!type || listenerObj.type === type) {
                  ipcRenderer.removeListener(`event-${classKey}-${listenerObj.type}`, listenerObj.listener);
                  ipcRenderer.send(`event-remove-${classKey}-${listenerObj.type}`);
                  delete listeners[id];
                }
              });
            },
          });
        }
      });
  }

  return contextApi;
}

(async () => {
  const plugins = await loadPlugins();
  contextBridge.exposeInMainWorld('CapacitorCustomPlatform', {
    name: 'electron',
    plugins,
  });
})();
////////////////////////////////////////////////////////
